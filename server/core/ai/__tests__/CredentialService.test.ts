import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  collection: vi.fn(),
  runTransaction: vi.fn(),
  documentGet: vi.fn(),
  transactionGet: vi.fn(),
  transactionUpdate: vi.fn(),
  protectorFactory: vi.fn(),
  protect: vi.fn(),
  unprotect: vi.fn(),
  unprotectLegacyAesGcm: vi.fn(),
  deletedField: 'DELETE_FIELD',
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => firestoreMocks.deletedField },
}));

vi.mock('../../../lib/firebaseAdmin', () => ({
  adminFirestore: {
    collection: firestoreMocks.collection,
    runTransaction: firestoreMocks.runTransaction,
  },
}));

vi.mock('../credentialSecretProtector', () => ({
  createCredentialSecretProtectorFromEnvironment: firestoreMocks.protectorFactory,
}));

import { CredentialService } from '../CredentialService';

const secret = {
  version: 2,
  keyId: 'test-key',
  ciphertext: 'protected-secret',
  iv: 'test-iv',
  tag: 'test-tag',
};

const metadata = (overrides: Record<string, unknown> = {}) => ({
  id: 'credential-1',
  userId: 'owner-1',
  providerId: 'google',
  name: 'Gemini',
  priority: 0,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

const snapshot = (row: Record<string, unknown>) => ({
  exists: true,
  data: () => row,
});

describe('CredentialService metadata listing and secret-use migration', () => {
  const originalEncryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;

  beforeEach(() => {
    firestoreMocks.rows = [];
    firestoreMocks.collection.mockReset();
    firestoreMocks.runTransaction.mockReset();
    firestoreMocks.documentGet.mockReset();
    firestoreMocks.transactionGet.mockReset();
    firestoreMocks.transactionUpdate.mockReset();
    firestoreMocks.protectorFactory.mockReset();
    firestoreMocks.protect.mockReset();
    firestoreMocks.unprotect.mockReset();
    firestoreMocks.unprotectLegacyAesGcm.mockReset();

    const credentialCollection = {
      get: vi.fn(async () => ({ docs: firestoreMocks.rows.map((row) => ({ data: () => row })) })),
      doc: vi.fn((id: string) => ({ id, get: firestoreMocks.documentGet })),
    };
    firestoreMocks.collection.mockImplementation((name: string) => ({
      doc: (userId: string) => ({
        collection: (subcollection: string) => {
          expect(name).toBe('users');
          expect(userId).toBe('owner-1');
          expect(subcollection).toBe('credentials');
          return credentialCollection;
        },
      }),
    }));

    const protector = {
      protect: firestoreMocks.protect,
      unprotect: firestoreMocks.unprotect,
      unprotectLegacyAesGcm: firestoreMocks.unprotectLegacyAesGcm,
    };
    firestoreMocks.protectorFactory.mockReturnValue(protector);
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalEncryptionKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalEncryptionKey;
  });

  it('lists modern credentials as safe metadata only', async () => {
    firestoreMocks.rows = [
      metadata({ secret, encryptionVersion: 2, key: 'DO_NOT_EXPOSE' }),
      metadata({ id: 'foreign', userId: 'another-user', key: 'FOREIGN_SECRET' }),
    ];

    const result = await CredentialService.listCredentials('owner-1');

    expect(result).toEqual([expect.objectContaining({ id: 'credential-1', encryptionVersion: 2 })]);
    expect(JSON.stringify(result)).not.toContain('DO_NOT_EXPOSE');
    expect(JSON.stringify(result)).not.toContain('protected-secret');
    expect(JSON.stringify(result)).not.toContain('FOREIGN_SECRET');
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
    expect(firestoreMocks.protectorFactory).not.toHaveBeenCalled();
  });

  it('lists plaintext legacy credentials without migrating, writing, or exposing the key', async () => {
    const legacy = metadata({ key: 'PLAINTEXT_LEGACY_SECRET' });
    firestoreMocks.rows = [legacy];

    const result = await CredentialService.listCredentials('owner-1');

    expect(result).toEqual([expect.objectContaining({ id: 'credential-1', encryptionVersion: null })]);
    expect(JSON.stringify(result)).not.toContain('PLAINTEXT_LEGACY_SECRET');
    expect(firestoreMocks.rows[0]).toBe(legacy);
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
    expect(firestoreMocks.protectorFactory).not.toHaveBeenCalled();
  });

  it('lists legacy AES fields without decrypting or migrating them', async () => {
    firestoreMocks.rows = [metadata({
      secretCiphertext: 'LEGACY_CIPHERTEXT',
      secretIv: 'LEGACY_IV',
      secretTag: 'LEGACY_TAG',
    })];

    const result = await CredentialService.listCredentials('owner-1');

    expect(result).toEqual([expect.objectContaining({ id: 'credential-1', encryptionVersion: null })]);
    expect(JSON.stringify(result)).not.toContain('LEGACY_CIPHERTEXT');
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
    expect(firestoreMocks.protectorFactory).not.toHaveBeenCalled();
    expect(firestoreMocks.unprotectLegacyAesGcm).not.toHaveBeenCalled();
  });

  it('keeps agent credential options read-only and excludes non-active/non-Google entries', async () => {
    firestoreMocks.rows = [
      metadata({ id: 'google-active', key: 'LEGACY_SECRET' }),
      metadata({ id: 'google-disabled', status: 'disabled', key: 'LEGACY_SECRET_2' }),
      metadata({ id: 'openai-active', providerId: 'openai', key: 'LEGACY_SECRET_3' }),
    ];

    const result = await CredentialService.listAgentCredentialOptions('owner-1');

    expect(result.systemAvailable).toBe(false);
    expect(result.credentials.map((credential) => credential.id)).toEqual(['google-active']);
    expect(JSON.stringify(result)).not.toMatch(/LEGACY_SECRET/);
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
    expect(firestoreMocks.protectorFactory).not.toHaveBeenCalled();
  });

  it('rejects a provider mismatch before touching the stored secret', async () => {
    const legacy = metadata({ key: 'PLAINTEXT_LEGACY_SECRET' });
    firestoreMocks.documentGet.mockResolvedValue(snapshot(legacy));

    await expect(CredentialService.resolveCredential('owner-1', 'openai', 'credential-1'))
      .rejects.toMatchObject({ code: 'CREDENTIAL_PROVIDER_MISMATCH', status: 400 });

    expect(firestoreMocks.protectorFactory).not.toHaveBeenCalled();
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
  });

  it('rejects an ownership mismatch before touching the stored secret', async () => {
    const legacy = metadata({ key: 'PLAINTEXT_LEGACY_SECRET', userId: 'different-owner' });
    firestoreMocks.documentGet.mockResolvedValue(snapshot(legacy));

    await expect(CredentialService.resolveCredential('owner-1', 'google', 'credential-1'))
      .rejects.toMatchObject({ code: 'CREDENTIAL_FORBIDDEN', status: 403 });

    expect(firestoreMocks.protectorFactory).not.toHaveBeenCalled();
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
  });

  it('rejects a disabled credential before touching the stored secret', async () => {
    const legacy = metadata({ key: 'PLAINTEXT_LEGACY_SECRET', status: 'disabled' });
    firestoreMocks.documentGet.mockResolvedValue(snapshot(legacy));

    await expect(CredentialService.resolveCredential('owner-1', 'google', 'credential-1'))
      .rejects.toMatchObject({ code: 'CREDENTIAL_INACTIVE', status: 409 });

    expect(firestoreMocks.protectorFactory).not.toHaveBeenCalled();
    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled();
  });

  it('still transactionally migrates a legacy key when resolveCredential needs the secret', async () => {
    const legacy = metadata({ key: 'PLAINTEXT_LEGACY_SECRET' });
    const protectedSecret = { ...secret, version: 3 };
    firestoreMocks.rows = [legacy];
    firestoreMocks.documentGet.mockResolvedValue(snapshot(legacy));
    firestoreMocks.transactionGet.mockResolvedValue(snapshot(legacy));
    firestoreMocks.protect.mockResolvedValue(protectedSecret);
    firestoreMocks.unprotect.mockResolvedValue('PLAINTEXT_LEGACY_SECRET');
    firestoreMocks.runTransaction.mockImplementation(async (callback: (transaction: unknown) => unknown) => callback({
      get: firestoreMocks.transactionGet,
      update: firestoreMocks.transactionUpdate,
    }));

    const result = await CredentialService.resolveCredential('owner-1', 'google', 'credential-1');

    expect(result.key).toBe('PLAINTEXT_LEGACY_SECRET');
    expect(firestoreMocks.runTransaction).toHaveBeenCalledOnce();
    expect(firestoreMocks.transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'credential-1' }),
      expect.objectContaining({
        secret: protectedSecret,
        encryptionVersion: 3,
        key: firestoreMocks.deletedField,
        secretCiphertext: firestoreMocks.deletedField,
        secretIv: firestoreMocks.deletedField,
        secretTag: firestoreMocks.deletedField,
        updatedAt: expect.any(String),
      }),
    );
  });

  it('fails closed and does not write if legacy secret protection fails during use', async () => {
    const legacy = metadata({ key: 'PLAINTEXT_LEGACY_SECRET' });
    firestoreMocks.rows = [legacy];
    firestoreMocks.documentGet.mockResolvedValue(snapshot(legacy));
    firestoreMocks.transactionGet.mockResolvedValue(snapshot(legacy));
    firestoreMocks.protect.mockRejectedValue(new Error('encryption backend unavailable'));
    firestoreMocks.runTransaction.mockImplementation(async (callback: (transaction: unknown) => unknown) => callback({
      get: firestoreMocks.transactionGet,
      update: firestoreMocks.transactionUpdate,
    }));

    await expect(CredentialService.resolveCredential('owner-1', 'google', 'credential-1'))
      .rejects.toMatchObject({ code: 'CREDENTIAL_MIGRATION_FAILED', status: 503 });
    expect(firestoreMocks.transactionUpdate).not.toHaveBeenCalled();
  });
});
