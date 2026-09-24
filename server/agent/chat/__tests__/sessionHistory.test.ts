import { describe, expect, it } from 'vitest';
import { sessionTranscript } from '../sessionHistory';

describe('canonical persisted transcript reconstruction', () => {
  it('preserves repeated user turns by event identity/order', () => {
    const result = sessionTranscript([
      { id:'u1', author:'user', content:{ role:'user', parts:[{text:'OK'}] } },
      { id:'u2', author:'user', content:{ role:'user', parts:[{text:'OK'}] } },
    ]);
    expect(result.map(x => [x.id, x.role, x.content[0].text])).toEqual([['u1','user','OK'],['u2','user','OK']]);
  });

  it('does not reconstruct partial events as completed history', () => {
    expect(sessionTranscript([{ id:'p1', partial:true, content:{ role:'model', parts:[{text:'partial'}] } }])).toEqual([]);
  });

  it('preserves successful tool result/source semantics as assistant history', () => {
    const result = sessionTranscript([
      { id:'t1', content:{ role:'model', parts:[{functionCall:{id:'c1',name:'search',args:{q:'x'}}}] }, timestamp: 1_700_000_000 },
      { id:'t2', content:{ role:'user', parts:[{functionResponse:{id:'c1',name:'search',response:{success:true,result:{answer:'A',sources:[{title:'Nguồn',url:'https://example.com'}]}}}}] }, timestamp: 1_700_000_001 },
    ]);
    expect(result[0].content[0]).toMatchObject({type:'tool-call',toolCallId:'c1',toolName:'search'});
    expect(result[1].role).toBe('assistant');
    expect(result[1].content[0]).toMatchObject({type:'tool-response',toolCallId:'c1',toolName:'search'});
    expect(result[1].content[1]).toEqual({ type:'sources', sources:[{title:'Nguồn',url:'https://example.com'}] });
    expect(result[0].timestamp).toBe(1_700_000_000_000);
  });

  it('reconstructs failed tool results as errors instead of successful responses', () => {
    const result = sessionTranscript([
      { id:'t2', content:{ role:'user', parts:[{functionResponse:{id:'c1',name:'task_update',response:{success:false,errorCode:'CONFIRMATION_REJECTED',error:'safe'}}}] } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
    expect(result[0].content[0]).toMatchObject({ type:'error', toolCallId:'c1', error:'CONFIRMATION_REJECTED' });
  });

  it('does not invent a new timestamp when durable event timestamp is absent', () => {
    expect(sessionTranscript([{ id:'u1', author:'user', content:{ role:'user', parts:[{text:'OK'}] } }])[0].timestamp).toBeUndefined();
  });
});
