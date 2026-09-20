import { FunctionTool } from '@google/adk';
import { CapabilityDescriptor, ExecutionContext } from '../../../shared/contracts/capability';
import { CapabilityToolNameRegistry } from '../../core/capabilities/capabilityToolNameRegistry';
import { CapabilityExecutionService, CapabilityExecutionIdempotencyService, type CapabilityGatewayResult } from '../../core/capabilities/CapabilityExecutionService';
import { CapabilityConfirmationService } from '../../core/capabilities/CapabilityConfirmationService';
import { isCancellationError } from '../../core/runtime/requestCancellation';

export interface AgentToolRuntimeMetadata {
  /** Server-derived ADK session identity. Never sourced from model arguments. */
  sessionId: string;
  /** Request-scoped GĐ2 deadline/cancellation signal. */
  abortSignal?: AbortSignal;
  /** Temporary Chat may use short-lived confirmation safety records, but never durable conversation history. */
  temporaryMode?: boolean;
}

function getConfirmationId(toolConfirmation: any): string | undefined {
  const candidates = [
    toolConfirmation?.payload?.confirmationId,
    toolConfirmation?.response?.payload?.confirmationId,
    toolConfirmation?.confirmation?.payload?.confirmationId,
  ];
  return candidates.find(value => typeof value === 'string' && value.length > 0);
}

function safeToolFailure(result: CapabilityGatewayResult): CapabilityGatewayResult {
  if (result.success) return result;
  const safeMessages: Record<string, string> = {
    CAPABILITY_NOT_FOUND: 'Tool is unavailable.',
    INVALID_INPUT: 'Tool arguments are invalid.',
    PERMISSION_DENIED: 'Tool execution is not authorized.',
    UNAUTHENTICATED: 'Authentication is required for this tool.',
    MODULE_NOT_FOUND: 'The required module is unavailable.',
    MODULE_DISABLED: 'The required module is disabled.',
    MODULE_SETTINGS_UNAVAILABLE: 'Module availability could not be verified.',
    CAPABILITY_DISABLED: 'Tool is disabled for this Agent run.',
    CONFIRMATION_REQUIRED: 'User confirmation is required.',
    CONFIRMATION_REJECTED: 'User rejected the action.',
    CONFIRMATION_FAILED: 'Confirmation could not be verified.',
    CONFIRMATION_REPLAY: 'Confirmation is no longer valid.',
    CONFIRMATION_EXECUTION_MISMATCH: 'Confirmation belongs to another tool execution.',
    CONFIRMATION_CANCELLED: 'Confirmation belongs to a cancelled Agent execution.',
    INVALID_OUTPUT: 'Tool returned an invalid result.',
    RESULT_TOO_LARGE: 'Tool result exceeded the allowed size.',
    EXECUTION_ERROR: 'Tool execution failed.',
    EXECUTION_CANCELLED: 'Tool execution was cancelled.',
    IDEMPOTENCY_KEY_REQUIRED: 'A stable tool-call identity is required.',
    EXECUTION_IN_PROGRESS: 'The same logical tool execution is already in progress.',
    EXECUTION_IDENTITY_MISMATCH: 'Tool execution identity does not match the original request.',
    EXECUTION_RECONCILIATION_REQUIRED: 'Tool execution outcome requires reconciliation before retry.',
  };
  return {
    success: false,
    errorCode: result.errorCode || 'EXECUTION_ERROR',
    error: safeMessages[result.errorCode || 'EXECUTION_ERROR'] || 'Tool execution failed safely.',
    ...(result.requiresConfirmation ? { requiresConfirmation: true } : {}),
    ...(result.risk ? { risk: result.risk } : {}),
    ...(result.confirmationId ? { confirmationId: result.confirmationId } : {}),
    ...(result.confirmationExpiresAt ? { confirmationExpiresAt: result.confirmationExpiresAt } : {}),
  };
}

export class CapabilityToolAdapter {
  /** Adapts a trusted, already-discovered capability into the native ADK FunctionTool loop. */
  public static createTool(
    cap: CapabilityDescriptor<any, any>,
    trustedExecutionContext: ExecutionContext,
    runtime: AgentToolRuntimeMetadata,
  ): FunctionTool<any> {
    const toolName = CapabilityToolNameRegistry.getToolName(cap.id);
    const { user } = trustedExecutionContext;

    return new FunctionTool({
      name: toolName,
      description: cap.description,
      // @google/adk v2 natively accepts Zod v3/v4 schemas. Runtime authority remains the gateway Zod parse.
      parameters: cap.inputSchema as any,
      execute: async (args, toolContext) => {
        const context = toolContext as any;
        const dynamicAppContext = context?.appContext || (context?.sessionState && context.sessionState.appContext) || {};
        const appContext = { ...(trustedExecutionContext.appContext || {}), ...dynamicAppContext };
        if (!user) return { success: false, errorCode: 'UNAUTHENTICATED', error: 'Authentication is required for this tool.' };

        const adkRuntimeSignal = { abortSignal: context?.abortSignal };
        const abortSignal = runtime.abortSignal || trustedExecutionContext.abortSignal || adkRuntimeSignal.abortSignal;
        const execContext: ExecutionContext = {
          user,
          appContext: { ...appContext, user, availableCapabilities: [] },
          confirmed: false,
          abortSignal,
        };
        // ADK ToolContext names this functionCallId. Keep toolCallId fallback only for compatibility with older test/runtime shapes.
        const toolCallId = context?.functionCallId || context?.toolCallId;
        const executionMeta = {
          source: 'agent' as const,
          sessionId: runtime.sessionId,
          toolCallId,
          abortSignal,
          temporaryMode: runtime.temporaryMode === true,
        };

        try {
          if (cap.confirmationPolicy !== 'required') {
            return safeToolFailure(await CapabilityExecutionService.execute(cap.id, args, execContext, executionMeta));
          }

          if (!context?.toolConfirmation) {
            const challenge = await CapabilityExecutionService.execute(cap.id, args, execContext, executionMeta);
            if (challenge.requiresConfirmation && challenge.confirmationId && typeof context?.requestConfirmation === 'function') {
              const identity = CapabilityExecutionIdempotencyService.deriveIdentity(executionMeta);
              if (abortSignal) {
                abortSignal.addEventListener('abort', () => {
                  void CapabilityConfirmationService.cancel({
                    confirmationId: challenge.confirmationId!, userId: user.id, capabilityId: cap.id, rawInput: args,
                    source: 'agent', sessionId: runtime.sessionId, toolCallId, logicalExecutionId: identity?.logicalId,
                  }).catch(() => undefined);
                }, { once: true });
              }
              await context.requestConfirmation({
                hint: `Xác nhận: ${cap.description}`,
                payload: { capabilityId: cap.id, risk: cap.risk, confirmationId: challenge.confirmationId, expiresAt: challenge.confirmationExpiresAt },
              });
            }
            return safeToolFailure(challenge);
          }

          const confirmationId = getConfirmationId(context.toolConfirmation);
          if (!context.toolConfirmation.confirmed) {
            if (!confirmationId) return safeToolFailure({ success:false, errorCode:'CONFIRMATION_FAILED', error:'Confirmation identity is required for rejection.' });
            const identity = CapabilityExecutionIdempotencyService.deriveIdentity(executionMeta);
            const rejected = await CapabilityConfirmationService.reject({
              confirmationId, userId: user.id, capabilityId: cap.id, rawInput: args,
              source: 'agent', sessionId: runtime.sessionId, toolCallId, logicalExecutionId: identity?.logicalId,
            });
            if (!rejected.ok) return safeToolFailure({ success:false, errorCode:rejected.errorCode || 'CONFIRMATION_FAILED', error:rejected.errorSummary || 'Confirmation could not be verified.' });
            await CapabilityExecutionService.recordDecision({ id: cap.id, context: execContext, meta: { ...executionMeta, confirmationId }, confirmed: false });
            return { success: false, errorCode: 'CONFIRMATION_REJECTED', error: 'User rejected the action.' };
          }

          if (!confirmationId) {
            const freshChallenge = await CapabilityExecutionService.execute(cap.id, args, execContext, executionMeta);
            if (freshChallenge.requiresConfirmation && freshChallenge.confirmationId && typeof context?.requestConfirmation === 'function') {
              await context.requestConfirmation({
                hint: `Xác nhận lại: ${cap.description}`,
                payload: { capabilityId: cap.id, risk: cap.risk, confirmationId: freshChallenge.confirmationId, expiresAt: freshChallenge.confirmationExpiresAt },
              });
            }
            return safeToolFailure(freshChallenge);
          }

          return safeToolFailure(await CapabilityExecutionService.execute(cap.id, args, execContext, { ...executionMeta, confirmationId }));
        } catch (error: any) {
          if (isCancellationError(error) || error?.code === 'EXECUTION_CANCELLED' || abortSignal?.aborted) {
            return safeToolFailure({ success: false, errorCode: 'EXECUTION_CANCELLED', error: 'Execution cancelled.' });
          }
          return safeToolFailure({ success: false, errorCode: 'EXECUTION_ERROR', error: error?.message || 'Tool execution failed.' });
        }
      },
    });
  }
}
