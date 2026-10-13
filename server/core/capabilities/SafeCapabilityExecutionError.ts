/** An intentionally safe, user-facing capability failure with a stable code. */
export class SafeCapabilityExecutionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'SafeCapabilityExecutionError';
  }
}
