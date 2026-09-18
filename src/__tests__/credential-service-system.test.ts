import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/lib/firebaseAdmin', () => ({
  adminFirestore: {},
}));

import { CredentialService } from '../../server/core/ai/CredentialService';

const previousGeminiKey = process.env.GEMINI_API_KEY;
afterEach(() => {
  if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousGeminiKey;
});

describe('system Gemini credential', () => {
  it('uses GEMINI_API_KEY only for Google and never invents a system credential', () => {
    process.env.GEMINI_API_KEY = 'server-secret';
    const google = CredentialService.getSystemCredential('google');
    expect(google?.id).toBe('system');
    expect(google?.providerId).toBe('google');
    expect(google?.key).toBe('server-secret');
    expect(CredentialService.getSystemCredential('openai')).toBeNull();
    delete process.env.GEMINI_API_KEY;
    expect(CredentialService.getSystemCredential('google')).toBeNull();
  });
});
