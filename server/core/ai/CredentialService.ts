import crypto from 'node:crypto';
import { FieldValue, type UpdateData } from 'firebase-admin/firestore';
import { adminFirestore } from '../../lib/firebaseAdmin';
import type { AIProviderId } from '../../../shared/contracts/ai';
import {
  createCredentialSecretProtectorFromEnvironment,
  type ProtectedCredentialSecret,
} from './credentialSecretProtector';

export type CredentialStatus = 'active' | 'disabled' | 'invalid';

export interface CredentialEntry {
  id: string;
  userId: string;
  providerId: AIProviderId;
  name: string;
  key: string;
  priority: number;
  status: CredentialStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialMetadata {
  id: string;
  userId: string;
  providerId: AIProviderId;
  name: string;
  priority: number;
  status: CredentialStatus;
  createdAt: string;
  updatedAt: string;
  encryptionVersion: number | null;
}

interface StoredCredential {
  id: string;
  userId: string;
  providerId: AIProviderId;
  name: string;
  priority?: number;
  status?: CredentialStatus;
  createdAt: string;
  updatedAt?: string;
  encryptionVersion?: number;
  secret?: ProtectedCredentialSecret;
  // Pre-GĐ4D encrypted fields. Read only for migration; never written by GĐ4D.
  secretCiphertext?: string;
  secretIv?: string;
  secretTag?: string;
  // Pre-encryption legacy field. Read only for migration; never written by GĐ4D.
  key?: string;
}

export interface CredentialUpdateInput {
  providerId: AIProviderId;
  key?: string;
  name?: string;
}

function credentialError(code: string, message: string, status: number): Error & { code: string; status: number } {
  const err = new Error(message) as Error & { code: string; status: number };
  err.code = code;
  err.status = status;
  return err;
}

function normalizeStatus(value: unknown): CredentialStatus {
  return value === 'disabled' || value === 'invalid' ? value : 'active';
}

function toMetadata(stored: StoredCredential): CredentialMetadata {
  return {
    id: stored.id,
    userId: stored.userId,
    providerId: stored.providerId,
    name: stored.name,
    priority: Number.isFinite(stored.priority) ? Number(stored.priority) : 0,
    status: normalizeStatus(stored.status),
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt || stored.createdAt,
    encryptionVersion: Number.isFinite(stored.encryptionVersion)
      ? Number(stored.encryptionVersion)
      : stored.secret?.version ?? null,
  };
}

export class CredentialService {
  private static getCollection(userId: string) {
    return adminFirestore
      .collection('users')
      .doc(userId)
      .collection('credentials');
  }

  private static assertOwned(stored: StoredCredential, userId: string): void {
    if (stored.userId !== userId) {
      throw credentialError('CREDENTIAL_FORBIDDEN', 'Credential is not owned by the authenticated user.', 403);
    }
  }

  private static async migrateLegacyCredential(userId: string, credentialId: string): Promise<ProtectedCredentialSecret> {
    const protector = createCredentialSecretProtectorFromEnvironment();
    const ref = this.getCollection(userId).doc(credentialId);

    try {
      return await adminFirestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) {
          throw credentialError('CREDENTIAL_NOT_FOUND', 'Credential not found.', 404);
        }

        const current = snapshot.data() as StoredCredential;
        this.assertOwned(current, userId);

        if (current.secret) {
          return current.secret;
        }

        let plaintext: string;
        if (typeof current.key === 'string' && current.key.length > 0) {
          plaintext = current.key;
        } else if (current.secretCiphertext && current.secretIv && current.secretTag) {
          plaintext = await protector.unprotectLegacyAesGcm({
            ciphertext: current.secretCiphertext,
            iv: current.secretIv,
            authTag: current.secretTag,
          });
        } else {
          throw credentialError('CREDENTIAL_SECRET_MISSING', 'Credential secret is unavailable.', 503);
        }

        const protectedSecret = await protector.protect(plaintext);
        const updatedAt = new Date().toISOString();
        transaction.update(ref, {
          secret: protectedSecret,
          encryptionVersion: protectedSecret.version,
          updatedAt,
          key: FieldValue.delete(),
          secretCiphertext: FieldValue.delete(),
          secretIv: FieldValue.delete(),
          secretTag: FieldValue.delete(),
        } satisfies UpdateData<StoredCredential>);
        return protectedSecret;
      });
    } catch (err: any) {
      if (err?.code === 'CREDENTIAL_NOT_FOUND' || err?.code === 'CREDENTIAL_FORBIDDEN') throw err;
      throw credentialError(
        'CREDENTIAL_MIGRATION_FAILED',
        'Credential migration failed; the legacy secret was not used.',
        503,
      );
    }
  }

  private static async normalizeStoredCredential(
    userId: string,
    stored: StoredCredential,
  ): Promise<CredentialEntry> {
    this.assertOwned(stored, userId);
    const protector = createCredentialSecretProtectorFromEnvironment();

    let protectedSecret = stored.secret;
    if (!protectedSecret) {
      protectedSecret = await this.migrateLegacyCredential(userId, stored.id);
    }

    let key: string;
    try {
      key = await protector.unprotect(protectedSecret);
    } catch (err: any) {
      if (err?.code === 'CREDENTIAL_SECRET_BACKEND_UNAVAILABLE') throw err;
      throw credentialError(
        'CREDENTIAL_SECRET_DECRYPT_FAILED',
        'Credential secret could not be decrypted.',
        503,
      );
    }

    const metadata = toMetadata({ ...stored, secret: protectedSecret });
    return { ...metadata, key };
  }

  public static async saveCredential(
    userId: string,
    providerId: AIProviderId,
    key: string,
    name: string,
  ): Promise<string> {
    const plaintext = key.trim();
    if (!plaintext) {
      throw credentialError('CREDENTIAL_SECRET_INVALID', 'Credential key cannot be empty.', 400);
    }

    const protector = createCredentialSecretProtectorFromEnvironment();
    const protectedSecret = await protector.protect(plaintext);
    const collection = this.getCollection(userId);
    const id = `cred_${crypto.randomBytes(8).toString('hex')}`;
    const ref = collection.doc(id);
    const now = new Date().toISOString();

    await adminFirestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(collection.where('providerId', '==', providerId));
      const priorities = snapshot.docs
        .map((doc: any) => Number((doc.data() as StoredCredential).priority))
        .filter((value: number) => Number.isFinite(value));
      const priority = priorities.length > 0 ? Math.max(...priorities) + 1 : 0;

      transaction.set(ref, {
        id,
        userId,
        providerId,
        name: name?.trim() || 'Key',
        priority,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        encryptionVersion: protectedSecret.version,
        secret: protectedSecret,
      } satisfies StoredCredential);
    });

    return id;
  }

  public static async updateCredential(
    userId: string,
    credentialId: string,
    updates: CredentialUpdateInput,
  ): Promise<void> {
    if (credentialId === 'system') {
      throw credentialError('SYSTEM_CREDENTIAL_IMMUTABLE', 'System credential cannot be updated.', 400);
    }

    const nextName = typeof updates.name === 'string' ? updates.name.trim() : undefined;
    const nextPlaintext = typeof updates.key === 'string' ? updates.key.trim() : undefined;
    if (updates.key !== undefined && !nextPlaintext) {
      throw credentialError('CREDENTIAL_SECRET_INVALID', 'Credential key cannot be empty.', 400);
    }
    if (updates.name !== undefined && !nextName) {
      throw credentialError('CREDENTIAL_NAME_INVALID', 'Credential name cannot be empty.', 400);
    }
    if (updates.key === undefined && updates.name === undefined) {
      throw credentialError('CREDENTIAL_UPDATE_EMPTY', 'No credential changes were supplied.', 400);
    }

    const protectedSecret = nextPlaintext
      ? await createCredentialSecretProtectorFromEnvironment().protect(nextPlaintext)
      : undefined;
    const ref = this.getCollection(userId).doc(credentialId);

    await adminFirestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw credentialError('CREDENTIAL_NOT_FOUND', 'Credential not found.', 404);
      }
      const current = snapshot.data() as StoredCredential;
      this.assertOwned(current, userId);
      if (current.providerId !== updates.providerId) {
        throw credentialError('CREDENTIAL_PROVIDER_MISMATCH', 'Credential provider mismatch.', 400);
      }

      const patch: UpdateData<StoredCredential> = { updatedAt: new Date().toISOString() };
      if (nextName) patch.name = nextName;
      if (protectedSecret) {
        patch.secret = protectedSecret;
        patch.encryptionVersion = protectedSecret.version;
        patch.key = FieldValue.delete();
        patch.secretCiphertext = FieldValue.delete();
        patch.secretIv = FieldValue.delete();
        patch.secretTag = FieldValue.delete();
      }
      transaction.update(ref, patch);
    });
  }

  public static getSystemCredential(providerId: AIProviderId): CredentialEntry | null {
    if (providerId !== 'google') return null;
    const key = process.env.GEMINI_API_KEY?.trim() || '';
    if (!key) return null;
    return {
      id: 'system',
      userId: 'system',
      providerId: 'google',
      name: 'System Google Gemini Key',
      key,
      priority: Number.MAX_SAFE_INTEGER,
      status: 'active',
      createdAt: '',
      updatedAt: '',
    };
  }

  public static async getCredential(userId: string, credentialId: string): Promise<CredentialEntry | null> {
    if (credentialId === 'system') return null;

    const doc = await this.getCollection(userId).doc(credentialId).get();
    if (!doc.exists) return null;
    const stored = doc.data() as StoredCredential;
    this.assertOwned(stored, userId);
    return this.normalizeStoredCredential(userId, stored);
  }

  public static async resolveCredential(
    userId: string,
    providerId: AIProviderId,
    credentialId: string,
  ): Promise<CredentialEntry> {
    if (credentialId === 'system') {
      const system = this.getSystemCredential(providerId);
      if (!system) {
        throw credentialError(
          'SYSTEM_CREDENTIAL_UNAVAILABLE',
          `System credential is not available for provider "${providerId}".`,
          400,
        );
      }
      return system;
    }

    const credential = await this.getCredential(userId, credentialId);
    if (!credential) {
      throw credentialError('CREDENTIAL_NOT_FOUND', 'Credential not found.', 404);
    }
    if (credential.providerId !== providerId) {
      throw credentialError('CREDENTIAL_PROVIDER_MISMATCH', 'Credential provider mismatch.', 400);
    }
    if (credential.status !== 'active') {
      throw credentialError('CREDENTIAL_INACTIVE', 'Credential is not active.', 409);
    }
    return credential;
  }

  public static async listAgentCredentialOptions(userId: string): Promise<{
    systemAvailable: boolean;
    credentials: CredentialMetadata[];
  }> {
    const credentials = (await this.listCredentials(userId))
      .filter((credential) => credential.providerId === 'google' && credential.status === 'active');
    return {
      systemAvailable: this.getSystemCredential('google') !== null,
      credentials,
    };
  }

  public static async listCredentials(userId: string): Promise<CredentialMetadata[]> {
    const snapshot = await this.getCollection(userId).get();
    const owned = snapshot.docs
      .map((doc: any) => doc.data() as StoredCredential)
      .filter((stored: StoredCredential) => stored.userId === userId);

    const migrated = await Promise.all(owned.map(async (stored) => {
      const hasLegacySecret = !stored.secret && (
        (typeof stored.key === 'string' && stored.key.length > 0) ||
        Boolean(stored.secretCiphertext && stored.secretIv && stored.secretTag)
      );
      if (!hasLegacySecret) return stored;
      const protectedSecret = await this.migrateLegacyCredential(userId, stored.id);
      return {
        ...stored,
        secret: protectedSecret,
        encryptionVersion: protectedSecret.version,
        key: undefined,
        secretCiphertext: undefined,
        secretIv: undefined,
        secretTag: undefined,
      };
    }));

    return migrated
      .map(toMetadata)
      .sort((a, b) => a.providerId.localeCompare(b.providerId) || a.priority - b.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  public static async listFullCredentials(userId: string, providerId: AIProviderId): Promise<CredentialEntry[]> {
    const snapshot = await this.getCollection(userId).where('providerId', '==', providerId).get();
    const stored = snapshot.docs
      .map((doc: any) => doc.data() as StoredCredential)
      .filter((item: StoredCredential) => item.userId === userId && normalizeStatus(item.status) === 'active');
    const credentials = await Promise.all(stored.map((item) => this.normalizeStoredCredential(userId, item)));
    return credentials.sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  public static async getRotationCandidates(
    userId: string,
    providerId: AIProviderId,
    selectedCredentialId: string,
  ): Promise<CredentialEntry[]> {
    const selected = await this.resolveCredential(userId, providerId, selectedCredentialId);
    if (selected.id === 'system') return [selected];

    const personal = await this.listFullCredentials(userId, providerId);
    return [selected, ...personal.filter((credential) => credential.id !== selected.id)];
  }

  public static async reorderCredentials(userId: string, providerId: AIProviderId, credentialIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(credentialIds));
    if (uniqueIds.length !== credentialIds.length) {
      throw credentialError('CREDENTIAL_ORDER_INVALID', 'Credential order contains duplicate IDs.', 400);
    }

    const collection = this.getCollection(userId);
    await adminFirestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(collection.where('providerId', '==', providerId));
      const current = snapshot.docs
        .map((doc: any) => doc.data() as StoredCredential)
        .filter((item: StoredCredential) => item.userId === userId);
      const providerIds = current.map((credential) => credential.id);

      if (providerIds.length !== uniqueIds.length || providerIds.some((id) => !uniqueIds.includes(id))) {
        throw credentialError(
          'CREDENTIAL_ORDER_INVALID',
          'Credential order must contain every credential for the selected provider exactly once.',
          400,
        );
      }

      uniqueIds.forEach((id, priority) => {
        transaction.update(collection.doc(id), { priority, updatedAt: new Date().toISOString() } satisfies UpdateData<StoredCredential>);
      });
    });
  }

  public static async deleteCredential(userId: string, credentialId: string): Promise<void> {
    if (credentialId === 'system') {
      throw credentialError('SYSTEM_CREDENTIAL_IMMUTABLE', 'System credential cannot be deleted.', 400);
    }

    const ref = this.getCollection(userId).doc(credentialId);
    await adminFirestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw credentialError('CREDENTIAL_NOT_FOUND', 'Credential not found.', 404);
      }
      const current = snapshot.data() as StoredCredential;
      this.assertOwned(current, userId);
      transaction.delete(ref);
    });
  }
}
