import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_USER, useContextStore } from './contextStore';
import { eventBus } from '../events/eventBus';

const ownerA = { id: 'owner-a', name: 'A', email: 'a@example.test', roles: ['owner'], permissions: ['tasks.read'] };
const ownerB = { id: 'owner-b', name: 'B', email: 'b@example.test', roles: ['owner'], permissions: ['tasks.read'] };

function selectPrivateTask() {
  useContextStore.getState().setSelectedEntity({
    moduleId: 'tasks', entityType: 'task', entityId: 'private-task', label: 'Private task title',
  });
  useContextStore.getState().setCurrentFilters({ search: 'private search term' });
  useContextStore.getState().setAvailableCapabilities(['system.tasks.list']);
}

describe('CAT-01 user identity boundary for Agent context', () => {
  beforeEach(() => {
    useContextStore.setState({
      user: DEFAULT_USER, selectedEntity: undefined, currentFilters: {}, availableCapabilities: [],
    });
  });
  afterEach(() => {
    useContextStore.setState({
      user: DEFAULT_USER, selectedEntity: undefined, currentFilters: {}, availableCapabilities: [],
    });
  });

  it('clears selected Task, filters and capability projection when identity changes', () => {
    useContextStore.getState().setUser(ownerA);
    selectPrivateTask();

    useContextStore.getState().setUser(ownerB);
    const context = useContextStore.getState().getAppContext();
    expect(context.user.id).toBe('owner-b');
    expect(context.selectedEntity).toBeUndefined();
    expect(context.currentFilters).toEqual({});
    expect(context.availableCapabilities).toEqual([]);
  });

  it('keeps in-progress context when permissions are refreshed for the same owner', () => {
    useContextStore.getState().setUser(ownerA);
    selectPrivateTask();

    useContextStore.getState().setUser({ ...ownerA, permissions: ['tasks.read', 'tasks.write'] });
    const context = useContextStore.getState().getAppContext();
    expect(context.selectedEntity?.entityId).toBe('private-task');
    expect(context.currentFilters).toEqual({ search: 'private search term' });
    expect(context.availableCapabilities).toEqual(['system.tasks.list']);
  });

  it('does not publish previous Task context in the user.changed notification after logout', () => {
    useContextStore.getState().setUser(ownerA);
    selectPrivateTask();
    const seen: unknown[] = [];
    const off = eventBus.on<{ user: typeof DEFAULT_USER }>('user.changed', () => {
      seen.push(useContextStore.getState().getAppContext().selectedEntity);
    });
    try {
      useContextStore.getState().setUser(DEFAULT_USER);
      expect(seen).toEqual([undefined]);
      expect(useContextStore.getState().getAppContext().user.id).toBe('guest');
    } finally {
      off();
    }
  });
});
