import { MAX_FILE_BYTES, SUPPORTED_FILE_MIME_TYPES, type SupportedFileMimeType } from '../../../shared/contracts/fileUploadPolicy';

export { MAX_FILE_BYTES, SUPPORTED_FILE_MIME_TYPES };
export type { SupportedFileMimeType } from '../../../shared/contracts/fileUploadPolicy';
export const SUPPORTED_FILE_MIME_SET = new Set<string>(SUPPORTED_FILE_MIME_TYPES);

const FILE_EXTENSIONS_BY_MIME: Record<SupportedFileMimeType, readonly string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md', '.markdown'],
};

export function sanitizeDisplayFilename(value: string): string {
  const base = value.replace(/\\/g, '/').split('/').pop() || 'file';
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!clean) return 'file';
  if (clean.length <= 255) return clean;
  const extensionStart = clean.lastIndexOf('.');
  const extension = extensionStart > 0 ? clean.slice(extensionStart) : '';
  return extension.length > 0 && extension.length < 255
    ? `${clean.slice(0, 255 - extension.length)}${extension}`
    : clean.slice(0, 255);
}

export function validateFilenameForMimeType(filename: string, mimeType: string): void {
  if (!SUPPORTED_FILE_MIME_SET.has(mimeType)) {
    throw Object.assign(new Error('Unsupported file type.'), { code: 'UNSUPPORTED_FILE_TYPE', status: 415 });
  }
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (!FILE_EXTENSIONS_BY_MIME[mimeType as SupportedFileMimeType].includes(extension)) {
    throw Object.assign(new Error('File extension does not match the declared type.'), { code: 'FILE_EXTENSION_MISMATCH', status: 415 });
  }
}

export function validateFileBytes(mimeType: string, bytes: Buffer): void {
  if (!SUPPORTED_FILE_MIME_SET.has(mimeType)) throw Object.assign(new Error('Unsupported file type.'), { code: 'UNSUPPORTED_FILE_TYPE', status: 415 });
  if (bytes.length === 0) throw Object.assign(new Error('File is empty.'), { code: 'EMPTY_FILE', status: 400 });
  if (bytes.length > MAX_FILE_BYTES) throw Object.assign(new Error('File exceeds the application size limit.'), { code: 'FILE_TOO_LARGE', status: 413 });
  const starts = (...v:number[]) => v.every((x,i)=>bytes[i]===x);
  let valid = true;
  if (mimeType === 'application/pdf') valid = bytes.subarray(0,5).toString('ascii') === '%PDF-';
  else if (mimeType === 'image/jpeg') valid = starts(0xff,0xd8,0xff);
  else if (mimeType === 'image/png') valid = starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a);
  else if (mimeType === 'image/webp') valid = bytes.length >= 12 && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP';
  else valid = !bytes.includes(0) && Buffer.from(bytes.toString('utf8'),'utf8').equals(bytes);
  if (!valid) throw Object.assign(new Error('File content does not match the declared type.'), { code: 'FILE_TYPE_MISMATCH', status: 415 });
}
export function buildSafeFileAuditMetadata(input: { fileId?:string; mimeType:string; sizeBytes:number }) {
  return { ...(input.fileId ? { fileId: input.fileId } : {}), mimeType: input.mimeType, sizeBytes: input.sizeBytes };
}
