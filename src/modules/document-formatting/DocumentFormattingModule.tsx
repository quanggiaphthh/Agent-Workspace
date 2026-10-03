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
import { eventBus } from '../../core/events/eventBus';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';
import { clientCapabilityRegistry } from '../../core/capabilities/capabilityRegistry';
import { DOCX_MIME_TYPE, MAX_FILE_BYTES } from '../../../shared/contracts/fileUploadPolicy';
import { mapUploadErrorCode, precheckFile, uploadUserFile, type PublicUserFile } from '../../core/files/fileUploadClient';

const ALIGNMENTS = [
  { value: 'LEFT', label: 'Căn trái' },
  { value: 'CENTER', label: 'Căn giữa' },
  { value: 'RIGHT', label: 'Căn phải' },
  { value: 'JUSTIFY', label: 'Căn đều hai lề' },
] as const;

type Alignment = typeof ALIGNMENTS[number]['value'];
type BusyAction = 'upload' | 'inspect' | 'prepare' | 'apply' | 'download' | null;

interface ProfileBinding {
  id: string;
  version: string;
  digest: string;
  rulePackId: string;
  documentTypeKey: string;
  documentTypeLabelVi: string;
  documentTypeConfirmed: boolean;
  scopeId?: string;
  scopeLabelVi?: string;
  detectedDocumentTypeKey?: string | null;
  ownerConfirmed?: boolean;
}

/** A document type the bound profile version actually supports. */
interface SupportedDocumentType {
  typeKey: string;
  labelVi: string;
  hasTypeHeading: boolean;
}

interface ProfileFinding {
  ruleId: string;
  targetKey: string;
  property: string;
  status: 'FAIL' | 'NEEDS_REVIEW';
  severity: string;
  expected: string;
  observed: string;
  patchEligibility: string;
  propertyLabelVi: string;
  unit: string;
  targetId: string | null;
}

interface MutableTarget {
  targetId: string;
  property: string;
  currentValue: string | null;
  unit: string;
  propertyLabelVi: string;
  ruleId: string;
  directOnly: boolean;
}

interface DocumentInspection {
  sourceSha256: string;
  profile: string;
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
  binding: ProfileBinding | null;
  findings: ProfileFinding[];
  mutableTargets: MutableTarget[];
  ruleSubsetSize: number;
  applicableRules: number;
  evaluatedRules: number;
  failCount: number;
  needsReviewCount: number;
  notEvaluatedCount: number;
  evaluatedCoveragePercent: number;
  fullComplianceClaimAllowed: boolean;
  scopeStatement: string | null;
  supportedProperties: string[] | null;
  supportedDocumentTypes: SupportedDocumentType[] | null;
}

interface InspectOutput {
  sourceFileId: string;
  inspection: DocumentInspection;
}

/**
 * A confirmed apply request. `property`/`targetId` name the profile target;
 * `documentTypeKey`, `profileId`, `profileDigest` and `ruleId` bind the exact
 * profile, document type and rule the inspection was issued under.
 */
interface ApplyInput {
  fileId: string;
  sourceSha256: string;
  property: string;
  targetId: string;
  documentTypeKey: string;
  expectedBefore: string;
  desiredAfter: string;
  profileId: string;
  profileDigest: string;
  ruleId: string;
}

/**
 * Marker written by an earlier build: direct paragraph alignment only. It is
 * still a valid recovery record and must never be discarded just because the
 * contract has since changed shape.
 */
interface LegacyApplyInput {
  fileId: string;
  sourceSha256: string;
  paragraphId: string;
  expectedBefore: string;
  desiredAfter: string;
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
    property: string;
    targetId: string;
    propertyLabelVi: string;
    unit: string;
    before: string;
    after: string;
    ruleId: string;
    sourceSha256: string;
    outputSha256: string;
    appliedAt: string;
  };
  verification: {
    reopened: true;
    revalidated: true;
    sourceUnchanged: true;
    outputInspectionPassed: true;
  };
}

interface ReconcileOutput {
  outcome: 'succeeded' | 'in_flight' | 'failed' | 'no_record';
  outputContract: 'current' | 'legacy_alignment' | 'none';
  idempotencyKey: string;
  output?: ApplyOutput;
  legacyChange?: {
    property: 'paragraph.alignment';
    paragraphId: string;
    before: string;
    after: string;
    sourceSha256: string;
    outputSha256: string;
    appliedAt: string;
  };
  recordedErrorCode?: string;
  recordedFailureKind?: 'PRE_HANDLER' | 'AMBIGUOUS_POST_START';
  legacyOutputFile?: {
    fileId: string;
    originalName: string;
    mimeType: typeof DOCX_MIME_TYPE;
    sizeBytes: number;
    status: 'ready';
    createdAt: string | null;
  };
  evidenceUnavailable: boolean;
}

interface PendingApply {
  input: ApplyInput | LegacyApplyInput;
  confirmationId: string;
  confirmationExpiresAt: string;
  idempotencyKey: string;
  phase: 'challenge' | 'recovery';
  /**
   * Provenance flag: a confirmed mutation carrying this idempotency key has
   * already been sent to the server. `phase` alone cannot express this, because
   * re-issuing a challenge over an already-dispatched mutation moves the record
   * back to `challenge`. While this is true the outcome is ambiguous, so the
   * marker must survive cancel, clear and reload, and no new operation key may
   * be issued for the same owner.
   */
  dispatched: boolean;
}

const PENDING_APPLY_STORAGE_PREFIX = 'document-formatting:pending-apply:v1:';
const ALIGNMENT_VALUES = new Set<Alignment>(ALIGNMENTS.map(option => option.value));

/**
 * Plain-Vietnamese summary of what the durable record actually proves.
 *
 * It never states that no document was created unless the record proves the
 * handler never started: an `AMBIGUOUS_POST_START` failure and a missing record
 * both leave the outcome unknown, so they are reported as unknown.
 */
function reconciliationSummary(result: ReconcileOutput): string {
  switch (result.outcome) {
    case 'succeeded':
      return result.outputContract === 'current'
        ? 'Máy chủ đã ghi nhận thao tác này thành công và bản tài liệu mới đã được tải xuống.'
        : result.outputContract === 'legacy_alignment'
          ? 'Máy chủ đã ghi nhận thao tác cũ này thành công. Bản kết quả được tạo từ định dạng cũ nên không có hồ sơ định dạng đi kèm; hãy mở hoặc tải bản đó để kiểm tra.'
          : 'Máy chủ đã ghi nhận thao tác này thành công, nhưng bản kết quả không khớp với định dạng hiện tại nên không thể hiển thị ở đây. Hãy mở tài liệu trong kho cá nhân để kiểm tra.';
    case 'in_flight':
      return 'Máy chủ vẫn đang xử lý thao tác này. Chưa thể kết luận thao tác đã thành công hay chưa; hãy kiểm tra lại sau ít phút.';
    case 'failed':
      // Only a pre-handler failure proves the handler never ran, so only that
      // case may promise that nothing was written.
      return result.recordedFailureKind === 'PRE_HANDLER'
        ? `Máy chủ đã ghi nhận thao tác này không thành công và chưa bắt đầu xử lý tài liệu, nên không có tài liệu mới nào được tạo.${result.recordedErrorCode ? ` (mã lỗi ${result.recordedErrorCode})` : ''}`
        : `Máy chủ đã ghi nhận thao tác này không thành công${result.recordedErrorCode ? ` (mã lỗi ${result.recordedErrorCode})` : ''}, nhưng không thể xác định tài liệu có bị thay đổi hay không. Hãy kiểm tra kho tài liệu cá nhân.`;
    default:
      return result.evidenceUnavailable
        ? 'Chưa đọc được dữ liệu đối chiếu từ máy chủ, nên chưa thể kết luận thao tác này đã tạo tài liệu mới hay chưa.'
        : 'Máy chủ không lưu bản ghi nào cho thao tác này, nên chưa thể kết luận thao tác đã tạo tài liệu mới hay chưa.';
  }
}

/**
 * Describes the confirmed change tuple for any profile property.
 *
 * The server returns the generic manifest, so alignment, margin, font size and
 * spacing all render from the same fields. Only alignment has a word label;
 * every other value renders with its own unit so nothing shows as undefined.
 */
function describeOutputChange(output: ApplyOutput): string {
  const manifest = output.changeManifest;
  const unit = manifest.unit ? ` ${manifest.unit}` : '';
  const render = (value: string) => manifest.property === 'paragraph.alignment' ? alignmentLabel(value as Alignment) : value;
  const label = manifest.propertyLabelVi || manifest.property;
  return `${label} của ${targetLabel(manifest.targetId, manifest.property)} từ ${render(manifest.before)}${unit} sang ${render(manifest.after)}${unit} (quy tắc ${manifest.ruleId})`;
}

function pendingApplyStorageKey(userId: string): string {
  return `${PENDING_APPLY_STORAGE_PREFIX}${userId}`;
}

/**
 * Structural validation of a stored marker, independent of dispatch provenance.
 *
 * A marker written before the `dispatched` field existed is still a valid
 * recovery record. Rejecting it here would delete the only trace of a mutation
 * whose outcome is unknown, so provenance is resolved separately and never used
 * as a reason to discard the record.
 */
function isStoredPendingApplyStructure(value: unknown, userId: string): value is Omit<PendingApply, 'dispatched'> & { dispatched?: unknown } {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const input = record.input as Record<string, unknown> | null;
  if (!input || typeof input.fileId !== 'string' || input.fileId.length === 0 || input.fileId.length > 128) return false;
  if (typeof input.sourceSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(input.sourceSha256)) return false;
  if (typeof input.expectedBefore !== 'string' || !input.expectedBefore || input.expectedBefore.length > 64) return false;
  if (typeof input.desiredAfter !== 'string' || !input.desiredAfter || input.desiredAfter.length > 64) return false;
  if (input.expectedBefore === input.desiredAfter) return false;

  // Current shape: a named profile property with its full binding.
  const currentShape =
    typeof input.property === 'string' && input.property.length > 0 && input.property.length <= 64 &&
    typeof input.targetId === 'string' && input.targetId.length > 0 && input.targetId.length <= 128 &&
    typeof input.documentTypeKey === 'string' && input.documentTypeKey.length > 0 && input.documentTypeKey.length <= 32 &&
    typeof input.profileId === 'string' && input.profileId.length > 0 && input.profileId.length <= 64 &&
    typeof input.profileDigest === 'string' && /^[0-9a-f]{64}$/i.test(input.profileDigest) &&
    typeof input.ruleId === 'string' && input.ruleId.length > 0 && input.ruleId.length <= 128;

  // Legacy shape: direct paragraph alignment only. Still a real mutation.
  const legacyShape =
    typeof input.paragraphId === 'string' && /^p[1-9][0-9]{0,8}$/.test(input.paragraphId) &&
    ALIGNMENT_VALUES.has(input.expectedBefore as Alignment) &&
    ALIGNMENT_VALUES.has(input.desiredAfter as Alignment);
  if (!currentShape && !legacyShape) return false;

  return record.version === 1 && record.userId === userId &&
    typeof record.idempotencyKey === 'string' && /^[0-9a-f-]{36}$/i.test(record.idempotencyKey) &&
    typeof record.confirmationId === 'string' && record.confirmationId.length > 0 && record.confirmationId.length <= 256 &&
    typeof record.confirmationExpiresAt === 'string' && Number.isFinite(Date.parse(record.confirmationExpiresAt)) &&
    (record.phase === 'challenge' || record.phase === 'recovery');
}

/**
 * Resolve dispatch provenance conservatively.
 *
 * When the field is absent the provenance is unknown, and the earlier version of
 * this module could re-issue a challenge over an already-dispatched mutation and
 * leave it recorded as `challenge`. Unknown therefore resolves to dispatched, so
 * the marker stays locked and reconcilable instead of being silently dropped.
 */
function withResolvedProvenance(record: Omit<PendingApply, 'dispatched'> & { dispatched?: unknown }): PendingApply {
  const dispatched = typeof record.dispatched === 'boolean' ? record.dispatched : true;
  return {
    input: record.input,
    confirmationId: record.confirmationId,
    confirmationExpiresAt: record.confirmationExpiresAt,
    idempotencyKey: record.idempotencyKey,
    phase: record.phase,
    dispatched,
  };
}

/** An ambiguous mutation: dispatched at least once and not yet known to have succeeded. */
function isUncertainApply(pending: PendingApply | null): boolean {
  return !!pending && pending.dispatched;
}

/**
 * A marker written before the profile contract existed.
 *
 * Its payload must never be sent to the current mutation capability: the server
 * would reject it as invalid input, and casting it to the current shape would
 * fabricate a profile binding, target and rule that were never chosen. Such a
 * marker is reconciled read-only instead.
 */
function isLegacyApplyInput(input: ApplyInput | LegacyApplyInput): input is LegacyApplyInput {
  return typeof (input as LegacyApplyInput).paragraphId === 'string';
}

function persistPendingApply(userId: string, pending: PendingApply): boolean {
  try {
    window.sessionStorage.setItem(pendingApplyStorageKey(userId), JSON.stringify({ version: 1, userId, ...pending }));
    return true;
  } catch {
    return false;
  }
}

function restorePendingApply(userId: string): PendingApply | null {
  try {
    const raw = window.sessionStorage.getItem(pendingApplyStorageKey(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (isStoredPendingApplyStructure(value, userId)) {
      const resolved = withResolvedProvenance(value);
      // Persist the resolved provenance so the conservative inference is only
      // applied once, without ever discarding the record itself.
      persistPendingApply(userId, resolved);
      return resolved;
    }
    window.sessionStorage.removeItem(pendingApplyStorageKey(userId));
  } catch {
    // Treat unavailable or corrupt recovery state as absent; no credentials or document text are stored here.
  }
  return null;
}

function clearStoredPendingApply(userId: string): void {
  try { window.sessionStorage.removeItem(pendingApplyStorageKey(userId)); } catch { /* Storage may be unavailable. */ }
}

function alignmentLabel(value: Alignment | null): string {
  return value ? ALIGNMENTS.find(option => option.value === value)?.label || value : 'Chưa đặt trực tiếp';
}

/** Vietnamese business wording for the package-safety policy returned by the Processor. */
function packagePolicyLabel(policy: DocumentInspection['packagePolicy']): string {
  switch (policy) {
    case 'NORMAL': return 'bình thường — có thể chỉnh sửa an toàn';
    case 'GUARDED': return 'cần thận trọng — có liên kết ngoài, chỉ giới hạn ở thay đổi an toàn';
    case 'AUDIT_ONLY': return 'chỉ đọc — tài liệu có chữ ký số, bảo vệ, theo dõi thay đổi hoặc macro';
    case 'PROHIBITED': return 'không được phép chỉnh sửa — tài liệu chứa thành phần không được hỗ trợ';
    default: return 'không xác định';
  }
}

/** Vietnamese business wording for a Processor safety note, keyed by its stable code. */
function diagnosticLabel(code: string, fallback: string): string {
  switch (code) {
    case 'UNSUPPORTED_FEATURE': return 'Tài liệu có thành phần chưa được hỗ trợ nên chỉ đọc, không chỉnh sửa được.';
    case 'SIGNED_PACKAGE': return 'Tài liệu mang dấu hiệu chữ ký số nên hệ thống chỉ đọc và kiểm tra, không sửa.';
    case 'MACRO_PRESENT': return 'Tài liệu có macro nên hệ thống chỉ đọc và kiểm tra, không sửa.';
    case 'OLE_PRESENT': return 'Tài liệu có đối tượng nhúng nên hệ thống chỉ đọc và kiểm tra, không sửa.';
    case 'TRACKED_CHANGES_PRESENT': return 'Tài liệu đang có thay đổi được theo dõi nên hệ thống chỉ đọc, không sửa.';
    case 'EXTERNAL_RELATIONSHIP': return 'Tài liệu có liên kết ra ngoài nên chỉ áp dụng thay đổi an toàn.';
    case 'DOCUMENT_PROTECTED': return 'Tài liệu đang được bảo vệ nên hệ thống chỉ đọc và kiểm tra, không sửa.';
    default: return fallback;
  }
}

/** Human paragraph label: the Processor paragraph ID is an internal locator, not a user-facing number. */
function paragraphLabel(paragraphId: string): string {
  const index = /^p([1-9][0-9]{0,8})$/.exec(paragraphId);
  return index ? `đoạn ${Number(index[1])}` : 'đoạn đã chọn';
}

/**
 * Names the mutated target by its semantic kind.
 *
 * Profile targets are either a body paragraph (`pN`) or a document section
 * (`sN`), so a margin change must not be described as a paragraph change.
 */
function targetLabel(targetId: string, property: string): string {
  if (property.startsWith('section.')) {
    const section = /^s([1-9][0-9]{0,8})$/.exec(targetId);
    return section ? `phần ${Number(section[1])}` : 'phần đã chọn';
  }
  return paragraphLabel(targetId);
}

/** Section targets are addressed by section id; paragraph targets by paragraph id. */
function targetScopeLabel(target: { targetId: string; directOnly: boolean }): string {
  return target.directOnly ? paragraphLabel(target.targetId) : 'toàn bộ tài liệu';
}

/** Readable one-line description of a confirmed change, for either marker shape. */
function describeChange(input: ApplyInput | LegacyApplyInput): string {
  if ('property' in input) {
    return `${input.property} tại ${input.targetId}: ${input.expectedBefore} → ${input.desiredAfter}`;
  }
  return `${paragraphLabel(input.paragraphId)}: ${alignmentLabel(input.expectedBefore as Alignment)} → ${alignmentLabel(input.desiredAfter as Alignment)}`;
}

/** Stable key for a profile target: one property on one paragraph or section. */
function targetKey(target: { property: string; targetId: string }): string {
  return `${target.property}::${target.targetId}`;
}

/**
 * Candidate values for a property, derived from what the DOCX actually holds and
 * the rule the property is bound to. The server re-validates the chosen value
 * against the rule, so this list only needs to be honest and readable.
 */
function candidateValues(target: MutableTarget | null): string[] {
  if (!target) return [];
  const current = target.currentValue ?? '';
  if (target.property === 'paragraph.alignment') {
    return ALIGNMENTS.map(option => option.value).filter(value => value !== current);
  }
  // A finding for this property already states the value the rule expects.
  return [];
}

function describeFinding(finding: ProfileFinding): string {
  const expected = finding.expected.replace(/^type=[^;]+;\s*/, '');
  return `${finding.propertyLabelVi}: cần ${expected}${finding.unit ? ` ${finding.unit}` : ''}, hiện tại ${finding.observed || 'chưa xác định'}`;
}

function confirmationDeadline(expiresAt: string): string {
  const value = new Date(expiresAt);
  if (!Number.isFinite(value.getTime())) return 'không xác định';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(value.getHours())}:${pad(value.getMinutes())} ngày ${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
}

function mapCapabilityError(code?: string): string {
  switch (code) {
    case 'UNAUTHORIZED':
    case 'AUTH_REQUIRED': return 'Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại rồi thử tiếp.';
    case 'PERMISSION_DENIED':
    case 'CAPABILITY_FORBIDDEN': return 'Tài khoản hiện tại chưa có quyền đọc và ghi tài liệu.';
    case 'MODULE_DISABLED': return 'Phân hệ Định dạng văn bản đang tắt trong cấu hình dùng chung.';
    case 'PROCESSOR_NOT_CONFIGURED': return 'Bộ xử lý DOCX chưa được cấu hình trên máy chủ.';
    case 'PROCESSOR_UNAVAILABLE': return 'Không kết nối được bộ xử lý DOCX riêng. Tệp gốc vẫn được giữ nguyên.';
    case 'PROCESSOR_AUTH_FAILED': return 'Máy chủ không xác thực được với bộ xử lý DOCX riêng.';
    case 'PROCESSOR_BUSY': return 'Bộ xử lý DOCX đang bận. Hãy thử lại sau.';
    case 'UNSUPPORTED_FILE_TYPE':
    case 'FILE_TYPE_MISMATCH': return 'Chỉ hỗ trợ tài liệu Word DOCX hợp lệ.';
    case 'MALFORMED_DOCX': return 'Tệp không phải gói DOCX hợp lệ hoặc không thể đọc an toàn.';
    case 'INPUT_TOO_LARGE':
    case 'FILE_TOO_LARGE': return 'Tệp vượt quá giới hạn 20 MiB.';
    case 'FILE_NOT_FOUND': return 'Không tìm thấy tệp trong kho tài liệu của tài khoản này.';
    case 'INVALID_SERVER_RESPONSE': return 'Máy chủ trả về thông tin tài liệu không hợp lệ.';
    case 'OUTPUT_INTEGRITY_FAILED': return 'Bản DOCX mới không vượt qua bước kiểm tra sau xử lý.';
    case 'SOURCE_IMMUTABILITY_VIOLATION': return 'Máy chủ phát hiện tệp nguồn thay đổi; thao tác đã dừng.';
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
    case 'FILE_INTEGRITY_FAILED': return 'Kích thước bản tải xuống không khớp với thông tin tệp đã lưu.';
    case 'EXECUTION_RECONCILIATION_REQUIRED':
    case 'EXECUTION_IN_PROGRESS': return 'Máy chủ chưa xác nhận được kết quả thao tác. Đừng gửi lại ngay; hãy kiểm tra trạng thái trước.';
    case 'PROCESSING_TIMEOUT': return 'Bộ xử lý DOCX đã hết thời gian chờ. Hãy thử kiểm tra lại tệp.';
    case 'NETWORK_ERROR': return 'Không kết nối được máy chủ. Hãy kiểm tra kết nối rồi thử lại.';
    case 'ABORTED': return 'Đã hủy thao tác.';
    // A wrapped, non-domain failure. The server refused the request safely but the
    // cause was not a specific Processor or file fault, so say that plainly and point
    // at the correlation id instead of claiming the document is fine or unchanged.
    case 'DOCUMENT_PROCESSING_FAILED': return 'Máy chủ không hoàn tất được kiểm tra tệp vì lỗi nội bộ. Tệp gốc không bị ghi đè; hãy thử lại hoặc gửi mã lỗi (correlation id) để được kiểm tra.';
    case 'EXECUTION_ERROR': return 'Máy chủ gặp lỗi khi thực hiện thao tác. Tệp gốc không bị ghi đè.';
    case 'PROCESSOR_INVALID_RESPONSE': return 'Bộ xử lý DOCX trả về kết quả không hợp lệ. Tệp gốc không bị ghi đè.';
    case 'RESULT_TOO_LARGE': return 'Kết quả kiểm tra vượt quá giới hạn cho phép.';
    default: return 'Không thể hoàn tất thao tác DOCX. Bản gốc không bị ghi đè.';
  }
}

/** Appends the server request id so a failure can be traced without exposing secrets. */
function withRequestId(message: string, requestId?: string): string {
  return requestId ? `${message} (Mã yêu cầu: ${requestId})` : message;
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
    return mapCapabilityError(code);
  }
  return fallback;
}

export function DocumentFormattingModule() {
  const { user, loading: authLoading } = useFirebaseAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<PublicUserFile | null>(null);
  const [inspection, setInspection] = useState<DocumentInspection | null>(null);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>('');
  const [desiredValue, setDesiredValue] = useState<string>('');
  const [pendingApply, setPendingApply] = useState<PendingApply | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconcileOutput | null>(null);
  const [chosenTypeKey, setChosenTypeKey] = useState<string | null>(null);
  const [legacyArtifact, setLegacyArtifact] = useState<NonNullable<ReconcileOutput['legacyOutputFile']> | null>(null);
  const [output, setOutput] = useState<ApplyOutput | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  /**
   * Owner the currently held state belongs to. Every owner-scoped value above
   * is only meaningful for this UID, so nothing is rendered or sent to the
   * server until the scope effect has bound the state to the current user.
   */
  const [scopeUid, setScopeUid] = useState<string | null>(null);
  const [moduleActive, setModuleActive] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const resolvedUid = user?.uid ?? null;
  const scopeReady = !authLoading && scopeUid === resolvedUid && moduleActive;

  useEffect(() => () => {
    requestIdRef.current += 1;
    activeRequestRef.current?.abort();
  }, []);

  /**
   * One owner boundary for the whole module. On sign-in, sign-out, account
   * switch and module disable, in-flight work is aborted and every response
   * is invalidated so no previous owner's file, inspection, proposal, output
   * or pending-apply marker can leak into the next session. The per-UID marker
   * itself is deliberately preserved: an unresolved mutation must stay
   * recoverable for the owner that started it.
   */
  useEffect(() => {
    if (authLoading) return;
    const nextUid = user?.uid ?? null;
    requestIdRef.current += 1;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setSelectedFile(null);
    setSelectionError(null);
    setSourceFile(null);
    // The inspection carries the previous owner's document content, detected
    // type and findings, so it must be dropped with the rest of the owner scope.
    setInspection(null);
    setChosenTypeKey(null);
    setReconciliation(null);
    setLegacyArtifact(null);
    setSelectedTargetKey('');
    setDesiredValue('');
    setOutput(null);
    setBusy(null);
    setError(null);
    setDownloadError(null);
    setPendingApply(nextUid ? restorePendingApply(nextUid) : null);
    setScopeUid(nextUid);
  }, [authLoading, user?.uid]);

  /** Disable the packaged module fails closed: stop work, keep the marker recoverable. */
  useEffect(() => {
    const sync = (payload?: { moduleId?: string; enabled?: boolean }) => {
      if (payload?.moduleId && payload.moduleId !== 'document-formatting') return;
      const enabled = payload?.moduleId ? payload.enabled === true : moduleRegistry.isEnabled('document-formatting');
      setModuleActive(enabled);
      if (!enabled) {
        requestIdRef.current += 1;
        activeRequestRef.current?.abort();
        activeRequestRef.current = null;
        setBusy(null);
      }
    };
    const offStatus = eventBus.on('module.statusChanged', sync as (payload: unknown) => void);
    const offSynced = eventBus.on('modules.synced', () => sync());
    return () => { offStatus(); offSynced(); };
  }, []);

  /** The profile target the user picked, keyed by property and target id. */
  const selectedTarget = useMemo(
    () => inspection?.mutableTargets.find(target => targetKey(target) === selectedTargetKey) || null,
    [inspection, selectedTargetKey],
  );
  /**
 * The document type the owner will actually be bound by.
 *
 * The detected key is used only when the processor marked it confirmed. Otherwise
 * the owner must pick one of the profile's supported types, and an unconfirmed
 * document blocks apply entirely rather than silently using an inferred type.
 */
function confirmedTypeKey(inspection: DocumentInspection | null, chosen: string | null): string | null {
  const binding = inspection?.binding;
  if (!binding) return null;
  const supported = inspection?.supportedDocumentTypes ?? [];
  // Fail closed: with no supported-type list there is nothing to confirm against,
  // so no document type may be bound at all, not even a detector-confirmed one.
  if (supported.length === 0) return null;
  const candidate = chosen ?? (binding.documentTypeConfirmed ? binding.documentTypeKey : null);
  if (!candidate) return null;
  // Only a type this profile version supports may be bound.
  if (!supported.some(type => type.typeKey === candidate)) return null;
  return candidate;
}

/**
 * True when the owner picked a type other than the detected one, so the current
 * findings and targets are scoped to the wrong type and must not be proposed.
 */
function isTypeReEvaluationPending(inspection: DocumentInspection | null, chosen: string | null): boolean {
  const binding = inspection?.binding;
  if (!binding || !chosen) return false;
  return chosen !== binding.documentTypeKey;
}

const typeReEvaluationPending = isTypeReEvaluationPending(inspection, chosenTypeKey);
const canMutate = scopeReady && inspection?.safeToMutate === true && inspection.packagePolicy === 'NORMAL'
  && confirmedTypeKey(inspection, chosenTypeKey) !== null && !typeReEvaluationPending;
  const selectedFileProblem = selectedFile ? fileSelectionError(selectedFile) : null;

  const startRequest = () => {
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    activeRequestRef.current = controller;
    return { controller, requestId };
  };

  const requestIsCurrent = (requestId: number, signal: AbortSignal) => requestIdRef.current === requestId && !signal.aborted;

  const resetDocumentState = () => {
    requestIdRef.current += 1;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setSelectedFile(null);
    setSelectionError(null);
    setSourceFile(null);
    setSelectedTargetKey('');
    setDesiredValue('');
    setDesiredValue('');
    setOutput(null);
    setBusy(null);
    setError(null);
    setDownloadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearDocument = () => {
    // A dispatched mutation keeps its marker: dropping it here would let the
    // owner start a new operation while the previous outcome is still unknown.
    if (isUncertainApply(pendingApply)) return;
    if (pendingApply && scopeUid) clearStoredPendingApply(scopeUid);
    setPendingApply(null);
    resetDocumentState();
  };

  /**
   * Discard a confirmation challenge. Only legal while no confirmed mutation
   * has been sent under this idempotency key. Re-issuing a challenge over an
   * already-dispatched mutation does not clear that provenance, so the marker
   * survives cancel, clear and reload.
   */
  const cancelChallenge = () => {
    if (!pendingApply || pendingApply.phase !== 'challenge' || pendingApply.dispatched) return;
    if (scopeUid) clearStoredPendingApply(scopeUid);
    setPendingApply(null);
    setOutput(null);
    setError(null);
    setDownloadError(null);
  };

  const uploadAndInspect = async (confirmedTypeKey?: string | null) => {
    if (!scopeReady || !scopeUid || !selectedFile || selectedFileProblem || busy) return;
    setError(null);
    setInspection(null);
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
      // A re-inspection is only reachable while no marker is pending. Drop an
      // undispatched challenge; a recovery marker is never silently discarded.
      setPendingApply(current => (current?.phase === 'challenge' ? null : current));
      setBusy('inspect');
      setSelectedTargetKey('');
      setError(null);
      const result = await clientCapabilityRegistry.execute<{ fileId: string; confirmedDocumentTypeKey?: string }, InspectOutput>(
        'document.inspect',
        confirmedTypeKey ? { fileId: canonicalFile.fileId, confirmedDocumentTypeKey: confirmedTypeKey } : { fileId: canonicalFile.fileId },
        { signal },
      );
      if (!requestIsCurrent(requestId, signal)) return;
      if (!result.success || !result.result?.inspection) {
        setError(withRequestId(mapCapabilityError(result.errorCode), result.requestId));
        return;
      }
      setInspection(result.result.inspection);
      // Only a confirmed or explicitly chosen type counts as the owner's choice.
      // An inconclusive detection stays unselected so the owner must act.
      const bound = result.result.inspection.binding;
      setChosenTypeKey(bound && (bound.documentTypeConfirmed || bound.ownerConfirmed) ? bound.documentTypeKey : null);
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
    if (!scopeReady || !scopeUid || !sourceFile || !inspection?.binding || !canMutate ||
        !selectedTarget || !desiredValue || busy || pendingApply) return;
    // A confirmed value must actually differ from the inspected one.
    if (desiredValue === (selectedTarget.currentValue ?? '')) return;
    // Bind the type the owner actually confirmed, never an inferred one.
    const boundTypeKey = confirmedTypeKey(inspection, chosenTypeKey);
    if (!boundTypeKey) return;
    setError(null);
    const { controller, requestId } = startRequest();
    const owner = scopeUid;
    const binding = inspection.binding;
    const input: ApplyInput = {
      fileId: sourceFile.fileId,
      sourceSha256: inspection.sourceSha256,
      property: selectedTarget.property,
      targetId: selectedTarget.targetId,
      documentTypeKey: boundTypeKey,
      expectedBefore: selectedTarget.currentValue ?? '',
      desiredAfter: desiredValue,
      profileId: binding.id,
      profileDigest: binding.digest,
      ruleId: selectedTarget.ruleId,
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
        const nextPending: PendingApply = {
          input,
          confirmationId: result.confirmationId,
          confirmationExpiresAt: result.confirmationExpiresAt,
          idempotencyKey: operationKey,
          phase: 'challenge',
          // A challenge preflight sends no confirmed mutation, so the marker is
          // still discardable until the owner confirms.
          dispatched: false,
        };
        if (!persistPendingApply(owner, nextPending)) {
          setError('Trình duyệt không thể lưu mã thao tác an toàn. Bật session storage rồi tạo lại yêu cầu xác nhận.');
          return;
        }
        setPendingApply(nextPending);
        return;
      }
      setError(withRequestId(mapCapabilityError(result.errorCode), result.requestId));
    } finally {
      if (requestIdRef.current === requestId) {
        setBusy(null);
        activeRequestRef.current = null;
      }
    }
  };

  const confirmApply = async () => {
    if (!scopeReady || !scopeUid || !pendingApply || pendingApply.phase !== 'challenge' || busy) return;
    // A pre-profile marker is reconciled read-only. It is never cast into the
    // current shape, because doing so would invent a profile, target and rule.
    if (isLegacyApplyInput(pendingApply.input)) {
      setError('Thao tác này dùng định dạng cũ nên không thể xác nhận lại tự động. Hãy dùng nút kiểm tra lại để xem máy chủ đã ghi nhận kết quả chưa.');
      return;
    }
    const owner = scopeUid;
    // Mark the mutation as sent BEFORE dispatching it. If the response is lost
    // the outcome is unknown, and only this flag makes that recoverable.
    const dispatched: PendingApply = { ...pendingApply, phase: 'recovery', dispatched: true };
    if (!persistPendingApply(owner, dispatched)) {
      setError('Không thể lưu trạng thái thao tác an toàn. Chưa gửi yêu cầu xác nhận; hãy bật session storage rồi thử lại.');
      return;
    }
    setPendingApply(dispatched);
    if (Date.parse(dispatched.confirmationExpiresAt) <= Date.now()) {
      setError('Yêu cầu xác nhận đã hết hạn. Hãy kiểm tra lại trạng thái bằng cùng mã thao tác.');
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
        setError(withRequestId(mapCapabilityError(result.errorCode), result.requestId));
        return;
      }
      setOutput(result.result);
      setPendingApply(null);
      clearStoredPendingApply(owner);
      setError(null);
    } finally {
      if (requestIdRef.current === requestId) {
        setBusy(null);
        activeRequestRef.current = null;
      }
    }
  };

  const refreshRecoveryChallenge = async () => {
    if (!scopeReady || !scopeUid || !pendingApply || busy) return;
    // A legacy marker may sit in either phase: re-issuing a challenge over an
    // already-dispatched legacy mutation returns it to `challenge` while the
    // outcome stays unknown. Reconciliation is read-only, so it is allowed in
    // both phases and must not be blocked by the phase guard.
    const legacy = isLegacyApplyInput(pendingApply.input);
    if (!legacy && pendingApply.phase !== 'recovery') return;
    // Narrowed through a local so the payload type survives into both branches.
    const markerInput = pendingApply.input;
    const owner = scopeUid;
    setError(null);

    // A pre-profile marker cannot be replayed through the mutation contract, so it
    // is reconciled read-only against the durable execution record. This only reports
    // what that record proves; it never re-issues the operation, and it runs for both
    // phases because an ambiguous legacy marker may legitimately sit in `challenge`.
    if (isLegacyApplyInput(markerInput)) {
      const { controller, requestId } = startRequest();
      setBusy('prepare');
      try {
        const reconciled = await clientCapabilityRegistry.execute<{ idempotencyKey: string; dispatchedInput: LegacyApplyInput }, ReconcileOutput>(
          'document.reconcileFormatting',
          { idempotencyKey: pendingApply.idempotencyKey, dispatchedInput: markerInput },
          { signal: controller.signal },
        );
        if (!requestIsCurrent(requestId, controller.signal)) return;
        if (!reconciled.success || !reconciled.result) {
          setError(withRequestId(mapCapabilityError(reconciled.errorCode), reconciled.requestId));
          return;
        }
        setReconciliation(reconciled.result);
        // The marker is unlocked only when the record proves a completed change whose
        // artifact this build can actually open. Every other outcome keeps the key and
        // the marker, so an unproven result is never silently dropped.
        if (reconciled.result.outputContract === 'current' && reconciled.result.output) {
          setOutput(reconciled.result.output);
          setPendingApply(null);
          clearStoredPendingApply(owner);
        } else if (reconciled.result.outputContract === 'legacy_alignment' && reconciled.result.legacyOutputFile) {
          setLegacyArtifact(reconciled.result.legacyOutputFile);
          setPendingApply(null);
          clearStoredPendingApply(owner);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setBusy(null);
          activeRequestRef.current = null;
        }
      }
      return;
    }

    const { controller, requestId } = startRequest();
    setBusy('prepare');
    try {
      const result = await clientCapabilityRegistry.execute<ApplyInput, ApplyOutput>(
        'document.applyAlignment',
        markerInput,
        { idempotencyKey: pendingApply.idempotencyKey, signal: controller.signal },
      );
      if (!requestIsCurrent(requestId, controller.signal)) return;
      if (result.requiresConfirmation && result.confirmationId && result.confirmationExpiresAt) {
        // Re-issuing a challenge does NOT clear the fact that a mutation was
        // already sent under this idempotency key. The record therefore stays
        // `dispatched: true` even though its phase returns to `challenge`, so
        // cancel, clear and reload keep the marker and no new key is issued.
        const nextPending: PendingApply = {
          ...pendingApply,
          confirmationId: result.confirmationId,
          confirmationExpiresAt: result.confirmationExpiresAt,
          phase: 'challenge',
          dispatched: true,
        };
        if (!persistPendingApply(owner, nextPending)) {
          setError('Không thể lưu yêu cầu xác nhận mới. Trạng thái thao tác cũ vẫn được giữ để tiếp tục an toàn.');
          return;
        }
        setPendingApply(nextPending);
        return;
      }
      setError(withRequestId(mapCapabilityError(result.errorCode), result.requestId));
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

  const downloadLegacyArtifact = async () => {
    if (!legacyArtifact || busy) return;
    const { controller, requestId } = startRequest();
    setBusy('download');
    setDownloadError(null);
    try {
      // Same canonical owner-bound download path as a current result.
      await saveDownload(legacyArtifact, controller.signal);
    } catch (caught) {
      if (requestIsCurrent(requestId, controller.signal)) setDownloadError(safeMessage(caught, 'Không tải được bản DOCX đã tạo.'));
    } finally {
      if (requestIdRef.current === requestId) {
        setBusy(null);
        activeRequestRef.current = null;
      }
    }
  };

  const selectTarget = (item: MutableTarget) => {
    setSelectedTargetKey(targetKey(item));
    setDesiredValue('');
    setOutput(null);
    setError(null);
    // Re-picking a target abandons an undispatched challenge only.
    setPendingApply(current => (current?.phase === 'challenge' ? null : current));
  };

  const disabled = busy !== null || authLoading || !scopeReady || !user;
  /**
   * A dispatched mutation stays ambiguous until a confirmed apply returns
   * success, no matter which phase the marker currently carries. Rendering keys
   * off this value, never off `phase` alone.
   */
  const uncertainApply = pendingApply?.dispatched === true ? pendingApply : null;
  const signedIn = !!user;

  if (authLoading || !scopeReady) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-5 px-1 pb-8">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Công cụ tài liệu
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Định dạng văn bản Word</h1>
        </header>
        <p role="status" aria-live="polite" className="text-sm text-neutral-600">
          {moduleActive ? 'Đang kiểm tra phiên làm việc của bạn…' : 'Phân hệ Định dạng văn bản đang tắt trong cấu hình dùng chung.'}
        </p>
      </main>
    );
  }

  if (!signedIn) {
    // Signed out: the module is scoped to an owner, so every control stays
    // unavailable and the user is told to sign in instead of being offered a
    // file picker whose handler would silently do nothing.
    return (
      <main className="mx-auto w-full max-w-5xl space-y-5 px-1 pb-8">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Công cụ tài liệu
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Định dạng văn bản Word</h1>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>1. Đăng nhập để bắt đầu</CardTitle>
            <CardDescription>Chỉ tài khoản đã đăng nhập mới được kiểm tra và tạo bản sao DOCX trong kho tài liệu cá nhân của mình.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p role="status" className="text-sm text-neutral-600">Bạn đang không đăng nhập. Hãy đăng nhập rồi tải tệp DOCX lên.</p>
            <input
              ref={fileInputRef}
              id="document-formatting-file"
              aria-label="Chọn tài liệu Word DOCX"
              type="file"
              accept={`${DOCX_MIME_TYPE},.docx`}
              disabled
              className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-neutral-200 disabled:opacity-60"
            />
            <Button type="button" disabled><><Upload className="h-4 w-4" />Tải lên và kiểm tra</></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-1 pb-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
          <FileText className="h-4 w-4" aria-hidden="true" />
          Công cụ tài liệu
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">Định dạng văn bản Word</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-neutral-600">
          Kiểm tra an toàn một tệp DOCX và tạo bản sao mới khi bạn xác nhận thay đổi một thuộc tính định dạng do hồ sơ công ty chỉ định (chữ, khoảng cách đoạn, khổ giấy hoặc lề). Tệp gốc không bị ghi đè; công cụ không dùng Gemini và không đưa ra kết luận về tuân thủ pháp lý.
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
              setSelectedTargetKey('');
              setInspection(null);
              setSelectedTargetKey('');
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
            <Button type="button" onClick={() => void uploadAndInspect()} disabled={!selectedFile || !!selectedFileProblem || disabled || !!pendingApply}>
              {busy === 'upload' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang tải lên…</>
                : busy === 'inspect' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang kiểm tra…</>
                  : sourceFile ? 'Kiểm tra lại tệp' : <><Upload className="h-4 w-4" />Tải lên và kiểm tra</>}
            </Button>
            {(selectedFile || sourceFile) && <Button type="button" variant="outline" onClick={clearDocument} disabled={disabled || isUncertainApply(pendingApply)}>Xóa lựa chọn</Button>}
          </div>
          {busy === 'upload' && <p role="status" aria-live="polite" className="text-xs text-neutral-500">Đang lưu DOCX vào kho tệp cá nhân…</p>}
          {busy === 'inspect' && <p role="status" aria-live="polite" className="text-xs text-neutral-500">Đang kiểm tra cấu trúc DOCX bằng bộ xử lý riêng…</p>}
        </CardContent>
      </Card>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {inspection && (
        <section className="space-y-4" aria-labelledby="document-inspection-title">
          {inspection.binding && (
            <Card>
              <CardHeader>
                <CardTitle>2. Loại văn bản và hồ sơ định dạng đã dùng</CardTitle>
                <CardDescription>Phần này ghi lại đúng hồ sơ và bộ quy tắc mà mọi đề xuất sửa đổi sẽ được xác nhận theo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-neutral-800">
                  Loại văn bản nhận dạng: <strong>{inspection.binding.documentTypeLabelVi}</strong>
                  {inspection.binding.documentTypeConfirmed
                    ? ' (đã xác định rõ)'
                    : ' (cần bạn xác nhận lại trước khi sửa)'}
                </p>
                {inspection.binding.scopeLabelVi && (
                  <p className="text-xs text-neutral-600">
                    Phạm vi quy tắc: <strong>{inspection.binding.scopeLabelVi}</strong>. Tài liệu thuộc phạm vi khác (ví dụ văn bản của Đảng) không thuộc hồ sơ này và không được kết luận theo các quy tắc đã nêu.
                  </p>
                )}
                {(() => {
                  const supported = inspection.supportedDocumentTypes ?? [];
                  const bound = confirmedTypeKey(inspection, chosenTypeKey);
                  const needsChoice = !inspection.binding.documentTypeConfirmed;
                  if (supported.length === 0) return (
                    <p className="text-xs text-amber-700">
                      Máy chủ không trả về danh sách loại văn bản hồ sơ hỗ trợ, nên chưa thể xác nhận loại văn bản và không thể sửa.
                    </p>
                  );
                  return (
                    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
                      <label htmlFor="document-confirm-type" className="block text-xs font-medium text-neutral-700">
                        {needsChoice ? 'Chọn loại văn bản đúng với tài liệu này' : 'Loại văn bản đã dùng để kiểm tra'}
                      </label>
                      <select
                        id="document-confirm-type"
                        className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
                        value={bound ?? ''}
                        disabled={disabled || !!pendingApply}
                        onChange={event => {
                          const next = event.target.value || null;
                          setSelectedTargetKey('');
                          setDesiredValue('');
                          // Re-inspect under the chosen type so the findings and
                          // targets shown belong to it, never to the detected one.
                          void uploadAndInspect(next);
                        }}
                      >
                        <option value="">— Chọn loại văn bản —</option>
                        {supported.map(type => (
                          <option key={type.typeKey} value={type.typeKey}>{type.labelVi}</option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-neutral-600">
                        {needsChoice
                          ? 'Chưa chọn loại văn bản thì chưa thể đề xuất sửa. Loại đã chọn được ghi kèm vào yêu cầu và máy chủ kiểm tra lại đúng loại đó khi tạo bản mới.'
                          : bound === inspection.binding.documentTypeKey
                            ? 'Loại nhận dạng đã được dùng. Bạn có thể chọn loại khác nếu tài liệu thực tế không đúng.'
                            : 'Bạn đã chọn loại khác với loại nhận dạng; yêu cầu sẽ được kiểm tra theo loại bạn chọn.'}
                      </p>
                    </div>
                  );
                })()}
                <p className="text-xs text-neutral-500">
                  Hồ sơ {inspection.binding.id} · phiên bản {inspection.binding.version} · bộ quy tắc {inspection.binding.rulePackId}
                </p>
                <p className="text-xs text-neutral-500">Mã hồ sơ: {inspection.binding.digest.slice(0, 16)}…</p>
                {inspection.scopeStatement && <p className="text-xs leading-relaxed text-neutral-700">{inspection.scopeStatement}</p>}
                {!inspection.fullComplianceClaimAllowed && (
                  <p className="text-xs text-neutral-500">
                    Kết quả trên chỉ nằm trong phạm vi các quy tắc kiểm tra được từ nội dung tệp, không phải kết luận tuân thủ toàn diện.
                  </p>
                )}
                {inspection.findings.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900">Điểm chưa đúng phát hiện trong tệp ({inspection.findings.length})</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-900">
                      {inspection.findings.map((finding, index) => (
                        <li key={`${finding.ruleId}-${index}`}>{describeFinding(finding)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {inspection.findings.length === 0 && (
                  <p className="text-xs text-neutral-500">Không phát hiện sai lệch nào trong phạm vi đã kiểm tra.</p>
                )}
              </CardContent>
            </Card>
          )}
          <div className={`flex items-start gap-3 rounded-lg border p-4 ${canMutate ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
            {canMutate ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /> : <ShieldX className="mt-0.5 h-5 w-5 shrink-0" />}
            <div>
              <h2 id="document-inspection-title" className="text-sm font-semibold">{canMutate ? 'Đã kiểm tra; có thể chọn thuộc tính cần sửa' : 'Chỉ kiểm tra; không cho phép chỉnh sửa'}</h2>
              <p className="mt-1 text-xs leading-relaxed">
                Mức an toàn của tệp: <strong>{packagePolicyLabel(inspection.packagePolicy)}</strong>. Đã đọc {inspection.paragraphs.length} đoạn{inspection.paragraphsTruncated ? ' đầu tiên (danh sách đã được rút gọn)' : ''}. Hiện chỉ hỗ trợ căn lề đặt trực tiếp.
              </p>
            </div>
          </div>

          {inspection.diagnostics.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Ghi chú kiểm tra</CardTitle></CardHeader>
              <CardContent><ul className="list-disc space-y-1 pl-5 text-xs text-neutral-700">{inspection.diagnostics.map((item, index) => <li key={`${item.code}-${index}`}>{diagnosticLabel(item.code, item.message)}</li>)}</ul></CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <Card>
              <CardHeader>
                <CardTitle>3. Chọn nội dung cần sửa</CardTitle>
                <CardDescription>Mỗi mục là một thuộc tính định dạng mà hồ sơ công ty kiểm tra được trên chính tệp này.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {typeReEvaluationPending ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Bạn đã chọn loại văn bản khác với loại nhận dạng. Các đề xuất bên dưới được tính cho loại nhận dạng nên không dùng để sửa theo loại bạn chọn. Hãy kiểm tra lại tệp để tính lại đề xuất theo loại đã chọn.
                  </p>
                ) : inspection.mutableTargets.length === 0 ? (
                  <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">Không có thuộc tính nào đạt điều kiện sửa an toàn trên tài liệu này.</p>
                ) : inspection.mutableTargets.map(item => {
                  const eligible = canMutate;
                  const selected = selectedTargetKey === targetKey(item);
                  return (
                    <label key={targetKey(item)} className={`flex gap-3 rounded-lg border p-3 ${eligible ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} ${selected ? 'border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900' : 'border-neutral-200'}`}>
                      <input
                        type="radio"
                        name="document-target"
                        value={targetKey(item)}
                        checked={selected}
                        disabled={!eligible || disabled || !!pendingApply}
                        onChange={() => selectTarget(item)}
                        aria-label={`Chọn ${item.propertyLabelVi} tại ${targetScopeLabel(item)}`}
                        className="mt-1 accent-neutral-900"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                          <span className="font-semibold text-neutral-700">{item.propertyLabelVi}</span>
                          <span className="text-neutral-500 capitalize">{targetScopeLabel(item)}</span>
                        </span>
                        <span className="mt-1 block text-sm text-neutral-800">
                          Hiện tại: {item.currentValue ?? 'chưa đặt trực tiếp'}{item.unit ? ` ${item.unit}` : ''}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle>4. Chọn giá trị mới và xem xác nhận</CardTitle>
                <CardDescription>Mỗi lần xác nhận chỉ đổi một thuộc tính và tạo một tệp DOCX mới.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label htmlFor="document-formatting-value" className="block text-xs font-medium text-neutral-700">
                  {selectedTarget ? selectedTarget.propertyLabelVi : 'Thuộc tính cần sửa'}
                </label>
                {selectedTarget?.property === 'paragraph.alignment' ? (
                  <select
                    id="document-formatting-value"
                    value={desiredValue}
                    disabled={disabled || !!pendingApply || !canMutate}
                    onChange={event => setDesiredValue(event.currentTarget.value)}
                    className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:bg-neutral-100 disabled:text-neutral-500"
                  >
                    <option value="">Chọn giá trị</option>
                    {candidateValues(selectedTarget).map(value => (
                      <option key={value} value={value}>{alignmentLabel(value as Alignment)}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="document-formatting-value"
                    type="text"
                    inputMode="decimal"
                    value={desiredValue}
                    disabled={disabled || !!pendingApply || !canMutate || !selectedTarget}
                    onChange={event => setDesiredValue(event.currentTarget.value)}
                    placeholder={selectedTarget ? `Giá trị mới tính bằng ${selectedTarget.unit || 'chuẩn'}` : 'Chọn thuộc tính ở bên trái'}
                    className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:bg-neutral-100 disabled:text-neutral-500"
                  />
                )}
                {selectedTarget && (
                  <p className="text-xs text-neutral-500">
                    Hiện tại {selectedTarget.currentValue ?? 'chưa đặt trực tiếp'}
                    {selectedTarget.unit ? ` ${selectedTarget.unit}` : ''}
                    {desiredValue ? ` → mới ${desiredValue}${selectedTarget.unit ? ` ${selectedTarget.unit}` : ''}` : ''}
                  </p>
                )}
                {selectedTarget && (
                  <p className="text-xs text-neutral-500">Quy tắc áp dụng: {selectedTarget.ruleId}</p>
                )}
                <Button type="button" className="w-full" onClick={prepareApply}
                  disabled={!canMutate || !selectedTarget || !desiredValue || desiredValue === (selectedTarget?.currentValue ?? '') || disabled || !!pendingApply}>
                  {busy === 'prepare' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang chuẩn bị…</> : 'Tiếp tục để xem xác nhận'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {pendingApply && pendingApply.phase === 'challenge' && !pendingApply.dispatched && (
        <section role="alertdialog" aria-modal="false" aria-labelledby="document-confirm-title" className="rounded-xl border border-blue-300 bg-blue-50 p-4 shadow-xs">
          <h2 id="document-confirm-title" className="text-sm font-semibold text-blue-950">Xác nhận tạo bản DOCX mới</h2>
          <p className="mt-1 text-sm leading-relaxed text-blue-900">{describeChange(pendingApply.input)}</p>
          <p className="mt-2 text-xs text-blue-800">Yêu cầu hết hạn lúc {confirmationDeadline(pendingApply.confirmationExpiresAt)}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={confirmApply} disabled={disabled}>
              {busy === 'apply' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang tạo bản sao…</> : 'Xác nhận và tạo bản sao'}
            </Button>
            <Button type="button" variant="outline" onClick={cancelChallenge} disabled={disabled}>Hủy</Button>
          </div>
        </section>
      )}

      {uncertainApply && (
        <section role="status" aria-labelledby="document-recovery-title" className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 id="document-recovery-title" className="text-sm font-semibold text-amber-950">Cần kiểm tra trạng thái thao tác</h2>
          <p className="mt-1 text-sm leading-relaxed text-amber-900">
            Máy chủ chưa trả về kết quả xác nhận cuối cùng. Mã thao tác và đúng nội dung yêu cầu đã được giữ trong phiên này; hãy kiểm tra lại bằng cùng mã trước khi bắt đầu thao tác khác.
          </p>
          <p className="mt-2 text-xs text-amber-800">
            {describeChange(uncertainApply.input)}. Không gửi lại bằng mã mới.
          </p>
          {uncertainApply.phase === 'challenge' && (
            <p className="mt-2 text-xs text-amber-800">
              Yêu cầu xác nhận mới đã được cấp, nhưng thao tác cũ đã gửi trước đó chưa có kết quả chắc chắn. Xác nhận lại chỉ dùng lại đúng mã thao tác này.
            </p>
          )}
          {isLegacyApplyInput(uncertainApply.input) && (
            <p className="mt-2 text-xs text-amber-800">
              Thao tác này được tạo bởi phiên bản cũ nên dùng định dạng khác. Máy chủ sẽ chỉ đối chiếu kết quả đã ghi nhận, không gửi lại yêu cầu thay đổi tài liệu.
            </p>
          )}
          {busy === 'apply' && <p role="status" aria-live="polite" className="mt-2 text-xs text-amber-800">Đang kiểm tra kết quả thao tác…</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {uncertainApply.phase === 'challenge' && !isLegacyApplyInput(uncertainApply.input) && (
              <Button type="button" onClick={confirmApply} disabled={disabled}>
                {busy === 'apply' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang kiểm tra…</> : 'Xác nhận lại bằng cùng mã thao tác'}
              </Button>
            )}
            {/*
              `refreshRecoveryChallenge` only acts on a recovery-phase marker, or on a
              legacy marker in either phase. Rendering it for a current-shape marker
              already in `challenge` would offer a button that silently does nothing,
              so it is hidden there and the confirm-again action above is used instead.
            */}
            {(uncertainApply.phase === 'recovery' || isLegacyApplyInput(uncertainApply.input)) && (
              <Button type="button" variant={uncertainApply.phase === 'challenge' ? 'outline' : 'default'} onClick={refreshRecoveryChallenge} disabled={disabled}>
                {busy === 'prepare' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang kiểm tra mã thao tác…</> : 'Kiểm tra lại bằng cùng mã thao tác'}
              </Button>
            )}
          </div>
        </section>
      )}

      {reconciliation && (
        <section aria-labelledby="document-reconciliation-title" className="rounded-xl border border-neutral-300 bg-neutral-50 p-4">
          <h2 id="document-reconciliation-title" className="text-sm font-semibold text-neutral-900">Kết quả đối chiếu thao tác trước</h2>
          <p className="mt-1 text-sm text-neutral-700">{reconciliationSummary(reconciliation)}</p>
        </section>
      )}

      {legacyArtifact && (
        <section aria-labelledby="document-legacy-artifact-title" className="rounded-xl border border-neutral-300 bg-neutral-50 p-4">
          <h2 id="document-legacy-artifact-title" className="text-sm font-semibold text-neutral-900">Bản DOCX tạo từ thao tác trước</h2>
          <p className="mt-1 break-all text-sm text-neutral-800">{legacyArtifact.originalName}</p>
          <p className="mt-1 text-xs text-neutral-600">
            Bản này được tạo bởi định dạng cũ nên không có hồ sơ định dạng kèm theo. Hãy mở và kiểm tra trước khi sử dụng.
          </p>
          {downloadError && <p role="alert" className="mt-2 text-xs text-red-700">{downloadError}</p>}
          <Button type="button" className="mt-3" onClick={downloadLegacyArtifact} disabled={disabled}>
            {busy === 'download' ? <><LoaderCircle className="h-4 w-4 animate-spin" />Đang tải…</> : <><Download className="h-4 w-4" />Tải bản DOCX này</>}
          </Button>
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
                 Đã mở lại và kiểm tra bản mới; cần lại sau chỉnh sửa khớp yêu cầu, tệp nguồn không thay đổi. Đã đổi {describeOutputChange(output)}.
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
