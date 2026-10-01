import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ documents: new Map<string, Record<string, unknown>>() }));
vi.mock('../../../lib/firebaseAdmin', () => ({
  adminFirestore: {
    collection: () => ({
      add: async (data: Record<string, unknown>) => {
        state.documents.set('created', data);
        return { get: async () => ({ id: 'created', data: () => state.documents.get('created') }) };
      },
      doc: (id: string) => ({
        get: async () => ({ id, exists: true, get: (key: string) => state.documents.get(id)?.[key], data: () => state.documents.get(id) }),
        update: async (patch: Record<string, unknown>) => state.documents.set(id, { ...state.documents.get(id), ...patch }),
      }),
    }),
  },
}));
vi.mock('../../../infrastructure/storage', () => ({
  storage: { refreshModuleSettings: async () => {}, getData: () => ({ moduleSettings: { tasks: { enabled: true, canDisable: false } } }) },
}));

import { UserDataService } from '../UserDataService';

describe('Task persistence deadline invariant', () => {
  beforeEach(() => state.documents.clear());

  it('does not persist orphan dueTime from CREATE', async () => {
    await UserDataService.createTask('owner', { title: 'Create', dueDate: '', dueTime: '10:30' });
    expect(state.documents.get('created')?.dueTime).toBe('');
  });

  it('clears existing time when PATCH removes date or sends time against an empty date', async () => {
    state.documents.set('task', { userId: 'owner', title: 'Existing', dueDate: '2026-10-01', dueTime: '10:30' });
    await UserDataService.updateTask('owner', 'task', { dueDate: '' });
    expect(state.documents.get('task')).toMatchObject({ dueDate: '', dueTime: '' });
    await UserDataService.updateTask('owner', 'task', { dueDate: '', dueTime: '11:00' });
    expect(state.documents.get('task')?.dueTime).toBe('');
  });
});
