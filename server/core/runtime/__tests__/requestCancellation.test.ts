import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { bindRequestCancellation } from '../requestCancellation';

class Source extends EventEmitter {
  aborted = false;
  writableEnded = false;
}

describe('request disconnect cancellation', () => {
  it('aborts execution when the browser aborts the request', () => {
    const req = new Source();
    const res = new Source();
    const bound = bindRequestCancellation(req, res);
    req.aborted = true;
    req.emit('aborted');
    expect(bound.signal.aborted).toBe(true);
  });

  it('aborts on premature response close and detaches listeners', () => {
    const req = new Source();
    const res = new Source();
    const bound = bindRequestCancellation(req, res);
    res.emit('close');
    expect(bound.signal.aborted).toBe(true);
    expect(req.listenerCount('aborted')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });

  it('normal response finish cleans listeners without cancellation', () => {
    const req = new Source();
    const res = new Source();
    const bound = bindRequestCancellation(req, res);
    res.writableEnded = true;
    res.emit('finish');
    expect(bound.signal.aborted).toBe(false);
    expect(req.listenerCount('aborted')).toBe(0);
  });
});
