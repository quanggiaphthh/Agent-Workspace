import { spawn, type ChildProcess } from 'child_process';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * HTTP boundary end-to-end: client request -> Express routing -> auth middleware ->
 * capability gateway -> confirmation -> real Processor -> owner file store.
 *
 * Identity uses the repository's existing supported seam: `adminAuth.verifyIdToken`
 * is mocked, exactly as `singleUserOwnerPermissions.test.ts` and `acceptance.test.ts`
 * already do. That substitutes only the external Firebase token verification. Real
 * authorization still runs: `requireAuthenticatedUser`, `requirePermission`,
 * permission resolution, module gating and owner binding are all untouched, and the
 * unauthenticated case below is asserted to be rejected.
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
import { CapabilityExecutionIdempotencyService, type MutationExecutionRecord } from '../../../core/capabilities/CapabilityExecutionService';
import { AuditService } from '../../../core/audit/auditService';
import { storage } from '../../../infrastructure/storage';
import { userFileService } from '../../../core/files/firebaseFileStores';
import { createDocumentFormattingCapabilities } from '../registration';
import { DocumentProcessorClient } from '../../../core/documents/documentProcessorClient';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../../shared/contracts/fileUploadPolicy';
import type { UserFileRecord } from '../../../core/files/UserFileService';

const PROCESSOR_ROOT = 'C:\\Dev\\Agent-Webapp\\document-processor\\v22-runtime';
const FIXTURE = join(PROCESSOR_ROOT, 'fixtures', 'v23', '02-named-decision.docx');
const ARTIFACT_DIR = 'C:\\Users\\dtron\\AppData\\Local\\Temp\\opencode\\fmt-e2e';
const PORT = 8795;
const TOKEN = randomBytes(32).toString('hex');
// The seeded file owner MUST equal the uid the verified token resolves to, because
// `registration.ts` reads the canonical file with `context.user.id`. A mismatch is an
// owner-boundary rejection, not a formatting failure.
const OWNER_UID = 'http-owner-uid-1';
const OTHER_UID = 'http-other-uid-2';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

class MemoryFileService {
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
    if (!file || file.ownerId !== ownerId) throw Object.assign(new Error('not found'), { code: 'FILE_NOT_FOUND', status: 404 });
    const bytes = this.blobs.get(fileId)!;
    if (bytes.length > maxBytes) throw Object.assign(new Error('too large'), { code: 'FILE_TOO_LARGE', status: 413 });
    return { file, bytes };
  }
  bytes(fileId: string) { return this.blobs.get(fileId); }
}

class MemoryExecutionRepository {
  readonly records = new Map<string, MutationExecutionRecord>();
  async claim(record: MutationExecutionRecord) {
    const existing = this.records.get(record.executionId);
    if (!existing) { this.records.set(record.executionId, record); return { kind: 'claimed' as const, record }; }
    if (existing.userId !== record.userId) return { kind: 'mismatch' as const, reason: 'USER' as const, record: existing };
    if (existing.capabilityId !== record.capabilityId) return { kind: 'mismatch' as const, reason: 'CAPABILITY' as const, record: existing };
    if (existing.inputHash !== record.inputHash) return { kind: 'mismatch' as const, reason: 'INPUT' as const, record: existing };
    if (existing.source !== record.source) return { kind: 'mismatch' as const, reason: 'SOURCE' as const, record: existing };
    if (existing.state === 'SUCCEEDED') return { kind: 'succeeded' as const, record: existing };
    if (existing.state === 'FAILED') return { kind: 'failed' as const, record: existing };
    return { kind: 'running' as const, record: existing };
  }
  async succeed(id: string, result: unknown) {
    const r = this.records.get(id); if (r) this.records.set(id, { ...r, state: 'SUCCEEDED' as const, result: result as never });
  }
  async fail(id: string, kind: never, code: string) {
    const r = this.records.get(id); if (r) this.records.set(id, { ...r, state: 'FAILED' as const, failureKind: kind, errorCode: code });
  }
}

function installFirestoreMock() {
  const store = firestoreMocks.store;
  store.clear();
  firestoreMocks.collection.mockImplementation((name: string) => ({
    doc: (id: string) => {
      const key = `${name}/${id}`;
      return { id, path: key, set: async (d: Record<string, unknown>) => { store.set(key, { ...d }); } };
    },
  }));
  firestoreMocks.runTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({
    get: async (ref: { path: string }) => { const d = store.get(ref.path); return { exists: !!d, data: () => d }; },
    update: async (ref: { path: string }, patch: Record<string, unknown>) => {
      const e = store.get(ref.path); if (e) store.set(ref.path, { ...e, ...patch });
    },
  }));
}

describe('formatting over the real HTTP boundary', () => {
  let host: ChildProcess;
  const files = new MemoryFileService();
  const repository = new MemoryExecutionRepository();
  let sourceRecord: UserFileRecord;
  let sourceSha: string;
  let applyCalls = 0;
  let prevNodeEnv: string | undefined;
  let prevOwnerUid: string | undefined;

  beforeAll(async () => {
    // Capture the originals as the FIRST executable statements. Everything below can
    // throw (fixture check, mkdir, readFile, processor spawn), and if it does before
    // the capture, afterAll would see `undefined` and delete pre-existing values.
    // Never logged.
    prevNodeEnv = process.env.NODE_ENV;
    prevOwnerUid = process.env.OWNER_UID;

    if (!existsSync(FIXTURE)) throw new Error(`fixture missing: ${FIXTURE}`);
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    const sourceBytes = readFileSync(FIXTURE);
    sourceSha = sha256(sourceBytes);
    process.env.NODE_ENV = 'test';
    // The owner allowlist is real production authorization, so it is configured
    // rather than bypassed: a token for any other uid must be refused.
    process.env.OWNER_UID = OWNER_UID;

    host = spawn('dotnet', [join(PROCESSOR_ROOT, 'src', 'DocumentProcessor.Host', 'bin', 'Release', 'net10.0', 'DocumentProcessor.Host.dll')], {
      env: { ...process.env, DOCUMENT_PROCESSOR_SHARED_TOKEN: TOKEN, ASPNETCORE_URLS: `http://127.0.0.1:${PORT}` },
      stdio: 'ignore',
    });
    const realClient = new DocumentProcessorClient({ baseUrl: `http://127.0.0.1:${PORT}`, sharedToken: TOKEN });
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await new Promise(r => setTimeout(r, 500));
      try { await realClient.inspect(sourceBytes); ready = true; } catch { /* not up yet */ }
    }
    if (!ready) throw new Error('processor host did not become ready');

    await storage.setModuleEnabled('document-formatting', true);
    ServerCapabilityRegistry.reset();
    const countingClient = {
      inspect: realClient.inspect.bind(realClient),
      applyFormatting: ((...a: never[]) => { applyCalls += 1; return (realClient.applyFormatting as (...x: never[]) => unknown)(...a); }) as typeof realClient.applyFormatting,
    };
    createDocumentFormattingCapabilities({ files: files as never, processor: countingClient })
      .forEach(c => ServerCapabilityRegistry.register(c));

    // Narrow test-only delegation. The shipped store is durable Firebase, which must
    // stay disabled; the route, its auth middleware and its owner check stay real and
    // only the byte/metadata lookup points at the same in-memory record.
    vi.spyOn(userFileService, 'readBytes').mockImplementation(async (ownerId, fileId, maxBytes) => {
      if (ownerId !== OWNER_UID) {
        const err = new Error('The requested file is not available for this account.') as Error & { code: string; status: number };
        err.code = 'FILE_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      return files.readBytes(ownerId, fileId, maxBytes);
    });

    vi.spyOn(AuditService, 'log').mockResolvedValue({ id: 'audit-http' } as never);
    vi.spyOn(AuditService, 'update').mockResolvedValue();
    CapabilityExecutionIdempotencyService.setRepositoryForTests(repository as never);

    sourceRecord = await files.store(OWNER_UID, { originalName: '02-named-decision.docx', mimeType: DOCX_MIME_TYPE, bytes: sourceBytes });
  }, 180_000);

  afterAll(() => {
    try { host?.kill(); } catch { /* already gone */ }
    CapabilityExecutionIdempotencyService.resetRepositoryForTests();
    ServerCapabilityRegistry.reset();
    vi.restoreAllMocks();
    // Restore the exact prior values; they are never logged.
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevNodeEnv;
    if (prevOwnerUid === undefined) delete process.env.OWNER_UID; else process.env.OWNER_UID = prevOwnerUid;
  });

  // Role/permission claims come from the verified token and are resolved by the
  // real permission resolver; nothing here grants access by bypassing a check.
  const BEARER = 'Bearer verified-test-token';
  const authed = (uid = OWNER_UID) => {
    authMocks.verifyIdToken.mockResolvedValue({ uid, email: 'owner@example.test', name: 'Owner', admin: true });
  };

  it('rejects unauthenticated and non-owner requests at the real middleware', async () => {
    // No Authorization header at all: the middleware must reject on the missing
    // credential before any token verification is attempted.
    authMocks.verifyIdToken.mockClear();
    const anonymous = await request(app).post('/api/capabilities/execute')
      .send({ id: 'document.inspect', input: { fileId: sourceRecord.fileId } });
    expect(anonymous.status).toBe(401);
    expect(authMocks.verifyIdToken).not.toHaveBeenCalled();

    // Exactly one explicit header for the invalid-credential branch.
    authMocks.verifyIdToken.mockRejectedValue(Object.assign(new Error('bad token'), { status: 401 }));
    const badToken = await request(app).post('/api/capabilities/execute')
      .set('Authorization', 'Bearer bad-token')
      .send({ id: 'document.inspect', input: { fileId: sourceRecord.fileId } });
    expect(badToken.status).toBe(401);
    expect(authMocks.verifyIdToken).toHaveBeenCalledWith('bad-token');

    // A verified token for an account outside the OWNER_UID allowlist.
    authed(OTHER_UID);
    const wrongOwner = await request(app).post('/api/capabilities/execute').set('Authorization', BEARER)
      .send({ id: 'document.inspect', input: { fileId: sourceRecord.fileId } });
    expect(wrongOwner.status).toBe(403);

    expect(applyCalls).toBe(0);
  });

  /**
   * HTTP integration over the real routes: inspect with an explicit document-type
   * confirmation, the confirmation challenge, apply, binary download, and output
   * re-inspection under the same confirmed type.
   *
   * Covered here: Express routing, the `/api` auth middleware, `OWNER_UID` owner
   * enforcement, permission resolution, module gating, the capability gateway with
   * real challenge consumption and idempotency, the real Processor over loopback,
   * and `GET /api/files/:fileId/content` including its owner check.
   *
   * Identity comes from mocking `adminAuth.verifyIdToken`, the existing repository
   * seam for the Firebase boundary; no credential is read and no authorization
   * check is bypassed. The durable file store is delegated to an in-memory record so
   * Firestore stays disabled.
   *
   * Not covered here, and tracked separately: the browser/React layer. The UI is
   * exercised by component tests against a mocked capability registry, not a real
   * browser against these routes. This file is HTTP integration, not browser E2E.
   */
  it('runs inspect, type confirmation, challenge, apply and HTTP download', async () => {
    installFirestoreMock();
    applyCalls = 0;
    authed();
    const http = request(app);

    // 1. Inspect over HTTP with an explicit document-type confirmation.
    const inspected = await http.post('/api/capabilities/execute').set('Authorization', BEARER).send({
      id: 'document.inspect', input: { fileId: sourceRecord.fileId, confirmedDocumentTypeKey: 'bao_cao' },
    });
    expect(inspected.status).toBe(200);
    const inspection = inspected.body.result.inspection;
    expect(inspection.binding.documentTypeKey).toBe('bao_cao');
    expect(inspection.binding.ownerConfirmed).toBe(true);

    const target = inspection.mutableTargets.find((t: { property: string }) => t.property === 'section.margin_right_mm');
    expect(target).toBeTruthy();
    const applyInput = {
      fileId: sourceRecord.fileId, sourceSha256: sourceSha,
      property: target.property, targetId: target.targetId, documentTypeKey: 'bao_cao',
      expectedBefore: target.currentValue, desiredAfter: '17',
      profileId: inspection.binding.id, profileDigest: inspection.binding.digest, ruleId: target.ruleId,
    };

    // 2. Mutation without confirmation is refused by the gateway as HTTP 409.
    const key = randomUUID();
    const challenged = await http.post('/api/capabilities/execute').set('Authorization', BEARER)
      .set('Idempotency-Key', key)
      .send({ id: 'document.applyAlignment', input: applyInput });
    expect(challenged.status).toBe(409);
    expect(challenged.body.requiresConfirmation).toBe(true);
    expect(applyCalls).toBe(0);
    const confirmationId = challenged.body.confirmationId as string;
    expect(confirmationId).toBeTruthy();

    // 3. Confirm and apply. The route still passes confirmed:false; the gateway is
    //    the only party allowed to confirm, after consuming the challenge.
    const applied = await http.post('/api/capabilities/execute').set('Authorization', BEARER)
      .set('Idempotency-Key', key)
      .send({ id: 'document.applyAlignment', input: applyInput, confirmationId });
    expect(applied.status).toBe(200);
    expect(applied.body.success).toBe(true);
    const out = applied.body.result;
    expect(out.outputFile.fileId).not.toBe(sourceRecord.fileId);
    expect(out.profile.documentTypeKey).toBe('bao_cao');
    expect(out.changeManifest).toMatchObject({ property: 'section.margin_right_mm', targetId: target.targetId, after: '17', ruleId: target.ruleId });
    expect(out.verification).toMatchObject({ reopened: true, revalidated: true, sourceUnchanged: true, outputInspectionPassed: true });
    expect(applyCalls).toBe(1);

    // 4. Source bytes preserved exactly.
    expect(sha256(files.bytes(sourceRecord.fileId)!)).toBe(sourceSha);
    expect(sha256(readFileSync(FIXTURE))).toBe(sourceSha);

    // 5. Download the stored artifact and verify it independently.
    const download = await http.get(`/api/files/${out.outputFile.fileId}/content`)
      .set('Authorization', BEARER)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe(DOCX_MIME_TYPE);
    const downloaded = download.body as Buffer;
    expect(downloaded.length).toBe(out.outputFile.sizeBytes);
    expect(Number(download.headers['content-length'])).toBe(downloaded.length);
    expect(sha256(downloaded)).toBe(out.changeManifest.outputSha256);
    expect(downloaded.equals(readFileSync(FIXTURE))).toBe(false);
    const artifactPath = join(ARTIFACT_DIR, 'http-e2e-corrected-type-margin.docx');
    writeFileSync(artifactPath, downloaded);

    // 6. Re-inspect the artifact under the same confirmed type.
    const reinspected = await http.post('/api/capabilities/execute').set('Authorization', BEARER).send({
      id: 'document.inspect', input: { fileId: out.outputFile.fileId, confirmedDocumentTypeKey: 'bao_cao' },
    });
    expect(reinspected.status).toBe(200);
    const recheck = reinspected.body.result.inspection;
    expect(recheck.binding.documentTypeKey).toBe('bao_cao');
    const reapplied = recheck.mutableTargets.find((t: { property: string; targetId: string }) =>
      t.property === 'section.margin_right_mm' && t.targetId === target.targetId);
    expect(reapplied.currentValue).toBe('17');

    writeFileSync(join(ARTIFACT_DIR, 'http-e2e-receipt.json'), JSON.stringify({
      route: 'POST /api/capabilities/execute + GET /api/files/:fileId/content', owner: OWNER_UID,
      sourceFileId: sourceRecord.fileId, outputFileId: out.outputFile.fileId,
      sourceSha256: sourceSha, outputSha256: sha256(downloaded),
      correctedType: out.profile.documentTypeKey, property: out.changeManifest.property,
      targetId: out.changeManifest.targetId, ruleId: out.changeManifest.ruleId,
      before: out.changeManifest.before, after: out.changeManifest.after,
      verification: out.verification, artifactPath,
    }, null, 2));
  }, 180_000);
});
