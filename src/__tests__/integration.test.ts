import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server';
import { adminAuth, adminFirestore } from '../../server/lib/firebaseAdmin';
import { RootAgent } from '../../server/agent/adk/RootAgent';
import { AuditService } from '../../server/core/audit/auditService';
import { CapabilityExecutionService } from '../../server/core/capabilities/CapabilityExecutionService';
import { CredentialService } from '../../server/core/ai/CredentialService';
import { fileIngestionService } from '../../server/core/files/firebaseFileStores';
import { MAX_FILE_BYTES } from '../../server/core/files/filePolicy';
import { DOCX_MIME_TYPE } from '../../shared/contracts/fileUploadPolicy';
import { createHash, randomUUID } from 'crypto';
import { readFile } from 'node:fs/promises';
import { ZipWriter, TextReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { LocalDocumentProcessor } from '../../server/modules/document-formatting/localDocumentProcessor';
import { CapabilityConfirmationService } from '../../server/core/capabilities/CapabilityConfirmationService';
import { evaluateConfirmationRecord, hashCapabilityInput } from '../../server/core/capabilities/CapabilityConfirmationPolicy';
import { CapabilityExecutionIdempotencyService, type MutationExecutionRecord } from '../../server/core/capabilities/CapabilityExecutionService';
import { storage } from '../../server/infrastructure/storage';
import { userFileService } from '../../server/core/files/firebaseFileStores';

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

  const originalOwnerUid = process.env.OWNER_UID;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(() => {
    vi.spyOn(AuditService, 'probeHealth').mockResolvedValue({ status: 'ok', backend: 'firestore', durationMs: 0 });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OWNER_UID;
    process.env.NODE_ENV = 'test';
    testMocks.persistenceProbe.mockResolvedValue({ status: 'ok', mode: 'persistent', backend: 'firestore', degraded: false });
    testMocks.firestoreProbe.mockResolvedValue({ status: 'ok', backend: 'firestore', durationMs: 0 });
  });

  afterAll(() => {
    if (originalOwnerUid === undefined) delete process.env.OWNER_UID;
    else process.env.OWNER_UID = originalOwnerUid;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
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

  describe('Document Formatting V1 temporary binary routes', () => {
    const originalReleaseApproval = process.env.DOCUMENT_FORMATTING_V1_RELEASE_APPROVED;
    const inputBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x11, 0x22]);
    const outputBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x33, 0x44]);
    const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

    class MemoryExecutionRepo {
      records = new Map<string, MutationExecutionRecord>();
      async claim(record: MutationExecutionRecord): Promise<any> {
        const existing = this.records.get(record.executionId);
        if (existing?.state === 'SUCCEEDED') return { kind: 'succeeded', record: existing };
        if (existing) return { kind: 'running', record: existing };
        this.records.set(record.executionId, record);
        return { kind: 'claimed', record };
      }
      async succeed(id: string, result: any) { Object.assign(this.records.get(id)!, { state: 'SUCCEEDED', result }); }
      async fail(id: string, failureKind: any, errorCode: string) { Object.assign(this.records.get(id)!, { state: 'FAILED', failureKind, errorCode }); }
    }

    beforeEach(async () => {
      process.env.DOCUMENT_FORMATTING_V1_RELEASE_APPROVED = 'true';
      await storage.setModuleEnabled('document-formatting', true);
      vi.spyOn(AuditService, 'log').mockResolvedValue({ id: 'doc-audit' } as any);
      vi.spyOn(AuditService, 'update').mockResolvedValue();
      CapabilityExecutionIdempotencyService.setRepositoryForTests(new MemoryExecutionRepo() as any);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      CapabilityExecutionIdempotencyService.resetRepositoryForTests();
    });

    afterAll(async () => {
      await storage.setModuleEnabled('document-formatting', false);
      CapabilityExecutionIdempotencyService.resetRepositoryForTests();
      if (originalReleaseApproval === undefined) delete process.env.DOCUMENT_FORMATTING_V1_RELEASE_APPROVED;
      else process.env.DOCUMENT_FORMATTING_V1_RELEASE_APPROVED = originalReleaseApproval;
    });

    it('keeps discovery disabled and rejects module enablement until release approval is configured', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(mockUserA as any);
      await storage.setModuleEnabled('document-formatting', false);
      process.env.DOCUMENT_FORMATTING_V1_RELEASE_APPROVED = 'false';

      const list = await request(app).get('/api/modules').set('Authorization', 'Bearer token_A');
      expect(list.status).toBe(200);
      expect(list.body.find((module: any) => module.id === 'document-formatting').enabled).toBe(false);

      const enable = await request(app)
        .post('/api/modules/document-formatting/toggle')
        .set('Authorization', 'Bearer token_A')
        .send({ enabled: true });
      expect(enable.status).toBe(409);
      expect(enable.body.code).toBe('DOCUMENT_FORMATTING_RELEASE_GATE_CLOSED');
      expect(storage.getData().moduleSettings['document-formatting'].enabled).toBe(false);
    });

    it('inspects in request scope and keeps paragraph text out of durable audit and file stores', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ ...mockUserA, permissions: ['files.read', 'files.write'] } as any);
      const privateText = 'DOCX PRIVATE PARAGRAPH SENTINEL';
      const inspectSpy = vi.spyOn(LocalDocumentProcessor.prototype, 'inspect').mockResolvedValue({
        sourceSha256: digest(inputBytes), profile: 'generic-direct-alignment-spike', safeToMutate: true, packagePolicy: 'NORMAL',
        paragraphs: [{ paragraphId: 'p1', text: privateText, directAlignment: 'LEFT', issueId: null }],
        paragraphsTruncated: false, diagnostics: [],
      } as any);
      const ingestSpy = vi.spyOn(fileIngestionService, 'ingest');
      const storeSpy = vi.spyOn(userFileService, 'store');
      const auditPayloads: unknown[] = [];
      vi.mocked(AuditService.log).mockImplementation(async (payload: any) => { auditPayloads.push(payload); return { id: 'doc-audit' } as any; });
      vi.mocked(AuditService.update).mockImplementation(async (...args: any[]) => { auditPayloads.push(args); });
      try {
        const response = await request(app)
          .post('/api/document-formatting/inspect')
          .set('Authorization', 'Bearer token_A')
          .set('Content-Type', DOCX_MIME_TYPE)
          .set('X-File-Name', encodeURIComponent('private.docx'))
          .send(inputBytes);

        expect(response.status).toBe(200);
        expect(response.body.inspection.paragraphs[0].text).toBe(privateText);
        expect(inspectSpy).toHaveBeenCalledOnce();
        expect(ingestSpy).not.toHaveBeenCalled();
        expect(storeSpy).not.toHaveBeenCalled();
        expect(JSON.stringify(auditPayloads)).not.toContain(privateText);
        expect(inspectSpy.mock.calls[0][0].every(byte => byte === 0)).toBe(true);
      } finally {
        inspectSpy.mockRestore(); ingestSpy.mockRestore(); storeSpy.mockRestore();
      }
    });

    it('inspects a real Vietnamese DOCX through the HTTP route using the local worker', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ ...mockUserA, permissions: ['files.read', 'files.write'] } as any);
      const source = await readFile(new URL('../../server/modules/document-formatting/fixtures/24-vietnamese-rich.docx', import.meta.url));
      const storeSpy = vi.spyOn(userFileService, 'store');
      const ingestSpy = vi.spyOn(fileIngestionService, 'ingest');
      const response = await request(app)
        .post('/api/document-formatting/inspect')
        .set('Authorization', 'Bearer token_A')
        .set('Content-Type', DOCX_MIME_TYPE)
        .set('X-File-Name', 'vietnamese.docx')
        .send(source);
      expect(response.status).toBe(200);
      expect(response.body.inspection.sourceSha256).toBe(digest(source));
      expect(response.body.inspection.paragraphs.some((paragraph: any) => paragraph.text.includes('Việt'))).toBe(true);
      expect(storeSpy).not.toHaveBeenCalled();
      expect(ingestSpy).not.toHaveBeenCalled();
    });

    it('returns one-time automatic page output and an exact changes report without file storage', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ ...mockUserA, permissions: ['files.read', 'files.write'] } as any);
      const changes = [{ property: 'w:pgMar/@w:left', beforeTwips: 1400, afterTwips: 1701 }];
      const formatter = vi.spyOn(LocalDocumentProcessor.prototype, 'formatPage').mockResolvedValue({
        bytes: Buffer.from(outputBytes), sha256: digest(outputBytes), changes,
      });
      const storeSpy = vi.spyOn(userFileService, 'store');
      const ingestSpy = vi.spyOn(fileIngestionService, 'ingest');
      const response = await request(app)
        .post('/api/document-formatting/automatic')
        .set('Authorization', 'Bearer token_A')
        .set('Content-Type', DOCX_MIME_TYPE)
        .set('X-File-Name', 'sample.docx')
        .buffer(true)
        .parse((rawResponse, callback) => {
          const chunks: Buffer[] = [];
          rawResponse.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          rawResponse.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .send(inputBytes);
      expect(response.status).toBe(200);
      expect(Buffer.from(response.body)).toEqual(outputBytes);
      expect(response.headers['x-document-output-sha256']).toBe(digest(outputBytes));
      expect(JSON.parse(Buffer.from(response.headers['x-document-changes'], 'base64url').toString('utf8'))).toEqual(changes);
      expect(response.headers['x-document-rule-profile']).toBe('nd30-page-v1');
      expect(formatter).toHaveBeenCalledOnce();
      expect(storeSpy).not.toHaveBeenCalled();
      expect(ingestSpy).not.toHaveBeenCalled();
      expect(formatter.mock.calls[0][0].every(byte => byte === 0)).toBe(true);
    });

    it('formats a real one-section DOCX through the HTTP route and preserves its Vietnamese text', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ ...mockUserA, permissions: ['files.read', 'files.write'] } as any);
      const entries = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Xin chào Việt Nam</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1000" w:bottom="1300" w:left="1400" w:right="1134"/></w:sectPr></w:body></w:document>',
      };
      const writer = new ZipWriter(new Uint8ArrayWriter(), { zip64: false });
      for (const [name, xml] of Object.entries(entries)) await writer.add(name, new TextReader(xml), { level: 6 });
      const source = Buffer.from(await writer.close());
      const storeSpy = vi.spyOn(userFileService, 'store');
      const response = await request(app)
        .post('/api/document-formatting/automatic')
        .set('Authorization', 'Bearer token_A')
        .set('Content-Type', DOCX_MIME_TYPE)
        .set('X-File-Name', 'mau.docx')
        .buffer(true)
        .parse((rawResponse, callback) => {
          const chunks: Buffer[] = [];
          rawResponse.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          rawResponse.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .send(source);
      expect(response.status).toBe(200);
      const output = Buffer.from(response.body);
      expect(response.headers['x-document-output-sha256']).toBe(digest(output));
      const changes = JSON.parse(Buffer.from(response.headers['x-document-changes'], 'base64url').toString('utf8'));
      expect(changes.map((change: any) => change.property)).toEqual([
        'w:pgSz/@w:w', 'w:pgSz/@w:h', 'w:pgMar/@w:top', 'w:pgMar/@w:left',
      ]);
      const inspection = await new LocalDocumentProcessor().inspect(output);
      expect(inspection.paragraphs[0].text).toBe('Xin chào Việt Nam');
      expect(storeSpy).not.toHaveBeenCalled();
      expect(JSON.stringify(vi.mocked(AuditService.log).mock.calls)).not.toContain('Xin chào Việt Nam');
    });

    it('refuses automatic page changes on a multi-section document without returning DOCX', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ ...mockUserA, permissions: ['files.read', 'files.write'] } as any);
      const source = await readFile(new URL('../../server/modules/document-formatting/fixtures/24-vietnamese-rich.docx', import.meta.url));
      const response = await request(app)
        .post('/api/document-formatting/automatic')
        .set('Authorization', 'Bearer token_A')
        .set('Content-Type', DOCX_MIME_TYPE)
        .set('X-File-Name', 'rich.docx')
        .send(source);
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('PACKAGE_NOT_MUTABLE');
      expect(response.headers['x-document-output-sha256']).toBeUndefined();
    });

    it('rejects /confirm requests when Idempotency-Key is missing or invalid', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ ...mockUserA, permissions: ['files.read', 'files.write'] } as any);
      const prepareSpy = vi.spyOn(CapabilityConfirmationService, 'prepare');
      const body = { sourceSha256: digest(inputBytes), paragraphId: 'p1', expectedBefore: 'LEFT', desiredAfter: 'CENTER' };

      const missing = await request(app)
        .post('/api/document-formatting/confirm')
        .set('Authorization', 'Bearer token_A')
        .send(body);
      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      const invalid = await request(app)
        .post('/api/document-formatting/confirm')
        .set('Authorization', 'Bearer token_A')
        .set('Idempotency-Key', 'short')
        .send(body);
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      expect(prepareSpy).not.toHaveBeenCalled();
    });

    it('returns a one-time confirmed DOCX binary with matching Idempotency-Key, rejects mismatched key, and fails closed on replay', async () => {
      vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ ...mockUserA, permissions: ['files.read', 'files.write'] } as any);

      const confirmationRecords = new Map<string, any>();
      vi.spyOn(CapabilityConfirmationService, 'prepare').mockImplementation(async (options: any) => {
        const confirmationId = `confirm-doc-${randomUUID()}`;
        const expiresAtMs = Date.now() + 60_000;
        const execution = options.executionContext || { source: 'rest' as const };
        const record = {
          confirmationId,
          userId: options.userId,
          capabilityId: options.capabilityId,
          inputHash: hashCapabilityInput(options.rawInput),
          createdAt: new Date().toISOString(),
          expiresAtMs,
          consumedAt: null,
          decision: 'pending',
          source: execution.source,
          sessionId: execution.sessionId,
          toolCallId: execution.toolCallId,
          logicalExecutionId: execution.logicalExecutionId,
          temporaryMode: execution.temporaryMode === true,
        };
        confirmationRecords.set(confirmationId, record);
        return { confirmationId, expiresAt: new Date(expiresAtMs).toISOString() };
      });

      vi.spyOn(CapabilityConfirmationService, 'consume').mockImplementation(async (options: any) => {
        const record = confirmationRecords.get(options.confirmationId);
        if (!record) return { ok: false, confirmationId: options.confirmationId, errorCode: 'CONFIRMATION_NOT_FOUND', errorSummary: 'Confirmation challenge was not found.' };
        const expected = {
          userId: options.userId,
          capabilityId: options.capabilityId,
          inputHash: hashCapabilityInput(options.rawInput),
          source: options.source,
          sessionId: options.sessionId,
          toolCallId: options.toolCallId,
          logicalExecutionId: options.logicalExecutionId,
        };
        const evaluation = evaluateConfirmationRecord(record, expected);
        if (!evaluation.ok) return { ok: false, confirmationId: options.confirmationId, errorCode: evaluation.errorCode, errorSummary: evaluation.errorSummary };
        record.consumedAt = new Date().toISOString();
        record.decision = 'approved';
        return { ok: true, confirmationId: options.confirmationId };
      });

      const inspectSpy = vi.spyOn(LocalDocumentProcessor.prototype, 'inspect').mockImplementation(async (bytes: Buffer) => ({
        sourceSha256: digest(bytes), profile: 'generic-direct-alignment-spike', safeToMutate: true, packagePolicy: 'NORMAL',
        paragraphs: [{ paragraphId: 'p1', text: 'PRIVATE_APPLY_TEXT', directAlignment: bytes.equals(outputBytes) ? 'CENTER' : 'LEFT', issueId: null }],
        paragraphsTruncated: false, diagnostics: [],
      } as any));
      const applySpy = vi.spyOn(LocalDocumentProcessor.prototype, 'applyAlignment').mockResolvedValue({ bytes: Buffer.from(outputBytes), sha256: digest(outputBytes) });
      const ingestSpy = vi.spyOn(fileIngestionService, 'ingest');
      const storeSpy = vi.spyOn(userFileService, 'store');
      const auditPayloads: unknown[] = [];
      vi.mocked(AuditService.log).mockImplementation(async (payload: any) => { auditPayloads.push(payload); return { id: 'doc-audit' } as any; });
      vi.mocked(AuditService.update).mockImplementation(async (...args: any[]) => { auditPayloads.push(args); });

      const boundKey = 'docfmt:test-bound-001';
      const mismatchedKey = 'docfmt:test-mismatched-999';

      try {
        const confirm = await request(app)
          .post('/api/document-formatting/confirm')
          .set('Authorization', 'Bearer token_A')
          .set('Idempotency-Key', boundKey)
          .send({ sourceSha256: digest(inputBytes), paragraphId: 'p1', expectedBefore: 'LEFT', desiredAfter: 'CENTER' });
        expect(confirm.status).toBe(409);
        expect(confirm.body.confirmationId).toBeTruthy();
        const confirmationId = confirm.body.confirmationId;

        // Verify logicalExecutionId was stored in the confirmation record
        const savedRecord = confirmationRecords.get(confirmationId);
        expect(savedRecord).toBeDefined();
        expect(savedRecord.logicalExecutionId).toBe(`rest:${boundKey}`);

        const baseHeaders = {
          Authorization: 'Bearer token_A',
          'Content-Type': DOCX_MIME_TYPE,
          'X-File-Name': encodeURIComponent('source.docx'),
          'X-Document-Source-Sha256': digest(inputBytes),
          'X-Document-Paragraph-Id': 'p1',
          'X-Document-Expected-Alignment': 'LEFT',
          'X-Document-Desired-Alignment': 'CENTER',
          'X-Confirmation-ID': confirmationId,
        };

        // Negative test: Applying with mismatched Idempotency-Key must fail and NOT call processor
        const mismatchedResponse = await request(app)
          .post('/api/document-formatting/apply')
          .set({ ...baseHeaders, 'Idempotency-Key': mismatchedKey })
          .send(inputBytes);
        expect(mismatchedResponse.status).toBe(409);
        expect(mismatchedResponse.body.code).toBe('CONFIRMATION_EXECUTION_MISMATCH');
        expect(applySpy).not.toHaveBeenCalled();

        // Positive test: Applying with matching Idempotency-Key succeeds
        const response = await request(app)
          .post('/api/document-formatting/apply')
          .set({ ...baseHeaders, 'Idempotency-Key': boundKey })
          .buffer(true)
          .parse((rawResponse, callback) => {
            const chunks: Buffer[] = [];
            rawResponse.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
            rawResponse.on('end', () => callback(null, Buffer.concat(chunks)));
          })
          .send(inputBytes);
        expect(response.status).toBe(200);
        expect(Buffer.from(response.body)).toEqual(outputBytes);
        expect(response.headers['content-type']).toContain(DOCX_MIME_TYPE);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(applySpy).toHaveBeenCalledOnce();

        // Replay test: Replaying with the same key fails closed
        const replay = await request(app)
          .post('/api/document-formatting/apply')
          .set({ ...baseHeaders, 'Idempotency-Key': boundKey })
          .send(inputBytes);
        expect(replay.status).toBe(409);
        expect(replay.body.code).toBe('CONFIRMATION_REPLAY');
        expect(applySpy).toHaveBeenCalledOnce(); // No second call
        expect(applySpy.mock.calls[0][0].bytes.every(byte => byte === 0)).toBe(true);
        expect(ingestSpy).not.toHaveBeenCalled();
        expect(storeSpy).not.toHaveBeenCalled();
        expect(JSON.stringify(auditPayloads)).not.toContain('PRIVATE_APPLY_TEXT');
      } finally {
        inspectSpy.mockRestore(); applySpy.mockRestore(); ingestSpy.mockRestore(); storeSpy.mockRestore();
      }
    });
  });
});
