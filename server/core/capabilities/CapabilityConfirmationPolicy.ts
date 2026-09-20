import { createHash } from 'crypto';

export type ConfirmationFailureCode =
  | 'CONFIRMATION_NOT_FOUND'
  | 'CONFIRMATION_EXPIRED'
  | 'CONFIRMATION_REPLAY'
  | 'CONFIRMATION_USER_MISMATCH'
  | 'CONFIRMATION_CAPABILITY_MISMATCH'
  | 'CONFIRMATION_INPUT_MISMATCH'
  | 'CONFIRMATION_EXECUTION_MISMATCH'
  | 'CONFIRMATION_CANCELLED';

export interface ConfirmationRecord {
  userId: string;
  capabilityId: string;
  inputHash: string;
  expiresAtMs: number;
  consumedAt?: string | null;
  decision?: 'pending' | 'approved' | 'rejected' | 'cancelled';
  source?: 'agent' | 'rest';
  sessionId?: string;
  toolCallId?: string;
  logicalExecutionId?: string;
  temporaryMode?: boolean;
}

export interface ConfirmationExpectation {
  userId: string;
  capabilityId: string;
  inputHash: string;
  source?: 'agent' | 'rest';
  sessionId?: string;
  toolCallId?: string;
  logicalExecutionId?: string;
}

function normalizeForHash(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) {
    return { $binarySha256: createHash('sha256').update(value).digest('hex'), byteLength: value.length };
  }
  if (value instanceof Uint8Array) {
    return {
      $binarySha256: createHash('sha256').update(Buffer.from(value)).digest('hex'),
      byteLength: value.byteLength,
    };
  }
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      normalized[key] = normalizeForHash((value as Record<string, unknown>)[key]);
    }
    return normalized;
  }
  return String(value);
}

export function hashCapabilityInput(rawInput: unknown): string {
  const normalized = JSON.stringify(normalizeForHash(rawInput));
  return createHash('sha256').update(normalized).digest('hex');
}

export function evaluateConfirmationRecord(
  challenge: ConfirmationRecord,
  expected: ConfirmationExpectation,
  nowMs = Date.now(),
): { ok: true } | { ok: false; errorCode: ConfirmationFailureCode; errorSummary: string } {
  if (challenge.decision === 'cancelled') {
    return {
      ok: false,
      errorCode: 'CONFIRMATION_CANCELLED',
      errorSummary: 'Confirmation challenge belongs to a cancelled Agent execution.',
    };
  }
  if (challenge.consumedAt) {
    return {
      ok: false,
      errorCode: 'CONFIRMATION_REPLAY',
      errorSummary: 'Confirmation challenge was already used; replay is not allowed.',
    };
  }
  if (!Number.isFinite(challenge.expiresAtMs) || challenge.expiresAtMs <= nowMs) {
    return {
      ok: false,
      errorCode: 'CONFIRMATION_EXPIRED',
      errorSummary: 'Confirmation challenge expired.',
    };
  }
  if (challenge.userId !== expected.userId) {
    return {
      ok: false,
      errorCode: 'CONFIRMATION_USER_MISMATCH',
      errorSummary: 'Confirmation challenge does not belong to this user.',
    };
  }
  if (challenge.capabilityId !== expected.capabilityId) {
    return {
      ok: false,
      errorCode: 'CONFIRMATION_CAPABILITY_MISMATCH',
      errorSummary: 'Confirmation challenge is bound to another capability.',
    };
  }
  if (challenge.inputHash !== expected.inputHash) {
    return {
      ok: false,
      errorCode: 'CONFIRMATION_INPUT_MISMATCH',
      errorSummary: 'Confirmation challenge is bound to different input.',
    };
  }
  if (expected.source !== undefined && challenge.source !== expected.source) {
    return { ok: false, errorCode: 'CONFIRMATION_EXECUTION_MISMATCH', errorSummary: 'Confirmation challenge belongs to another execution source.' };
  }
  if (expected.sessionId !== undefined && challenge.sessionId !== expected.sessionId) {
    return { ok: false, errorCode: 'CONFIRMATION_EXECUTION_MISMATCH', errorSummary: 'Confirmation challenge belongs to another Agent session.' };
  }
  if (expected.toolCallId !== undefined && challenge.toolCallId !== expected.toolCallId) {
    return { ok: false, errorCode: 'CONFIRMATION_EXECUTION_MISMATCH', errorSummary: 'Confirmation challenge belongs to another tool call.' };
  }
  if (expected.logicalExecutionId !== undefined && challenge.logicalExecutionId !== expected.logicalExecutionId) {
    return { ok: false, errorCode: 'CONFIRMATION_EXECUTION_MISMATCH', errorSummary: 'Confirmation challenge belongs to another logical execution.' };
  }
  return { ok: true };
}
