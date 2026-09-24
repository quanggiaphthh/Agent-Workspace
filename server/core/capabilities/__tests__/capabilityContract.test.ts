import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { bootstrapServer } from '../../../bootstrap';
import { ServerCapabilityRegistry } from '../serverCapabilityRegistry';
import { storage } from '../../../infrastructure/storage';
import { serverModuleCatalog } from '../../modules/moduleCatalog';
import { CapabilityToolNameRegistry } from '../capabilityToolNameRegistry';
import { filterAgentCapabilitiesForConfig } from '../../../agent/adk/RootAgent';
import { AIConfigSchema } from '../../../../shared/contracts/ai';
import { packagedServerModules, registerPackagedServerModules } from '../../../bootstrap';
import { registerTasksCapabilities } from '../../../modules/tasks/registration';
import { registerSystemCapabilities } from '../systemCapabilities';

const user = { id: 'owner', email: 'owner@test.local', name: 'Owner', roles: ['user'], permissions: ['tasks.read', 'tasks.write', 'web.search'] };
const context = { user, appContext: { user, availableCapabilities: [] }, confirmed: false };

function descriptor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test.capability', moduleId: 'system', description: 'test', inputSchema: z.object({}).strict(),
    outputSchema: z.object({ ok: z.boolean() }).strict(), risk: 'low' as const, permissions: [],
    sideEffect: 'none' as const, confirmationPolicy: 'none' as const,
    execute: async () => ({ ok: true }), ...overrides,
  } as any;
}

describe('GĐ3 L1 capability contract and registry hardening', () => {
  beforeEach(() => {
    ServerCapabilityRegistry.reset();
    CapabilityToolNameRegistry.reset();
    serverModuleCatalog.reset();
    registerPackagedServerModules();
    storage.initialize(serverModuleCatalog.listAll(), true);
  });

  it('registers packaged Task metadata exactly once through the canonical ServerModuleCatalog', () => {
    expect(packagedServerModules.filter(module => module.metadata.id === 'tasks')).toHaveLength(1);
    expect(serverModuleCatalog.listAll().filter(module => module.id === 'tasks')).toHaveLength(1);
    expect(serverModuleCatalog.get('tasks')).toMatchObject({ id: 'tasks', canDisable: true, version: '1.0.0' });
  });

  it('keeps Task capability ownership outside the system capability registrar', () => {
    registerSystemCapabilities();
    expect(ServerCapabilityRegistry.listAll().some(capability => capability.id.startsWith('system.tasks.'))).toBe(false);
    registerTasksCapabilities();
    expect(ServerCapabilityRegistry.listAll().filter(capability => capability.moduleId === 'tasks').map(capability => capability.id).sort())
      .toEqual(['system.tasks.create', 'system.tasks.list']);
  });

  it('keeps the canonical nine-capability inventory with explicit semantics', () => {
    bootstrapServer();
    const caps = ServerCapabilityRegistry.listAll();
    expect(caps.map(c => c.id).sort()).toEqual([
      'system.memory.add','system.memory.query','system.tasks.create','system.tasks.list','system.web.search',
      'ui.openEntity','ui.openModule','ui.refresh','ui.showNotification',
    ].sort());
    expect(caps).toHaveLength(9);
    expect(caps.every(c => !!c.sideEffect && ['none','mutation','ui-local'].includes(c.sideEffect))).toBe(true);
    expect(caps.every(c => !!c.confirmationPolicy && ['none','required'].includes(c.confirmationPolicy))).toBe(true);
  });

  it('rejects duplicate capability IDs', () => {
    ServerCapabilityRegistry.register(descriptor());
    expect(() => ServerCapabilityRegistry.register(descriptor())).toThrow(/duplicate/i);
  });

  it('rejects malformed descriptors and unknown permissions', () => {
    expect(() => ServerCapabilityRegistry.register(descriptor({ execute: undefined }))).toThrow(/handler|execute/i);
    expect(() => ServerCapabilityRegistry.register(descriptor({ inputSchema: {} }))).toThrow(/input schema/i);
    expect(() => ServerCapabilityRegistry.register(descriptor({ permissions: ['unknown.permission'] }))).toThrow(/permission/i);
    expect(() => ServerCapabilityRegistry.register(descriptor({ confirmationPolicy: 'sometimes' }))).toThrow(/confirmation/i);
    expect(() => ServerCapabilityRegistry.register(descriptor({ moduleId: 'missing-module' }))).toThrow(/module/i);
  });

  it('requires explicit confirmation metadata to be consistent with side effects', () => {
    expect(() => ServerCapabilityRegistry.register(descriptor({ sideEffect: 'none', confirmationPolicy: 'required' }))).toThrow(/confirmation|side-effect/i);
  });

  it('uses explicit confirmation policy independently from risk', async () => {
    ServerCapabilityRegistry.register(descriptor({ risk: 'low', sideEffect: 'mutation', confirmationPolicy: 'required' }));
    expect((await ServerCapabilityRegistry.execute('test.capability', {}, context as any)).requiresConfirmation).toBe(true);
    ServerCapabilityRegistry.reset();
    ServerCapabilityRegistry.register(descriptor({ risk: 'high', sideEffect: 'mutation', confirmationPolicy: 'none' }));
    expect((await ServerCapabilityRegistry.execute('test.capability', {}, context as any)).success).toBe(true);
  });

  it('preserves high-risk confirmation compatibility when legacy metadata is omitted', async () => {
    ServerCapabilityRegistry.register(descriptor({ risk: 'high', sideEffect: undefined, confirmationPolicy: undefined }));
    const cap = ServerCapabilityRegistry.get('test.capability')!;
    expect(cap.sideEffect).toBe('mutation');
    expect(cap.confirmationPolicy).toBe('required');
    const result = await ServerCapabilityRegistry.execute(cap.id, {}, context as any);
    expect(result.requiresConfirmation).toBe(true);
  });

  it('validates declared output schemas and rejects invalid handler output deterministically', async () => {
    ServerCapabilityRegistry.register(descriptor({ execute: async () => ({ ok: true }) }));
    expect((await ServerCapabilityRegistry.execute('test.capability', {}, context as any)).success).toBe(true);
    ServerCapabilityRegistry.reset();
    ServerCapabilityRegistry.register(descriptor({ execute: async () => ({ ok: 'not-boolean', secret: 'raw-value' }) }));
    const invalid = await ServerCapabilityRegistry.execute('test.capability', {}, context as any);
    expect(invalid.success).toBe(false);
    expect(invalid.errorCode).toBe('INVALID_OUTPUT');
    expect(JSON.stringify(invalid)).not.toContain('raw-value');
  });

  it('accepts normal and near-bound results but rejects oversized serialized UTF-8 output', async () => {
    const max = ServerCapabilityRegistry.MAX_RESULT_BYTES;
    const make = (length: number) => descriptor({ outputSchema: z.object({ value: z.string() }), execute: async () => ({ value: 'a'.repeat(length) }) });
    ServerCapabilityRegistry.register(make(100));
    expect((await ServerCapabilityRegistry.execute('test.capability', {}, context as any)).success).toBe(true);
    ServerCapabilityRegistry.reset();
    ServerCapabilityRegistry.register(make(max - 64));
    expect((await ServerCapabilityRegistry.execute('test.capability', {}, context as any)).success).toBe(true);
    ServerCapabilityRegistry.reset();
    ServerCapabilityRegistry.register(make(max + 1));
    const tooLarge = await ServerCapabilityRegistry.execute('test.capability', {}, context as any);
    expect(tooLarge.errorCode).toBe('RESULT_TOO_LARGE');
  });

  it('counts nested and multibyte Unicode results by serialized UTF-8 bytes', async () => {
    ServerCapabilityRegistry.register(descriptor({
      outputSchema: z.object({ nested: z.array(z.object({ text: z.string() })) }),
      execute: async () => ({ nested: [{ text: '🙂'.repeat(ServerCapabilityRegistry.MAX_RESULT_BYTES / 2) }] }),
    }));
    const result = await ServerCapabilityRegistry.execute('test.capability', {}, context as any);
    expect(result.errorCode).toBe('RESULT_TOO_LARGE');
  });

  it('filters by module and permission without moving authority to the client', async () => {
    ServerCapabilityRegistry.register(descriptor({ id: 'tasks.read.test', moduleId: 'tasks', permissions: ['tasks.read'] }));
    expect((await ServerCapabilityRegistry.listForContext(context as any)).some(c => c.id === 'tasks.read.test')).toBe(true);
    storage.getData().moduleSettings.tasks.enabled = false;
    expect((await ServerCapabilityRegistry.listForContext(context as any)).some(c => c.id === 'tasks.read.test')).toBe(false);
    storage.getData().moduleSettings.tasks.enabled = true;
    const denied = { ...context, user: { ...user, permissions: [] } };
    expect((await ServerCapabilityRegistry.listForContext(denied as any)).some(c => c.id === 'tasks.read.test')).toBe(false);
  });

  it('removes Web Search from Agent discovery when the server config disables it', () => {
    const config = AIConfigSchema.parse({ webSearchEnabled: false });
    const filtered = filterAgentCapabilitiesForConfig([{ id: 'system.web.search' }, { id: 'ui.openModule' }], config);
    expect(filtered.map(cap => cap.id)).toEqual(['ui.openModule']);
  });

  it('keeps deterministic collision-safe tool-name mapping', () => {
    const a = CapabilityToolNameRegistry.getToolName('a-b');
    const b = CapabilityToolNameRegistry.getToolName('a_b');
    expect(a).not.toBe(b);
    expect(CapabilityToolNameRegistry.getCapabilityId(a)).toBe('a-b');
    expect(CapabilityToolNameRegistry.getCapabilityId(b)).toBe('a_b');
  });
});
