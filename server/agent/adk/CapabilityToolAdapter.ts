import { FunctionTool } from '@google/adk';
import { CapabilityDescriptor, ExecutionContext } from '../../../shared/contracts/capability';
import { CapabilityToolNameRegistry } from '../../core/capabilities/capabilityToolNameRegistry';
import { CapabilityExecutionService } from '../../core/capabilities/CapabilityExecutionService';

function getConfirmationId(toolConfirmation: any): string | undefined {
  const candidates = [
    toolConfirmation?.payload?.confirmationId,
    toolConfirmation?.response?.payload?.confirmationId,
    toolConfirmation?.confirmation?.payload?.confirmationId,
  ];
  return candidates.find(value => typeof value === 'string' && value.length > 0);
}

export class CapabilityToolAdapter {
  /** Adapts a trusted capability descriptor into a Google ADK FunctionTool. */
  public static createTool(cap: CapabilityDescriptor<any, any>, trustedExecutionContext: ExecutionContext): FunctionTool<any> {
    const toolName = CapabilityToolNameRegistry.getToolName(cap.id);
    const { user } = trustedExecutionContext;

    return new FunctionTool({
      name: toolName,
      description: cap.description,
      parameters: cap.inputSchema as any,
      execute: async (args, toolContext) => {
        const context = toolContext as any;
        const dynamicAppContext = context?.appContext || (context?.sessionState && context.sessionState.appContext) || {};
        const appContext = {
          ...(trustedExecutionContext.appContext || {}),
          ...dynamicAppContext,
        };

        if (!user) {
          throw new Error('Unauthorized: No verified user identity found for this tool execution.');
        }

        const execContext: ExecutionContext = {
          user,
          appContext: {
            ...appContext,
            user,
            availableCapabilities: [],
          },
          confirmed: false,
          abortSignal: context?.abortSignal,
        };
        const executionMeta = {
          source: 'agent' as const,
          sessionId: context?.sessionId || context?.sessionState?.sessionId,
          toolCallId: context?.toolCallId,
          abortSignal: context?.abortSignal,
        };

        if (cap.risk !== 'high') {
          return CapabilityExecutionService.execute(cap.id, args, execContext, executionMeta);
        }

        if (!context.toolConfirmation) {
          const challenge = await CapabilityExecutionService.execute(cap.id, args, execContext, executionMeta);
          if (challenge.requiresConfirmation && challenge.confirmationId) {
            await context.requestConfirmation({
              hint: `Xác nhận: ${cap.description}`,
              payload: {
                capabilityId: cap.id,
                risk: cap.risk,
                confirmationId: challenge.confirmationId,
                expiresAt: challenge.confirmationExpiresAt,
              },
            });
          }
          return challenge;
        }

        const confirmationId = getConfirmationId(context.toolConfirmation);
        if (!context.toolConfirmation.confirmed) {
          await CapabilityExecutionService.recordDecision({
            id: cap.id,
            context: execContext,
            meta: { ...executionMeta, confirmationId },
            confirmed: false,
          });
          return {
            success: false,
            errorCode: 'CONFIRMATION_REJECTED',
            error: 'User cancelled the action.',
            status: 'cancelled',
          };
        }

        if (!confirmationId) {
          const freshChallenge = await CapabilityExecutionService.execute(cap.id, args, execContext, executionMeta);
          if (freshChallenge.requiresConfirmation && freshChallenge.confirmationId) {
            await context.requestConfirmation({
              hint: `Xác nhận lại: ${cap.description}`,
              payload: {
                capabilityId: cap.id,
                risk: cap.risk,
                confirmationId: freshChallenge.confirmationId,
                expiresAt: freshChallenge.confirmationExpiresAt,
              },
            });
          }
          return freshChallenge;
        }

        return CapabilityExecutionService.execute(
          cap.id,
          args,
          execContext,
          { ...executionMeta, confirmationId },
        );
      },
    });
  }
}
