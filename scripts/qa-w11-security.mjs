import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');
const identity = read('server/core/auth/identityProvider.ts');
const protector = read('server/core/ai/credentialSecretProtector.ts');
const audit = read('server/core/audit/auditRedaction.ts');
const server = read('server.ts');
const filePolicy = read('server/core/files/filePolicy.ts');
const gitignore = read('.gitignore');
const firebase = JSON.parse(read('firebase.json'));

check('Firestore client access remains fail-closed', /match \/\{document=\*\*\}/.test(firestoreRules) && /allow read, write: if false/.test(firestoreRules));
check('Storage client access is explicitly denied', /service firebase\.storage/.test(storageRules) && /allow read, write: if false/.test(storageRules));
check('Firebase deployment config wires both rulesets', firebase.firestore?.some?.((entry) => entry.rules === 'firestore.rules') && firebase.storage?.rules === 'storage.rules');
check('server identity still requires verified Firebase tokens', identity.includes('adminAuth.verifyIdToken(token)'));
check('optional configured owner UID is enforced server-side', identity.includes('process.env.OWNER_UID') && identity.includes('OWNER_MISMATCH'));
check('token verifier details are not reflected to callers', identity.includes("new Error('Unauthorized: Token verification failed')") && !identity.includes('Token verification failed: ${err.message}'));
check('personal credentials remain AES-256-GCM protected', protector.includes("'aes-256-gcm'") && protector.includes('CREDENTIAL_ENCRYPTION_KEY'));
check('audit redaction covers bearer, token, credential and secret material', /bearer/i.test(audit) && /token/i.test(audit) && /credential/i.test(audit) && /secret/i.test(audit));
check('production HTTP guards remain present', server.includes('helmet(') && server.includes('productionCsp') && server.includes('express-rate-limit'));
check('authenticated JSON payloads remain bounded', server.includes("express.json({ limit: '1mb' })"));
check('expensive provider/Agent requests retain per-user limiting', server.includes('expensiveUserLimiter') && server.includes("user:${(req as any).user?.id || 'missing-auth'}"));
check('file ingestion does not accept ZIP archives', !filePolicy.includes('application/zip'));
check('environment files remain ignored except the template', gitignore.includes('.env*') && gitignore.includes('!.env.example'));

let failures = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`);
  if (!item.ok) failures += 1;
}
console.log(`\nW11 Security QA: ${checks.length - failures}/${checks.length} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
