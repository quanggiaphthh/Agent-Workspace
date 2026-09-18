import { ExecutionContext } from '../../../shared/contracts/capability';
import { AuditOutcome } from '../../../shared/contracts/audit';
import { AuditService } from '../audit/auditService';
import { CapabilityConfirmationService } from './CapabilityConfirmationService';
import { ServerCapabilityExecutionResult, ServerCapabilityRegistry } from './serverCapabilityRegistry';
import { isCancellationError, throwIfAborted } from '../runtime/requestCancellation';

export type CapabilityExecutionSource = 'agent' | 'rest';

export interface CapabilityExecutionMetadata {
  source: CapabilityExecutionSource;
  sessionId?: string;
  toolCallId?: string;
  requestId?: string;
  confirmationId?: string;
  abortSignal?: AbortSignal;
}

export interface CapabilityGatewayResult extends ServerCapabilityExecutionResult {
  confirmationId?: string;
  confirmationExpiresAt?: string;
}

function outcomeForResult(result: ServerCapabilityExecutionResult): AuditOutcome {
  if (result.success) return 'success';
  if (result.errorCode === 'EXECUTION_CANCELLED') return 'cancelled';
  if (result.errorCode === 'EXECUTION_ERROR') return 'execution_error';
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

      if (descriptor?.risk === 'high') {
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
          const challenge = await CapabilityConfirmationService.prepare({
            userId: safeContext.user.id,
            capabilityId: id,
            rawInput,
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
        const result = await ServerCapabilityRegistry.execute(id, rawInput, confirmedContext);
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
      const result = await ServerCapabilityRegistry.execute(id, rawInput, safeContext);
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
