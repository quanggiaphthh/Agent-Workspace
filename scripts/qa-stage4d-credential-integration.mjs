import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage4d-credential-'));
const write = (name, content) => fs.writeFileSync(path.join(tempDir, name), content, 'utf8');

try {
  let source = fs.readFileSync(path.resolve('server/core/ai/CredentialService.ts'), 'utf8');
  source = source
    .replace("import { FieldValue } from 'firebase-admin/firestore';", "import { FieldValue } from './firebase-stub.mjs';")
    .replace("import { adminFirestore } from '../../lib/firebaseAdmin';", "import { adminFirestore } from './firebase-stub.mjs';")
    .replace(/import type \{ AIProviderId \} from '..\/..\/..\/shared\/contracts\/ai';/, '')
    .replace("from './credentialSecretProtector';", "from './credentialSecretProtector.ts';");
  write('CredentialService.ts', source);
  if (fs.existsSync('server/core/ai/credentialSecretProtector.ts')) {
    fs.copyFileSync('server/core/ai/credentialSecretProtector.ts', path.join(tempDir, 'credentialSecretProtector.ts'));
  }

  write('firebase-stub.mjs', `
const docs = new Map();
let failNextTransaction = false;
const clone = (value) => structuredClone(value);
const key = (parts) => parts.join('/');
const DELETE = Symbol('delete');
export const FieldValue = { delete: () => DELETE };
function applyPatch(target, patch) {
  const next = { ...(target || {}) };
  for (const [name, value] of Object.entries(patch)) {
    if (value === DELETE) delete next[name];
    else next[name] = clone(value);
  }
  return next;
}
function snap(docKey) {
  const value = docs.get(docKey);
  return { exists: value !== undefined, id: docKey.split('/').at(-1), data: () => value === undefined ? undefined : clone(value), get: (field) => value?.[field] };
}
class QueryRef {
  constructor(parts, filters = []) { this.parts = parts; this.filters = filters; }
  where(field, op, value) { return new QueryRef(this.parts, [...this.filters, [field, op, value]]); }
  async get() { return querySnapshot(this); }
}
class CollectionRef extends QueryRef {
  doc(id) { return new DocumentRef([...this.parts, id]); }
}
class DocumentRef {
  constructor(parts) { this.parts = parts; this.id = parts.at(-1); }
  collection(name) { return new CollectionRef([...this.parts, name]); }
  async get() { return snap(key(this.parts)); }
  async set(value) { docs.set(key(this.parts), clone(value)); }
  async update(patch) {
    const k = key(this.parts);
    if (!docs.has(k)) throw Object.assign(new Error('not found'), { code: 5 });
    docs.set(k, applyPatch(docs.get(k), patch));
  }
  async delete() { docs.delete(key(this.parts)); }
}
function querySnapshot(query) {
  const prefix = key(query.parts) + '/';
  const depth = query.parts.length + 1;
  let rows = [...docs.entries()]
    .filter(([k]) => k.startsWith(prefix) && k.split('/').length === depth)
    .map(([k, value]) => ({ k, value }));
  for (const [field, op, expected] of query.filters) {
    if (op !== '==') throw new Error('only == supported');
    rows = rows.filter(({ value }) => value?.[field] === expected);
  }
  const mapped = rows.map(({ k }) => snap(k));
  return { docs: mapped, size: mapped.length, empty: mapped.length === 0 };
}
class Transaction {
  async get(ref) { return ref instanceof QueryRef ? querySnapshot(ref) : snap(key(ref.parts)); }
  set(ref, value) { docs.set(key(ref.parts), clone(value)); }
  update(ref, patch) {
    const k = key(ref.parts);
    if (!docs.has(k)) throw Object.assign(new Error('not found'), { code: 5 });
    docs.set(k, applyPatch(docs.get(k), patch));
  }
  delete(ref) { docs.delete(key(ref.parts)); }
}
export const adminFirestore = {
  collection(name) { return new CollectionRef([name]); },
  batch() {
    const ops = [];
    return { update(ref, patch) { ops.push(() => { const k = key(ref.parts); docs.set(k, applyPatch(docs.get(k), patch)); }); }, async commit() { ops.forEach((op) => op()); } };
  },
  async runTransaction(callback) {
    if (failNextTransaction) { failNextTransaction = false; throw new Error('synthetic transaction failure'); }
    return callback(new Transaction());
  },
};
export function reset() { docs.clear(); failNextTransaction = false; }
export function seed(pathValue, value) { docs.set(pathValue, clone(value)); }
export function read(pathValue) { const value = docs.get(pathValue); return value === undefined ? undefined : clone(value); }
export function failTransactionOnce() { failNextTransaction = true; }
`);

  const syntheticMasterKey = 'stage4d-synthetic-master-key-material-credential-integration';
  process.env.CREDENTIAL_ENCRYPTION_KEY = syntheticMasterKey;
  process.env.CREDENTIAL_ENCRYPTION_KEY_ID = 'integration-v1';
  process.env.GEMINI_API_KEY = 'synthetic-system-google-key';

  const serviceUrl = pathToFileURL(path.join(tempDir, 'CredentialService.ts')).href;
  const firebaseUrl = pathToFileURL(path.join(tempDir, 'firebase-stub.mjs')).href;
  const [{ CredentialService }, firebase] = await Promise.all([import(serviceUrl), import(firebaseUrl)]);
  const checks = [];
  const check = (name, ok) => checks.push([name, Boolean(ok)]);

  firebase.reset();
  const id = await CredentialService.saveCredential('u1', 'google', 'synthetic-personal-secret', 'Primary');
  const stored = firebase.read(`users/u1/credentials/${id}`);
  check('create stores versioned protected secret and no plaintext key', Boolean(stored?.secret?.ciphertext) && stored?.secret?.version === 1 && !('key' in stored));
  const resolved = await CredentialService.resolveCredential('u1', 'google', id);
  check('protected secret decrypts for server-side consumer', resolved.key === 'synthetic-personal-secret');
  const listed = await CredentialService.listCredentials('u1');
  check('list returns metadata only', listed.length === 1 && !('key' in listed[0]) && !('secret' in listed[0]) && !('ciphertext' in listed[0]));

  firebase.seed('users/u1/credentials/legacy-list', {
    id: 'legacy-list', userId: 'u1', providerId: 'google', name: 'Legacy List', priority: 5,
    createdAt: '2026-01-01T00:00:00.000Z', key: 'synthetic-legacy-list-secret',
  });
  const listedAfterLegacySeed = await CredentialService.listCredentials('u1');
  const legacyListStored = firebase.read('users/u1/credentials/legacy-list');
  const legacyListMetadata = listedAfterLegacySeed.find((item) => item.id === 'legacy-list');
  check('metadata list migrates legacy plaintext before returning', Boolean(legacyListStored?.secret) && !('key' in legacyListStored) && legacyListMetadata?.encryptionVersion === 1 && !('secret' in legacyListMetadata));

  firebase.seed('users/u1/credentials/legacy', {
    id: 'legacy', userId: 'u1', providerId: 'google', name: 'Legacy', priority: 1,
    createdAt: '2026-01-01T00:00:00.000Z', key: 'synthetic-legacy-secret',
  });
  const migrated = await CredentialService.resolveCredential('u1', 'google', 'legacy');
  const migratedStored = firebase.read('users/u1/credentials/legacy');
  check('legacy plaintext migrates before use and removes key field', migrated.key === 'synthetic-legacy-secret' && Boolean(migratedStored?.secret) && !('key' in migratedStored));

  const legacyIv = crypto.randomBytes(12);
  const legacyCipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(syntheticMasterKey, 'utf8').digest(), legacyIv);
  const legacyEncryptedSecret = Buffer.concat([legacyCipher.update('synthetic-pre-stage4d-encrypted-secret', 'utf8'), legacyCipher.final()]);
  firebase.seed('users/u1/credentials/legacy-encrypted', {
    id: 'legacy-encrypted', userId: 'u1', providerId: 'google', name: 'Legacy Encrypted', priority: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    secretCiphertext: legacyEncryptedSecret.toString('base64'),
    secretIv: legacyIv.toString('base64'),
    secretTag: legacyCipher.getAuthTag().toString('base64'),
  });
  const legacyEncryptedResolved = await CredentialService.resolveCredential('u1', 'google', 'legacy-encrypted');
  const legacyEncryptedStored = firebase.read('users/u1/credentials/legacy-encrypted');
  check('pre-GĐ4D AES-GCM record migrates into versioned protected payload',
    legacyEncryptedResolved.key === 'synthetic-pre-stage4d-encrypted-secret'
    && Boolean(legacyEncryptedStored?.secret?.version === 1)
    && !('secretCiphertext' in legacyEncryptedStored)
    && !('secretIv' in legacyEncryptedStored)
    && !('secretTag' in legacyEncryptedStored));

  firebase.seed('users/u1/credentials/legacy-fail', {
    id: 'legacy-fail', userId: 'u1', providerId: 'google', name: 'Legacy Fail', priority: 2,
    createdAt: '2026-01-01T00:00:00.000Z', key: 'synthetic-legacy-fail-secret',
  });
  firebase.failTransactionOnce();
  let migrationFailedClosed = false;
  try { await CredentialService.resolveCredential('u1', 'google', 'legacy-fail'); } catch (err) { migrationFailedClosed = err?.code === 'CREDENTIAL_MIGRATION_FAILED'; }
  check('legacy migration failure fails closed', migrationFailedClosed);

  firebase.seed('users/u1/credentials/legacy-concurrent', {
    id: 'legacy-concurrent', userId: 'u1', providerId: 'google', name: 'Legacy Concurrent', priority: 3,
    createdAt: '2026-01-01T00:00:00.000Z', key: 'synthetic-concurrent-secret',
  });
  const concurrent = await Promise.all([
    CredentialService.resolveCredential('u1', 'google', 'legacy-concurrent'),
    CredentialService.resolveCredential('u1', 'google', 'legacy-concurrent'),
  ]);
  const concurrentStored = firebase.read('users/u1/credentials/legacy-concurrent');
  check('concurrent migration leaves one consistent protected record', concurrent.every((item) => item.key === 'synthetic-concurrent-secret') && Boolean(concurrentStored?.secret) && !('key' in concurrentStored));

  await CredentialService.updateCredential('u1', id, { providerId: 'google', key: 'synthetic-updated-secret', name: 'Updated' });
  const updated = await CredentialService.resolveCredential('u1', 'google', id);
  const updatedStored = firebase.read(`users/u1/credentials/${id}`);
  check('update atomically replaces protected secret without plaintext', updated.key === 'synthetic-updated-secret' && updatedStored?.name === 'Updated' && !('key' in updatedStored));

  let mismatchRejected = false;
  try { await CredentialService.resolveCredential('u1', 'openai', id); } catch (err) { mismatchRejected = err?.code === 'CREDENTIAL_PROVIDER_MISMATCH'; }
  check('provider mismatch is rejected before consumer network use', mismatchRejected);

  let crossUserRejected = false;
  try { await CredentialService.resolveCredential('u2', 'google', id); } catch (err) { crossUserRejected = err?.code === 'CREDENTIAL_NOT_FOUND'; }
  check('cross-user credential lookup is rejected', crossUserRejected);

  const second = await CredentialService.saveCredential('u1', 'google', 'synthetic-second-secret', 'Second');
  await CredentialService.reorderCredentials('u1', 'google', [second, id, 'legacy', 'legacy-fail', 'legacy-concurrent', 'legacy-encrypted', 'legacy-list']);
  const reordered = await CredentialService.listCredentials('u1');
  const googleOrder = reordered.filter((item) => item.providerId === 'google').map((item) => item.id);
  check('reorder persists deterministic provider-scoped priority', googleOrder[0] === second && googleOrder[1] === id);

  const personalCandidates = await CredentialService.getRotationCandidates('u1', 'google', id);
  check('personal rotation stays same user/provider and never adds system', personalCandidates[0].id === id && personalCandidates.every((item) => item.userId === 'u1' && item.providerId === 'google' && item.id !== 'system'));
  const fallbackPriorities = personalCandidates.slice(1).map((item) => item.priority);
  check('rotation fallback order is deterministic by durable priority', fallbackPriorities.every((value, index) => index === 0 || fallbackPriorities[index - 1] <= value));
  firebase.seed('users/u1/credentials/disabled', {
    id: 'disabled', userId: 'u1', providerId: 'google', name: 'Disabled', priority: -1, status: 'disabled',
    createdAt: '2026-01-01T00:00:00.000Z', secret: stored.secret, encryptionVersion: 1,
  });
  const candidatesWithDisabledRecord = await CredentialService.getRotationCandidates('u1', 'google', id);
  check('disabled credential is excluded from rotation candidates', !candidatesWithDisabledRecord.some((item) => item.id === 'disabled'));
  const systemCandidates = await CredentialService.getRotationCandidates('u1', 'google', 'system');
  check('explicit system selection does not silently rotate into personal credentials', systemCandidates.length === 1 && systemCandidates[0].id === 'system');

  firebase.reset();
  const tiedBase = {
    userId: 'u1', providerId: 'google', priority: 0, status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    secret: stored.secret, encryptionVersion: 1,
  };
  firebase.seed('users/u1/credentials/tie-c', { ...tiedBase, id: 'tie-c', name: 'Tie C' });
  firebase.seed('users/u1/credentials/tie-a', { ...tiedBase, id: 'tie-a', name: 'Tie A' });
  firebase.seed('users/u1/credentials/tie-b', { ...tiedBase, id: 'tie-b', name: 'Tie B' });
  const tiedCandidates = await CredentialService.getRotationCandidates('u1', 'google', 'tie-b');
  check('rotation order remains deterministic when durable priorities tie', tiedCandidates.map((item) => item.id).join(',') === 'tie-b,tie-a,tie-c');

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} integration: ${name}`);
    if (!ok) failed += 1;
  }
  console.log(`Credential integration 4D: ${checks.length - failed}/${checks.length} passed`);
  process.exitCode = failed ? 1 : 0;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
