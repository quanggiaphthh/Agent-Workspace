import { describe, expect, it, vi } from 'vitest';
import { DocumentProcessorClient, DocumentProcessorError } from '../documentProcessorClient';

const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
const inspection = {
  sourceSha256: 'a'.repeat(64),
  profile: 'generic-direct-alignment-spike',
  safeToMutate: true,
  packagePolicy: 'NORMAL',
  paragraphs: [],
  paragraphsTruncated: false,
  diagnostics: [],
};

describe('private document processor IAM boundary', () => {
  it('sends an audience-bound Google ID token alongside the unchanged application token', async () => {
    const audience = 'https://processor-abc-uc.a.run.app';
    const idTokenProvider = vi.fn(async () => 'google-signed-test-token');
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(inspection), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    const client = new DocumentProcessorClient({
      baseUrl: `${audience}/`, sharedToken: 's'.repeat(32), nodeEnv: 'production',
      idTokenProvider, fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.inspect(docx);

    expect(idTokenProvider).toHaveBeenCalledExactlyOnceWith(audience);
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.get('X-Serverless-Authorization')).toBe('Bearer google-signed-test-token');
    expect(headers.get('Authorization')).toBe(`Bearer ${'s'.repeat(32)}`);
    expect(JSON.stringify(await client.inspect(docx))).not.toContain('google-signed-test-token');
  });

  it('fails closed before fetch when ADC cannot supply an ID token and does not leak the cause', async () => {
    const fetchImpl = vi.fn();
    const client = new DocumentProcessorClient({
      baseUrl: 'https://processor.example.run.app/', sharedToken: 's'.repeat(32), nodeEnv: 'production',
      idTokenProvider: async () => { throw new Error('private credential at /tmp/sensitive.json'); },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.inspect(docx)).rejects.toMatchObject({
      code: 'PROCESSOR_AUTH_FAILED',
      message: 'The private document processor could not be authenticated.',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an empty or malformed ID token before sending any remote request', async () => {
    const fetchImpl = vi.fn();
    for (const token of ['', 'token\r\nInjected: value']) {
      const client = new DocumentProcessorClient({
        baseUrl: 'https://processor.example.run.app/', sharedToken: 's'.repeat(32), nodeEnv: 'production',
        idTokenProvider: async () => token, fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      await expect(client.inspect(docx)).rejects.toMatchObject({ code: 'PROCESSOR_AUTH_FAILED' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps local loopback processing available without ADC while remote development still requires IAM', async () => {
    const provider = vi.fn(async () => { throw new Error('ADC unavailable'); });
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(inspection), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    const local = new DocumentProcessorClient({
      baseUrl: 'http://127.0.0.1:5080/', sharedToken: 's'.repeat(32), nodeEnv: 'development',
      idTokenProvider: provider, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await local.inspect(docx);
    expect(provider).not.toHaveBeenCalled();
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).has('X-Serverless-Authorization')).toBe(false);
    const remote = new DocumentProcessorClient({
      baseUrl: 'https://processor.example.run.app/', sharedToken: 's'.repeat(32), nodeEnv: 'development',
      idTokenProvider: provider, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(remote.inspect(docx)).rejects.toMatchObject({ code: 'PROCESSOR_AUTH_FAILED' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('bounds token acquisition by the processor deadline', async () => {
    const fetchImpl = vi.fn();
    const client = new DocumentProcessorClient({
      baseUrl: 'https://processor.example.run.app/', sharedToken: 's'.repeat(32), nodeEnv: 'production',
      timeoutMs: 10, idTokenProvider: async () => await new Promise<string>(() => {}),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.inspect(docx)).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('cancels before network dispatch when the caller aborts ID token acquisition', async () => {
    const fetchImpl = vi.fn();
    const controller = new AbortController();
    const client = new DocumentProcessorClient({
      baseUrl: 'https://processor.example.run.app/', sharedToken: 's'.repeat(32), nodeEnv: 'production',
      idTokenProvider: async () => await new Promise<string>(() => {}),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const pending = client.inspect(docx, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'PROCESSING_CANCELLED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the validated origin as audience without accepting URL credentials or paths', () => {
    for (const baseUrl of ['https://user:pass@processor.example.run.app/', 'https://processor.example.run.app/other']) {
      expect(() => new DocumentProcessorClient({
        baseUrl, sharedToken: 's'.repeat(32), nodeEnv: 'production',
      })).toThrowError(/processor URL is invalid/);
    }
  });

  it('maps an unknown remote authentication error to a safe processor code', async () => {
    const client = new DocumentProcessorClient({
      baseUrl: 'https://processor.example.run.app/', sharedToken: 's'.repeat(32), nodeEnv: 'production',
      idTokenProvider: async () => 'google-signed-test-token',
      fetchImpl: async () => new Response(JSON.stringify({ code: 'INTERNAL_PATH', error: '/srv/private/credential' }), { status: 403 }),
    });
    try {
      await client.inspect(docx);
      throw new Error('Expected authentication rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentProcessorError);
      expect(error).toMatchObject({ code: 'PROCESSOR_AUTH_FAILED' });
      expect(String(error)).not.toContain('/srv/private/credential');
    }
  });
});
