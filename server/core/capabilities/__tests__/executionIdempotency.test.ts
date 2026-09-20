import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CapabilityExecutionIdempotencyService, type MutationExecutionRecord } from '../CapabilityExecutionService';
import { CapabilityExecutionService } from '../CapabilityExecutionService';
import { ServerCapabilityRegistry } from '../serverCapabilityRegistry';
import { AuditService } from '../../audit/auditService';
import { storage } from '../../../infrastructure/storage';
import { CapabilityConfirmationService } from '../CapabilityConfirmationService';

class MemoryRepo {
  records = new Map<string, MutationExecutionRecord>();
  async claim(record: MutationExecutionRecord): Promise<any> {
    const existing = this.records.get(record.executionId);
    if (!existing) { this.records.set(record.executionId, record); return { kind: 'claimed', record }; }
    if (existing.userId !== record.userId) return { kind: 'mismatch', reason: 'USER', record: existing };
    if (existing.capabilityId !== record.capabilityId) return { kind: 'mismatch', reason: 'CAPABILITY', record: existing };
    if (existing.inputHash !== record.inputHash) return { kind: 'mismatch', reason: 'INPUT', record: existing };
    if (existing.source !== record.source) return { kind: 'mismatch', reason: 'SOURCE', record: existing };
    if (existing.state === 'SUCCEEDED') return { kind: 'succeeded', record: existing };
    if (existing.state === 'FAILED' && existing.failureKind === 'PRE_HANDLER') { existing.state = 'RUNNING'; existing.failureKind = undefined; return { kind: 'claimed', record: existing }; }
    if (existing.state === 'FAILED') return { kind: 'failed', record: existing };
    return { kind: 'running', record: existing };
  }
  async succeed(id: string, result: any) { Object.assign(this.records.get(id)!, { state: 'SUCCEEDED', result }); }
  async fail(id: string, failureKind: any, errorCode: string) { Object.assign(this.records.get(id)!, { state: 'FAILED', failureKind, errorCode }); }
}

const user = { id: 'owner-1', email: 'owner@example.test', name: 'Owner', roles: ['owner'], permissions: ['tasks.write'] };
const context: any = { user, appContext: { user, availableCapabilities: [] }, confirmed: false };

function registerMutation(handler: any, id = 'test.mutation') {
  ServerCapabilityRegistry.register({ id, moduleId: 'system', description: 'test mutation', inputSchema: z.object({ value: z.string() }).strict(), outputSchema: z.object({ ok: z.literal(true), value: z.string() }).strict(), risk: 'low', sideEffect: 'mutation', confirmationPolicy: 'none', permissions: [], execute: handler });
}

function meta(toolCallId = 'call-12345678', sessionId = 'session-12345678'): any { return { source: 'agent', toolCallId, sessionId }; }

describe('GĐ3 Lượt 2 mutation idempotency', () => {
  let repo: MemoryRepo;
  beforeEach(() => {
    ServerCapabilityRegistry.reset(); repo = new MemoryRepo(); CapabilityExecutionIdempotencyService.setRepositoryForTests(repo as any);
    vi.spyOn(AuditService, 'log').mockResolvedValue({ id: 'audit-1' } as any); vi.spyOn(AuditService, 'update').mockResolvedValue();
    vi.spyOn(storage, 'refreshModuleSettings').mockResolvedValue();
  });
  afterEach(() => { vi.restoreAllMocks(); CapabilityExecutionIdempotencyService.resetRepositoryForTests(); ServerCapabilityRegistry.reset(); });

  it('executes first mutation once and reconciles exact retry', async () => {
    const handler = vi.fn(async (i: any) => ({ ok: true as const, value: i.value })); registerMutation(handler);
    const a = await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, meta());
    const b = await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, meta());
    expect(a.success).toBe(true); expect(b).toEqual(a); expect(handler).toHaveBeenCalledTimes(1);
  });

  it('blocks concurrent duplicate while first execution is running', async () => {
    let release!: () => void; const wait = new Promise<void>(r => release = r);
    const handler = vi.fn(async () => { await wait; return { ok: true as const, value: 'A' }; }); registerMutation(handler);
    const first = CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, meta());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    const duplicate = await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, meta());
    expect(duplicate.errorCode).toBe('EXECUTION_IN_PROGRESS'); release(); await first; expect(handler).toHaveBeenCalledTimes(1);
  });

  it('allows same args for distinct intentional tool calls', async () => {
    const handler = vi.fn(async () => ({ ok: true as const, value: 'A' })); registerMutation(handler);
    await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, meta('call-11111111'));
    await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, meta('call-22222222'));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('fails closed on argument, capability, and user substitution', async () => {
    const handler = vi.fn(async (i: any) => ({ ok: true as const, value: i.value })); registerMutation(handler); registerMutation(handler, 'test.other');
    // Hold a RUNNING record so mismatch checks occur before success reconciliation.
    const identity = CapabilityExecutionIdempotencyService.deriveIdentity(meta())!;
    await CapabilityExecutionIdempotencyService.claim({ identity, userId: user.id, capabilityId: 'test.mutation', rawInput: { value: 'A' } });
    expect((await CapabilityExecutionService.execute('test.mutation', { value: 'B' }, context, meta())).errorCode).toBe('EXECUTION_IDENTITY_MISMATCH');
    expect((await CapabilityExecutionService.execute('test.other', { value: 'A' }, context, meta())).errorCode).toBe('EXECUTION_IDENTITY_MISMATCH');
    const otherContext: any = { ...context, user: { ...user, id: 'owner-2' } };
    expect((await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, otherContext, meta())).errorCode).toBe('EXECUTION_IDENTITY_MISMATCH');
    expect(handler).not.toHaveBeenCalled();
  });

  it('requires stable identity for mutation but leaves read-only path unaffected', async () => {
    const mutation = vi.fn(async () => ({ ok: true as const, value: 'A' })); registerMutation(mutation);
    expect((await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, { source: 'agent' })).errorCode).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const read = vi.fn(async () => ({ ok: true as const, value: 'A' }));
    ServerCapabilityRegistry.register({ id: 'test.read', moduleId: 'system', description: 'read', inputSchema: z.object({ value: z.string() }), outputSchema: z.object({ ok: z.literal(true), value: z.string() }), risk: 'low', sideEffect: 'none', confirmationPolicy: 'none', permissions: [], execute: read });
    expect((await CapabilityExecutionService.execute('test.read', { value: 'A' }, context, { source: 'agent' })).success).toBe(true); expect(read).toHaveBeenCalledOnce();
  });

  it('fails closed after ambiguous handler failure and does not auto-retry', async () => {
    const handler = vi.fn(async () => { throw new Error('after possible side effect'); }); registerMutation(handler);
    const first = await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, meta());
    expect(first.errorCode).toBe('EXECUTION_ERROR');
    const retry = await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, meta());
    expect(retry.errorCode).toBe('EXECUTION_RECONCILIATION_REQUIRED'); expect(handler).toHaveBeenCalledTimes(1);
  });

  it('revalidates stored success output contract during reconciliation', async () => {
    const handler = vi.fn(async () => ({ ok: true as const, value: 'A' })); registerMutation(handler);
    const identity = CapabilityExecutionIdempotencyService.deriveIdentity(meta())!;
    const claim: any = await CapabilityExecutionIdempotencyService.claim({ identity, userId: user.id, capabilityId: 'test.mutation', rawInput: { value: 'A' } });
    await repo.succeed(claim.record.executionId, { success: true, result: { ok: true, value: 42 } });
    expect((await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, meta())).errorCode).toBe('INVALID_OUTPUT'); expect(handler).not.toHaveBeenCalled();
  });
  it('allows a deterministic pre-handler failure to be retried safely', async () => {
    const handler = vi.fn(async (i: any) => ({ ok: true as const, value: i.value })); registerMutation(handler);
    const bad = await CapabilityExecutionService.execute('test.mutation', { value: 42 }, context, meta());
    expect(bad.errorCode).toBe('INVALID_INPUT'); expect(handler).not.toHaveBeenCalled();
    // Identity is bound to the original input, so a corrected input intentionally needs a new logical execution.
    const good = await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, meta('call-new-12345678'));
    expect(good.success).toBe(true); expect(handler).toHaveBeenCalledOnce();
  });

  it('cancellation after handler start is treated as ambiguous and blocks automatic retry', async () => {
    const controller = new AbortController();
    const handler = vi.fn(async () => { controller.abort(); throw new Error('cancelled after start'); }); registerMutation(handler);
    const m: any = { ...meta(), abortSignal: controller.signal };
    const first = await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, { ...context, abortSignal: controller.signal }, m);
    expect(first.errorCode).toBe('EXECUTION_CANCELLED');
    const retry = await CapabilityExecutionService.execute('test.mutation', { value: 'A' }, context, meta());
    expect(retry.errorCode).toBe('EXECUTION_RECONCILIATION_REQUIRED'); expect(handler).toHaveBeenCalledTimes(1);
  });

  it('consumes HITL confirmation before mutation claim and dedupes the confirmed execution', async () => {
    const handler = vi.fn(async (i: any) => ({ ok: true as const, value: i.value }));
    ServerCapabilityRegistry.register({ id: 'test.confirmed', moduleId: 'system', description: 'confirmed mutation', inputSchema: z.object({ value: z.string() }), outputSchema: z.object({ ok: z.literal(true), value: z.string() }), risk: 'high', sideEffect: 'mutation', confirmationPolicy: 'required', permissions: [], execute: handler });
    vi.spyOn(CapabilityConfirmationService, 'consume').mockResolvedValue({ ok: true, confirmationId: 'confirm-1' });
    const first = await CapabilityExecutionService.execute('test.confirmed', { value: 'A' }, context, { ...meta(), confirmationId: 'confirm-1' });
    expect(first.success).toBe(true); expect(handler).toHaveBeenCalledOnce();
    // Confirmation replay remains independently protected and does not get replaced by execution dedupe.
    vi.mocked(CapabilityConfirmationService.consume).mockResolvedValue({ ok: false, confirmationId: 'confirm-1', errorCode: 'CONFIRMATION_REPLAY', errorSummary: 'Already consumed.' } as any);
    const replay = await CapabilityExecutionService.execute('test.confirmed', { value: 'A' }, context, { ...meta(), confirmationId: 'confirm-1' });
    expect(replay.success).toBe(false); expect(handler).toHaveBeenCalledOnce();
    // A fresh valid confirmation for the same logical tool call reaches dedupe and reconciles prior success.
    vi.mocked(CapabilityConfirmationService.consume).mockResolvedValue({ ok: true, confirmationId: 'confirm-2' });
    const retry = await CapabilityExecutionService.execute('test.confirmed', { value: 'A' }, context, { ...meta(), confirmationId: 'confirm-2' });
    expect(retry.success).toBe(true); expect(handler).toHaveBeenCalledOnce();
  });

});
