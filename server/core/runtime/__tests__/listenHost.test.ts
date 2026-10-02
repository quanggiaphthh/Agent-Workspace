import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveListenHost } from '../listenHost';

describe('server listen host', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['development', '127.0.0.1'],
    ['test', '127.0.0.1'],
    ['production', '0.0.0.0'],
  ])('binds NODE_ENV=%s to %s', (nodeEnv, host) => {
    vi.stubEnv('NODE_ENV', nodeEnv);

    expect(resolveListenHost()).toBe(host);
  });
});
