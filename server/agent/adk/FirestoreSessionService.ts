import { 
  BaseSessionService, 
  CreateSessionRequest, 
  GetSessionRequest, 
  ListSessionsRequest, 
  ListSessionsResponse,
  DeleteSessionRequest,
  AppendEventRequest
} from '@google/adk';
import { Session } from '@google/adk';
import { Event } from '@google/adk';
import { adminFirestore } from '../../lib/firebaseAdmin';

// Phase 5: InMemory Fallback for Development
class InMemorySessionService extends BaseSessionService {
  private sessions = new Map<string, Session>();

  public async createSession(req: CreateSessionRequest): Promise<Session> {
    const sessionId = req.sessionId || `mem_${Date.now()}`;
    const session: Session = {
      id: sessionId,
      appName: req.appName,
      userId: req.userId,
      state: req.state || {},
      events: [],
      lastUpdateTime: Date.now()
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  public async getSession(req: GetSessionRequest): Promise<Session | undefined> {
    return this.sessions.get(req.sessionId);
  }

  public async listSessions(req: ListSessionsRequest): Promise<ListSessionsResponse> {
    const all = Array.from(this.sessions.values()).filter(s => s.appName === req.appName && (req.userId ? s.userId === req.userId : true));
    return {
      sessions: all,
      page: 1,
      limit: req.limit || 50,
      totalItems: all.length,
      totalPages: 1
    };
  }

  public async deleteSession(req: DeleteSessionRequest): Promise<void> {
    this.sessions.delete(req.sessionId);
  }

  public async appendEvent(req: AppendEventRequest): Promise<Event> {
    const session = this.sessions.get(req.session.id);
    if (session) {
      session.events.push(req.event);
      session.lastUpdateTime = Date.now();
    }
    return req.event;
  }
}

export class FirestoreSessionService extends BaseSessionService {
  private inMemoryFallback: InMemorySessionService | null = null;
  private useFallback = false;

  constructor() {
    super();
    // In Google AI Studio / Development, we might want to fallback if Firestore is not yet configured
    if (process.env.NODE_ENV !== 'production') {
       this.inMemoryFallback = new InMemorySessionService();
    }
  }

  private getDocRef(appName: string, userId: string, sessionId: string) {
    return adminFirestore
      .collection('apps')
      .doc(appName)
      .collection('users')
      .doc(userId)
      .collection('sessions')
      .doc(sessionId);
  }

  private async executeWithFallback<T>(op: () => Promise<T>, fallbackOp: () => Promise<T>): Promise<T> {
    if (this.useFallback && this.inMemoryFallback) {
      return fallbackOp();
    }
    try {
      return await op();
    } catch (err: any) {
      const isPermissionError = err.message?.includes('PERMISSION_DENIED') || err.code === 7;
      if (isPermissionError && this.inMemoryFallback) {
        console.warn('>>> [SESSION FALLBACK]: Firestore permission denied. Falling back to InMemorySessionService for this session.');
        this.useFallback = true;
        return fallbackOp();
      }
      throw err;
    }
  }

  public async createSession(req: CreateSessionRequest): Promise<Session> {
    return this.executeWithFallback(
      async () => {
        const sessionId = req.sessionId || `session_${Date.now()}`;
        const docRef = this.getDocRef(req.appName, req.userId, sessionId);
        const session: Session = {
          id: sessionId,
          appName: req.appName,
          userId: req.userId,
          state: req.state || {},
          events: [],
          lastUpdateTime: Date.now()
        };
        await docRef.set(session);
        return session;
      },
      () => this.inMemoryFallback!.createSession(req)
    );
  }

  public async getSession(req: GetSessionRequest): Promise<Session | undefined> {
    return this.executeWithFallback(
      async () => {
        const docRef = this.getDocRef(req.appName, req.userId, req.sessionId);
        const doc = await docRef.get();
        if (!doc.exists) return undefined;
        const data = doc.data() as Session;
        if (req.config?.afterTimestamp) {
          data.events = data.events.filter(e => e.timestamp > req.config!.afterTimestamp!);
        }
        if (req.config?.numRecentEvents) {
          data.events = data.events.slice(-req.config!.numRecentEvents);
        }
        return data;
      },
      () => this.inMemoryFallback!.getSession(req)
    );
  }

  public async listSessions(req: ListSessionsRequest): Promise<ListSessionsResponse> {
    return this.executeWithFallback(
      async () => {
        let query: any = adminFirestore.collection('apps').doc(req.appName).collection('users');
        if (req.userId) {
          query = query.doc(req.userId).collection('sessions');
        } else {
          query = adminFirestore.collectionGroup('sessions').where('appName', '==', req.appName);
        }
        query = query.orderBy('lastUpdateTime', req.order || 'desc');
        const snapshot = await query.get();
        const totalItems = snapshot.size;
        const start = req.page ? (req.page - 1) * (req.limit || 50) : (req.offset || 0);
        const sessions = snapshot.docs
          .slice(start, start + (req.limit || 50))
          .map((d: any) => {
            const data = d.data() as Session;
            return { ...data, events: [], state: {} } as Session;
          });
        return {
          sessions,
          page: req.page || Math.floor((req.offset || 0) / (req.limit || 50)) + 1,
          limit: req.limit || 50,
          totalItems,
          totalPages: Math.ceil(totalItems / (req.limit || 50))
        };
      },
      () => this.inMemoryFallback!.listSessions(req)
    );
  }

  public async deleteSession(req: DeleteSessionRequest): Promise<void> {
    return this.executeWithFallback(
      async () => {
        const docRef = this.getDocRef(req.appName, req.userId, req.sessionId);
        await docRef.delete();
      },
      () => this.inMemoryFallback!.deleteSession(req)
    );
  }

  public async appendEvent(req: AppendEventRequest): Promise<Event> {
    return this.executeWithFallback(
      async () => {
        const docRef = this.getDocRef(req.session.appName, req.session.userId, req.session.id);
        await adminFirestore.runTransaction(async (transaction) => {
          const doc = await transaction.get(docRef);
          if (!doc.exists) throw new Error('Session not found');
          const currentSession = doc.data() as Session;
          const updatedEvents = [...currentSession.events, req.event];
          const newState = { ...currentSession.state };
          if ((req.event as any).stateDelta) {
             Object.assign(newState, (req.event as any).stateDelta);
          }
          transaction.update(docRef, {
            events: updatedEvents,
            state: newState,
            lastUpdateTime: Date.now()
          });
        });
        return req.event;
      },
      () => this.inMemoryFallback!.appendEvent(req)
    );
  }
}
