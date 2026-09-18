import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });
const server = read('server.ts');
const history = read('src/agent/ui/AgentCoordinationHistory.tsx');
const runtime = read('src/agent/ui/AdkRuntimeProvider.tsx');
const session = read('server/agent/adk/FirestoreSessionService.ts');

check('server lists persistent agent sessions', server.includes("app.get('/api/agent/sessions'"));
check('server returns one persistent session transcript', server.includes("app.get('/api/agent/sessions/:sessionId'"));
check('server deletes an owned persistent session', server.includes("app.delete('/api/agent/sessions/:sessionId'"));
check('client session IDs are validated server-side', server.includes('parseClientSessionId'));
check('history UI no longer uses mock current-session', !history.includes('Mock conversation sessions') && !history.includes("id: 'current-session'"));
check('history UI loads server sessions', history.includes("authFetch('/api/agent/sessions"));
check('runtime exposes loadConversation', runtime.includes('loadConversation:'));
check('newConversation does not call clearHistory', !/const newConversation[\s\S]{0,250}clearHistory\(\)/.test(runtime));
check('session metadata carries eventCount/title for history', session.includes('eventCount') && session.includes('title?: string'));

let failures = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`);
  if (!item.ok) failures += 1;
}
console.log(`\nStage 3B: ${checks.length - failures}/${checks.length} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
