// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  uid: 'A' as string | null,
  ownerA: { uid: 'A' },
  ownerB: { uid: 'B' },
  fetch: vi.fn(),
  setSelectedEntity: vi.fn(),
}));

vi.mock('../../lib/FirebaseAuthProvider', () => ({
  useFirebaseAuth: () => ({ user: state.uid === 'A' ? state.ownerA : state.uid === 'B' ? state.ownerB : null }),
}));
vi.mock('../../lib/authFetch', () => ({ authFetch: state.fetch }));
vi.mock('../../core/context/contextStore', () => {
  const getState = () => ({
    selectedEntity: null,
    user: { id: state.uid ?? 'guest', roles: ['admin'], permissions: ['tasks.read', 'tasks.write', 'tasks.delete'] },
    setSelectedEntity: state.setSelectedEntity,
  });
  return { useContextStore: Object.assign((selector: (value: unknown) => unknown) => selector(getState()), { getState }) };
});
vi.mock('./TaskBoard', () => ({
  TaskBoard: ({ tasks }: { tasks: Array<{ title: string }> }) =>
    <div data-testid="board">{tasks.map(task => task.title).join(',')}</div>,
}));
vi.mock('./TaskFormModal', () => ({ TaskFormModal: () => null }));
vi.mock('./TaskDetailPanel', () => ({ TaskDetailPanel: () => null }));

import { TasksModule } from './TasksModule';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function task(owner: string) {
  return { id: 'task-' + owner, title: 'Private task ' + owner,
    description: '', category: '', status: 'todo', priority: 'medium', dueDate: '' };
}

describe('CAT-T01 Task owner render boundary', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    state.uid = 'A';
    state.fetch.mockReset().mockImplementation(async (url: string) => {
      if (url !== '/api/tasks?status=all') throw new Error('Unexpected request');
      return { ok: true, json: async () => ({ tasks: [task(state.uid ?? 'guest')] }) };
    });
    state.setSelectedEntity.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('must not paint tasks from account A on the first synchronous render of B', async () => {
    await act(async () => { root.render(<TasksModule />); });
    await vi.waitFor(() => expect(container.textContent).toContain('Private task A'));
    state.uid = 'B';
    flushSync(() => root.render(<TasksModule />));
    expect(container.textContent).not.toContain('Private task A');
  });
});
