import { z } from 'zod';
import type { AIConfig } from './ai';

export type CapabilityRisk = 'low' | 'medium' | 'high';
export type CapabilitySideEffect = 'none' | 'mutation' | 'ui-local';
export type CapabilityConfirmationPolicy = 'none' | 'required';

/**
 * Domain error codes that may cross the capability gateway unchanged.
 *
 * Domain layers (document Processor client, file authority, document-formatting
 * capability) throw typed errors whose `code` is part of their stable contract.
 * The gateway keeps those codes so the UI can distinguish stale/config/auth/
 * output failures, but only for codes explicitly allowlisted here. Any other
 * thrown value is collapsed to the generic `EXECUTION_ERROR` so no raw
 * exception text, provider detail or secret can leak to the client.
 */
export const SAFE_DOMAIN_ERROR_CODES = [
  // Document Processor remote contract.
  'PROCESSOR_NOT_CONFIGURED',
  'PROCESSOR_UNAVAILABLE',
  'PROCESSOR_AUTH_FAILED',
  'PROCESSOR_BUSY',
  'PROCESSOR_INVALID_RESPONSE',
  'PROCESSOR_RESPONSE_TOO_LARGE',
  'PROCESSING_CANCELLED',
  'PROCESSING_TIMEOUT',
  'PROCESSING_FAILED',
  'INPUT_TOO_LARGE',
  'OUTPUT_TOO_LARGE',
  'MALFORMED_DOCX',
  'UNSUPPORTED_FILE_TYPE',
  'UNSAFE_ARCHIVE',
  'UNSAFE_ARCHIVE_PATH',
  'UNSAFE_XML',
  'ARCHIVE_ENTRY_LIMIT',
  'ARCHIVE_ENTRY_TOO_LARGE',
  'ARCHIVE_EXPANSION_LIMIT',
  'UNSUPPORTED_FEATURE',
  'PACKAGE_NOT_MUTABLE',
  'TARGET_NOT_FOUND',
  'TARGET_AMBIGUOUS',
  'PROVENANCE_NOT_DIRECT',
  'PRECONDITION_FAILED',
  'POSTCONDITION_FAILED',
  'TEMP_CREATE_FAILED',
  'TEMP_CLEANUP_FAILED',
  'OUTPUT_INTEGRITY_FAILED',
  'SOURCE_IMMUTABILITY_VIOLATION',
  'OUTPUT_PATH_INVALID',
  'OUTPUT_ALREADY_EXISTS',
  'STALE_DOCUMENT',
  'AUTHORIZATION_REJECTED',
  // File authority domain.
  'FILE_TYPE_MISMATCH',
  'FILE_INTEGRITY_FAILED',
  'FILE_READ_CANCELLED',
  'FILE_TOO_LARGE_FOR_MODEL',
  // Document-formatting capability domain.
  'DOCUMENT_PROCESSING_FAILED',
  'OUTPUT_NOT_VERIFIED',
] as const;

export type SafeDomainErrorCode = (typeof SAFE_DOMAIN_ERROR_CODES)[number];

const SAFE_DOMAIN_ERROR_CODE_SET: ReadonlySet<string> = new Set<string>(SAFE_DOMAIN_ERROR_CODES);

export function isSafeDomainErrorCode(code: unknown): code is SafeDomainErrorCode {
  return typeof code === 'string' && SAFE_DOMAIN_ERROR_CODE_SET.has(code);
}

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
 * server authorities and must never be accepted through stateDelta. Unknown
 * keys are stripped so existing clients may send their full local AppContext
 * without those authority fields crossing the server trust boundary.
 */
export const AgentClientEntityRefSchema = z.object({
  moduleId: z.string().trim().min(1).max(100),
  entityType: z.string().trim().min(1).max(100),
  entityId: z.string().trim().min(1).max(256),
  label: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const AgentClientContextSchema = z.object({
  activeModule: z.string().trim().min(1).max(100).optional(),
  activeRoute: z.string().trim().min(1).max(512).optional(),
  selectedEntity: AgentClientEntityRefSchema.optional(),
  currentView: z.string().trim().min(1).max(100).optional(),
  currentFilters: z.record(z.string(), z.unknown()).optional(),
});

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
