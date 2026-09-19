export const DEFAULT_AGENT_EXECUTION_TIMEOUT_MS = 120_000;

export function agentExecutionTimeoutMs(envValue = process.env.AGENT_EXECUTION_TIMEOUT_MS): number {
  if (envValue === undefined || envValue === '') return DEFAULT_AGENT_EXECUTION_TIMEOUT_MS;
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 900_000
    ? Math.floor(parsed)
    : DEFAULT_AGENT_EXECUTION_TIMEOUT_MS;
}

export function createExecutionDeadline(parent: AbortSignal, timeoutMs = agentExecutionTimeoutMs()) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => {
    if (!controller.signal.aborted) controller.abort(parent.reason);
  };
  if (parent.aborted) abortFromParent();
  else parent.addEventListener('abort', abortFromParent, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    if (!controller.signal.aborted) {
      controller.abort(Object.assign(new Error('Agent execution timed out.'), { code: 'AGENT_TIMEOUT' }));
    }
  }, timeoutMs);
  timer.unref?.();

  return {
    signal: controller.signal,
    get timedOut() { return timedOut; },
    cleanup() {
      clearTimeout(timer);
      parent.removeEventListener('abort', abortFromParent);
    },
  };
}
