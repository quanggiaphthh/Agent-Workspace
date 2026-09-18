import { randomUUID } from 'crypto';
import { FieldPath, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '../../lib/firebaseAdmin';
import { AuditLogEntry, AuditPage, AuditOutcome } from '../../../shared/contracts/audit';
import {
  redactAuditString,
  sanitizeAuditStringArray,
  sanitizeAuditValue,
} from './auditRedaction';

export interface AuditListOptions {
  limit?: number;
  userId?: string;
  cursor?: string;
}

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(value as number)));
}

function mapOutcome(status?: string, outcome?: string): string | undefined {
  if (outcome) return outcome;
  if (status === 'failed') return 'execution_error';
  return status;
}

function encodeCursor(timestamp: string, id: string): string {
  return Buffer.from(JSON.stringify({ timestamp, id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): { timestamp: string; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.timestamp !== 'string' || typeof parsed?.id !== 'string') return undefined;
    return { timestamp: parsed.timestamp, id: parsed.id };
  } catch {
    return undefined;
  }
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export class AuditService {
  private static collection() {
    return adminFirestore.collection('audit_logs');
  }

  public static summarize(value: unknown): unknown {
    return sanitizeAuditValue(value);
  }

  public static async probeHealth() {
    const startedAt = Date.now();
    try {
      // Read-only readiness probe; never writes audit data.
      await this.collection().limit(1).get();
      return { status: 'ok' as const, backend: 'firestore', durationMs: Date.now() - startedAt };
    } catch (error: any) {
      return {
        status: 'error' as const,
        backend: 'firestore',
        durationMs: Date.now() - startedAt,
        errorCode: redactAuditString(error?.code || 'AUDIT_UNAVAILABLE'),
        errorSummary: redactAuditString(error?.message || 'Audit persistence probe failed.'),
      };
    }
  }


  private static buildStoredEntry(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const id = `audit-${Date.now()}-${randomUUID()}`;
    const outcome = mapOutcome(entry.status, entry.outcome);
    const newEntry: AuditLogEntry = {
      id,
      timestamp: new Date().toISOString(),
      userId: entry.userId,
      userEmail: entry.userEmail ? redactAuditString(entry.userEmail) : undefined,
      roles: sanitizeAuditStringArray(entry.roles, 25),
      effectivePermissions: sanitizeAuditStringArray(entry.effectivePermissions, 100),
      capabilityId: entry.capabilityId,
      action: redactAuditString(entry.action),
      target: entry.target ? redactAuditString(entry.target) : undefined,
      moduleId: entry.moduleId,
      risk: entry.risk,
      outcome,
      status: outcome,
      durationMs: entry.durationMs,
      inputSummary: entry.inputSummary === undefined ? undefined : sanitizeAuditValue(entry.inputSummary),
      resultSummary: entry.resultSummary === undefined ? undefined : sanitizeAuditValue(entry.resultSummary),
      errorCode: entry.errorCode ? redactAuditString(entry.errorCode) : undefined,
      errorSummary: entry.errorSummary ? redactAuditString(entry.errorSummary) : undefined,
      errorMessage: entry.errorMessage ? redactAuditString(entry.errorMessage) : undefined,
      source: entry.source || (entry.agentInitiated ? 'agent' : 'user'),
      agentInitiated: entry.agentInitiated,
      sessionId: entry.sessionId ? redactAuditString(entry.sessionId) : undefined,
      toolCallId: entry.toolCallId ? redactAuditString(entry.toolCallId) : undefined,
      requestId: entry.requestId ? redactAuditString(entry.requestId) : undefined,
      confirmationId: entry.confirmationId ? redactAuditString(entry.confirmationId) : undefined,
      confirmed: entry.confirmed,
      metadata: entry.metadata === undefined
        ? undefined
        : sanitizeAuditValue(entry.metadata) as Record<string, any>,
      completedAt: entry.completedAt,
    };

    return omitUndefined(newEntry as unknown as Record<string, unknown>) as unknown as AuditLogEntry;
  }

  public static stageLog(
    transaction: Transaction,
    entry: Omit<AuditLogEntry, 'id' | 'timestamp'>,
  ): AuditLogEntry {
    const storedEntry = this.buildStoredEntry(entry);
    transaction.set(this.collection().doc(storedEntry.id), storedEntry);
    return storedEntry;
  }

  public static async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const storedEntry = this.buildStoredEntry(entry);
    await this.collection().doc(storedEntry.id).set(storedEntry);
    return storedEntry;
  }

  public static async update(
    id: string,
    patch: Partial<Pick<AuditLogEntry,
      | 'status'
      | 'outcome'
      | 'durationMs'
      | 'resultSummary'
      | 'errorCode'
      | 'errorSummary'
      | 'errorMessage'
      | 'confirmed'
      | 'confirmationId'
      | 'metadata'
    >>,
  ): Promise<void> {
    const update: Record<string, unknown> = {};
    const outcome = mapOutcome(patch.status, patch.outcome);
    if (outcome !== undefined) {
      update.outcome = outcome;
      update.status = outcome;
    }
    if (patch.durationMs !== undefined) update.durationMs = Math.max(0, Math.floor(patch.durationMs));
    if (patch.resultSummary !== undefined) update.resultSummary = sanitizeAuditValue(patch.resultSummary);
    if (patch.errorCode !== undefined) update.errorCode = redactAuditString(patch.errorCode);
    if (patch.errorSummary !== undefined) update.errorSummary = redactAuditString(patch.errorSummary);
    if (patch.errorMessage !== undefined) update.errorMessage = redactAuditString(patch.errorMessage);
    if (patch.confirmed !== undefined) update.confirmed = patch.confirmed;
    if (patch.confirmationId !== undefined) update.confirmationId = redactAuditString(patch.confirmationId);
    if (patch.metadata !== undefined) update.metadata = sanitizeAuditValue(patch.metadata);
    update.completedAt = new Date().toISOString();
    await this.collection().doc(id).update(update);
  }

  public static async list(options: AuditListOptions = {}): Promise<AuditPage> {
    const limit = clampLimit(options.limit);
    const cursor = decodeCursor(options.cursor);
    let query: any = this.collection();

    // Tenant isolation is applied in Firestore before ordering, cursoring and limiting.
    if (options.userId) {
      query = query.where('userId', '==', options.userId);
    }

    query = query.orderBy('timestamp', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (cursor) {
      query = query.startAfter(cursor.timestamp, this.collection().doc(cursor.id));
    }
    query = query.limit(limit);

    const snapshot = await query.get();
    const items = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as AuditLogEntry));
    const last = snapshot.docs[snapshot.docs.length - 1];
    const nextCursor = last && snapshot.docs.length === limit
      ? encodeCursor(last.data().timestamp, last.id)
      : undefined;

    return { items, nextCursor };
  }
}
