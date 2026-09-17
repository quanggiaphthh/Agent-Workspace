import fs from 'fs';
import path from 'path';
import { AuditLogEntry } from '../../shared/contracts/audit';

export interface ModuleSetting {
  id: string;
  name: string;
  enabled: boolean;
  canDisable: boolean;
  version: string;
}

export interface DbSchema {
  moduleSettings: Record<string, ModuleSetting>;
  auditLogs: AuditLogEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const INITIAL_DATA: DbSchema = {
  moduleSettings: {},
  auditLogs: [
    {
      id: 'audit-001',
      timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
      userId: 'usr_admin',
      action: 'system.bootstrap',
      moduleId: 'home',
      target: 'system',
      metadata: { reason: 'System initialization' },
      status: 'success',
    },
  ],
};

class StorageEngine {
  private data: DbSchema | null = null;

  constructor() {}

  public initialize(modules: any[], forceFresh: boolean = false) {
    console.log(`[Storage] Initializing database with module catalog (forceFresh=${forceFresh})...`);
    if (forceFresh) {
      this.data = this.createFreshData(modules);
    } else {
      this.data = this.loadData(modules);
    }
  }

  private createFreshData(modules: any[]): DbSchema {
    const catalogSettings: Record<string, ModuleSetting> = {};
    modules.forEach(m => {
      catalogSettings[m.id] = { ...m };
    });
    return {
      ...JSON.parse(JSON.stringify(INITIAL_DATA)),
      moduleSettings: catalogSettings,
    };
  }

  public reset() {
    this.data = null;
  }

  private loadData(modules: any[]): DbSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // Populate initial settings from provided modules
      const catalogSettings: Record<string, ModuleSetting> = {};
      modules.forEach(m => {
        catalogSettings[m.id] = { ...m };
      });

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          moduleSettings: { ...catalogSettings, ...(parsed.moduleSettings || {}) },
          auditLogs: parsed.auditLogs || INITIAL_DATA.auditLogs,
        };
      }
      
      const initialData = { ...INITIAL_DATA, moduleSettings: catalogSettings };
      this.saveData(initialData);
      return JSON.parse(JSON.stringify(initialData));
    } catch (err) {
      console.warn('StorageEngine load error, falling back to initial data:', err);
    }

    const catalogSettings: Record<string, ModuleSetting> = {};
    modules.forEach(m => {
      catalogSettings[m.id] = { ...m };
    });
    
    const initialData = { ...INITIAL_DATA, moduleSettings: catalogSettings };
    this.saveData(initialData);
    return JSON.parse(JSON.stringify(initialData));
  }

  private saveData(data: DbSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('StorageEngine write error:', err);
    }
  }

  public getData(): DbSchema {
    if (!this.data) {
      throw new Error('StorageEngine not initialized. Call initialize() first.');
    }
    return this.data;
  }

  public commit() {
    if (!this.data) return;
    this.saveData(this.data);
  }
}

export const storage = new StorageEngine();
