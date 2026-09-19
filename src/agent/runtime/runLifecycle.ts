export interface RunToken {
  id: number;
  controller: AbortController;
}

/** Owns the identity of the one frontend Agent run allowed to mutate lifecycle state. */
export class AgentRunGate {
  private generation = 0;
  private active: RunToken | null = null;

  start(): RunToken {
    this.cancel();
    const token = { id: ++this.generation, controller: new AbortController() };
    this.active = token;
    return token;
  }

  cancel(): void {
    const current = this.active;
    if (current && !current.controller.signal.aborted) current.controller.abort();
    if (this.active === current) this.active = null;
  }

  isCurrent(token: RunToken): boolean {
    return this.active?.id === token.id && this.active.controller === token.controller;
  }

  finish(token: RunToken): boolean {
    if (!this.isCurrent(token)) return false;
    this.active = null;
    return true;
  }
}
