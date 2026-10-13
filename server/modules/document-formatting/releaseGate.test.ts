import { describe, expect, it } from 'vitest';
import { isDocumentFormattingReleaseReady } from './releaseGate';

const validEnv = {
  NODE_ENV: 'test',
  DOCUMENT_FORMATTING_V1_RELEASE_APPROVED: 'true',
  DOCUMENT_PROCESSOR_URL: 'http://127.0.0.1',
  DOCUMENT_PROCESSOR_SHARED_TOKEN: 'test-shared-token-with-at-least-32-bytes',
} as NodeJS.ProcessEnv;

describe('Document Formatting V1 release gate', () => {
  it('is closed without explicit release approval', () => {
    expect(isDocumentFormattingReleaseReady({ ...validEnv, DOCUMENT_FORMATTING_V1_RELEASE_APPROVED: 'false' })).toBe(false);
  });

  it('opens only with explicit approval and valid processor credentials', () => {
    expect(isDocumentFormattingReleaseReady(validEnv)).toBe(true);
    expect(isDocumentFormattingReleaseReady({ ...validEnv, DOCUMENT_PROCESSOR_SHARED_TOKEN: 'short' })).toBe(false);
    expect(isDocumentFormattingReleaseReady({ ...validEnv, DOCUMENT_PROCESSOR_URL: 'http://processor.internal' })).toBe(false);
  });

  it('requires HTTPS in production and rejects URLs carrying credentials or extra paths', () => {
    expect(isDocumentFormattingReleaseReady({ ...validEnv, NODE_ENV: 'production', DOCUMENT_PROCESSOR_URL: 'http://127.0.0.1' })).toBe(false);
    expect(isDocumentFormattingReleaseReady({ ...validEnv, DOCUMENT_PROCESSOR_URL: 'https://user:pass@processor.example' })).toBe(false);
    expect(isDocumentFormattingReleaseReady({ ...validEnv, DOCUMENT_PROCESSOR_URL: 'https://processor.example/v1' })).toBe(false);
    expect(isDocumentFormattingReleaseReady({ ...validEnv, NODE_ENV: 'production', DOCUMENT_PROCESSOR_URL: 'https://processor.example' })).toBe(true);
  });
});
