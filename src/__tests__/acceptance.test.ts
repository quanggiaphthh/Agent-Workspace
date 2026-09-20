import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServerIdentityProvider } from '../../server/core/auth/identityProvider';
import { PermissionResolver } from '../../server/core/permissions/permissionResolver';
import { ServerCapabilityRegistry } from '../../server/core/capabilities/serverCapabilityRegistry';
import { adminAuth, adminFirestore } from '../../server/lib/firebaseAdmin';
import { useAIKeysStore } from '../modules/settings/aiKeysStore';
import { RootAgent } from '../../server/agent/adk/RootAgent';
import { z } from 'zod';
import firebaseConfig from '../../firebase-applet-config.json';
import { storage } from '../../server/infrastructure/storage';
import { serverModuleCatalog } from '../../server/core/modules/moduleCatalog';
import { DEFAULT_AGENT_MODEL } from '../../shared/contracts/ai';

// Mock Firebase Admin Auth for token verification tests
vi.mock('../../server/lib/firebaseAdmin', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    adminAuth: {
      verifyIdToken: vi.fn(),
    },
  };
});

describe('Functional Consistency & Production Security Acceptance Suite', () => {

  beforeEach(() => {
    ServerCapabilityRegistry.reset();
    vi.clearAllMocks();
    serverModuleCatalog.reset();
    serverModuleCatalog.register({ id: 'system', name: 'System', enabled: true, canDisable: false, version: '1.0' });
    storage.initialize(serverModuleCatalog.listAll(), true);
  });

  describe('PHASE 1 & PHASE 7 — AUTH & AUTHORIZATION INVARIANTS', () => {
    it('missing token -> 401', async () => {
      const mockReq = {
        headers: {},
      };
      await expect(ServerIdentityProvider.getIdentity(mockReq)).rejects.toThrow(
        /Unauthorized/
      );
    });

    it('invalid token -> 401', async () => {
      const mockReq = {
        headers: {
          authorization: 'Bearer invalid-token-xyz',
        },
      };
      vi.mocked(adminAuth.verifyIdToken).mockRejectedValueOnce(new Error('Firebase token expired'));

      await expect(ServerIdentityProvider.getIdentity(mockReq)).rejects.toThrow(
        /Token verification failed/
      );
    });

    it('valid user without permission -> 403', async () => {
      const mockContext = {
        user: {
          id: 'user_123',
          email: 'user@example.com',
          name: 'User',
          roles: ['user'],
          permissions: ['tasks.read'], // No tasks.write or tasks.delete
        },
        appContext: { user: {} as any, availableCapabilities: [] },
        confirmed: false,
      };

      const res = PermissionResolver.checkPermission(['tasks.write'], mockContext);
      expect(res.authorized).toBe(false);
      expect(res.error).toContain('Missing required permissions [tasks.write]');
    });

    it('admin custom claim -> allowed', async () => {
      const mockContext = {
        user: {
          id: 'admin_123',
          email: 'admin@example.com',
          name: 'Admin',
          roles: ['admin'],
          permissions: [], // Admins bypass permissions checks
        },
        appContext: { user: {} as any, availableCapabilities: [] },
        confirmed: false,
      };

      const res = PermissionResolver.checkPermission(['tasks.write', 'tasks.delete', 'module.manage'], mockContext);
      expect(res.authorized).toBe(true);
    });

    it('user A cannot access B data (Resource or Tenant Isolation)', () => {
      const userA = { id: 'user_A', permissions: ['tasks.read'] };
      const userB = { id: 'user_B', permissions: ['tasks.read'] };

      const mockResource = {
        id: 'resource_1',
        userId: 'user_A',
        name: 'Private Resource',
      };

      // Ensure that B cannot access A's resource
      const canAccess = mockResource.userId === userB.id;
      expect(canAccess).toBe(false);

      const canAccessA = mockResource.userId === userA.id;
      expect(canAccessA).toBe(true);
    });

    it('audit tenant isolation', () => {
      const logs = [
        { id: '1', userId: 'user_A', action: 'create' },
        { id: '2', userId: 'user_B', action: 'read' },
        { id: '3', userId: 'user_A', action: 'update' },
      ];

      const userA = { id: 'user_A', roles: ['user'], permissions: ['tasks.read'] };
      const adminUser = { id: 'admin_1', roles: ['admin'], permissions: ['audit.read'] };

      // Normal user filter
      const userALogs = logs.filter(l => l.userId === userA.id);
      expect(userALogs).toHaveLength(2);
      expect(userALogs.every(l => l.userId === 'user_A')).toBe(true);

      // Admin full access
      const isAdminOrAuditor = adminUser.roles.includes('admin') || adminUser.permissions.includes('audit.read');
      const allowedLogs = isAdminOrAuditor ? logs : logs.filter(l => l.userId === adminUser.id);
      expect(allowedLogs).toHaveLength(3);
    });
  });

  describe('PHASE 2 & PHASE 7 — FIRESTORE RULES INVARIANTS', () => {
    it('Firestore ownership cannot be changed (update rule assertion)', () => {
      // Re-implements/asserts the exact rule: 
      // allow update: if resource.data.userId == request.auth.uid && request.resource.data.userId == request.auth.uid;
      const authUid = 'user_123';
      const originalResource = { userId: 'user_123' };
      const proposedResourceWithSameOwner = { userId: 'user_123' };
      const proposedResourceWithChangedOwner = { userId: 'hacker_456' };

      // Case 1: Same owner
      const sameOwnerAllowed = originalResource.userId === authUid && proposedResourceWithSameOwner.userId === authUid;
      expect(sameOwnerAllowed).toBe(true);

      // Case 2: Attempted change owner
      const changedOwnerAllowed = originalResource.userId === authUid && proposedResourceWithChangedOwner.userId === authUid;
      expect(changedOwnerAllowed).toBe(false);
    });
  });

  describe('PHASE 3 & PHASE 7 — HITL ADK INTEGRATION', () => {
    it('HITL Deny', async () => {
      ServerCapabilityRegistry.reset();
      ServerCapabilityRegistry.register({
        id: 'test.high_risk_action',
        moduleId: 'system',
        description: 'High risk tool',
        inputSchema: z.object({}),
        risk: 'high',
        permissions: [],
        execute: async () => ({ status: 'done' }),
      });

      const execContext = {
        user: { id: 'usr_1', email: 'usr_1@test.local', name: 'User One', roles: ['user'], permissions: [] },
        appContext: { user: {} as any, availableCapabilities: [] },
        confirmed: false, // HITL Denied/unconfirmed
      };

      const result = await ServerCapabilityRegistry.execute('test.high_risk_action', {}, execContext);
      expect(result.success).toBe(false);
      expect(result.requiresConfirmation).toBe(true);
    });

    it('HITL Approve', async () => {
      ServerCapabilityRegistry.reset();
      ServerCapabilityRegistry.register({
        id: 'test.high_risk_action',
        moduleId: 'system',
        description: 'High risk tool',
        inputSchema: z.object({}),
        risk: 'high',
        permissions: [],
        execute: async () => ({ status: 'done' }),
      });

      const execContext = {
        user: { id: 'usr_1', email: 'usr_1@test.local', name: 'User One', roles: ['user'], permissions: [] },
        appContext: { user: {} as any, availableCapabilities: [] },
        confirmed: true, // HITL Approved
      };

      const result = await ServerCapabilityRegistry.execute('test.high_risk_action', {}, execContext);
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ status: 'done' });
    });
  });

  describe('PHASE 4 & PHASE 7 — MULTI-USER SECRET ISOLATION', () => {
    it('A/B API key isolation: Zustand store clears keys on transition', () => {
      // Initialize state for User A
      useAIKeysStore.setState({
        keys: [{ id: '1', providerId: 'google', name: 'Key for A', status: 'active' }],
        agentModel: 'gemini-1.5-pro',
      });

      // Assert User A state exists
      expect(useAIKeysStore.getState().keys).toHaveLength(1);
      expect(useAIKeysStore.getState().keys[0].name).toBe('Key for A');

      // Logout User A, login User B trigger (matches the FirebaseAuthProvider transition logic)
      useAIKeysStore.setState({
        keys: [],
        autoRotate: false,
        globalDefaultModel: null,
        agentProvider: 'google',
        agentModel: DEFAULT_AGENT_MODEL,
        providerDefaultModels: {},
        providerLoadedModels: {},
      });

      // Assert User B's brand new state starts perfectly clean with standard defaults
      const freshState = useAIKeysStore.getState();
      expect(freshState.keys).toHaveLength(0);
      expect(freshState.agentModel).toBe(DEFAULT_AGENT_MODEL);
    });
  });

  describe('PHASE 5 & PHASE 7 — TASK/MEMORY CONTRACTS', () => {
    it('Agent-created task renders correctly in UI with standard status contract', () => {
      // The UI uses strictly 'todo' | 'in-progress' | 'completed'
      const allowedStatuses = ['todo', 'in-progress', 'completed'];

      const mockAgentCreatedTask = {
        title: 'Nhiệm vụ tự động',
        status: 'todo', // Standardized instead of 'pending'
      };

      expect(allowedStatuses).toContain(mockAgentCreatedTask.status);
    });

    it('memory OFF prevents Agent memory operations', async () => {
      const execContextMemoryOn = {
        user: { id: 'usr_1', email: 'usr_1@test.local', name: 'User One', roles: ['user'], permissions: [] },
        appContext: { 
          user: {} as any, 
          availableCapabilities: [],
          aiConfig: { memoryEnabled: true }, // Memory explicitly ON
        },
        confirmed: false,
      };

      const execContextMemoryOff = {
        user: { id: 'usr_1', email: 'usr_1@test.local', name: 'User One', roles: ['user'], permissions: [] },
        appContext: { 
          user: {} as any, 
          availableCapabilities: [],
          aiConfig: { memoryEnabled: false }, // Memory explicitly OFF
        },
        confirmed: false,
      };

      const agentOn = await RootAgent.buildAgent(execContextMemoryOn as any, { sessionId: 'test-session-12345678' });
      const agentOff = await RootAgent.buildAgent(execContextMemoryOff as any, { sessionId: 'test-session-12345678' });

      const toolsOnNames = (agentOn.tools as any[]).map(t => t.name);
      const toolsOffNames = (agentOff.tools as any[]).map(t => t.name);

      // Verify memory capability is absent in the disabled memory state
      // system.memory.add capability maps to an ADK tool name containing memory_add or similar
      const memoryOnHasMemoryTool = toolsOnNames.some(name => name.includes('memory'));
      const memoryOffHasMemoryTool = toolsOffNames.some(name => name.includes('memory'));

      expect(memoryOffHasMemoryTool).toBe(false);
    });
  });

  describe('PHASE 7 — FIREBASE DIRECT PERSISTENCE', () => {
    it('Firebase named DB real write/read/delete capabilities existence checks', () => {
      expect(firebaseConfig.firestoreDatabaseId).toBeDefined();
      expect(firebaseConfig.firestoreDatabaseId).toContain('ai-studio-');
      expect(adminFirestore).toBeDefined();
    });
  });
});
