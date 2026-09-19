import { describe, expect, it } from 'vitest';
import { decideSessionHydration } from '../sessionHistoryPolicy';

describe('persistent session hydration authority', () => {
  it('server history wins over any local transcript cache', () => {
    const result = decideSessionHydration({ sessionId: 's1', status: 200, serverMessages: [{ id: 'server' }], replacementSessionId: 'new' });
    expect(result).toEqual({ kind: 'hydrate', sessionId: 's1', messages: [{ id: 'server' }] });
  });
  it('404 deterministically creates a clean replacement identity', () => {
    expect(decideSessionHydration({ sessionId: 'gone', status: 404, replacementSessionId: 'new' })).toEqual({ kind: 'missing', replacementSessionId: 'new' });
  });
  it('persistence failure is not treated as missing', () => {
    expect(decideSessionHydration({ sessionId: 's1', status: 500, replacementSessionId: 'new' }).kind).toBe('error');
  });
});
