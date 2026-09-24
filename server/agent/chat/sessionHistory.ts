export interface HistorySource { title: string; url: string }
export interface HistoryPart {
  type: 'text' | 'tool-call' | 'tool-response' | 'sources' | 'error';
  text?: string;
  toolName?: string;
  toolCallId?: string;
  args?: unknown;
  result?: unknown;
  sources?: HistorySource[];
  error?: string;
}
export interface HistoryMessage { id: string; role: 'user' | 'assistant'; content: HistoryPart[]; timestamp?: number }

function timestampMs(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  return raw < 1_000_000_000_000 ? raw * 1000 : raw;
}

function safeSources(value: unknown): HistorySource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: any) => {
    if (!item || typeof item.url !== 'string' || !item.url) return [];
    return [{
      title: typeof item.title === 'string' && item.title.trim() ? item.title : item.url,
      url: item.url,
    }];
  });
}

export function sessionTranscript(events: unknown[]): HistoryMessage[] {
  return (events as any[]).flatMap((event, index) => {
    if (event?.partial) return [];
    const parts = Array.isArray(event?.content?.parts) ? event.content.parts : [];
    const content: HistoryPart[] = [];
    let hasFunctionResponse = false;

    if (typeof event?.content === 'string' && event.content.trim()) content.push({ type: 'text', text: event.content.trim() });
    for (const part of parts) {
      if (typeof part?.text === 'string' && part.text) content.push({ type: 'text', text: part.text });
      if (part?.functionCall) {
        content.push({ type: 'tool-call', toolName: part.functionCall.name, toolCallId: part.functionCall.id, args: part.functionCall.args });
      }
      if (part?.functionResponse) {
        hasFunctionResponse = true;
        const response = part.functionResponse.response;
        if (response?.success === false) {
          content.push({
            type: 'error',
            toolName: part.functionResponse.name,
            toolCallId: part.functionResponse.id,
            error: typeof response.errorCode === 'string' ? response.errorCode : 'TOOL_EXECUTION_FAILED',
          });
        } else {
          content.push({ type: 'tool-response', toolName: part.functionResponse.name, toolCallId: part.functionResponse.id, result: response });
          const sources = safeSources(response?.result?.sources || response?.sources);
          if (sources.length > 0) content.push({ type: 'sources', sources });
        }
      }
    }
    if (!content.length) return [];

    // ADK FunctionResponse transport events may use content.role=user because
    // they are injected back into the model turn. They are system/tool
    // semantics in the user-facing transcript, never a human-authored message.
    const role: 'user' | 'assistant' = hasFunctionResponse
      ? 'assistant'
      : event?.content?.role === 'user' || event?.author === 'user'
        ? 'user'
        : 'assistant';

    return [{
      id: String(event?.id || `${event?.invocationId || 'evt'}-${index}`),
      role,
      content,
      timestamp: timestampMs(event?.timestamp),
    }];
  });
}
