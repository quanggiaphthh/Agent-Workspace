import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CapabilityToolAdapter } from '../CapabilityToolAdapter';
import { CapabilityExecutionService } from '../../../core/capabilities/CapabilityExecutionService';

function toolExecutor(tool: any): (args: unknown, ctx: unknown) => Promise<any> {
  const fn = tool.execute ?? tool.func ?? tool._execute ?? tool.config?.execute;
  if (typeof fn === 'function') return fn.bind(tool);
  if (typeof tool.runAsync === 'function') return async (args, toolContext) => tool.runAsync({ args, toolContext });
  throw new Error('FunctionTool executor is not introspectable in this ADK version.');
}

const trustedUser = {
  id: 'owner', email: 'owner@test.local', name: 'Owner', roles: ['owner'], permissions: ['tasks.write'],
};

const descriptor: any = {
  id: 'system.test.context',
  moduleId: 'system',
  description: 'context test',
  inputSchema: z.object({ value: z.string() }).strict(),
  outputSchema: z.object({ ok: z.literal(true) }).strict(),
  risk: 'low',
  sideEffect: 'none',
  confirmationPolicy: 'none',
  permissions: [],
  execute: async () => ({ ok: true }),
};

describe('Agent trusted ToolContext boundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not let dynamic ADK appContext override request-scoped trusted context', async () => {
    const gateway = vi.spyOn(CapabilityExecutionService, 'execute').mockResolvedValue({ success: true, result: { ok: true } } as any);
    const trustedContext: any = {
      user: trustedUser,
      appContext: {
        user: trustedUser,
        activeModule: 'tasks',
        activeRoute: '/tasks',
        selectedEntity: { moduleId: 'tasks', entityType: 'task', entityId: 'task-safe', label: 'Safe task' },
        availableCapabilities: ['system.test.context'],
        aiConfig: { agentProvider: 'google', agentModel: 'gemini-3.5-flash-lite', credentialId: 'system', autoRotate: false, memoryEnabled: true, webSearchEnabled: false },
      },
      confirmed: false,
    };

    const tool = CapabilityToolAdapter.createTool(descriptor, trustedContext, { sessionId: 'session-safe' });
    await toolExecutor(tool)({ value: 'A' }, {
      functionCallId: 'call-safe',
      appContext: {
        user: { ...trustedUser, id: 'forged' },
        activeModule: 'settings',
        selectedEntity: { moduleId: 'tasks', entityType: 'task', entityId: 'task-forged' },
        aiConfig: { webSearchEnabled: true },
      },
    });

    const executionContext = gateway.mock.calls[0][2] as any;
    expect(executionContext.user.id).toBe('owner');
    expect(executionContext.appContext.activeModule).toBe('tasks');
    expect(executionContext.appContext.selectedEntity.entityId).toBe('task-safe');
    expect(executionContext.appContext.aiConfig.webSearchEnabled).toBe(false);
    expect(executionContext.appContext.availableCapabilities).toEqual([]);
  });

  it('returns safe structured recovery metadata without exposing internal details', async () => {
    vi.spyOn(CapabilityExecutionService, 'execute').mockResolvedValue({
      success: false,
      errorCode: 'INVALID_INPUT',
      error: 'private schema internals',
    } as any);
    const tool = CapabilityToolAdapter.createTool(descriptor, { user: trustedUser, appContext: { user: trustedUser, availableCapabilities: [] } } as any, { sessionId: 'session-safe' });
    const result = await toolExecutor(tool)({ value: 'A' }, { functionCallId: 'call-safe' });

    expect(result).toMatchObject({ success: false, errorCode: 'INVALID_INPUT', retryable: true, requiresUserAction: false });
    expect(result.recoveryHint).toMatch(/schema/i);
    expect(JSON.stringify(result)).not.toContain('private schema internals');
  });
});
