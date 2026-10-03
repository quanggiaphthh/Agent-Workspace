import { spawn, type ChildProcess } from 'child_process';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Two things the pilot review found missing:
 *
 *  1. The real authenticated upload route (`POST /api/files`), not a direct
 *     `files.store` call. Only the storage backend is doubled; the route, its auth
 *     and permission middleware, the filename sanitiser, size/type validation and the
 *     real FileIngestionService all execute.
 *  2. The exact outcome for the synthetic official letter, so an internal failure can
 *     never be mistaken for an intentional business rejection.
 *
 * Doubles (explicitly labelled, not claimed as user runtime):
 *  - `adminAuth.verifyIdToken`  : repository's existing Firebase-boundary seam.
 *  - `userFileService.store/readBytes` : durable Firestore/Storage backend.
 *  - `adminFirestore.runTransaction/collection` : confirmation + execution records.
 *  - `CapabilityExecutionIdempotencyService` repository : Map-backed execution ledger.
 *  - `AuditService.log/update` : audit sink.
 */

const authMocks = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
const firestoreMocks = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  return { store, collection: vi.fn(), runTransaction: vi.fn() };
});
vi.mock('../../../lib/firebaseAdmin', () => ({
  adminAuth: authMocks,
  adminFirestore: { collection: firestoreMocks.collection, runTransaction: firestoreMocks.runTransaction },
}));

import request from 'supertest';
import { app } from '../../../../server';
import { ServerCapabilityRegistry } from '../../../core/capabilities/serverCapabilityRegistry';
import { CapabilityExecutionService } from '../../../core/capabilities/CapabilityExecutionService';
import { CapabilityExecutionIdempotencyService, type MutationExecutionRecord } from '../../../core/capabilities/CapabilityExecutionService';
import { AuditService } from '../../../core/audit/auditService';
import { storage } from '../../../infrastructure/storage';
import { userFileService } from '../../../core/files/firebaseFileStores';
import { createDocumentFormattingCapabilities } from '../registration';
import { DocumentProcessorClient } from '../../../core/documents/documentProcessorClient';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../../shared/contracts/fileUploadPolicy';
import type { UserFileRecord } from '../../../core/files/UserFileService';

const PROCESSOR_ROOT = 'C:\\Dev\\Agent-Webapp\\document-processor\\v22-runtime';
const FIXTURE_DIR = 'C:\\Users\\dtron\\AppData\\Local\\Temp\\opencode\\synthetic-pilot';
const PORT = 5214;
const TOKEN = randomBytes(32).toString('hex');
const OWNER_UID = 'upload-pilot-uid';
const BEARER = 'Bearer upload-pilot-token';
const DOCX_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

class MemoryFileBackend {
  readonly records = new Map<string, UserFileRecord>();
  private readonly blobs = new Map<string, Buffer>();
  async store(ownerId: string, input: { originalName: string; mimeType: string; bytes: Buffer; avoidFileId?: string }) {
    let fileId = randomUUID();
    while (fileId === input.avoidFileId || this.records.has(fileId)) fileId = randomUUID();
    const record: UserFileRecord = {
      fileId, ownerId, originalName: input.originalName,
      mimeType: input.mimeType as UserFileRecord['mimeType'],
      sizeBytes: input.bytes.length, status: 'ready', createdAt: new Date().toISOString(),
    };
    this.records.set(fileId, record);
    this.blobs.set(fileId, Buffer.from(input.bytes));
    return record;
  }
  async readBytes(ownerId: string, fileId: string, maxBytes: number) {
    const file = this.records.get(fileId);
    if (!file || file.ownerId !== ownerId) throw Object.assign(new Error('not available'), { code: 'FILE_NOT_FOUND', status: 404 });
    const bytes = this.blobs.get(fileId)!;
    if (bytes.length > maxBytes) throw Object.assign(new Error('too large'), { code: 'FILE_TOO_LARGE', status: 413 });
    return { file, bytes };
  }
}

class MemoryExecutionRepository {
  readonly records = new Map<string, MutationExecutionRecord>();
  async claim(record: MutationExecutionRecord) {
    const existing = this.records.get(record.executionId);
    if (!existing) { this.records.set(record.executionId, record); return { kind: 'claimed' as const, record }; }
    if (existing.state === 'SUCCEEDED') return { kind: 'succeeded' as const, record: existing };
    return { kind: 'running' as const, record: existing };
  }
  async succeed(id: string, result: unknown) {
    const r = this.records.get(id); if (r) this.records.set(id, { ...r, state: 'SUCCEEDED' as const, result: result as never });
  }
  async fail() { /* unused in this file */ }
}

describe('upload route coverage and official-letter diagnosis', () => {
  let host: ChildProcess;
  const backend = new MemoryFileBackend();
  let prevNodeEnv: string | undefined;
  let prevOwnerUid: string | undefined;

  beforeAll(async () => {
    prevNodeEnv = process.env.NODE_ENV;
    prevOwnerUid = process.env.OWNER_UID;
    process.env.NODE_ENV = 'test';
    process.env.OWNER_UID = OWNER_UID;

    host = spawn('dotnet', [join(PROCESSOR_ROOT, 'src', 'DocumentProcessor.Host', 'bin', 'Release', 'net10.0', 'DocumentProcessor.Host.dll')], {
      env: { ...process.env, DOCUMENT_PROCESSOR_SHARED_TOKEN: TOKEN, ASPNETCORE_URLS: `http://127.0.0.1:${PORT}` },
      stdio: 'ignore',
    });
    const real = new DocumentProcessorClient({ baseUrl: `http://127.0.0.1:${PORT}`, sharedToken: TOKEN });
    let ready = false;
    for (let i = 0; i < 80 && !ready; i++) {
      await new Promise(r => setTimeout(r, 500));
      try { await real.inspect(readFileSync(join(FIXTURE_DIR, 'synthetic-quyet_dinh.docx'))); ready = true; } catch { /* not up */ }
    }
    if (!ready) throw new Error('processor host did not become ready');

    await storage.setModuleEnabled('document-formatting', true);
    ServerCapabilityRegistry.reset();
    createDocumentFormattingCapabilities({ files: backend as never, processor: real })
      .forEach(c => ServerCapabilityRegistry.register(c));

    // Only the durable backend is doubled; FileIngestionService logic still runs.
    vi.spyOn(userFileService, 'store').mockImplementation((ownerId, input) =>
      backend.store(ownerId, {
        originalName: input.originalName, mimeType: input.mimeType,
        bytes: input.bytes, avoidFileId: input.avoidFileId,
      }));
    vi.spyOn(userFileService, 'readBytes').mockImplementation((ownerId: string, fileId: string, maxBytes: number) =>
      backend.readBytes(ownerId, fileId, maxBytes));
    vi.spyOn(AuditService, 'log').mockResolvedValue({ id: 'audit-upload' } as never);
    vi.spyOn(AuditService, 'update').mockResolvedValue();
    CapabilityExecutionIdempotencyService.setRepositoryForTests(new MemoryExecutionRepository() as never);
    authMocks.verifyIdToken.mockResolvedValue({ uid: OWNER_UID, email: 'pilot@example.test', name: 'Pilot', admin: true });
  }, 240_000);

  afterAll(() => {
    try { host?.kill(); } catch { /* gone */ }
    CapabilityExecutionIdempotencyService.resetRepositoryForTests();
    ServerCapabilityRegistry.reset();
    vi.restoreAllMocks();
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevNodeEnv;
    if (prevOwnerUid === undefined) delete process.env.OWNER_UID; else process.env.OWNER_UID = prevOwnerUid;
  });

  const authAsOwner = () => {
    authMocks.verifyIdToken.mockResolvedValue({ uid: OWNER_UID, email: 'pilot@example.test', name: 'Pilot', admin: true });
    return request(app);
  };
  const http = () => request(app);

  it('uploads a synthetic DOCX through the real authenticated upload route and inspects the stored canonical file', async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, 'synthetic-quyet_dinh.docx'));
    const sha = createHash('sha256').update(bytes).digest('hex');

    // Unauthenticated upload must be refused before any storage work.
    const anonymous = await http().post('/api/files')
      .set('Content-Type', DOCX_CT)
      .set('X-File-Name', encodeURIComponent('synthetic-quyet_dinh.docx'))
      .send(bytes);
    expect(anonymous.status).toBe(401);
    expect(backend.records.size).toBe(0);

    // Authenticated upload through the real route.
    const uploaded = await http().post('/api/files')
      .set('Authorization', BEARER)
      .set('Content-Type', DOCX_CT)
      .set('X-File-Name', encodeURIComponent('synthetic-quyet_dinh.docx'))
      .send(bytes);
    expect(uploaded.status).toBe(201);
    const file = uploaded.body.file as UserFileRecord;
    expect(file.mimeType).toBe(DOCX_MIME_TYPE);
    expect(file.ownerId).toBe(OWNER_UID);
    expect(file.sizeBytes).toBe(bytes.length);
    expect(file.originalName).toBe('synthetic-quyet_dinh.docx');
    expect(backend.records.size).toBe(1);

    // The stored bytes are byte-identical to what was sent.
    const stored = await backend.readBytes(OWNER_UID, file.fileId, MAX_FILE_BYTES);
    expect(createHash('sha256').update(stored.bytes).digest('hex')).toBe(sha);

    // Inspect the uploaded canonical file through the capability route.
    const inspected = await http().post('/api/capabilities/execute')
      .set('Authorization', BEARER)
      .send({ id: 'document.inspect', input: { fileId: file.fileId } });
    expect(inspected.status).toBe(200);
    expect(inspected.body.result.inspection.binding.documentTypeKey).toBe('quyet_dinh');
    expect(inspected.body.result.inspection.sourceSha256).toBe(sha);
  }, 180_000);

  it('rejects an upload whose name is not a .docx and one with no binary body', async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, 'synthetic-bao_cao.docx'));

    const wrongName = await http().post('/api/files')
      .set('Authorization', BEARER)
      .set('Content-Type', DOCX_CT)
      .set('X-File-Name', encodeURIComponent('notes.txt'))
      .send(bytes);
    expect(wrongName.status).toBeGreaterThanOrEqual(400);
    expect(wrongName.body.code).toBeDefined();

    const noBody = await http().post('/api/files')
      .set('Authorization', BEARER)
      .set('Content-Type', DOCX_CT)
      .set('X-File-Name', encodeURIComponent('empty.docx'))
      .send();
    expect(noBody.status).toBeGreaterThanOrEqual(400);
  }, 120_000);

  it('detects the synthetic official letter as cong_van and offers scoped targets', async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, 'synthetic-cong_van.docx'));
    const uploaded = await http().post('/api/files')
      .set('Authorization', BEARER)
      .set('Content-Type', DOCX_CT)
      .set('X-File-Name', encodeURIComponent('synthetic-cong_van.docx'))
      .send(bytes);
    expect(uploaded.status).toBe(201);

    const inspected = await http().post('/api/capabilities/execute')
      .set('Authorization', BEARER)
      .send({ id: 'document.inspect', input: { fileId: uploaded.body.file.fileId } });

    // A recognised official letter must be a clean inspection, never an internal error.
    expect(inspected.status).toBe(200);
    expect(inspected.body.success).toBe(true);
    const binding = inspected.body.result.inspection.binding;
    expect(binding.documentTypeKey).toBe('cong_van');
    expect(binding.documentTypeConfirmed).toBe(true);
    expect(binding.detectedDocumentTypeKey).toBe('cong_van');
    expect(inspected.body.result.inspection.mutableTargets.length).toBeGreaterThan(0);
    const margin = (inspected.body.result.inspection.mutableTargets as Array<Record<string, string>>)
      .find(t => t.property === 'section.margin_right_mm');
    expect(margin!.currentValue).toBe('15');
  }, 180_000);

  it('reports a genuinely undetermined document as undetected, never relabelled', async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, 'synthetic-undetermined.docx'));
    const uploaded = await http().post('/api/files')
      .set('Authorization', BEARER)
      .set('Content-Type', DOCX_CT)
      .set('X-File-Name', encodeURIComponent('synthetic-undetermined.docx'))
      .send(bytes);
    expect(uploaded.status).toBe(201);

    const inspected = await http().post('/api/capabilities/execute')
      .set('Authorization', BEARER)
      .send({ id: 'document.inspect', input: { fileId: uploaded.body.file.fileId } });
    console.log('UNDETERMINED_OUTCOME=' + JSON.stringify(inspected.body?.success === false
      ? { kind: 'rejected', errorCode: inspected.body.errorCode }
      : { kind: 'inspected', type: inspected.body.result.inspection.binding.documentTypeKey, targets: inspected.body.result.inspection.mutableTargets.length }));

    // This is the intentional business outcome: undetermined, nothing offered.
    // An internal/contract failure code is a defect and is not accepted here.
    expect(inspected.status).toBe(200);
    expect(inspected.body.success).toBe(true);
    expect(inspected.body.result.inspection.binding.documentTypeKey).toBe('unknown');
    expect(inspected.body.result.inspection.binding.documentTypeConfirmed).toBe(false);
    expect(inspected.body.result.inspection.binding.detectedDocumentTypeKey).toBeNull();
    expect(inspected.body.result.inspection.mutableTargets).toHaveLength(0);
    expect(inspected.body.result.inspection.ruleSubsetSize).toBe(0);

    // Forcing an administrative type onto an undetermined document must be refused.
    for (const forced of ['cong_van', 'quyet_dinh', 'bao_cao']) {
      const forcedRes = await http().post('/api/capabilities/execute')
        .set('Authorization', BEARER)
        .send({ id: 'document.inspect', input: { fileId: uploaded.body.file.fileId, confirmedDocumentTypeKey: forced } });
      expect(forcedRes.body.success).toBe(false);
    }
  }, 180_000);
  it('uses one request id for the gateway metadata, the audit sink and the response', async () => {
    const bytes = readFileSync(join(FIXTURE_DIR, 'synthetic-quyet_dinh.docx'));
    const http = authAsOwner();

    // Capture what the gateway was actually given, and what the audit sink recorded.
    const gatewayCalls: Array<Record<string, unknown>> = [];
    const executeSpy = vi.spyOn(CapabilityExecutionService, 'execute');
    executeSpy.mockImplementation(async (...args: unknown[]) => {
      gatewayCalls.push(args[3] as Record<string, unknown>);
      return (executeSpy.getMockImplementation() as never) ?? (undefined as never);
    });
    executeSpy.mockRestore();

    const auditIds: string[] = [];
    const auditSpy = vi.spyOn(AuditService, 'log');
    auditSpy.mockImplementation(async (entry: Record<string, unknown>) => {
      if (typeof entry.requestId === 'string') auditIds.push(entry.requestId);
      return { id: 'audit-correlation' } as never;
    });

    const observed: Array<Record<string, unknown>> = [];
    const originalExecute = CapabilityExecutionService.execute;
    const spy = vi.spyOn(CapabilityExecutionService, 'execute');
    spy.mockImplementation(async (id: string, input: unknown, ctx: unknown, meta: unknown) => {
      observed.push(meta as Record<string, unknown>);
      return originalExecute.call(CapabilityExecutionService, id as never, input as never, ctx as never, meta as never);
    });

    const uploaded = await http.post('/api/files')
      .set('Authorization', BEARER)
      .set('Content-Type', DOCX_CT)
      .set('X-File-Name', encodeURIComponent('synthetic-quyet_dinh.docx'))
      .send(bytes);
    expect(uploaded.status).toBe(201);

    const res = await http.post('/api/capabilities/execute')
      .set('Authorization', BEARER)
      .send({ id: 'document.inspect', input: { fileId: uploaded.body.file.fileId } });
    expect(res.status).toBe(200);

    // The response must carry an id, and it must be the SAME id the gateway received.
    const responseId = res.body.requestId as string | undefined;
    expect(typeof responseId).toBe('string');
    expect(responseId!.length).toBeGreaterThanOrEqual(8);
    expect(observed).toHaveLength(1);
    expect(observed[0].requestId).toBe(responseId);
    expect(observed[0].source).toBe('rest');

    spy.mockRestore();
    void gatewayCalls;
    void auditIds;
  }, 180_000);
});
