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

  // Regression guard: the four registry branches below `descriptor.execute`
  // (output-schema violation, non-serializable result, oversized result) all
  // run after the handler may already have committed a side effect. If any of
  // them omits executionStarted, CapabilityExecutionService records PRE_HANDLER
  // and the next attempt with the same identity replays the mutation.
  describe('post-execution failures are never replayed', () => {
    const postExecutionCases: Array<{
      name: string;
      capabilityId: string;
      expectedCode: string;
      descriptor: (handler: any) => any;
      result: any;
    }> = [
      {
        name: 'output schema violation after the handler ran',
        capabilityId: 'test.post.output',
        expectedCode: 'INVALID_OUTPUT',
        result: { ok: false },
        descriptor: (handler: any) => ({
          id: 'test.post.output', moduleId: 'system', description: 'post-execution output violation', inputSchema: z.object({ value: z.string() }).strict(),
          outputSchema: z.object({ ok: z.literal(true) }).strict(), risk: 'low', sideEffect: 'mutation', confirmationPolicy: 'none', permissions: [],
          execute: handler,
        } as any),
      },
      {
        name: 'non-serializable handler result',
        capabilityId: 'test.post.circular',
        expectedCode: 'INVALID_OUTPUT',
        result: (() => { const circular: any = { value: 'A' }; circular.self = circular; return circular; })(),
        descriptor: (handler: any) => ({
          id: 'test.post.circular', moduleId: 'system', description: 'post-execution serialization failure', inputSchema: z.object({ value: z.string() }).strict(),
          risk: 'low', sideEffect: 'mutation', confirmationPolicy: 'none', permissions: [],
          execute: handler,
        } as any),
      },
      {
        name: 'oversized handler result',
        capabilityId: 'test.post.oversized',
        expectedCode: 'RESULT_TOO_LARGE',
        result: { payload: 'x'.repeat(ServerCapabilityRegistry.MAX_RESULT_BYTES + 1024) },
        descriptor: (handler: any) => ({
          id: 'test.post.oversized', moduleId: 'system', description: 'post-execution size failure', inputSchema: z.object({ value: z.string() }).strict(),
          risk: 'low', sideEffect: 'mutation', confirmationPolicy: 'none', permissions: [],
          execute: handler,
        } as any),
      },
    ];

    it.each(postExecutionCases)('does not re-run the handler after $name', async ({ capabilityId, expectedCode, descriptor, result }) => {
      const handler = vi.fn(async () => result);
      ServerCapabilityRegistry.register(descriptor(handler));

      const first = await CapabilityExecutionService.execute(capabilityId, { value: 'A' }, context, meta());
      expect(first.errorCode).toBe(expectedCode);
      expect(first).not.toHaveProperty('executionStarted');
      expect(handler).toHaveBeenCalledTimes(1);

      const retry = await CapabilityExecutionService.execute(capabilityId, { value: 'A' }, context, meta());
      expect(retry.errorCode).toBe('EXECUTION_RECONCILIATION_REQUIRED');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('records the post-execution failure as ambiguous rather than retryable', async () => {
      const handler = vi.fn(async (): Promise<any> => ({ ok: false }));
      ServerCapabilityRegistry.register({
        id: 'test.post.kind', moduleId: 'system', description: 'post-execution output violation', inputSchema: z.object({ value: z.string() }).strict(),
        outputSchema: z.object({ ok: z.literal(true) }).strict(), risk: 'low', sideEffect: 'mutation', confirmationPolicy: 'none', permissions: [],
        execute: handler,
      });
      await CapabilityExecutionService.execute('test.post.kind', { value: 'A' }, context, meta());
      const record = [...repo.records.values()][0];
      expect(record.state).toBe('FAILED');
      expect(record.failureKind).toBe('AMBIGUOUS_POST_START');
      expect(record.errorCode).toBe('INVALID_OUTPUT');
    });
  });

  it('preserves allowlisted domain error codes and collapses unknown exceptions', async () => {
    const domain = vi.fn(async () => { const e: any = new Error('provider detail that must not leak'); e.code = 'STALE_DOCUMENT'; throw e; });
    registerMutation(domain, 'test.domain.stale');
    const stale = await CapabilityExecutionService.execute('test.domain.stale', { value: 'A' }, context, meta());
    expect(stale.errorCode).toBe('STALE_DOCUMENT');
    expect(JSON.stringify(stale)).not.toContain('provider detail');

    const unknown = vi.fn(async () => { throw new Error('raw-secret=abc123'); });
    registerMutation(unknown, 'test.domain.unknown');
    const raw = await CapabilityExecutionService.execute('test.domain.unknown', { value: 'A' }, context, meta('call-unknown-1234'));
    expect(raw.errorCode).toBe('EXECUTION_ERROR');
    expect(raw.error).toBe('Capability execution failed.');
    expect(JSON.stringify(raw)).not.toContain('abc123');
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
