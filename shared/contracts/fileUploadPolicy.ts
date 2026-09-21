/** Public application upload policy. Security enforcement remains server-side. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const SUPPORTED_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/markdown',
] as const;

export type SupportedFileMimeType = typeof SUPPORTED_FILE_MIME_TYPES[number];

export const SUPPORTED_FILE_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.txt', '.md', '.markdown',
] as const;

export const SUPPORTED_FILE_ACCEPT = [
  ...SUPPORTED_FILE_MIME_TYPES,
  ...SUPPORTED_FILE_EXTENSIONS,
].join(',');
