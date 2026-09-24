import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const server = read('server.ts');
const firebaseAdmin = read('server/lib/firebaseAdmin.ts');
const session = read('server/agent/adk/FirestoreSessionService.ts');
const storage = read('server/infrastructure/storage.ts');
const gateway = read('server/core/capabilities/CapabilityExecutionService.ts');
const registry = read('server/core/capabilities/serverCapabilityRegistry.ts');
const adapter = read('server/agent/adk/CapabilityToolAdapter.ts');
const webSearch = read('server/core/search/WebSearchService.ts');
const chat = read('src/agent/ui/AgentChatThread.tsx');
const audit = read('server/core/audit/auditService.ts');
const healthPolicy = read('server/core/runtime/runtimeHealthPolicy.ts');

check('health aggregates real persistence state',
  /computeRuntimeHealth/.test(server)
  && /probeFirestoreAdmin/.test(server)
  && /probePersistenceHealth/.test(server)
  && /AuditService\.probeHealth/.test(server)
  && /storage\.getPersistenceHealth/.test(server));
check('health is not hard-coded ok',
  !/app\.get\(['"]\/api\/health['"][\s\S]{0,500}?status\s*:\s*['"]ok['"]/.test(server));
check('health exposes session persistence mode', /probePersistenceHealth/.test(server) && /mode:\s*['"](?:persistent|in-memory-fallback|unavailable)['"]/.test(session));
check('runtime health component type accepts structurally richer persistence states',
  /interface RuntimeHealthComponent[\s\S]{0,180}?status: RuntimeHealthStatus/.test(healthPolicy)
  && !/interface RuntimeHealthComponent[\s\S]{0,180}?\[key:\s*string\]/.test(healthPolicy));

check('ADC diagnostic does not equate env var presence with ADC availability',
  !/\benvHasADC\b/.test(server)
  && !/\bhasADC\b/.test(firebaseAdmin)
  && /googleApplicationCredentialsEnvPresent/.test(`${server}\n${firebaseAdmin}`));

check('fatal uncaught exception terminates process',
  /uncaughtException/.test(server) && /process\.exit\(1\)/.test(server));
check('fatal logging uses redaction/sanitization',
  /function fatalErrorSummary[\s\S]{0,400}?redactAuditString/.test(server)
  && /uncaughtException[\s\S]{0,300}?fatalErrorSummary/.test(server)
  && /unhandledRejection[\s\S]{0,300}?fatalErrorSummary/.test(server));

check('production CSP is not disabled unconditionally',
  /NODE_ENV\s*===\s*['"]production['"][\s\S]{0,250}?contentSecurityPolicy:\s*productionCsp/.test(server)
  && /:\s*\{\s*contentSecurityPolicy:\s*false/.test(server));

check('/api/log-error validates a strict schema', /ClientErrorSchema/.test(server) && /ClientErrorSchema[\s\S]*?\.strict\(\)/.test(server));
check('/api/log-error has a dedicated small body limit', /log-error[\s\S]{0,1200}?32kb/i.test(server));
check('/api/log-error sanitizes/redacts before logging', /log-error[\s\S]{0,1800}?(?:sanitizeAuditValue|redactAuditString)/.test(server));
check('/api/log-error has a dedicated rate limiter', /clientErrorLimiter/.test(server) && /log-error[\s\S]{0,1200}?clientErrorLimiter/.test(server));

check('expensive endpoints use authenticated-user limiter',
  /expensiveUserLimiter/.test(server)
  && /keyGenerator[\s\S]{0,300}?user/.test(server)
  && /api\/agent\/chat['"],\s*expensiveUserLimiter/.test(server)
  && /api\/capabilities\/execute['"],\s*expensiveUserLimiter/.test(server)
  && /api\/ai\/test-model['"],\s*expensiveUserLimiter/.test(server)
  && /api\/ai\/models['"],\s*expensiveUserLimiter/.test(server));
check('rate-limit response uses HTTP 429 semantics', /statusCode\s*:\s*429|res\.status\(429\)/.test(server));

check('HTTP request cancellation is bound at Agent chat boundary', /bindRequestCancellation/.test(server));
check('Agent runner receives AbortSignal', /runner\.runAsync\(\{[\s\S]*?abortSignal\s*:\s*requestCancellation\.signal/.test(server));
check('tool adapter propagates ADK abort signal into gateway', /abortSignal\s*:\s*context\?\.abortSignal/.test(adapter));
check('gateway prevents new capability work after cancellation', /throwIfAborted\(meta\.abortSignal\)/.test(gateway));
check('cancelled capability execution is audited as cancelled', /outcome\s*:\s*cancelled\s*\?\s*['"]cancelled['"]/.test(gateway));
const descriptorExecutePos = registry.indexOf('descriptor.execute');
const postExecuteAbortPos = registry.indexOf('context.abortSignal?.aborted', descriptorExecutePos);
const successReturnPos = registry.indexOf('success: true', descriptorExecutePos);
check('completed capability result is not retroactively cancelled after commit',
  descriptorExecutePos !== -1 && successReturnPos !== -1
  && !(postExecuteAbortPos !== -1 && postExecuteAbortPos < successReturnPos));
check('web search passes AbortSignal to provider request', /abortSignal\?\s*:\s*AbortSignal/.test(webSearch) && /abortSignal,/.test(webSearch) && /context\.abortSignal/.test(read('server/core/capabilities/systemCapabilities.ts')));

check('attachment affordance uses the real upload-backed composer path',
  /type=['"]file['"]/.test(chat)
  && /uploadUserFile\(/.test(chat)
  && /successfulAttachmentReferences\(attachments\)/.test(chat)
  && /sendMessage\(inputText\.trim\(\),\s*attachmentReferences\)/.test(chat)
  && !/\[Đính kèm tệp:/.test(chat));

check('module settings no longer use local filesystem durable store',
  !/from ['"]fs['"]/.test(storage)
  && !/\.data\/|db\.json/.test(storage)
  && /adminFirestore/.test(storage));
check('module settings use Firestore durable collection', /collection\(['"]module_settings['"]\)/.test(storage));
check('module toggle awaits durable persistence before success',
  /api\/modules\/:id\/toggle[\s\S]*?await storage\.toggleModuleEnabledWithAudit/.test(server)
  && !/storage\.commit\(\)/.test(server));
check('module persistence write updates cache only after Firestore write',
  /await[\s\S]{0,300}?\.set\([\s\S]{0,500}?moduleSettings/.test(storage));
check('module persistence health is observable', /getPersistenceHealth/.test(storage));
check('module capability discovery refreshes shared state before filtering',
  /public static async listForContext/.test(registry)
  && /listForContext[\s\S]{0,500}?await storage\.refreshModuleSettings\(\)/.test(registry));
check('module capability execution refreshes shared state before module policy',
  /public static async execute/.test(registry)
  && /execute[\s\S]{0,1400}?await storage\.refreshModuleSettings\(\)/.test(registry));
check('module toggle commits durable state and audit atomically',
  /runTransaction/.test(storage)
  && /AuditService\.stageLog/.test(storage)
  && /api\/modules\/:id\/toggle[\s\S]{0,1200}?await storage\.toggleModuleEnabledWithAudit/.test(server)
  && !/api\/modules\/:id\/toggle[\s\S]{0,1200}?await AuditService\.log/.test(server));

check('production session fallback remains fail-closed',
  /NODE_ENV\s*!==\s*['"]production['"][\s\S]{0,200}?LocalInMemorySessionService/.test(session));
const sessionProbeStart = session.indexOf('public async probePersistenceHealth');
const sessionProbeEnd = session.indexOf('private getDocRef', sessionProbeStart);
const sessionProbe = sessionProbeStart >= 0 && sessionProbeEnd > sessionProbeStart
  ? session.slice(sessionProbeStart, sessionProbeEnd)
  : '';
check('health session probe is observation-only and does not activate fallback',
  sessionProbe.length > 0 && !/this\.useFallback\s*=\s*true/.test(sessionProbe));

check('fallback sessions are pinned to memory across Firestore recovery',
  /SessionBackendPinning/.test(session)
  && /isPinned\(/.test(session)
  && /pin\(/.test(session));
const executeFallbackStart = session.indexOf('private async executeWithFallback');
const executeFallbackEnd = session.indexOf('public async getOrCreateSession', executeFallbackStart);
const executeFallbackBody = executeFallbackStart >= 0 && executeFallbackEnd > executeFallbackStart
  ? session.slice(executeFallbackStart, executeFallbackEnd)
  : '';
check('pinned fallback session bypasses Firestore before session operation',
  executeFallbackBody.length > 0
  && /sessionIdentity[\s\S]{0,500}?isPinned\(sessionIdentity\)[\s\S]{0,300}?fallbackOp\(\)/.test(executeFallbackBody));
check('fallback session is pinned when permission failure routes to memory',
  executeFallbackBody.length > 0
  && /isPermissionError[\s\S]{0,600}?pin\(sessionIdentity\)/.test(executeFallbackBody));
check('fallback session pin is released only when deleting that session',
  /deleteSession[\s\S]{0,1000}?unpin\(/.test(session));

const appendEventStart = session.lastIndexOf('public async appendEvent');
const appendEventBody = appendEventStart >= 0 ? session.slice(appendEventStart) : '';
check('appendEvent uses session-specific backend pin rather than global fallback mode',
  appendEventBody.length > 0
  && /!this\.fallbackSessionPins\.isPinned\(sessionIdentity\)/.test(appendEventBody)
  && !/if \(!this\.useFallback\)/.test(appendEventBody));

check('session fallback health exposes in-memory mode and sanitized reason',
  /in-memory-fallback/.test(session)
  && /lastError|reason/.test(session)
  && /redact|sanitize/i.test(session));
check('session persistence errors are sanitized before server logging',
  !/console\.warn\(['"]Session init error:['"],\s*err\)/.test(server)
  && /Session init error:[\s\S]{0,100}?fatalErrorSummary\(err\)/.test(server));

check('audit durable health probe exists exactly once', (audit.match(/public static async probeHealth\(\)/g) || []).length === 1);

const behavior = spawnSync(
  process.execPath,
  ['--no-warnings', '--experimental-strip-types', 'scripts/qa-stage4c-behavior.mjs'],
  { encoding: 'utf8' },
);
if (behavior.stdout) process.stdout.write(behavior.stdout);
if (behavior.stderr) process.stderr.write(behavior.stderr);
check('GĐ4C behavior regression suite passes', behavior.status === 0);

const sessionIntegration = spawnSync(
  process.execPath,
  ['--no-warnings', '--experimental-strip-types', 'scripts/qa-stage4c-session-integration.mjs'],
  { encoding: 'utf8' },
);
if (sessionIntegration.stdout) process.stdout.write(sessionIntegration.stdout);
if (sessionIntegration.stderr) process.stderr.write(sessionIntegration.stderr);
check('GĐ4C FirestoreSessionService recovery integration passes', sessionIntegration.status === 0);

let failed = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
  if (!item.ok) failed += 1;
}
console.log(`\nStage4C: ${checks.length - failed}/${checks.length} passed`);
process.exitCode = failed ? 1 : 0;
