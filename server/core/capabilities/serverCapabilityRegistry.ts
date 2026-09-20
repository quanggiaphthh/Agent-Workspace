import { z } from 'zod';
import { CapabilityDescriptor, ExecutionContext } from '../../../shared/contracts/capability';
import { isCanonicalPermissionId } from '../../../shared/security/permissions';
import { storage } from '../../infrastructure/storage';
import { serverModuleCatalog } from '../modules/moduleCatalog';
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
  /** Internal gateway signal; never persisted as capability output. */
  executionStarted?: boolean;
}

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return !!value && typeof (value as any).safeParse === 'function' && typeof (value as any).parse === 'function';
}

function normalizeDescriptor<TInput, TOutput>(descriptor: CapabilityDescriptor<TInput, TOutput>): CapabilityDescriptor<TInput, TOutput> {
  // Compatibility rule: historical high-risk descriptors required confirmation. Preserve that protection.
  const confirmationPolicy = descriptor.confirmationPolicy ?? (descriptor.risk === 'high' ? 'required' : 'none');
  const sideEffect = descriptor.sideEffect ?? (descriptor.risk === 'high' ? 'mutation' : 'none');
  return { ...descriptor, sideEffect, confirmationPolicy };
}

export class ServerCapabilityRegistry {
  /** Maximum UTF-8 byte size of JSON-serialized successful tool output. Never silently truncates. */
  public static readonly MAX_RESULT_BYTES = 512 * 1024;
  private static capabilities: Map<string, CapabilityDescriptor<any, any>> = new Map();

  public static register<TInput, TOutput>(rawDescriptor: CapabilityDescriptor<TInput, TOutput>) {
    if (!rawDescriptor || typeof rawDescriptor !== 'object') throw new Error('Invalid capability descriptor.');
    if (typeof rawDescriptor.id !== 'string' || !rawDescriptor.id.trim()) throw new Error('Capability descriptor requires a non-empty ID.');
    if (this.capabilities.has(rawDescriptor.id)) throw new Error(`Duplicate capability ID "${rawDescriptor.id}".`);
    if (typeof rawDescriptor.description !== 'string' || !rawDescriptor.description.trim()) throw new Error(`Capability "${rawDescriptor.id}" requires a description.`);
    if (typeof rawDescriptor.execute !== 'function') throw new Error(`Capability "${rawDescriptor.id}" requires an executable handler.`);
    if (!isZodSchema(rawDescriptor.inputSchema)) throw new Error(`Capability "${rawDescriptor.id}" has an invalid input schema.`);
    if (rawDescriptor.outputSchema !== undefined && !isZodSchema(rawDescriptor.outputSchema)) throw new Error(`Capability "${rawDescriptor.id}" has an invalid output schema.`);
    if (!['low', 'medium', 'high'].includes(rawDescriptor.risk)) throw new Error(`Capability "${rawDescriptor.id}" has invalid risk metadata.`);
    if (!Array.isArray(rawDescriptor.permissions) || rawDescriptor.permissions.some(permission => typeof permission !== 'string' || !isCanonicalPermissionId(permission))) {
      throw new Error(`Capability "${rawDescriptor.id}" declares an unknown permission.`);
    }
    if (typeof rawDescriptor.moduleId !== 'string' || !rawDescriptor.moduleId.trim()) throw new Error(`Capability "${rawDescriptor.id}" requires a module association.`);
    if (!['ui', 'system'].includes(rawDescriptor.moduleId) && !serverModuleCatalog.get(rawDescriptor.moduleId)) {
      throw new Error(`Capability "${rawDescriptor.id}" references unknown module "${rawDescriptor.moduleId}".`);
    }
    if (rawDescriptor.sideEffect !== undefined && !['none', 'mutation', 'ui-local'].includes(rawDescriptor.sideEffect)) {
      throw new Error(`Capability "${rawDescriptor.id}" has invalid side-effect metadata.`);
    }
    if (rawDescriptor.confirmationPolicy !== undefined && !['none', 'required'].includes(rawDescriptor.confirmationPolicy)) {
      throw new Error(`Capability "${rawDescriptor.id}" has invalid confirmation policy.`);
    }

    const descriptor = normalizeDescriptor(rawDescriptor);
    if (descriptor.confirmationPolicy === 'required' && descriptor.sideEffect === 'none') {
      throw new Error(`Capability "${descriptor.id}" cannot require confirmation while declaring no side effect.`);
    }
    this.capabilities.set(descriptor.id, descriptor);
  }

  public static get(id: string): CapabilityDescriptor<any, any> | undefined { return this.capabilities.get(id); }
  public static listAll(): CapabilityDescriptor<any, any>[] { return Array.from(this.capabilities.values()); }
  public static reset() { this.capabilities.clear(); }

  public static async listForContext(context: ExecutionContext): Promise<CapabilityDescriptor<any, any>[]> {
    await storage.refreshModuleSettings();
    const settings = storage.getData().moduleSettings;
    return Array.from(this.capabilities.values()).filter(cap => {
      if (cap.moduleId !== 'ui' && cap.moduleId !== 'system') {
        const moduleSetting = settings[cap.moduleId];
        if (!moduleSetting) return false;
        if (moduleSetting.canDisable && !storage.isPersistenceAvailable()) return false;
        if (!moduleSetting.enabled) return false;
      }
      return PermissionResolver.checkPermission(cap.permissions || [], context).authorized;
    });
  }

  public static validateStoredSuccess(id: string, stored: ServerCapabilityExecutionResult): ServerCapabilityExecutionResult {
    const descriptor = this.capabilities.get(id);
    if (!descriptor || !stored?.success) return { success: false, errorCode: 'EXECUTION_RECONCILIATION_REQUIRED', error: 'Stored execution result is not valid for reconciliation.' };
    const output = descriptor.outputSchema?.safeParse(stored.result);
    if (output && !output.success) return { success: false, errorCode: 'INVALID_OUTPUT', error: `Capability "${id}" stored output violates its declared contract.` };
    const result = output?.success ? output.data : stored.result;
    let serialized: string;
    try { serialized = JSON.stringify(result); } catch { return { success: false, errorCode: 'INVALID_OUTPUT', error: `Capability "${id}" stored output is non-serializable.` }; }
    if (serialized === undefined) return { success: false, errorCode: 'INVALID_OUTPUT', error: `Capability "${id}" stored output is non-serializable.` };
    if (Buffer.byteLength(serialized, 'utf8') > this.MAX_RESULT_BYTES) return { success: false, errorCode: 'RESULT_TOO_LARGE', error: `Capability "${id}" stored result exceeds the ${this.MAX_RESULT_BYTES}-byte execution limit.` };
    const { executionStarted: _executionStarted, ...safeStored } = stored;
    return { ...safeStored, result };
  }

  public static async execute(id: string, rawInput: unknown, context: ExecutionContext): Promise<ServerCapabilityExecutionResult> {
    const descriptor = this.capabilities.get(id);
    if (!descriptor) return { success: false, errorCode: 'CAPABILITY_NOT_FOUND', error: `Capability "${id}" not found or not registered.` };

    // Discovery removes disabled server-configured tools, and execution repeats
    // the check so a stale/hallucinated call cannot bypass discovery policy.
    if (id === 'system.web.search' && context.appContext?.aiConfig?.webSearchEnabled === false) {
      return { success: false, errorCode: 'CAPABILITY_DISABLED', error: 'Web Search is disabled for this Agent run.' };
    }
    if (id.startsWith('system.memory.') && context.appContext?.aiConfig?.memoryEnabled === false) {
      return { success: false, errorCode: 'CAPABILITY_DISABLED', error: 'Memory tools are disabled for this Agent run.' };
    }

    const parseResult = descriptor.inputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return { success: false, errorCode: 'INVALID_INPUT', error: `Input validation failed for capability "${id}": ${parseResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}` };
    }

    if (descriptor.moduleId !== 'ui' && descriptor.moduleId !== 'system') {
      try { await storage.refreshModuleSettings(); } catch {
        return { success: false, errorCode: 'MODULE_SETTINGS_UNAVAILABLE', error: `Capability "${id}" is unavailable because durable module settings cannot be verified.` };
      }
      const moduleSetting = storage.getData().moduleSettings[descriptor.moduleId];
      if (!moduleSetting) return { success: false, errorCode: 'MODULE_NOT_FOUND', error: `Capability "${id}" is unavailable because module "${descriptor.moduleId}" is not registered.` };
      if (moduleSetting.canDisable && !storage.isPersistenceAvailable()) return { success: false, errorCode: 'MODULE_SETTINGS_UNAVAILABLE', error: `Capability "${id}" is unavailable because durable module settings cannot be verified.` };
      if (!moduleSetting.enabled) return { success: false, errorCode: 'MODULE_DISABLED', error: `Capability "${id}" is unavailable because module "${descriptor.moduleId}" is currently disabled.` };
    }

    if ((id.startsWith('system.memory.') || id.startsWith('system.tasks.')) && (!context.user?.id || ['guest', 'anonymous'].includes(context.user.id))) {
      return { success: false, errorCode: 'UNAUTHENTICATED', error: `Unauthorized: Unauthenticated guests are not allowed to execute system capability "${id}".` };
    }

    const authResult = await PermissionResolver.resolve(descriptor.permissions || [], context);
    if (!authResult.authorized) return { success: false, errorCode: 'PERMISSION_DENIED', error: authResult.error || 'Unauthorized execution attempt.' };

    if (descriptor.confirmationPolicy === 'required' && !context.confirmed) {
      return { success: false, errorCode: 'CONFIRMATION_REQUIRED', requiresConfirmation: true, risk: descriptor.risk, error: `Action "${id}" requires server-authoritative confirmation.` };
    }
    if (context.abortSignal?.aborted) return { success: false, errorCode: 'EXECUTION_CANCELLED', error: 'Execution cancelled.' };

    try {
      const rawResult = await descriptor.execute(parseResult.data, context);
      const output = descriptor.outputSchema?.safeParse(rawResult);
      if (output && !output.success) {
        return { success: false, errorCode: 'INVALID_OUTPUT', error: `Capability "${id}" returned output that violates its declared contract.` };
      }
      const result = output?.success ? output.data : rawResult;
      let serialized: string;
      try { serialized = JSON.stringify(result); } catch { return { success: false, errorCode: 'INVALID_OUTPUT', error: `Capability "${id}" returned a non-serializable result.` }; }
      if (serialized === undefined) return { success: false, errorCode: 'INVALID_OUTPUT', error: `Capability "${id}" returned a non-serializable result.` };
      const resultBytes = Buffer.byteLength(serialized, 'utf8');
      if (resultBytes > this.MAX_RESULT_BYTES) {
        return { success: false, errorCode: 'RESULT_TOO_LARGE', error: `Capability "${id}" result exceeds the ${this.MAX_RESULT_BYTES}-byte execution limit.` };
      }
      return { success: true, result, risk: descriptor.risk, effects: descriptor.effects, executionStarted: true };
    } catch (err: any) {
      if (context.abortSignal?.aborted || isCancellationError(err)) return { success: false, errorCode: 'EXECUTION_CANCELLED', error: 'Execution cancelled.', executionStarted: true };
      return { success: false, errorCode: 'EXECUTION_ERROR', error: err?.message || 'Capability execution failed.', executionStarted: true };
    }
  }
}
