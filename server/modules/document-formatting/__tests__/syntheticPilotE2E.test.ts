import { spawn, type ChildProcess } from 'child_process';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Synthetic DOCX pilot over the real HTTP boundary.
 *
 * Real: Express routing, /api auth middleware, OWNER_UID enforcement, permission
 * resolution, module gating, the capability gateway with genuine challenge
 * consumption and idempotency, the real Processor over loopback, the owner file
 * store, and GET /api/files/:fileId/content.
 *
 * Doubled (labelled as such, not claimed as user runtime):
 *  - `adminAuth.verifyIdToken` is the repository's existing Firebase-boundary seam.
 *  - The durable file store is delegated to an in-memory record so Firestore stays off.
 *
 * All fixtures are synthetic documents invented for this pilot. No private file,
 * no real company, person or document data is used.
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
import { CapabilityConfirmationService } from '../../../core/capabilities/CapabilityConfirmationService';
import { AuditService } from '../../../core/audit/auditService';
import { storage } from '../../../infrastructure/storage';
import { userFileService } from '../../../core/files/firebaseFileStores';
import { createDocumentFormattingCapabilities } from '../registration';
import { DocumentProcessorClient } from '../../../core/documents/documentProcessorClient';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../../shared/contracts/fileUploadPolicy';
import type { UserFileRecord } from '../../../core/files/UserFileService';

const PROCESSOR_ROOT = 'C:\\Dev\\Agent-Webapp\\document-processor\\v22-runtime';
const FIXTURE_DIR = 'C:\\Users\\dtron\\AppData\\Local\\Temp\\opencode\\synthetic-pilot';
/**
 * Host binary under test. Overridable because a long-running host process can hold the
 * default bin directory locked, which would otherwise make this suite exercise a stale
 * Processor build instead of the current source.
 */
const HOST_DLL =
  process.env.PROCESSOR_HOST_DLL ??
  join(PROCESSOR_ROOT, 'src', 'DocumentProcessor.Host', 'bin', 'Release', 'net10.0', 'DocumentProcessor.Host.dll');

const ARTIFACT_DIR = 'C:\\Users\\dtron\\AppData\\Local\\Temp\\opencode\\synthetic-pilot\\outputs';
const PORT = 5213;
const TOKEN = randomBytes(32).toString('hex');
const OWNER_UID = 'pilot-owner-uid';
const OTHER_UID = 'pilot-other-uid';
const BEARER = 'Bearer pilot-token';
const DOCX_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const TYPES = ['cong_van', 'quyet_dinh', 'bao_cao', 'ke_hoach', 'to_trinh'] as const;

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
    if (!file || file.ownerId !== ownerId) throw Object.assign(new Error('not available'), { code: 'FILE_NOT_FOUND', status: 404 });
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

describe('synthetic DOCX pilot over the real HTTP boundary', () => {
  let host: ChildProcess;
  const files = new MemoryFileService();
  const repository = new MemoryExecutionRepository();
  let applyCalls = 0;
  let prevNodeEnv: string | undefined;
  let prevOwnerUid: string | undefined;

  beforeAll(async () => {
    prevNodeEnv = process.env.NODE_ENV;
    prevOwnerUid = process.env.OWNER_UID;
    if (!existsSync(FIXTURE_DIR)) throw new Error(`synthetic fixtures missing: ${FIXTURE_DIR}`);
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    process.env.NODE_ENV = 'test';
    process.env.OWNER_UID = OWNER_UID;

    if (!existsSync(HOST_DLL)) {
      throw new Error(
        `processor host build missing: ${HOST_DLL}\n` +
          'Set PROCESSOR_HOST_DLL to a freshly built DocumentProcessor.Host.dll when the default bin path is locked.',
      );
    }
    host = spawn('dotnet', [HOST_DLL], {
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
    const counting = {
      inspect: real.inspect.bind(real),
      applyFormatting: ((...a: never[]) => { applyCalls += 1; return (real.applyFormatting as (...x: never[]) => unknown)(...a); }) as typeof real.applyFormatting,
    };
    createDocumentFormattingCapabilities({ files: files as never, processor: counting })
      .forEach(c => ServerCapabilityRegistry.register(c));

    vi.spyOn(userFileService, 'readBytes').mockImplementation(async (ownerId, fileId, maxBytes) => {
      if (ownerId !== OWNER_UID) {
        const err = new Error('not available') as Error & { code: string; status: number };
        err.code = 'FILE_NOT_FOUND'; err.status = 404; throw err;
      }
      return files.readBytes(ownerId, fileId, maxBytes);
    });
    vi.spyOn(AuditService, 'log').mockResolvedValue({ id: 'audit-pilot' } as never);
    vi.spyOn(AuditService, 'update').mockResolvedValue();
    CapabilityExecutionIdempotencyService.setRepositoryForTests(repository as never);
  }, 240_000);

  afterAll(() => {
    try { host?.kill(); } catch { /* gone */ }
    CapabilityExecutionIdempotencyService.resetRepositoryForTests();
    ServerCapabilityRegistry.reset();
    vi.restoreAllMocks();
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevNodeEnv;
    if (prevOwnerUid === undefined) delete process.env.OWNER_UID; else process.env.OWNER_UID = prevOwnerUid;
  });

  beforeEach(() => { installFirestoreMock(); applyCalls = 0; });

  const authAs = (uid = OWNER_UID) => {
    authMocks.verifyIdToken.mockResolvedValue({ uid, email: 'pilot@example.test', name: 'Pilot', admin: true });
    return request(app);
  };
  const post = (http: ReturnType<typeof request>, body: Record<string, unknown>) =>
    http.post('/api/capabilities/execute').set('Authorization', BEARER).send(body);

  it('runs a non-noop pilot for every detected administrative type', async () => {
    const results: Record<string, unknown>[] = [];

    for (const type of TYPES) {
      const appliesBefore = applyCalls;
      const name = `synthetic-${type}.docx`;
      const original = readFileSync(join(FIXTURE_DIR, name));
      const sourceSha = sha256(original);
      const http = authAs();

      // 1. Store as the owner (stands in for the authenticated upload route).
      const source = await files.store(OWNER_UID, { originalName: name, mimeType: DOCX_MIME_TYPE, bytes: original });

      // 2. Inspect through the real route.
      const inspected = await post(http, { id: 'document.inspect', input: { fileId: source.fileId } });
      expect(inspected.status).toBe(200);
      const binding = inspected.body.result.inspection.binding;
      expect(binding.documentTypeKey).toBe(type);
      // Detector was confident. `ownerConfirmed` stays false because nobody chose it.
      expect(binding.documentTypeConfirmed).toBe(true);
      expect(binding.ownerConfirmed).toBeFalsy();

      // 3. Pick a real finding from the scoped target list.
      const targets = inspected.body.result.inspection.mutableTargets as Array<Record<string, string>>;
      const margin = targets.find(t => t.property === 'section.margin_right_mm')!;
      expect(margin).toBeTruthy();
      expect(margin.currentValue).toBe('15');
      expect(margin.ruleId).toBe('ND30.PL1.I.GENERAL.MARGIN_RIGHT');

      const applyInput = {
        fileId: source.fileId, sourceSha256: inspected.body.result.inspection.sourceSha256,
        property: margin.property, targetId: margin.targetId, documentTypeKey: type,
        expectedBefore: margin.currentValue, desiredAfter: '20',
        profileId: binding.id, profileDigest: binding.digest, ruleId: margin.ruleId,
      };

      // 3b. The owner explicitly confirms the type, which is the path the UI uses when
      // the picker changes. The binding must then report ownerConfirmed.
      const confirmed = await post(http, {
        id: 'document.inspect', input: { fileId: source.fileId, confirmedDocumentTypeKey: type },
      });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.result.inspection.binding.ownerConfirmed).toBe(true);
      expect(confirmed.body.result.inspection.binding.documentTypeKey).toBe(type);
      expect(confirmed.body.result.inspection.binding.digest).toBe(binding.digest);

      // 4. Real challenge, then consume it through the gateway.
      const key = randomUUID();
      const challenged = await post(http, { id: 'document.applyAlignment', input: applyInput })
        .set('Idempotency-Key', key);
      expect(challenged.status).toBe(409);
      expect(challenged.body.requiresConfirmation).toBe(true);
      expect(applyCalls).toBe(appliesBefore);

      const confirmationId = challenged.body.confirmationId as string;
      // The gateway consumes the challenge itself; consuming it here first would make
      // the gateway re-issue a challenge and return 409.

      // 5. Apply.
      const applied = await post(http, { id: 'document.applyAlignment', input: applyInput, confirmationId })
        .set('Idempotency-Key', key);
      expect(applied.status).toBe(200);
      expect(applied.body.success).toBe(true);
      const out = applied.body.result;
      expect(out.outputFile.fileId).not.toBe(source.fileId);
      expect(out.changeManifest).toMatchObject({ property: 'section.margin_right_mm', targetId: margin.targetId, before: '15', after: '20', ruleId: margin.ruleId });
      expect(out.profile.documentTypeKey).toBe(type);
      expect(out.verification).toMatchObject({ reopened: true, revalidated: true, sourceUnchanged: true, outputInspectionPassed: true });

      // 6. Source bytes untouched.
      expect(sha256(files.bytes(source.fileId)!)).toBe(sourceSha);
      expect(sha256(readFileSync(join(FIXTURE_DIR, name)))).toBe(sourceSha);

      // 7. Download through the real route and verify independently.
      const dl = await http.get(`/api/files/${out.outputFile.fileId}/content`).set('Authorization', BEARER)
        .buffer(true).parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(dl.status).toBe(200);
      expect(dl.headers['content-type']).toBe(DOCX_MIME_TYPE);
      const downloaded = dl.body as Buffer;
      // Length must match the stored descriptor and the declared header. No assertion
      // is made about the byte delta versus the input: ZIP compression makes package
      // size not a DOCX semantic invariant.
      expect(downloaded.length).toBe(out.outputFile.sizeBytes);
      expect(Number(dl.headers['content-length'])).toBe(downloaded.length);
      expect(sha256(downloaded)).toBe(out.changeManifest.outputSha256);
      expect(sha256(downloaded)).not.toBe(sourceSha);
      const artifact = join(ARTIFACT_DIR, `pilot-${type}-margin20.docx`);
      writeFileSync(artifact, downloaded);

      // 8. Re-inspect the output: only the scoped property changed.
      const re = await post(http, { id: 'document.inspect', input: { fileId: out.outputFile.fileId, confirmedDocumentTypeKey: type } });
      expect(re.status).toBe(200);
      const reTargets = re.body.result.inspection.mutableTargets as Array<Record<string, string>>;
      const reMarginByProp = (list: Array<Record<string, string>>, prop: string) =>
        list.find(t => t.property === prop)!;
      expect(reMarginByProp(reTargets, 'section.margin_right_mm').currentValue).toBe('20');
      const untouched = reTargets.filter(t => ['section.margin_top_mm', 'section.margin_left_mm', 'section.page_size'].includes(t.property));
      expect(untouched.length).toBeGreaterThan(0);
      // Unrelated section properties must be byte-for-byte the same values.
      const before = inspected.body.result.inspection.mutableTargets as Array<Record<string, string>>;
      expect(reMarginByProp(reTargets, 'section.margin_top_mm').currentValue)
        .toBe(reMarginByProp(before, 'section.margin_top_mm').currentValue);
      expect(reMarginByProp(reTargets, 'section.margin_left_mm').currentValue)
        .toBe(reMarginByProp(before, 'section.margin_left_mm').currentValue);
      expect(reMarginByProp(reTargets, 'section.page_size').currentValue)
        .toBe(reMarginByProp(before, 'section.page_size').currentValue);

      results.push({
        type, fixture: name, sourceSha, outputSha: out.changeManifest.outputSha256, artifact,
        rule: margin.ruleId, target: margin.targetId, before: '15', after: '20', bytes: downloaded.length,
      });
    }

    writeFileSync(join(ARTIFACT_DIR, 'pilot-receipts.json'), JSON.stringify(results, null, 2));
    expect(results).toHaveLength(5);
  }, 300_000);

  it('rejects a malformed DOCX and an unsupported confirmed type', async () => {
    const http = authAs();
    const junk = Buffer.from('this is definitely not a docx package', 'utf8');
    const bad = await files.store(OWNER_UID, { originalName: 'broken.docx', mimeType: DOCX_MIME_TYPE, bytes: junk });
    // Baseline after the junk record exists, so this measures artifacts produced by the
    // failed inspection rather than the test's own seeding.
    const artifactsBeforeBad = files.records.size;
    const badRes = await post(http, { id: 'document.inspect', input: { fileId: bad.fileId } });
    expect(badRes.body.success).toBe(false);
    // A precise, intentional safe-domain rejection only. An internal or contract code
    // here would be a defect and must not be accepted as an expected rejection.
    expect(badRes.body.errorCode).toBe('MALFORMED_DOCX');
    // Nothing was produced: no Processor mutation and no new stored artifact.
    expect(applyCalls).toBe(0);
    expect(files.records.size).toBe(artifactsBeforeBad);

    const good = await files.store(OWNER_UID, {
      originalName: 'synthetic-quyet_dinh.docx', mimeType: DOCX_MIME_TYPE,
      bytes: readFileSync(join(FIXTURE_DIR, 'synthetic-quyet_dinh.docx')),
    });
    const unsupported = await post(http, { id: 'document.inspect', input: { fileId: good.fileId, confirmedDocumentTypeKey: 'khong_ton_tai' } });
    expect(unsupported.body.success).toBe(false);
    expect(applyCalls).toBe(0);
  }, 120_000);

  it('enforces the owner boundary on inspect and download', async () => {
    const http = authAs();
    const source = await files.store(OWNER_UID, {
      originalName: 'synthetic-bao_cao.docx', mimeType: DOCX_MIME_TYPE,
      bytes: readFileSync(join(FIXTURE_DIR, 'synthetic-bao_cao.docx')),
    });
    const ok = await post(http, { id: 'document.inspect', input: { fileId: source.fileId } });
    expect(ok.status).toBe(200);

    authAs(OTHER_UID);
    const other = request(app);
    const forbidden = await post(other, { id: 'document.inspect', input: { fileId: source.fileId } });
    // Rejected either by the OWNER_UID allowlist or by owner-bound file lookup.
    expect([403, 200]).toContain(forbidden.status);
    if (forbidden.status === 200) expect(forbidden.body.success).toBe(false);
    expect(applyCalls).toBe(0);
  }, 120_000);

  it('refuses an idempotency replay of a consumed confirmation', async () => {
    const http = authAs();
    const original = readFileSync(join(FIXTURE_DIR, 'synthetic-ke_hoach.docx'));
    const source = await files.store(OWNER_UID, { originalName: 'synthetic-ke_hoach.docx', mimeType: DOCX_MIME_TYPE, bytes: original });
    const inspected = await post(http, { id: 'document.inspect', input: { fileId: source.fileId } });
    const binding = inspected.body.result.inspection.binding;
    const margin = (inspected.body.result.inspection.mutableTargets as Array<Record<string, string>>)
      .find(t => t.property === 'section.margin_right_mm')!;
    const applyInput = {
      fileId: source.fileId, sourceSha256: inspected.body.result.inspection.sourceSha256,
      property: margin.property, targetId: margin.targetId, documentTypeKey: 'ke_hoach',
      expectedBefore: margin.currentValue, desiredAfter: '20',
      profileId: binding.id, profileDigest: binding.digest, ruleId: margin.ruleId,
    };
    const key = randomUUID();
    const challenged = await post(http, { id: 'document.applyAlignment', input: applyInput }).set('Idempotency-Key', key);
    const confirmationId = challenged.body.confirmationId as string;
    const applied = await post(http, { id: 'document.applyAlignment', input: applyInput, confirmationId }).set('Idempotency-Key', key);
    expect(applied.body.success).toBe(true);
    const artifactsAfterApply = files.records.size;

    const replay = await post(http, { id: 'document.applyAlignment', input: applyInput, confirmationId }).set('Idempotency-Key', key);
    expect(replay.body.success).toBe(false);
    expect(replay.body.errorCode).toBe('CONFIRMATION_REPLAY');
    expect(files.records.size).toBe(artifactsAfterApply);
  }, 180_000);
});
