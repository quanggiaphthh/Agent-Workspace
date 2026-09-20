import { randomUUID } from 'crypto';
import { adminFirestore } from '../../lib/firebaseAdmin';
import {
  ConfirmationFailureCode,
  evaluateConfirmationRecord,
  hashCapabilityInput,
} from './CapabilityConfirmationPolicy';

const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const CONFIRMATION_COLLECTION = 'capability_confirmations';

export interface ConfirmationExecutionContext {
  source: 'agent' | 'rest';
  sessionId?: string;
  toolCallId?: string;
  logicalExecutionId?: string;
  temporaryMode?: boolean;
}
export interface ConfirmationChallenge { confirmationId: string; expiresAt: string; }
export interface ConfirmationConsumeResult { ok: boolean; confirmationId: string; errorCode?: ConfirmationFailureCode; errorSummary?: string; }

export class CapabilityConfirmationService {
  private static collection() { return adminFirestore.collection(CONFIRMATION_COLLECTION); }

  public static async prepare(options: { userId: string; capabilityId: string; rawInput: unknown; ttlMs?: number; executionContext?: ConfirmationExecutionContext; }): Promise<ConfirmationChallenge> {
    const confirmationId = `confirm-${randomUUID()}`;
    const now = Date.now();
    const ttlMs = Math.max(1_000, Math.min(options.ttlMs ?? CONFIRMATION_TTL_MS, 15 * 60 * 1000));
    const expiresAtMs = now + ttlMs;
    const execution = options.executionContext || { source: 'rest' as const };
    await this.collection().doc(confirmationId).set(Object.fromEntries(Object.entries({
      confirmationId, userId: options.userId, capabilityId: options.capabilityId,
      inputHash: hashCapabilityInput(options.rawInput), createdAt: new Date(now).toISOString(),
      expiresAt: new Date(expiresAtMs), expiresAtMs, consumedAt: null, decision: 'pending',
      source: execution.source, sessionId: execution.sessionId, toolCallId: execution.toolCallId,
      logicalExecutionId: execution.logicalExecutionId, temporaryMode: execution.temporaryMode === true,
    }).filter(([, value]) => value !== undefined)));
    return { confirmationId, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  private static expectation(options: { userId: string; capabilityId: string; rawInput: unknown; source?: 'agent'|'rest'; sessionId?: string; toolCallId?: string; logicalExecutionId?: string; }) {
    return { userId: options.userId, capabilityId: options.capabilityId, inputHash: hashCapabilityInput(options.rawInput), source: options.source, sessionId: options.sessionId, toolCallId: options.toolCallId, logicalExecutionId: options.logicalExecutionId };
  }

  public static async consume(options: { confirmationId: string; userId: string; capabilityId: string; rawInput: unknown; source?: 'agent'|'rest'; sessionId?: string; toolCallId?: string; logicalExecutionId?: string; }): Promise<ConfirmationConsumeResult> {
    return this.finish(options, 'approved');
  }

  public static async reject(options: { confirmationId: string; userId: string; capabilityId: string; rawInput: unknown; source?: 'agent'|'rest'; sessionId?: string; toolCallId?: string; logicalExecutionId?: string; }): Promise<ConfirmationConsumeResult> {
    return this.finish(options, 'rejected');
  }

  private static async finish(options: { confirmationId: string; userId: string; capabilityId: string; rawInput: unknown; source?: 'agent'|'rest'; sessionId?: string; toolCallId?: string; logicalExecutionId?: string; }, decision: 'approved'|'rejected'): Promise<ConfirmationConsumeResult> {
    const ref = this.collection().doc(options.confirmationId);
    const expected = this.expectation(options);
    return adminFirestore.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { ok:false, confirmationId:options.confirmationId, errorCode:'CONFIRMATION_NOT_FOUND' as const, errorSummary:'Confirmation challenge was not found.' };
      const evaluation = evaluateConfirmationRecord(snapshot.data() as any, expected);
      if (!evaluation.ok) return { ok:false, confirmationId:options.confirmationId, errorCode:evaluation.errorCode, errorSummary:evaluation.errorSummary };
      transaction.update(ref, { consumedAt:new Date().toISOString(), decision });
      return { ok:true, confirmationId:options.confirmationId };
    });
  }

  public static async cancel(options: { confirmationId: string; userId: string; capabilityId: string; rawInput: unknown; source?: 'agent'|'rest'; sessionId?: string; toolCallId?: string; logicalExecutionId?: string; }): Promise<ConfirmationConsumeResult> {
    const ref = this.collection().doc(options.confirmationId);
    const expected = this.expectation(options);
    return adminFirestore.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { ok:false, confirmationId:options.confirmationId, errorCode:'CONFIRMATION_NOT_FOUND' as const, errorSummary:'Confirmation challenge was not found.' };
      const evaluation = evaluateConfirmationRecord(snapshot.data() as any, expected);
      if (!evaluation.ok) return { ok:false, confirmationId:options.confirmationId, errorCode:evaluation.errorCode, errorSummary:evaluation.errorSummary };
      transaction.update(ref, { decision:'cancelled', consumedAt:new Date().toISOString() });
      return { ok:true, confirmationId:options.confirmationId };
    });
  }
}
