import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ServerCapabilityRegistry } from '../../../core/capabilities/serverCapabilityRegistry';
import { CapabilityToolNameRegistry } from '../../../core/capabilities/capabilityToolNameRegistry';
import { assertUniqueAgentToolNames, filterAgentCapabilitiesForConfig } from '../RootAgent';
import { AIConfigSchema } from '../../../../shared/contracts/ai';
import { storage } from '../../../infrastructure/storage';
import { serverModuleCatalog } from '../../../core/modules/moduleCatalog';
import { registerPackagedServerModules } from '../../../bootstrap';

const user = { id: 'owner', email: 'owner@test.local', name: 'Owner', roles: ['user'], permissions: ['tasks.read', 'web.search'] };
const context: any = { user, appContext: { user, availableCapabilities: [] } };
function cap(id: string, moduleId = 'system', permissions: string[] = []) { return { id, moduleId, description: id, inputSchema: z.object({}).strict(), outputSchema: z.object({ ok: z.boolean() }), risk: 'low' as const, sideEffect: 'none' as const, confirmationPolicy: 'none' as const, permissions, execute: async () => ({ ok: true }) }; }

describe('GĐ3 Lượt 3 server-authoritative tool discovery', () => {
  beforeEach(() => { ServerCapabilityRegistry.reset(); CapabilityToolNameRegistry.reset(); serverModuleCatalog.reset(); registerPackagedServerModules(); storage.initialize(serverModuleCatalog.listAll(), true); });
  it('includes available capabilities and excludes permission/module filtered capabilities', async () => {
    ServerCapabilityRegistry.register(cap('allowed'));
    ServerCapabilityRegistry.register(cap('denied', 'system', ['tasks.write']));
    ServerCapabilityRegistry.register(cap('tasks.module', 'tasks', ['tasks.read']));
    expect((await ServerCapabilityRegistry.listForContext(context)).map(c => c.id)).toEqual(expect.arrayContaining(['allowed', 'tasks.module']));
    expect((await ServerCapabilityRegistry.listForContext(context)).map(c => c.id)).not.toContain('denied');
    storage.getData().moduleSettings.tasks.enabled = false;
    expect((await ServerCapabilityRegistry.listForContext(context)).map(c => c.id)).not.toContain('tasks.module');
  });
  it('removes Web Search at discovery time when server config disables it', () => {
    const off = AIConfigSchema.parse({ webSearchEnabled: false }); const on = AIConfigSchema.parse({ webSearchEnabled: true });
    const caps = [{ id: 'system.web.search' }, { id: 'allowed' }];
    expect(filterAgentCapabilitiesForConfig(caps, off).map(c => c.id)).toEqual(['allowed']);
    expect(filterAgentCapabilitiesForConfig(caps, on).map(c => c.id)).toContain('system.web.search');
  });
  it('rejects any tool-name collision before constructing the ADK tool list', () => {
    const spy = vi.spyOn(CapabilityToolNameRegistry, 'getToolName').mockReturnValue('same_tool');
    expect(() => assertUniqueAgentToolNames([{ id: 'one' }, { id: 'two' }])).toThrow(/collision/i);
    spy.mockRestore();
  });
  it('fails lookup of an unknown or forged function name deterministically', () => {
    expect(CapabilityToolNameRegistry.getCapabilityId('forged_tool_name')).toBeUndefined();
    expect(CapabilityToolNameRegistry.getCapabilityId('cap_nothex')).toBeUndefined();
  });
  it('permission denial alone removes a capability from discovery', async () => {
    ServerCapabilityRegistry.register(cap('permission.only', 'system', ['tasks.write']));
    expect((await ServerCapabilityRegistry.listForContext(context)).map(c => c.id)).not.toContain('permission.only');
  });
  it('disabled module alone removes a capability from discovery', async () => {
    ServerCapabilityRegistry.register(cap('module.only', 'tasks', ['tasks.read']));
    storage.getData().moduleSettings.tasks.enabled = false;
    expect((await ServerCapabilityRegistry.listForContext(context)).map(c => c.id)).not.toContain('module.only');
  });
  it('uses an order-independent reversible tool-name mapping and rejects invalid/oversized IDs', () => {
    const firstA = CapabilityToolNameRegistry.getToolName('a-b'); const firstB = CapabilityToolNameRegistry.getToolName('a_b');
    CapabilityToolNameRegistry.reset(); const secondB = CapabilityToolNameRegistry.getToolName('a_b'); const secondA = CapabilityToolNameRegistry.getToolName('a-b');
    expect(secondA).toBe(firstA); expect(secondB).toBe(firstB); expect(firstA).not.toBe(firstB);
    expect(CapabilityToolNameRegistry.getCapabilityId(firstA)).toBe('a-b');
    expect(() => CapabilityToolNameRegistry.getToolName('x'.repeat(100))).toThrow(/tool name|length|unsupported/i);
  });
});
