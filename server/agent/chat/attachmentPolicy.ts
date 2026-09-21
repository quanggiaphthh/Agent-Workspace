export const MAX_ATTACHMENTS_PER_TURN = 4;
export const MAX_MODEL_INPUT_BYTES_PER_FILE = 20 * 1024 * 1024;
export const MAX_MODEL_INPUT_BYTES_AGGREGATE = 20 * 1024 * 1024;
export const MODEL_INPUT_MIME_TYPES = [
  'application/pdf','image/jpeg','image/png','image/webp','text/plain','text/markdown',
] as const;
export const MODEL_INPUT_MIME_SET = new Set<string>(MODEL_INPUT_MIME_TYPES);
