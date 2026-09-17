import { CapabilityRisk } from './capability';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail?: string;
  action: string;
  target?: string;
  moduleId?: string;
  risk?: CapabilityRisk | string;
  status?: 'success' | 'failed' | 'denied' | 'cancelled' | string;
  source?: 'user' | 'agent' | string;
  agentInitiated?: boolean;
  input?: Record<string, any>;
  result?: Record<string, any>;
  errorMessage?: string;
  sessionId?: string;
  toolCallId?: string;
  confirmed?: boolean;
  metadata?: Record<string, any>;
}

