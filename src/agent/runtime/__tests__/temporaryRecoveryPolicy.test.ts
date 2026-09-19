import { describe, expect, it } from 'vitest';
import { reconstructPendingConfirmations } from '../temporaryRecoveryPolicy';

describe('temporary/recovery HITL policy', () => {
  it('reconstructs a pending persisted confirmation only with stable evidence', () => {
    const pending = reconstructPendingConfirmations([{ id:'e1', role:'assistant', content:[{ type:'tool-call', toolCallId:'c1', toolName:'adk_request_confirmation', args:{ hint:'Confirm?', payload:{x:1} } }] } as any]);
    expect(pending).toEqual([{ id:'c1', toolCallId:'c1', name:'adk_request_confirmation', args:{ hint:'Confirm?', payload:{x:1} }, confirmation:{ hint:'Confirm?', payload:{x:1} } }]);
  });

  it('does not reconstruct completed confirmation as pending', () => {
    const pending = reconstructPendingConfirmations([
      { id:'e1', role:'assistant', content:[{ type:'tool-call', toolCallId:'c1', toolName:'adk_request_confirmation', args:{ hint:'Confirm?' } }] },
      { id:'e2', role:'user', content:[{ type:'tool-response', toolCallId:'c1', toolName:'adk_request_confirmation', result:{confirmed:true} }] },
    ] as any);
    expect(pending).toEqual([]);
  });

  it('never makes ambiguous calls actionable', () => {
    expect(reconstructPendingConfirmations([{ id:'e1', role:'assistant', content:[{ type:'tool-call', toolName:'adk_request_confirmation', args:{} }] } as any])).toEqual([]);
    expect(reconstructPendingConfirmations([{ id:'e2', role:'assistant', content:[{ type:'tool-call', toolCallId:'c2', toolName:'some_tool', args:{} }] } as any])).toEqual([]);
  });
});
