import { FunctionTool, Context } from '@google/adk';
import { CapabilityDescriptor, ExecutionContext } from '../../../shared/contracts/capability';
import { ServerCapabilityRegistry } from '../../core/capabilities/serverCapabilityRegistry';
import { CapabilityToolNameRegistry } from '../../core/capabilities/capabilityToolNameRegistry';
import { AuditService } from '../../core/audit/auditService';

export class CapabilityToolAdapter {
  /**
   * Adapts a CapabilityDescriptor into a Google ADK FunctionTool.
   */
  public static createTool(cap: CapabilityDescriptor<any, any>, trustedExecutionContext: ExecutionContext): FunctionTool<any> {
    const toolName = CapabilityToolNameRegistry.getToolName(cap.id);
    const { user } = trustedExecutionContext;
    
    return new FunctionTool({
      name: toolName,
      description: cap.description,
      parameters: cap.inputSchema as any,
      execute: async (args, toolContext) => {
        const context = toolContext as any;
        const appContext = context?.appContext || (context?.sessionState && context.sessionState.appContext) || { activeModule: 'home' };

        if (!user) {
          throw new Error('Unauthorized: No verified user identity found for this tool execution.');
        }

        // HITL: ADK Native Confirmation Flow
        if (cap.risk === 'high') {
          // Check if we already have confirmation in this call context
          if (!context.toolConfirmation) {
            await context.requestConfirmation({
              hint: `Xác nhận: ${cap.description}`,
              payload: {
                capabilityId: cap.id,
                risk: cap.risk,
                args
              }
            });
            return { 
              success: false, 
              requiresConfirmation: true,
              message: 'Awaiting confirmation for high risk action.'
            };
          }

          const toolConfirmation = context.toolConfirmation;
          if (!toolConfirmation || !toolConfirmation.confirmed) {
            // Log rejection
            await AuditService.log({
              userId: user.id,
              userEmail: user.email,
              action: `system.${cap.id}.reject`,
              target: cap.id,
              moduleId: cap.moduleId,
              risk: cap.risk,
              status: 'denied',
              agentInitiated: true,
              input: args as Record<string, any>,
              result: { error: 'User rejected permission' },
              sessionId: context?.sessionId || context?.sessionState?.sessionId,
              toolCallId: context?.toolCallId,
              confirmed: false
            });

            return { 
              success: false, 
              error: 'User cancelled the action.',
              status: 'cancelled'
            };
          }
        }

        // Build ExecutionContext for our Registry
        const execContext: ExecutionContext = {
          user,
          appContext: {
            ...appContext,
            user,
            availableCapabilities: [] // Registry will handle this
          },
          confirmed: cap.risk === 'high' // ADK already verified confirmation if we reached here
        };

        // Execute via Registry (Central enforcement point)
        const result = await ServerCapabilityRegistry.execute(cap.id, args, execContext);
        
        // Log execution
        await AuditService.log({
          userId: user.id,
          userEmail: user.email,
          action: `system.${cap.id}.execute`,
          target: cap.id,
          moduleId: cap.moduleId,
          risk: cap.risk,
          status: result.success ? 'success' : 'failed',
          agentInitiated: true,
          input: args as Record<string, any>,
          result: result,
          errorMessage: result.success ? undefined : result.error,
          sessionId: context?.sessionId || context?.sessionState?.sessionId,
          toolCallId: context?.toolCallId,
          confirmed: execContext.confirmed
        });
        
        return result;
      }
    });
  }
}
