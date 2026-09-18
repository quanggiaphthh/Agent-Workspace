import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });
const server = read('server.ts');
const runtime = read('src/agent/ui/AdkRuntimeProvider.tsx');

check('server exposes a session branch endpoint', server.includes("app.post('/api/agent/sessions/branch'"));
check('branch boundary is expressed as beforeUserTurn', server.includes('beforeUserTurn'));
check('branch copies prior ADK events with appendEvent', server.includes('appendEvent({ session: branchedSession, event })'));
check('branch supports temporary and persistent session services', server.includes('temporaryMode ? temporarySessionService : adkSessionService'));
check('editMessage requests server branch', /const editMessage[\s\S]*?branchConversation\(beforeUserTurn\)/.test(runtime));
check('regenerate requests server branch', /const regenerate[\s\S]*?branchConversation\(beforeUserTurn\)/.test(runtime));
check('edit/retry send against returned branch session id', runtime.includes('branch.sessionId'));
check('send pipeline accepts explicit base transcript after branching', runtime.includes('initialMessagesOverride'));

let failures = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`);
  if (!item.ok) failures += 1;
}
console.log(`\nStage 3C: ${checks.length - failures}/${checks.length} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
