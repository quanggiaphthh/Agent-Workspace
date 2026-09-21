import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CapabilityToolAdapter } from '../CapabilityToolAdapter';
import { CapabilityExecutionService, CapabilityExecutionIdempotencyService, type MutationExecutionRecord } from '../../../core/capabilities/CapabilityExecutionService';
import { ServerCapabilityRegistry } from '../../../core/capabilities/serverCapabilityRegistry';
import { CapabilityToolNameRegistry } from '../../../core/capabilities/capabilityToolNameRegistry';
import { AuditService } from '../../../core/audit/auditService';
import { CapabilityConfirmationService } from '../../../core/capabilities/CapabilityConfirmationService';
import { storage } from '../../../infrastructure/storage';
import { createExecutionDeadline } from '../../../core/runtime/executionDeadline';

class MemoryRepo {
  records = new Map<string, MutationExecutionRecord>();
  async claim(record: MutationExecutionRecord): Promise<any> {
    const existing = this.records.get(record.executionId);
    if (!existing) { this.records.set(record.executionId, record); return { kind: 'claimed', record }; }
    if (existing.userId !== record.userId) return { kind: 'mismatch', reason: 'USER', record: existing };
    if (existing.capabilityId !== record.capabilityId) return { kind: 'mismatch', reason: 'CAPABILITY', record: existing };
    if (existing.inputHash !== record.inputHash) return { kind: 'mismatch', reason: 'INPUT', record: existing };
    if (existing.state === 'SUCCEEDED') return { kind: 'succeeded', record: existing };
    if (existing.state === 'FAILED') return { kind: 'failed', record: existing };
    return { kind: 'running', record: existing };
  }
  async succeed(id: string, result: any) { Object.assign(this.records.get(id)!, { state: 'SUCCEEDED', result }); }
  async fail(id: string, failureKind: any, errorCode: string) { Object.assign(this.records.get(id)!, { state: 'FAILED', failureKind, errorCode }); }
}

const user = { id: 'owner', email: 'owner@test.local', name: 'Owner', roles: ['owner'], permissions: ['tasks.write', 'web.search'] };
const context: any = { user, appContext: { user, availableCapabilities: [] }, confirmed: false };

function descriptor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test.read', moduleId: 'system', description: 'test tool',
    inputSchema: z.object({ value: z.string() }).strict(),
    outputSchema: z.object({ ok: z.literal(true), value: z.string() }).strict(),
    risk: 'low' as const, sideEffect: 'none' as const, confirmationPolicy: 'none' as const,
    permissions: [], execute: async ({ value }: any) => ({ ok: true as const, value }), ...overrides,
  } as any;
}

function toolExecutor(tool: any): (args: unknown, ctx: unknown) => Promise<any> {
  const fn = tool.execute ?? tool.func ?? tool._execute ?? tool.config?.execute;
  if (typeof fn === 'function') return fn.bind(tool);
  if (typeof tool.runAsync === 'function') return async (args, toolContext) => tool.runAsync({ args, toolContext });
  throw new Error('FunctionTool executor is not introspectable in this ADK version.');
}

describe('GĐ3 Lượt 3 canonical ADK capability tool bridge', () => {
  let repo: MemoryRepo;
  beforeEach(() => {
    ServerCapabilityRegistry.reset(); CapabilityToolNameRegistry.reset();
    repo = new MemoryRepo(); CapabilityExecutionIdempotencyService.setRepositoryForTests(repo as any);
    vi.spyOn(AuditService, 'log').mockResolvedValue({ id: 'audit-1' } as any);
    vi.spyOn(AuditService, 'update').mockResolvedValue();
    vi.spyOn(storage, 'refreshModuleSettings').mockResolvedValue();
    vi.spyOn(CapabilityConfirmationService, 'prepare').mockResolvedValue({ confirmationId: 'confirm-1', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    vi.spyOn(CapabilityConfirmationService, 'reject').mockResolvedValue({ ok: true, confirmationId: 'confirm-1' } as any);
  });
  afterEach(() => { vi.restoreAllMocks(); CapabilityExecutionIdempotencyService.resetRepositoryForTests(); ServerCapabilityRegistry.reset(); CapabilityToolNameRegistry.reset(); });

  it('maps a FunctionTool execution through CapabilityExecutionService and preserves functionCallId/session identity', async () => {
    const cap = descriptor(); ServerCapabilityRegistry.register(cap);
    const gateway = vi.spyOn(CapabilityExecutionService, 'execute');
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678', abortSignal: new AbortController().signal });
    const result = await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-12345678' });
    expect(result.success).toBe(true);
    expect(gateway).toHaveBeenCalledWith('test.read', { value: 'A' }, expect.anything(), expect.objectContaining({ source: 'agent', sessionId: 'session-12345678', toolCallId: 'call-12345678' }));
  });

  it('rejects malformed args in the canonical gateway rather than invoking the handler', async () => {
    const handler = vi.fn(async () => ({ ok: true as const, value: 'x' })); const cap = descriptor({ execute: handler }); ServerCapabilityRegistry.register(cap);
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' });
    const result = await toolExecutor(tool)({ value: 42 }, { functionCallId: 'call-12345678' });
    expect(result).toMatchObject({ success: false, errorCode: 'INVALID_INPUT' }); expect(handler).not.toHaveBeenCalled();
  });

  it('sanitizes handler failures before they can become FunctionResponse payloads', async () => {
    const cap = descriptor({ execute: async () => { throw new Error('secret-stack-token'); } }); ServerCapabilityRegistry.register(cap);
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' });
    const result = await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-12345678' });
    expect(result).toMatchObject({ success: false, errorCode: 'EXECUTION_ERROR' });
    expect(JSON.stringify(result)).not.toContain('secret-stack-token');
  });

  it('does not turn invalid or oversized output into successful tool responses', async () => {
    let cap = descriptor({ execute: async () => ({ ok: 'bad', value: 'x' }) }); ServerCapabilityRegistry.register(cap);
    let tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' });
    expect(await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-a1234567' })).toMatchObject({ success: false, errorCode: 'INVALID_OUTPUT' });
    ServerCapabilityRegistry.reset();
    cap = descriptor({ outputSchema: z.object({ value: z.string() }), execute: async () => ({ value: 'x'.repeat(ServerCapabilityRegistry.MAX_RESULT_BYTES + 1) }) }); ServerCapabilityRegistry.register(cap);
    tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' });
    const large = await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-b1234567' });
    expect(large).toMatchObject({ success: false, errorCode: 'RESULT_TOO_LARGE' }); expect(JSON.stringify(large).length).toBeLessThan(2048);
  });

  it('uses the same logical mutation identity on retry and distinct functionCallId as an independent execution', async () => {
    const handler = vi.fn(async ({ value }: any) => ({ ok: true as const, value }));
    const cap = descriptor({ id: 'test.mutation', sideEffect: 'mutation', execute: handler }); ServerCapabilityRegistry.register(cap);
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' }); const execute = toolExecutor(tool);
    await execute({ value: 'A' }, { functionCallId: 'call-11111111' });
    await execute({ value: 'A' }, { functionCallId: 'call-11111111' });
    await execute({ value: 'A' }, { functionCallId: 'call-22222222' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('requests HITL before mutation execution, resumes exact call after approval, and never executes rejection', async () => {
    const handler = vi.fn(async ({ value }: any) => ({ ok: true as const, value }));
    const cap = descriptor({ id: 'test.confirmed', risk: 'high', sideEffect: 'mutation', confirmationPolicy: 'required', execute: handler }); ServerCapabilityRegistry.register(cap);
    vi.spyOn(CapabilityConfirmationService, 'consume').mockResolvedValue({ ok: true, confirmationId: 'confirm-1' } as any);
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' }); const execute = toolExecutor(tool);
    const requestConfirmation = vi.fn(async () => undefined);
    const pending = await execute({ value: 'A' }, { functionCallId: 'call-12345678', requestConfirmation });
    expect(pending.requiresConfirmation).toBe(true); expect(requestConfirmation).toHaveBeenCalledOnce(); expect(handler).not.toHaveBeenCalled();
    const approved = await execute({ value: 'A' }, { functionCallId: 'call-12345678', toolConfirmation: { confirmed: true, payload: { confirmationId: pending.confirmationId } }, requestConfirmation });
    expect(approved.success).toBe(true); expect(handler).toHaveBeenCalledOnce();
    const rejected = await execute({ value: 'B' }, { functionCallId: 'call-87654321', toolConfirmation: { confirmed: false, payload: { confirmationId: 'confirm-x' } }, requestConfirmation });
    expect(rejected.errorCode).toBe('CONFIRMATION_REJECTED'); expect(handler).toHaveBeenCalledOnce();
  });

  it('fails closed if a discovered capability later becomes unauthorized', async () => {
    const cap = descriptor({ permissions: ['tasks.write'] }); ServerCapabilityRegistry.register(cap);
    const deniedContext: any = { user: { ...user, permissions: [] }, appContext: { user: { ...user, permissions: [] }, availableCapabilities: [] } };
    const tool = CapabilityToolAdapter.createTool(cap, deniedContext, { sessionId: 'session-12345678' });
    expect(await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-12345678' })).toMatchObject({ success: false, errorCode: 'PERMISSION_DENIED' });
  });

  it('fails closed if Web Search is disabled at execution time even for a stale tool object', async () => {
    const cap = descriptor({ id: 'system.web.search' }); ServerCapabilityRegistry.register(cap);
    const off: any = { ...context, appContext: { ...context.appContext, aiConfig: { webSearchEnabled: false } } };
    const tool = CapabilityToolAdapter.createTool(cap, off, { sessionId: 'session-12345678' });
    expect(await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-12345678' })).toMatchObject({ success: false, errorCode: 'CAPABILITY_DISABLED' });
  });

  it('preserves the exact functionCallId in canonical gateway metadata', async () => {
    const cap = descriptor(); ServerCapabilityRegistry.register(cap); const gateway = vi.spyOn(CapabilityExecutionService, 'execute');
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' });
    await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'provider-call-exact-1' });
    expect(gateway.mock.calls.at(-1)?.[3]).toMatchObject({ toolCallId: 'provider-call-exact-1' });
  });

  it('does not invoke a mutation handler before required confirmation', async () => {
    const handler = vi.fn(async ({ value }: any) => ({ ok: true as const, value }));
    const cap = descriptor({ id: 'test.pending', risk: 'high', sideEffect: 'mutation', confirmationPolicy: 'required', execute: handler }); ServerCapabilityRegistry.register(cap);
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' });
    const pending = await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-pending-123', requestConfirmation: vi.fn(async () => undefined) });
    expect(pending.errorCode).toBe('CONFIRMATION_REQUIRED'); expect(handler).not.toHaveBeenCalled();
  });

  it('does not execute a rejected confirmation', async () => {
    const handler = vi.fn(async ({ value }: any) => ({ ok: true as const, value }));
    const cap = descriptor({ id: 'test.reject', risk: 'high', sideEffect: 'mutation', confirmationPolicy: 'required', execute: handler }); ServerCapabilityRegistry.register(cap);
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' });
    const rejected = await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-reject-1234', toolConfirmation: { confirmed: false, payload: { confirmationId: 'confirm-1' } } });
    expect(rejected.errorCode).toBe('CONFIRMATION_REJECTED'); expect(handler).not.toHaveBeenCalled();
  });

  it('keeps oversized raw output out of the safe tool failure payload', async () => {
    const secret = 'SECRET'.repeat(ServerCapabilityRegistry.MAX_RESULT_BYTES);
    const cap = descriptor({ outputSchema: z.object({ value: z.string() }), execute: async () => ({ value: secret }) }); ServerCapabilityRegistry.register(cap);
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' });
    const result = await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-large-12345' });
    expect(result.errorCode).toBe('RESULT_TOO_LARGE'); expect(JSON.stringify(result)).not.toContain('SECRETSECRET');
  });

  it('sanitizes invalid output without echoing raw handler data', async () => {
    const cap = descriptor({ execute: async () => ({ ok: 'bad', value: 'PRIVATE_RAW_VALUE' }) }); ServerCapabilityRegistry.register(cap);
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' });
    const result = await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-invalid-123' });
    expect(result.errorCode).toBe('INVALID_OUTPUT'); expect(JSON.stringify(result)).not.toContain('PRIVATE_RAW_VALUE');
  });

  it('returns deterministic safe failure when mutation identity is missing', async () => {
    const cap = descriptor({ id: 'test.noidentity', sideEffect: 'mutation' }); ServerCapabilityRegistry.register(cap);
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' });
    const result = await toolExecutor(tool)({ value: 'A' }, {});
    expect(result).toMatchObject({ success: false, errorCode: 'IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('does not expose internal error text from a thrown tool exception', async () => {
    const cap = descriptor({ execute: async () => { throw Object.assign(new Error('credential=private-key'), { code: 'DB_INTERNAL' }); } }); ServerCapabilityRegistry.register(cap);
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678' });
    const result = await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-error-12345' });
    expect(result.error).toBe('Tool execution failed.'); expect(JSON.stringify(result)).not.toContain('private-key');
  });

  it('uses trusted server session identity instead of any model argument named sessionId', async () => {
    const cap = descriptor({ inputSchema: z.object({ value: z.string(), sessionId: z.string().optional() }).strict() }); ServerCapabilityRegistry.register(cap); const gateway = vi.spyOn(CapabilityExecutionService, 'execute');
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'trusted-session-12345678' });
    await toolExecutor(tool)({ value: 'A', sessionId: 'forged-session' }, { functionCallId: 'call-12345678' });
    expect(gateway.mock.calls.at(-1)?.[3]).toMatchObject({ sessionId: 'trusted-session-12345678' });
  });

  it('propagates the request abort signal into the canonical gateway', async () => {
    const controller = new AbortController(); const cap = descriptor(); ServerCapabilityRegistry.register(cap); controller.abort();
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678', abortSignal: controller.signal });
    const result = await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-12345678' });
    expect(result).toMatchObject({ success: false, errorCode: 'EXECUTION_CANCELLED' });
  });

  it('propagates the existing GĐ2 execution deadline signal without creating a tool-local timeout', async () => {
    vi.useFakeTimers();
    const parent = new AbortController(); const deadline = createExecutionDeadline(parent.signal, 50);
    const cap = descriptor(); ServerCapabilityRegistry.register(cap);
    const tool = CapabilityToolAdapter.createTool(cap, context, { sessionId: 'session-12345678', abortSignal: deadline.signal });
    await vi.advanceTimersByTimeAsync(51);
    const result = await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-timeout-1234' });
    expect(result).toMatchObject({ success: false, errorCode: 'EXECUTION_CANCELLED' });
    deadline.cleanup(); vi.useRealTimers();
  });
});
