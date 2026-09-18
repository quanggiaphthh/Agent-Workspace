import { CapabilityDescriptor, ExecutionContext } from '../../../shared/contracts/capability';
import { storage } from '../../infrastructure/storage';
import { PermissionResolver } from '../permissions/permissionResolver';
import { isCancellationError } from '../runtime/requestCancellation';

export interface ServerCapabilityExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  errorCode?: string;
  requiresConfirmation?: boolean;
  risk?: string;
  effects?: string[];
}

export class ServerCapabilityRegistry {
  private static capabilities: Map<string, CapabilityDescriptor<any, any>> = new Map();

  public static register<TInput, TOutput>(descriptor: CapabilityDescriptor<TInput, TOutput>) {
    this.capabilities.set(descriptor.id, descriptor);
  }

  public static get(id: string): CapabilityDescriptor<any, any> | undefined {
    return this.capabilities.get(id);
  }

  public static listAll(): CapabilityDescriptor<any, any>[] {
    return Array.from(this.capabilities.values());
  }

  public static reset() {
    this.capabilities.clear();
  }

  public static async listForContext(context: ExecutionContext): Promise<CapabilityDescriptor<any, any>[]> {
    await storage.refreshModuleSettings();
    const data = storage.getData();
    const settings = data.moduleSettings;

    return Array.from(this.capabilities.values()).filter(cap => {
      if (cap.moduleId !== 'ui' && cap.moduleId !== 'system') {
        const moduleSetting = settings[cap.moduleId];
        if (moduleSetting?.canDisable && !storage.isPersistenceAvailable()) return false;
        if (moduleSetting && !moduleSetting.enabled) return false;
      }

      const permRes = PermissionResolver.checkPermission(cap.permissions || [], context);
      return permRes.authorized;
    });
  }

  public static async execute(
    id: string,
    rawInput: unknown,
    context: ExecutionContext,
  ): Promise<ServerCapabilityExecutionResult> {
    const descriptor = this.capabilities.get(id);
    if (!descriptor) {
      return {
        success: false,
        errorCode: 'CAPABILITY_NOT_FOUND',
        error: `Capability "${id}" not found or not registered.`,
      };
    }

    // Validate before policy checks so the central gateway has one deterministic preflight order.
    const parseResult = descriptor.inputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        success: false,
        errorCode: 'INVALID_INPUT',
        error: `Input validation failed for capability "${id}": ${parseResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      };
    }

    if (descriptor.moduleId !== 'ui' && descriptor.moduleId !== 'system') {
      try {
        await storage.refreshModuleSettings();
      } catch {
        return {
          success: false,
          errorCode: 'MODULE_SETTINGS_UNAVAILABLE',
          error: `Capability "${id}" is unavailable because durable module settings cannot be verified.`,
        };
      }
      const data = storage.getData();
      const moduleSetting = data.moduleSettings[descriptor.moduleId];
      if (moduleSetting?.canDisable && !storage.isPersistenceAvailable()) {
        return {
          success: false,
          errorCode: 'MODULE_SETTINGS_UNAVAILABLE',
          error: `Capability "${id}" is unavailable because durable module settings cannot be verified.`,
        };
      }
      if (moduleSetting && !moduleSetting.enabled) {
        return {
          success: false,
          errorCode: 'MODULE_DISABLED',
          error: `Capability "${id}" is unavailable because module "${descriptor.moduleId}" is currently disabled.`,
        };
      }
    }

    if (id.startsWith('system.memory.') || id.startsWith('system.tasks.')) {
      if (!context.user || !context.user.id || context.user.id === 'guest' || context.user.id === 'anonymous') {
        return {
          success: false,
          errorCode: 'UNAUTHENTICATED',
          error: `Unauthorized: Unauthenticated guests are not allowed to execute system capability "${id}".`,
        };
      }
    }

    const authResult = await PermissionResolver.resolve(descriptor.permissions || [], context);
    if (!authResult.authorized) {
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        error: authResult.error || 'Unauthorized execution attempt.',
      };
    }

    if (descriptor.risk === 'high' && !context.confirmed) {
      return {
        success: false,
        errorCode: 'CONFIRMATION_REQUIRED',
        requiresConfirmation: true,
        risk: 'high',
        error: `Action "${id}" is marked as HIGH RISK and requires server-authoritative confirmation.`,
      };
    }

    if (context.abortSignal?.aborted) {
      return {
        success: false,
        errorCode: 'EXECUTION_CANCELLED',
        error: 'Execution cancelled.',
      };
    }

    try {
      const result = await descriptor.execute(parseResult.data, context);
      return {
        success: true,
        result,
        risk: descriptor.risk,
        effects: descriptor.effects,
      };
    } catch (err: any) {
      if (context.abortSignal?.aborted || isCancellationError(err)) {
        return {
          success: false,
          errorCode: 'EXECUTION_CANCELLED',
          error: 'Execution cancelled.',
        };
      }
      return {
        success: false,
        errorCode: 'EXECUTION_ERROR',
        error: err?.message || 'Capability execution failed.',
      };
    }
  }
}
