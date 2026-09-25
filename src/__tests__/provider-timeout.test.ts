import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
  GoogleAdapter,
  providerRequestTimeoutMs,
} from '../../server/core/ai/AIProviderManager';

describe('AI provider request timeout policy', () => {
  const originalTimeout = process.env.AI_PROVIDER_TIMEOUT_MS;

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalTimeout === undefined) delete process.env.AI_PROVIDER_TIMEOUT_MS;
    else process.env.AI_PROVIDER_TIMEOUT_MS = originalTimeout;
  });

  it('uses a bounded default and rejects invalid timeout configuration', () => {
    expect(providerRequestTimeoutMs(undefined)).toBe(DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS);
    expect(providerRequestTimeoutMs('999')).toBe(DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS);
    expect(providerRequestTimeoutMs('120001')).toBe(DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS);
    expect(providerRequestTimeoutMs('15000')).toBe(15000);
  });

  it('aborts a hung provider request deterministically', async () => {
    vi.useFakeTimers();
    process.env.AI_PROVIDER_TIMEOUT_MS = '1000';

    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      const rejectOnAbort = () => reject(signal.reason ?? Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (signal.aborted) rejectOnAbort();
      else signal.addEventListener('abort', rejectOnAbort, { once: true });
    })));

    const request = new GoogleAdapter().listModels('test-key');
    const rejection = expect(request).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      status: 504,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
  });
});
