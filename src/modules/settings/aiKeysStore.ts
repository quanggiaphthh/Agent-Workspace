import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authFetch } from '../../lib/authFetch';
import { normalizeCredentialStatus, type CredentialUiStatus } from './credentialStatus';
import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_AGENT_PROVIDER,
  type AgentProviderId,
} from '../../../shared/contracts/ai';

export type KeyStatus = CredentialUiStatus;

export interface APIKeyEntry {
  id: string;
  providerId: string;
  name: string;
  status: KeyStatus;
  priority?: number;
  errorMessage?: string;
}

export interface AIProvider {
  id: string;
  name: string;
  models: string[];
}

export const SUPPORTED_PROVIDERS: AIProvider[] = [
  { id: 'google', name: 'Google (Gemini)', models: [] },
  { id: 'openai', name: 'OpenAI (GPT)', models: [] },
  { id: 'anthropic', name: 'Anthropic (Claude)', models: [] },
  { id: 'nvidia', name: 'NVIDIA NIM', models: [] },
  { id: 'opencodezen', name: 'OpenCodeZen (mã nguồn mở chuyên code)', models: [] },
];

interface AIKeysState {
  keys: APIKeyEntry[];
  autoRotate: boolean;
  globalDefaultModel: string | null;
  agentProvider: AgentProviderId;
  agentModel: string;
  credentialId: string;
  memoryEnabled: boolean;
  webSearchEnabled: boolean;
  aiSettingsHydrated: boolean;
  providerDefaultModels: Record<string, string>;
  providerLoadedModels: Record<string, { id: string; name: string }[]>;

  addKey: (providerId: string, key: string, name?: string) => Promise<string>;
  updateKey: (id: string, updates: Partial<APIKeyEntry>) => void;
  removeKey: (id: string) => Promise<void>;
  reorderKeys: (providerId: string, startIndex: number, endIndex: number) => Promise<void>;

  setAutoRotate: (value: boolean) => void;
  setGlobalDefaultModel: (model: string | null) => void;
  setAgentConfig: (providerId: AgentProviderId, modelId: string, credentialId?: string) => void;
  setMemoryEnabled: (value: boolean) => void;
  setWebSearchEnabled: (value: boolean) => void;
  setAISettingsHydrated: (value: boolean) => void;
  setProviderDefaultModel: (providerId: string, model: string) => void;
  setProviderLoadedModels: (providerId: string, models: { id: string; name: string }[]) => void;
  syncKeys: () => Promise<void>;

  // Gets active personal credentialId, or 'system' only for Google.
  getActiveCredentialId: (providerId: string) => string | null;
}

export const AI_SETTINGS_RESET = {
  keys: [] as APIKeyEntry[],
  autoRotate: false,
  globalDefaultModel: null as string | null,
  agentProvider: DEFAULT_AGENT_PROVIDER as AgentProviderId,
  agentModel: DEFAULT_AGENT_MODEL as string,
  credentialId: 'system',
  memoryEnabled: true,
  webSearchEnabled: false,
  aiSettingsHydrated: false,
  providerDefaultModels: {} as Record<string, string>,
  providerLoadedModels: {} as Record<string, { id: string; name: string }[]>,
};

export const LEGACY_DEFAULT_AGENT_MODELS = [
  'gemini-3.8-flash',
  'gemini-flash-lite-latest',
] as const;
export const AI_SETTINGS_PERSIST_VERSION = 1;

export function migrateLegacyAIModelSettings<T>(persistedState: T): T {
  if (!persistedState || typeof persistedState !== 'object' || Array.isArray(persistedState)) {
    return persistedState;
  }

  const state = persistedState as T & Record<string, unknown>;
  const shouldMigrateAgentModel = LEGACY_DEFAULT_AGENT_MODELS.includes(
    state.agentModel as (typeof LEGACY_DEFAULT_AGENT_MODELS)[number],
  );
  const shouldMigrateGlobalDefault = LEGACY_DEFAULT_AGENT_MODELS.includes(
    state.globalDefaultModel as (typeof LEGACY_DEFAULT_AGENT_MODELS)[number],
  );

  if (!shouldMigrateAgentModel && !shouldMigrateGlobalDefault) {
    return persistedState;
  }

  return {
    ...state,
    ...(shouldMigrateAgentModel ? { agentModel: DEFAULT_AGENT_MODEL } : {}),
    ...(shouldMigrateGlobalDefault ? { globalDefaultModel: DEFAULT_AGENT_MODEL } : {}),
  } as T;
}

export const useAIKeysStore = create<AIKeysState>()(
  persist(
    (set, get) => ({
      ...AI_SETTINGS_RESET,

      addKey: async (providerId, key, name = 'Key') => {
        const res = await authFetch('/api/ai/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId, key, name }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to save key');
        }
        const { id } = await res.json();
        await get().syncKeys();
        return id;
      },

      updateKey: (id, updates) => set((state) => ({
        keys: state.keys.map((key) => key.id === id ? { ...key, ...updates } : key),
      })),

      removeKey: async (id) => {
        const res = await authFetch(`/api/ai/credentials/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to delete key');
        }
        set((state) => ({
          keys: state.keys.filter((key) => key.id !== id),
        }));
      },

      reorderKeys: async (providerId, startIndex, endIndex) => {
        const state = get();
        const providerKeys = state.keys.filter((key) => key.providerId === providerId);
        if (
          startIndex < 0 || endIndex < 0 ||
          startIndex >= providerKeys.length || endIndex >= providerKeys.length ||
          startIndex === endIndex
        ) {
          return;
        }

        const reordered = [...providerKeys];
        const [removed] = reordered.splice(startIndex, 1);
        reordered.splice(endIndex, 0, removed);

        const res = await authFetch('/api/ai/credentials/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId, credentialIds: reordered.map((key) => key.id) }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to persist credential order');
        }
        await get().syncKeys();
      },

      setAutoRotate: (value) => set({ autoRotate: value }),
      setGlobalDefaultModel: (model) => set({ globalDefaultModel: model }),
      setAgentConfig: (providerId, modelId, credentialId) => set((state) => ({
        agentProvider: providerId,
        agentModel: modelId || DEFAULT_AGENT_MODEL,
        credentialId: credentialId !== undefined ? credentialId : state.credentialId,
      })),
      setMemoryEnabled: (value) => set({ memoryEnabled: value }),
      setWebSearchEnabled: (value) => set({ webSearchEnabled: value }),
      setAISettingsHydrated: (value) => set({ aiSettingsHydrated: value }),
      setProviderDefaultModel: (providerId, model) => set((state) => ({
        providerDefaultModels: { ...state.providerDefaultModels, [providerId]: model },
      })),
      setProviderLoadedModels: (providerId, models) => set((state) => ({
        providerLoadedModels: { ...state.providerLoadedModels, [providerId]: models },
      })),

      syncKeys: async () => {
        try {
          const res = await authFetch('/api/ai/credentials');
          if (!res.ok) return;
          const keys = await res.json();
          set({
            keys: keys.map((key: any) => ({ ...key, status: normalizeCredentialStatus(key.status) })),
          });
        } catch (err) {
          console.error('Failed to sync keys:', err);
        }
      },

      getActiveCredentialId: (providerId) => {
        const selectedCredentialId = get().credentialId;
        if (selectedCredentialId === 'system') {
          return providerId === DEFAULT_AGENT_PROVIDER ? 'system' : null;
        }
        const selected = get().keys.find((key) =>
          key.id === selectedCredentialId &&
          key.providerId === providerId &&
          key.status === 'active'
        );
        return selected?.id || null;
      },
    }),
    {
      name: 'ai-keys-storage',
      version: AI_SETTINGS_PERSIST_VERSION,
      migrate: (persistedState, persistedVersion) => {
        if (persistedVersion >= AI_SETTINGS_PERSIST_VERSION) {
          return persistedState;
        }
        return migrateLegacyAIModelSettings(persistedState);
      },
      skipHydration: true,
      partialize: (state) => ({
        autoRotate: state.autoRotate,
        globalDefaultModel: state.globalDefaultModel,
        agentProvider: state.agentProvider,
        agentModel: state.agentModel,
        credentialId: state.credentialId,
        memoryEnabled: state.memoryEnabled,
        webSearchEnabled: state.webSearchEnabled,
        providerDefaultModels: state.providerDefaultModels,
        providerLoadedModels: state.providerLoadedModels,
      }),
    },
  ),
);
