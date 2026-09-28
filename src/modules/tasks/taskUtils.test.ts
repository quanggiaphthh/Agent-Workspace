import { describe, expect, it } from 'vitest';
import {
  buildTaskPeriodActivity,
  buildTaskSnapshot,
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
