import { z } from 'zod';

export type AIProviderId = 'google' | 'openai' | 'anthropic' | 'nvidia' | 'opencodezen';

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

export const AIConfigSchema = z.object({
  agentProvider: z.string().default('google'),
  agentModel: z.string().default('gemini-3.8-flash'),
  credentialId: z.string().optional(),
  autoRotate: z.boolean().default(false),
  memoryEnabled: z.boolean().default(true),
});

export type AIConfig = z.infer<typeof AIConfigSchema>;

export interface TestKeyResponse {
  success: boolean;
  models?: AIModelMetadata[];
  error?: string;
  statusCode?: number;
  canSaveUnverified?: boolean;
}
