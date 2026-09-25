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

export type ServerUiActionProjection =
  | { capabilityId: 'ui.openModule'; input: { moduleId: string } }
  | { capabilityId: 'ui.openEntity'; input: { moduleId: string; entityType: string; entityId: string; label?: string } }
  | { capabilityId: 'ui.refresh'; input: { target?: string } }
  | { capabilityId: 'ui.showNotification'; input: { message: string; type?: 'info' | 'success' | 'warning' | 'error' } };

/**
 * Projects only server-validated UI capability output into an existing local UI
 * capability. Unknown/malformed payloads fail closed and never become local
 * actions. Capability gateway wrappers use { success, result }; direct output is
 * also accepted for compatibility with existing UI-local call shapes.
 */
export function projectServerUiAction(value: unknown): ServerUiActionProjection | null {
  if (!value || typeof value !== 'object') return null;
  const wrapper = value as Record<string, any>;
  if (wrapper.success === false) return null;
  const payload = wrapper.result && typeof wrapper.result === 'object'
    ? wrapper.result as Record<string, any>
    : wrapper;

  if (payload.uiAction === 'openModule') {
    return typeof payload.moduleId === 'string' && payload.moduleId.trim()
      ? { capabilityId: 'ui.openModule', input: { moduleId: payload.moduleId } }
      : null;
  }

  if (payload.uiAction === 'openEntity') {
    const entity = payload.entity;
    if (!entity || typeof entity !== 'object') return null;
    if (typeof entity.moduleId !== 'string' || !entity.moduleId.trim()) return null;
    if (typeof entity.entityType !== 'string' || !entity.entityType.trim()) return null;
    if (typeof entity.entityId !== 'string' || !entity.entityId.trim()) return null;
    return {
      capabilityId: 'ui.openEntity',
      input: {
        moduleId: entity.moduleId,
        entityType: entity.entityType,
        entityId: entity.entityId,
        ...(typeof entity.label === 'string' && entity.label.trim() ? { label: entity.label } : {}),
      },
    };
  }

  if (payload.uiAction === 'refresh') {
    return {
      capabilityId: 'ui.refresh',
      input: typeof payload.target === 'string' && payload.target.trim()
        ? { target: payload.target }
        : {},
    };
  }

  if (payload.uiAction === 'showNotification') {
    const notification = payload.notification;
    if (!notification || typeof notification !== 'object') return null;
    if (typeof notification.message !== 'string' || !notification.message.trim()) return null;
    const type = ['info', 'success', 'warning', 'error'].includes(notification.type)
      ? notification.type as 'info' | 'success' | 'warning' | 'error'
      : undefined;
    return {
      capabilityId: 'ui.showNotification',
      input: { message: notification.message, ...(type ? { type } : {}) },
    };
  }

  return null;
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

export async function applyServerUiAction(value: unknown): Promise<boolean> {
  const projection = projectServerUiAction(value);
  if (!projection) return false;
  const executed = await clientCapabilityRegistry.execute(projection.capabilityId, projection.input);
  return executed.success;
}

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
