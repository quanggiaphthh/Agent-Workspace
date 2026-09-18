import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AGENT_MODEL } from '../../shared/contracts/ai';
import { isAgentCredentialUsable, selectValidAgentCredentialId, useAIKeysStore, partializeAIKeysState } from '../modules/settings/aiKeysStore';

const credentialMocks = vi.hoisted(() => ({
  resolveCredential: vi.fn(),
  getRotationCandidates: vi.fn(),
}));

vi.mock('../../server/core/ai/CredentialService', () => ({
  CredentialService: credentialMocks,
}));
vi.mock('../../server/core/capabilities/serverCapabilityRegistry', () => ({
  ServerCapabilityRegistry: { listForContext: vi.fn().mockResolvedValue([]) },
}));

import { RootAgent, RotatingGemini } from '../../server/agent/adk/RootAgent';

const context = (credentialId = 'system', autoRotate = false) => ({
  user: { id: 'owner-1', email: 'owner@example.test' },
  appContext: {
    aiConfig: {
      agentProvider: 'google',
      agentModel: DEFAULT_AGENT_MODEL,
      credentialId,
      autoRotate,
    },
  },
}) as any;

afterEach(() => vi.clearAllMocks());

describe('single-user Gemini credential workflow', () => {
  const keys = [
    { id: 'openai-1', providerId: 'openai', name: 'Other', status: 'active' as const, priority: 0 },
    { id: 'google-2', providerId: 'google', name: 'G2', status: 'active' as const, priority: 2 },
    { id: 'google-1', providerId: 'google', name: 'G1', status: 'active' as const, priority: 1 },
    { id: 'google-disabled', providerId: 'google', name: 'Disabled', status: 'disabled' as const, priority: 0 },
  ];

  it('recovers stale/deleted credential deterministically without cross-provider selection', () => {
    expect(selectValidAgentCredentialId('deleted', true, keys)).toBe('system');
    expect(selectValidAgentCredentialId('deleted', false, keys)).toBe('google-1');
    expect(selectValidAgentCredentialId('openai-1', false, keys)).toBe('google-1');
    expect(selectValidAgentCredentialId('google-disabled', false, keys)).toBe('google-1');
    expect(selectValidAgentCredentialId('google-2', false, keys)).toBe('google-2');
    expect(selectValidAgentCredentialId('deleted', false, [keys[0]])).toBe('system');
  });

  it('represents the legacy system sentinel as unusable when no Gemini credential exists', () => {
    expect(isAgentCredentialUsable('system', false, [])).toBe(false);
    expect(isAgentCredentialUsable('system', true, [])).toBe(true);
    expect(isAgentCredentialUsable('google-1', false, keys)).toBe(true);
    expect(isAgentCredentialUsable('openai-1', false, keys)).toBe(false);
    expect(isAgentCredentialUsable('google-disabled', false, keys)).toBe(false);
  });

  it('never persists raw credential metadata/secrets in Zustand snapshot', () => {
    const snapshot = partializeAIKeysState({
      ...useAIKeysStore.getState(),
      keys: [{ id: 'google-1', providerId: 'google', name: 'Key', status: 'active', key: 'RAW_SECRET' } as any],
      systemCredentialAvailable: true,
    } as any) as any;
    expect(snapshot.keys).toBeUndefined();
    expect(snapshot.systemCredentialAvailable).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain('RAW_SECRET');
  });

  it('RootAgent resolves the selected personal Google credential server-side', async () => {
    credentialMocks.resolveCredential.mockResolvedValue({ id: 'google-1', providerId: 'google', key: 'server-only-key', status: 'active' });
    const agent = await RootAgent.buildAgent(context('google-1'));
    expect(credentialMocks.resolveCredential).toHaveBeenCalledWith('owner-1', 'google', 'google-1');
    expect((agent as any).model.model).toBe(DEFAULT_AGENT_MODEL);
  });

  it('auto-rotation with zero candidates returns a controlled domain error', async () => {
    credentialMocks.getRotationCandidates.mockResolvedValue([]);
    await expect(RootAgent.buildAgent(context('google-1', true))).rejects.toMatchObject({
      code: 'NO_ROTATION_CANDIDATE',
      status: 409,
    });
  });

  it('auto-rotation with one candidate uses Gemini directly', async () => {
    credentialMocks.getRotationCandidates.mockResolvedValue([{ id: 'google-1', key: 'k1' }]);
    const agent = await RootAgent.buildAgent(context('google-1', true));
    expect((agent as any).model).not.toBeInstanceOf(RotatingGemini);
    expect((agent as any).model.model).toBe(DEFAULT_AGENT_MODEL);
  });

  it('auto-rotation with multiple candidates preserves RotatingGemini semantics', async () => {
    credentialMocks.getRotationCandidates.mockResolvedValue([
      { id: 'google-1', key: 'k1' },
      { id: 'google-2', key: 'k2' },
    ]);
    const agent = await RootAgent.buildAgent(context('google-1', true));
    expect((agent as any).model).toBeInstanceOf(RotatingGemini);
    expect((agent as any).model.model).toBe(DEFAULT_AGENT_MODEL);
  });
});
