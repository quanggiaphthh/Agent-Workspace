import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processInWorker } from './thread-client.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const input = await readFile(join(root, 'fixtures/24-vietnamese-rich.docx'));
const sourceSha256 = createHash('sha256').update(input).digest('hex');
const loopDelay = monitorEventLoopDelay({ resolution: 10 });
let eventLoopTicks = 0;
const timer = setInterval(() => { eventLoopTicks++; }, 10);
loopDelay.enable();
const rssBeforeMiB = process.memoryUsage().rss / 1024 / 1024;
const inspectStart = performance.now();
const inspection = await processInWorker('inspect', input);
const inspectMs = performance.now() - inspectStart;
const target = inspection.paragraphs.find(paragraph => paragraph.directAlignment !== null);
if (!target) throw new Error('Representative DOCX did not expose a direct-alignment target.');
const desiredAfter = target.directAlignment === 'LEFT' ? 'RIGHT' : 'LEFT';
const applyStart = performance.now();
const applied = await processInWorker('applyAlignment', input, {
  sourceSha256,
  paragraphId: target.paragraphId,
  anchor: target.anchor,
  expectedBefore: target.directAlignment,
  desiredAfter,
});
const applyMs = performance.now() - applyStart;
loopDelay.disable();
clearInterval(timer);
console.log(JSON.stringify({
  node: process.version,
  fixture: '24-vietnamese-rich.docx',
  inputBytes: input.length,
  sourceSha256,
  outputBytes: applied.bytes.length,
  outputSha256: applied.outputSha256,
  targetParagraphId: target.paragraphId,
  alignmentBefore: target.directAlignment,
  alignmentAfter: desiredAfter,
  outputReopenedAndRevalidated: applied.reopened && applied.revalidated,
  inspectMs: Math.round(inspectMs * 100) / 100,
  applyMs: Math.round(applyMs * 100) / 100,
  totalMs: Math.round((inspectMs + applyMs) * 100) / 100,
  eventLoopTicksWhileProcessing: eventLoopTicks,
  eventLoopDelayMaxMs: Math.round(loopDelay.max / 1e6 * 100) / 100,
  rssBeforeMiB: Math.round(rssBeforeMiB * 100) / 100,
  rssAfterMiB: Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100,
  rssPeakMiB: Math.round(process.resourceUsage().maxRSS / 1024 * 100) / 100,
  workerV8OldGenerationLimitMiB: 192,
  note: 'V8 worker old-generation limit is not a process RSS hard cap.',
}, null, 2));
