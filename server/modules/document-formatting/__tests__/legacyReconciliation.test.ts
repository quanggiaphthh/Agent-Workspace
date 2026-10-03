import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createHash } from 'crypto';
import { CapabilityExecutionIdempotencyService, type MutationExecutionRecord } from '../../../core/capabilities/CapabilityExecutionService';
import { ServerCapabilityRegistry } from '../../../core/capabilities/serverCapabilityRegistry';
import { storage } from '../../../infrastructure/storage';
import { AuditService } from '../../../core/audit/auditService';
import { createDocumentFormattingCapabilities } from '../registration';
import { bootstrapServer } from '../../../bootstrap';
import { hashCapabilityInput } from '../../../core/capabilities/CapabilityConfirmationPolicy';
import { DOCX_MIME_TYPE } from '../../../../shared/contracts/fileUploadPolicy';

/**
 * Mirrors the gateway's identity binding exactly. Reconciliation can only find a
 * record when it derives the same execution id, owner, capability, source and
 * input hash, so any divergence has to fail closed rather than return a result.
 */
class MemoryRepo {
  records = new Map<string, MutationExecutionRecord>();
  async claim(record: MutationExecutionRecord): Promise<any> {
    const existing = this.records.get(record.executionId);
    if (!existing) { this.records.set(record.executionId, record); return { kind: 'claimed', record }; }
    return { kind: 'running', record: existing };
  }
  async succeed(id: string, result: any) { Object.assign(this.records.get(id)!, { state: 'SUCCEEDED', result }); }
  async fail(id: string, failureKind: any, errorCode: string) { Object.assign(this.records.get(id)!, { state: 'FAILED', failureKind, errorCode }); }
  async inspect(record: Pick<MutationExecutionRecord, 'executionId' | 'userId' | 'capabilityId' | 'inputHash' | 'source'>): Promise<any> {
    const existing = this.records.get(record.executionId);
    if (!existing) return { kind: 'absent' };
    if (existing.userId !== record.userId) return { kind: 'mismatch', reason: 'USER' };
    if (existing.capabilityId !== record.capabilityId) return { kind: 'mismatch', reason: 'CAPABILITY' };
    if (existing.inputHash !== record.inputHash) return { kind: 'mismatch', reason: 'INPUT' };
    if (existing.source !== record.source) return { kind: 'mismatch', reason: 'SOURCE' };
    return { kind: 'found', record: existing };
  }
}

const owner = { id: 'owner-1', email: 'owner@example.test', name: 'Owner', roles: ['owner'], permissions: ['files.read'] };
const otherOwner = { id: 'owner-2', email: 'other@example.test', name: 'Other', roles: ['owner'], permissions: ['files.read'] };
const key = '11111111-2222-3333-4444-555555555555';

const legacyInput = { fileId: 'source-1', sourceSha256: 'a'.repeat(64), paragraphId: 'p1', expectedBefore: 'LEFT' as const, desiredAfter: 'JUSTIFY' as const };

/** Exact pre-profile success payload the earlier build stored. */
const legacyStoredResult = {
  success: true as const,
  sourceFileId: 'source-1',
  outputFile: { fileId: 'output-1', originalName: 'van-ban-formatted.docx', mimeType: DOCX_MIME_TYPE, sizeBytes: 2336, status: 'ready' as const, createdAt: '2026-10-03T00:00:00.000Z' },
  changeManifest: {
    property: 'paragraph.alignment' as const,
    paragraphId: 'p1',
    before: 'LEFT',
    after: 'JUSTIFY',
    sourceSha256: 'a'.repeat(64),
    outputSha256: 'b'.repeat(64),
    appliedAt: '2026-10-03T00:00:00.000Z',
    summary: 'Direct paragraph alignment changed from LEFT to JUSTIFY.',
  },
  verification: { reopened: true as const, revalidated: true as const, sourceUnchanged: true as const, outputInspectionPassed: true as const },
};

function hashInput(input: unknown): string {
  return hashCapabilityInput(input);
}

describe('W3 legacy formatting marker reconciliation', () => {
  let repo: MemoryRepo;
  let descriptor: any;

beforeEach(async () => {
    ServerCapabilityRegistry.reset();
    repo = new MemoryRepo();
    CapabilityExecutionIdempotencyService.setRepositoryForTests(repo as any);
    vi.spyOn(AuditService, 'log').mockResolvedValue({ id: 'audit-1' } as any);
    vi.spyOn(AuditService, 'update').mockResolvedValue();
    vi.spyOn(storage, 'refreshModuleSettings').mockResolvedValue();
    // Registration validates that the owning module exists in the server catalog.
    bootstrapServer();
    // Bootstrap may reset the durable repository, so the test double is injected
    // afterwards; otherwise reconciliation would read the real backend.
    CapabilityExecutionIdempotencyService.setRepositoryForTests(repo as any);
    descriptor = ServerCapabilityRegistry.get('document.reconcileFormatting') as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    CapabilityExecutionIdempotencyService.resetRepositoryForTests();
    ServerCapabilityRegistry.reset();
  });

  /**
   * Seeds the durable execution record exactly as the gateway's claim would have
   * written it, so reconciliation can only find it by deriving the same identity:
   * execution id from the logical key, plus owner, capability, source and the
   * canonical input hash.
   */
  function seed(state: Partial<MutationExecutionRecord>, input: unknown = legacyInput, ownerId = owner.id) {
    const logicalId = `rest:${key}`;
    const executionId = createHash('sha256').update(logicalId).digest('hex');
    const record = {
      executionId,
      userId: ownerId,
      capabilityId: 'document.applyAlignment',
      inputHash: hashCapabilityInput(input),
      source: 'rest' as const,
      logicalId,
      state: 'SUCCEEDED' as const,
      createdAt: '2026-10-03T00:00:00.000Z',
      startedAt: '2026-10-03T00:00:00.000Z',
      ...state,
    } as MutationExecutionRecord;
    repo.records.set(executionId, record);
    return { executionId, record };
  }

  function await_enable() {
    vi.spyOn(storage, 'isPersistenceAvailable').mockReturnValue(true);
  }

  const context: any = { user: owner, appContext: { user: owner }, confirmed: false };

  it('accepts the exact legacy JUSTIFY payload the earlier build dispatched', async () => {
    // A record hashed from the real legacy wire values must be findable.
    seed({ state: 'SUCCEEDED', result: { success: true, result: legacyStoredResult } as any });
    const parsed = descriptor.inputSchema.safeParse({ idempotencyKey: key, dispatchedInput: legacyInput });
    expect(parsed.success).toBe(true);
  });

  it('reports a legacy success and returns the canonical artifact without inventing a profile', async () => {
    seed({ state: 'SUCCEEDED', result: { success: true, result: legacyStoredResult } as any });
    const result = await descriptor.execute({ idempotencyKey: key, dispatchedInput: legacyInput }, context);
    expect(result).toMatchObject({ outcome: 'succeeded', outputContract: 'legacy_alignment', evidenceUnavailable: false });
    expect(result.legacyOutputFile).toEqual(legacyStoredResult.outputFile);
    expect(result.legacyChange).toMatchObject({ paragraphId: 'p1', before: 'LEFT', after: 'JUSTIFY' });
    // No profile binding may be fabricated for a pre-profile record.
    expect(result.output).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('profileId');
    expect(JSON.stringify(result)).not.toContain('HOATIEU');
  });

  it('reports an in-flight record as unresolved and never claims it', async () => {
    seed({ state: 'RUNNING' });
    const result = await descriptor.execute({ idempotencyKey: key, dispatchedInput: legacyInput }, context);
    expect(result).toMatchObject({ outcome: 'in_flight', outputContract: 'none' });
    expect(repo.records.size).toBe(1);
    expect(repo.records.get([...repo.records.keys()][0])!.state).toBe('RUNNING');
  });

  it('reports an ambiguous post-start failure without claiming no document was written', async () => {
    seed({ state: 'FAILED', failureKind: 'AMBIGUOUS_POST_START' as any, errorCode: 'OUTPUT_INTEGRITY_FAILED' });
    const result = await descriptor.execute({ idempotencyKey: key, dispatchedInput: legacyInput }, context);
    expect(result).toMatchObject({ outcome: 'failed', outputContract: 'none', recordedFailureKind: 'AMBIGUOUS_POST_START', recordedErrorCode: 'OUTPUT_INTEGRITY_FAILED' });
  });

  it('marks a pre-handler failure as the only provably side-effect-free case', async () => {
    seed({ state: 'FAILED', failureKind: 'PRE_HANDLER' as any, errorCode: 'STALE_DOCUMENT' });
    const result = await descriptor.execute({ idempotencyKey: key, dispatchedInput: legacyInput }, context);
    expect(result).toMatchObject({ outcome: 'failed', recordedFailureKind: 'PRE_HANDLER' });
  });

  it('reports a missing record without asserting that nothing was created', async () => {
    const result = await descriptor.execute({ idempotencyKey: key, dispatchedInput: legacyInput }, context);
    expect(result).toMatchObject({ outcome: 'no_record', outputContract: 'none', evidenceUnavailable: false });
  });

  it('hides another owner record behind no_record instead of leaking it', async () => {
    seed({ state: 'SUCCEEDED', result: { success: true, result: legacyStoredResult } as any }, legacyInput, otherOwner.id);
    const result = await descriptor.execute({ idempotencyKey: key, dispatchedInput: legacyInput }, context);
    expect(result).toMatchObject({ outcome: 'no_record', outputContract: 'none' });
    expect(result.legacyOutputFile).toBeUndefined();
  });

  it('rejects a payload that does not hash to the stored identity', async () => {
    seed({ state: 'SUCCEEDED', result: { success: true, result: legacyStoredResult } as any });
    const tampered = { ...legacyInput, desiredAfter: 'RIGHT' as const };
    const result = await descriptor.execute({ idempotencyKey: key, dispatchedInput: tampered }, context);
    expect(result).toMatchObject({ outcome: 'no_record', outputContract: 'none' });
  });

  it('rejects the legacy shape on the mutation capability and requires confirmation on apply', () => {
    const apply = ServerCapabilityRegistry.get('document.applyAlignment')!;
    const legacyParsed = apply.inputSchema.safeParse(legacyInput);
    expect(legacyParsed.success).toBe(false);
    expect(apply.confirmationPolicy).toBe('required');
    expect(apply.sideEffect).toBe('mutation');
    const reconcileParsed = descriptor.inputSchema.safeParse({ idempotencyKey: key, dispatchedInput: legacyInput });
    expect(reconcileParsed.success).toBe(true);
    expect(z.string().safeParse(key).success).toBe(true);
  });
});