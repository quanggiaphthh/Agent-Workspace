// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));

vi.mock('../../../lib/authFetch', () => ({ authFetch: authFetchMock }));

import { eventBus } from '../../events/eventBus';
import { moduleRegistry } from '../moduleRegistry';
import { serverModuleCatalog } from '../../../../server/core/modules/moduleCatalog';
import { packagedClientModules, registerPackagedClientModules } from '../../../moduleComposition';

/**
 * The server module catalog stays the enable/disable authority and fails closed.
 * The client must therefore never grant speculative access before real server
 * state lands, and a failed sync must not be treated as confirmation.
 */
describe('module enable-state gating against the server authority', () => {
  beforeEach(() => {
    moduleRegistry.reset();
    serverModuleCatalog.reset();
    authFetchMock.mockReset();
  });

  it('mirrors each packaged module server default instead of assuming every module is on', () => {
    serverModuleCatalog.register({
      id: 'document-formatting',
      name: 'Định dạng văn bản',
      enabled: false,
      canDisable: true,
      version: '0.1.0-candidate',
    });
    registerPackagedClientModules();
    const user = { id: 'owner-1', email: 'owner@test.local', name: 'Owner', roles: ['owner'], permissions: ['files.read', 'files.write'] };

    expect(serverModuleCatalog.get('document-formatting')?.enabled).toBe(false);
    expect(moduleRegistry.isEnabled('document-formatting')).toBe(false);
    expect(moduleRegistry.getNavigation(user).some(item => item.id === 'document-formatting-nav')).toBe(false);
    expect(moduleRegistry.getRoutes(user).some(route => route.path === '/document-formatting')).toBe(false);

    // Core and Task modules keep the historical enabled-on-register behaviour.
    expect(moduleRegistry.isEnabled('home')).toBe(true);
    expect(moduleRegistry.isEnabled('settings')).toBe(true);
    expect(moduleRegistry.isEnabled('tasks')).toBe(true);

    for (const manifest of packagedClientModules) {
      const server = serverModuleCatalog.get(manifest.id);
      if (server) expect(moduleRegistry.isEnabled(manifest.id)).toBe(server.enabled);
    }
  });

  it('does not treat a failed, malformed or rejected sync as confirmed server state', async () => {
    serverModuleCatalog.register({ id: 'document-formatting', name: 'Định dạng văn bản', enabled: false, canDisable: true, version: '0.1.0-candidate' });
    registerPackagedClientModules();
    const synced: unknown[] = [];
    const unsubscribe = eventBus.on('modules.synced', payload => synced.push(payload));

    authFetchMock.mockResolvedValueOnce(new Response('nope', { status: 503 }));
    await moduleRegistry.syncWithServer();
    expect(moduleRegistry.hasConfirmedServerState()).toBe(false);
    expect(synced.at(-1)).toEqual({ failed: true });
    expect(moduleRegistry.isEnabled('document-formatting')).toBe(false);

    authFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ unexpected: true }), { status: 200 }));
    await moduleRegistry.syncWithServer();
    expect(moduleRegistry.hasConfirmedServerState()).toBe(false);
    expect(synced.at(-1)).toEqual({ failed: true });

    authFetchMock.mockRejectedValueOnce(new Error('network down'));
    await moduleRegistry.syncWithServer();
    expect(moduleRegistry.hasConfirmedServerState()).toBe(false);
    expect(synced.at(-1)).toEqual({ failed: true });

    unsubscribe();
  });

  it('applies authoritative state and notifies existing subscribers on a successful sync', async () => {
    serverModuleCatalog.register({ id: 'document-formatting', name: 'Định dạng văn bản', enabled: false, canDisable: true, version: '0.1.0-candidate' });
    registerPackagedClientModules();
    const synced: unknown[] = [];
    const statusEvents: unknown[] = [];
    const offSynced = eventBus.on('modules.synced', payload => synced.push(payload));
    const offStatus = eventBus.on('module.statusChanged', payload => statusEvents.push(payload));

    authFetchMock.mockResolvedValueOnce(new Response(JSON.stringify([
      { id: 'document-formatting', enabled: true },
      { id: 'not-packaged-here', enabled: false },
      { id: 'tasks', enabled: 'yes' },
    ]), { status: 200 }));
    await moduleRegistry.syncWithServer();

    expect(moduleRegistry.hasConfirmedServerState()).toBe(true);
    expect(moduleRegistry.isEnabled('document-formatting')).toBe(true);
    expect(moduleRegistry.isEnabled('tasks')).toBe(true);
    expect(synced.at(-1)).toEqual({});
    expect(statusEvents).toEqual([{ moduleId: 'document-formatting', enabled: true }]);

    offSynced();
    offStatus();
  });
});