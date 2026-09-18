import crypto from 'node:crypto';

export const CREDENTIAL_SECRET_VERSION = 1 as const;
export const CREDENTIAL_SECRET_ALGORITHM = 'aes-256-gcm' as const;

export interface ProtectedCredentialSecret {
  version: typeof CREDENTIAL_SECRET_VERSION;
  algorithm: typeof CREDENTIAL_SECRET_ALGORITHM;
  keyId: string;
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface LegacyAesGcmSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface CredentialSecretProtector {
  protect(plaintext: string): Promise<ProtectedCredentialSecret>;
  unprotect(payload: ProtectedCredentialSecret): Promise<string>;
  unprotectLegacyAesGcm(payload: LegacyAesGcmSecret): Promise<string>;
}

export class CredentialSecretProtectionError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 503) {
    super(message);
    this.name = 'CredentialSecretProtectionError';
    this.code = code;
    this.status = status;
  }
}

function deriveAesKey(rawMasterKey: string): Buffer {
  const raw = rawMasterKey.trim();
  if (Buffer.byteLength(raw, 'utf8') < 32) {
    throw new CredentialSecretProtectionError(
      'CREDENTIAL_SECRET_BACKEND_UNAVAILABLE',
      'Credential secret backend is not configured.',
    );
  }
  // Preserve compatibility with the pre-GĐ4D AES-GCM format while deriving
  // exactly 256 bits for AES-256. The source master secret stays server-only.
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function decodeBase64(value: string, field: string): Buffer {
  try {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length === 0) throw new Error('empty');
    return decoded;
  } catch {
    throw new CredentialSecretProtectionError(
      'CREDENTIAL_SECRET_DECRYPT_FAILED',
      `Protected credential ${field} is invalid.`,
      500,
    );
  }
}

export class EnvAesGcmCredentialSecretProtector implements CredentialSecretProtector {
  private readonly key: Buffer;
  private readonly keyId: string;

  constructor(masterKey: string, keyId = 'env-v1') {
    this.key = deriveAesKey(masterKey);
    this.keyId = keyId.trim() || 'env-v1';
  }

  async protect(plaintext: string): Promise<ProtectedCredentialSecret> {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
      throw new CredentialSecretProtectionError(
        'CREDENTIAL_SECRET_INVALID',
        'Credential secret is empty.',
        400,
      );
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(CREDENTIAL_SECRET_ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return {
      version: CREDENTIAL_SECRET_VERSION,
      algorithm: CREDENTIAL_SECRET_ALGORITHM,
      keyId: this.keyId,
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  async unprotect(payload: ProtectedCredentialSecret): Promise<string> {
    if (
      payload?.version !== CREDENTIAL_SECRET_VERSION ||
      payload?.algorithm !== CREDENTIAL_SECRET_ALGORITHM ||
      payload?.keyId !== this.keyId
    ) {
      throw new CredentialSecretProtectionError(
        'CREDENTIAL_SECRET_DECRYPT_FAILED',
        'Protected credential format or key version is unavailable.',
        503,
      );
    }

    return this.decrypt({
      ciphertext: payload.ciphertext,
      iv: payload.iv,
      authTag: payload.authTag,
    });
  }

  async unprotectLegacyAesGcm(payload: LegacyAesGcmSecret): Promise<string> {
    return this.decrypt(payload);
  }

  private decrypt(payload: LegacyAesGcmSecret): string {
    try {
      const iv = decodeBase64(payload.iv, 'iv');
      const ciphertext = decodeBase64(payload.ciphertext, 'ciphertext');
      const authTag = decodeBase64(payload.authTag, 'authTag');
      if (iv.length !== 12 || authTag.length !== 16) throw new Error('invalid AES-GCM parameters');
      const decipher = crypto.createDecipheriv(CREDENTIAL_SECRET_ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (err) {
      if (err instanceof CredentialSecretProtectionError) throw err;
      throw new CredentialSecretProtectionError(
        'CREDENTIAL_SECRET_DECRYPT_FAILED',
        'Credential secret could not be decrypted.',
        503,
      );
    }
  }
}

export function createCredentialSecretProtectorFromEnvironment(): CredentialSecretProtector {
  const masterKey = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!masterKey) {
    throw new CredentialSecretProtectionError(
      'CREDENTIAL_SECRET_BACKEND_UNAVAILABLE',
      'Credential secret backend is not configured.',
    );
  }
  const keyId = process.env.CREDENTIAL_ENCRYPTION_KEY_ID?.trim() || 'env-v1';
  return new EnvAesGcmCredentialSecretProtector(masterKey, keyId);
}
