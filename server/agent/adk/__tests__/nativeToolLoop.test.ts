import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseLlm, InMemoryRunner, LlmAgent, type LlmRequest } from '@google/adk';
import { z } from 'zod';
import { CapabilityToolAdapter } from '../CapabilityToolAdapter';
import { ServerCapabilityRegistry } from '../../../core/capabilities/serverCapabilityRegistry';
import { CapabilityToolNameRegistry } from '../../../core/capabilities/capabilityToolNameRegistry';
import { AuditService } from '../../../core/audit/auditService';
import { storage } from '../../../infrastructure/storage';

const user = { id: 'owner', email: 'owner@test.local', name: 'Owner', roles: ['owner'], permissions: [] };
const context: any = { user, appContext: { user, availableCapabilities: [] } };

class TwoToolModel extends BaseLlm {
  calls = 0;
  constructor(private readonly first: string, private readonly second: string) { super({ model: 'fake-two-tool-model' }); }
  override async *generateContentAsync(_request: LlmRequest): AsyncGenerator<any, void> {
    this.calls += 1;
    if (this.calls === 1) { yield { content: { role: 'model', parts: [{ functionCall: { id: 'call-A-12345678', name: this.first, args: { value: 'A' } } }] } }; return; }
    if (this.calls === 2) { yield { content: { role: 'model', parts: [{ functionCall: { id: 'call-B-12345678', name: this.second, args: { value: 'B' } } }] } }; return; }
    yield { content: { role: 'model', parts: [{ text: 'Hoàn tất hai công cụ.' }] } };
  }
  override async connect(): Promise<any> { throw new Error('not used'); }
}

describe('GĐ3 Lượt 3 native ADK multi-step tool loop', () => {
  beforeEach(() => { ServerCapabilityRegistry.reset(); CapabilityToolNameRegistry.reset(); vi.spyOn(AuditService, 'log').mockResolvedValue({ id: 'audit' } as any); vi.spyOn(AuditService, 'update').mockResolvedValue(); vi.spyOn(storage, 'refreshModuleSettings').mockResolvedValue(); });
  afterEach(() => vi.restoreAllMocks());

  it('returns each FunctionResponse to ADK, continues reasoning, executes a second tool, then emits final text with coherent correlation', async () => {
    const executed: string[] = [];
    const make = (id: string) => ({ id, moduleId: 'system', description: id, inputSchema: z.object({ value: z.string() }), outputSchema: z.object({ value: z.string() }), risk: 'low' as const, sideEffect: 'none' as const, confirmationPolicy: 'none' as const, permissions: [], execute: async ({ value }: any) => { executed.push(`${id}:${value}`); return { value }; } });
    const a = make('test.toolA'); const b = make('test.toolB'); ServerCapabilityRegistry.register(a); ServerCapabilityRegistry.register(b);
    const nameA = CapabilityToolNameRegistry.getToolName(a.id); const nameB = CapabilityToolNameRegistry.getToolName(b.id);
    const model = new TwoToolModel(nameA, nameB);
    const agent = new LlmAgent({ name: 'loop_test', model, instruction: 'test', tools: [CapabilityToolAdapter.createTool(a, context, { sessionId: 'session-loop-12345678' }), CapabilityToolAdapter.createTool(b, context, { sessionId: 'session-loop-12345678' })] });
    const runner = new InMemoryRunner({ agent, appName: 'loop-test' });
    const session = await runner.sessionService.createSession({ appName: 'loop-test', userId: user.id, sessionId: 'session-loop-12345678' });
    const events: any[] = [];
    for await (const event of runner.runAsync({ userId: user.id, sessionId: session.id, newMessage: { role: 'user', parts: [{ text: 'run two tools' }] } as any, runConfig: { maxLlmCalls: 6 } as any })) events.push(event);
    expect(executed).toEqual(['test.toolA:A', 'test.toolB:B']); expect(model.calls).toBe(3);
    const parts = events.flatMap(e => e.content?.parts || []);
    expect(parts.some(p => p.functionResponse?.id === 'call-A-12345678' && p.functionResponse?.name === nameA)).toBe(true);
    expect(parts.some(p => p.functionResponse?.id === 'call-B-12345678' && p.functionResponse?.name === nameB)).toBe(true);
    expect(parts.some(p => p.text === 'Hoàn tất hai công cụ.')).toBe(true);
  });
});
