import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = path.resolve('server/agent/adk/FirestoreSessionService.ts');
const pinningPath = path.resolve('server/agent/adk/sessionBackendPinning.ts');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage4c-session-'));

function write(name, content) {
  fs.writeFileSync(path.join(tempDir, name), content, 'utf8');
}

try {
  let serviceSource = fs.readFileSync(sourcePath, 'utf8');
  serviceSource = serviceSource
    .replace(/import \{[\s\S]*?\} from '@google\/adk';/, "import { BaseSessionService } from './adk-stub.mjs';")
    .replace("import { adminFirestore } from '../../lib/firebaseAdmin';", "import { adminFirestore } from './firebase-stub.mjs';")
    .replace("import { redactAuditString } from '../../core/audit/auditRedaction';", "import { redactAuditString } from './audit-stub.mjs';")
    .replace("import { SessionBackendPinning, type SessionBackendIdentity } from './sessionBackendPinning';", "import { SessionBackendPinning } from './sessionBackendPinning.ts';");
  write('FirestoreSessionService.ts', serviceSource);
  fs.copyFileSync(pinningPath, path.join(tempDir, 'sessionBackendPinning.ts'));
  write('adk-stub.mjs', 'export class BaseSessionService {}\n');
  write('audit-stub.mjs', 'export const redactAuditString = (value) => String(value);\n');
  write('firebase-stub.mjs', `
const docs = new Map();
let available = false;
const key = (parts) => parts.join('/');
const permissionError = () => Object.assign(new Error('PERMISSION_DENIED: Firestore unavailable'), { code: 7 });

function docSnapshot(docKey) {
  const data = docs.get(docKey);
  return {
    exists: data !== undefined,
    data: () => data,
    get: (field) => data?.[field],
  };
}

class DocumentRef {
  constructor(parts) { this.parts = parts; }
  collection(name) { return new CollectionRef([...this.parts, name]); }
  async set(value) {
    if (!available) throw permissionError();
    docs.set(key(this.parts), structuredClone(value));
  }
  async get() {
    if (!available) throw permissionError();
    return docSnapshot(key(this.parts));
  }
  async delete() {
    if (!available) throw permissionError();
    docs.delete(key(this.parts));
  }
}

class QueryRef {
  constructor(parts, orderField = null, orderDirection = 'asc', rowLimit = null) {
    this.parts = parts;
    this.orderField = orderField;
    this.orderDirection = orderDirection;
    this.rowLimit = rowLimit;
  }
  orderBy(field, direction = 'asc') { return new QueryRef(this.parts, field, direction, this.rowLimit); }
  limit(value) { return new QueryRef(this.parts, this.orderField, this.orderDirection, value); }
  async get() {
    if (!available) throw permissionError();
    const prefix = key(this.parts) + '/';
    const depth = this.parts.length + 1;
    let rows = [...docs.entries()]
      .filter(([docKey]) => docKey.startsWith(prefix) && docKey.split('/').length === depth)
      .map(([docKey, data]) => ({ id: docKey.split('/').at(-1), data }));
    if (this.orderField) {
      rows.sort((a, b) => {
        const av = a.data?.[this.orderField] ?? 0;
        const bv = b.data?.[this.orderField] ?? 0;
        return this.orderDirection === 'desc' ? bv - av : av - bv;
      });
    }
    if (this.rowLimit != null) rows = rows.slice(0, this.rowLimit);
    const mapped = rows.map(({ id, data }) => ({ id, data: () => structuredClone(data), get: (field) => data?.[field] }));
    return { docs: mapped, size: mapped.length, empty: mapped.length === 0 };
  }
}

class CollectionRef extends QueryRef {
  doc(id) { return new DocumentRef([...this.parts, id]); }
}

export const adminFirestore = {
  collection(name) { return new CollectionRef([name]); },
  collectionGroup() { throw new Error('collectionGroup not required by this integration regression'); },
  batch() { throw new Error('batch not required by this integration regression'); },
  async runTransaction() { throw new Error('transaction not required by this integration regression'); },
};

export function setFirestoreAvailable(value) { available = value; }
export function resetFirestore() { docs.clear(); available = false; }
`);

  const serviceUrl = pathToFileURL(path.join(tempDir, 'FirestoreSessionService.ts')).href;
  const firebaseUrl = pathToFileURL(path.join(tempDir, 'firebase-stub.mjs')).href;
  const [{ FirestoreSessionService }, firebase] = await Promise.all([
    import(serviceUrl),
    import(firebaseUrl),
  ]);

  firebase.resetFirestore();
  const service = new FirestoreSessionService();
  const appName = 'app';
  const userId = 'user';

  firebase.setFirestoreAvailable(false);
  await service.createSession({ appName, userId, sessionId: 'S1', state: { topic: 'kept' } });
  const firstCopy = await service.getSession({ appName, userId, sessionId: 'S1' });
  const event1 = {
    id: 'e1',
    author: 'user',
    timestamp: 1,
    content: { role: 'user', parts: [{ text: 'fallback turn' }] },
    actions: { stateDelta: { turn: 1 } },
  };
  await service.appendEvent({ session: firstCopy, event: event1 });

  const appendUpdatesRunnerSession = firstCopy.events.length === 1
    && firstCopy.events[0]?.id === 'e1'
    && firstCopy.state.turn === 1
    && firstCopy.lastUpdateTime > 0;

  firebase.setFirestoreAvailable(true);
  await service.createSession({ appName, userId, sessionId: 'S2', state: { persistent: true } });

  const listed = await service.listSessions({ appName, userId, limit: 50 });
  const listedIds = listed.sessions.map((session) => session.id);
  const hybridListContainsBoth = listedIds.includes('S1') && listedIds.includes('S2') && listed.totalItems === 2;

  const summaries = await service.listSessionSummaries(appName, userId, 50);
  const summaryIds = summaries.map((summary) => summary.sessionId);
  const hybridSummariesContainBoth = summaryIds.includes('S1') && summaryIds.includes('S2');

  const continued = await service.getSession({ appName, userId, sessionId: 'S1' });
  const fallbackContinuityPreserved = continued?.events?.some((event) => event.id === 'e1')
    && continued?.state?.topic === 'kept'
    && continued?.state?.turn === 1;

  firebase.setFirestoreAvailable(false);
  const sameReferenceSession = await service.createSession({ appName, userId, sessionId: 'S3', state: {} });
  const event3 = {
    id: 'e3',
    author: 'user',
    timestamp: 3,
    content: { role: 'user', parts: [{ text: 'single append' }] },
    actions: { stateDelta: { count: 1 } },
  };
  await service.appendEvent({ session: sameReferenceSession, event: event3 });
  const sameReferenceAppendsExactlyOnce = sameReferenceSession.events.length === 1
    && sameReferenceSession.events[0]?.id === 'e3'
    && sameReferenceSession.state.count === 1;

  const checks = [
    ['pinned fallback append updates current Runner session object', appendUpdatesRunnerSession],
    ['history list merges Firestore and pinned fallback sessions after recovery', hybridListContainsBoth],
    ['history summaries merge Firestore and pinned fallback sessions after recovery', hybridSummariesContainBoth],
    ['pinned fallback session retains prior events and state after recovery', fallbackContinuityPreserved],
    ['fallback append does not double-append when Runner holds stored session reference', sameReferenceAppendsExactlyOnce],
  ];

  let failures = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'} integration: ${name}`);
    if (!ok) failures += 1;
  }
  console.log(`Session integration 4C: ${checks.length - failures}/${checks.length} passed`);
  process.exitCode = failures ? 1 : 0;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
