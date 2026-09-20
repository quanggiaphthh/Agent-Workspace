import { z } from 'zod';
import type { AIConfig } from './ai';

export type CapabilityRisk = 'low' | 'medium' | 'high';
export type CapabilitySideEffect = 'none' | 'mutation' | 'ui-local';
export type CapabilityConfirmationPolicy = 'none' | 'required';

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
  /** Machine-readable execution semantics. Legacy descriptors are normalized at registration. */
  sideEffect?: CapabilitySideEffect;
  /** Explicit HITL policy; risk remains independent security/business metadata. */
  confirmationPolicy?: CapabilityConfirmationPolicy;
  permissions: string[];
  effects?: string[];
  execute(input: TInput, context: ExecutionContext): Promise<TOutput>;
}
