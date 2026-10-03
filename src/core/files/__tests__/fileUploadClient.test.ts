import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authFetchMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
}));

vi.mock('../../../lib/authFetch', () => ({ authFetch: authFetchMock }));

import {
  createInitialUploadState,
  fileUploadReducer,
  mapUploadErrorCode,
  precheckFile,
  uploadUserFile,
} from '../fileUploadClient';
import { MAX_FILE_BYTES, SUPPORTED_FILE_ACCEPT } from '../../../../shared/contracts/fileUploadPolicy';

function makeFile(name: string, type: string, size = 3) {
  return new File([new Uint8Array(size)], name, { type });
}

describe('GĐ4 Lượt 2B end-user upload client', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    authFetchMock.mockImplementation(async () => {
      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  it('accepts supported PDF, image, TXT and Markdown selections', () => {
    for (const file of [
      makeFile('a.pdf', 'application/pdf'), makeFile('a.png', 'image/png'),
      makeFile('a.jpg', 'image/jpeg'), makeFile('a.webp', 'image/webp'),
      makeFile('a.txt', 'text/plain'), makeFile('a.md', 'text/markdown'),
    ]) expect(precheckFile(file)).toBeNull();
    expect(SUPPORTED_FILE_ACCEPT).toContain('.pdf');
  });

  it('rejects empty, oversized and obvious unsupported files before request', () => {
    expect(precheckFile(makeFile('empty.pdf', 'application/pdf', 0))?.code).toBe('EMPTY_FILE');
    expect(precheckFile(makeFile('huge.pdf', 'application/pdf', MAX_FILE_BYTES + 1))?.code).toBe('FILE_TOO_LARGE');
    expect(precheckFile(makeFile('script.exe', 'application/octet-stream'))?.code).toBe('UNSUPPORTED_TYPE');
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it('posts the raw File to canonical /api/files through authFetch with only upload headers', async () => {
    const file = makeFile('Tài liệu 01.pdf', 'application/pdf');
    authFetchMock.mockResolvedValue(new Response(JSON.stringify({ file: { fileId:'f1', originalName:'Tài liệu 01.pdf', mimeType:'application/pdf', sizeBytes:3, status:'ready', createdAt:'2026-09-21T00:00:00.000Z', storageObject:'users/u/files/f1/blob', ownerId:'u' } }), { status:201, headers:{'content-type':'application/json'} }));
    const result = await uploadUserFile(file);
    expect(authFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = authFetchMock.mock.calls[0];
    expect(url).toBe('/api/files');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(file);
    expect(init.headers).toEqual({ 'Content-Type':'application/pdf', 'X-File-Name': encodeURIComponent(file.name) });
    expect(JSON.stringify(init)).not.toMatch(/ownerId|fileId|storageObject|bucket|storagePath/);
    expect(result).toEqual({ fileId:'f1', name:'Tài liệu 01.pdf', mimeType:'application/pdf', sizeBytes:3, status:'ready', createdAt:'2026-09-21T00:00:00.000Z' });
    expect(JSON.stringify(result)).not.toMatch(/storageObject|ownerId|users\/u/);
  });

  it('maps canonical server errors without exposing raw provider messages', async () => {
    for (const [code, expected] of [
      ['FILE_TOO_LARGE','Tệp vượt quá giới hạn 20 MiB.'],
      ['UNSUPPORTED_FILE_TYPE','Định dạng tệp chưa được hỗ trợ.'],
      ['INVALID_FILE_BODY','Tệp tải lên không hợp lệ hoặc rỗng.'],
      ['UNAUTHORIZED','Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.'],
      ['FILE_STORAGE_WRITE_FAILED','Không thể lưu tệp lúc này. Vui lòng thử lại.'],
      ['FILE_METADATA_WRITE_FAILED','Không thể hoàn tất lưu thông tin tệp. Vui lòng thử lại.'],
    ] as const) expect(mapUploadErrorCode(code)).toBe(expected);
    expect(mapUploadErrorCode('SOME_FIREBASE_INTERNAL')).toBe('Không thể tải tệp lên. Vui lòng thử lại.');
  });

  it('turns network failure into a safe recoverable error', async () => {
    authFetchMock.mockImplementationOnce(async () => {
      throw new Error('bucket secret internals');
    });
    await expect(uploadUserFile(makeFile('a.pdf','application/pdf'))).rejects.toMatchObject({ code:'NETWORK_ERROR' });
  });

  it('tracks selected/uploading/success and prevents a second begin while pending', () => {
    const file = makeFile('a.pdf','application/pdf');
    let state = fileUploadReducer(createInitialUploadState(), { type:'select', file });
    state = fileUploadReducer(state, { type:'begin', requestId:1 });
    expect(state.phase).toBe('uploading');
    expect(fileUploadReducer(state, { type:'begin', requestId:2 })).toBe(state);
    state = fileUploadReducer(state, { type:'success', requestId:1, file:{ fileId:'f1',name:'a.pdf',mimeType:'application/pdf',sizeBytes:3,status:'ready' } });
    expect(state.phase).toBe('success');
  });


  it('allows retry after a server failure for the same valid selection', () => {
    const file = makeFile('a.pdf','application/pdf');
    let state = fileUploadReducer(createInitialUploadState(), { type:'select', file });
    state = fileUploadReducer(state, { type:'begin', requestId:1 });
    state = fileUploadReducer(state, { type:'failure', requestId:1, error:{code:'NETWORK_ERROR',message:'safe'} });
    const retried = fileUploadReducer(state, { type:'begin', requestId:2 });
    expect(retried.phase).toBe('uploading');
    expect(retried.requestId).toBe(2);
  });

  it('clear/new selection invalidates stale success/error responses', () => {
    const a = makeFile('a.pdf','application/pdf');
    const b = makeFile('b.pdf','application/pdf');
    let state = fileUploadReducer(createInitialUploadState(), { type:'select', file:a });
    state = fileUploadReducer(state, { type:'begin', requestId:7 });
    state = fileUploadReducer(state, { type:'select', file:b });
    const afterLate = fileUploadReducer(state, { type:'success', requestId:7, file:{fileId:'old',name:'a.pdf',mimeType:'application/pdf',sizeBytes:3,status:'ready'} });
    expect(afterLate).toBe(state);
    expect(afterLate.selectedFile?.name).toBe('b.pdf');
    expect(fileUploadReducer(afterLate, { type:'clear' }).phase).toBe('idle');
  });

  it('aborted request is distinguishable and does not become a generic network failure', async () => {
    const controller = new AbortController();
    authFetchMock.mockImplementationOnce(async (...args: any[]) => {
      const init = args[1];
      if (!init || !init.signal) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError')));
      });
    });
    const pending = uploadUserFile(makeFile('a.pdf','application/pdf'), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code:'ABORTED' });
  });
});
