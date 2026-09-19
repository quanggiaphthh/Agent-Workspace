export interface HistoryPart { type: 'text' | 'tool-call' | 'tool-response'; text?: string; toolName?: string; toolCallId?: string; args?: unknown; result?: unknown }
export interface HistoryMessage { id: string; role: 'user' | 'assistant'; content: HistoryPart[]; timestamp: number }

function timestampMs(value: unknown): number {
  const raw = Number(value || Date.now());
  return raw > 0 && raw < 1_000_000_000_000 ? raw * 1000 : raw;
}

export function sessionTranscript(events: unknown[]): HistoryMessage[] {
  return (events as any[]).flatMap((event, index) => {
    if (event?.partial) return [];
    const parts = Array.isArray(event?.content?.parts) ? event.content.parts : [];
    const content: HistoryPart[] = [];
    if (typeof event?.content === 'string' && event.content.trim()) content.push({ type: 'text', text: event.content.trim() });
    for (const part of parts) {
      if (typeof part?.text === 'string' && part.text) content.push({ type: 'text', text: part.text });
      if (part?.functionCall) content.push({ type: 'tool-call', toolName: part.functionCall.name, toolCallId: part.functionCall.id, args: part.functionCall.args });
      if (part?.functionResponse) content.push({ type: 'tool-response', toolName: part.functionResponse.name, toolCallId: part.functionResponse.id, result: part.functionResponse.response });
    }
    if (!content.length) return [];
    return [{
      id: String(event?.id || `${event?.invocationId || 'evt'}-${index}`),
      role: event?.content?.role === 'user' || event?.author === 'user' ? 'user' : 'assistant',
      content,
      timestamp: timestampMs(event?.timestamp),
    }];
  });
}
