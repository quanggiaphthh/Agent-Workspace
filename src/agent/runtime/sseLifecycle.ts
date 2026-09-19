export const AGENT_TRANSPORT_KEY = '__agentTransport' as const;

export type AgentTransportEnvelope = {
  [AGENT_TRANSPORT_KEY]: {
    type: 'complete' | 'error';
    code?: string;
    message?: string;
  };
};

export class AgentSseProtocolError extends Error {
  readonly code = 'STREAM_PROTOCOL_ERROR';

  constructor(message = 'Không thể xử lý dữ liệu phản hồi từ Trợ lý AI (SSE Protocol Error).') {
    super(message);
    this.name = 'AgentSseProtocolError';
  }
}

export function transportComplete(): AgentTransportEnvelope {
  return { [AGENT_TRANSPORT_KEY]: { type: 'complete' } };
}

export function transportError(code: string, message: string): AgentTransportEnvelope {
  return { [AGENT_TRANSPORT_KEY]: { type: 'error', code, message } };
}

export function isAgentTransportEnvelope(value: unknown): value is AgentTransportEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = (value as Record<string, unknown>)[AGENT_TRANSPORT_KEY];
  if (!envelope || typeof envelope !== 'object') return false;
  const type = (envelope as { type?: unknown }).type;
  return type === 'complete' || type === 'error';
}

export type AgentSseHandlers = {
  onAdkEvent: (event: unknown) => void;
  onComplete: () => void;
  onError: (error: { code: string; message: string }) => void;
};

export function processAgentSseData(data: string, handlers: AgentSseHandlers): 'event' | 'complete' | 'error' | 'ignored' {
  if (!data || data === '[DONE]') return 'ignored';

  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw new AgentSseProtocolError();
  }

  if (value && typeof value === 'object' && AGENT_TRANSPORT_KEY in value && !isAgentTransportEnvelope(value)) {
    throw new AgentSseProtocolError();
  }

  if (isAgentTransportEnvelope(value)) {
    const transport = value[AGENT_TRANSPORT_KEY];
    if (transport.type === 'complete') {
      handlers.onComplete();
      return 'complete';
    }
    handlers.onError({
      code: typeof transport.code === 'string' && transport.code ? transport.code : 'STREAM_ERROR',
      message: typeof transport.message === 'string' && transport.message ? transport.message : 'Không thể hoàn tất phản hồi.',
    });
    return 'error';
  }
  handlers.onAdkEvent(value);
  return 'event';
}

// Test-focused parser for complete SSE text. The production reader uses the same data processor incrementally.
export function consumeAgentSseText(text: string, handlers: AgentSseHandlers) {
  let completed = false;
  let errored = false;
  for (const block of text.split(/\r?\n\r?\n/)) {
    for (const line of block.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) continue;
      const result = processAgentSseData(trimmed.slice(5).trim(), handlers);
      if (result === 'complete') completed = true;
      if (result === 'error') errored = true;
    }
  }
  return { completed, errored };
}
