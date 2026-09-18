import { z } from 'zod';

export const DEFAULT_AGENT_PROVIDER = 'google' as const;
export const DEFAULT_AGENT_MODEL = 'gemini-3.5-flash-lite' as const;
export const DEFAULT_AGENT_MODEL_NAME = 'Gemini 3.5 Flash-Lite' as const;

export function isAgentModelId(value: unknown): value is string {
  return typeof value === 'string' && /^gemini-[a-z0-9][a-z0-9._-]*$/i.test(value.trim());
}

export type AIProviderId = 'google' | 'openai' | 'anthropic' | 'nvidia' | 'opencodezen';
export type AgentProviderId = typeof DEFAULT_AGENT_PROVIDER;

export interface AIModelMetadata {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  capabilities: ('text' | 'image' | 'audio' | 'video' | 'chat')[];
  lifecycle?: 'stable' | 'beta' | 'deprecated';
}

export interface AIProviderMetadata {
  id: AIProviderId;
  name: string;
  recommendedModels: string[];
}

/**
 * Canonical Agent Chat configuration contract.
 *
 * The Agent runtime currently supports Google/Gemini only. Other providers
 * remain available to the credential manager for non-Agent workflows.
 */
export const AIConfigSchema = z.object({
  agentProvider: z.literal(DEFAULT_AGENT_PROVIDER).default(DEFAULT_AGENT_PROVIDER),
  agentModel: z.string().trim().min(1).refine(isAgentModelId, 'Agent model must be a Google Gemini model ID.').default(DEFAULT_AGENT_MODEL),
  credentialId: z.string().trim().min(1).default('system'),
  autoRotate: z.boolean().default(false),
  memoryEnabled: z.boolean().default(true),
  webSearchEnabled: z.boolean().default(false),
}).strict();

export type AIConfig = z.infer<typeof AIConfigSchema>;

export const DEFAULT_AI_CONFIG: AIConfig = AIConfigSchema.parse({});

export interface TestKeyResponse {
  success: boolean;
  models?: AIModelMetadata[];
  error?: string;
  statusCode?: number;
  canSaveUnverified?: boolean;
}
