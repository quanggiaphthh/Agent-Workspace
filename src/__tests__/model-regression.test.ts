import { describe, it, expect, vi } from 'vitest';
import { 
  DEFAULT_AGENT_MODEL, 
  AIConfigSchema, 
  DEFAULT_AGENT_PROVIDER,
  DEFAULT_AI_CONFIG 
} from '../../shared/contracts/ai';
import { getGoogleModelRank } from '../../server/core/ai/AIProviderManager';
import { useAIKeysStore, AI_SETTINGS_RESET, AI_SETTINGS_PERSIST_VERSION, migrateLegacyAIModelSettings, partializeAIKeysState } from '../modules/settings/aiKeysStore';
import { RootAgent } from '../../server/agent/adk/RootAgent';

// Mock the CredentialService to resolve our key
vi.mock('../../server/core/ai/CredentialService', () => {
  return {
    CredentialService: {
      resolveCredential: vi.fn().mockResolvedValue({ key: 'test-key-abc', id: 'system' }),
    }
  };
});

// Mock the ServerCapabilityRegistry
vi.mock('../../server/core/capabilities/serverCapabilityRegistry', () => {
  return {
    ServerCapabilityRegistry: {
      listForContext: vi.fn().mockResolvedValue([]),
    }
  };
});

describe('AI Agent Model Default & Fallback Regression Suite', () => {

  // 1. Canonical default test
  it('1. DEFAULT_AGENT_MODEL must be "gemini-3.5-flash-lite"', () => {
    expect(DEFAULT_AGENT_MODEL).toBe('gemini-3.5-flash-lite');
  });

  // 2. AIConfigSchema parse default test
  it('2. AIConfigSchema should default agentModel to DEFAULT_AGENT_MODEL', () => {
    const parsed = AIConfigSchema.parse({});
    expect(parsed.agentModel).toBe(DEFAULT_AGENT_MODEL);
    expect(DEFAULT_AI_CONFIG.agentModel).toBe(DEFAULT_AGENT_MODEL);
  });

  // 3. New Zustand state default test
  it('3. New Zustand store state must default agentModel to DEFAULT_AGENT_MODEL', () => {
    const resetState = AI_SETTINGS_RESET;
    expect(resetState.agentModel).toBe(DEFAULT_AGENT_MODEL);
  });

  // 4. Legacy persisted state migration test
  it('4. Zustand persist migration upgrades legacy defaults to the cheapest dev model without mutating stored input', async () => {
    for (const legacyModel of ['gemini-2.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-lite-latest']) {
      const legacyState = {
        agentModel: legacyModel,
        globalDefaultModel: legacyModel,
        autoRotate: false,
      };
      const snapshot = { ...legacyState };

      const migrated = migrateLegacyAIModelSettings(legacyState) as typeof legacyState;

      expect(migrated.agentModel).toBe(DEFAULT_AGENT_MODEL);
      expect(migrated.globalDefaultModel).toBe(DEFAULT_AGENT_MODEL);
      expect(migrated.autoRotate).toBe(false);
      expect(legacyState).toEqual(snapshot);
    }
  });

  // 5. Valid persisted user selection preservation test
  it('5. Zustand persist migration preserves valid user-selected models', async () => {
    const validState = {
      agentModel: 'gemini-2.5-flash',
      globalDefaultModel: 'gemini-2.5-pro',
      autoRotate: false,
    };

    const migrated = migrateLegacyAIModelSettings(validState) as typeof validState;

    expect(migrated.agentModel).toBe('gemini-2.5-flash');
    expect(migrated.globalDefaultModel).toBe('gemini-2.5-pro');
  });


  it('5b. persisted empty/invalid model recovers to canonical default without losing unrelated settings', async () => {
    for (const invalidModel of ['', 'gpt-4o']) {
      const migrated = migrateLegacyAIModelSettings({
        agentModel: invalidModel,
        memoryEnabled: false,
        webSearchEnabled: true,
        credentialId: 'personal-credential',
      }) as any;
      expect(migrated.agentModel).toBe(DEFAULT_AGENT_MODEL);
      expect(migrated.memoryEnabled).toBe(false);
      expect(migrated.webSearchEnabled).toBe(true);
      expect(migrated.credentialId).toBe('personal-credential');
    }
  });

  it('5c. AIConfig rejects non-Gemini Agent models instead of silently running another model', () => {
    expect(AIConfigSchema.safeParse({ agentProvider: 'google', agentModel: 'gpt-4o' }).success).toBe(false);
    expect(AIConfigSchema.safeParse({ agentProvider: 'openai', agentModel: DEFAULT_AGENT_MODEL }).success).toBe(false);
  });

  it('5d. persisted client state excludes credential secrets', () => {
    const snapshot = partializeAIKeysState({
      ...useAIKeysStore.getState(),
      keys: [{ id: 'x', providerId: 'google', name: 'Key', status: 'active', key: 'SECRET' } as any],
    } as any) as any;
    expect(snapshot.keys).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain('SECRET');
  });

  // 6 & 7. Model list ranking & sorting tests
  it('6 & 7. getGoogleModelRank must correctly prioritize models in sequence', () => {
    // Ranks: 1 for the pinned cheapest dev model, 2 for other flash-lite, 3 for other flash, 4 for others
    expect(getGoogleModelRank('gemini-3.5-flash-lite')).toBe(1);
    expect(getGoogleModelRank('gemini-2.5-flash-lite')).toBe(2);
    expect(getGoogleModelRank('gemini-flash-lite-latest')).toBe(2);
    expect(getGoogleModelRank('gemini-2.5-flash')).toBe(3);
    expect(getGoogleModelRank('gemini-2.5-pro')).toBe(4);

    const testModels = [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-flash-lite-latest', name: 'Gemini Flash-Lite Latest' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
    ];

    const sorted = [...testModels].sort((a, b) => {
      const rankA = getGoogleModelRank(a.id);
      const rankB = getGoogleModelRank(b.id);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return a.name.localeCompare(b.name);
    });

    expect(sorted[0].id).toBe('gemini-2.5-flash-lite'); // 3.5 is not in this fixture
    expect(sorted[1].id).toBe('gemini-flash-lite-latest');
    expect(sorted[2].id).toBe('gemini-2.5-flash');
    expect(sorted[3].id).toBe('gemini-2.5-pro');
  });

  // 9 & 10. RootAgent fallback and agentModel propagation
  it('9 & 10. RootAgent should build using specified agentModel or fallback to DEFAULT_AGENT_MODEL', async () => {
    const executionCtx: any = {
      user: { id: 'test-user-123', email: 'test@gmail.com' },
      appContext: {
        aiConfig: {
          agentProvider: DEFAULT_AGENT_PROVIDER,
          agentModel: 'gemini-model-custom-123'
        }
      }
    };

    // Build agent with a custom model
    const agentCustom = await RootAgent.buildAgent(executionCtx);
    expect(agentCustom).toBeDefined();
    expect((agentCustom as any).model.model).toBe('gemini-model-custom-123');

    // Build agent with empty config -> fallback to DEFAULT_AGENT_MODEL
    const executionCtxFallback: any = {
      user: { id: 'test-user-123', email: 'test@gmail.com' },
      appContext: {
        aiConfig: {}
      }
    };

    const agentFallback = await RootAgent.buildAgent(executionCtxFallback);
    expect(agentFallback).toBeDefined();
    expect((agentFallback as any).model.model).toBe(DEFAULT_AGENT_MODEL);
  });
});
