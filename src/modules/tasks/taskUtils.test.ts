import { describe, expect, it, vi } from 'vitest';
import {
  buildTaskPeriodActivity,
  buildTaskSnapshot,
  createTaskRequestAuthority,
  createTaskPendingOperations,
  scheduleTaskClock,
  formatTaskDeadline,
  getTaskAttentionCounts,
  formatCompactTaskTimestamp,
  getBoardTaskProjection,
  isHighPriorityOpenTask,
  isTaskDueInNextSevenDays,
  isTaskDueToday,
  isTaskOverdue,
  type TaskUtilityItem,
} from './taskUtils';

const now = new Date(2026, 8, 28, 10, 30);

const task = (overrides: Partial<TaskUtilityItem> = {}): TaskUtilityItem => ({
  id: overrides.id || 'task',
  status: 'todo',
  priority: 'medium',
  dueDate: '',
  ...overrides,
});

describe('H5 personal Task daily workflow utilities', () => {
  it('commits B when A starts first but resolves last, then rejects GET after PATCH', async () => {
    const authority = createTaskRequestAuthority();
    let resolveA!: (value: string) => void;
    let resolveB!: (value: string) => void;
    const responseA = new Promise<string>((resolve) => { resolveA = resolve; });
    const responseB = new Promise<string>((resolve) => { resolveB = resolve; });
    let visible = 'initial';
    const request = async (response: Promise<string>) => {
      const token = authority.begin();
      const value = await response;
      if (authority.isCurrent(token)) visible = value;
    };
    const a = request(responseA);
    const b = request(responseB);
    resolveB('B');
    await b;
    resolveA('A');
    await a;
    expect(visible).toBe('B');
    const oldGet = request(Promise.resolve('old GET'));
    authority.invalidate();
    visible = 'PATCH';
    await oldGet;
    expect(visible).toBe('PATCH');
  });

  it('guards same-task and create double dispatch without clearing independent pending operations', () => {
    const pending = createTaskPendingOperations();
    expect(pending.begin('A')).toBe(true);
    expect(pending.begin('A')).toBe(false);
    expect(pending.begin('B')).toBe(true);
    expect(pending.begin('new')).toBe(true);
    expect(pending.begin('new')).toBe(false);
    pending.end('A');
    expect(pending.has('B')).toBe(true);
    expect(pending.has('new')).toBe(true);
  });

  it('invalidates local projections after due time and midnight through one timer', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 8, 28, 9, 59));
      const timed = task({ dueDate: '2026-09-28', dueTime: '10:00' });
      expect(isTaskOverdue(timed)).toBe(false);
      const refresh = vi.fn();
      const cancel = scheduleTaskClock([timed], refresh);
      vi.advanceTimersByTime(60_001);
      expect(isTaskOverdue(timed)).toBe(true);
      expect(refresh).toHaveBeenCalledTimes(1);
      cancel();

      vi.setSystemTime(new Date(2026, 8, 28, 23, 59));
      const midnightTask = task({ dueDate: '2026-09-28' });
      expect(getTaskAttentionCounts([midnightTask]).today).toBe(1);
      const activityTask = task({ createdAt: '2026-09-28T09:00:00', completedAt: '2026-08-30T09:00:00' });
      expect(buildTaskPeriodActivity([activityTask], 'today').created).toBe(1);
      expect(buildTaskPeriodActivity([activityTask], '30d').completed).toBe(1);
      const midnightRefresh = vi.fn();
      const stop = scheduleTaskClock([midnightTask], midnightRefresh);
      vi.advanceTimersByTime(60_001);
      expect(midnightRefresh).toHaveBeenCalledTimes(1);
      expect(getTaskAttentionCounts([midnightTask])).toMatchObject({ today: 0, overdue: 1, next7: 0 });
      expect(buildTaskPeriodActivity([activityTask], 'today').created).toBe(0);
      expect(buildTaskPeriodActivity([activityTask], '7d').created).toBe(1);
      expect(buildTaskPeriodActivity([activityTask], '30d').completed).toBe(0);
      stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('formats malformed deadlines safely', () => {
    expect(formatTaskDeadline({ dueDate: '2026-02-30', dueTime: '10:30' })).toBe('Chưa đặt hạn');
    expect(formatTaskDeadline({ dueDate: 'garbage' })).toBe('Chưa đặt hạn');
    expect(formatTaskDeadline({ dueDate: '2026-10-01', dueTime: 'bad' })).not.toContain('bad');
  });
  it('formats completed card metadata as a compact Vietnamese timestamp', () => {
    expect(formatCompactTaskTimestamp('2026-09-27T20:04:00')).toBe('20:04 · 27/09/2026');
  });

  it('classifies today, future seven-day horizon, overdue and high-priority Tasks', () => {
    expect(isTaskDueToday(task({ dueDate: '2026-09-28' }), now)).toBe(true);
    expect(isTaskDueToday(task({ status: 'completed', dueDate: '2026-09-28' }), now)).toBe(false);
    expect(isTaskDueInNextSevenDays(task({ dueDate: '2026-10-04' }), now)).toBe(true);
    expect(isTaskDueInNextSevenDays(task({ dueDate: '2026-10-05' }), now)).toBe(false);
    expect(isTaskOverdue(task({ dueDate: '2026-09-27' }), now)).toBe(true);
    expect(isTaskOverdue(task({ dueDate: '2026-09-28', dueTime: '09:00' }), now)).toBe(true);
    expect(isTaskOverdue(task({ dueDate: '2026-09-28', dueTime: '23:00' }), now)).toBe(false);
    expect(isHighPriorityOpenTask(task({ priority: 'high' }))).toBe(true);
    expect(isHighPriorityOpenTask(task({ status: 'completed', priority: 'high' }))).toBe(false);
  });

  it('limits completed Board history by default while retaining an explicit expansion path', () => {
    const completed = Array.from({ length: 7 }, (_, index) => task({
      id: `completed-${index}`,
      status: 'completed',
      completedAt: `2026-09-${String(28 - index).padStart(2, '0')}T08:00:00`,
    }));
    const active = task({ id: 'active' });

    expect(getBoardTaskProjection([active, ...completed], false, 5)).toMatchObject({
      totalCompleted: 7,
      hiddenCompleted: 2,
    });
    expect(getBoardTaskProjection([active, ...completed], false, 5).tasks).toHaveLength(6);
    expect(getBoardTaskProjection([active, ...completed], true, 5).tasks).toHaveLength(8);
  });
});

describe('Task report current snapshot', () => {
  it('reconciles canonical 9-task status counts and current attention', () => {
    const tasks = [
      ...Array.from({ length: 4 }, (_, index) => task({ id: `todo-${index}` })),
      task({ id: 'todo-high', priority: 'high' }),
      task({ id: 'progress', status: 'in-progress', dueDate: '2026-09-27' }),
      task({ id: 'done-old-due', status: 'completed', dueDate: '2026-09-20' }),
      task({ id: 'done-high', status: 'completed', priority: 'high' }),
      task({ id: 'done', status: 'completed' }),
    ];

    const snapshot = buildTaskSnapshot(tasks, now);
    expect(snapshot).toEqual({ total: 9, todo: 5, inProgress: 1, completed: 3, overdue: 1, highPriorityOpen: 1 });
    expect(snapshot.todo + snapshot.inProgress + snapshot.completed).toBe(snapshot.total);
  });

  it('returns zeroes for an empty canonical dataset', () => {
    expect(buildTaskSnapshot([], now)).toEqual({ total: 0, todo: 0, inProgress: 0, completed: 0, overdue: 0, highPriorityOpen: 0 });
  });
});

describe('Task report period activity', () => {
  it('counts only today events and deadlines for today', () => {
    const activity = buildTaskPeriodActivity([
      task({ id: 'today', createdAt: '2026-09-28T08:00:00', completedAt: '2026-09-28T09:00:00', dueDate: '2026-09-28' }),
      task({ id: 'yesterday', createdAt: '2026-09-27T08:00:00', completedAt: '2026-09-27T09:00:00', dueDate: '2026-09-27' }),
      task({ id: 'tomorrow', createdAt: '2026-09-29T08:00:00', completedAt: '2026-09-29T09:00:00', dueDate: '2026-09-29' }),
    ], 'today', now);
    expect(activity).toEqual({ created: 1, completed: 1, due: 1 });
  });

  it('uses the inclusive past seven calendar days independently for created, completed and due', () => {
    const activity = buildTaskPeriodActivity([
      task({ id: 'start', createdAt: '2026-09-22T08:00:00', completedAt: '2026-09-22T09:00:00', dueDate: '2026-09-22' }),
      task({ id: 'end', createdAt: '2026-09-28T08:00:00', completedAt: '2026-09-28T09:00:00', dueDate: '2026-09-28' }),
      task({ id: 'before', createdAt: '2026-09-21T08:00:00', completedAt: '2026-09-21T09:00:00', dueDate: '2026-09-21' }),
      task({ id: 'future', createdAt: '2026-09-29T08:00:00', completedAt: '2026-09-29T09:00:00', dueDate: '2026-09-29' }),
    ], '7d', now);
    expect(activity).toEqual({ created: 2, completed: 2, due: 2 });
  });

  it('uses the inclusive past thirty calendar days and excludes day 30 and tomorrow', () => {
    const activity = buildTaskPeriodActivity([
      task({ id: 'start', createdAt: '2026-08-30T08:00:00', completedAt: '2026-08-30T09:00:00', dueDate: '2026-08-30' }),
      task({ id: 'before', createdAt: '2026-08-29T08:00:00', completedAt: '2026-08-29T09:00:00', dueDate: '2026-08-29' }),
      task({ id: 'future', createdAt: '2026-09-29T08:00:00', completedAt: '2026-09-29T09:00:00', dueDate: '2026-09-29' }),
    ], '30d', now);
    expect(activity).toEqual({ created: 1, completed: 1, due: 1 });
  });

  it('does not use updatedAt as period activity authority', () => {
    const activity = buildTaskPeriodActivity([
      task({ id: 'edited', createdAt: '2026-01-01T08:00:00', updatedAt: '2026-09-28T08:00:00', completedAt: null, dueDate: '2027-01-01' }),
    ], '7d', now);
    expect(activity).toEqual({ created: 0, completed: 0, due: 0 });
  });

  it('does not count a reopened task without completedAt as completed activity', () => {
    expect(buildTaskPeriodActivity([
      task({ id: 'reopened', status: 'in-progress', completedAt: null }),
    ], '7d', now).completed).toBe(0);
  });

  it('counts the retained latest completedAt when a task is completed again', () => {
    expect(buildTaskPeriodActivity([
      task({ id: 'recompleted', status: 'completed', completedAt: '2026-09-28T08:00:00' }),
    ], '7d', now).completed).toBe(1);
  });

  it('ignores invalid timestamps and invalid or empty due dates', () => {
    expect(buildTaskPeriodActivity([
      task({ id: 'invalid', createdAt: 'not-a-date', completedAt: 'also-not-a-date', dueDate: '2026-02-31' }),
      task({ id: 'empty', createdAt: null, completedAt: null, dueDate: '' }),
    ], '7d', now)).toEqual({ created: 0, completed: 0, due: 0 });
  });

  it('counts only valid retained event/deadline values for all', () => {
    expect(buildTaskPeriodActivity([
      task({ id: 'valid', createdAt: '2026-01-01T08:00:00', completedAt: '2026-02-01T08:00:00', dueDate: '2026-03-01' }),
      task({ id: 'partial', createdAt: '2026-04-01T08:00:00', completedAt: null, dueDate: '' }),
      task({ id: 'invalid', createdAt: 'bad', completedAt: 'bad', dueDate: '2026-02-31' }),
    ], 'all', now)).toEqual({ created: 2, completed: 1, due: 1 });
  });

  it('classifies ISO timestamps by local calendar date instead of UTC string prefix', () => {
    const localMidnight = new Date(2026, 8, 28, 0, 30);
    const iso = localMidnight.toISOString();
    expect(buildTaskPeriodActivity([task({ createdAt: iso })], 'today', localMidnight).created).toBe(1);
  });
});
