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
  it('preserves tool call and result structure', () => {
    const result = sessionTranscript([
      { id:'t1', content:{ role:'model', parts:[{functionCall:{id:'c1',name:'search',args:{q:'x'}}}] } },
      { id:'t2', content:{ role:'user', parts:[{functionResponse:{id:'c1',name:'search',response:{ok:true}}}] } },
    ]);
    expect(result[0].content[0]).toMatchObject({type:'tool-call',toolCallId:'c1',toolName:'search'});
    expect(result[1].content[0]).toMatchObject({type:'tool-response',toolCallId:'c1',toolName:'search'});
  });
});
