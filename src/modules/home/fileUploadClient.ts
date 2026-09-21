import { authFetch } from '../../lib/authFetch';
import {
  MAX_FILE_BYTES,
  SUPPORTED_FILE_EXTENSIONS,
  SUPPORTED_FILE_MIME_TYPES,
} from '../../../shared/contracts/fileUploadPolicy';

export type PublicUserFile = {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt?: string;
};

export type UploadProblem = { code: string; message: string };

export type UploadState = {
  phase: 'idle' | 'selected' | 'uploading' | 'success' | 'error';
  selectedFile: File | null;
  requestId: number | null;
  uploadedFile: PublicUserFile | null;
  error: UploadProblem | null;
};

export type UploadAction =
  | { type: 'select'; file: File }
  | { type: 'clear' }
  | { type: 'begin'; requestId: number }
  | { type: 'success'; requestId: number; file: PublicUserFile }
  | { type: 'failure'; requestId: number; error: UploadProblem };

export function createInitialUploadState(): UploadState {
  return { phase: 'idle', selectedFile: null, requestId: null, uploadedFile: null, error: null };
}

export function fileUploadReducer(state: UploadState, action: UploadAction): UploadState {
  if (action.type === 'select') {
    return { phase: 'selected', selectedFile: action.file, requestId: null, uploadedFile: null, error: precheckFile(action.file) };
  }
  if (action.type === 'clear') return createInitialUploadState();
  if (action.type === 'begin') {
    if (state.phase === 'uploading' || !state.selectedFile || precheckFile(state.selectedFile)) return state;
    return { ...state, phase: 'uploading', requestId: action.requestId, error: null };
  }
  if (state.requestId !== action.requestId) return state;
  if (action.type === 'success') return { ...state, phase: 'success', requestId: null, uploadedFile: action.file, error: null };
  return { ...state, phase: 'error', requestId: null, uploadedFile: null, error: action.error };
}

function extensionOf(name: string): string {
  const clean = name.trim().toLowerCase();
  const index = clean.lastIndexOf('.');
  return index >= 0 ? clean.slice(index) : '';
}

export function precheckFile(file: File): UploadProblem | null {
  if (file.size === 0) return { code: 'EMPTY_FILE', message: mapUploadErrorCode('EMPTY_FILE') };
  if (file.size > MAX_FILE_BYTES) return { code: 'FILE_TOO_LARGE', message: mapUploadErrorCode('FILE_TOO_LARGE') };
  const extension = extensionOf(file.name);
  const extensionSupported = (SUPPORTED_FILE_EXTENSIONS as readonly string[]).includes(extension);
  const mimeSupported = !file.type || (SUPPORTED_FILE_MIME_TYPES as readonly string[]).includes(file.type.toLowerCase());
  if (!extensionSupported || !mimeSupported) return { code: 'UNSUPPORTED_TYPE', message: mapUploadErrorCode('UNSUPPORTED_TYPE') };
  return null;
}

export function mapUploadErrorCode(code: string): string {
  switch (code) {
    case 'FILE_TOO_LARGE': return 'Tệp vượt quá giới hạn 20 MiB.';
    case 'UNSUPPORTED_TYPE':
    case 'UNSUPPORTED_FILE_TYPE':
    case 'FILE_TYPE_MISMATCH': return 'Định dạng tệp chưa được hỗ trợ.';
    case 'EMPTY_FILE':
    case 'EMPTY_FILE_NOT_ALLOWED':
    case 'INVALID_FILE_BODY':
    case 'MALFORMED_UPLOAD': return 'Tệp tải lên không hợp lệ hoặc rỗng.';
    case 'UNAUTHORIZED':
    case 'AUTH_REQUIRED': return 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.';
    case 'FILE_STORAGE_WRITE_FAILED':
    case 'BLOB_WRITE_FAILED':
    case 'ORPHAN_CLEANUP_FAILED':
    case 'STORAGE_FAILURE': return 'Không thể lưu tệp lúc này. Vui lòng thử lại.';
    case 'FILE_METADATA_WRITE_FAILED':
    case 'METADATA_WRITE_FAILED':
    case 'METADATA_PERSISTENCE_FAILED': return 'Không thể hoàn tất lưu thông tin tệp. Vui lòng thử lại.';
    case 'NETWORK_ERROR': return 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.';
    default: return 'Không thể tải tệp lên. Vui lòng thử lại.';
  }
}

function publicFileFromResponse(value: unknown): PublicUserFile {
  const file = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof file.fileId !== 'string' || typeof file.mimeType !== 'string' || typeof file.sizeBytes !== 'number') {
    throw { code: 'INVALID_SERVER_RESPONSE', message: mapUploadErrorCode('INVALID_SERVER_RESPONSE') } satisfies UploadProblem;
  }
  const name = typeof file.originalName === 'string' ? file.originalName : typeof file.name === 'string' ? file.name : 'file';
  return {
    fileId: file.fileId,
    name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    status: typeof file.status === 'string' ? file.status : 'ready',
    ...(typeof file.createdAt === 'string' ? { createdAt: file.createdAt } : {}),
  };
}

export async function uploadUserFile(file: File, signal?: AbortSignal): Promise<PublicUserFile> {
  const problem = precheckFile(file);
  if (problem) throw problem;
  try {
    const response = await authFetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
      signal,
    });
    const payload = await response.json().catch(() => ({})) as { file?: unknown; code?: string };
    if (!response.ok) {
      const code = typeof payload.code === 'string' ? payload.code : response.status === 401 ? 'UNAUTHORIZED' : 'FILE_UPLOAD_FAILED';
      throw { code, message: mapUploadErrorCode(code) } satisfies UploadProblem;
    }
    return publicFileFromResponse(payload.file);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw { code: 'ABORTED', message: '' } satisfies UploadProblem;
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) throw error;
    throw { code: 'NETWORK_ERROR', message: mapUploadErrorCode('NETWORK_ERROR') } satisfies UploadProblem;
  }
}
