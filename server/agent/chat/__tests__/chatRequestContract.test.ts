import { describe, expect, it } from 'vitest';
import { parseStrictAgentChatRequest } from '../chatRequestContract';

describe('strict Agent Chat request contract', () => {
  it('accepts a normal user message with bounded client context', () => {
    const result = parseStrictAgentChatRequest({
      message: 'Xin chào',
      stateDelta: {
        activeModule: 'tasks',
        activeRoute: '/tasks',
        selectedEntity: { moduleId: 'tasks', entityType: 'task', entityId: 'task-1', label: 'Công việc 1' },
      },
      sessionId: 'abc_123',
    });
    expect(result.kind).toBe('message');
    expect(result.stateDelta).toMatchObject({ activeModule: 'tasks', activeRoute: '/tasks' });
    expect(result.newMessage).toEqual({ role: 'user', parts: [{ text: 'Xin chào' }] });
  });

  it('rejects malformed bodies instead of inventing a default greeting', () => {
    expect(() => parseStrictAgentChatRequest({})).toThrow(/message|toolResponse/i);
    expect(() => parseStrictAgentChatRequest({ messages: [] })).toThrow(/request/i);
  });

  it('rejects authority and arbitrary keys from client stateDelta', () => {
    expect(() => parseStrictAgentChatRequest({ message: 'x', stateDelta: { user: { id: 'forged' } } })).toThrow(/request/i);
    expect(() => parseStrictAgentChatRequest({ message: 'x', stateDelta: { permissions: ['tasks.delete'] } })).toThrow(/request/i);
    expect(() => parseStrictAgentChatRequest({ message: 'x', stateDelta: { unexpectedAuthorityHint: 'admin' } })).toThrow(/request/i);
  });

  it('validates aiConfig with the canonical Google-only Agent schema', () => {
    const valid = parseStrictAgentChatRequest({
      message: 'x',
      aiConfig: { agentProvider: 'google', agentModel: 'gemini-3.5-flash-lite', credentialId: 'system', autoRotate: false, memoryEnabled: true, webSearchEnabled: false },
    });
    expect(valid.aiConfig?.agentProvider).toBe('google');
    expect(() => parseStrictAgentChatRequest({ message: 'x', aiConfig: { agentProvider: 'openai' } })).toThrow(/request/i);
  });

  it('accepts the production confirmation FunctionResponse shape', () => {
    const toolResponse = { role: 'user', parts: [{ functionResponse: { id: 'call-1', name: 'adk_request_confirmation', response: { confirmed: true, payload: { x: 1 } } } }] };
    const result = parseStrictAgentChatRequest({ toolResponse, stateDelta: { activeModule: 'tasks' } });
    expect(result.kind).toBe('toolResponse');
    expect(result.newMessage).toEqual(toolResponse);
  });

  it('rejects malformed confirmation payloads', () => {
    expect(() => parseStrictAgentChatRequest({ toolResponse: { role: 'user', parts: [] } })).toThrow(/toolResponse/i);
  });
});
