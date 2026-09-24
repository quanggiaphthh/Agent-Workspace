export interface PersistedChatPart {
  type: string;
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
}

export interface PersistedChatMessage {
  content: string | PersistedChatPart[];
}

export interface RecoveredConfirmation {
  id: string;
  toolCallId: string;
  name: string;
  args: unknown;
  recovered: true;
  confirmation: { hint?: string; payload?: unknown };
}

/**
 * Durable transcript reconstruction identifies only a candidate pending HITL
 * request. It never proves the server challenge is still unexpired/unconsumed;
 * the canonical ConfirmationService revalidates all bindings when the user
 * approves or rejects it.
 */
export function reconstructPendingConfirmations(messages: PersistedChatMessage[]): RecoveredConfirmation[] {
  const answered = new Set<string>();
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if ((part.type === 'tool-response' || part.type === 'error') && part.toolCallId) answered.add(part.toolCallId);
    }
  }

  const pending = new Map<string, RecoveredConfirmation>();
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type !== 'tool-call' || part.toolName !== 'adk_request_confirmation' || !part.toolCallId) continue;
      if (answered.has(part.toolCallId)) continue;
      const args = part.args && typeof part.args === 'object' ? part.args as Record<string, unknown> : {};
      pending.set(part.toolCallId, {
        id: part.toolCallId,
        toolCallId: part.toolCallId,
        name: part.toolName,
        args: part.args ?? {},
        recovered: true,
        confirmation: {
          hint: typeof args.hint === 'string' ? args.hint : undefined,
          payload: args.payload,
        },
      });
    }
  }
  return [...pending.values()];
}
