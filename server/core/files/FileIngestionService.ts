import { MAX_FILE_BYTES, sanitizeDisplayFilename, validateFilenameForMimeType } from './filePolicy';
import { FileDomainError, UserFileService, type UserFileRecord } from './UserFileService';

export interface FileIngestionRequest {
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  declaredSizeBytes?: unknown;
  signal?: AbortSignal;
  clientMetadata?: unknown;
}

export class FileIngestionService {
  constructor(private readonly files: Pick<UserFileService, 'store'>) {}

  async ingest(verifiedOwnerId: string, request: FileIngestionRequest): Promise<UserFileRecord> {
    if (!verifiedOwnerId) throw new FileDomainError('UNAUTHORIZED', 401, 'Verified owner is required.');
    if (!Buffer.isBuffer(request.bytes)) throw new FileDomainError('INVALID_FILE_BODY', 400, 'Binary file body is required.');
    if (request.bytes.length === 0) throw new FileDomainError('EMPTY_FILE', 400, 'File is empty.');
    const declaredSizeBytes = request.declaredSizeBytes === undefined
      ? undefined
      : typeof request.declaredSizeBytes === 'number'
        ? request.declaredSizeBytes
        : typeof request.declaredSizeBytes === 'string' && /^\d+$/.test(request.declaredSizeBytes)
          ? Number(request.declaredSizeBytes)
          : NaN;
    if (declaredSizeBytes !== undefined && (!Number.isSafeInteger(declaredSizeBytes) || declaredSizeBytes < 0)) {
      throw new FileDomainError('MALFORMED_UPLOAD', 400, 'Declared file size is invalid.');
    }
    if ((declaredSizeBytes ?? 0) > MAX_FILE_BYTES || request.bytes.length > MAX_FILE_BYTES) {
      throw new FileDomainError('FILE_TOO_LARGE', 413, 'File exceeds the application size limit.');
    }

    const originalName = sanitizeDisplayFilename(request.originalName);
    try {
      validateFilenameForMimeType(originalName, request.mimeType);
    } catch (error: any) {
      throw new FileDomainError(error.code || 'INVALID_FILE', error.status || 400, error.message);
    }

    return this.files.store(verifiedOwnerId, {
      originalName,
      mimeType: request.mimeType,
      bytes: request.bytes,
      signal: request.signal,
    });
  }
}
