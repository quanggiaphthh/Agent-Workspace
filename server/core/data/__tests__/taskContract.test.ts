import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import {
  buildTaskStatusPatch,
  isValidTaskDueTime,
  normalizeTaskData,
} from '../UserDataService';

describe('H5 Task data contract', () => {
  it('normalizes legacy Tasks without dueTime or completedAt', () => {
    const task = normalizeTaskData('legacy-task', {
      userId: 'owner',
      title: 'Công việc cũ',
      description: '',
      status: 'todo',
      priority: 'medium',
      category: 'Công việc',
      dueDate: '',
    });

    expect(task).toMatchObject({
      id: 'legacy-task',
      userId: 'owner',
      title: 'Công việc cũ',
      dueDate: '',
      createdAt: null,
      updatedAt: null,
      completedAt: null,
    });
    expect(task.dueTime).toBeUndefined();
  });

  it('accepts only empty or valid HH:mm due times', () => {
    expect(['', '00:00', '09:05', '23:59'].every(isValidTaskDueTime)).toBe(true);
    expect(['9:00', '24:00', '12:60', '12:5', 'noon'].some((value) => isValidTaskDueTime(value))).toBe(false);
  });

  it('sets a server timestamp when a Task enters completed status', () => {
    const completedAt = Timestamp.fromDate(new Date('2026-09-26T03:00:00.000Z'));

    expect(buildTaskStatusPatch({ status: 'completed' }, completedAt, 'todo')).toEqual({
      status: 'completed',
      completedAt,
    });
  });

  it('clears completedAt when a completed Task is reopened', () => {
    const completedAt = Timestamp.fromDate(new Date('2026-09-26T03:00:00.000Z'));

    expect(buildTaskStatusPatch({ status: 'in-progress' }, completedAt, 'completed')).toEqual({
      status: 'in-progress',
      completedAt: null,
    });
  });

  it('does not reset completedAt when an already completed Task is edited', () => {
    const completedAt = Timestamp.fromDate(new Date('2026-09-25T03:00:00.000Z'));

    expect(buildTaskStatusPatch({ status: 'completed', priority: 'high' }, completedAt, 'completed')).toEqual({
      status: 'completed',
      priority: 'high',
    });
  });
});
