import { describe, expect, it } from 'vitest';
import {
  buildTaskReport,
  getBoardTaskProjection,
  isHighPriorityOpenTask,
  isTaskDueInNextSevenDays,
  isTaskDueToday,
  isTaskOverdue,
  type TaskUtilityItem,
} from './taskUtils';

const now = new Date(2026, 8, 26, 10, 30);

const task = (overrides: Partial<TaskUtilityItem> = {}): TaskUtilityItem => ({
  id: overrides.id || 'task',
  status: 'todo',
  priority: 'medium',
  dueDate: '',
  ...overrides,
});

describe('H5 personal Task daily workflow utilities', () => {
  it('classifies today, seven-day horizon, overdue and high-priority Tasks', () => {
    expect(isTaskDueToday(task({ dueDate: '2026-09-26' }), now)).toBe(true);
    expect(isTaskDueToday(task({ status: 'completed', dueDate: '2026-09-26' }), now)).toBe(false);
    expect(isTaskDueInNextSevenDays(task({ dueDate: '2026-10-02' }), now)).toBe(true);
    expect(isTaskDueInNextSevenDays(task({ dueDate: '2026-10-03' }), now)).toBe(false);
    expect(isTaskOverdue(task({ dueDate: '2026-09-25' }), now)).toBe(true);
    expect(isTaskOverdue(task({ dueDate: '2026-09-26', dueTime: '09:00' }), now)).toBe(true);
    expect(isTaskOverdue(task({ dueDate: '2026-09-26', dueTime: '23:00' }), now)).toBe(false);
    expect(isHighPriorityOpenTask(task({ priority: 'high' }))).toBe(true);
    expect(isHighPriorityOpenTask(task({ status: 'completed', priority: 'high' }))).toBe(false);
  });

  it('limits completed Board history by default while retaining an explicit expansion path', () => {
    const completed = Array.from({ length: 7 }, (_, index) => task({
      id: `completed-${index}`,
      status: 'completed',
      completedAt: `2026-09-${String(26 - index).padStart(2, '0')}T08:00:00`,
    }));
    const active = task({ id: 'active' });

    expect(getBoardTaskProjection([active, ...completed], false, 5)).toMatchObject({
      totalCompleted: 7,
      hiddenCompleted: 2,
    });
    expect(getBoardTaskProjection([active, ...completed], false, 5).tasks).toHaveLength(6);
    expect(getBoardTaskProjection([active, ...completed], true, 5).tasks).toHaveLength(8);
  });

  it('aggregates a deterministic seven-day report from loaded canonical Task data', () => {
    const report = buildTaskReport([
      task({ id: 'done', status: 'completed', createdAt: '2026-09-25T08:00:00', completedAt: '2026-09-26T08:00:00' }),
      task({ id: 'progress', status: 'in-progress', dueDate: '2026-09-27', createdAt: '2026-09-26T08:00:00' }),
      task({ id: 'late', dueDate: '2026-09-25', createdAt: '2026-09-26T08:00:00' }),
      task({ id: 'old', status: 'completed', createdAt: '2026-01-01T08:00:00', completedAt: '2026-01-02T08:00:00' }),
    ], '7d', now);

    expect(report).toEqual({
      total: 3,
      completed: 1,
      inProgress: 1,
      todo: 1,
      overdue: 1,
      completionRate: 33,
    });
  });
});
