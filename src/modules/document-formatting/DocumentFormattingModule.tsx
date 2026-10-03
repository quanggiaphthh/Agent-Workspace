import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  LoaderCircle,
  ShieldCheck,
  ShieldX,
  Upload,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { authFetch } from '../../lib/authFetch';
import { clientCapabilityRegistry } from '../../core/capabilities/capabilityRegistry';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../shared/contracts/fileUploadPolicy';
import { mapUploadErrorCode, precheckFile, uploadUserFile, type PublicUserFile } from '../home/fileUploadClient';

const ALIGNMENTS = [
  { value: 'LEFT', label: 'Căn trái' },
  { value: 'CENTER', label: 'Căn giữa' },
  { value: 'RIGHT', label: 'Căn phải' },
  { value: 'JUSTIFY', label: 'Căn đều hai lề' },
] as const;

type Alignment = typeof ALIGNMENTS[number]['value'];
type BusyAction = 'upload' | 'inspect' | 'prepare' | 'apply' | 'download' | null;

interface DocumentInspection {
  sourceSha256: string;
  profile: 'generic-direct-alignment-spike';
  safeToMutate: boolean;
  packagePolicy: 'NORMAL' | 'GUARDED' | 'AUDIT_ONLY' | 'PROHIBITED';
  paragraphs: Array<{
    paragraphId: string;
    text: string;
    directAlignment: Alignment | null;
    issueId: string | null;
  }>;
  paragraphsTruncated: boolean;
  diagnostics: Array<{ code: string; message: string }>;
}

interface InspectOutput {
  sourceFileId: string;
  inspection: DocumentInspection;
}

interface ApplyInput {
  fileId: string;
  sourceSha256: string;
  paragraphId: string;
  expectedBefore: Alignment;
  desiredAfter: Alignment;
}

interface ApplyOutput {
  success: true;
  sourceFileId: string;
  outputFile: {
    fileId: string;
    originalName: string;
    mimeType: typeof DOCX_MIME_TYPE;
    sizeBytes: number;
    status: 'ready';
    createdAt: string | null;
  };
  changeManifest: {
    property: 'paragraph.alignment';
    paragraphId: string;
    before: Alignment;
    after: Alignment;
    sourceSha256: string;
    outputSha256: string;
    appliedAt: string;
    summary: string;
  };
  verification: {
    reopened: true;
    revalidated: true;
    sourceUnchanged: true;
    outputInspectionPassed: true;
  };
}

interface PendingApply {
  input: ApplyInput;
  confirmationId: string;
  confirmationExpiresAt: string;
  idempotencyKey: string;
}

function alignmentLabel(value: Alignment | null): string {
  return value ? ALIGNMENTS.find(option => option.value === value)?.label || value : 'Chưa đặt trực tiếp';
}

function mapCapabilityError(code?: string, fallback?: string): string {
  switch (code) {
    case 'UNAUTHORIZED':
    case 'AUTH_REQUIRED': return 'Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại rồi thử tiếp.';
    case 'PERMISSION_DENIED':
    case 'CAPABILITY_FORBIDDEN': return 'Tài khoản hiện tại chưa có quyền đọc và ghi tài liệu.';
    case 'MODULE_DISABLED': return 'Phân hệ Định dạng văn bản đang tắt trong cấu hình dùng chung.';
    case 'PROCESSOR_NOT_CONFIGURED': return 'Bộ xử lý DOCX chưa được cấu hình trên máy chủ.';
    case 'PROCESSOR_UNAVAILABLE': return 'Không kết nối được bộ xử lý DOCX riêng. Tệp gốc vẫn được giữ nguyên.';
    case 'PROCESSOR_AUTH_FAILED': return 'Máy chủ không xác thực được với bộ xử lý DOCX riêng.';
    case 'PACKAGE_NOT_MUTABLE':
    case 'UNSAFE_ARCHIVE':
    case 'ARCHIVE_EXPANSION_LIMIT':
    case 'ARCHIVE_ENTRY_LIMIT':
    case 'ARCHIVE_ENTRY_TOO_LARGE':
    case 'UNSAFE_ARCHIVE_PATH':
    case 'UNSAFE_XML': return 'Gói DOCX không đạt kiểm tra an toàn để chỉnh sửa. Bạn vẫn có thể giữ bản gốc.';
    case 'STALE_DOCUMENT': return 'Tệp nguồn đã thay đổi sau khi kiểm tra. Hãy kiểm tra lại trước khi áp dụng.';
    case 'CONFIRMATION_EXPIRED': return 'Yêu cầu xác nhận đã hết hạn. Hãy tạo yêu cầu mới sau khi xem lại thao tác.';
    case 'CONFIRMATION_REPLAY': return 'Yêu cầu xác nhận đã được sử dụng. Không thể gửi lại thao tác này.';
    case 'FILE_TYPE_MISMATCH': return 'Tệp nhận được không phải tài liệu DOCX được yêu cầu.';
    case 'FILE_INTEGRITY_FAILED': return 'Kích thước bản tải xuống không khớp với thông tin tệp đã lưu.';
    case 'EXECUTION_RECONCILIATION_REQUIRED':
    case 'EXECUTION_IN_PROGRESS': return 'Máy chủ chưa xác nhận được kết quả thao tác. Đừng gửi lại ngay; hãy kiểm tra trạng thái trước.';
    case 'PROCESSING_TIMEOUT': return 'Bộ xử lý DOCX đã hết thời gian chờ. Hãy thử kiểm tra lại tệp.';
    case 'NETWORK_ERROR': return 'Không kết nối được máy chủ. Hãy kiểm tra kết nối rồi thử lại.';
    case 'ABORTED': return 'Đã hủy thao tác.';
    default: return fallback || 'Không thể hoàn tất thao tác DOCX. Bản gốc không bị ghi đè.';
  }
}

function fileSelectionError(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.docx')) return 'Chỉ hỗ trợ tài liệu Word .docx.';
  if (file.type && file.type.toLowerCase() !== DOCX_MIME_TYPE) return 'Loại tệp không khớp với tài liệu Word .docx.';
  const problem = precheckFile(file);
  return problem?.message || null;
}

function idempotencyKey(): string {
  if (typeof crypto.randomUUID !== 'function') throw new Error('SECURE_RANDOM_UNAVAILABLE');
  return crypto.randomUUID();
}

async function saveDownload(file: ApplyOutput['outputFile'], signal: AbortSignal): Promise<void> {
  const response = await authFetch(`/api/files/${encodeURIComponent(file.fileId)}/content`, { method: 'GET', signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { code?: string };
    const code = typeof payload.code === 'string' ? payload.code : response.status === 401 ? 'UNAUTHORIZED' : 'FILE_DOWNLOAD_FAILED';
    throw Object.assign(new Error(mapCapabilityError(code)), { code });
  }

  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== DOCX_MIME_TYPE) throw Object.assign(new Error('The downloaded file is not a DOCX.'), { code: 'FILE_TYPE_MISMATCH' });
  const blob = await response.blob();
  if (blob.size !== file.sizeBytes || blob.size > MAX_FILE_BYTES) {
    throw Object.assign(new Error('The downloaded DOCX did not match its saved metadata.'), { code: 'FILE_INTEGRITY_FAILED' });
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.originalName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MiB`;
}

function safeMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code || '');
    if (['EMPTY_FILE', 'FILE_TOO_LARGE', 'UNSUPPORTED_TYPE', 'UNSUPPORTED_FILE_TYPE'].includes(code)) return mapUploadErrorCode(code);
    return mapCapabilityError(code, fallback);
  }
  return fallback;
}

export function DocumentFormattingModule() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<PublicUserFile | null>(null);
  const [inspection, setInspection] = useState<DocumentInspection | null>(null);
  const [selectedParagraphId, setSelectedParagraphId] = useState<string>('');
  const [desiredAlignment, setDesiredAlignment] = useState<Alignment>('LEFT');
  const [pendingApply, setPendingApply] = useState<PendingApply | null>(null);
  const [output, setOutput] = useState<ApplyOutput | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => () => activeRequestRef.current?.abort(), []);

  const selectedParagraph = useMemo(
    () => inspection?.paragraphs.find(paragraph => paragraph.paragraphId === selectedParagraphId) || null,
    [inspection, selectedParagraphId],
  );
  const canMutate = inspection?.safeToMutate === true && inspection.packagePolicy === 'NORMAL';
  const selectedFileProblem = selectedFile ? fileSelectionError(selectedFile) : null;

  const startRequest = () => {
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    activeRequestRef.current = controller;
    return { controller, requestId };
  };

  const requestIsCurrent = (requestId: number, signal: AbortSignal) => requestIdRef.current === requestId && !signal.aborted;

  const clearDocument = () => {
    requestIdRef.current += 1;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setSelectedFile(null);
    setSelectionError(null);
    setSourceFile(null);
    setInspection(null);
    setSelectedParagraphId('');
    setDesiredAlignment('LEFT');
    setPendingApply(null);
    setOutput(null);
    setBusy(null);
    setError(null);
    setDownloadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const inspectFile = async (fileId: string, requestId: number, signal: AbortSignal) => {
    setBusy('inspect');
    const result = await clientCapabilityRegistry.execute<{ fileId: string }, InspectOutput>(
      'document.inspect',
      { fileId },
      { signal },
    );
    if (!requestIsCurrent(requestId, signal)) return;
    if (!result.success || !result.result?.inspection) {
      setError(mapCapabilityError(result.errorCode, result.error));
      return;
    }
    setInspection(result.result.inspection);
    setSelectedParagraphId('');
    setPendingApply(null);
    setOutput(null);
    setError(null);
  };

  const uploadAndInspect = async () => {
    if (!selectedFile || selectedFileProblem || busy) return;
    setError(null);
    setInspection(null);
    setPendingApply(null);
    setOutput(null);
    const { controller, requestId } = startRequest();
    const signal = controller.signal;

    try {
      let canonicalFile = sourceFile;
      if (!canonicalFile) {
        setBusy('upload');
        const uploadFile = selectedFile.type
          ? selectedFile
          : new File([selectedFile], selectedFile.name, { type: DOCX_MIME_TYPE, lastModified: selectedFile.lastModified });
        canonicalFile = await uploadUserFile(uploadFile, signal);
        if (!requestIsCurrent(requestId, signal)) return;
        if (canonicalFile.mimeType !== DOCX_MIME_TYPE || canonicalFile.status !== 'ready') {
          throw Object.assign(new Error('The uploaded DOCX metadata could not be verified.'), { code: 'INVALID_SERVER_RESPONSE' });
        }
        setSourceFile(canonicalFile);
      }
      await inspectFile(canonicalFile.fileId, requestId, signal);
    } catch (caught) {
      if (requestIsCurrent(requestId, signal)) setError(safeMessage(caught, 'Không thể tải lên hoặc kiểm tra tài liệu.'));
    } finally {
      if (requestIdRef.current === requestId) {
        setBusy(null);
        activeRequestRef.current = null;
      }
    }
  };

  const prepareApply = async () => {
    if (!sourceFile || !inspection || !selectedParagraph?.directAlignment || !canMutate ||
        desiredAlignment === selectedParagraph.directAlignment || busy || pendingApply) return;
    setError(null);
    const { controller, requestId } = startRequest();
    const input: ApplyInput = {
      fileId: sourceFile.fileId,
      sourceSha256: inspection.sourceSha256,
      paragraphId: selectedParagraph.paragraphId,
      expectedBefore: selectedParagraph.directAlignment,
      desiredAfter: desiredAlignment,
    };
    let operationKey: string;
    try {
      operationKey = idempotencyKey();
    } catch {
      setError('Không thể tạo mã thao tác an toàn trên trình duyệt này.');
      setBusy(null);
      return;
    }

    setBusy('prepare');
    try {
      const result = await clientCapabilityRegistry.execute<ApplyInput, ApplyOutput>(
        'document.applyAlignment',
        input,
        { idempotencyKey: operationKey, signal: controller.signal },
      );
      if (!requestIsCurrent(requestId, controller.signal)) return;
      if (result.requiresConfirmation && result.confirmationId && result.confirmationExpiresAt) {
        setPendingApply({ input, confirmationId: result.confirmationId, confirmationExpiresAt: result.confirmationExpiresAt, idempotencyKey: operationKey });
        return;
      }
      setError(mapCapabilityError(result.errorCode, result.error || 'Máy chủ không cấp được yêu cầu xác nhận.'));
    } finally {
      if (requestIdRef.current === requestId) {
        setBusy(null);
        activeRequestRef.current = null;
      }
    }
  };

  const confirmApply = async () => {
    if (!pendingApply || busy) return;
    if (Date.parse(pendingApply.confirmationExpiresAt) <= Date.now()) {
      setPendingApply(null);
      setError(mapCapabilityError('CONFIRMATION_EXPIRED'));
      return;
    }
    setError(null);
    const { controller, requestId } = startRequest();
    setBusy('apply');
    try {
      const result = await clientCapabilityRegistry.execute<ApplyInput, ApplyOutput>(
        'document.applyAlignment',
        pendingApply.input,
        {
          confirmationId: pendingApply.confirmationId,
          idempotencyKey: pendingApply.idempotencyKey,
          signal: controller.signal,
        },
      );
      if (!requestIsCurrent(requestId, controller.signal)) return;
      if (!result.success || !result.result?.outputFile) {
        setPendingApply(null);
        setError(mapCapabilityError(result.errorCode, result.error));
        if (result.errorCode === 'STALE_DOCUMENT') await inspectFile(pendingApply.input.fileId, requestId, controller.signal);
        return;
      }
      setOutput(result.result);
      setPendingApply(null);
      setError(null);
    } finally {
      if (requestIdRef.current === requestId) {
        setBusy(null);
        activeRequestRef.current = null;
      }
    }
  };

  const downloadOutput = async () => {
    if (!output?.outputFile || busy) return;
    const { controller, requestId } = startRequest();
    setBusy('download');
    setDownloadError(null);
    try {
      await saveDownload(output.outputFile, controller.signal);
    } catch (caught) {
      if (requestIsCurrent(requestId, controller.signal)) setDownloadError(safeMessage(caught, 'Không thể tải bản DOCX đã tạo.'));
    } finally {
      if (requestIdRef.current === requestId) {
        setBusy(null);
        activeRequestRef.current = null;
      }
    }
  };

  const selectParagraph = (paragraphId: string) => {
    setSelectedParagraphId(paragraphId);
    const paragraph = inspection?.paragraphs.find(item => item.paragraphId === paragraphId);
    if (paragraph?.directAlignment) {
      setDesiredAlignment(ALIGNMENTS.find(option => option.value !== paragraph.directAlignment)?.value || 'LEFT');
    }
    setPendingApply(null);
    setOutput(null);
    setError(null);
  };

  const disabled = busy !== null;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-1 pb-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
          <FileText className="h-4 w-4" aria-hidden="true" />
          Công cụ tài liệu
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Định dạng văn bản Word</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-neutral-600">
          Kiểm tra an toàn một tệp DOCX và tạo bản sao mới khi bạn xác nhận đổi căn lề trực tiếp của một đoạn. Tệp gốc không bị ghi đè; công cụ không dùng Gemini và không đưa ra kết luận về tuân thủ pháp lý.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Chọn tài liệu DOCX</CardTitle>
          <CardDescription>Tệp được lưu trong kho tài liệu cá nhân trước khi kiểm tra. Giới hạn {formatSize(MAX_FILE_BYTES)}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label htmlFor="document-formatting-file" className="block text-xs font-medium text-neutral-700">Tài liệu Word (.docx)</label>
          <input
            ref={fileInputRef}
            id="document-formatting-file"
            aria-label="Chọn tài liệu Word DOCX"
            type="file"
            accept={`${DOCX_MIME_TYPE},.docx`}
            disabled={disabled || !!pendingApply}
            onChange={event => {
              const file = event.currentTarget.files?.[0] || null;
              setSelectedFile(file);
              setSelectionError(file ? fileSelectionError(file) : null);
              setSourceFile(null);
              setInspection(null);
              setSelectedParagraphId('');
              setPendingApply(null);
              setOutput(null);
              setError(null);
              setDownloadError(null);
            }}
            className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-neutral-200 disabled:opacity-60"
          />

          {selectedFile && (
            <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="break-all text-sm font-medium text-neutral-800">{selectedFile.name}</div>
                <div className="mt-0.5 text-xs text-neutral-500">{formatSize(selectedFile.size)}</div>
              </div>
              {sourceFile && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />Đã lưu tệp nguồn</span>}
            </div>
          )}

          {selectionError && <p role="alert" className="text-sm text-rose-700">{selectionError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={uploadAndInspect} disabled={!selectedFile || !!selectedFileProblem || disabled || !!pendingApply}>
              {busy === 'upload' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang tải lên…</>
                : busy === 'inspect' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang kiểm tra…</>
                  : sourceFile ? 'Kiểm tra lại tệp' : <><Upload className="h-4 w-4" />Tải lên và kiểm tra</>}
            </Button>
            {(selectedFile || sourceFile) && <Button type="button" variant="outline" onClick={clearDocument} disabled={disabled}>Xóa lựa chọn</Button>}
          </div>
          {busy === 'upload' && <p role="status" aria-live="polite" className="text-xs text-neutral-500">Đang lưu DOCX vào kho tệp cá nhân…</p>}
          {busy === 'inspect' && <p role="status" aria-live="polite" className="text-xs text-neutral-500">Đang kiểm tra cấu trúc DOCX bằng bộ xử lý riêng…</p>}
        </CardContent>
      </Card>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {inspection && (
        <section className="space-y-4" aria-labelledby="document-inspection-title">
          <div className={`flex items-start gap-3 rounded-lg border p-4 ${canMutate ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
            {canMutate ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /> : <ShieldX className="mt-0.5 h-5 w-5 shrink-0" />}
            <div>
              <h2 id="document-inspection-title" className="text-sm font-semibold">{canMutate ? 'Đã kiểm tra; có thể chọn căn lề' : 'Chỉ kiểm tra; không cho phép chỉnh sửa'}</h2>
              <p className="mt-1 text-xs leading-relaxed">
                Chính sách gói: <strong>{inspection.packagePolicy}</strong>. Bộ xử lý trả về {inspection.paragraphs.length} đoạn{inspection.paragraphsTruncated ? ' đầu tiên (danh sách đã được rút gọn)' : ''}. Chỉ căn lề trực tiếp được hỗ trợ.
              </p>
            </div>
          </div>

          {inspection.diagnostics.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Ghi chú kiểm tra</CardTitle></CardHeader>
              <CardContent><ul className="list-disc space-y-1 pl-5 text-xs text-neutral-700">{inspection.diagnostics.map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>)}</ul></CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <Card>
              <CardHeader>
                <CardTitle>2. Chọn một đoạn để đổi căn lề</CardTitle>
                <CardDescription>Đoạn chưa có căn lề trực tiếp được giữ nguyên và không thể chọn.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {inspection.paragraphs.length === 0 ? (
                  <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">Không có đoạn văn nào để hiển thị.</p>
                ) : inspection.paragraphs.map(paragraph => {
                  const eligible = canMutate && paragraph.directAlignment !== null;
                  const selected = selectedParagraphId === paragraph.paragraphId;
                  return (
                    <label key={paragraph.paragraphId} className={`flex gap-3 rounded-lg border p-3 ${eligible ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} ${selected ? 'border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900' : 'border-neutral-200'}`}>
                      <input
                        type="radio"
                        name="document-paragraph"
                        value={paragraph.paragraphId}
                        checked={selected}
                        disabled={!eligible || disabled || !!pendingApply}
                        onChange={() => selectParagraph(paragraph.paragraphId)}
                        aria-label={`Chọn đoạn ${paragraph.paragraphId}`}
                        className="mt-1 accent-neutral-900"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                          <span className="font-semibold text-neutral-700">Đoạn {paragraph.paragraphId}</span>
                          <span className="text-neutral-500">{alignmentLabel(paragraph.directAlignment)}</span>
                        </span>
                        <span className="mt-1 block whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-800">{paragraph.text || '〔Đoạn trống〕'}</span>
                      </span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle>3. Chọn căn lề mới</CardTitle>
                <CardDescription>Mỗi lần xác nhận chỉ đổi một thuộc tính và tạo một tệp DOCX mới.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label htmlFor="document-formatting-alignment" className="block text-xs font-medium text-neutral-700">Căn lề</label>
                <select
                  id="document-formatting-alignment"
                  value={desiredAlignment}
                  disabled={!selectedParagraph?.directAlignment || disabled || !!pendingApply || !canMutate}
                  onChange={event => setDesiredAlignment(event.currentTarget.value as Alignment)}
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:bg-neutral-100 disabled:text-neutral-500"
                >
                  {ALIGNMENTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {selectedParagraph && <p className="text-xs text-neutral-500">Hiện tại: {alignmentLabel(selectedParagraph.directAlignment)}</p>}
                <Button type="button" className="w-full" onClick={prepareApply}
                  disabled={!canMutate || !selectedParagraph?.directAlignment || desiredAlignment === selectedParagraph.directAlignment || disabled || !!pendingApply}>
                  {busy === 'prepare' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang chuẩn bị…</> : 'Tiếp tục để xem xác nhận'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {pendingApply && selectedParagraph && (
        <section role="alertdialog" aria-modal="false" aria-labelledby="document-confirm-title" className="rounded-xl border border-blue-300 bg-blue-50 p-4 shadow-xs">
          <h2 id="document-confirm-title" className="text-sm font-semibold text-blue-950">Xác nhận tạo bản DOCX mới</h2>
          <p className="mt-1 text-sm leading-relaxed text-blue-900">
            Đổi căn lề đoạn <strong>{pendingApply.input.paragraphId}</strong> từ <strong>{alignmentLabel(pendingApply.input.expectedBefore)}</strong> sang <strong>{alignmentLabel(pendingApply.input.desiredAfter)}</strong>. Tệp nguồn sẽ được giữ nguyên; thao tác tạo một tệp mới.
          </p>
          <p className="mt-2 text-xs text-blue-800">Yêu cầu hết hạn lúc {new Date(pendingApply.confirmationExpiresAt).toLocaleTimeString()}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={confirmApply} disabled={disabled}>
              {busy === 'apply' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang tạo bản sao…</> : 'Xác nhận và tạo bản sao'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPendingApply(null)} disabled={disabled}>Hủy</Button>
          </div>
        </section>
      )}

      {output && (
        <section aria-labelledby="document-output-title" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div className="min-w-0 flex-1">
              <h2 id="document-output-title" className="text-sm font-semibold text-emerald-950">Đã tạo và kiểm tra bản DOCX mới</h2>
              <p className="mt-1 break-all text-sm font-medium text-emerald-900">{output.outputFile.originalName}</p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                Đã mở lại và kiểm tra bản mới; căn lề sau chỉnh sửa khớp yêu cầu, tệp nguồn không thay đổi. {output.changeManifest.summary}
              </p>
              <Button type="button" variant="success" className="mt-3" onClick={downloadOutput} disabled={disabled}>
                {busy === 'download' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang tải…</> : <><Download className="h-4 w-4" />Tải bản DOCX mới</>}
              </Button>
              {downloadError && <p role="alert" className="mt-2 text-xs text-rose-700">{downloadError}</p>}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
