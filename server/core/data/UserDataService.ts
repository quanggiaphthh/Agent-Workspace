import { Timestamp, type DocumentData, type Query, type QueryDocumentSnapshot, type DocumentSnapshot } from 'firebase-admin/firestore';
import { adminFirestore } from '../../lib/firebaseAdmin';

export type TaskStatus = 'todo' | 'in-progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
export type MemoryStatus = 'approved' | 'pending';

export interface TaskRecord {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  dueDate: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MemoryRecord {
  id: string;
  userId: string;
  content: string;
  category: string;
  status: MemoryStatus;
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
}

function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as any).toDate === 'function') {
    return (value as any).toDate().toISOString();
  }
  return null;
}

function normalizeTask(doc: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>): TaskRecord {
  const data = doc.data() || {};
  return {
    id: doc.id,
    userId: String(data.userId || ''),
    title: String(data.title || ''),
    description: String(data.description || ''),
    status: (data.status || 'todo') as TaskStatus,
    priority: (data.priority || 'medium') as TaskPriority,
    category: String(data.category || 'Công việc'),
    dueDate: String(data.dueDate || ''),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function normalizeMemory(doc: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>): MemoryRecord {
  const data = doc.data() || {};
  return {
    id: doc.id,
    userId: String(data.userId || ''),
    content: String(data.content || ''),
    category: String(data.category || 'General'),
    status: data.status === 'pending' ? 'pending' : 'approved',
    source: String(data.source || 'Không xác định'),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

async function getOwnedDoc(collectionName: string, id: string, userId: string) {
  const ref = adminFirestore.collection(collectionName).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  if (snap.get('userId') !== userId) {
    const err = new Error('Forbidden') as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return { ref, snap };
}

export class UserDataService {
  public static async listTasks(userId: string, status: TaskStatus | 'all' = 'all'): Promise<TaskRecord[]> {
    let q: Query = adminFirestore.collection('agent_tasks').where('userId', '==', userId);
    if (status !== 'all') q = q.where('status', '==', status);
    const snapshot = await q.get();
    return snapshot.docs
      .map(normalizeTask)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  public static async createTask(userId: string, input: {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    category?: string;
    dueDate?: string;
  }): Promise<TaskRecord> {
    const now = Timestamp.now();
    const ref = await adminFirestore.collection('agent_tasks').add({
      userId,
      title: input.title.trim(),
      description: input.description?.trim() || '',
      status: input.status || 'todo',
      priority: input.priority || 'medium',
      category: input.category || 'Công việc',
      dueDate: input.dueDate || '',
      createdAt: now,
      updatedAt: now,
    });
    return normalizeTask(await ref.get());
  }

  public static async updateTask(userId: string, id: string, patch: Partial<Pick<TaskRecord, 'title' | 'description' | 'status' | 'priority' | 'category' | 'dueDate'>>): Promise<TaskRecord> {
    const { ref } = await getOwnedDoc('agent_tasks', id, userId);
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    await ref.update({ ...cleanPatch, updatedAt: Timestamp.now() });
    return normalizeTask(await ref.get());
  }

  public static async deleteTask(userId: string, id: string): Promise<void> {
    const { ref } = await getOwnedDoc('agent_tasks', id, userId);
    await ref.delete();
  }

  public static async taskStats(userId: string) {
    const tasks = await this.listTasks(userId, 'all');
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    return {
      total,
      inProgress,
      completed,
      completedPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  public static async listMemories(userId: string, options: {
    status?: MemoryStatus | 'all';
    category?: string;
    query?: string;
    limit?: number;
  } = {}): Promise<MemoryRecord[]> {
    const status = options.status || 'all';
    let q: Query = adminFirestore.collection('agent_memories').where('userId', '==', userId);
    if (status !== 'all') q = q.where('status', '==', status);
    if (options.category) q = q.where('category', '==', options.category);
    const snapshot = await q.get();
    const keyword = options.query?.trim().toLocaleLowerCase('vi');
    const filtered = snapshot.docs
      .map(normalizeMemory)
      .filter((memory) => !keyword || `${memory.content} ${memory.category} ${memory.source}`.toLocaleLowerCase('vi').includes(keyword))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return filtered.slice(0, Math.max(1, Math.min(options.limit || 50, 100)));
  }

  public static async addMemory(userId: string, input: {
    content: string;
    category?: string;
    status?: MemoryStatus;
    source?: string;
  }): Promise<MemoryRecord> {
    const now = Timestamp.now();
    const ref = await adminFirestore.collection('agent_memories').add({
      userId,
      content: input.content.trim(),
      category: input.category || 'General',
      status: input.status || 'pending',
      source: input.source || 'Agent đề xuất',
      createdAt: now,
      updatedAt: now,
    });
    return normalizeMemory(await ref.get());
  }

  public static async updateMemory(userId: string, id: string, patch: Partial<Pick<MemoryRecord, 'content' | 'category' | 'status' | 'source'>>): Promise<MemoryRecord> {
    const { ref } = await getOwnedDoc('agent_memories', id, userId);
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    await ref.update({ ...cleanPatch, updatedAt: Timestamp.now() });
    return normalizeMemory(await ref.get());
  }

  public static async deleteMemory(userId: string, id: string): Promise<void> {
    const { ref } = await getOwnedDoc('agent_memories', id, userId);
    await ref.delete();
  }

  public static async deleteAllUserData(userId: string): Promise<void> {
    const collections = ['agent_tasks', 'agent_memories'];
    for (const collectionName of collections) {
      const snapshot = await adminFirestore.collection(collectionName).where('userId', '==', userId).get();
      if (snapshot.empty) continue;
      const batch = adminFirestore.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
}
