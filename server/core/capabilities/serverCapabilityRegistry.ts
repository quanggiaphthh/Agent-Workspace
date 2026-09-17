import { CapabilityDescriptor, ExecutionContext } from '../../../shared/contracts/capability';
import { storage } from '../../infrastructure/storage';
import { PermissionResolver } from '../permissions/permissionResolver';

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

  public static listForContext(context: ExecutionContext): CapabilityDescriptor<any, any>[] {
    const data = storage.getData();
    const settings = data.moduleSettings;

    return Array.from(this.capabilities.values()).filter(cap => {
      // 1. Check if module is enabled (except core)
      if (cap.moduleId !== 'ui' && cap.moduleId !== 'system') {
        const moduleSetting = settings[cap.moduleId];
        if (moduleSetting && !moduleSetting.enabled) return false;
      }

      // 2. Check permissions via central resolver
      const permRes = PermissionResolver.checkPermission(cap.permissions || [], context);
      return permRes.authorized;
    });
  }

  public static async execute(
    id: string,
    rawInput: unknown,
    context: ExecutionContext
  ): Promise<{ success: boolean; result?: any; error?: string; requiresConfirmation?: boolean; risk?: string; effects?: string[] }> {
    const descriptor = this.capabilities.get(id);
    if (!descriptor) {
      return { success: false, error: `Capability "${id}" not found or not registered.` };
    }

    // 1. Check if module is enabled
    if (descriptor.moduleId !== 'ui' && descriptor.moduleId !== 'system') {
      const data = storage.getData();
      const moduleSetting = data.moduleSettings[descriptor.moduleId];
      if (moduleSetting && !moduleSetting.enabled) {
        return {
          success: false,
          error: `Capability "${id}" is unavailable because module "${descriptor.moduleId}" is currently disabled.`,
        };
      }
    }

    // 2. Permission Enforcement (P0 requirement)
    if (id.startsWith('system.memory.') || id.startsWith('system.tasks.')) {
      if (!context.user || !context.user.id || context.user.id === 'guest' || context.user.id === 'anonymous') {
        return {
          success: false,
          error: `Unauthorized: Unauthenticated guests are not allowed to execute system capability "${id}".`
        };
      }
    }

    const authResult = await PermissionResolver.resolve(descriptor.permissions || [], context);
    if (!authResult.authorized) {
      return {
        success: false,
        error: authResult.error || 'Unauthorized execution attempt.',
      };
    }

    // 3. Check risk level and confirmation
    if (descriptor.risk === 'high' && !context.confirmed) {
      return {
        success: false,
        requiresConfirmation: true,
        risk: 'high',
        error: `Action "${id}" is marked as HIGH RISK and requires explicit confirmation.`,
      };
    }

    // 4. Validate input schema
    const parseResult = descriptor.inputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        success: false,
        error: `Input validation failed for capability "${id}": ${parseResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      };
    }

    // 5. Execute
    try {
      const result = await descriptor.execute(parseResult.data, context);
      return { 
        success: true, 
        result, 
        risk: descriptor.risk,
        effects: descriptor.effects
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Capability execution failed.' };
    }
  }
}

