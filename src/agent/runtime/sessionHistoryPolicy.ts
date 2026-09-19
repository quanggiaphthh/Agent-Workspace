export type HydrationDecision =
  | { kind: 'hydrate'; sessionId: string; messages: unknown[] }
  | { kind: 'missing'; replacementSessionId: string }
  | { kind: 'error'; message: string };

export function decideSessionHydration(input: {
  sessionId: string;
  status: number;
  serverMessages?: unknown[];
  replacementSessionId: string;
}): HydrationDecision {
  if (input.status === 200) return { kind: 'hydrate', sessionId: input.sessionId, messages: input.serverMessages || [] };
  if (input.status === 404) return { kind: 'missing', replacementSessionId: input.replacementSessionId };
  return { kind: 'error', message: 'Không thể tải lịch sử hội thoại từ máy chủ. Vui lòng thử tải lại.' };
}
