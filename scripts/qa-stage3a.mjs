import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });
const session = read('server/agent/adk/FirestoreSessionService.ts');
const server = read('server.ts');

check('session service exposes getOrCreateSession', session.includes('getOrCreateSession('));
check('Firestore events use a subcollection', session.includes(".collection('events')"));
check('appendEvent reads actions.stateDelta', session.includes('actions?.stateDelta'));
check('temporary state keys are filtered', session.includes("key.startsWith('temp:')"));
check('partial events are not persisted as completed history', session.includes('(req.event as any).partial'));
check('session metadata tracks eventCount instead of rewriting events array', session.includes('eventCount') && !session.includes('updatedEvents = [...currentSession.events'));
check('getSession reconstructs events from subcollection', session.includes("orderBy('sequence'"));
check('server selects temporary in-memory session service', server.includes('temporarySessionService') && server.includes('temporaryMode'));

let failures = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`);
  if (!item.ok) failures += 1;
}
console.log(`\nStage 3A: ${checks.length - failures}/${checks.length} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
