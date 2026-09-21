import { describe, expect, it } from 'vitest';
import { FileIngestionService } from '../FileIngestionService';
import { UserFileService, type BinaryStore, type MetadataStore } from '../UserFileService';

class BinaryMemoryStore implements BinaryStore {
  readonly data = new Map<string, Buffer>();
  async put(object: string, bytes: Buffer) { this.data.set(object, bytes); }
  async readBounded(object: string, maxBytes: number) { const b=this.data.get(object); if(!b) throw Error('missing'); if(b.length>maxBytes) throw Object.assign(Error('limit'),{code:'READ_LIMIT_EXCEEDED'}); return b; }
  async exists(object: string) { return this.data.has(object); }
  async delete(object: string) { this.data.delete(object); }
}

class MetadataMemoryStore implements MetadataStore {
  readonly data = new Map<string, any>();
  async create(value: any) { this.data.set(value.fileId, value); }
  async get(fileId: string) { return this.data.get(fileId) || null; }
  async delete(fileId: string) { this.data.delete(fileId); }
}

function service() {
  const binaries = new BinaryMemoryStore();
  const metadata = new MetadataMemoryStore();
  return { binaries, metadata, ingestion: new FileIngestionService(new UserFileService(binaries, metadata)) };
}

const pdf = Buffer.from('%PDF-1.7\nhello');

describe('GĐ4 Lượt 2 secure file ingestion gateway', () => {
  it('stores a supported file with server-derived authoritative metadata', async () => {
    const { ingestion } = service();
    const file = await ingestion.ingest('verified-owner', {
      originalName: '  Báo cáo quý III.PDF  ',
      mimeType: 'application/pdf',
      bytes: pdf,
      declaredSizeBytes: 1,
      clientMetadata: { ownerId: 'attacker', fileId: 'chosen-id', storageObject: '../../escape' },
    });

    expect(file.ownerId).toBe('verified-owner');
    expect(file.fileId).not.toBe('chosen-id');
    expect(file.originalName).toBe('Báo cáo quý III.PDF');
    expect(file.sizeBytes).toBe(pdf.length);
    expect(file.mimeType).toBe('application/pdf');
  });

  it.each([
    ['unsupported type', 'text/html', 'evil.html', Buffer.from('<html/>'), 'UNSUPPORTED_FILE_TYPE'],
    ['extension mismatch', 'application/pdf', 'photo.png', pdf, 'FILE_EXTENSION_MISMATCH'],
    ['empty file', 'text/plain', 'empty.txt', Buffer.alloc(0), 'EMPTY_FILE'],
  ])('rejects %s before a canonical record is created', async (_label, mimeType, originalName, bytes, code) => {
    const { binaries, metadata, ingestion } = service();
    await expect(ingestion.ingest('owner', { originalName, mimeType, bytes })).rejects.toMatchObject({ code });
    expect(binaries.data.size).toBe(0);
    expect(metadata.data.size).toBe(0);
  });

  it.each(['../../escape.pdf', '..\\..\\escape.pdf', '/var/tmp/escape.pdf', 'C:\\temp\\escape.pdf'])('keeps hostile filename %s out of storage identity', async (originalName) => {
    const { binaries, ingestion } = service();
    await ingestion.ingest('owner', { originalName, mimeType: 'application/pdf', bytes: pdf });
    const key = [...binaries.data.keys()][0];
    expect(key).toMatch(/^users\/owner\/files\/[0-9a-f-]+\/blob$/);
    expect(key).not.toContain('escape.pdf');
  });

  it('rejects an oversized declared size before storage', async () => {
    const { binaries, metadata, ingestion } = service();
    await expect(ingestion.ingest('owner', {
      originalName: 'large.pdf', mimeType: 'application/pdf', bytes: pdf, declaredSizeBytes: 20 * 1024 * 1024 + 1,
    })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(binaries.data.size).toBe(0);
    expect(metadata.data.size).toBe(0);
  });

  it('rejects actual bytes over the limit even when declared metadata is small', async () => {
    const { binaries, metadata, ingestion } = service();
    await expect(ingestion.ingest('owner', {
      originalName: 'actual-large.txt', mimeType: 'text/plain', bytes: Buffer.alloc(20 * 1024 * 1024 + 1, 0x41), declaredSizeBytes: 1,
    })).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(binaries.data.size).toBe(0);
    expect(metadata.data.size).toBe(0);
  });

  it('normalizes an overlong display filename without losing its validated extension', async () => {
    const { ingestion } = service();
    const file = await ingestion.ingest('owner', {
      originalName: `${'x'.repeat(300)}.pdf`, mimeType: 'application/pdf', bytes: pdf,
    });
    expect(file.originalName).toHaveLength(255);
    expect(file.originalName).toMatch(/\.pdf$/);
  });

  it('assigns distinct canonical records to duplicate display filenames', async () => {
    const { binaries, ingestion } = service();
    const first = await ingestion.ingest('owner', { originalName: 'same.pdf', mimeType: 'application/pdf', bytes: pdf });
    const second = await ingestion.ingest('owner', { originalName: 'same.pdf', mimeType: 'application/pdf', bytes: pdf });
    expect(first.fileId).not.toBe(second.fileId);
    expect(binaries.data.size).toBe(2);
  });

  it('fails closed when no verified owner is supplied', async () => {
    const { binaries, metadata, ingestion } = service();
    await expect(ingestion.ingest('', { originalName: 'report.pdf', mimeType: 'application/pdf', bytes: pdf }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
    expect(binaries.data.size).toBe(0);
    expect(metadata.data.size).toBe(0);
  });

  it('rejects a declared PDF whose bytes do not match its signature before storage', async () => {
    const { binaries, metadata, ingestion } = service();
    await expect(ingestion.ingest('owner', { originalName: 'forged.pdf', mimeType: 'application/pdf', bytes: Buffer.from('not a PDF') }))
      .rejects.toMatchObject({ code: 'FILE_TYPE_MISMATCH' });
    expect(binaries.data.size).toBe(0);
    expect(metadata.data.size).toBe(0);
  });

  it('rejects a multipart content type because raw binary is the only canonical transport', async () => {
    const { binaries, metadata, ingestion } = service();
    await expect(ingestion.ingest('owner', { originalName: 'report.pdf', mimeType: 'multipart/form-data', bytes: pdf }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
    expect(binaries.data.size).toBe(0);
    expect(metadata.data.size).toBe(0);
  });

  it('classifies an empty payload as EMPTY_FILE even when its display name is unusable', async () => {
    const { ingestion } = service();
    await expect(ingestion.ingest('owner', { originalName: 'file', mimeType: 'text/plain', bytes: Buffer.alloc(0) }))
      .rejects.toMatchObject({ code: 'EMPTY_FILE' });
  });
});
