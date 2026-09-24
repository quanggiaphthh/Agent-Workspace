import React, { useEffect, useReducer, useRef } from 'react';
import { Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { MAX_FILE_BYTES, SUPPORTED_FILE_ACCEPT } from '../../../shared/contracts/fileUploadPolicy';
import { createInitialUploadState, fileUploadReducer, precheckFile, uploadUserFile, type UploadProblem } from './fileUploadClient';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function FileUploadCard() {
  const [state, dispatch] = useReducer(fileUploadReducer, createInitialUploadState());
  const abortRef = useRef<AbortController | null>(null);
  const requestCounter = useRef(0);

  const invalidateActive = () => {
    requestCounter.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  };

  useEffect(() => () => invalidateActive(), []);

  const selectFile = (file: File | undefined) => {
    invalidateActive();
    if (file) dispatch({ type: 'select', file });
    else dispatch({ type: 'clear' });
  };

  const clear = () => {
    invalidateActive();
    dispatch({ type: 'clear' });
  };

  const upload = async () => {
    if (!state.selectedFile || state.phase === 'uploading' || precheckFile(state.selectedFile)) return;
    const requestId = ++requestCounter.current;
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'begin', requestId });
    try {
      const file = await uploadUserFile(state.selectedFile, controller.signal);
      dispatch({ type: 'success', requestId, file });
    } catch (error) {
      const problem = error as UploadProblem;
      if (problem?.code !== 'ABORTED') dispatch({ type: 'failure', requestId, error: problem });
    } finally {
      if (requestCounter.current === requestId) abortRef.current = null;
    }
  };

  return (
    <Card className="border-neutral-200 bg-white">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-neutral-100 flex items-center justify-center text-neutral-800"><Upload className="h-4 w-4" /></div>
          <div>
            <CardTitle>Tải tài liệu</CardTitle>
            <CardDescription>PDF, JPEG, PNG, WebP, TXT, Markdown · tối đa {MAX_FILE_BYTES / (1024 * 1024)} MiB</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <input aria-label="Chọn tệp để tải lên" type="file" accept={SUPPORTED_FILE_ACCEPT} onChange={event => selectFile(event.currentTarget.files?.[0])} className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-neutral-200 disabled:opacity-60" />

        {state.selectedFile && (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <div className="font-medium text-neutral-800 break-all">{state.selectedFile.name}</div>
            <div className="text-xs text-neutral-500 mt-1">{state.selectedFile.type || 'Loại chưa xác định'} · {formatBytes(state.selectedFile.size)}</div>
          </div>
        )}

        {state.error && <div role="alert" className="flex items-start gap-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{state.error.message}</span></div>}
        {state.phase === 'uploading' && <div aria-live="polite" className="text-sm text-neutral-600">Đang tải tệp lên…</div>}
        {state.phase === 'success' && state.uploadedFile && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" />Tải lên thành công</div>
            <div className="mt-1 break-all">{state.uploadedFile.name}</div>
            <div className="text-xs mt-1">{state.uploadedFile.mimeType} · {formatBytes(state.uploadedFile.sizeBytes)}</div>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={upload} disabled={!state.selectedFile || state.phase === 'uploading' || !!(state.selectedFile && precheckFile(state.selectedFile))}>
            {state.phase === 'uploading' ? 'Đang tải…' : state.phase === 'error' ? 'Thử lại' : 'Tải lên'}
          </Button>
          {(state.selectedFile || state.uploadedFile || state.error) && <Button variant="outline" onClick={clear}><X className="h-4 w-4 mr-1" />Xóa chọn</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
