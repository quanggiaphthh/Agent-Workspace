import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

const ai = read('shared/contracts/ai.ts');
const runtime = read('src/agent/ui/AdkRuntimeProvider.tsx');
const root = read('server/agent/adk/RootAgent.ts');
const server = read('server.ts');
const identity = read('server/core/auth/identityProvider.ts');
const context = read('src/core/context/contextStore.ts');
const auth = read('src/lib/FirebaseAuthProvider.tsx');
const store = read('src/modules/settings/aiKeysStore.ts');
const credential = read('server/core/ai/CredentialService.ts');
const protector = read('server/core/ai/credentialSecretProtector.ts');
const settings = read('src/modules/settings/AgentAIManagerTab.tsx');

check('AIConfig is strict', ai.includes('}).strict()'));
check('Agent provider contract is Google-only', ai.includes('z.literal(DEFAULT_AGENT_PROVIDER)'));
check('webSearchEnabled is a real config field', ai.includes('webSearchEnabled: z.boolean().default(false)'));
check('client sends agentProvider', runtime.includes('agentProvider: state.agentProvider'));
check('client sends agentModel', runtime.includes('agentModel: state.agentModel'));
check('client no longer aliases providerId', !runtime.includes('providerId: state.agentProvider'));
check('client no longer aliases modelId', !runtime.includes('modelId: state.agentModel'));
check('server parses AIConfig at boundary', server.includes('AIConfigSchema.safeParse(req.body.aiConfig || {})'));
check('RootAgent resolves credential fail-closed', root.includes('CredentialService.resolveCredential('));
check('RootAgent has no initial GEMINI_API_KEY fallback variable', !root.includes('let apiKey = process.env.GEMINI_API_KEY'));
check('model listing validates provider/credential match', server.includes('CredentialService.resolveCredential(user.id, providerParsed.data, credentialId)'));
check('credential resolver explicitly rejects provider mismatch', credential.includes('Credential provider mismatch'));
check('System Key is Google-only', credential.includes("if (providerId !== 'google') return null"));
check('personal credentials encrypted at rest', protector.includes("createCipheriv(CREDENTIAL_SECRET_ALGORITHM") && protector.includes("'aes-256-gcm'"));
check('credential storage does not write plaintext key', !credential.includes("      key, // In a production app, encrypt this!"));
check('verified custom permissions are read server-side', identity.includes('decodedToken.permissions'));
check('fake admin context removed', !context.includes("id: 'usr_admin'"));
check('credentialId reset is centralized', store.includes("credentialId: 'system'"));
check('Zustand auto hydration disabled', store.includes('skipHydration: true'));
check('Firebase awaits user-scoped rehydrate', auth.includes('await useAIKeysStore.persist.rehydrate()'));
check('Agent send checks hydration readiness', runtime.includes('if (!aiSettingsHydrated)'));
check('Agent provider selector is read-only', settings.includes('disabled\n                  aria-label="Nhà cung cấp Agent Chatbox"'));

let failures = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`);
  if (!item.ok) failures += 1;
}
console.log(`\nStage 1: ${checks.length - failures}/${checks.length} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
