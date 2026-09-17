import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authFetch } from '../../lib/authFetch';

export type KeyStatus = 'untested' | 'testing' | 'active' | 'error' | 'quota_exceeded';

export interface APIKeyEntry {
  id: string;
  providerId: string;
  name: string;
  status: KeyStatus;
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
  agentProvider: string;
  agentModel: string;
  credentialId: string;
  providerDefaultModels: Record<string, string>;
  providerLoadedModels: Record<string, {id: string, name: string}[]>;
  
  addKey: (providerId: string, key: string, name?: string) => Promise<string>;
  updateKey: (id: string, updates: Partial<APIKeyEntry>) => void;
  removeKey: (id: string) => Promise<void>;
  reorderKeys: (providerId: string, startIndex: number, endIndex: number) => void;
  
  setAutoRotate: (value: boolean) => void;
  setGlobalDefaultModel: (model: string | null) => void;
  setAgentConfig: (providerId: string, modelId: string, credentialId?: string) => void;
  setProviderDefaultModel: (providerId: string, model: string) => void;
  setProviderLoadedModels: (providerId: string, models: {id: string, name: string}[]) => void;
  syncKeys: () => Promise<void>;
  
  // Gets active personal credentialId, or 'system'
  getActiveCredentialId: (providerId: string) => string;
}

export const useAIKeysStore = create<AIKeysState>()(
  persist(
    (set, get) => ({
      keys: [],
      autoRotate: false,
      globalDefaultModel: null,
      agentProvider: 'google',
      agentModel: 'gemini-3.8-flash',
      credentialId: 'system',
      providerDefaultModels: {},
      providerLoadedModels: {},

      addKey: async (providerId, key, name = 'Key') => {
        const res = await authFetch('/api/ai/credentials', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ providerId, key, name })
        });
        if (!res.ok) throw new Error('Failed to save key');
        const { id } = await res.json();
        set((state) => ({
          keys: [...state.keys, { id, providerId, name, status: 'active' }]
        }));
        return id;
      },

      updateKey: (id, updates) => set((state) => ({
        keys: state.keys.map(k => k.id === id ? { ...k, ...updates } : k)
      })),

      removeKey: async (id) => {
        await authFetch(`/api/ai/credentials/${id}`, {
          method: 'DELETE'
        });
        set((state) => ({
          keys: state.keys.filter(k => k.id !== id)
        }));
      },

      reorderKeys: (providerId, startIndex, endIndex) => set((state) => {
        const providerKeys = state.keys.filter(k => k.providerId === providerId);
        const otherKeys = state.keys.filter(k => k.providerId !== providerId);
        
        const result = Array.from(providerKeys);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        
        return {
          keys: [...otherKeys, ...result]
        };
      }),

      setAutoRotate: (value) => set({ autoRotate: value }),
      setGlobalDefaultModel: (model) => set({ globalDefaultModel: model }),
      setAgentConfig: (providerId, modelId, credentialId) => set({ 
        agentProvider: providerId, 
        agentModel: modelId,
        credentialId: credentialId || 'system'
      }),
      setProviderDefaultModel: (providerId, model) => set((state) => ({
        providerDefaultModels: { ...state.providerDefaultModels, [providerId]: model }
      })),
      setProviderLoadedModels: (providerId, models) => set((state) => ({
        providerLoadedModels: { ...state.providerLoadedModels, [providerId]: models }
      })),
      
      syncKeys: async () => {
        try {
          const res = await authFetch('/api/ai/credentials');
          if (res.ok) {
            const keys = await res.json();
            set({ keys: keys.map((k: any) => ({ ...k, status: 'active' })) });
          }
        } catch (err) {
          console.error('Failed to sync keys:', err);
        }
      },

      getActiveCredentialId: (providerId) => {
        const state = get();
        const providerKeys = state.keys.filter(k => k.providerId === providerId);
        if (providerKeys.length === 0) return 'system';
        
        const activeKey = providerKeys.find(k => k.status === 'active');
        return activeKey ? activeKey.id : 'system';
      }
    }),
    {
      name: 'ai-keys-storage',
    }
  )
);
