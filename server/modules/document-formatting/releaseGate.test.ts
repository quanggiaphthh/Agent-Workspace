import { describe, expect, it } from 'vitest';
import { isDocumentFormattingReleaseReady } from './releaseGate';

const validEnv = { DOCUMENT_FORMATTING_V1_RELEASE_APPROVED: 'true' } as NodeJS.ProcessEnv;

describe('Document Formatting V1 release gate', () => {
  it('is closed without explicit release approval', () => {
    expect(isDocumentFormattingReleaseReady({ ...validEnv, DOCUMENT_FORMATTING_V1_RELEASE_APPROVED: 'false' })).toBe(false);
  });

  it('opens only with explicit approval, without remote processor credentials', () => {
    expect(isDocumentFormattingReleaseReady(validEnv)).toBe(true);
    expect(isDocumentFormattingReleaseReady({ DOCUMENT_FORMATTING_V1_RELEASE_APPROVED: 'TRUE' })).toBe(false);
    expect(isDocumentFormattingReleaseReady({})).toBe(false);
  });
});
