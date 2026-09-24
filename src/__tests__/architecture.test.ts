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
});
