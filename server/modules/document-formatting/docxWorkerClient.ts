import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { MAX_FILE_BYTES } from '../../../shared/contracts/fileUploadPolicy';

type Operation = 'inspect' | 'applyAlignment' | 'applyTopMargin' | 'applyAdministrativePageLayout';
let active = false;

function failure(code: string): Error & { code: string } {
  return Object.assign(new Error('Document processing failed safely.'), { code });
}

/** One bounded document operation per Node process, away from the HTTP event loop. */
export function processDocxInWorker(
  operation: Operation,
  bytes: Buffer,
  input: Record<string, unknown> = {},
  options: { signal?: AbortSignal; deadlineMs?: number } = {},
): Promise<any> {
  if (active) return Promise.reject(failure('PROCESSOR_BUSY'));
  if (options.signal?.aborted) return Promise.reject(failure('PROCESSING_CANCELLED'));
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_FILE_BYTES)
    return Promise.reject(failure('INPUT_TOO_LARGE'));

  const deadlineMs = options.deadlineMs ?? 30_000;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > 45_000)
    return Promise.reject(failure('INVALID_INPUT'));

  // esbuild bundles the server into dist/server.cjs and the worker into dist/docx.worker.cjs.
  // In development and tests, use the source worker beside this module.
  const bundledWorker = resolve(__dirname, 'docx.worker.cjs');
  // tsx compiles source with __dirname='.'; the production bundle has an absolute dist directory.
  const sourceWorker = resolve(process.cwd(), 'server/modules/document-formatting/docxWorker.mjs');
  const workerPath = existsSync(bundledWorker) ? bundledWorker : sourceWorker;
  active = true;
  let worker: Worker;
  try {
    worker = new Worker(workerPath, { resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 8 } });
  } catch {
    active = false;
    return Promise.reject(failure('PROCESSING_FAILED'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const signal = options.signal;
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      void worker.terminate().catch(() => undefined).then(() => {
        active = false;
        if (error) reject(error);
        else resolve(result);
      });
    };
    const onAbort = () => finish(failure('PROCESSING_CANCELLED'));
    const timer = setTimeout(() => finish(failure('PROCESSING_TIMEOUT')), deadlineMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.once('message', (message: { ok?: boolean; code?: string; result?: unknown }) => {
      if (message.ok) finish(undefined, message.result);
      else finish(failure(typeof message.code === 'string' ? message.code : 'PROCESSING_FAILED'));
    });
    worker.once('error', () => finish(failure('PROCESSING_FAILED')));
    worker.once('exit', () => finish(failure('PROCESSING_FAILED')));
    try { worker.postMessage({ operation, bytes, input }); }
    catch { finish(failure('PROCESSING_FAILED')); }
    if (signal?.aborted) onAbort();
  });
}
