/** Public application upload policy. Security enforcement remains server-side. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const;

export const SUPPORTED_FILE_MIME_TYPES = [
  'application/pdf',
  DOCX_MIME_TYPE,
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/markdown',
] as const;

export type SupportedFileMimeType = typeof SUPPORTED_FILE_MIME_TYPES[number];

export const SUPPORTED_FILE_EXTENSIONS = [
  '.pdf', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.txt', '.md', '.markdown',
] as const;

export const SUPPORTED_FILE_ACCEPT = [
  ...SUPPORTED_FILE_MIME_TYPES,
  ...SUPPORTED_FILE_EXTENSIONS,
].join(',');

/** The conversational attachment path does not yet route DOCX through the document processor. */
export const SUPPORTED_CHAT_ATTACHMENT_ACCEPT = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/markdown',
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.txt', '.md', '.markdown',
].join(',');
