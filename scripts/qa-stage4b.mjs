import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const audit = read('server/core/audit/auditService.ts');
const auditRedaction = read('server/core/audit/auditRedaction.ts');
const auditAll = `${audit}\n${auditRedaction}`;
const auditContract = read('shared/contracts/audit.ts');
const gateway = read('server/core/capabilities/CapabilityExecutionService.ts');
const confirmation = read('server/core/capabilities/CapabilityConfirmationService.ts');
const confirmationPolicy = read('server/core/capabilities/CapabilityConfirmationPolicy.ts');
const confirmationAll = `${confirmation}\n${confirmationPolicy}`;
const registry = read('server/core/capabilities/serverCapabilityRegistry.ts');
const adapter = read('server/agent/adk/CapabilityToolAdapter.ts');
const runtime = read('src/agent/ui/AdkRuntimeProvider.tsx');
const confirmationUi = read('src/agent/ui/AdkConfirmation.tsx');
const server = read('server.ts');
const auditUi = read('src/modules/settings/AuditLogTab.tsx');
const rules = read('firestore.rules');
const localStorage = read('server/infrastructure/storage.ts');
const indexes = read('firestore.indexes.json');

check('central capability execution gateway exists', gateway.includes('class CapabilityExecutionService'));
check('Agent capability path uses central gateway', adapter.includes('CapabilityExecutionService.execute') && !adapter.includes('ServerCapabilityRegistry.execute'));
check('REST capability path uses same central gateway', /api\/capabilities\/execute[\s\S]*?CapabilityExecutionService\.execute/.test(server));
check('REST does not trust confirmed:true from client', !/confirmed\s*:\s*(?:Boolean\()?req\.body/.test(server) && !/const\s*\{[^}]*confirmed[^}]*\}\s*=\s*req\.body/.test(server));

check('server-side confirmation service exists', confirmation.includes('class CapabilityConfirmationService'));
check('confirmation token is cryptographically random', /randomUUID|randomBytes/.test(confirmation));
check('confirmation binds authenticated user', /userId/.test(confirmationAll) && /expected\.userId|challenge\.userId|data\.userId/.test(confirmationAll));
check('confirmation binds capability id', /capabilityId/.test(confirmationAll) && /expected\.capabilityId|challenge\.capabilityId|data\.capabilityId/.test(confirmationAll));
check('confirmation binds normalized input hash', /inputHash/.test(confirmationAll) && /createHash\(['"]sha256['"]\)/.test(confirmationAll));
check('confirmation has TTL and rejects expiry', /expiresAt/.test(confirmationAll) && /expired|expiresAt.*Date\.now|Date\.now\(\).*expiresAt/.test(confirmationAll));
check('confirmation is single-use atomically', /runTransaction/.test(confirmation) && /consumedAt|usedAt/.test(confirmation));
check('confirmation replay is explicitly rejected', /replay|already used|consumed/i.test(confirmationAll));
check('gateway creates server challenge for high-risk action', /risk\s*===\s*['"]high['"][\s\S]*?CapabilityConfirmationService\.(?:prepare|create)/.test(gateway));
check('gateway verifies confirmation before high-risk execution', /CapabilityConfirmationService\.consume|CapabilityConfirmationService\.verify/.test(gateway));
check('REST supports confirmationId contract', /confirmationId/.test(server) && /CapabilityExecutionService\.execute/.test(server));
check('Agent HITL carries server confirmationId', /confirmationId/.test(adapter) && /requestConfirmation/.test(adapter));
check('Agent confirmation response returns server challenge payload', /confirmTool\(tc\.id,\s*true,\s*tc\.confirmation\?\.payload\)/.test(confirmationUi));

check('audit uses Firestore durable store', audit.includes('adminFirestore') && /collection\(['"]audit_logs['"]\)/.test(audit));
check('audit does not use local .data/db.json storage', !audit.includes('infrastructure/storage') && !audit.includes('.data/db.json'));
check('legacy local storage no longer carries auditLogs', !/\bauditLogs\b/.test(localStorage));
check('audit records required execution fields', ['durationMs', 'inputSummary', 'resultSummary', 'errorCode', 'errorSummary', 'confirmationId'].every((field) => auditContract.includes(field)));
check('audit records permission/role summary', /roles|permissionsSummary|effectivePermissions/.test(auditContract));
check('success outcome is audited', /outcome[\s\S]*success|['"]success['"]/.test(gateway));
check('denied outcome is audited', /denied/.test(gateway));
check('confirmation_required outcome is audited', /confirmation_required/.test(gateway));
check('confirmation_failed outcome is audited', /confirmation_failed/.test(gateway));
check('execution_error outcome is audited', /execution_error/.test(gateway));

check('audit redacts secret field names recursively', /api.?key|authorization|credential|password|cookie|firebase|token|secret/i.test(auditAll) && /sanitize|redact/i.test(auditAll));
check('audit redacts bearer-like secret values', /bearer/i.test(auditAll));
check('audit limits nested depth and collection sizes', /depth/.test(auditAll) && /slice\(0,\s*(?:\d+|MAX_ARRAY_ITEMS|MAX_OBJECT_KEYS)\)/.test(auditAll));
check('audit limits long strings', /slice\(0,\s*(?:\d+|MAX_STRING_LENGTH)\)/.test(auditAll) && /typeof value === ['"]string['"]/.test(auditAll));
check('audit stores summaries instead of raw input/result', !/\binput\s*:\s*entry\.input/.test(audit) && !/\bresult\s*:\s*entry\.result/.test(audit));

const auditListPos = audit.indexOf('public static async list(');
const auditList = auditListPos >= 0 ? audit.slice(auditListPos) : '';
const wherePos = auditList.indexOf("where('userId'");
const limitPos = auditList.indexOf('.limit(');
check('user audit filter occurs before limit', wherePos !== -1 && limitPos !== -1 && wherePos < limitPos);
check('audit pagination cursor exists', /cursor|startAfter/.test(audit) && /startAfter\(/.test(audit));
check('audit has no application retention hard-cap of 500 records', !/data\.auditLogs|auditLogs\.(?:slice|splice)\([^)]*500|auditLogs\.length\s*>\s*500/.test(audit));
check('audit privileged scope uses existing audit.read permission only', /permissions\?\.includes\(['"]audit\.read['"]\)/.test(server) && !/roles\?\.includes\(['"]auditor['"]\)/.test(server));
check('audit endpoint forwards pagination cursor', /AuditService\.list\(\{[\s\S]*?cursor/.test(server));
check('audit UI no longer renders raw input/result JSON', !auditUi.includes('JSON.stringify(log.input') && !auditUi.includes('JSON.stringify(log.result'));
check('client cannot directly read/write audit collection', /match\s+\/audit_logs\//.test(rules) && /allow\s+read,\s*write:\s*if\s*false/.test(rules));
check('Firestore index supports user audit pagination', /audit_logs/.test(indexes) && /userId/.test(indexes) && /timestamp/.test(indexes));

check('module enabled check remains enforced', /moduleSetting[\s\S]*?!moduleSetting\.enabled/.test(registry));
check('permission check remains enforced', /PermissionResolver\.resolve/.test(registry));

const behavior = spawnSync(
  process.execPath,
  ['--no-warnings', '--experimental-strip-types', 'scripts/qa-stage4b-behavior.mjs'],
  { encoding: 'utf8' },
);
if (behavior.stdout) process.stdout.write(behavior.stdout);
if (behavior.stderr) process.stderr.write(behavior.stderr);
check('HITL behavior regression suite passes', behavior.status === 0);

let failed = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
  if (!item.ok) failed += 1;
}
console.log(`\nStage4B: ${checks.length - failed}/${checks.length} passed`);
process.exitCode = failed ? 1 : 0;
