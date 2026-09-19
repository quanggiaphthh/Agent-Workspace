import { describe, expect, it } from 'vitest';
import { parseStrictAgentChatRequest } from '../chatRequestContract';

describe('strict Agent Chat request contract', () => {
  it('accepts a normal user message', () => {
    const result = parseStrictAgentChatRequest({ message: 'Xin chào', stateDelta: {}, sessionId: 'abc_123' });
    expect(result.kind).toBe('message');
    expect(result.newMessage).toEqual({ role: 'user', parts: [{ text: 'Xin chào' }] });
  });

  it('rejects malformed bodies instead of inventing a default greeting', () => {
    expect(() => parseStrictAgentChatRequest({})).toThrow(/message|toolResponse/i);
    expect(() => parseStrictAgentChatRequest({ messages: [] })).toThrow(/request/i);
  });

  it('accepts the production confirmation FunctionResponse shape', () => {
    const toolResponse = { role: 'user', parts: [{ functionResponse: { id: 'call-1', name: 'adk_request_confirmation', response: { confirmed: true, payload: { x: 1 } } } }] };
    const result = parseStrictAgentChatRequest({ toolResponse, stateDelta: { page: 'agent' } });
    expect(result.kind).toBe('toolResponse');
    expect(result.newMessage).toEqual(toolResponse);
  });

  it('rejects malformed confirmation payloads', () => {
    expect(() => parseStrictAgentChatRequest({ toolResponse: { role: 'user', parts: [] } })).toThrow(/toolResponse/i);
  });
});
