import { describe, it, expect, vi, beforeEach } from 'vitest';
import { moduleRegistry } from '../core/modules/moduleRegistry';
import { ServerCapabilityRegistry } from '../../server/core/capabilities/serverCapabilityRegistry';
import { serverModuleCatalog } from '../../server/core/modules/moduleCatalog';
import { PermissionResolver } from '../../server/core/permissions/permissionResolver';
import { storage } from '../../server/infrastructure/storage';
import { navigationService } from '../core/navigation/navigationService';
import { CapabilityToolNameRegistry } from '../../server/core/capabilities/capabilityToolNameRegistry';
import { z } from 'zod';
import { ExecutionContext } from '../../shared/contracts/capability';
import { packagedClientModules, registerPackagedClientModules } from '../moduleComposition';
import { eventBus } from '../core/events/eventBus';

/**
 * P1 PREFLIGHT & P0.3 ARCHITECTURAL INVARIANT TESTS
 */
describe('Architectural Invariants P1 Preflight', () => {
  
  beforeEach(() => {
    // Isolated Test Lifecycle: Reset all registries and storage
    moduleRegistry.reset();
    serverModuleCatalog.reset();
    ServerCapabilityRegistry.reset();
    CapabilityToolNameRegistry.reset();
    storage.reset();
  });

  describe('1. Storage & Bootstrap', () => {
    it('should seed module settings from catalog during initialization', () => {
      serverModuleCatalog.register({ id: 'home', name: 'Home', enabled: true, canDisable: false, version: '1.0' });
      serverModuleCatalog.register({ id: 'tasks', name: 'Tasks', enabled: true, canDisable: true, version: '1.0' });
      
      storage.initialize(serverModuleCatalog.listAll(), true);
      const data = storage.getData();
      
      expect(data.moduleSettings.home).toBeDefined();
      expect(data.moduleSettings.tasks).toBeDefined();
      expect(data.moduleSettings.tasks.enabled).toBe(true);
    });
  });

  describe('2. Navigation Service & Module Registry Invariants', () => {
    it('registers the packaged Task module once through the canonical LocalModuleRegistry', () => {
      registerPackagedClientModules();

      expect(packagedClientModules.filter(module => module.id === 'tasks')).toHaveLength(1);
      expect(moduleRegistry.listAll().filter(module => module.id === 'tasks')).toHaveLength(1);
      expect(moduleRegistry.resolve('home')).toBeDefined();
      expect(moduleRegistry.resolve('settings')).toBeDefined();
    });

    it('should resolve primary route from ModuleRegistry (ID != Route)', () => {
      moduleRegistry.register({
        id: 'work-management',
        version: '1.0',
        meta: { name: 'Work' },
        routes: [{ path: '/tasks', component: () => null }],
        navigation: []
      });

      const route = moduleRegistry.getPrimaryRoute('work-management');
      expect(route).toBe('/tasks');
    });

    it('getPrimaryRoute should NOT invent routes and return / if no routes defined', () => {
      moduleRegistry.register({
        id: 'no-route-mod',
        version: '1.0',
        meta: { name: 'No Route' },
        routes: []
      });

      expect(moduleRegistry.getPrimaryRoute('no-route-mod')).toBe('/');
    });

    it('navigationService.openModule should resolve and navigate to primary route', () => {
      const navigateSpy = vi.fn();
      navigationService.setNavigateFn(navigateSpy);

      moduleRegistry.register({
        id: 'work-management',
        version: '1.0',
        meta: { name: 'Work' },
        routes: [{ path: '/tasks', component: () => null }],
        navigation: []
      });

      navigationService.openModule('work-management');
      expect(navigateSpy).toHaveBeenCalledWith('/tasks');
    });
  });

  describe('3. Security & Permission Enforcement', () => {
    const mockUser = {
      id: 'usr_1',
      email: 'user@test.local',
      name: 'User',
      roles: ['user'],
      permissions: ['tasks.read']
    };

    const mockContext: ExecutionContext = {
      user: mockUser,
      appContext: { 
        user: mockUser,
        activeModule: 'tasks',
        availableCapabilities: ['tasks.read.data']
      },
      confirmed: false
    };

    beforeEach(() => {
      serverModuleCatalog.register({ id: 'tasks', name: 'Tasks', enabled: true, canDisable: true, version: '1.0' });
      storage.initialize(serverModuleCatalog.listAll(), true);
    });

    it('should REJECT execution if module is disabled', async () => {
      ServerCapabilityRegistry.register({
        id: 'tasks.read.data',
        moduleId: 'tasks',
        description: 'Read',
        inputSchema: z.object({}),
        risk: 'low',
        permissions: ['tasks.read'],
        execute: async () => ({})
      });

      storage.getData().moduleSettings.tasks.enabled = false;
      const res = await ServerCapabilityRegistry.execute('tasks.read.data', {}, mockContext);
      expect(res.success).toBe(false);
      expect(res.error).toContain('disabled');
    });

    it('should NOT list capabilities if user lacks permissions', async () => {
      ServerCapabilityRegistry.register({
        id: 'tasks.write.data',
        moduleId: 'tasks',
        description: 'Write',
        inputSchema: z.object({}),
        risk: 'medium',
        permissions: ['tasks.write'],
        execute: async () => ({})
      });

      const caps = await ServerCapabilityRegistry.listForContext(mockContext);
      expect(caps.find(c => c.id === 'tasks.write.data')).toBeUndefined();
    });

    it('should REJECT execution if user lacks permissions', async () => {
      ServerCapabilityRegistry.register({
        id: 'tasks.write.data',
        moduleId: 'tasks',
        description: 'Write',
        inputSchema: z.object({}),
        risk: 'medium',
        permissions: ['tasks.write'],
        execute: async () => ({})
      });

      const res = await ServerCapabilityRegistry.execute('tasks.write.data', {}, mockContext);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unauthorized');
    });

    it('should REJECT execution if high-risk and not confirmed', async () => {
      ServerCapabilityRegistry.register({
        id: 'tasks.delete',
        moduleId: 'tasks',
        description: 'Delete',
        inputSchema: z.object({ id: z.string() }),
        risk: 'high',
        permissions: ['tasks.delete'],
        execute: async () => ({})
      });

      const res = await ServerCapabilityRegistry.execute('tasks.delete', { id: '1' }, {
        ...mockContext,
        user: { ...mockUser, permissions: ['tasks.delete'] }
      });

      expect(res.success).toBe(false);
      expect(res.requiresConfirmation).toBe(true);
    });

    it('module toggle should require module.manage permission', async () => {
      // This is more of an integration test for server.ts logic, 
      // but we can test the PermissionResolver part.
      const res = PermissionResolver.checkPermission(['module.manage'], mockContext);
      expect(res.authorized).toBe(false);
    });
  });

  describe('4. Tool Naming & Collisions (ADK Preflight)', () => {
    it('should generate unique names for colliding sanitized IDs', () => {
      const id1 = 'a.b';
      const id2 = 'a_b';

      const name1 = CapabilityToolNameRegistry.getToolName(id1);
      const name2 = CapabilityToolNameRegistry.getToolName(id2);

      expect(name1).not.toBe(name2);
      expect(CapabilityToolNameRegistry.getCapabilityId(name1)).toBe(id1);
      expect(CapabilityToolNameRegistry.getCapabilityId(name2)).toBe(id2);
    });

    it('should generate deterministic names', () => {
      const id = 'my.module.do_work';
      const name1 = CapabilityToolNameRegistry.getToolName(id);
      const name2 = CapabilityToolNameRegistry.getToolName(id);
      expect(name1).toBe(name2);
    });
    
    it('should handle names starting with numbers', () => {
      const id = '123.tool';
      const name = CapabilityToolNameRegistry.getToolName(id);
      expect(/^[a-zA-Z]/.test(name)).toBe(true);
    });
  });

  describe('5. Packaged module lifecycle ordering and isolation', () => {
    it('Task contributions disappear on disable and return on re-enable after persistence', async () => {
      registerPackagedClientModules();
      const user = {
        id: 'owner-1',
        email: 'owner@test.local',
        name: 'Owner',
        roles: ['owner'],
        permissions: ['tasks.read', 'settings.read'],
      };
      const persisted = vi.fn(async () => undefined);
      const statusEvents: Array<{ moduleId: string; enabled: boolean }> = [];
      const unsubscribe = eventBus.on('module.statusChanged', (payload: any) => {
        if (payload.moduleId === 'tasks') statusEvents.push(payload);
      });

      expect(moduleRegistry.getNavigation(user).some(item => item.id === 'tasks-nav')).toBe(true);
      expect(moduleRegistry.getRoutes(user).some(route => route.path === '/tasks')).toBe(true);
      expect(moduleRegistry.getWidgets(user).some(widget => widget.id === 'tasks-stats')).toBe(true);

      await moduleRegistry.setEnabled('tasks', false, persisted);

      expect(moduleRegistry.isEnabled('tasks')).toBe(false);
      expect(moduleRegistry.getNavigation(user).some(item => item.id === 'tasks-nav')).toBe(false);
      expect(moduleRegistry.getRoutes(user).some(route => route.path === '/tasks')).toBe(false);
      expect(moduleRegistry.getWidgets(user).some(widget => widget.id === 'tasks-stats')).toBe(false);
      expect(moduleRegistry.getNavigation(user).some(item => item.id === 'home-nav')).toBe(true);
      expect(moduleRegistry.getNavigation(user).some(item => item.id === 'settings-nav')).toBe(true);

      await moduleRegistry.setEnabled('tasks', true, persisted);

      expect(moduleRegistry.isEnabled('tasks')).toBe(true);
      expect(moduleRegistry.getNavigation(user).some(item => item.id === 'tasks-nav')).toBe(true);
      expect(moduleRegistry.getRoutes(user).some(route => route.path === '/tasks')).toBe(true);
      expect(moduleRegistry.getWidgets(user).some(widget => widget.id === 'tasks-stats')).toBe(true);
      expect(persisted).toHaveBeenCalledTimes(2);
      expect(statusEvents.map(event => event.enabled)).toEqual([false, true]);
      unsubscribe();
    });

    it('runs lifecycle before persistence and does not commit failed lifecycle state', async () => {
      const order: string[] = [];
      const statusEvents: any[] = [];
      const unsubscribe = eventBus.on('module.statusChanged', (payload: any) => {
        if (payload.moduleId === 'lifecycle-ordering') statusEvents.push(payload);
      });
      moduleRegistry.register({
        id: 'lifecycle-ordering',
        version: '1.0.0',
        meta: { name: 'Lifecycle ordering' },
        routes: [],
        lifecycle: {
          onDisable: async () => { order.push('lifecycle'); },
        },
      });

      await moduleRegistry.setEnabled('lifecycle-ordering', false, async () => { order.push('persist'); });
      expect(order).toEqual(['lifecycle', 'persist']);
      expect(moduleRegistry.isEnabled('lifecycle-ordering')).toBe(false);
      expect(statusEvents).toEqual([{ moduleId: 'lifecycle-ordering', enabled: false }]);

      moduleRegistry.register({
        id: 'lifecycle-failure',
        version: '1.0.0',
        meta: { name: 'Lifecycle failure' },
        routes: [],
        lifecycle: {
          onDisable: async () => { throw new Error('disable failed'); },
        },
      });
      const failedStatusEvents: any[] = [];
      const unsubscribeFailure = eventBus.on('module.statusChanged', (payload: any) => {
        if (payload.moduleId === 'lifecycle-failure') failedStatusEvents.push(payload);
      });
      const persistAfterFailure = vi.fn(async () => undefined);

      await expect(moduleRegistry.setEnabled('lifecycle-failure', false, persistAfterFailure)).rejects.toThrow('disable failed');
      expect(moduleRegistry.isEnabled('lifecycle-failure')).toBe(true);
      expect(persistAfterFailure).not.toHaveBeenCalled();
      expect(failedStatusEvents).toEqual([]);
      unsubscribe();
      unsubscribeFailure();
    });
  });
});
