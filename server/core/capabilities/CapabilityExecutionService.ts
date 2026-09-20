import { ExecutionContext } from '../../../shared/contracts/capability';
import { AuditOutcome } from '../../../shared/contracts/audit';
import { AuditService } from '../audit/auditService';
import { CapabilityConfirmationService } from './CapabilityConfirmationService';
import { ServerCapabilityExecutionResult, ServerCapabilityRegistry } from './serverCapabilityRegistry';
import { isCancellationError, throwIfAborted } from '../runtime/requestCancellation';
import { createHash } from 'crypto';
import { adminFirestore } from '../../lib/firebaseAdmin';
import { hashCapabilityInput } from './CapabilityConfirmationPolicy';

export type CapabilityExecutionSource = 'agent' | 'rest';

export interface CapabilityExecutionMetadata {
  source: CapabilityExecutionSource;
  sessionId?: string;
  toolCallId?: string;
  requestId?: string;
  idempotencyKey?: string;
  confirmationId?: string;
  abortSignal?: AbortSignal;
  temporaryMode?: boolean;
}

export interface CapabilityGatewayResult extends ServerCapabilityExecutionResult {
  confirmationId?: string;
  confirmationExpiresAt?: string;
}


export type MutationExecutionState = 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export type MutationFailureKind = 'PRE_HANDLER' | 'AMBIGUOUS_POST_START';
interface MutationExecutionIdentity { source: 'agent' | 'rest'; logicalId: string; sessionId?: string; toolCallId?: string; requestId?: string; }
export interface MutationExecutionRecord {
  executionId: string; userId: string; capabilityId: string; inputHash: string; source: 'agent' | 'rest'; logicalId: string;
  sessionId?: string; toolCallId?: string; requestId?: string; state: MutationExecutionState; createdAt: string; startedAt: string; completedAt?: string;
  result?: ServerCapabilityExecutionResult; failureKind?: MutationFailureKind; errorCode?: string;
}
type ClaimResult = { kind: 'claimed' | 'succeeded' | 'running' | 'failed'; record: MutationExecutionRecord } | { kind: 'mismatch'; reason: 'USER' | 'CAPABILITY' | 'INPUT' | 'SOURCE'; record: MutationExecutionRecord };
interface ExecutionRepository { claim(record: MutationExecutionRecord): Promise<ClaimResult>; succeed(id: string, result: ServerCapabilityExecutionResult): Promise<void>; fail(id: string, kind: MutationFailureKind, code: string): Promise<void>; }
const EXECUTION_COLLECTION = 'capability_executions';
class FirestoreExecutionRepository implements ExecutionRepository {
  async claim(record: MutationExecutionRecord): Promise<ClaimResult> {
    const ref = adminFirestore.collection(EXECUTION_COLLECTION).doc(record.executionId);
    return adminFirestore.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) { transaction.create(ref, record); return { kind: 'claimed', record }; }
      const existing = snapshot.data() as MutationExecutionRecord;
      if (existing.userId !== record.userId) return { kind: 'mismatch', reason: 'USER', record: existing };
      if (existing.capabilityId !== record.capabilityId) return { kind: 'mismatch', reason: 'CAPABILITY', record: existing };
      if (existing.inputHash !== record.inputHash) return { kind: 'mismatch', reason: 'INPUT', record: existing };
      if (existing.source !== record.source) return { kind: 'mismatch', reason: 'SOURCE', record: existing };
      if (existing.state === 'SUCCEEDED') return { kind: 'succeeded', record: existing };
      if (existing.state === 'FAILED' && existing.failureKind === 'PRE_HANDLER') {
        const retried: MutationExecutionRecord = { ...existing, state: 'RUNNING', startedAt: new Date().toISOString() };
        delete retried.completedAt; delete retried.failureKind; delete retried.errorCode; transaction.set(ref, retried); return { kind: 'claimed', record: retried };
      }
      if (existing.state === 'FAILED') return { kind: 'failed', record: existing };
      return { kind: 'running', record: existing };
    });
  }
  async succeed(id: string, result: ServerCapabilityExecutionResult) { await adminFirestore.collection(EXECUTION_COLLECTION).doc(id).update({ state: 'SUCCEEDED', result, completedAt: new Date().toISOString(), failureKind: null, errorCode: null }); }
  async fail(id: string, kind: MutationFailureKind, code: string) { await adminFirestore.collection(EXECUTION_COLLECTION).doc(id).update({ state: 'FAILED', failureKind: kind, errorCode: code, completedAt: new Date().toISOString() }); }
}

export class CapabilityExecutionIdempotencyService {
  private static repository: ExecutionRepository = new FirestoreExecutionRepository();
  static deriveIdentity(meta: CapabilityExecutionMetadata): MutationExecutionIdentity | undefined {
    if (meta.source === 'agent') return meta.toolCallId && meta.sessionId ? { source: 'agent' as const, logicalId: `agent:${meta.sessionId}:${meta.toolCallId}`, sessionId: meta.sessionId, toolCallId: meta.toolCallId, requestId: meta.requestId } : undefined;
    return meta.idempotencyKey ? { source: 'rest' as const, logicalId: `rest:${meta.idempotencyKey}`, requestId: meta.requestId } : undefined;
  }
  static async claim(o: { identity: MutationExecutionIdentity; userId: string; capabilityId: string; rawInput: unknown }) {
    const now = new Date().toISOString(); const executionId = createHash('sha256').update(o.identity.logicalId).digest('hex');
    const record = Object.fromEntries(Object.entries({ executionId, userId: o.userId, capabilityId: o.capabilityId, inputHash: hashCapabilityInput(o.rawInput), source: o.identity.source, logicalId: o.identity.logicalId, sessionId: o.identity.sessionId, toolCallId: o.identity.toolCallId, requestId: o.identity.requestId, state: 'RUNNING', createdAt: now, startedAt: now }).filter(([, value]) => value !== undefined)) as unknown as MutationExecutionRecord;
    return this.repository.claim(record);
  }
  static succeed(id: string, result: ServerCapabilityExecutionResult) { return this.repository.succeed(id, result); }
  static fail(id: string, kind: MutationFailureKind, code: string) { return this.repository.fail(id, kind, code); }
  static setRepositoryForTests(repository: ExecutionRepository) { this.repository = repository; }
  static resetRepositoryForTests() { this.repository = new FirestoreExecutionRepository(); }
}

function outcomeForResult(result: ServerCapabilityExecutionResult): AuditOutcome {
  if (result.success) return 'success';
  if (result.errorCode === 'EXECUTION_CANCELLED') return 'cancelled';
  if (['EXECUTION_ERROR', 'INVALID_OUTPUT', 'RESULT_TOO_LARGE'].includes(result.errorCode || '')) return 'execution_error';
  return 'denied';
}

export class CapabilityExecutionService {
  private static async finalizeAudit(
    auditId: string,
    startedAt: number,
    patch: {
      outcome: AuditOutcome;
      resultSummary?: unknown;
      errorCode?: string;
      errorSummary?: string;
      confirmed?: boolean;
      confirmationId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await AuditService.update(auditId, {
        ...patch,
        durationMs: Date.now() - startedAt,
      });
    } catch (auditUpdateError) {
      // The durable pre-execution record already exists. Never retry a completed side effect because finalization failed.
      console.error('[Audit] Failed to finalize capability audit record:', auditUpdateError);
    }
  }

  private static async executeMutation(
    id: string,
    rawInput: unknown,
    context: ExecutionContext,
    meta: CapabilityExecutionMetadata,
  ): Promise<CapabilityGatewayResult> {
    const identity = CapabilityExecutionIdempotencyService.deriveIdentity(meta);
    if (!identity) {
      return { success: false, errorCode: 'IDEMPOTENCY_KEY_REQUIRED', error: 'Mutation execution requires a stable server-bound execution identity.' };
    }
    const claim = await CapabilityExecutionIdempotencyService.claim({ identity, userId: context.user.id, capabilityId: id, rawInput });
    if (claim.kind === 'mismatch') {
      return { success: false, errorCode: 'EXECUTION_IDENTITY_MISMATCH', error: `Execution identity is already bound to different ${claim.reason.toLowerCase()} context.` };
    }
    if (claim.kind === 'running') {
      const startedAt = Date.parse(claim.record.startedAt);
      const stale = Number.isFinite(startedAt) && Date.now() - startedAt > 5 * 60 * 1000;
      return stale
        ? { success: false, errorCode: 'EXECUTION_RECONCILIATION_REQUIRED', error: 'A stale mutation execution has an uncertain outcome and will not be taken over automatically.' }
        : { success: false, errorCode: 'EXECUTION_IN_PROGRESS', error: 'The same mutation execution is already in progress.' };
    }
    if (claim.kind === 'failed') {
      return { success: false, errorCode: 'EXECUTION_RECONCILIATION_REQUIRED', error: 'A prior mutation attempt has an uncertain or failed outcome and will not be retried automatically.' };
    }
    if (claim.kind === 'succeeded') {
      const prior = claim.record.result;
      if (!prior?.success) return { success: false, errorCode: 'EXECUTION_RECONCILIATION_REQUIRED', error: 'Stored execution result is unavailable.' };
      const validated = ServerCapabilityRegistry.validateStoredSuccess(id, prior);
      return validated;
    }

    let handlerStarted = false;
    try {
      throwIfAborted(meta.abortSignal);
      handlerStarted = true;
      const result = await ServerCapabilityRegistry.execute(id, rawInput, context);
      if (result.success) {
        const { executionStarted: _executionStarted, ...safeResult } = result;
        try {
          await CapabilityExecutionIdempotencyService.succeed(claim.record.executionId, safeResult);
        } catch {
          // The side effect may already have committed. Keep RUNNING to fail closed on retries.
          return { success: false, errorCode: 'EXECUTION_RECONCILIATION_REQUIRED', error: 'Mutation completed but durable execution reconciliation could not be finalized.' };
        }
        return safeResult;
      }
      const failureKind = result.executionStarted ? 'AMBIGUOUS_POST_START' : 'PRE_HANDLER';
      await CapabilityExecutionIdempotencyService.fail(claim.record.executionId, failureKind, result.errorCode || 'EXECUTION_ERROR');
      const { executionStarted: _executionStarted, ...safeResult } = result;
      return safeResult;
    } catch (error: any) {
      try {
        await CapabilityExecutionIdempotencyService.fail(claim.record.executionId, handlerStarted ? 'AMBIGUOUS_POST_START' : 'PRE_HANDLER', error?.code || 'EXECUTION_ERROR');
      } catch { /* RUNNING remains fail-closed. */ }
      throw error;
    }
  }

  public static async execute(
    id: string,
    rawInput: unknown,
    context: ExecutionContext,
    meta: CapabilityExecutionMetadata,
  ): Promise<CapabilityGatewayResult> {
    const startedAt = Date.now();
    const descriptor = ServerCapabilityRegistry.get(id);
    const safeContext: ExecutionContext = {
      user: context.user,
      appContext: context.appContext,
      // Never trust a caller-provided boolean. Only this gateway may set confirmed=true after token verification.
      confirmed: false,
      abortSignal: meta.abortSignal,
    };

    const audit = await AuditService.log({
      userId: safeContext.user.id,
      userEmail: safeContext.user.email,
      roles: safeContext.user.roles || [],
      effectivePermissions: safeContext.user.permissions || [],
      capabilityId: id,
      action: `capability.${id}.execute`,
      target: id,
      moduleId: descriptor?.moduleId,
      risk: descriptor?.risk,
      outcome: 'pending',
      status: 'pending',
      source: meta.source,
      agentInitiated: meta.source === 'agent',
      sessionId: meta.sessionId,
      toolCallId: meta.toolCallId,
      requestId: meta.requestId,
      confirmationId: meta.confirmationId,
      confirmed: false,
      inputSummary: AuditService.summarize(rawInput),
    });

    try {
      throwIfAborted(meta.abortSignal);

      if (descriptor?.confirmationPolicy === 'required') {
        // Preflight with confirmed=false validates input, module state and permission without executing the side effect.
        const preflight = await ServerCapabilityRegistry.execute(id, rawInput, safeContext);
        if (!preflight.requiresConfirmation) {
          await this.finalizeAudit(audit.id, startedAt, {
            outcome: outcomeForResult(preflight),
            resultSummary: preflight,
            errorCode: preflight.errorCode,
            errorSummary: preflight.error,
          });
          return preflight;
        }

        if (!meta.confirmationId) {
          const identity = CapabilityExecutionIdempotencyService.deriveIdentity(meta);
          const challenge = await CapabilityConfirmationService.prepare({
            userId: safeContext.user.id,
            capabilityId: id,
            rawInput,
            executionContext: {
              source: meta.source,
              sessionId: meta.sessionId,
              toolCallId: meta.toolCallId,
              logicalExecutionId: identity?.logicalId,
              temporaryMode: meta.temporaryMode,
            },
          });
          const result: CapabilityGatewayResult = {
            ...preflight,
            confirmationId: challenge.confirmationId,
            confirmationExpiresAt: challenge.expiresAt,
          };
          await this.finalizeAudit(audit.id, startedAt, {
            outcome: 'confirmation_required',
            resultSummary: { requiresConfirmation: true, expiresAt: challenge.expiresAt },
            errorCode: 'CONFIRMATION_REQUIRED',
            errorSummary: preflight.error,
            confirmationId: challenge.confirmationId,
          });
          return result;
        }

        const confirmation = await CapabilityConfirmationService.consume({
          confirmationId: meta.confirmationId,
          userId: safeContext.user.id,
          capabilityId: id,
          rawInput,
          source: meta.source,
          sessionId: meta.sessionId,
          toolCallId: meta.toolCallId,
          logicalExecutionId: CapabilityExecutionIdempotencyService.deriveIdentity(meta)?.logicalId,
        });

        if (!confirmation.ok) {
          const failed: CapabilityGatewayResult = {
            success: false,
            requiresConfirmation: true,
            risk: 'high',
            errorCode: confirmation.errorCode || 'CONFIRMATION_FAILED',
            error: confirmation.errorSummary || 'Server confirmation failed.',
            confirmationId: meta.confirmationId,
          };
          await this.finalizeAudit(audit.id, startedAt, {
            outcome: 'confirmation_failed',
            resultSummary: { requiresConfirmation: true },
            errorCode: failed.errorCode,
            errorSummary: failed.error,
            confirmed: false,
            confirmationId: meta.confirmationId,
          });
          return failed;
        }

        throwIfAborted(meta.abortSignal);
        const confirmedContext: ExecutionContext = { ...safeContext, confirmed: true };
        const result = descriptor?.sideEffect === 'mutation'
          ? await this.executeMutation(id, rawInput, confirmedContext, meta)
          : await ServerCapabilityRegistry.execute(id, rawInput, confirmedContext);
        await this.finalizeAudit(audit.id, startedAt, {
          outcome: outcomeForResult(result),
          resultSummary: result,
          errorCode: result.errorCode,
          errorSummary: result.error,
          confirmed: true,
          confirmationId: meta.confirmationId,
        });
        return { ...result, confirmationId: meta.confirmationId };
      }

      throwIfAborted(meta.abortSignal);
      const result = descriptor?.sideEffect === 'mutation'
        ? await this.executeMutation(id, rawInput, safeContext, meta)
        : await ServerCapabilityRegistry.execute(id, rawInput, safeContext);
      await this.finalizeAudit(audit.id, startedAt, {
        outcome: outcomeForResult(result),
        resultSummary: result,
        errorCode: result.errorCode,
        errorSummary: result.error,
      });
      return result;
    } catch (error: any) {
      const cancelled = meta.abortSignal?.aborted === true || isCancellationError(error);
      await this.finalizeAudit(audit.id, startedAt, {
        outcome: cancelled ? 'cancelled' : 'execution_error',
        errorCode: cancelled ? 'EXECUTION_CANCELLED' : (error?.code || 'EXECUTION_ERROR'),
        errorSummary: cancelled ? 'Execution cancelled.' : (error?.message || 'Capability execution failed.'),
        confirmed: false,
        confirmationId: meta.confirmationId,
      });
      throw error;
    }
  }

  public static async recordDecision(options: {
    id: string;
    context: ExecutionContext;
    meta: CapabilityExecutionMetadata;
    confirmed: boolean;
  }): Promise<void> {
    const descriptor = ServerCapabilityRegistry.get(options.id);
    await AuditService.log({
      userId: options.context.user.id,
      userEmail: options.context.user.email,
      roles: options.context.user.roles || [],
      effectivePermissions: options.context.user.permissions || [],
      capabilityId: options.id,
      action: `capability.${options.id}.confirmation`,
      target: options.id,
      moduleId: descriptor?.moduleId,
      risk: descriptor?.risk,
      outcome: options.confirmed ? 'success' : 'cancelled',
      status: options.confirmed ? 'success' : 'cancelled',
      source: options.meta.source,
      agentInitiated: options.meta.source === 'agent',
      sessionId: options.meta.sessionId,
      toolCallId: options.meta.toolCallId,
      requestId: options.meta.requestId,
      confirmationId: options.meta.confirmationId,
      confirmed: options.confirmed,
      metadata: { decision: options.confirmed ? 'confirmed' : 'rejected' },
    });
  }
}
