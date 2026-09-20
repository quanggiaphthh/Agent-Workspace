import { CapabilityDescriptor, ExecutionContext } from '../../../shared/contracts/capability';
import { useContextStore } from '../context/contextStore';
import { eventBus } from '../events/eventBus';
import { navigationService } from '../navigation/navigationService';
import { authFetch } from '../../lib/authFetch';

export interface ExecuteResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  requiresConfirmation?: boolean;
  risk?: 'low' | 'medium' | 'high';
}

class ClientCapabilityRegistry {
  private localCapabilities: Map<string, CapabilityDescriptor<any, any>> = new Map();

  public register<TInput, TOutput>(descriptor: CapabilityDescriptor<TInput, TOutput>) {
    this.localCapabilities.set(descriptor.id, descriptor);
  }

  public get(id: string): CapabilityDescriptor<any, any> | undefined {
    return this.localCapabilities.get(id);
  }

  public listLocal(): CapabilityDescriptor<any, any>[] {
    return Array.from(this.localCapabilities.values());
  }

  public async execute<TInput = any, TOutput = any>(
    id: string,
    input: TInput,
    confirmed = false
  ): Promise<ExecuteResult<TOutput>> {
    const contextStore = useContextStore.getState();
    const user = contextStore.user;
    const appContext = contextStore.getAppContext();

    const execContext: ExecutionContext = {
      user,
      appContext,
      confirmed,
    };

    // 1. If it is a locally registered capability (e.g. UI capability)
    const localCap = this.localCapabilities.get(id);
    if (localCap) {
      const requiresConfirmation = localCap.confirmationPolicy === 'required' || (localCap.confirmationPolicy === undefined && localCap.risk === 'high');
      if (requiresConfirmation && !confirmed) {
        return {
          success: false,
          requiresConfirmation: true,
          risk: 'high',
          error: `Capability "${id}" requires confirmation.`,
        };
      }
      try {
        const res = await localCap.execute(input, execContext);
        return { success: true, result: res, risk: localCap.risk };
      } catch (err: any) {
        return { success: false, error: err.message || 'Execution error' };
      }
    }

    // 2. Server-side capability execution (e.g. demo.*, audit.*)
    try {
      const response = await authFetch('/api/capabilities/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          input,
          context: appContext,
          confirmed,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.error || `Failed executing capability ${id}`,
          requiresConfirmation: data.requiresConfirmation,
          risk: data.risk,
        };
      }

      // If mutation succeeded, trigger event propagation based on generic effects
      if (data.effects && Array.isArray(data.effects)) {
        data.effects.forEach((effect: string) => {
          eventBus.emit(effect, { capabilityId: id, input, result: data.result });
        });
      }

      return {
        success: true,
        result: data.result,
        risk: data.risk,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error connecting to capability endpoint.',
      };
    }
  }
}

export const clientCapabilityRegistry = new ClientCapabilityRegistry();

// Register standard UI capabilities on client
clientCapabilityRegistry.register({
  id: 'ui.openModule',
  moduleId: 'ui',
  description: 'Switch active view to specified module in App Shell.',
  inputSchema: null as any,
  risk: 'low',
  permissions: [],
  execute: async (input: { moduleId: string }) => {
    navigationService.openModule(input.moduleId);
    return { success: true, activeModule: input.moduleId };
  },
});

clientCapabilityRegistry.register({
  id: 'ui.openEntity',
  moduleId: 'ui',
  description: 'Highlight and select an entity on Canvas.',
  inputSchema: null as any,
  risk: 'low',
  permissions: [],
  execute: async (input: { moduleId: string; entityType: string; entityId: string; label?: string }) => {
    navigationService.openEntity(input.moduleId, input.entityType, input.entityId);
    useContextStore.getState().setSelectedEntity(input);
    eventBus.emit('entity.openRequested', input);
    return { success: true, selectedEntity: input };
  },
});

clientCapabilityRegistry.register({
  id: 'ui.refresh',
  moduleId: 'ui',
  description: 'Trigger data reload on Canvas.',
  inputSchema: null as any,
  risk: 'low',
  permissions: [],
  execute: async (input?: { target?: string }) => {
    eventBus.emit('canvas.refreshRequested', input || {});
    return { success: true };
  },
});

clientCapabilityRegistry.register({
  id: 'ui.showNotification',
  moduleId: 'ui',
  description: 'Display toast alert.',
  inputSchema: null as any,
  risk: 'low',
  permissions: [],
  execute: async (input: { message: string; type?: 'info' | 'success' | 'warning' | 'error' }) => {
    eventBus.emit('notification.show', input);
    return { success: true };
  },
});
