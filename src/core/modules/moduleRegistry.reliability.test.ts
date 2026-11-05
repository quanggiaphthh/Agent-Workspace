import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));
vi.mock('../../lib/authFetch', () => ({ authFetch: authFetchMock }));

import { moduleRegistry } from './moduleRegistry';
import { eventBus } from '../events/eventBus';

function register(id: string, route?: string) {
  moduleRegistry.register({
    id,
    version: '1.0.0',
    meta: { name: id },
    routes: route ? [{ path: route, component: () => null }] : [],
  });
}

describe('CAT-01 module registry reliability', () => {
  beforeEach(() => {
    moduleRegistry.reset();
    authFetchMock.mockReset();
  });
  afterEach(() => moduleRegistry.reset());

  it('matches route boundaries and gives the most specific nested route precedence', () => {
    register('tasks', '/tasks');
    register('task-archive', '/tasks-archive');
    register('task-detail', '/tasks/detail');

    expect(moduleRegistry.resolveModuleByPath('/tasks')).toBe('tasks');
    expect(moduleRegistry.resolveModuleByPath('/tasks/123')).toBe('tasks');
    expect(moduleRegistry.resolveModuleByPath('/tasks/detail/123')).toBe('task-detail');
    expect(moduleRegistry.resolveModuleByPath('/tasks-archive')).toBe('task-archive');
    expect(moduleRegistry.resolveModuleByPath('/tasksExtra')).toBe('home');

    return moduleRegistry.disable('task-archive').then(() => {
      expect(moduleRegistry.resolveModuleByPath('/tasks-archive')).toBe('home');
    });
  });

  it('serializes competing disable -> enable requests and emits each committed transition once', async () => {
    const calls: string[] = [];
    let releaseDisable!: () => void;
    moduleRegistry.register({
      id: 'racing-module',
      version: '1.0.0',
      meta: { name: 'Racing module' },
      routes: [],
      lifecycle: {
        onDisable: () => new Promise<void>(resolve => {
          calls.push('disable-hook');
          releaseDisable = resolve;
        }),
        onEnable: async () => { calls.push('enable-hook'); },
      },
    });
    const events: boolean[] = [];
    const off = eventBus.on<{ moduleId: string; enabled: boolean }>('module.statusChanged', event => {
      if (event.moduleId === 'racing-module') events.push(event.enabled);
    });
    try {
      const disabling = moduleRegistry.disable('racing-module', async () => { calls.push('persist-disable'); });
      const enabling = moduleRegistry.enable('racing-module', async () => { calls.push('persist-enable'); });
      expect(moduleRegistry.isEnabled('racing-module')).toBe(true);
      expect(events).toEqual([]);

      releaseDisable();
      await Promise.all([disabling, enabling]);
      expect(moduleRegistry.isEnabled('racing-module')).toBe(true);
      expect(calls).toEqual(['disable-hook', 'persist-disable', 'enable-hook', 'persist-enable']);
      expect(events).toEqual([false, true]);
    } finally {
      off();
    }
  });

  it('coalesces duplicate pending disable requests, preserving lifecycle and persistence once', async () => {
    let releaseDisable!: () => void;
    const hook = vi.fn(() => new Promise<void>(resolve => { releaseDisable = resolve; }));
    const persist = vi.fn(async () => undefined);
    moduleRegistry.register({
      id: 'duplicate-module',
      version: '1.0.0',
      meta: { name: 'Duplicate module' },
      routes: [],
      lifecycle: { onDisable: hook },
    });
    const first = moduleRegistry.disable('duplicate-module', persist);
    const second = moduleRegistry.disable('duplicate-module', persist);
    releaseDisable();
    await Promise.all([first, second]);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(moduleRegistry.isEnabled('duplicate-module')).toBe(false);
  });

  it('keeps old visible state on failed persistence and allows the next transition', async () => {
    const steps: string[] = [];
    moduleRegistry.register({
      id: 'failed-module',
      version: '1.0.0',
      meta: { name: 'Failed module' },
      routes: [],
      lifecycle: { onDisable: async () => { steps.push('hook'); } },
    });
    const events: boolean[] = [];
    const off = eventBus.on<{ moduleId: string; enabled: boolean }>('module.statusChanged', event => {
      if (event.moduleId === 'failed-module') events.push(event.enabled);
    });
    try {
      await expect(moduleRegistry.disable('failed-module', async () => {
        steps.push('persist-failed');
        throw new Error('storage offline');
      })).rejects.toThrow('storage offline');
      expect(moduleRegistry.isEnabled('failed-module')).toBe(true);
      expect(events).toEqual([]);
      await moduleRegistry.disable('failed-module', async () => { steps.push('persist-ok'); });
      expect(moduleRegistry.isEnabled('failed-module')).toBe(false);
      expect(steps).toEqual(['hook', 'persist-failed', 'hook', 'persist-ok']);
      expect(events).toEqual([false]);
    } finally {
      off();
    }
  });

  it('ignores a stale server sync response after a newer local toggle', async () => {
    register('tasks', '/tasks');
    let deliverResponse!: (value: unknown) => void;
    authFetchMock.mockImplementationOnce(() => new Promise(resolve => { deliverResponse = resolve; }));
    const syncing = moduleRegistry.syncWithServer();
    await moduleRegistry.disable('tasks', async () => undefined);
    deliverResponse({ ok: true, json: async () => [{ id: 'tasks', enabled: true }] });
    await syncing;
    expect(moduleRegistry.isEnabled('tasks')).toBe(false);
  });

  it('still applies a normal server sync when no local transition is racing', async () => {
    register('tasks', '/tasks');
    authFetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'tasks', enabled: false }] });
    await moduleRegistry.syncWithServer();
    expect(moduleRegistry.isEnabled('tasks')).toBe(false);
  });
  it('keeps newest server sync when two responses arrive out of order', async () => {
    register('tasks', '/tasks');
    let first!: (value: unknown) => void;
    let second!: (value: unknown) => void;
    authFetchMock
      .mockImplementationOnce(() => new Promise(resolve => { first = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { second = resolve; }));
    const sync1 = moduleRegistry.syncWithServer();
    const sync2 = moduleRegistry.syncWithServer();
    second({ ok: true, json: async () => [{ id: 'tasks', enabled: false }] });
    await sync2;
    first({ ok: true, json: async () => [{ id: 'tasks', enabled: true }] });
    await sync1;
    expect(moduleRegistry.isEnabled('tasks')).toBe(false);
  });

  it('rejects a stale sync response bound to a different owner', async () => {
    register('tasks', '/tasks');
    let respond!: (value: unknown) => void;
    authFetchMock.mockImplementationOnce(() => new Promise(resolve => { respond = resolve; }));
    const syncing = moduleRegistry.syncWithServer('owner-A');
    respond({ ok: true, json: async () => [{ id: 'tasks', enabled: false }] });
    await syncing;
    expect(moduleRegistry.isEnabled('tasks')).toBe(true);
  });

  it('does not apply a snapshot to a re-registered module', async () => {
    register('tasks', '/tasks');
    let respond!: (value: unknown) => void;
    authFetchMock.mockImplementationOnce(() => new Promise(resolve => { respond = resolve; }));
    const syncing = moduleRegistry.syncWithServer();
    moduleRegistry.unregister('tasks');
    register('tasks', '/tasks');
    respond({ ok: true, json: async () => [{ id: 'tasks', enabled: false }] });
    await syncing;
    expect(moduleRegistry.isEnabled('tasks')).toBe(true);
  });

});
