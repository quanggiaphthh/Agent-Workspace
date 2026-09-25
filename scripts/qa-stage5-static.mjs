import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

const server = read('server.ts');
const rules = read('firestore.rules');
const store = read('src/modules/settings/aiKeysStore.ts');
const runtime = read('src/agent/ui/AdkRuntimeProvider.tsx');
const registry = read('server/core/capabilities/serverCapabilityRegistry.ts');
const gateway = read('server/core/capabilities/CapabilityExecutionService.ts');
const sessions = read('server/agent/adk/FirestoreSessionService.ts');
const protector = read('server/core/ai/credentialSecretProtector.ts');
const credentials = read('server/core/ai/CredentialService.ts');
const rotation = read('server/core/ai/credentialRotationPolicy.ts');
const integrationTests = read('src/__tests__/integration.test.ts');

check('only health/log-error bypass API auth middleware',
  server.includes("const publicPaths = ['/health', '/log-error']") &&
  server.indexOf("app.use('/api', async") < server.indexOf("app.post('/api/ai/test-key'"));
check('session IDs are bounded and path-safe',
  server.includes("max(128).regex(/^[A-Za-z0-9_-]+$/)"));
check('identity fields are removed from agent state delta',
  ['user','userId','email','roles','permissions','admin','confirmed'].every((k) => server.includes(`delete (sanitizedStateDelta as any).${k}`)));
check('REST capability execution does not trust client confirmed boolean',
  !/confirmed\s*:\s*(?:Boolean\()?req\.body/.test(server) &&
  !/const\s*\{[^}]*confirmed[^}]*\}\s*=\s*req\.body/.test(server));
check('central gateway alone upgrades confirmed context after server confirmation',
  gateway.includes('const confirmedContext: ExecutionContext = { ...safeContext, confirmed: true }') &&
  gateway.includes('CapabilityConfirmationService.consume'));
check('production CSP is enabled',
  server.includes("process.env.NODE_ENV === 'production'") && server.includes('contentSecurityPolicy: productionCsp'));
check('public log endpoint is schema/size/redaction/rate-limited',
  server.includes("express.json({ limit: '32kb' })") && server.includes('ClientErrorSchema.safeParse') &&
  server.includes('redactAuditString(parsed.data.message)') && server.includes('clientErrorLimiter'));
check('expensive limiter is keyed by verified user',
  server.includes('const expensiveUserLimiter = rateLimit({') &&
  server.includes("keyGenerator: (req: express.Request) => `user:${req.user?.id || 'missing-auth'}`") &&
  !server.includes("keyGenerator: (req: express.Request) => req.ip"));
check('module capability discovery refreshes durable state',
  registry.includes('public static async listForContext') && registry.includes('await storage.refreshModuleSettings()'));
check('module execution fails closed when durable state cannot be verified',
  registry.includes("errorCode: 'MODULE_SETTINGS_UNAVAILABLE'"));
check('health probe does not assign session fallback mode',
  (() => { const start = sessions.indexOf('public async probePersistenceHealth'); const end = sessions.indexOf('\n  private ', start); const body = sessions.slice(start, end > start ? end : start + 2000); return start >= 0 && !body.includes('this.useFallback = true'); })());
check('personal credentials use versioned AES-256-GCM protector',
  protector.includes("CREDENTIAL_SECRET_ALGORITHM = 'aes-256-gcm'") && protector.includes('version: typeof CREDENTIAL_SECRET_VERSION'));
check('legacy credential migration deletes plaintext/legacy fields',
  credentials.includes('key: FieldValue.delete()') && credentials.includes('secretCiphertext: FieldValue.delete()') &&
  credentials.includes('secretIv: FieldValue.delete()') && credentials.includes('secretTag: FieldValue.delete()'));
check('credential migration is transaction protected',
  credentials.includes('private static async migrateLegacyCredential') && credentials.includes('adminFirestore.runTransaction'));
check('rotation explicit HTTP statuses precede message heuristics',
  rotation.indexOf("if (status === 401) return 'authentication'") < rotation.indexOf('if (/invalid') &&
  rotation.indexOf("if (status === 403) return 'authorization'") < rotation.indexOf('if (/invalid') &&
  rotation.indexOf("if (status === 429) return 'quota'") < rotation.indexOf('if (/invalid') &&
  rotation.indexOf("return 'transient'") < rotation.indexOf('if (/invalid'));
check('client preserves credential lifecycle status',
  store.includes('normalizeCredentialStatus(key.status)') && !store.includes("status: 'active' as KeyStatus"));
check('AI store persistence excludes credential secret/list',
  store.includes('partialize: (state) => ({') && !store.slice(store.indexOf('partialize: (state) => ({'), store.indexOf('      }),', store.indexOf('partialize: (state) => ({')) + 8).includes('keys:'));
check('temporary chat mode skips browser persistence',
  runtime.includes('if (temporaryMode) return;') &&
  runtime.includes('localStorage.setItem(sessionKey') &&
  !runtime.includes('localStorage.setItem(legacyHistoryKey') &&
  !runtime.includes('localStorage.setItem(historyKey') &&
  runtime.includes('localStorage.removeItem('));
check('Firestore client rules deny direct Tasks/Memory/Credential/Session/Audit access',
  ['agent_memories','agent_tasks','credentials','agent_sessions','audit_logs'].every((name) => rules.includes(name)) &&
  (rules.match(/allow read, write: if false;/g) || []).length >= 6);
check('legacy local filesystem durable db is absent',
  !server.includes('.data/db.json') && !registry.includes('.data/db.json') && !credentials.includes('.data/db.json'));
check('fake attachment message affordance is absent',
  !runtime.includes('[Đính kèm tệp:') && !read('src/agent/ui/AgentChatThread.tsx').includes('[Đính kèm tệp:'));

check('integration test enforces audit tenant scoping with real assertions',
  integrationTests.includes("AuditService, 'list'") &&
  integrationTests.includes("userId: mockUserA.uid") &&
  integrationTests.includes("userId=user_B"));
check('identity-spoofing integration test inspects sanitized RootAgent context',
  integrationTests.includes("RootAgent, 'buildAgent'") &&
  integrationTests.includes("appContext.user.id") &&
  integrationTests.includes("not.toHaveProperty('userId')"));
check('HITL HTTP integration test proves client confirmed is ignored and confirmationId forwarded',
  integrationTests.includes("CapabilityExecutionService, 'execute'") &&
  integrationTests.includes("confirmed: true") &&
  integrationTests.includes("confirmed).toBe(false)") &&
  integrationTests.includes("confirmationId).toBe('confirm-test')"));

let failures = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} Stage5 static: ${item.name}`);
  if (!item.ok) failures += 1;
}

console.log(`Stage5 static: ${checks.length - failures}/${checks.length} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
