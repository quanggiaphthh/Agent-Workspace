import { FieldPath, Timestamp, type DocumentData, type Query, type QueryDocumentSnapshot, type DocumentSnapshot } from 'firebase-admin/firestore';
import { adminFirestore } from '../../lib/firebaseAdmin';
import { storage } from '../../infrastructure/storage';

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
  dueTime?: string;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt?: string | null;
}

export interface TaskListPage {
  tasks: TaskRecord[];
  nextCursor?: string;
}

export interface TaskTitleResolution {
  match: 'none' | 'unique' | 'ambiguous';
  tasks: TaskRecord[];
  truncated: boolean;
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

const DEFAULT_TASK_PAGE_SIZE = 100;
const MAX_TASK_PAGE_SIZE = 100;
const MAX_TASK_TITLE_MATCHES = 20;
const DEFAULT_MEMORY_RESULT_LIMIT = 50;
const MAX_MEMORY_RESULT_LIMIT = 100;
const MEMORY_SEARCH_CANDIDATE_LIMIT = 500;
const USER_DATA_DELETE_CHUNK_SIZE = 400;

function dataError(status: number, message: string): Error & { status?: number } {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

export function isValidTaskDueDate(value: string): boolean {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function isValidTaskDueTime(value: string): boolean {
  return value === '' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function assertTaskDueDate(value: unknown): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || !isValidTaskDueDate(value)) {
    throw dataError(400, 'Invalid dueDate. Use YYYY-MM-DD or an empty string.');
  }
}

function assertTaskDueTime(value: unknown): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || !isValidTaskDueTime(value)) {
    throw dataError(400, 'Invalid dueTime. Use HH:mm or an empty string.');
  }
}

async function assertTasksModuleEnabled(): Promise<void> {
  try {
    await storage.refreshModuleSettings();
  } catch {
    throw dataError(503, 'Task module availability could not be verified.');
  }
  const taskModule = storage.getData().moduleSettings.tasks;
  if (!taskModule) throw dataError(503, 'Task module availability could not be verified.');
  if (taskModule.canDisable && !storage.isPersistenceAvailable()) {
    throw dataError(503, 'Task module availability could not be verified.');
  }
  if (!taskModule.enabled) throw dataError(409, 'Module Công việc đang tắt.');
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

export function normalizeTaskData(id: string, data: DocumentData = {}): TaskRecord {
  const dueTime = typeof data.dueTime === 'string' && isValidTaskDueTime(data.dueTime) && data.dueTime
    ? data.dueTime
    : undefined;
  return {
    id,
    userId: String(data.userId || ''),
    title: String(data.title || ''),
    description: String(data.description || ''),
    status: (data.status || 'todo') as TaskStatus,
    priority: (data.priority || 'medium') as TaskPriority,
    category: String(data.category || 'Công việc'),
    dueDate: String(data.dueDate || ''),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    ...(dueTime ? { dueTime } : {}),
    completedAt: toIso(data.completedAt),
  };
}

function normalizeTask(doc: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>): TaskRecord {
  return normalizeTaskData(doc.id, doc.data() || {});
}

export function buildTaskStatusPatch<T extends { status?: TaskStatus }>(
  patch: T,
  completedAt: Timestamp = Timestamp.now(),
  currentStatus?: TaskStatus,
): T & { completedAt?: Timestamp | null } {
  if (patch.status === 'completed' && currentStatus !== 'completed') return { ...patch, completedAt };
  if (patch.status !== undefined && patch.status !== 'completed' && currentStatus === 'completed') return { ...patch, completedAt: null };
  return patch;
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

function clampTaskPageSize(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_TASK_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_TASK_PAGE_SIZE, Math.floor(value as number)));
}

function clampMemoryResultLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MEMORY_RESULT_LIMIT;
  return Math.max(1, Math.min(MAX_MEMORY_RESULT_LIMIT, Math.floor(value as number)));
}

function encodeTaskCursor(createdAtMs: number, id: string): string {
  return Buffer.from(JSON.stringify({ createdAtMs, id }), 'utf8').toString('base64url');
}

function decodeTaskCursor(cursor: string | undefined): { createdAtMs: number; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Number.isFinite(parsed?.createdAtMs) || typeof parsed?.id !== 'string' || !parsed.id) return undefined;
    return { createdAtMs: Number(parsed.createdAtMs), id: parsed.id };
  } catch {
    return undefined;
  }
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
  public static async listTasksPage(userId: string, options: {
    status?: TaskStatus | 'all';
    limit?: number;
    cursor?: string;
  } = {}): Promise<TaskListPage> {
    await assertTasksModuleEnabled();
    const status = options.status || 'all';
    const limit = clampTaskPageSize(options.limit);
    const cursor = decodeTaskCursor(options.cursor);
    if (options.cursor && !cursor) throw dataError(400, 'Invalid task cursor.');

    let q: Query = adminFirestore.collection('agent_tasks').where('userId', '==', userId);
    if (status !== 'all') q = q.where('status', '==', status);
    q = q.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (cursor) q = q.startAfter(Timestamp.fromMillis(cursor.createdAtMs), cursor.id);
    q = q.limit(limit + 1);

    const snapshot = await q.get();
    const pageDocs = snapshot.docs.slice(0, limit);
    const tasks = pageDocs.map(normalizeTask);
    const hasMore = snapshot.docs.length > limit;
    const last = pageDocs[pageDocs.length - 1];
    const lastCreatedAt = last?.get('createdAt');
    const nextCursor = hasMore && last && lastCreatedAt instanceof Timestamp
      ? encodeTaskCursor(lastCreatedAt.toMillis(), last.id)
      : undefined;

    return { tasks, ...(nextCursor ? { nextCursor } : {}) };
  }

  /**
   * Compatibility path for the current Tasks UI/REST surface, which expects a
   * complete list. Each Firestore read is still database-bounded; Agent tools
   * use listTasksPage directly so they never mistake one page for all data.
   */
  public static async listTasks(userId: string, status: TaskStatus | 'all' = 'all'): Promise<TaskRecord[]> {
    const tasks: TaskRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.listTasksPage(userId, { status, limit: DEFAULT_TASK_PAGE_SIZE, ...(cursor ? { cursor } : {}) });
      tasks.push(...page.tasks);
      cursor = page.nextCursor;
    } while (cursor);
    return tasks;
  }

  public static async resolveTasksByExactTitle(userId: string, title: string): Promise<TaskTitleResolution> {
    await assertTasksModuleEnabled();
    const exactTitle = title.trim();
    if (!exactTitle) throw dataError(400, 'Task title is required.');

    const snapshot = await adminFirestore
      .collection('agent_tasks')
      .where('userId', '==', userId)
      .where('title', '==', exactTitle)
      .limit(MAX_TASK_TITLE_MATCHES + 1)
      .get();

    const truncated = snapshot.docs.length > MAX_TASK_TITLE_MATCHES;
    const tasks = snapshot.docs
      .slice(0, MAX_TASK_TITLE_MATCHES)
      .map(normalizeTask)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return {
      match: tasks.length === 0 ? 'none' : tasks.length === 1 && !truncated ? 'unique' : 'ambiguous',
      tasks,
      truncated,
    };
  }

  public static async createTask(userId: string, input: {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    category?: string;
    dueDate?: string;
    dueTime?: string;
  }): Promise<TaskRecord> {
    await assertTasksModuleEnabled();
    assertTaskDueDate(input.dueDate);
    assertTaskDueTime(input.dueTime);
    const now = Timestamp.now();
    const status = input.status || 'todo';
    const ref = await adminFirestore.collection('agent_tasks').add({
      userId,
      title: input.title.trim(),
      description: input.description?.trim() || '',
      status,
      priority: input.priority || 'medium',
      category: input.category || 'Công việc',
      dueDate: input.dueDate || '',
      dueTime: input.dueTime || '',
      createdAt: now,
      updatedAt: now,
      ...(status === 'completed' ? { completedAt: now } : {}),
    });
    return normalizeTask(await ref.get());
  }

  public static async updateTask(userId: string, id: string, patch: Partial<Pick<TaskRecord, 'title' | 'description' | 'status' | 'priority' | 'category' | 'dueDate' | 'dueTime'>>): Promise<TaskRecord> {
    await assertTasksModuleEnabled();
    assertTaskDueDate(patch.dueDate);
    assertTaskDueTime(patch.dueTime);
    const { ref, snap } = await getOwnedDoc('agent_tasks', id, userId);
    const now = Timestamp.now();
    const cleanPatch = Object.fromEntries(
      Object.entries(buildTaskStatusPatch(patch, now, snap.get('status') as TaskStatus | undefined)).filter(([, value]) => value !== undefined)
    );
    await ref.update({ ...cleanPatch, updatedAt: now });
    return normalizeTask(await ref.get());
  }

  public static async deleteTask(userId: string, id: string): Promise<void> {
    await assertTasksModuleEnabled();
    const { ref } = await getOwnedDoc('agent_tasks', id, userId);
    await ref.delete();
  }

  public static async taskStats(userId: string) {
    await assertTasksModuleEnabled();
    const base = adminFirestore.collection('agent_tasks').where('userId', '==', userId);
    const [totalSnapshot, inProgressSnapshot, completedSnapshot] = await Promise.all([
      base.count().get(),
      base.where('status', '==', 'in-progress').count().get(),
      base.where('status', '==', 'completed').count().get(),
    ]);
    const total = totalSnapshot.data().count;
    const inProgress = inProgressSnapshot.data().count;
    const completed = completedSnapshot.data().count;
    return {
      total,
      inProgress,
      completed,
      completedPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  /**
   * Returns a bounded newest-first Memory result set. Keyword search is a
   * substring match over the newest bounded candidate window; it is not an
   * exhaustive full-collection search. This keeps Firestore reads bounded
   * without introducing a second search/index authority.
   */
  public static async listMemories(userId: string, options: {
    status?: MemoryStatus | 'all';
    category?: string;
    query?: string;
    limit?: number;
  } = {}): Promise<MemoryRecord[]> {
    const status = options.status || 'all';
    const resultLimit = clampMemoryResultLimit(options.limit);
    const keyword = options.query?.trim().toLocaleLowerCase('vi');
    let q: Query = adminFirestore.collection('agent_memories').where('userId', '==', userId);
    if (status !== 'all') q = q.where('status', '==', status);
    if (options.category) q = q.where('category', '==', options.category);
    q = q.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
    q = q.limit(keyword ? MEMORY_SEARCH_CANDIDATE_LIMIT : resultLimit);

    const snapshot = await q.get();
    const memories = snapshot.docs
      .map(normalizeMemory)
      .filter((memory) => !keyword || `${memory.content} ${memory.category} ${memory.source}`.toLocaleLowerCase('vi').includes(keyword));
    return memories.slice(0, resultLimit);
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

  /**
   * Deletes owned Task/Memory data in bounded chunks. Earlier committed chunks
   * remain deleted if a later commit fails; callers receive that failure and a
   * retry safely continues from the remaining owned documents.
   */
  public static async deleteAllUserData(userId: string): Promise<void> {
    const collections = ['agent_tasks', 'agent_memories'];
    for (const collectionName of collections) {
      while (true) {
        const snapshot = await adminFirestore
          .collection(collectionName)
          .where('userId', '==', userId)
          .orderBy(FieldPath.documentId())
          .limit(USER_DATA_DELETE_CHUNK_SIZE)
          .get();
        if (snapshot.empty) break;

        const batch = adminFirestore.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    }
  }
}
