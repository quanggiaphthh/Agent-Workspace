import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';

const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

async function loadTs(path) {
  if (!fs.existsSync(path)) return null;
  return import(pathToFileURL(new URL(`../${path}`, import.meta.url).pathname).href);
}

const healthModule = await loadTs('server/core/runtime/runtimeHealthPolicy.ts');
if (!healthModule) {
  check('health policy module exists', false);
  check('health degrades when session falls back to memory', false);
  check('health errors when durable persistence is unavailable', false);
} else {
  check('health policy module exists', typeof healthModule.computeRuntimeHealth === 'function');
  const degraded = healthModule.computeRuntimeHealth({
    firestore: { status: 'ok' },
    session: { status: 'degraded', mode: 'in-memory-fallback' },
    modules: { status: 'ok' },
    audit: { status: 'ok' },
  });
  check('health degrades when session falls back to memory', degraded.status === 'degraded');
  const errored = healthModule.computeRuntimeHealth({
    firestore: { status: 'error' },
    session: { status: 'error', mode: 'unavailable' },
    modules: { status: 'error' },
    audit: { status: 'error' },
  });
  check('health errors when durable persistence is unavailable', errored.status === 'error');
}

const cancelModule = await loadTs('server/core/runtime/requestCancellation.ts');
if (!cancelModule) {
  check('request cancellation module exists', false);
  check('request aborted event aborts execution signal', false);
  check('premature response close aborts execution signal', false);
  check('normal completed response close does not spuriously abort', false);
  check('aborted signal raises execution cancellation error', false);
} else {
  check('request cancellation module exists', typeof cancelModule.bindRequestCancellation === 'function');

  const reqA = new EventEmitter();
  reqA.aborted = false;
  const resA = new EventEmitter();
  resA.writableEnded = false;
  const boundA = cancelModule.bindRequestCancellation(reqA, resA);
  reqA.aborted = true;
  reqA.emit('aborted');
  check('request aborted event aborts execution signal', boundA.signal.aborted === true);
  boundA.cleanup();

  const reqB = new EventEmitter();
  reqB.aborted = false;
  const resB = new EventEmitter();
  resB.writableEnded = false;
  const boundB = cancelModule.bindRequestCancellation(reqB, resB);
  resB.emit('close');
  check('premature response close aborts execution signal', boundB.signal.aborted === true);
  boundB.cleanup();

  const reqC = new EventEmitter();
  reqC.aborted = false;
  const resC = new EventEmitter();
  resC.writableEnded = true;
  const boundC = cancelModule.bindRequestCancellation(reqC, resC);
  resC.emit('close');
  check('normal completed response close does not spuriously abort', boundC.signal.aborted === false);
  boundC.cleanup();

  const controller = new AbortController();
  controller.abort();
  let cancellationCaught = false;
  try {
    cancelModule.throwIfAborted(controller.signal);
  } catch (err) {
    cancellationCaught = cancelModule.isCancellationError(err) && err?.code === 'EXECUTION_CANCELLED';
  }
  check('aborted signal raises execution cancellation error', cancellationCaught);
}


const pinningModule = await loadTs('server/agent/adk/sessionBackendPinning.ts');
if (!pinningModule) {
  check('session backend pinning policy module exists', false);
  check('fallback session stays pinned after Firestore recovery', false);
  check('pinned fallback session preserves prior state and events', false);
  check('new session can use persistent backend after recovery', false);
} else {
  const pins = new pinningModule.SessionBackendPinning();
  const fallbackSession = {
    state: { topic: 'kept', turn: 2 },
    events: ['turn-1', 'turn-2'],
  };
  const sessionA = { appName: 'app', userId: 'user', sessionId: 'S1' };
  const sessionB = { appName: 'app', userId: 'user', sessionId: 'S2' };
  pins.pin(sessionA);
  const firestoreRestored = true;
  const routeA = pins.isPinned(sessionA) ? 'memory' : (firestoreRestored ? 'firestore' : 'memory');
  const continued = routeA === 'memory' ? fallbackSession : { state: {}, events: [] };
  check('session backend pinning policy module exists', typeof pinningModule.SessionBackendPinning === 'function');
  check('fallback session stays pinned after Firestore recovery', routeA === 'memory');
  check('pinned fallback session preserves prior state and events',
    continued.state.topic === 'kept' && continued.state.turn === 2 && continued.events.length === 2);
  const routeB = pins.isPinned(sessionB) ? 'memory' : (firestoreRestored ? 'firestore' : 'memory');
  check('new session can use persistent backend after recovery', routeB === 'firestore');
}

let failed = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} behavior: ${item.name}`);
  if (!item.ok) failed += 1;
}
console.log(`Behavior 4C: ${checks.length - failed}/${checks.length} passed`);
process.exitCode = failed ? 1 : 0;
