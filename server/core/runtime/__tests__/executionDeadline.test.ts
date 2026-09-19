import { describe, expect, it, vi } from 'vitest';
import { createExecutionDeadline } from '../executionDeadline';

describe('Agent execution deadline', () => {
  it('propagates client cancellation', () => {
    const parent = new AbortController();
    const deadline = createExecutionDeadline(parent.signal, 10_000);
    parent.abort();
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.timedOut).toBe(false);
    deadline.cleanup();
  });

  it('aborts deterministically on execution timeout', () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const deadline = createExecutionDeadline(parent.signal, 1_000);
    vi.advanceTimersByTime(1_000);
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.timedOut).toBe(true);
    deadline.cleanup();
    vi.useRealTimers();
  });
});
