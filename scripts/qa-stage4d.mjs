import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const credential = read('server/core/ai/CredentialService.ts');
const protector = read('server/core/ai/credentialSecretProtector.ts');
const rotation = read('server/core/ai/credentialRotationPolicy.ts');
const root = read('server/agent/adk/RootAgent.ts');
const providers = read('server/core/ai/AIProviderManager.ts');
const search = read('server/core/search/WebSearchService.ts');
const server = read('server.ts');
const store = read('src/modules/settings/aiKeysStore.ts');
const ui = read('src/modules/settings/AgentAIManagerTab.tsx');
const clientCredentialStatus = read('src/modules/settings/credentialStatus.ts');
const rules = read('firestore.rules');
const auditRedaction = read('server/core/audit/auditRedaction.ts');
const firebaseConfigSource = read('firebase-applet-config.json');
const firebaseClient = read('src/lib/firebase.ts');

const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

check('protector abstraction exists', /interface CredentialSecretProtector|class EnvAesGcmCredentialSecretProtector/.test(protector));
check('protected payload is versioned', /CREDENTIAL_SECRET_VERSION\s*=\s*1/.test(protector) && /CREDENTIAL_SECRET_ALGORITHM\s*=\s*['"]aes-256-gcm['"]/.test(protector));
check('master key comes from environment', /CREDENTIAL_ENCRYPTION_KEY/.test(protector) && !/const\s+.*(?:master|encryption).*key\s*=\s*['"][^'"]{16,}['"]/i.test(protector));
check('Firebase web API key is not hard-coded in source', !/AIza[0-9A-Za-z_-]{20,}/.test(firebaseConfigSource) && /VITE_FIREBASE_API_KEY/.test(firebaseClient));
check('new credential storage uses protected secret object', /secret:\s*protectedSecret|secret:\s*protected/.test(credential));
check('normal credential storage does not persist plaintext key', !/\.set\(\{[\s\S]{0,500}\bkey\s*[:,]/.test(credential));
check('legacy plaintext migration deletes key field', /key:\s*FieldValue\.delete\(\)/.test(credential));
check('legacy migration is transactional', /runTransaction/.test(credential) && /CREDENTIAL_MIGRATION_FAILED/.test(credential));
check('migration failure is not warn-and-continue', !/Legacy plaintext migration failed[\s\S]{0,120}console\.warn/.test(credential));
check('credential read DTO excludes runtime secret', /CredentialMetadata/.test(credential) && /listCredentials[\s\S]{0,1200}(?:id|providerId|name|priority)/.test(credential));
check('save response does not serialize secret', /saveCredential/.test(server) && /res\.status\(201\)\.json\(\{\s*id\s*\}\)/.test(server));
check('credential update endpoint exists and server-protects secret', /api\/ai\/credentials\/:id/.test(server) && /updateCredential/.test(server));
check('provider mismatch enforced by resolver', /Credential provider mismatch/.test(credential));
check('system credential remains Google-only and server env sourced', /providerId !== ['"]google['"]/.test(credential) && /GEMINI_API_KEY/.test(credential));
check('personal auto-rotation never appends system credential', !/selectedCredential\.id !== ['"]system['"][\s\S]{0,500}getSystemCredential/.test(root));
check('rotation candidates come from server credential service', /getRotationCandidates|listRotationCandidates/.test(root));
check('rotation has explicit failure classification', /classifyProviderFailure/.test(rotation) && /shouldRotateCredential/.test(rotation));
check('rotation does not rotate on 5xx', !/status >= 500[\s\S]{0,120}return true/.test(rotation) && !/50\[0-9\]/.test(rotation));
check('rotation stops after partial stream', /yielded/.test(root) && /shouldRotateCredential\(err, yielded\)/.test(root));
check('rotation ordering uses durable priority', /priority/.test(credential) && /sort\(/.test(credential));
check('reorder is transaction scoped by user/provider', /reorderCredentials[\s\S]{0,1800}runTransaction/.test(credential) && /providerId/.test(credential));
check('model list resolves stored credential server-side', /api\/ai\/models[\s\S]{0,900}CredentialService\.resolveCredential/.test(server));
check('model test resolves stored credential server-side', /api\/ai\/test-model[\s\S]{0,900}CredentialService\.resolveCredential/.test(server));
check('model test preserves classified provider failure semantics', /api\/ai\/test-model[\s\S]{0,1800}toSafeProviderError/.test(server));
check('agent chat returns safe rotation failure code before streaming response', /Agent chat error:[\s\S]{0,500}NO_ROTATION_CANDIDATE|safeErrorCode[\s\S]{0,900}res\.status/.test(server));
check('search resolves credential server-side', /CredentialService\.resolveCredential/.test(search));
check('provider diagnostics sanitize errors', /redactAuditString|redactProviderError/.test(providers));
check('provider test diagnostics never bind credential secret to modelId', !/normalizeError\(err,\s*this\.id,\s*['"]TEST_KEY['"],\s*[^,]+,\s*(?:k|key)\s*\)/.test(providers));
check('audit redaction covers credential secrets', /api[_-]?key|credential|secret|password/i.test(auditRedaction) && /sanitizeAuditValue/.test(auditRedaction));
check('AI credential route errors are redacted', /function credentialErrorResponse[\s\S]{0,700}(?:redactProviderError|redactAuditString)/.test(server) && (server.match(/credentialErrorResponse\(/g) || []).length >= 7);
check('client preserves server credential lifecycle status', /normalizeCredentialStatus/.test(store) && /disabled/.test(clientCredentialStatus) && /invalid/.test(clientCredentialStatus) && !/status:\s*['"]active['"]\s+as\s+KeyStatus/.test(store));
check('client persistence excludes API key entries', /partialize/.test(store) && !/partialize:[\s\S]{0,800}\bkeys\s*:/.test(store));
check('deleting a personal credential does not silently switch config to system', !/credentialId:\s*state\.credentialId\s*===\s*id\s*\?\s*['"]system['"]/.test(store));
check('active credential helper honors explicit selected credential', /const selectedCredentialId = get\(\)\.credentialId/.test(store));
check('agent config setter does not default omitted personal selection to system', !/credentialId:\s*credentialId\s*\|\|\s*['"]system['"]/.test(store));
check('rotation UI describes credential-specific personal-only policy', !/quota\/transient error/i.test(ui) && /personal|cá nhân/i.test(ui) && /system/i.test(ui));
check('credential input remains transient component state', /useState<.*key.*>/.test(ui) && !/localStorage|sessionStorage/.test(ui));
check('Firestore client rules deny credential reads', /match \/users\/\{userId\}\/credentials\/\{id\}[\s\S]{0,120}allow read, write: if false/.test(rules));

const behavior = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/qa-stage4d-behavior.mjs'], { encoding: 'utf8' });
process.stdout.write(behavior.stdout || '');
process.stderr.write(behavior.stderr || '');
check('stage4d behavior suite passes', behavior.status === 0);

const integration = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/qa-stage4d-credential-integration.mjs'], { encoding: 'utf8' });
process.stdout.write(integration.stdout || '');
process.stderr.write(integration.stderr || '');
check('stage4d credential integration suite passes', integration.status === 0);

let failed = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} Stage4D: ${item.name}`);
  if (!item.ok) failed += 1;
}
console.log(`Stage4D: ${checks.length - failed}/${checks.length} passed`);
process.exitCode = failed ? 1 : 0;
