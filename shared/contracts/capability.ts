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

/**
 * Client-provided Agent context is intentionally narrower than AppContext.
 * Identity, permissions, capability discovery and AI configuration are owned by
 * server authorities and must never be accepted through stateDelta.
 */
export const AgentClientEntityRefSchema = z.object({
  moduleId: z.string().trim().min(1).max(100),
  entityType: z.string().trim().min(1).max(100),
  entityId: z.string().trim().min(1).max(256),
  label: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const AgentClientContextSchema = z.object({
  activeModule: z.string().trim().min(1).max(100).optional(),
  activeRoute: z.string().trim().min(1).max(512).optional(),
  selectedEntity: AgentClientEntityRefSchema.optional(),
  currentView: z.string().trim().min(1).max(100).optional(),
  currentFilters: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type AgentClientContext = z.infer<typeof AgentClientContextSchema>;

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
