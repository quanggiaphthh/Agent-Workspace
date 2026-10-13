const LOCAL_PROCESSOR_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Manual release attestation for V1. Set DOCUMENT_FORMATTING_V1_RELEASE_APPROVED
 * only after processor deployment, IAM, temporary-file lifecycle, no-Firebase
 * behavior, and production-like verification have passed.
 */
export function isDocumentFormattingReleaseReady(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.DOCUMENT_FORMATTING_V1_RELEASE_APPROVED !== 'true') return false;

  const sharedToken = env.DOCUMENT_PROCESSOR_SHARED_TOKEN || '';
  if (Buffer.byteLength(sharedToken, 'utf8') < 32 || /\s/.test(sharedToken)) return false;

  let processorUrl: URL;
  try { processorUrl = new URL(env.DOCUMENT_PROCESSOR_URL || ''); }
  catch { return false; }

  if (processorUrl.username || processorUrl.password || processorUrl.search || processorUrl.hash || processorUrl.pathname !== '/') {
    return false;
  }

  const localHttp = env.NODE_ENV !== 'production'
    && processorUrl.protocol === 'http:'
    && LOCAL_PROCESSOR_HOSTS.has(processorUrl.hostname);
  return processorUrl.protocol === 'https:' || localHttp;
}

export const DOCUMENT_FORMATTING_RELEASE_GATE_CODE = 'DOCUMENT_FORMATTING_RELEASE_GATE_CLOSED';
