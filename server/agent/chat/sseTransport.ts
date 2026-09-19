export function serializeAgentTransportComplete(): string {
  return `data: ${JSON.stringify({ __agentTransport: { type: 'complete' } })}\n\n`;
}

export function serializeAgentTransportError(code = 'STREAM_ERROR'): string {
  const safeCode = /^[A-Z0-9_]{3,80}$/.test(code) ? code : 'STREAM_ERROR';
  return `data: ${JSON.stringify({
    __agentTransport: {
      type: 'error',
      code: safeCode,
      message: 'Không thể hoàn tất phản hồi từ Trợ lý AI.',
    },
  })}\n\n`;
}
