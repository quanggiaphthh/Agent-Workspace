import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server';
import { adminAuth, adminFirestore } from '../../server/lib/firebaseAdmin';
import { RootAgent } from '../../server/agent/adk/RootAgent';
import { AuditService } from '../../server/core/audit/auditService';
import { CapabilityExecutionService } from '../../server/core/capabilities/CapabilityExecutionService';

// Mock Firebase Admin Auth
vi.mock('../../server/lib/firebaseAdmin', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    adminAuth: {
      verifyIdToken: vi.fn(),
    },
    // We'll use a real-ish firestore mock or real firestore if config exists
  };
});

// Mock FirestoreSessionService
vi.mock('../../server/agent/adk/FirestoreSessionService', () => {
  return {
    FirestoreSessionService: vi.fn().mockImplementation(function() {
      return {
        getOrCreateSession: vi.fn().mockResolvedValue({}),
        createSession: vi.fn().mockResolvedValue({}),
        getSession: vi.fn().mockResolvedValue({}),
        appendEvent: vi.fn().mockResolvedValue({}),
      };
    })
  };
});

describe('Production Integration & Security Suite', () => {
  
  const mockUserA = {
    uid: 'user_A',
    email: 'user_a@test.local',
    name: 'User A',
    email_verified: true,
  };

  const mockUserB = {
    uid: 'user_B',
    email: 'user_b@test.local',
    name: 'User B',
    email_verified: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PHASE C.1 & C.2 — AUTHENTICATION', () => {
    it('Missing token -> 401', async () => {
      const res = await request(app).get('/api/audit');
      expect(res.status).toBe(401);
    });

    it('Invalid token -> 401', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockRejectedValue(new Error('Invalid token'));
      const res = await request(app)
        .get('/api/audit')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
    });
  });

  describe('PHASE C.3 & C.4 — AUTHORIZATION & ISOLATION', () => {
    it('Normal user without module.manage -> 403', async () => {
      // Mock identity provider to return a user with only read permissions
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
        ...mockUserA,
        permissions: ['tasks.read']
      } as any);

      const res = await request(app)
        .post('/api/modules/home/toggle')
        .set('Authorization', 'Bearer token_A')
        .send({});
      
      expect(res.status).toBe(403);
    });

    it('User A data isolation from User B', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
        ...mockUserA,
        permissions: ['tasks.read'],
      } as any);
      const listSpy = vi.spyOn(AuditService, 'list').mockResolvedValue({
        items: [],
        nextCursor: undefined,
      });

      try {
        const res = await request(app)
          .get('/api/audit?userId=user_B&limit=25')
          .set('Authorization', 'Bearer token_A');

        expect(res.status).toBe(200);
        expect(listSpy).toHaveBeenCalledTimes(1);
        expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({
          limit: 25,
          userId: mockUserA.uid,
        }));
      } finally {
        listSpy.mockRestore();
      }
    });
  });

  describe('PHASE C.5 — IDENTITY SPOOFING', () => {
    it('stateDelta identity spoofing is stripped before RootAgent receives execution context', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(mockUserA as any);
      const sentinel = Object.assign(new Error('TEST_CONTEXT_CAPTURE_COMPLETE'), { status: 418 });
      const buildAgentSpy = vi.spyOn(RootAgent, 'buildAgent').mockRejectedValue(sentinel);

      try {
        const res = await request(app)
          .post('/api/agent/chat')
          .set('Authorization', 'Bearer token_A')
          .send({
            message: 'Who am I?',
            stateDelta: {
              user: { id: 'admin', roles: ['admin'] },
              userId: 'admin',
              roles: ['admin'],
              permissions: ['module.manage'],
              admin: true,
              confirmed: true,
            },
          });

        expect(res.status).toBe(418);
        expect(buildAgentSpy).toHaveBeenCalledTimes(1);
        const executionContext = buildAgentSpy.mock.calls[0][0] as any;
        expect(executionContext.user.id).toBe(mockUserA.uid);
        expect(executionContext.appContext.user.id).toBe(mockUserA.uid);
        expect(executionContext.appContext).not.toHaveProperty('userId');
        expect(executionContext.appContext).not.toHaveProperty('roles');
        expect(executionContext.appContext).not.toHaveProperty('permissions');
        expect(executionContext.appContext).not.toHaveProperty('admin');
        expect(executionContext.confirmed).toBe(false);
      } finally {
        buildAgentSpy.mockRestore();
      }
    });
  });

  describe('PHASE C.6 & C.7 — HITL E2E', () => {
    it('HITL HTTP flow ignores client confirmed and forwards server confirmationId', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
        ...mockUserA,
        permissions: ['tasks.delete'],
      } as any);
      const executeSpy = vi.spyOn(CapabilityExecutionService, 'execute')
        .mockResolvedValueOnce({
          success: false,
          risk: 'high',
          requiresConfirmation: true,
          errorCode: 'CONFIRMATION_REQUIRED',
          error: 'Server confirmation required.',
          confirmationId: 'confirm-test',
          confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        } as any)
        .mockResolvedValueOnce({
          success: true,
          risk: 'high',
          requiresConfirmation: false,
          result: { deleted: true },
          confirmationId: 'confirm-test',
        } as any);

      try {
        const pending = await request(app)
          .post('/api/capabilities/execute')
          .set('Authorization', 'Bearer token_A')
          .send({
            id: 'system.tasks.delete',
            input: { id: 'task-1' },
            confirmed: true,
            context: { confirmed: true, userId: 'admin' },
          });

        expect(pending.status).toBe(409);
        expect(pending.body.confirmationId).toBe('confirm-test');
        const firstContext = executeSpy.mock.calls[0][2] as any;
        const firstMeta = executeSpy.mock.calls[0][3] as any;
        expect(firstContext.confirmed).toBe(false);
        expect(firstContext.user.id).toBe(mockUserA.uid);
        expect(firstMeta.confirmationId).toBeUndefined();

        const confirmed = await request(app)
          .post('/api/capabilities/execute')
          .set('Authorization', 'Bearer token_A')
          .send({
            id: 'system.tasks.delete',
            input: { id: 'task-1' },
            confirmed: true,
            confirmationId: 'confirm-test',
            context: { confirmed: true, userId: 'admin' },
          });

        expect(confirmed.status).toBe(200);
        const secondContext = executeSpy.mock.calls[1][2] as any;
        const secondMeta = executeSpy.mock.calls[1][3] as any;
        expect(secondContext.confirmed).toBe(false);
        expect(secondContext.user.id).toBe(mockUserA.uid);
        expect(secondMeta.confirmationId).toBe('confirm-test');
      } finally {
        executeSpy.mockRestore();
      }
    });
  });

  describe('PHASE D — PRODUCTION GUARDS', () => {
    it('Security headers (helmet) are present', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-dns-prefetch-control']).toBeDefined();
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('JSON request size limit is enforced', async () => {
      const largeBody = 'x'.repeat(2 * 1024 * 1024); // 2MB
      const res = await request(app)
        .post('/api/log-error')
        .send({ data: largeBody });
      
      expect(res.status).toBe(413); // Payload Too Large
    });
  });
});
