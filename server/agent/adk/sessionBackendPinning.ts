export interface SessionBackendIdentity {
  appName: string;
  userId: string;
  sessionId: string;
}

export class SessionBackendPinning {
  private readonly pinnedSessions = new Map<string, SessionBackendIdentity>();

  private key(identity: SessionBackendIdentity): string {
    return `${identity.appName}:${identity.userId}:${identity.sessionId}`;
  }

  public isPinned(identity: SessionBackendIdentity): boolean {
    return this.pinnedSessions.has(this.key(identity));
  }

  public pin(identity: SessionBackendIdentity): void {
    this.pinnedSessions.set(this.key(identity), { ...identity });
  }

  public unpin(identity: SessionBackendIdentity): void {
    this.pinnedSessions.delete(this.key(identity));
  }

  public hasPinnedSessions(): boolean {
    return this.pinnedSessions.size > 0;
  }

  public listPinned(appName: string, userId?: string): SessionBackendIdentity[] {
    return Array.from(this.pinnedSessions.values())
      .filter((identity) => identity.appName === appName && (!userId || identity.userId === userId))
      .map((identity) => ({ ...identity }));
  }
}
