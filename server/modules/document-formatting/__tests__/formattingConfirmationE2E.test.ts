import { spawn, type ChildProcess } from 'child_process';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Confirmation + idempotency end-to-end.
 *
 * Nothing about confirmation is stubbed: `CapabilityConfirmationService.prepare` and
 * `.consume` really run, backed only by a Map standing in for Firestore documents
 * and transactions (the pattern already used by CredentialService.test.ts). The
 * idempotency repository is the real service wired to a Map-backed repository via
 * the existing `setRepositoryForTests` seam. The caller never sets `confirmed`.
 */

const firestoreMocks = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  return {
    store,
    collection: vi.fn(),
    runTransaction: vi.fn(),
  };
});

vi.mock('../../../lib/firebaseAdmin', () => ({
  adminFirestore: {
    collection: firestoreMocks.collection,
    runTransaction: firestoreMocks.runTransaction,
  },
}));

import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { bootstrapServer } from '../../../bootstrap';
import { ServerCapabilityRegistry } from '../../../core/capabilities/serverCapabilityRegistry';
import { CapabilityExecutionService, CapabilityExecutionIdempotencyService, type MutationExecutionRecord } from '../../../core/capabilities/CapabilityExecutionService';
import { CapabilityConfirmationService } from '../../../core/capabilities/CapabilityConfirmationService';
import { AuditService } from '../../../core/audit/auditService';
import { storage } from '../../../infrastructure/storage';
import { createDocumentFormattingCapabilities } from '../registration';
import { DocumentProcessorClient } from '../../../core/documents/documentProcessorClient';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../../shared/contracts/fileUploadPolicy';
import type { UserFileRecord } from '../../../core/files/UserFileService';

const PROCESSOR_ROOT = 'C:\\Dev\\Agent-Webapp\\document-processor\\v22-runtime';
const FIXTURE = join(PROCESSOR_ROOT, 'fixtures', 'v23', '02-named-decision.docx');
/**
 * Host binary under test. Overridable because a long-running host can hold the default bin
 * directory locked, which would otherwise silently exercise a stale Processor build.
 */
const HOST_DLL =
  process.env.PROCESSOR_HOST_DLL ??
  join(PROCESSOR_ROOT, 'src', 'DocumentProcessor.Host', 'bin', 'Release', 'net10.0', 'DocumentProcessor.Host.dll');

const ARTIFACT_DIR = 'C:\\Users\\dtron\\AppData\\Local\\Temp\\opencode\\fmt-e2e';
const PORT = 8794;
const TOKEN = randomBytes(32).toString('hex');
const OWNER = 'e2e-confirm-owner';

const owner = { id: OWNER, email: 'e2e@example.test', name: 'E2E', roles: ['owner'], permissions: ['files.read', 'files.write'] };
const otherOwner = { id: 'someone-else', email: 'x@example.test', name: 'X', roles: ['owner'], permissions: ['files.read', 'files.write'] };
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Map-backed Firestore stand-in: documents, snapshots and transactions. */
function installFirestoreMock() {
  const store = firestoreMocks.store;
  store.clear();
  firestoreMocks.collection.mockImplementation((name: string) => ({
    doc: (id: string) => {
      const key = `${name}/${id}`;
      return {
        id,
        path: key,
        set: async (data: Record<string, unknown>) => { store.set(key, { ...data }); },
      };
    },
  }));
  firestoreMocks.runTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    get: async (ref: { path: string }) => {
      const data = store.get(ref.path);
      return { exists: !!data, data: () => data };
    },
    update: async (ref: { path: string }, patch: Record<string, unknown>) => {
      const existing = store.get(ref.path);
      if (existing) store.set(ref.path, { ...existing, ...patch });
    },
  }));
}

/** Map-backed idempotency repository, mirroring the gateway's identity rules. */
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
    const record = this.records.get(id);
    if (record) this.records.set(id, { ...record, state: 'SUCCEEDED' as const, result: result as never });
  }
  async fail(id: string, failureKind: never, errorCode: string) {
    const record = this.records.get(id);
    if (record) this.records.set(id, { ...record, state: 'FAILED' as const, failureKind, errorCode });
  }
  async inspect(record: Pick<MutationExecutionRecord, 'executionId' | 'userId' | 'capabilityId' | 'inputHash' | 'source'>) {
    const existing = this.records.get(record.executionId);
    if (!existing) return { kind: 'absent' as const };
    if (existing.userId !== record.userId) return { kind: 'mismatch' as const, reason: 'USER' as const };
    if (existing.capabilityId !== record.capabilityId) return { kind: 'mismatch' as const, reason: 'CAPABILITY' as const };
    if (existing.inputHash !== record.inputHash) return { kind: 'mismatch' as const, reason: 'INPUT' as const };
    if (existing.source !== record.source) return { kind: 'mismatch' as const, reason: 'SOURCE' as const };
    return { kind: 'found' as const, record: existing };
  }
}

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
    if (!file || file.ownerId !== ownerId) throw Object.assign(new Error('not found'), { code: 'FILE_NOT_FOUND' });
    const bytes = this.blobs.get(fileId)!;
    if (bytes.length > maxBytes) throw Object.assign(new Error('too large'), { code: 'FILE_TOO_LARGE' });
    return { file, bytes };
  }
  bytes(fileId: string) { return this.blobs.get(fileId); }
}

describe('formatting confirmation and idempotency end-to-end', () => {
  let host: ChildProcess;
  const files = new MemoryFileService();
  const repository = new MemoryExecutionRepository();
  let applyCalls = 0;
  let sourceRecord: UserFileRecord;
  let sourceSha: string;
  let applyInput: Record<string, string>;

  beforeAll(async () => {
    if (!existsSync(FIXTURE)) throw new Error(`fixture missing: ${FIXTURE}`);
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    const sourceBytes = readFileSync(FIXTURE);
    sourceSha = sha256(sourceBytes);

    host = spawn('dotnet', [HOST_DLL], {
      env: {
        ...process.env,
        DOCUMENT_PROCESSOR_SHARED_TOKEN: TOKEN,
        ASPNETCORE_URLS: `http://127.0.0.1:${PORT}`,
        // Same seams the synthetic pilot uses, so this suite can run against a freshly built
        // host when the default bin directory is locked by a running process.
        DOCUMENT_PROCESSOR_LEGAL_ROOT: process.env.DOCUMENT_PROCESSOR_LEGAL_ROOT ?? PROCESSOR_ROOT,
      },
      stdio: 'ignore',
    });
    const realClient = new DocumentProcessorClient({ baseUrl: `http://127.0.0.1:${PORT}`, sharedToken: TOKEN });
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await new Promise(r => setTimeout(r, 500));
      try { await realClient.inspect(sourceBytes); ready = true; } catch { /* not up yet */ }
    }
    if (!ready) throw new Error('processor host did not become ready');

    bootstrapServer();
    await storage.setModuleEnabled('document-formatting', true);
    ServerCapabilityRegistry.reset();

    // Only the mutation call is counted, so we can prove the Processor was not
    // touched when confirmation was missing or a replay was served.
    const countingClient = {
      inspect: realClient.inspect.bind(realClient),
      applyFormatting: ((...args: never[]) => { applyCalls += 1; return (realClient.applyFormatting as (...a: never[]) => unknown)(...args); }) as typeof realClient.applyFormatting,
    };
    createDocumentFormattingCapabilities({ files: files as never, processor: countingClient })
      .forEach(capability => ServerCapabilityRegistry.register(capability));

    vi.spyOn(AuditService, 'log').mockResolvedValue({ id: 'audit-e2e' } as never);
    vi.spyOn(AuditService, 'update').mockResolvedValue();
    CapabilityExecutionIdempotencyService.setRepositoryForTests(repository as never);

    sourceRecord = await files.store(OWNER, { originalName: '02-named-decision.docx', mimeType: DOCX_MIME_TYPE, bytes: sourceBytes });
  }, 180_000);

  afterAll(() => {
    try { host?.kill(); } catch { /* already gone */ }
    CapabilityExecutionIdempotencyService.resetRepositoryForTests();
    ServerCapabilityRegistry.reset();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    installFirestoreMock();
    applyCalls = 0;
    const context = { user: owner, appContext: { user: owner }, confirmed: false } as never;
    return (async () => {
      const inspected = await ServerCapabilityRegistry.execute('document.inspect', { fileId: sourceRecord.fileId, confirmedDocumentTypeKey: 'bao_cao' }, context);
      const inspection = (inspected as never as { result: { inspection: { binding: { id: string; digest: string }; mutableTargets: Array<{ property: string; targetId: string; currentValue: string; ruleId: string }> } } }).result.inspection;
      const target = inspection.mutableTargets.find(t => t.property === 'section.margin_right_mm')!;
      applyInput = {
        fileId: sourceRecord.fileId, sourceSha256: sourceSha,
        property: target.property, targetId: target.targetId, documentTypeKey: 'bao_cao',
        expectedBefore: target.currentValue!, desiredAfter: '17',
        profileId: inspection.binding.id, profileDigest: inspection.binding.digest, ruleId: target.ruleId,
      };
    })();
  });

  const gatewayContext = () => ({ user: owner, appContext: { user: owner } } as never);

  it('issues a real challenge, applies once after consuming it, and replays without a second mutation', async () => {
    const key = randomUUID();
    const artifactsBefore = files.records.size;

    // 1. No confirmation: the gateway must issue a challenge and not mutate.
    const challenged = await CapabilityExecutionService.execute(
      'document.applyAlignment', applyInput, gatewayContext(), { source: 'rest', idempotencyKey: key } as never);
    expect(challenged).toMatchObject({ success: false, requiresConfirmation: true });
    expect(challenged.confirmationId).toBeTruthy();
    expect(applyCalls).toBe(0);
    expect(files.records.size).toBe(artifactsBefore);
    const confirmationId = challenged.confirmationId!;

    // 2. A challenge is bound to its owner, capability and exact input. These probes
    //    use their own throwaway challenges so the good one stays unconsumed.
    const foreignOwnerChallenge = await CapabilityConfirmationService.prepare({
      userId: OWNER, capabilityId: 'document.applyAlignment', rawInput: applyInput,
    });
    const wrongOwner = await CapabilityConfirmationService.consume({
      confirmationId: foreignOwnerChallenge.confirmationId, userId: otherOwner.id,
      capabilityId: 'document.applyAlignment', rawInput: applyInput, source: 'rest',
    });
    expect(wrongOwner.ok).toBe(false);
    // Exact code, so a rejection for any other reason cannot satisfy this probe.
    expect(wrongOwner.ok ? null : wrongOwner.errorCode).toBe('CONFIRMATION_USER_MISMATCH');

    const otherInputChallenge = await CapabilityConfirmationService.prepare({
      userId: OWNER, capabilityId: 'document.applyAlignment', rawInput: { ...applyInput, desiredAfter: '18' },
    });
    const wrongInput = await CapabilityConfirmationService.consume({
      confirmationId: otherInputChallenge.confirmationId, userId: OWNER,
      capabilityId: 'document.applyAlignment', rawInput: applyInput, source: 'rest',
    });
    expect(wrongInput.ok).toBe(false);
    expect(wrongInput.ok ? null : wrongInput.errorCode).toBe('CONFIRMATION_INPUT_MISMATCH');

    // Neither rejected probe may have mutated anything.
    expect(applyCalls).toBe(0);
    expect(files.records.size).toBe(artifactsBefore);

    // 3. The gateway itself consumes the exact challenge for this owner/capability/
    //    input. Nothing here pre-consumes it.
    // 4. Apply once with the consumed challenge.
    const applied = await CapabilityExecutionService.execute(
      'document.applyAlignment', applyInput, gatewayContext(), { source: 'rest', idempotencyKey: key, confirmationId } as never);
    expect(applied.success).toBe(true);
    const first = (applied as never as { result: { outputFile: { fileId: string }; changeManifest: { outputSha256: string } } }).result;

    // The durable challenge record proves the real lifecycle ran: the gateway
    // consumed this exact challenge and approved it.
    const stored = firestoreMocks.store.get('capability_confirmations/' + confirmationId);
    expect(stored).toBeDefined();
    expect(stored!.decision).toBe('approved');
    expect(stored!.consumedAt).toBeTruthy();
    expect(stored!.userId).toBe(OWNER);
    expect(stored!.capabilityId).toBe('document.applyAlignment');

    expect(applyCalls).toBe(1);
    expect(files.records.size).toBe(artifactsBefore + 1);
    expect(sha256(files.bytes(sourceRecord.fileId)!)).toBe(sourceSha);

    // 5. Replaying the already-consumed challenge must be refused.
    // Same idempotency key, same exact raw input, same already-consumed challenge.
    // A new key here would let a logical-execution mismatch reject the call instead,
    // so the replay protection would not actually be proven.
    const replayed = await CapabilityExecutionService.execute(
      'document.applyAlignment', applyInput, gatewayContext(), { source: 'rest', idempotencyKey: key, confirmationId } as never);
    expect(replayed.success).toBe(false);
    expect(replayed.errorCode).toBe('CONFIRMATION_REPLAY');
    expect(applyCalls).toBe(1);
    expect(files.records.size).toBe(artifactsBefore + 1);

    // 6. Same idempotency key with a NEWLY issued exact challenge replays the stored
    //    success: same output id and hash, and no second Processor mutation.
    // The challenge must carry the same logical execution identity the gateway
    // derives from the idempotency key, otherwise it belongs to another execution.
    const secondChallenge = await CapabilityConfirmationService.prepare({
      userId: OWNER, capabilityId: 'document.applyAlignment', rawInput: applyInput,
      executionContext: { source: 'rest', logicalExecutionId: `rest:${key}` },
    });
    const idempotentReplay = await CapabilityExecutionService.execute(
      'document.applyAlignment', applyInput, gatewayContext(),
      { source: 'rest', idempotencyKey: key, confirmationId: secondChallenge.confirmationId } as never);
    expect(idempotentReplay.success).toBe(true);
    const replayed2 = (idempotentReplay as never as { result: { outputFile: { fileId: string }; changeManifest: { outputSha256: string } } }).result;
    expect(replayed2.outputFile.fileId).toBe(first.outputFile.fileId);
    expect(replayed2.changeManifest.outputSha256).toBe(first.changeManifest.outputSha256);
    expect(applyCalls).toBe(1);
    expect(files.records.size).toBe(artifactsBefore + 1);
  }, 180_000);
});
