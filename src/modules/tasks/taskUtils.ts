export type TaskUtilityStatus = 'todo' | 'in-progress' | 'completed';
export type TaskUtilityPriority = 'low' | 'medium' | 'high';

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
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
  return task.dueTime < getLocalTimeKey(now);
}

export function isHighPriorityOpenTask(task: Pick<TaskUtilityItem, 'status' | 'priority'>): boolean {
  return task.status !== 'completed' && task.priority === 'high';
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

function isTaskInPeriod(task: TaskUtilityItem, period: TaskReportPeriod, now: Date): boolean {
  if (period === 'all') return true;
  const start = getLocalDateKey(now);
  const end = addDays(start, period === 'today' ? 0 : period === '7d' ? 6 : 29);
  const candidateDates = [
    task.dueDate,
    timestampDateKey(task.createdAt),
    timestampDateKey(task.updatedAt),
    timestampDateKey(task.completedAt),
  ].filter((value): value is string => Boolean(value));
  return candidateDates.some((date) => isDateKey(date) && date >= start && date <= end);
}

export function buildTaskReport(tasks: TaskUtilityItem[], period: TaskReportPeriod, now = new Date()) {
  const scopedTasks = tasks.filter((task) => isTaskInPeriod(task, period, now));
  const completed = scopedTasks.filter((task) => task.status === 'completed').length;
  const inProgress = scopedTasks.filter((task) => task.status === 'in-progress').length;
  const todo = scopedTasks.filter((task) => task.status === 'todo').length;
  const total = scopedTasks.length;
  return {
    total,
    completed,
    inProgress,
    todo,
    overdue: scopedTasks.filter((task) => isTaskOverdue(task, now)).length,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export function formatTaskDeadline(task: Pick<TaskUtilityItem, 'dueDate' | 'dueTime'>): string {
  if (!task.dueDate) return 'Chưa đặt hạn';
  const date = new Intl.DateTimeFormat('vi-VN').format(new Date(`${task.dueDate}T00:00:00`));
  return task.dueTime ? `${date} · ${task.dueTime}` : date;
}

export function formatTaskTimestamp(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}
