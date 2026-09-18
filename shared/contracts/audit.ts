import { CapabilityRisk } from './capability';

export type AuditOutcome =
  | 'pending'
  | 'success'
  | 'denied'
  | 'confirmation_required'
  | 'confirmation_failed'
  | 'execution_error'
  | 'cancelled';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail?: string;
  roles?: string[];
  effectivePermissions?: string[];
  capabilityId?: string;
  action: string;
  target?: string;
  moduleId?: string;
  risk?: CapabilityRisk | string;
  outcome?: AuditOutcome | string;
  status?: AuditOutcome | string;
  durationMs?: number;
  inputSummary?: unknown;
  resultSummary?: unknown;
  errorCode?: string;
  errorSummary?: string;
  errorMessage?: string;
  source?: 'user' | 'agent' | 'rest' | string;
  agentInitiated?: boolean;
  sessionId?: string;
  toolCallId?: string;
  requestId?: string;
  confirmationId?: string;
  confirmed?: boolean;
  metadata?: Record<string, any>;
  completedAt?: string;
}

export interface AuditPage {
  items: AuditLogEntry[];
  nextCursor?: string;
}
