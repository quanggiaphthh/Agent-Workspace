import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server';
import { adminAuth, adminFirestore } from '../../server/lib/firebaseAdmin';
import { RootAgent } from '../../server/agent/adk/RootAgent';
import { AuditService } from '../../server/core/audit/auditService';
import { CapabilityExecutionService } from '../../server/core/capabilities/CapabilityExecutionService';
import { CredentialService } from '../../server/core/ai/CredentialService';
import { fileIngestionService } from '../../server/core/files/firebaseFileStores';
import { MAX_FILE_BYTES } from '../../server/core/files/filePolicy';

const testMocks = vi.hoisted(() => ({
  persistenceProbe: vi.fn(),
  firestoreProbe: vi.fn(),
}));

// Mock Firebase Admin Auth
vi.mock('../../server/lib/firebaseAdmin', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    adminAuth: {
      verifyIdToken: vi.fn(),
    },
    probeFirestoreAdmin: testMocks.firestoreProbe,
    // Firestore-backed collaborators are mocked at their domain boundaries below
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
        probePersistenceHealth: testMocks.persistenceProbe,
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

  beforeAll(() => {
    vi.spyOn(AuditService, 'probeHealth').mockResolvedValue({ status: 'ok', backend: 'firestore', durationMs: 0 });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    testMocks.persistenceProbe.mockResolvedValue({ status: 'ok', mode: 'persistent', backend: 'firestore', degraded: false });
    testMocks.firestoreProbe.mockResolvedValue({ status: 'ok', backend: 'firestore', durationMs: 0 });
  });


  describe('HEALTH — PERSISTENCE PROBE', () => {
    it('reports healthy persistence only when the real probe succeeds', async () => {
      const res = await request(app).get('/api/health');
      expect(testMocks.persistenceProbe).toHaveBeenCalledTimes(1);
      expect(res.body.components.session.status).toBe('ok');
    });

    it('does not return a false PASS when the persistence probe reports failure', async () => {
      testMocks.persistenceProbe.mockResolvedValueOnce({
        status: 'error', mode: 'unavailable', backend: 'firestore', degraded: false, lastError: 'probe failed',
      });
      const res = await request(app).get('/api/health');
      expect(testMocks.persistenceProbe).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
      expect(res.body.components.session.status).toBe('error');
    });
  });

  describe('AUTHORIZATION ORDER — CREDENTIAL ROUTES', () => {
    it('rejects unauthenticated model requests before credential resolution', async () => {
      const resolveSpy = vi.spyOn(CredentialService, 'resolveCredential');
      try {
        const res = await request(app).get('/api/ai/models?providerId=google&credentialId=system');
        expect(res.status).toBe(401);
        expect(resolveSpy).not.toHaveBeenCalled();
      } finally {
        resolveSpy.mockRestore();
      }
    });

    it('lets an authenticated owner reach credential resolution and receive the credential error', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(mockUserA as any);
      const unavailable = Object.assign(new Error('System credential is unavailable.'), {
        code: 'SYSTEM_CREDENTIAL_UNAVAILABLE', status: 400,
      });
      const resolveSpy = vi.spyOn(CredentialService, 'resolveCredential').mockRejectedValue(unavailable);
      try {
        const res = await request(app)
          .get('/api/ai/models?providerId=google&credentialId=system')
          .set('Authorization', 'Bearer token_A');
        expect(res.status).toBe(400);
        expect(resolveSpy).toHaveBeenCalledWith(mockUserA.uid, 'google', 'system');
      } finally {
        resolveSpy.mockRestore();
      }
    });
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
    it('Verified user receives canonical owner permissions before route validation', async () => {
      // Custom claims cannot remove the canonical owner permission baseline in this private single-user app.
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({
        ...mockUserA,
        permissions: ['tasks.read']
      } as any);

      const res = await request(app)
        .post('/api/modules/home/toggle')
        .set('Authorization', 'Bearer token_A')
        .send({});
      
      expect(res.status).toBe(400);
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

  describe('GD2 L2 — STRICT AGENT CHAT REQUEST CONTRACT', () => {
    it('rejects malformed chat body with 400 and never starts RootAgent', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(mockUserA as any);
      const buildAgentSpy = vi.spyOn(RootAgent, 'buildAgent');
      try {
        const res = await request(app)
          .post('/api/agent/chat')
          .set('Authorization', 'Bearer token_A')
          .send({ messages: [] });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_CHAT_REQUEST');
        expect(JSON.stringify(res.body)).not.toContain('Xin chào');
        expect(buildAgentSpy).not.toHaveBeenCalled();
      } finally {
        buildAgentSpy.mockRestore();
      }
    });

    it('preserves a deterministic credential failure code before streaming', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(mockUserA as any);
      const failure = Object.assign(new Error('No usable Gemini credential is available.'), { status: 503, code: 'CREDENTIAL_UNAVAILABLE' });
      const buildAgentSpy = vi.spyOn(RootAgent, 'buildAgent').mockRejectedValue(failure);
      try {
        const res = await request(app)
          .post('/api/agent/chat')
          .set('Authorization', 'Bearer token_A')
          .send({ message: 'hello' });
        expect(res.status).toBe(503);
        expect(res.body.code).toBe('CREDENTIAL_UNAVAILABLE');
        expect(res.body.error).toMatch(/credential/i);
      } finally {
        buildAgentSpy.mockRestore();
      }
    });

    it('does not execute Agent when authentication fails', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockRejectedValue(Object.assign(new Error('Invalid token'), { status: 401 }));
      const buildAgentSpy = vi.spyOn(RootAgent, 'buildAgent');
      try {
        const res = await request(app).post('/api/agent/chat').send({ message: 'hello' });
        expect(res.status).toBe(401);
        expect(buildAgentSpy).not.toHaveBeenCalled();
      } finally {
        buildAgentSpy.mockRestore();
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

  describe('GĐ4 LƯỢT 2 — SECURE FILE INGESTION ROUTE', () => {
    const uploadedFile = {
      fileId: 'server-file-id', ownerId: 'user_A', originalName: 'report.pdf',
      mimeType: 'application/pdf' as const, sizeBytes: 14, status: 'ready' as const, createdAt: '2026-09-21T00:00:00.000Z',
    };

    beforeEach(() => {
      vi.spyOn(AuditService, 'log').mockResolvedValue({} as any);
    });

    it('uses the canonical ingestion service and server identity, ignoring spoofed request metadata', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(mockUserA as any);
      const ingestSpy = vi.spyOn(fileIngestionService, 'ingest').mockResolvedValue(uploadedFile);
      try {
        const response = await request(app)
          .post('/api/files')
          .set('Authorization', 'Bearer token_A')
          .set('Content-Type', 'application/pdf')
          .set('X-File-Name', 'report.pdf')
          .set('X-Owner-Id', 'attacker')
          .set('X-File-Id', 'client-file-id')
          .set('X-Storage-Key', '../../escape')
          .send(Buffer.from('%PDF-1.7\nhello'));

        expect(response.status).toBe(201);
        expect(response.body.file).toEqual(uploadedFile);
        expect(ingestSpy).toHaveBeenCalledWith(mockUserA.uid, expect.objectContaining({
          originalName: 'report.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.7\nhello'),
        }));
        expect(ingestSpy.mock.calls[0][1]).not.toHaveProperty('clientMetadata');
      } finally {
        ingestSpy.mockRestore();
      }
    });

    it('rejects an actual oversized raw body before it reaches ingestion', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(mockUserA as any);
      const ingestSpy = vi.spyOn(fileIngestionService, 'ingest');
      try {
        const response = await request(app)
          .post('/api/files')
          .set('Authorization', 'Bearer token_A')
          .set('Content-Type', 'application/pdf')
          .set('X-File-Name', 'large.pdf')
          .send(Buffer.alloc(MAX_FILE_BYTES + 1, 0x41));

        expect(response.status).toBe(413);
        expect(response.body.code).toBe('FILE_TOO_LARGE');
        expect(ingestSpy).not.toHaveBeenCalled();
      } finally {
        ingestSpy.mockRestore();
      }
    });

    it('passes an empty binary upload through ingestion for deterministic validation', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(mockUserA as any);
      const ingestSpy = vi.spyOn(fileIngestionService, 'ingest');
      try {
        const response = await request(app)
          .post('/api/files')
          .set('Authorization', 'Bearer token_A')
          .set('Content-Type', 'application/pdf')
          .set('X-File-Name', 'empty.pdf');

        expect(response.status).toBe(400);
        expect(response.body.code).toBe('EMPTY_FILE');
        expect(ingestSpy).toHaveBeenCalledTimes(1);
      } finally {
        ingestSpy.mockRestore();
      }
    });
  });
});
