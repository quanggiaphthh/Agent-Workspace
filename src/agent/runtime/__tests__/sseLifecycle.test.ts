import { describe, expect, it } from 'vitest';
import { consumeAgentSseText, transportComplete, transportError } from '../sseLifecycle';

describe('Agent SSE lifecycle', () => {
  it('preserves ADK events and recognizes deterministic completion', () => {
    const seen: any[] = [];
    const lifecycle: string[] = [];
    consumeAgentSseText(
      'data: {"id":"e1","partial":true}\n\ndata: {"id":"e2","partial":false}\n\ndata: '+JSON.stringify(transportComplete())+'\n\n',
      { onAdkEvent: e => seen.push(e), onComplete: () => lifecycle.push('complete'), onError: () => lifecycle.push('error') },
    );
    expect(seen.map(e => e.id)).toEqual(['e1', 'e2']);
    expect(lifecycle).toEqual(['complete']);
  });


  it('preserves tool-call, tool-result and confirmation ADK payloads unchanged', () => {
    const events = [
      { id: 'tool-call', content: { parts: [{ functionCall: { id: 'c1', name: 'search', args: {} } }] } },
      { id: 'tool-result', content: { parts: [{ functionResponse: { id: 'c1', name: 'search', response: { ok: true } } }] } },
      { id: 'confirm', content: { parts: [{ functionCall: { id: 'c2', name: 'adk_request_confirmation', args: { hint: 'Confirm' } } }] } },
    ];
    const seen: any[] = [];
    const text = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + `data: ${JSON.stringify(transportComplete())}\n\n`;
    consumeAgentSseText(text, { onAdkEvent: e => seen.push(e), onComplete: () => {}, onError: () => {} });
    expect(seen).toEqual(events);
  });
  it('maps a mid-stream transport error without treating it as an ADK event', () => {
    const seen: any[] = [];
    let error: any;
    consumeAgentSseText(
      'data: {"id":"partial"}\n\ndata: '+JSON.stringify(transportError('UPSTREAM_ERROR', 'Không thể hoàn tất phản hồi.'))+'\n\n',
      { onAdkEvent: e => seen.push(e), onComplete: () => {}, onError: e => { error = e; } },
    );
    expect(seen).toHaveLength(1);
    expect(error).toEqual({ code: 'UPSTREAM_ERROR', message: 'Không thể hoàn tất phản hồi.' });
  });

  it('does not infer success from EOF without completion', () => {
    let completed = false;
    const result = consumeAgentSseText('data: {"id":"partial"}\n\n', {
      onAdkEvent: () => {}, onComplete: () => { completed = true; }, onError: () => {},
    });
    expect(completed).toBe(false);
    expect(result.completed).toBe(false);
  });
});

import { mergeStreamingMessages } from '../streamMessageMerge';

describe('stream message merge', () => {
  it('does not duplicate an optimistic user echo', () => {
    const local: any[] = [{ id: 'local-user', role: 'user', content: [{ type: 'text', text: 'Hello' }] }];
    const streamed: any[] = [
      { id: 'server-user', role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: 'Xin chào bạn' }] },
    ];
    const merged = mergeStreamingMessages(local, streamed, { optimisticUserMessageId: 'local-user' });
    expect(merged.filter(m => m.role === 'user')).toHaveLength(1);
    expect(merged.filter(m => m.role === 'assistant')).toHaveLength(1);
  });

  it('keeps both local and streamed user messages with identical text when optimisticUserMessageId is absent', () => {
    const local: any[] = [{ id: 'local-user', role: 'user', content: [{ type: 'text', text: 'Hello' }] }];
    const streamed: any[] = [
      { id: 'server-user', role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: 'Xin chào bạn' }] },
    ];
    const merged = mergeStreamingMessages(local, streamed, {});
    expect(merged.filter(m => m.role === 'user')).toHaveLength(2);
    expect(merged.filter(m => m.role === 'assistant')).toHaveLength(1);
  });

  it('replaces a partial assistant snapshot with its final snapshot by id', () => {
    const local: any[] = [];
    const partial: any[] = [{ id: 'a1', role: 'assistant', content: [{ type: 'text', text: 'Xin' }] }];
    const final: any[] = [{ id: 'a1', role: 'assistant', content: [{ type: 'text', text: 'Xin chào bạn' }] }];
    expect(mergeStreamingMessages(local, partial)[0].content[0].text).toBe('Xin');
    const merged = mergeStreamingMessages(local, final);
    expect(merged).toHaveLength(1);
    expect(merged[0].content[0].text).toBe('Xin chào bạn');
  });
});

describe('checker corrective SSE protocol behavior', () => {
  it('fails a partial -> malformed data -> complete stream instead of reporting success', () => {
    const seen: any[] = [];
    let completed = false;
    expect(() => consumeAgentSseText(
      'data: {"id":"partial"}\n\ndata: {not-json}\n\ndata: '+JSON.stringify(transportComplete())+'\n\n',
      { onAdkEvent: e => seen.push(e), onComplete: () => { completed = true; }, onError: () => {} },
    )).toThrow(/protocol/i);
    expect(seen.map(e => e.id)).toEqual(['partial']);
    expect(completed).toBe(false);
  });
});

describe('checker corrective current-turn user de-dup', () => {
  it('keeps two legitimate historical user turns with identical text', () => {
    const local: any[] = [
      { id: 'u1', role: 'user', content: [{ type: 'text', text: 'OK' }] },
      { id: 'a1', role: 'assistant', content: [{ type: 'text', text: 'Một' }] },
      { id: 'u2', role: 'user', content: [{ type: 'text', text: 'OK' }] },
    ];
    const merged = mergeStreamingMessages(local, [], { optimisticUserMessageId: 'u2' });
    expect(merged.filter(m => m.role === 'user').map(m => m.id)).toEqual(['u1', 'u2']);
  });

  it('deduplicates only the server echo corresponding to the current optimistic turn', () => {
    const local: any[] = [
      { id: 'old', role: 'user', content: [{ type: 'text', text: 'Tiếp tục' }] },
      { id: 'current', role: 'user', content: [{ type: 'text', text: 'Tiếp tục' }] },
    ];
    const streamed: any[] = [
      { id: 'server-current', role: 'user', content: [{ type: 'text', text: 'Tiếp tục' }] },
      { id: 'assistant', role: 'assistant', content: [{ type: 'text', text: 'Được' }] },
    ];
    const merged = mergeStreamingMessages(local, streamed, { optimisticUserMessageId: 'current' });
    expect(merged.filter(m => m.role === 'user').map(m => m.id)).toEqual(['old', 'current']);
  });

  it('does not remove a historical same-text turn when deduplicating the current optimistic echo', () => {
    const local: any[] = [
      { id: 'historical', role: 'user', content: [{ type: 'text', text: 'OK' }] },
      { id: 'historical-a', role: 'assistant', content: [{ type: 'text', text: 'Trước' }] },
      { id: 'current', role: 'user', content: [{ type: 'text', text: 'OK' }] },
    ];
    const streamed: any[] = [{ id: 'server-current', role: 'user', content: [{ type: 'text', text: 'OK' }] }];
    const merged = mergeStreamingMessages(local, streamed, { optimisticUserMessageId: 'current' });
    expect(merged.filter(m => m.role === 'user').map(m => m.id)).toEqual(['historical', 'current']);
  });

  it('still replaces assistant partial/final snapshots by stable id', () => {
    const local: any[] = [{ id: 'a1', role: 'assistant', content: [{ type: 'text', text: 'Xin' }] }];
    const final: any[] = [{ id: 'a1', role: 'assistant', content: [{ type: 'text', text: 'Xin chào' }] }];
    const merged = mergeStreamingMessages(local, final, {});
    expect(merged).toHaveLength(1);
    expect(merged[0].content[0].text).toBe('Xin chào');
  });
});
