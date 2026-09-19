import { describe, expect, it } from 'vitest';
import { AgentRunGate } from '../runLifecycle';

describe('AgentRunGate stale-run isolation', () => {
  it('stops A and prevents late A from owning B lifecycle', () => {
    const gate = new AgentRunGate();
    const a = gate.start();
    gate.cancel();
    expect(a.controller.signal.aborted).toBe(true);
    const b = gate.start();
    expect(gate.isCurrent(a)).toBe(false);
    expect(gate.finish(a)).toBe(false);
    expect(gate.isCurrent(b)).toBe(true);
  });

  it('cleans up only the current run', () => {
    const gate = new AgentRunGate();
    const run = gate.start();
    expect(gate.finish(run)).toBe(true);
    expect(gate.isCurrent(run)).toBe(false);
  });
});
