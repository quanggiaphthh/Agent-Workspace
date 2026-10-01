export type TaskUtilityStatus = 'todo' | 'in-progress' | 'completed';
export type TaskUtilityPriority = 'low' | 'medium' | 'high';
export type TaskAttentionFilter = 'today' | 'next7' | 'overdue' | 'high';

export type TaskUtilityItem = {
  id: string;
  status: TaskUtilityStatus;
  priority: TaskUtilityPriority;
  dueDate: string;
  dueTime?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
};

export type TaskReportPeriod = 'today' | '7d' | '30d' | 'all';

export const TASK_COMPLETED_BOARD_LIMIT = 5;

const pad = (value: number) => String(value).padStart(2, '0');

export function getLocalDateKey(value = new Date()): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function getLocalTimeKey(value: Date): string {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isTimeKey(value?: string): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function createTaskRequestAuthority() {
  let generation = 0;
  return {
    begin: () => ++generation,
    invalidate: () => { generation += 1; },
    isCurrent: (token: number) => token === generation,
  };
}

export function createTaskPendingOperations() {
  const pending = new Set<string>();
  return {
    begin: (id: string) => { if (pending.has(id)) return false; pending.add(id); return true; },
    end: (id: string) => { pending.delete(id); },
    has: (id: string) => pending.has(id),
  };
}

export function scheduleTaskClock(tasks: Pick<TaskUtilityItem, 'status' | 'dueDate' | 'dueTime'>[], refresh: () => void): () => void {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const today = getLocalDateKey(now);
  const nextDue = tasks.filter((task) => task.status !== 'completed' && task.dueDate === today && isTimeKey(task.dueTime))
    .map((task) => {
      const [hour, minute] = task.dueTime!.split(':').map(Number);
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).getTime() + 1;
    }).filter((at) => at > now.getTime());
  const next = Math.min(midnight, ...nextDue);
  const timer = setTimeout(refresh, Math.max(1, next - now.getTime()));
  return () => clearTimeout(timer);
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function timestampDateKey(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : getLocalDateKey(parsed);
}

export function isTaskDueToday(task: Pick<TaskUtilityItem, 'status' | 'dueDate'>, now = new Date()): boolean {
  return task.status !== 'completed' && isDateKey(task.dueDate) && task.dueDate === getLocalDateKey(now);
}

export function isTaskDueInNextSevenDays(task: Pick<TaskUtilityItem, 'status' | 'dueDate'>, now = new Date()): boolean {
  if (task.status === 'completed' || !isDateKey(task.dueDate)) return false;
  const today = getLocalDateKey(now);
  return task.dueDate >= today && task.dueDate <= addDays(today, 6);
}

export function isTaskOverdue(task: Pick<TaskUtilityItem, 'status' | 'dueDate' | 'dueTime'>, now = new Date()): boolean {
  if (task.status === 'completed' || !isDateKey(task.dueDate)) return false;
  const today = getLocalDateKey(now);
  if (task.dueDate < today) return true;
  if (task.dueDate > today || !task.dueTime) return false;
  return isTimeKey(task.dueTime) && (task.dueTime < getLocalTimeKey(now) || (task.dueTime === getLocalTimeKey(now) && (now.getSeconds() > 0 || now.getMilliseconds() > 0)));
}

export function isHighPriorityOpenTask(task: Pick<TaskUtilityItem, 'status' | 'priority'>): boolean {
  return task.status !== 'completed' && task.priority === 'high';
}

export function matchesTaskAttention(
  task: Pick<TaskUtilityItem, 'status' | 'priority' | 'dueDate' | 'dueTime'>,
  filter: TaskAttentionFilter,
  now = new Date(),
): boolean {
  if (filter === 'today') return isTaskDueToday(task, now);
  if (filter === 'next7') return isTaskDueInNextSevenDays(task, now);
  if (filter === 'overdue') return isTaskOverdue(task, now);
  return isHighPriorityOpenTask(task);
}

export function getTaskAttentionCounts<T extends Pick<TaskUtilityItem, 'status' | 'priority' | 'dueDate' | 'dueTime'>>(
  tasks: T[],
  now = new Date(),
) {
  return {
    today: tasks.filter((task) => matchesTaskAttention(task, 'today', now)).length,
    next7: tasks.filter((task) => matchesTaskAttention(task, 'next7', now)).length,
    overdue: tasks.filter((task) => matchesTaskAttention(task, 'overdue', now)).length,
    high: tasks.filter((task) => matchesTaskAttention(task, 'high', now)).length,
  };
}

/**
 * Compares canonical local date/time strings without timezone conversion.
 * A date without an explicit time sorts after timed tasks on the same date.
 */
export function compareTaskDeadlines(
  a: Pick<TaskUtilityItem, 'dueDate' | 'dueTime'>,
  b: Pick<TaskUtilityItem, 'dueDate' | 'dueTime'>,
): number {
  const aHasDate = isDateKey(a.dueDate);
  const bHasDate = isDateKey(b.dueDate);
  if (!aHasDate && !bHasDate) return 0;
  if (!aHasDate) return 1;
  if (!bHasDate) return -1;

  const dateOrder = a.dueDate.localeCompare(b.dueDate);
  if (dateOrder !== 0) return dateOrder;

  const aTime = isTimeKey(a.dueTime) ? a.dueTime : '23:59';
  const bTime = isTimeKey(b.dueTime) ? b.dueTime : '23:59';
  return aTime.localeCompare(bTime);
}

export function getPrimaryTaskStatusAction(status: TaskUtilityStatus): { label: string; status: TaskUtilityStatus } {
  if (status === 'todo') return { label: 'Bắt đầu', status: 'in-progress' };
  if (status === 'in-progress') return { label: 'Hoàn thành', status: 'completed' };
  return { label: 'Mở lại', status: 'todo' };
}

export function getBoardTaskProjection<T extends TaskUtilityItem>(
  tasks: T[],
  showAllCompleted: boolean,
  completedLimit = TASK_COMPLETED_BOARD_LIMIT,
): { tasks: T[]; totalCompleted: number; hiddenCompleted: number } {
  const activeTasks = tasks.filter((task) => task.status !== 'completed');
  const completedTasks = tasks
    .filter((task) => task.status === 'completed')
    .slice()
    .sort((a, b) => (
      (b.completedAt || b.updatedAt || b.createdAt || '').localeCompare(a.completedAt || a.updatedAt || a.createdAt || '')
    ));
  const visibleCompleted = showAllCompleted ? completedTasks : completedTasks.slice(0, completedLimit);
  return {
    tasks: [...activeTasks, ...visibleCompleted],
    totalCompleted: completedTasks.length,
    hiddenCompleted: Math.max(0, completedTasks.length - visibleCompleted.length),
  };
}

export function buildTaskSnapshot(tasks: TaskUtilityItem[], now = new Date()) {
  const todo = tasks.filter((task) => task.status === 'todo').length;
  const inProgress = tasks.filter((task) => task.status === 'in-progress').length;
  const completed = tasks.filter((task) => task.status === 'completed').length;
  return {
    total: tasks.length,
    todo,
    inProgress,
    completed,
    overdue: tasks.filter((task) => isTaskOverdue(task, now)).length,
    highPriorityOpen: tasks.filter((task) => isHighPriorityOpenTask(task)).length,
  };
}

function isDateInReportPeriod(dateKey: string | null, period: TaskReportPeriod, now: Date): boolean {
  if (!dateKey || !isDateKey(dateKey)) return false;
  if (period === 'all') return true;
  const end = getLocalDateKey(now);
  const start = period === 'today' ? end : addDays(end, period === '7d' ? -6 : -29);
  return dateKey >= start && dateKey <= end;
}

export function buildTaskPeriodActivity(tasks: TaskUtilityItem[], period: TaskReportPeriod, now = new Date()) {
  return {
    created: tasks.filter((task) => isDateInReportPeriod(timestampDateKey(task.createdAt), period, now)).length,
    completed: tasks.filter((task) => isDateInReportPeriod(timestampDateKey(task.completedAt), period, now)).length,
    due: tasks.filter((task) => isDateInReportPeriod(task.dueDate, period, now)).length,
  };
}

export function formatTaskDeadline(task: Pick<TaskUtilityItem, 'dueDate' | 'dueTime'>): string {
  if (!isDateKey(task.dueDate)) return 'Chưa đặt hạn';
  const date = new Intl.DateTimeFormat('vi-VN').format(new Date(`${task.dueDate}T00:00:00`));
  return isTimeKey(task.dueTime) ? `${date} · ${task.dueTime}` : date;
}

export function formatTaskTimestamp(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

export function formatCompactTaskTimestamp(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  const time = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
  const date = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
  return `${time} · ${date}`;
}
