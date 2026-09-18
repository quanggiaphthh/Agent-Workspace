import { z } from 'zod';
import type { AIConfig } from './ai';

export type CapabilityRisk = 'low' | 'medium' | 'high';

export interface UserContext {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
}

export interface EntityRef {
  moduleId: string;
  entityType: string;
  entityId: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface AppContext {
  user: UserContext;
  activeModule?: string;
  activeRoute?: string;
  selectedEntity?: EntityRef;
  currentView?: string;
  currentFilters?: Record<string, unknown>;
  availableCapabilities: string[];
  aiConfig?: AIConfig;
}

export interface ExecutionContext {
  user: UserContext;
  appContext?: AppContext;
  confirmed?: boolean;
  abortSignal?: AbortSignal;
}

export interface CapabilityDescriptor<TInput = unknown, TOutput = unknown> {
  id: string;
  moduleId: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  risk: CapabilityRisk;
  permissions: string[];
  effects?: string[];
  execute(input: TInput, context: ExecutionContext): Promise<TOutput>;
}
