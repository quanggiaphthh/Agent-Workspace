import { describe, expect, it } from 'vitest';
import {
  clearRequestScopedDocument,
  currentRequestScopedDocument,
  runWithRequestScopedDocument,
  type RequestScopedDocument,
} from '../requestScopedDocument';

function scope(name: string): RequestScopedDocument {
  return {
    sourceBytes: Buffer.from(name),
    sourceSha256: name.padEnd(64, '0').slice(0, 64),
    originalName: `${name}.docx`,
  };
}

describe('request-scoped DOCX state', () => {
  it('isolates concurrent request bytes and results', async () => {
    const first = scope('first-document');
    const second = scope('second-document');
    const barrier = () => new Promise<void>(resolve => setTimeout(resolve, 5));

    const results = await Promise.all([
      runWithRequestScopedDocument(first, async () => {
        await barrier();
        const current = currentRequestScopedDocument();
        current!.inspection = { paragraphs: [{ text: 'first-private-text' }] } as any;
        return { bytes: current?.sourceBytes.toString(), text: current?.inspection?.paragraphs[0]?.text };
      }),
      runWithRequestScopedDocument(second, async () => {
        await barrier();
        const current = currentRequestScopedDocument();
        current!.inspection = { paragraphs: [{ text: 'second-private-text' }] } as any;
        return { bytes: current?.sourceBytes.toString(), text: current?.inspection?.paragraphs[0]?.text };
      }),
    ]);

    expect(results).toEqual([
      { bytes: 'first-document', text: 'first-private-text' },
      { bytes: 'second-document', text: 'second-private-text' },
    ]);
    expect(currentRequestScopedDocument()).toBeUndefined();
  });

  it('zeroes source and output buffers and drops transient inspection data on cleanup', () => {
    const value = scope('private-doc');
    const sourceBuffer = value.sourceBytes;
    const outputBuffer = Buffer.from('temporary-output');
    value.output = { bytes: outputBuffer, sha256: 'b'.repeat(64) };
    value.inspection = { paragraphs: [{ text: 'private paragraph' }] } as any;

    clearRequestScopedDocument(value);

    expect(sourceBuffer.every(byte => byte === 0)).toBe(true);
    expect(outputBuffer.every(byte => byte === 0)).toBe(true);
    expect(value.sourceBytes).toHaveLength(0);
    expect(value.output).toBeUndefined();
    expect(value.inspection).toBeUndefined();
  });
});
