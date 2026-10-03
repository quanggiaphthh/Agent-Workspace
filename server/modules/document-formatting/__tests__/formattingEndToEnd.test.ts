import { spawn, type ChildProcess } from 'child_process';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapServer } from '../../../bootstrap';
import { ServerCapabilityRegistry } from '../../../core/capabilities/serverCapabilityRegistry';
import { storage } from '../../../infrastructure/storage';
import { createDocumentFormattingCapabilities } from '../registration';
import { DocumentProcessorClient } from '../../../core/documents/documentProcessorClient';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../../shared/contracts/fileUploadPolicy';
import type { UserFileRecord } from '../../../core/files/UserFileService';

/**
 * End-to-end over the real stack: real DOCX fixture, real Processor over loopback,
 * real capability registry, real confirmation gate. Only the owner-bound file
 * store is swapped for an in-memory one, because the shipped implementation is
 * hard-wired to durable Firebase and this run must not enable it.
 *
 * No credentials are read: an ephemeral token is generated here and used only for
 * this loopback process.
 */
const PROCESSOR_ROOT = 'C:\\Dev\\Agent-Webapp\\document-processor\\v22-runtime';
const FIXTURE = join(PROCESSOR_ROOT, 'fixtures', 'v23', '02-named-decision.docx');
const ARTIFACT_DIR = 'C:\\Users\\dtron\\AppData\\Local\\Temp\\opencode\\fmt-e2e';
const PORT = 8793;
const TOKEN = randomBytes(32).toString('hex');
const OWNER = 'e2e-owner';

const owner = { id: OWNER, email: 'e2e@example.test', name: 'E2E', roles: ['owner'], permissions: ['files.read', 'files.write'] };

class MemoryFileService {
  readonly records = new Map<string, UserFileRecord>();
  private readonly blobs = new Map<string, Buffer>();

  async store(ownerId: string, input: { originalName: string; mimeType: string; bytes: Buffer; avoidFileId?: string }): Promise<UserFileRecord> {
    // A distinct new fileId is required so the source can never be overwritten.
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

  get(fileId: string) { return this.records.get(fileId); }
  bytes(fileId: string) { return this.blobs.get(fileId); }
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/**
 * Registry-level capability end-to-end.
 *
 * Scope, stated precisely: this drives the real capability descriptors, real Zod
 * contracts and the real Processor over loopback, but it calls
 * `ServerCapabilityRegistry.execute` directly and supplies `confirmed: true`
 * itself. It therefore proves the registry boolean guard, NOT the real confirmation
 * challenge lifecycle and NOT gateway idempotency replay.
 *
 * Real confirmation and idempotency are covered separately in
 * `formattingConfirmationE2E.test.ts`, which drives `CapabilityExecutionService`.
 */
describe('document formatting registry-level end-to-end (real processor, local storage; confirmation/idempotency NOT exercised here)', () => {
  let host: ChildProcess;
  const files = new MemoryFileService();
  let sourceBytes: Buffer;
  let sourceRecord: UserFileRecord;
  let outputPath: string;

  beforeAll(async () => {
    if (!existsSync(FIXTURE)) throw new Error(`fixture missing: ${FIXTURE}`);
    sourceBytes = readFileSync(FIXTURE);
    mkdirSync(ARTIFACT_DIR, { recursive: true });

    host = spawn('dotnet', [join(PROCESSOR_ROOT, 'src', 'DocumentProcessor.Host', 'bin', 'Release', 'net10.0', 'DocumentProcessor.Host.dll')], {
      env: { ...process.env, DOCUMENT_PROCESSOR_SHARED_TOKEN: TOKEN, ASPNETCORE_URLS: `http://127.0.0.1:${PORT}` },
      stdio: 'ignore',
    });
    const client = new DocumentProcessorClient({ baseUrl: `http://127.0.0.1:${PORT}`, sharedToken: TOKEN });
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await new Promise(r => setTimeout(r, 500));
      try { await client.inspect(sourceBytes); ready = true; } catch { /* not up yet */ }
    }
    if (!ready) throw new Error('processor host did not become ready');

    bootstrapServer();
    await storage.setModuleEnabled('document-formatting', true);
    // Bootstrap registers these capabilities against the durable Firebase store.
    // Reset first so the locally injected store and processor are the ones exercised.
    ServerCapabilityRegistry.reset();
    createDocumentFormattingCapabilities({ files: files as never, processor: client })
      .forEach(capability => ServerCapabilityRegistry.register(capability));

    sourceRecord = await files.store(OWNER, { originalName: '02-named-decision.docx', mimeType: DOCX_MIME_TYPE, bytes: sourceBytes });
  }, 180_000);

  afterAll(() => { try { host?.kill(); } catch { /* already gone */ } });

  it('runs inspect, type correction, confirmation, apply, store and download', async () => {
    const context: never = { user: owner, appContext: { user: owner }, confirmed: false } as never;
    const sourceSha = sha256(sourceBytes);

    // 1. Inspect under the detector's suggestion.
    const inspected = await ServerCapabilityRegistry.execute('document.inspect', { fileId: sourceRecord.fileId }, context);
    expect(inspected.success).toBe(true);
    const detected = (inspected as never as { result: { inspection: { binding: { documentTypeKey: string }; mutableTargets: Array<{ property: string; targetId: string; currentValue: string; ruleId: string; unit: string }> } } }).result.inspection;
    expect(detected.binding.documentTypeKey).toBe('quyet_dinh');
    expect(detected.mutableTargets.length).toBeGreaterThan(0);

    // 2. Correct to a different supported type; the binding must follow it.
    const corrected = await ServerCapabilityRegistry.execute('document.inspect', { fileId: sourceRecord.fileId, confirmedDocumentTypeKey: 'bao_cao' }, context);
    expect(corrected.success).toBe(true);
    const bound = (corrected as never as { result: { inspection: { binding: { documentTypeKey: string; ownerConfirmed: boolean; detectedDocumentTypeKey: string }; mutableTargets: Array<{ property: string; targetId: string; currentValue: string; ruleId: string; unit: string }> } } }).result.inspection;
    expect(bound.binding.documentTypeKey).toBe('bao_cao');
    expect(bound.binding.ownerConfirmed).toBe(true);
    expect(bound.binding.detectedDocumentTypeKey).toBe('quyet_dinh');

    // 3. Pick a real profile finding from the corrected scope.
    const target = bound.mutableTargets.find(t => t.property === 'section.margin_right_mm')!;
    expect(target).toBeTruthy();
    const before = target.currentValue!;

    const applyInput = {
      fileId: sourceRecord.fileId, sourceSha256: sourceSha,
      property: target.property, targetId: target.targetId, documentTypeKey: 'bao_cao',
      expectedBefore: before, desiredAfter: '17',
      profileId: (corrected as never as { result: { inspection: { binding: { id: string; digest: string } } } }).result.inspection.binding.id,
      profileDigest: (corrected as never as { result: { inspection: { binding: { digest: string } } } }).result.inspection.binding.digest,
      ruleId: target.ruleId,
    };

    // 4. The confirmation gate is real: unconfirmed execution must not mutate.
    const unconfirmed = await ServerCapabilityRegistry.execute('document.applyAlignment', applyInput, context);
    expect(unconfirmed).toMatchObject({ success: false, errorCode: 'CONFIRMATION_REQUIRED', requiresConfirmation: true });
    expect(files.records.size).toBe(1);

    // 5. Confirmed execution creates a distinct new file.
    const applied = await ServerCapabilityRegistry.execute('document.applyAlignment', applyInput, { user: owner, confirmed: true } as never);
    expect(applied.success).toBe(true);
    const out = (applied as never as { result: { sourceFileId: string; outputFile: { fileId: string; mimeType: string; sizeBytes: number }; changeManifest: { property: string; targetId: string; before: string; after: string; ruleId: string; outputSha256: string }; verification: Record<string, boolean>; profile: { documentTypeKey: string; id: string } } }).result;

    expect(out.sourceFileId).toBe(sourceRecord.fileId);
    expect(out.outputFile.fileId).not.toBe(sourceRecord.fileId);
    expect(out.outputFile.mimeType).toBe(DOCX_MIME_TYPE);
    expect(out.changeManifest).toMatchObject({ property: 'section.margin_right_mm', targetId: target.targetId, before, after: '17', ruleId: target.ruleId });
    expect(out.profile.documentTypeKey).toBe('bao_cao');
    expect(out.verification).toMatchObject({ reopened: true, revalidated: true, sourceUnchanged: true, outputInspectionPassed: true });

    // 6. The source is byte-identical and untouched.
    expect(sha256(files.bytes(sourceRecord.fileId)!)).toBe(sourceSha);
    expect(sha256(sourceBytes)).toBe(sourceSha);

    // 7. Download the stored output and verify it independently.
    const downloaded = files.bytes(out.outputFile.fileId)!;
    expect(downloaded.length).toBe(out.outputFile.sizeBytes);
    expect(sha256(downloaded)).toBe(out.changeManifest.outputSha256);
    expect(downloaded.equals(sourceBytes)).toBe(false);

    outputPath = join(ARTIFACT_DIR, 'e2e-corrected-type-margin.docx');
    writeFileSync(outputPath, downloaded);
    writeFileSync(join(ARTIFACT_DIR, 'e2e-receipt.json'), JSON.stringify({
      sourceFileId: sourceRecord.fileId, outputFileId: out.outputFile.fileId,
      sourceSha256: sourceSha, outputSha256: sha256(downloaded),
      correctedType: out.profile.documentTypeKey, detectedType: 'quyet_dinh',
      property: out.changeManifest.property, targetId: out.changeManifest.targetId,
      ruleId: out.changeManifest.ruleId, before, after: out.changeManifest.after,
      verification: out.verification, outputPath,
    }, null, 2));
    expect(existsSync(outputPath)).toBe(true);
    expect(sha256(readFileSync(outputPath))).toBe(out.changeManifest.outputSha256);
  }, 180_000);

  it('refuses a corrected type that the profile does not support', async () => {
    const context: never = { user: owner, confirmed: false } as never;
    const rejected = await ServerCapabilityRegistry.execute('document.inspect', { fileId: sourceRecord.fileId, confirmedDocumentTypeKey: 'khong_ton_tai' }, context);
    expect(rejected.success).toBe(false);
  }, 60_000);
});
