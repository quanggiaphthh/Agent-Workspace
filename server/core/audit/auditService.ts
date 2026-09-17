import { AuditLogEntry } from '../../../shared/contracts/audit';
import { storage } from '../../infrastructure/storage';

export class AuditService {
  public static async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const data = storage.getData();
    const newEntry: AuditLogEntry = {
      source: entry.agentInitiated ? 'agent' : 'user',
      ...entry,
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    data.auditLogs.unshift(newEntry);
    // Keep max 500 logs
    if (data.auditLogs.length > 500) {
      data.auditLogs = data.auditLogs.slice(0, 500);
    }
    storage.commit();
    return newEntry;
  }

  public static async list(limit = 100): Promise<AuditLogEntry[]> {
    const data = storage.getData();
    return data.auditLogs.slice(0, limit);
  }
}
