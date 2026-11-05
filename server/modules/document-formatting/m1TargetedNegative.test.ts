import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZipReader, ZipWriter, TextReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { MAX_FILE_BYTES } from '../../../shared/contracts/fileUploadPolicy';
import { createDocumentFormattingCapabilities } from './registration';
import { inspect, applyAdministrativePageLayout } from './docxPackage.mjs';
import { processDocxInWorker } from './docxWorkerClient';

const fixture = () => readFileSync(resolve('server/modules/document-formatting/fixtures/24-vietnamese-rich.docx'));
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function xmlOf(bytes: Buffer) {
  const zip = new ZipReader(new Uint8ArrayReader(bytes), { strictness: 'strict' });
  try {
    const parts = await zip.getEntries();
    const doc = parts.find(part => part.filename === 'word/document.xml');
    if (!doc) throw new Error('DOCX document.xml missing');
    return Buffer.from(await doc.getData(new Uint8ArrayWriter(), { checkCrc32: true })).toString('utf8');
  } finally { await zip.close(); }
}

describe('M1 targeted negative evidence: DOCX worker boundaries', () => {
  it.each(['inspect', 'applyAlignment', 'applyTopMargin', 'applyAdministrativePageLayout'] as const)(
    '%s rejects a fake DOCX without returning any mutation', async operation => {
      const payload = Buffer.from('PK not a valid ZIP/DOCX');
      const before = Buffer.from(payload);
      await expect(processDocxInWorker(operation, payload)).rejects.toMatchObject({ code: 'MALFORMED_DOCX' });
      expect(payload).toEqual(before);
    },
  );

  it('rejects a truncated DOCX for every worker operation without modifying the input', async () => {
    const source = fixture().subarray(0, 30);
    const before = Buffer.from(source);
    for (const operation of ['inspect', 'applyAlignment', 'applyTopMargin', 'applyAdministrativePageLayout'] as const) {
      await expect(processDocxInWorker(operation, source)).rejects.toMatchObject({ code: expect.any(String) });
      expect(source).toEqual(before);
    }
  });

  it('rejects highly compressible ZIP-bomb input before processing document content', async () => {
    const zip = new ZipWriter(new Uint8ArrayWriter(), { zip64: false });
    await zip.add('word/document.xml', new TextReader('A'.repeat(2_000_000)), { level: 9 });
    const payload = Buffer.from(await zip.close());
    expect(payload.length).toBeLessThan(100_000);
    await expect(inspect(payload)).rejects.toMatchObject({ code: 'ARCHIVE_EXPANSION_LIMIT' });
  });

  it('enforces maximum input bytes and invalid worker deadlines', async () => {
    await expect(processDocxInWorker('inspect', Buffer.alloc(MAX_FILE_BYTES + 1))).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' });
    await expect(processDocxInWorker('inspect', fixture(), {}, { deadlineMs: 0 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(processDocxInWorker('inspect', fixture(), {}, { deadlineMs: 45_001 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('enforces a real worker timeout and does not allow a concurrent operation to bypass the busy guard', async () => {
    const bytes = fixture();
    const first = processDocxInWorker('inspect', bytes, {}, { deadlineMs: 1 });
    await expect(processDocxInWorker('inspect', bytes)).rejects.toMatchObject({ code: 'PROCESSOR_BUSY' });
    await expect(first).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' });
  });

  it('rejects absent verified user identity for every document capability', async () => {
    for (const capability of createDocumentFormattingCapabilities()) {
      await expect(capability.execute({} as never, {} as never)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
  });

  it('requires a request-scoped DOCX rather than accepting bytes or owner claims from a caller', async () => {
    for (const capability of createDocumentFormattingCapabilities()) {
      await expect(capability.execute({ sourceSha256: 'a'.repeat(64), sizeBytes: 99 } as never, { user: { id: 'unbound-owner' } } as never))
        .rejects.toMatchObject({ code: 'DOCUMENT_REQUEST_CONTEXT_REQUIRED' });
    }
  });

  it('does not invent administrative content when applying the limited formatting profile', async () => {
    const bytes = fixture();
    const inputHash = digest(bytes);
    const beforeXml = await xmlOf(bytes);
    const output = await applyAdministrativePageLayout(bytes);
    const afterXml = await xmlOf(output.bytes);
    const texts = (xml: string) => Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu), match => match[1]);
    expect(texts(beforeXml).length).toBeGreaterThan(0);
    expect(texts(afterXml)).toEqual(texts(beforeXml));
    expect(digest(bytes)).toBe(inputHash);
    expect(output.sourceSha256).toBe(inputHash);
    expect(output.revalidated).toBe(true);
  });
});
