import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

async function loadTs(path) {
  if (!fs.existsSync(path)) return null;
  return import(pathToFileURL(new URL(`../${path}`, import.meta.url).pathname).href);
}

const protectorModule = await loadTs('server/core/ai/credentialSecretProtector.ts');
if (!protectorModule) {
  for (const name of [
    'credential secret protector module exists',
    'protect does not return plaintext',
    'protected secret is versioned AES-256-GCM',
    'unprotect returns original secret',
    'ciphertext tamper fails closed',
    'wrong master key fails closed',
    'missing production protector config fails closed',
  ]) check(name, false);
} else {
  const Protector = protectorModule.EnvAesGcmCredentialSecretProtector;
  const masterA = 'stage4d-synthetic-master-key-material-000000000001';
  const masterB = 'stage4d-synthetic-master-key-material-000000000002';
  const plaintext = 'synthetic-provider-secret-for-stage4d';
  const protector = new Protector(masterA, 'test-key-v1');
  const protectedSecret = await protector.protect(plaintext);
  check('credential secret protector module exists', typeof Protector === 'function');
  check('protect does not return plaintext', JSON.stringify(protectedSecret).includes(plaintext) === false);
  check('protected secret is versioned AES-256-GCM', protectedSecret.version === 1 && protectedSecret.algorithm === 'aes-256-gcm' && protectedSecret.keyId === 'test-key-v1');
  check('unprotect returns original secret', await protector.unprotect(protectedSecret) === plaintext);

  const tampered = { ...protectedSecret, ciphertext: protectedSecret.ciphertext.slice(0, -2) + 'AA' };
  let tamperFailed = false;
  try { await protector.unprotect(tampered); } catch { tamperFailed = true; }
  check('ciphertext tamper fails closed', tamperFailed);

  let wrongKeyFailed = false;
  try { await new Protector(masterB, 'test-key-v1').unprotect(protectedSecret); } catch { wrongKeyFailed = true; }
  check('wrong master key fails closed', wrongKeyFailed);

  const savedKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  const savedId = process.env.CREDENTIAL_ENCRYPTION_KEY_ID;
  delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.CREDENTIAL_ENCRYPTION_KEY_ID;
  let missingFailed = false;
  try { protectorModule.createCredentialSecretProtectorFromEnvironment(); } catch { missingFailed = true; }
  if (savedKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY; else process.env.CREDENTIAL_ENCRYPTION_KEY = savedKey;
  if (savedId === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY_ID; else process.env.CREDENTIAL_ENCRYPTION_KEY_ID = savedId;
  check('missing production protector config fails closed', missingFailed);
}

const auditModule = await loadTs('server/core/audit/auditRedaction.ts');
if (!auditModule) {
  check('audit sanitizer removes plaintext credential secret', false);
  check('log redaction removes bearer credential secret', false);
} else {
  const syntheticSecret = 'synthetic-provider-secret-for-stage4d-redaction';
  const sanitized = auditModule.sanitizeAuditValue({
    apiKey: syntheticSecret,
    nested: { credential: { secret: syntheticSecret } },
  });
  check('audit sanitizer removes plaintext credential secret', !JSON.stringify(sanitized).includes(syntheticSecret));
  const redactedLog = auditModule.redactAuditString(`Authorization: Bearer ${syntheticSecret}`);
  check('log redaction removes bearer credential secret', !String(redactedLog).includes(syntheticSecret));
}


const rotationModule = await loadTs('server/core/ai/credentialRotationPolicy.ts');
if (!rotationModule) {
  for (const name of [
    'credential rotation policy module exists',
    'authentication failure can rotate before streaming',
    'authorization failure does not rotate credential',
    'quota failure can rotate before streaming',
    'transient provider failure does not rotate credential',
    'malformed request does not rotate credential',
    'partial stream never rotates credential',
    'explicit 403 overrides misleading authentication message',
    'explicit 429 overrides misleading permission message',
    'explicit 5xx overrides misleading invalid-key message',
  ]) check(name, false);
} else {
  const classify = rotationModule.classifyProviderFailure;
  const shouldRotate = rotationModule.shouldRotateCredential;
  check('credential rotation policy module exists', typeof classify === 'function' && typeof shouldRotate === 'function');
  check('authentication failure can rotate before streaming', classify({ status: 401 }) === 'authentication' && shouldRotate({ status: 401 }, false));
  check('authorization failure does not rotate credential', classify({ status: 403 }) === 'authorization' && !shouldRotate({ status: 403 }, false));
  check('quota failure can rotate before streaming', classify({ status: 429 }) === 'quota' && shouldRotate({ status: 429 }, false));
  check('transient provider failure does not rotate credential', classify({ status: 503 }) === 'transient' && !shouldRotate({ status: 503 }, false));
  check('malformed request does not rotate credential', classify({ status: 400 }) === 'malformed' && !shouldRotate({ status: 400 }, false));
  check('partial stream never rotates credential', !shouldRotate({ status: 401 }, true));
  check('explicit 403 overrides misleading authentication message', classify({ status: 403, message: 'authentication failed: permission denied' }) === 'authorization' && !shouldRotate({ status: 403, message: 'authentication failed: permission denied' }, false));
  check('explicit 429 overrides misleading permission message', classify({ status: 429, message: 'permission denied while quota exhausted' }) === 'quota' && shouldRotate({ status: 429, message: 'permission denied while quota exhausted' }, false));
  check('explicit 5xx overrides misleading invalid-key message', classify({ status: 503, message: 'invalid API key from upstream' }) === 'transient' && !shouldRotate({ status: 503, message: 'invalid API key from upstream' }, false));
}


const clientStatusModule = await loadTs('src/modules/settings/credentialStatus.ts');
if (!clientStatusModule) {
  check('client preserves disabled credential status from server metadata', false);
  check('client preserves invalid credential status from server metadata', false);
} else {
  const normalize = clientStatusModule.normalizeCredentialStatus;
  check('client preserves disabled credential status from server metadata', normalize('disabled') === 'disabled');
  check('client preserves invalid credential status from server metadata', normalize('invalid') === 'invalid');
}

let failed = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} behavior: ${item.name}`);
  if (!item.ok) failed += 1;
}
console.log(`Behavior 4D: ${checks.length - failed}/${checks.length} passed`);
process.exitCode = failed ? 1 : 0;
