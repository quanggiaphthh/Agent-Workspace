import { describe, expect, it } from 'vitest';
import { serializeAgentTransportComplete, serializeAgentTransportError } from '../sseTransport';

describe('server Agent SSE transport envelopes', () => {
  it('serializes explicit completion', () => {
    expect(serializeAgentTransportComplete()).toContain('"type":"complete"');
  });

  it('serializes a sanitized machine-readable mid-stream error', () => {
    const value = serializeAgentTransportError('PROVIDER_QUOTA');
    expect(value).toContain('"type":"error"');
    expect(value).toContain('"code":"PROVIDER_QUOTA"');
    expect(value).not.toContain('AIza');
    expect(serializeAgentTransportError('bad code')).toContain('"code":"STREAM_ERROR"');
  });
});
