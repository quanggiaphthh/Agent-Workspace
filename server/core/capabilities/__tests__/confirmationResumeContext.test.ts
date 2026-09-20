import { describe, expect, it } from 'vitest';
import { evaluateConfirmationRecord, type ConfirmationExpectation } from '../CapabilityConfirmationPolicy';

const base = {
  userId: 'owner', capabilityId: 'test.mutation', inputHash: 'hash-x', expiresAtMs: Date.now() + 60_000,
  consumedAt: null, decision: 'pending' as const, source: 'agent' as const,
  sessionId: 'session-12345678', toolCallId: 'call-12345678', logicalExecutionId: 'agent:session-12345678:call-12345678', temporaryMode: false,
};
const expected: ConfirmationExpectation = {
  userId: base.userId, capabilityId: base.capabilityId, inputHash: base.inputHash,
  source: 'agent', sessionId: base.sessionId, toolCallId: base.toolCallId, logicalExecutionId: base.logicalExecutionId,
};

describe('GĐ3 Lượt 4 confirmation resume binding policy', () => {
  it('accepts the exact original Agent execution identity', () => expect(evaluateConfirmationRecord(base, expected)).toEqual({ ok: true }));
  it('fails closed for changed user', () => expect(evaluateConfirmationRecord(base, { ...expected, userId: 'other' })).toMatchObject({ ok:false, errorCode:'CONFIRMATION_USER_MISMATCH' }));
  it('fails closed for changed capability', () => expect(evaluateConfirmationRecord(base, { ...expected, capabilityId: 'test.other' })).toMatchObject({ ok:false, errorCode:'CONFIRMATION_CAPABILITY_MISMATCH' }));
  it('fails closed for changed input hash', () => expect(evaluateConfirmationRecord(base, { ...expected, inputHash: 'hash-y' })).toMatchObject({ ok:false, errorCode:'CONFIRMATION_INPUT_MISMATCH' }));
  it('fails closed for changed session', () => expect(evaluateConfirmationRecord(base, { ...expected, sessionId: 'session-other' })).toMatchObject({ ok:false, errorCode:'CONFIRMATION_EXECUTION_MISMATCH' }));
  it('fails closed for changed functionCallId', () => expect(evaluateConfirmationRecord(base, { ...expected, toolCallId: 'call-other' })).toMatchObject({ ok:false, errorCode:'CONFIRMATION_EXECUTION_MISMATCH' }));
  it('fails closed for changed logical identity', () => expect(evaluateConfirmationRecord(base, { ...expected, logicalExecutionId: 'agent:other' })).toMatchObject({ ok:false, errorCode:'CONFIRMATION_EXECUTION_MISMATCH' }));
  it('rejects an expired challenge', () => expect(evaluateConfirmationRecord({ ...base, expiresAtMs: Date.now()-1 }, expected)).toMatchObject({ ok:false, errorCode:'CONFIRMATION_EXPIRED' }));
  it('rejects an already-approved replay', () => expect(evaluateConfirmationRecord({ ...base, consumedAt: new Date().toISOString(), decision:'approved' }, expected)).toMatchObject({ ok:false, errorCode:'CONFIRMATION_REPLAY' }));
  it('rejects a terminal rejection replay', () => expect(evaluateConfirmationRecord({ ...base, consumedAt: new Date().toISOString(), decision:'rejected' }, expected)).toMatchObject({ ok:false, errorCode:'CONFIRMATION_REPLAY' }));
  it('rejects a cancelled pending execution', () => expect(evaluateConfirmationRecord({ ...base, decision:'cancelled' }, expected)).toMatchObject({ ok:false, errorCode:'CONFIRMATION_CANCELLED' }));
  it('records temporary-mode binding without changing conversation persistence authority', () => expect(evaluateConfirmationRecord({ ...base, temporaryMode:true }, expected)).toEqual({ ok:true }));
});
