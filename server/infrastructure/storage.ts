import { adminFirestore } from '../lib/firebaseAdmin';
import { AuditService } from '../core/audit/auditService';
import { redactAuditString } from '../core/audit/auditRedaction';

export interface ModuleSetting {
  id: string;
  name: string;
  enabled: boolean;
  canDisable: boolean;
  version: string;
}

export interface DbSchema {
  moduleSettings: Record<string, ModuleSetting>;
}

interface ModulePersistenceHealth {
  status: 'ok' | 'degraded' | 'error';
  backend: 'firestore' | 'memory-test';
  mode: 'persistent' | 'initializing' | 'test-memory' | 'unavailable';
  lastError?: string;
}

interface ModuleAuditUser {
  id: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
}

class StorageEngine {
  private data: DbSchema | null = null;
  private testMode = false;
  private hydratePromise: Promise<void> | null = null;
  private health: ModulePersistenceHealth = {
    status: 'degraded',
    backend: 'firestore',
    mode: 'initializing',
  };

  private collection() {
    return adminFirestore.collection('module_settings');
  }

  public initialize(modules: any[], forceFresh: boolean = false) {
    const moduleSettings: Record<string, ModuleSetting> = {};
    modules.forEach((module) => {
      moduleSettings[module.id] = {
        id: module.id,
        name: module.name,
        enabled: module.enabled,
        canDisable: module.canDisable,
        version: module.version,
      };
    });

    this.data = { moduleSettings };
    this.hydratePromise = null;
    this.testMode = forceFresh || process.env.NODE_ENV === 'test';
    this.health = this.testMode
      ? { status: 'ok', backend: 'memory-test', mode: 'test-memory' }
      : { status: 'degraded', backend: 'firestore', mode: 'initializing' };
  }

  public reset() {
    this.data = null;
    this.hydratePromise = null;
    this.testMode = false;
    this.health = { status: 'degraded', backend: 'firestore', mode: 'initializing' };
  }

  public getData(): DbSchema {
    if (!this.data) {
      throw new Error('StorageEngine not initialized. Call initialize() first.');
    }
    return this.data;
  }

  public getPersistenceHealth(): ModulePersistenceHealth {
    return { ...this.health };
  }

  public isPersistenceAvailable(): boolean {
    return this.testMode || this.health.status === 'ok';
  }

  private recordPersistenceFailure(error: any, fallbackMessage: string): never {
    this.health = {
      status: 'error',
      backend: 'firestore',
      mode: 'unavailable',
      lastError: redactAuditString(error?.message || fallbackMessage),
    };
    throw error;
  }

  public async hydrate(): Promise<void> {
    if (!this.data) throw new Error('StorageEngine not initialized. Call initialize() first.');
    if (this.testMode) return;
    if (this.hydratePromise) return this.hydratePromise;

    this.hydratePromise = (async () => {
      try {
        const snapshot = await this.collection().get();
        const persistedEnabled = new Map<string, boolean>();
        snapshot.docs.forEach((doc) => {
          const value = doc.data();
          if (typeof value?.enabled === 'boolean') persistedEnabled.set(doc.id, value.enabled);
        });

        const missing: ModuleSetting[] = [];
        for (const [id, setting] of Object.entries(this.data!.moduleSettings)) {
          const enabled = persistedEnabled.get(id);
          if (typeof enabled === 'boolean') {
            this.data!.moduleSettings[id] = { ...setting, enabled };
          } else {
            missing.push(setting);
          }
        }

        if (missing.length > 0) {
          const batch = adminFirestore.batch();
          const updatedAt = new Date().toISOString();
          missing.forEach((setting) => {
            batch.set(this.collection().doc(setting.id), {
              id: setting.id,
              enabled: setting.enabled,
              updatedAt,
            }, { merge: true });
          });
          await batch.commit();
        }

        this.health = { status: 'ok', backend: 'firestore', mode: 'persistent' };
      } catch (error: any) {
        this.recordPersistenceFailure(error, 'Module settings persistence unavailable.');
      } finally {
        this.hydratePromise = null;
      }
    })();

    return this.hydratePromise;
  }

  /**
   * Read-through refresh used at capability policy boundaries. Unlike startup
   * hydration, this is read-only and fails closed if a disableable module has
   * no shared durable state, so another instance cannot execute from stale cache.
   */
  public async refreshModuleSettings(): Promise<void> {
    if (!this.data) throw new Error('StorageEngine not initialized. Call initialize() first.');
    if (this.testMode) return;

    try {
      const snapshot = await this.collection().get();
      const persistedEnabled = new Map<string, boolean>();
      snapshot.docs.forEach((doc) => {
        const value = doc.data();
        if (typeof value?.enabled === 'boolean') persistedEnabled.set(doc.id, value.enabled);
      });

      for (const [id, setting] of Object.entries(this.data.moduleSettings)) {
        const enabled = persistedEnabled.get(id);
        if (typeof enabled !== 'boolean') {
          if (setting.canDisable) {
            throw new Error(`Durable module state for "${id}" is unavailable.`);
          }
          continue;
        }
        this.data.moduleSettings[id] = { ...setting, enabled };
      }

      this.health = { status: 'ok', backend: 'firestore', mode: 'persistent' };
    } catch (error: any) {
      this.recordPersistenceFailure(error, 'Module settings refresh failed.');
    }
  }

  public async listModuleSettings(): Promise<ModuleSetting[]> {
    await this.refreshModuleSettings();
    return Object.values(this.getData().moduleSettings);
  }

  public async setModuleEnabled(id: string, enabled: boolean): Promise<ModuleSetting> {
    const current = this.getData().moduleSettings[id];
    if (!current) throw new Error(`Module "${id}" not found.`);

    if (this.testMode) {
      const updated = { ...current, enabled };
      this.data!.moduleSettings[id] = updated;
      return updated;
    }

    await this.refreshModuleSettings();
    const docRef = this.collection().doc(id);
    await docRef.set({
      id,
      enabled,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    const updated = { ...this.getData().moduleSettings[id], enabled };
    this.data!.moduleSettings[id] = updated;
    this.health = { status: 'ok', backend: 'firestore', mode: 'persistent' };
    return updated;
  }

  public async toggleModuleEnabledWithAudit(id: string, user: ModuleAuditUser): Promise<ModuleSetting> {
    const catalogSetting = this.getData().moduleSettings[id];
    if (!catalogSetting) throw new Error(`Module "${id}" not found.`);
    if (!catalogSetting.canDisable) throw new Error(`Module "${id}" is core and cannot be disabled.`);

    if (this.testMode) {
      const updated = { ...catalogSetting, enabled: !catalogSetting.enabled };
      this.data!.moduleSettings[id] = updated;
      return updated;
    }

    try {
      const docRef = this.collection().doc(id);
      let updated: ModuleSetting | undefined;

      await adminFirestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(docRef);
        const persistedEnabled = snapshot.data()?.enabled;
        if (typeof persistedEnabled !== 'boolean') {
          throw new Error(`Durable module state for "${id}" is unavailable.`);
        }

        const enabled = !persistedEnabled;
        updated = { ...catalogSetting, enabled };
        transaction.set(docRef, {
          id,
          enabled,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        AuditService.stageLog(transaction, {
          userId: user.id,
          userEmail: user.email,
          roles: user.roles || [],
          effectivePermissions: user.permissions || [],
          action: enabled ? 'module.enable' : 'module.disable',
          moduleId: id,
          target: id,
          metadata: { enabled },
          status: 'success',
          outcome: 'success',
          source: 'user',
        });
      });

      if (!updated) throw new Error(`Module "${id}" toggle did not complete.`);
      this.data!.moduleSettings[id] = updated;
      this.health = { status: 'ok', backend: 'firestore', mode: 'persistent' };
      return updated;
    } catch (error: any) {
      this.recordPersistenceFailure(error, 'Module toggle transaction failed.');
    }
  }
}

export const storage = new StorageEngine();
