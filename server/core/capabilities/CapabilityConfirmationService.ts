import { randomUUID } from 'crypto';
import { adminFirestore } from '../../lib/firebaseAdmin';
import {
  ConfirmationFailureCode,
  evaluateConfirmationRecord,
  hashCapabilityInput,
} from './CapabilityConfirmationPolicy';

const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const CONFIRMATION_COLLECTION = 'capability_confirmations';

export interface ConfirmationChallenge {
  confirmationId: string;
  expiresAt: string;
}

export interface ConfirmationConsumeResult {
  ok: boolean;
  confirmationId: string;
  errorCode?: ConfirmationFailureCode;
  errorSummary?: string;
}

export class CapabilityConfirmationService {
  private static collection() {
    return adminFirestore.collection(CONFIRMATION_COLLECTION);
  }

  public static async prepare(options: {
    userId: string;
    capabilityId: string;
    rawInput: unknown;
    ttlMs?: number;
  }): Promise<ConfirmationChallenge> {
    const confirmationId = `confirm-${randomUUID()}`;
    const now = Date.now();
    const ttlMs = Math.max(1_000, Math.min(options.ttlMs ?? CONFIRMATION_TTL_MS, 15 * 60 * 1000));
    const expiresAtMs = now + ttlMs;

    await this.collection().doc(confirmationId).set({
      confirmationId,
      userId: options.userId,
      capabilityId: options.capabilityId,
      inputHash: hashCapabilityInput(options.rawInput),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(expiresAtMs),
      expiresAtMs,
      consumedAt: null,
    });

    return {
      confirmationId,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  public static async consume(options: {
    confirmationId: string;
    userId: string;
    capabilityId: string;
    rawInput: unknown;
  }): Promise<ConfirmationConsumeResult> {
    const ref = this.collection().doc(options.confirmationId);
    const expected = {
      userId: options.userId,
      capabilityId: options.capabilityId,
      inputHash: hashCapabilityInput(options.rawInput),
    };

    return adminFirestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        return {
          ok: false,
          confirmationId: options.confirmationId,
          errorCode: 'CONFIRMATION_NOT_FOUND' as const,
          errorSummary: 'Confirmation challenge was not found.',
        };
      }

      const challenge = snapshot.data() as Record<string, any>;
      const evaluation = evaluateConfirmationRecord(challenge as any, expected);
      if (!evaluation.ok) {
        return {
          ok: false,
          confirmationId: options.confirmationId,
          errorCode: evaluation.errorCode,
          errorSummary: evaluation.errorSummary,
        };
      }

      // The read+write is one Firestore transaction, so only one concurrent caller can consume the challenge.
      transaction.update(ref, { consumedAt: new Date().toISOString() });
      return { ok: true, confirmationId: options.confirmationId };
    });
  }
}
