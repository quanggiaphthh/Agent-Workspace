import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileText, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { authFetch } from '../../lib/authFetch';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../shared/contracts/fileUploadPolicy';

type Alignment = 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFY';
type InspectionParagraph = {
  paragraphId: string;
  text: string;
  directAlignment: Alignment | null;
  issueId: string | null;
};
type Inspection = {
  sourceSha256: string;
  profile: 'generic-direct-alignment-spike';
  safeToMutate: boolean;
  packagePolicy: 'NORMAL' | 'GUARDED' | 'AUDIT_ONLY' | 'PROHIBITED';
  paragraphs: InspectionParagraph[];
  paragraphsTruncated: boolean;
  diagnostics: Array<{ code: string; message: string }>;
};
type PendingConfirmation = {
  confirmationId: string;
  expiresAt: string;
  sourceSha256: string;
  paragraphId: string;
  expectedBefore: Alignment;
  desiredAfter: Alignment;
  idempotencyKey: string;
};

const ALIGNMENTS: Alignment[] = ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY'];
const ALIGNMENT_LABEL: Record<Alignment, string> = {
  LEFT: 'Trái', CENTER: 'Giữa', RIGHT: 'Phải', JUSTIFY: 'Căn đều',
};

function encodeHeaderValue(value: string): string {
  return encodeURIComponent(value);
}

async function parseResponseError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown; code?: unknown };
    if (typeof payload.error === 'string') return payload.error;
  } catch { /* Use the fixed fallback below. */ }
  return `Yêu cầu chưa hoàn tất (HTTP ${response.status}).`;
}

function safeOutputFilename(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim() || 'document.docx';
  return `${base.replace(/\.docx$/i, '') || 'document'}-formatted.docx`;
}

function makeIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `docfmt:${uuid}`;
  const random = new Uint8Array(16);
  globalThis.crypto.getRandomValues(random);
  return `docfmt:${Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function DocumentFormattingModule() {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [selectedParagraphId, setSelectedParagraphId] = useState('');
  const [desiredAfter, setDesiredAfter] = useState<Alignment | ''>('');
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [busy, setBusy] = useState<'inspect' | 'prepare' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const objectUrls = useRef(new Set<string>());

  useEffect(() => () => {
    requestController.current?.abort();
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  const selectedParagraph = inspection?.paragraphs.find(paragraph => paragraph.paragraphId === selectedParagraphId) || null;
  const canApply = Boolean(file && inspection?.safeToMutate && inspection.packagePolicy === 'NORMAL' && selectedParagraph?.directAlignment && desiredAfter && desiredAfter !== selectedParagraph.directAlignment);

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] || null;
    setInspection(null);
    setSelectedParagraphId('');
    setDesiredAfter('');
    setPendingConfirmation(null);
    setError(null);
    setNotice(null);
    if (!chosen) { setFile(null); return; }
    if (!chosen.name.toLowerCase().endsWith('.docx')) {
      setFile(null);
      setError('Chỉ nhận tệp .docx có định dạng DOCX hợp lệ.');
      event.target.value = '';
      return;
    }
    if (chosen.size <= 0 || chosen.size > MAX_FILE_BYTES) {
      setFile(null);
      setError('Tệp phải lớn hơn 0 và không vượt quá 20 MiB.');
      event.target.value = '';
      return;
    }
    setFile(chosen);
  };

  const inspect = async () => {
    if (!file || busy) return;
    const controller = new AbortController();
    requestController.current = controller;
    setBusy('inspect');
    setError(null);
    setNotice(null);
    setPendingConfirmation(null);
    setInspection(null);
    try {
      const response = await authFetch('/api/document-formatting/inspect', {
        method: 'POST',
        headers: { 'Content-Type': DOCX_MIME_TYPE, 'X-File-Name': encodeHeaderValue(file.name) },
        body: file,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await parseResponseError(response));
      const payload = await response.json() as { inspection?: Inspection };
      if (!payload.inspection || !Array.isArray(payload.inspection.paragraphs)) throw new Error('Kết quả kiểm tra DOCX không hợp lệ.');
      setInspection(payload.inspection);
      const firstEditable = payload.inspection.paragraphs.find(paragraph => paragraph.directAlignment !== null);
      if (firstEditable) {
        setSelectedParagraphId(firstEditable.paragraphId);
        setDesiredAfter(ALIGNMENTS.find(alignment => alignment !== firstEditable.directAlignment) || '');
      }
      setNotice('Đã kiểm tra DOCX trong phiên này. Tệp không được lưu vào kho tệp của ứng dụng.');
    } catch (caught) {
      if (controller.signal.aborted) setError('Đã hủy thao tác. Hãy kiểm tra lại tệp trước khi tiếp tục.');
      else setError(caught instanceof Error ? caught.message : 'Không thể kiểm tra DOCX.');
    } finally {
      if (requestController.current === controller) requestController.current = null;
      setBusy(null);
    }
  };

  const prepareConfirmation = async () => {
    if (!file || !inspection || !selectedParagraph?.directAlignment || !desiredAfter || !canApply || busy) return;
    const controller = new AbortController();
    requestController.current = controller;
    setBusy('prepare');
    setError(null);
    setPendingConfirmation(null);
    const idempotencyKey = makeIdempotencyKey();
    try {
      const response = await authFetch('/api/document-formatting/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          sourceSha256: inspection.sourceSha256,
          paragraphId: selectedParagraph.paragraphId,
          expectedBefore: selectedParagraph.directAlignment,
          desiredAfter,
        }),
        signal: controller.signal,
      });
      const payload = await response.json() as { confirmationId?: string; confirmationExpiresAt?: string; error?: string };
      if (response.status !== 409 || !payload.confirmationId || !payload.confirmationExpiresAt) {
        throw new Error(payload.error || `Không thể chuẩn bị bước xác nhận (HTTP ${response.status}).`);
      }
      setPendingConfirmation({
        confirmationId: payload.confirmationId,
        expiresAt: payload.confirmationExpiresAt,
        sourceSha256: inspection.sourceSha256,
        paragraphId: selectedParagraph.paragraphId,
        expectedBefore: selectedParagraph.directAlignment,
        desiredAfter,
        idempotencyKey,
      });
    } catch (caught) {
      if (controller.signal.aborted) setError('Đã hủy thao tác xác nhận.');
      else setError(caught instanceof Error ? caught.message : 'Không thể chuẩn bị bước xác nhận.');
    } finally {
      if (requestController.current === controller) requestController.current = null;
      setBusy(null);
    }
  };

  const applyAndDownload = async () => {
    if (!file || !pendingConfirmation || busy) return;
    if (Date.parse(pendingConfirmation.expiresAt) <= Date.now()) {
      setPendingConfirmation(null);
      setError('Yêu cầu xác nhận đã hết hạn. Hãy kiểm tra và xác nhận lại tệp.');
      return;
    }
    const controller = new AbortController();
    requestController.current = controller;
    setBusy('apply');
    setError(null);
    setNotice(null);
    try {
      const response = await authFetch('/api/document-formatting/apply', {
        method: 'POST',
        headers: {
          'Content-Type': DOCX_MIME_TYPE,
          'X-File-Name': encodeHeaderValue(file.name),
          'X-Document-Source-Sha256': pendingConfirmation.sourceSha256,
          'X-Document-Paragraph-Id': pendingConfirmation.paragraphId,
          'X-Document-Expected-Alignment': pendingConfirmation.expectedBefore,
          'X-Document-Desired-Alignment': pendingConfirmation.desiredAfter,
          'X-Confirmation-ID': pendingConfirmation.confirmationId,
          'Idempotency-Key': pendingConfirmation.idempotencyKey,
        },
        body: file,
        signal: controller.signal,
      });
      if (!response.ok) {
        setPendingConfirmation(null);
        setInspection(null);
        setSelectedParagraphId('');
        setDesiredAfter('');
        throw new Error(await parseResponseError(response));
      }
      if (response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== DOCX_MIME_TYPE) {
        throw new Error('Máy chủ trả về tệp không đúng định dạng DOCX.');
      }
      const output = await response.blob();
      if (output.size <= 0 || output.size > MAX_FILE_BYTES) throw new Error('Tệp kết quả vượt giới hạn an toàn.');
      const objectUrl = URL.createObjectURL(output);
      objectUrls.current.add(objectUrl);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = safeOutputFilename(file.name);
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => { URL.revokeObjectURL(objectUrl); objectUrls.current.delete(objectUrl); }, 30_000);
      setPendingConfirmation(null);
      setInspection(null);
      setSelectedParagraphId('');
      setDesiredAfter('');
      setNotice('Đã tải DOCX đã chỉnh sửa. Hãy mở tệp tải xuống để kiểm tra kết quả.');
    } catch (caught) {
      setPendingConfirmation(null);
      setInspection(null);
      setSelectedParagraphId('');
      setDesiredAfter('');
      if (controller.signal.aborted) setError('Đã hủy thao tác. Hãy kiểm tra lại DOCX trước khi thử lần nữa.');
      else setError(caught instanceof Error ? caught.message : 'Không thể áp dụng căn lề.');
    } finally {
      if (requestController.current === controller) requestController.current = null;
      setBusy(null);
    }
  };

  const cancel = () => {
    const cancellingApply = busy === 'apply';
    requestController.current?.abort();
    requestController.current = null;
    setBusy(null);
    setPendingConfirmation(null);
    if (cancellingApply) {
      setInspection(null);
      setSelectedParagraphId('');
      setDesiredAfter('');
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <FileText className="h-4 w-4" /> Document Formatting V1
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">Kiểm tra và căn lề DOCX</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            V1 chỉ sửa căn lề trực tiếp của một đoạn văn. Tệp được gửi tạm thời để xử lý và trả về ngay; không tạo fileId hoặc lưu DOCX vào kho tệp của ứng dụng.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5" /> Bản thử nghiệm giới hạn
        </div>
      </header>

      <Card className="border-blue-200 bg-blue-50/60">
        <CardContent className="flex gap-3 pt-5 text-sm leading-6 text-blue-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <p>Đây chưa phải công cụ chuẩn hóa toàn bộ thể thức hành chính. Không hỗ trợ font, cỡ chữ, giãn dòng, lề trang hoặc định dạng bảng trong V1.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1. Chọn và kiểm tra tệp</CardTitle>
          <CardDescription>DOCX tối đa 20 MiB. Việc chọn tệp không tải tệp lên /api/files.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-800">Tệp DOCX</span>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={chooseFile}
              disabled={busy !== null}
              className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </label>
          {file && <p className="break-all text-xs text-neutral-500">{file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MiB</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void inspect()} disabled={!file || busy !== null}>
              {busy === 'inspect' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {busy === 'inspect' ? 'Đang kiểm tra…' : 'Kiểm tra DOCX'}
            </Button>
            {busy && <Button type="button" variant="outline" onClick={cancel}>Hủy thao tác</Button>}
          </div>
        </CardContent>
      </Card>

      {inspection && (
        <Card>
          <CardHeader>
            <CardTitle>2. Kết quả kiểm tra</CardTitle>
            <CardDescription>Profile: {inspection.profile} · {inspection.paragraphs.length} đoạn{inspection.paragraphsTruncated ? ' (đã giới hạn danh sách)' : ''}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`flex items-start gap-3 rounded-md border p-3 text-sm ${inspection.safeToMutate && inspection.packagePolicy === 'NORMAL' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
              {inspection.safeToMutate && inspection.packagePolicy === 'NORMAL' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              <div>
                <p className="font-medium">Chính sách gói: {inspection.packagePolicy}</p>
                <p className="mt-1 text-xs leading-5">{inspection.safeToMutate && inspection.packagePolicy === 'NORMAL' ? 'Có thể chọn một đoạn có căn lề trực tiếp để thử thay đổi.' : 'Tệp này không đủ điều kiện chỉnh sửa tự động. Không có thay đổi nào được áp dụng.'}</p>
              </div>
            </div>
            {inspection.diagnostics.length > 0 && (
              <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                <p className="text-xs font-semibold text-neutral-800">Chẩn đoán từ bộ xử lý</p>
                {inspection.diagnostics.map((item, index) => <p key={`${item.code}-${index}`} className="text-xs leading-5 text-neutral-600">{item.code}: {item.message}</p>)}
              </div>
            )}
            {inspection.paragraphs.length === 0 ? (
              <p className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">Không tìm thấy đoạn văn trong giới hạn kiểm tra.</p>
            ) : (
              <fieldset disabled={!inspection.safeToMutate || inspection.packagePolicy !== 'NORMAL' || busy !== null} className="space-y-2">
                <legend className="mb-2 text-sm font-medium text-neutral-800">Chọn đoạn văn có căn lề trực tiếp</legend>
                {inspection.paragraphs.map(paragraph => {
                  const selectable = paragraph.directAlignment !== null;
                  return (
                    <label key={paragraph.paragraphId} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${selectedParagraphId === paragraph.paragraphId ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'} ${selectable ? '' : 'cursor-not-allowed opacity-60'}`}>
                      <input type="radio" name="document-paragraph" value={paragraph.paragraphId} disabled={!selectable} checked={selectedParagraphId === paragraph.paragraphId} onChange={() => { setSelectedParagraphId(paragraph.paragraphId); setDesiredAfter(ALIGNMENTS.find(value => value !== paragraph.directAlignment) || ''); setPendingConfirmation(null); }} className="mt-1" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-neutral-700">
                          <span>{paragraph.paragraphId}</span>
                          <span className="text-neutral-400">·</span>
                          <span>{paragraph.directAlignment ? ALIGNMENT_LABEL[paragraph.directAlignment] : 'Không có căn lề trực tiếp'}</span>
                        </span>
                        <span className="mt-1 block whitespace-pre-wrap break-words text-sm leading-6 text-neutral-800">{paragraph.text || '(Đoạn văn không có nội dung hiển thị)'}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
            {inspection.paragraphsTruncated && <p className="text-xs text-amber-800">Kết quả đã được giới hạn. Nếu đoạn cần sửa không xuất hiện, hãy dùng tài liệu nhỏ hơn hoặc phân tích lại sau khi thu hẹp phạm vi.</p>}
            {canApply && selectedParagraph && (
              <div className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <label>
                  <span className="mb-1.5 block text-sm font-medium text-neutral-800">Căn lề mới cho {selectedParagraph.paragraphId}</span>
                  <select value={desiredAfter} onChange={event => { setDesiredAfter(event.target.value as Alignment); setPendingConfirmation(null); }} disabled={busy !== null} className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-800">
                    {ALIGNMENTS.filter(alignment => alignment !== selectedParagraph.directAlignment).map(alignment => <option key={alignment} value={alignment}>{ALIGNMENT_LABEL[alignment]}</option>)}
                  </select>
                </label>
                <Button type="button" onClick={() => void prepareConfirmation()} disabled={busy !== null}>
                  {busy === 'prepare' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  Chuẩn bị xác nhận
                </Button>
              </div>
            )}
            {pendingConfirmation && selectedParagraph && (
              <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4" role="group" aria-label="Xác nhận thay đổi DOCX">
                <div>
                  <p className="text-sm font-semibold text-amber-950">Xác nhận một thay đổi trước khi xử lý</p>
                  <p className="mt-1 text-sm leading-6 text-amber-900">Đoạn {pendingConfirmation.paragraphId}: {ALIGNMENT_LABEL[pendingConfirmation.expectedBefore]} → {ALIGNMENT_LABEL[pendingConfirmation.desiredAfter]}.</p>
                  <p className="mt-1 text-xs text-amber-800">Yêu cầu hết hạn lúc {new Date(pendingConfirmation.expiresAt).toLocaleTimeString()}.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void applyAndDownload()} disabled={busy !== null}>
                    {busy === 'apply' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {busy === 'apply' ? 'Đang xử lý…' : 'Xác nhận và tải DOCX'}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setPendingConfirmation(null)}>Hủy xác nhận</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error && <div role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {notice && <div role="status" className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div>}
    </main>
  );
}
