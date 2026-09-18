import {
  BaseSessionService,
  CreateSessionRequest,
  GetSessionRequest,
  ListSessionsRequest,
  ListSessionsResponse,
  DeleteSessionRequest,
  AppendEventRequest,
  type Session,
  type Event,
} from '@google/adk';
import { adminFirestore } from '../../lib/firebaseAdmin';
import { redactAuditString } from '../../core/audit/auditRedaction';
import { sanitizeForFirestore } from './firestoreSerialization';
import { SessionBackendPinning, type SessionBackendIdentity } from './sessionBackendPinning';

export interface SessionSummary {
  sessionId: string;
  title: string;
  lastUpdateTime: number;
  eventCount: number;
}

interface StoredSessionMetadata {
  id: string;
  appName: string;
  userId: string;
  state: Record<string, unknown>;
  lastUpdateTime: number;
  eventCount: number;
  title?: string;
}


function isPermissionError(error: any): boolean {
  return error?.message?.includes('PERMISSION_DENIED')
    || error?.code === 7
    || error?.code === 'permission-denied';
}

function persistentStateDelta(event: Event): Record<string, unknown> {
  const raw = ((event as any).actions?.stateDelta || {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(raw).filter(([key]) => !key.startsWith('temp:')),
  );
}


function extractEventText(event: Event): string {
  const content = (event as any).content;
  if (!content) return '';
  if (typeof content === 'string') return content.trim();
  const parts = Array.isArray(content.parts) ? content.parts : [];
  return parts
    .map((part: any) => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function userEventTitle(event: Event): string | undefined {
  const content = (event as any).content;
  const isUser = (event as any).author === 'user' || content?.role === 'user';
  if (!isUser) return undefined;
  const text = extractEventText(event).replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function toSession(metadata: StoredSessionMetadata, events: Event[] = []): Session {
  return {
    id: metadata.id,
    appName: metadata.appName,
    userId: metadata.userId,
    state: metadata.state || {},
    events,
    lastUpdateTime: metadata.lastUpdateTime,
  } as Session;
}

// Development-only fallback. It deliberately remains process-local and therefore
// must never be confused with durable persistence.
class LocalInMemorySessionService extends BaseSessionService {
  private sessions = new Map<string, Session>();

  private key(appName: string, userId: string, sessionId: string) {
    return `${appName}:${userId}:${sessionId}`;
  }

  public async createSession(req: CreateSessionRequest): Promise<Session> {
    const sessionId = req.sessionId || `mem_${Date.now()}`;
    const session: Session = {
      id: sessionId,
      appName: req.appName,
      userId: req.userId,
      state: req.state || {},
      events: [],
      lastUpdateTime: Date.now(),
    } as Session;
    this.sessions.set(this.key(req.appName, req.userId, sessionId), session);
    return session;
  }

  public async getSession(req: GetSessionRequest): Promise<Session | undefined> {
    const session = this.sessions.get(this.key(req.appName, req.userId, req.sessionId));
    if (!session) return undefined;
    const events = [...session.events];
    const afterTimestamp = req.config?.afterTimestamp;
    const numRecentEvents = req.config?.numRecentEvents;
    const filtered = afterTimestamp ? events.filter((event) => event.timestamp > afterTimestamp) : events;
    return {
      ...session,
      state: { ...session.state },
      events: numRecentEvents ? filtered.slice(-numRecentEvents) : filtered,
    } as Session;
  }

  public async listSessions(req: ListSessionsRequest): Promise<ListSessionsResponse> {
    const all = Array.from(this.sessions.values())
      .filter((session) => session.appName === req.appName && (!req.userId || session.userId === req.userId))
      .sort((a, b) => b.lastUpdateTime - a.lastUpdateTime);
    const limit = req.limit || 50;
    const start = req.page ? (req.page - 1) * limit : (req.offset || 0);
    const sessions = all.slice(start, start + limit).map((session) => ({
      ...session,
      state: {},
      events: [],
    } as Session));
    return {
      sessions,
      page: req.page || Math.floor((req.offset || 0) / limit) + 1,
      limit,
      totalItems: all.length,
      totalPages: Math.max(1, Math.ceil(all.length / limit)),
    };
  }

  public async deleteSession(req: DeleteSessionRequest): Promise<void> {
    this.sessions.delete(this.key(req.appName, req.userId, req.sessionId));
  }

  public async appendEvent(req: AppendEventRequest): Promise<Event> {
    if ((req.event as any).partial) return req.event;
    const key = this.key(req.session.appName, req.session.userId, req.session.id);
    const session = this.sessions.get(key);
    if (!session) throw new Error('Session not found');
    const delta = persistentStateDelta(req.event);
    const now = Date.now();
    session.events.push(req.event);
    Object.assign(session.state, delta);
    session.lastUpdateTime = now;
    // getSession() returns a copy. Keep the Runner-held session in sync exactly once.
    if (session !== req.session) {
      req.session.events.push(req.event);
      Object.assign(req.session.state, delta);
      req.session.lastUpdateTime = now;
    }
    return req.event;
  }
}

export class FirestoreSessionService extends BaseSessionService {
  private inMemoryFallback: LocalInMemorySessionService | null = null;
  private useFallback = false;
  private lastError: string | undefined;
  private readonly fallbackSessionPins = new SessionBackendPinning();

  constructor() {
    super();
    if (process.env.NODE_ENV !== 'production') {
      this.inMemoryFallback = new LocalInMemorySessionService();
    }
  }

  private async getPinnedMemorySessions(appName: string, userId?: string): Promise<Session[]> {
    if (!this.inMemoryFallback) return [];
    const identities = this.fallbackSessionPins.listPinned(appName, userId);
    const sessions = await Promise.all(identities.map((identity) => this.inMemoryFallback!.getSession({
      appName: identity.appName,
      userId: identity.userId,
      sessionId: identity.sessionId,
    })));
    return sessions.filter((session): session is Session => Boolean(session));
  }

  public getPersistenceHealth() {
    if (this.useFallback) {
      return {
        status: 'degraded' as const,
        mode: 'in-memory-fallback' as const,
        backend: 'process-memory' as const,
        degraded: true,
        lastError: this.lastError,
      };
    }
    if (this.lastError) {
      return {
        status: 'error' as const,
        mode: 'unavailable' as const,
        backend: 'firestore' as const,
        degraded: false,
        lastError: this.lastError,
      };
    }
    return {
      status: 'ok' as const,
      mode: 'persistent' as const,
      backend: 'firestore' as const,
      degraded: false,
    };
  }

  public async probePersistenceHealth() {
    const current = this.getPersistenceHealth();
    try {
      await adminFirestore.collection('_runtime_health').doc('session-readiness').get();
      // Readiness is observational: a health request never changes execution mode.
      return current;
    } catch (error: any) {
      const lastError = redactAuditString(error?.message || 'Session persistence probe failed.');
      if (current.mode === 'in-memory-fallback') {
        return { ...current, lastError };
      }
      return {
        status: 'error' as const,
        mode: 'unavailable' as const,
        backend: 'firestore' as const,
        degraded: false,
        lastError,
      };
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

  private getEventsRef(appName: string, userId: string, sessionId: string) {
    return this.getDocRef(appName, userId, sessionId).collection('events');
  }

  private async executeWithFallback<T>(
    op: () => Promise<T>,
    fallbackOp: () => Promise<T>,
    sessionIdentity?: SessionBackendIdentity,
    pinOnFallback = false,
  ): Promise<T> {
    if (sessionIdentity && this.fallbackSessionPins.isPinned(sessionIdentity)) {
      this.useFallback = true;
      return fallbackOp();
    }

    try {
      const result = await op();
      if (!this.fallbackSessionPins.hasPinnedSessions()) {
        this.lastError = undefined;
        this.useFallback = false;
      } else {
        this.useFallback = true;
      }
      return result;
    } catch (err: any) {
      this.lastError = redactAuditString(err?.message || 'Session persistence operation failed.');
      if (isPermissionError(err) && this.inMemoryFallback) {
        console.warn(`>>> [SESSION FALLBACK]: ${this.lastError}. Session persistence is DEGRADED to process memory.`);
        this.useFallback = true;
        const result = await fallbackOp();
        if (sessionIdentity && pinOnFallback) {
          this.fallbackSessionPins.pin(sessionIdentity);
        }
        return result;
      }
      throw err;
    }
  }

  public async getOrCreateSession(req: CreateSessionRequest): Promise<Session> {
    if (req.sessionId) {
      const existing = await this.getSession({
        appName: req.appName,
        userId: req.userId,
        sessionId: req.sessionId,
      });
      if (existing) return existing;
    }
    return this.createSession(req);
  }

  public async createSession(req: CreateSessionRequest): Promise<Session> {
    const sessionId = req.sessionId || `session_${Date.now()}`;
    const normalizedReq = { ...req, sessionId };
    const sessionIdentity: SessionBackendIdentity = {
      appName: req.appName,
      userId: req.userId,
      sessionId,
    };
    return this.executeWithFallback(
      async () => {
        const docRef = this.getDocRef(req.appName, req.userId, sessionId);
        const now = Date.now();
        const metadata: StoredSessionMetadata = {
          id: sessionId,
          appName: req.appName,
          userId: req.userId,
          state: req.state || {},
          lastUpdateTime: now,
          eventCount: 0,
        };
        await docRef.set(metadata);
        return toSession(metadata);
      },
      () => this.inMemoryFallback!.createSession(normalizedReq),
      sessionIdentity,
      true,
    );
  }

  public async getSession(req: GetSessionRequest): Promise<Session | undefined> {
    const sessionIdentity: SessionBackendIdentity = {
      appName: req.appName,
      userId: req.userId,
      sessionId: req.sessionId,
    };
    return this.executeWithFallback(
      async () => {
        const docRef = this.getDocRef(req.appName, req.userId, req.sessionId);
        const doc = await docRef.get();
        if (!doc.exists) return undefined;
        const metadata = doc.data() as StoredSessionMetadata;
        const eventSnapshot = await this.getEventsRef(req.appName, req.userId, req.sessionId)
          .orderBy('sequence', 'asc')
          .get();
        let events = eventSnapshot.docs.map((eventDoc) => eventDoc.get('event') as Event);
        if (req.config?.afterTimestamp) {
          events = events.filter((event) => event.timestamp > req.config!.afterTimestamp!);
        }
        if (req.config?.numRecentEvents) {
          events = events.slice(-req.config.numRecentEvents);
        }
        return toSession(metadata, events);
      },
      () => this.inMemoryFallback!.getSession(req),
      sessionIdentity,
    );
  }

  public async listSessions(req: ListSessionsRequest): Promise<ListSessionsResponse> {
    return this.executeWithFallback(
      async () => {
        let query: any;
        if (req.userId) {
          query = adminFirestore
            .collection('apps')
            .doc(req.appName)
            .collection('users')
            .doc(req.userId)
            .collection('sessions');
        } else {
          query = adminFirestore.collectionGroup('sessions').where('appName', '==', req.appName);
        }
        query = query.orderBy('lastUpdateTime', req.order || 'desc');
        const snapshot = await query.get();
        const persistentSessions = snapshot.docs
          .map((doc: any) => toSession(doc.data() as StoredSessionMetadata));
        const pinnedSessions = await this.getPinnedMemorySessions(req.appName, req.userId);
        const mergedByIdentity = new Map<string, Session>();
        for (const item of persistentSessions) {
          mergedByIdentity.set(`${item.appName}:${item.userId}:${item.id}`, item);
        }
        // A pinned in-memory session is authoritative for its active conversation.
        for (const item of pinnedSessions) {
          mergedByIdentity.set(`${item.appName}:${item.userId}:${item.id}`, item);
        }
        const direction = req.order || 'desc';
        const merged = Array.from(mergedByIdentity.values())
          .sort((a, b) => direction === 'asc'
            ? a.lastUpdateTime - b.lastUpdateTime
            : b.lastUpdateTime - a.lastUpdateTime);
        const totalItems = merged.length;
        const limit = req.limit || 50;
        const start = req.page ? (req.page - 1) * limit : (req.offset || 0);
        return {
          sessions: merged.slice(start, start + limit).map((item) => ({
            ...item,
            state: {},
            events: [],
          } as Session)),
          page: req.page || Math.floor((req.offset || 0) / limit) + 1,
          limit,
          totalItems,
          totalPages: Math.max(1, Math.ceil(totalItems / limit)),
        };
      },
      () => this.inMemoryFallback!.listSessions(req),
    );
  }

  public async listSessionSummaries(appName: string, userId: string, limit = 50): Promise<SessionSummary[]> {
    return this.executeWithFallback(
      async () => {
        const snapshot = await adminFirestore
          .collection('apps')
          .doc(appName)
          .collection('users')
          .doc(userId)
          .collection('sessions')
          .orderBy('lastUpdateTime', 'desc')
          .get();
        const merged = new Map<string, SessionSummary>();
        for (const doc of snapshot.docs) {
          const data = doc.data() as StoredSessionMetadata;
          merged.set(data.id, {
            sessionId: data.id,
            title: data.title || 'Cuộc hội thoại',
            lastUpdateTime: data.lastUpdateTime || 0,
            eventCount: data.eventCount || 0,
          });
        }
        for (const item of await this.getPinnedMemorySessions(appName, userId)) {
          const firstUser = item.events.find((event) => userEventTitle(event));
          merged.set(item.id, {
            sessionId: item.id,
            title: firstUser ? userEventTitle(firstUser)! : 'Cuộc hội thoại (tạm lưu bộ nhớ)',
            lastUpdateTime: item.lastUpdateTime,
            eventCount: item.events.length,
          });
        }
        return Array.from(merged.values())
          .sort((a, b) => b.lastUpdateTime - a.lastUpdateTime)
          .slice(0, Math.max(1, Math.min(limit, 100)));
      },
      async () => {
        const listed = await this.inMemoryFallback!.listSessions({ appName, userId, limit });
        const summaries: SessionSummary[] = [];
        for (const item of listed.sessions) {
          const full = await this.inMemoryFallback!.getSession({ appName, userId, sessionId: item.id });
          const firstUser = full?.events.find((event) => userEventTitle(event));
          summaries.push({
            sessionId: item.id,
            title: firstUser ? userEventTitle(firstUser)! : 'Cuộc hội thoại (tạm lưu bộ nhớ)',
            lastUpdateTime: item.lastUpdateTime,
            eventCount: full?.events.length || 0,
          });
        }
        return summaries;
      },
    );
  }

  private async deleteEvents(appName: string, userId: string, sessionId: string): Promise<void> {
    const eventsRef = this.getEventsRef(appName, userId, sessionId);
    while (true) {
      const snapshot = await eventsRef.limit(400).get();
      if (snapshot.empty) return;
      const batch = adminFirestore.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  public async deleteSession(req: DeleteSessionRequest): Promise<void> {
    const sessionIdentity: SessionBackendIdentity = {
      appName: req.appName,
      userId: req.userId,
      sessionId: req.sessionId,
    };
    await this.executeWithFallback(
      async () => {
        await this.deleteEvents(req.appName, req.userId, req.sessionId);
        await this.getDocRef(req.appName, req.userId, req.sessionId).delete();
      },
      () => this.inMemoryFallback!.deleteSession(req),
      sessionIdentity,
    );
    this.fallbackSessionPins.unpin(sessionIdentity);
    this.useFallback = this.fallbackSessionPins.hasPinnedSessions();
    if (!this.useFallback) this.lastError = undefined;
  }

  public async appendEvent(req: AppendEventRequest): Promise<Event> {
    if ((req.event as any).partial) return req.event;

    const delta = persistentStateDelta(req.event);
    const now = Date.now();
    const sessionIdentity: SessionBackendIdentity = {
      appName: req.session.appName,
      userId: req.session.userId,
      sessionId: req.session.id,
    };
    const result = await this.executeWithFallback(
      async () => {
        const docRef = this.getDocRef(req.session.appName, req.session.userId, req.session.id);
        const eventRef = this.getEventsRef(req.session.appName, req.session.userId, req.session.id).doc();
        await adminFirestore.runTransaction(async (transaction) => {
          const doc = await transaction.get(docRef);
          if (!doc.exists) throw new Error('Session not found');
          const current = doc.data() as StoredSessionMetadata;
          const sequence = (current.eventCount || 0) + 1;
          const newState = { ...(current.state || {}), ...delta };
          const title = current.title || userEventTitle(req.event);
          transaction.set(eventRef, {
            sequence,
            timestamp: req.event.timestamp || now,
            event: sanitizeForFirestore(req.event),
          });
          transaction.update(docRef, {
            state: newState,
            eventCount: sequence,
            lastUpdateTime: now,
            ...(title ? { title } : {}),
          });
        });
        return req.event;
      },
      () => this.inMemoryFallback!.appendEvent(req),
      sessionIdentity,
    );

    if (!this.fallbackSessionPins.isPinned(sessionIdentity)) {
      req.session.events.push(req.event);
      Object.assign(req.session.state, delta);
      req.session.lastUpdateTime = now;
    }
    return result;
  }
}
