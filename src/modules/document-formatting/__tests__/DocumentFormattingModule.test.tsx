// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const moduleMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  uploadUserFile: vi.fn(),
  precheckFile: vi.fn(),
  mapUploadErrorCode: vi.fn((code: string) => code),
  authFetch: vi.fn(),
  auth: { user: { uid: 'user-1' } as { uid: string } | null, loading: false },
  moduleEnabled: true,
  listeners: new Map<string, (payload: unknown) => void>(),
}));

vi.mock('../../../core/capabilities/capabilityRegistry', () => ({
  clientCapabilityRegistry: { execute: moduleMocks.execute },
}));
vi.mock('../../../core/files/fileUploadClient', () => ({
  uploadUserFile: moduleMocks.uploadUserFile,
  precheckFile: moduleMocks.precheckFile,
  mapUploadErrorCode: moduleMocks.mapUploadErrorCode,
}));
vi.mock('../../../lib/authFetch', () => ({ authFetch: moduleMocks.authFetch }));
vi.mock('../../../lib/FirebaseAuthProvider', () => ({ useFirebaseAuth: () => moduleMocks.auth }));
vi.mock('../../../core/modules/moduleRegistry', () => ({
  moduleRegistry: { isEnabled: () => moduleMocks.moduleEnabled },
}));
vi.mock('../../../core/events/eventBus', () => ({
  eventBus: {
    on: (name: string, handler: (payload: unknown) => void) => {
      moduleMocks.listeners.set(name, handler);
      return () => moduleMocks.listeners.delete(name);
    },
  },
}));

import { DocumentFormattingModule } from '../DocumentFormattingModule';
import { DOCX_MIME_TYPE } from '../../../../shared/contracts/fileUploadPolicy';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const inspection = {
  sourceSha256: 'a'.repeat(64),
  profile: 'company-formatting-profile-v1',
  safeToMutate: true,
  packagePolicy: 'NORMAL' as const,
  paragraphs: [{ paragraphId: 'p1', text: 'Noi dung doan mot', directAlignment: 'LEFT' as const, issueId: null }],
  paragraphsTruncated: false,
  diagnostics: [],
  binding: {
    id: 'HOATIEU-MIENBAC-ADMIN-V1',
    version: '1.0.0-provisional',
    digest: 'b'.repeat(64),
    rulePackId: 'ADMIN-ND30-VERIFIED-RC-V20',
    documentTypeKey: 'quyet_dinh',
    documentTypeLabelVi: 'Quyet dinh',
    documentTypeConfirmed: true,
  },
  findings: [
    {
      ruleId: 'ND30.PL1.I.II.6E.BODY_SIZE',
      targetKey: 'semantic_component.body.font_size_pt',
      property: 'font_size_pt',
      status: 'FAIL' as const,
      severity: 'LEGAL_ERROR',
      expected: 'type=numeric_range; min=13; max=14; unit=pt',
      observed: '12',
      patchEligibility: 'ELIGIBLE',
      propertyLabelVi: 'Co chu doan',
      unit: 'pt',
      targetId: null,
    },
  ],
  mutableTargets: [
    {
      targetId: 'p1',
      property: 'run.font_size_pt',
      currentValue: '12',
      unit: 'pt',
      propertyLabelVi: 'Co chu doan',
      ruleId: 'ND30.PL1.I.II.6E.BODY_SIZE',
      directOnly: true,
    },
    {
      targetId: 's1',
      property: 'section.margin_right_mm',
      currentValue: '15',
      unit: 'mm',
      propertyLabelVi: 'Le phai',
      ruleId: 'ND30.PL1.I.GENERAL.MARGIN_RIGHT',
      directOnly: false,
    },
  ],
  ruleSubsetSize: 48,
  applicableRules: 47,
  evaluatedRules: 15,
  failCount: 1,
  needsReviewCount: 0,
  notEvaluatedCount: 32,
  evaluatedCoveragePercent: 31.9,
  fullComplianceClaimAllowed: false,
  scopeStatement: 'Kiem tra theo ho so HOATIEU-MIENBAC-ADMIN-V1 phien ban 1.0.0-provisional.',
  supportedProperties: ['run.font_size_pt', 'section.margin_right_mm'],
  supportedDocumentTypes: [
    { typeKey: 'cong_van', labelVi: 'Cong van', hasTypeHeading: false },
    { typeKey: 'quyet_dinh', labelVi: 'Quyet dinh', hasTypeHeading: true },
    { typeKey: 'bao_cao', labelVi: 'Bao cao', hasTypeHeading: true },
    { typeKey: 'ke_hoach', labelVi: 'Ke hoach', hasTypeHeading: true },
    { typeKey: 'to_trinh', labelVi: 'To trinh', hasTypeHeading: true },
  ],
};

const output = {
  success: true as const,
  sourceFileId: 'source-1',
  outputFile: {
    fileId: 'output-1',
    originalName: 'van-ban-formatted.docx',
    mimeType: DOCX_MIME_TYPE,
    sizeBytes: 30,
    status: 'ready' as const,
    createdAt: '2026-10-03T00:00:00.000Z',
  },
  changeManifest: {
    property: 'run.font_size_pt',
    targetId: 'p1',
    propertyLabelVi: 'Co chu doan',
    unit: 'pt',
    before: '12',
    after: '13',
    ruleId: 'ND30.PL1.I.II.6E.BODY_SIZE',
    sourceSha256: 'a'.repeat(64),
    outputSha256: 'b'.repeat(64),
    appliedAt: '2026-10-03T00:00:00.000Z',
  },
  verification: { reopened: true as const, revalidated: true as const, sourceUnchanged: true as const, outputInspectionPassed: true as const },
  profile: {
    id: 'HOATIEU-MIENBAC-ADMIN-V1',
    version: '1.0.0-provisional',
    digest: 'b'.repeat(64),
    documentTypeKey: 'quyet_dinh',
    documentTypeLabelVi: 'Quyet dinh',
  },
};

describe('DocumentFormattingModule', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.sessionStorage.clear();
    moduleMocks.execute.mockReset();
    moduleMocks.listeners.clear();
    moduleMocks.moduleEnabled = true;
    moduleMocks.auth.user = { uid: 'user-1' };
    moduleMocks.uploadUserFile.mockReset().mockResolvedValue({
      fileId: 'source-1', name: 'van-ban.docx', mimeType: DOCX_MIME_TYPE, sizeBytes: 30, status: 'ready',
    });
    moduleMocks.precheckFile.mockReset().mockReturnValue(null);
    moduleMocks.mapUploadErrorCode.mockClear();
    moduleMocks.authFetch.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render() {
    await act(async () => root.render(<DocumentFormattingModule />));
  }

  async function clickButton(label: string) {
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes(label));
    if (!button) throw new Error(`Button not found: ${label}`);
    await act(async () => button.click());
  }

  async function selectDocx() {
    const input = container.querySelector<HTMLInputElement>('#document-formatting-file');
    if (!input) throw new Error('DOCX file input is missing');
    const file = new File(['docx bytes'], 'van-ban.docx', { type: DOCX_MIME_TYPE });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  }

  async function selectFirstTarget() {
    const target = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]');
    if (!target) throw new Error('Profile target radio is missing');
    await act(async () => target.click());
  }

  async function setValue(value: string) {
    const field = container.querySelector<HTMLInputElement>('#document-formatting-value') ?? container.querySelector<HTMLSelectElement>('#document-formatting-value');
    if (!field) throw new Error('Desired value field is missing');
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set;
    await act(async () => {
      setter?.call(field, value);
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  it('uploads, inspects, obtains a confirmation challenge and creates a verified copy', async () => {
    const confirmationId = 'confirm-001';
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId, confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString() })
      .mockResolvedValueOnce({ success: true, result: output, confirmationId });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));
    expect(moduleMocks.uploadUserFile).toHaveBeenCalledOnce();
    expect(moduleMocks.execute.mock.calls[0][0]).toBe('document.inspect');

    const firstTarget = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]');
    expect(firstTarget?.disabled).toBe(false);
    await act(async () => firstTarget!.click());
    await setValue('13');
    await clickButton('Tiếp tục để xem xác nhận');
    await vi.waitFor(() => expect(container.textContent).toContain('Xác nhận tạo bản DOCX mới'));

    const prepareOptions = moduleMocks.execute.mock.calls[1][2];
    expect(moduleMocks.execute.mock.calls[1][0]).toBe('document.applyAlignment');
    expect(prepareOptions.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(prepareOptions.confirmationId).toBeUndefined();

    await clickButton('Xác nhận và tạo bản sao');
    await vi.waitFor(() => expect(container.textContent).toContain('Đã tạo và kiểm tra bản DOCX mới'));
    const confirmOptions = moduleMocks.execute.mock.calls[2][2];
    expect(moduleMocks.execute.mock.calls[2][0]).toBe('document.applyAlignment');
    expect(moduleMocks.execute.mock.calls[2][1]).toEqual(moduleMocks.execute.mock.calls[1][1]);
    expect(confirmOptions.confirmationId).toBe(confirmationId);
    expect(confirmOptions.idempotencyKey).toBe(prepareOptions.idempotencyKey);
    expect(container.textContent).toContain('van-ban-formatted.docx');
    expect(container.textContent).toContain('tệp nguồn không thay đổi');
    expect(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1')).toBeNull();
  });

  it('keeps an uncertain apply bound to its original idempotency key and restores it after reload', async () => {
    const firstExpiry = new Date(Date.now() + 60_000).toISOString();
    const secondExpiry = new Date(Date.now() + 60_000).toISOString();
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'confirm-first', confirmationExpiresAt: firstExpiry })
      .mockResolvedValueOnce({ success: false, errorCode: 'EXECUTION_RECONCILIATION_REQUIRED' })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'confirm-second', confirmationExpiresAt: secondExpiry })
      .mockResolvedValueOnce({ success: true, result: output });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));
    const target = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]')!;
    await act(async () => target.click());
    await setValue('13');
    await clickButton('Tiếp tục để xem xác nhận');
    await vi.waitFor(() => expect(container.textContent).toContain('Xác nhận tạo bản DOCX mới'));
    const originalInput = moduleMocks.execute.mock.calls[1][1];
    const originalKey = moduleMocks.execute.mock.calls[1][2].idempotencyKey;

    await clickButton('Xác nhận và tạo bản sao');
    await vi.waitFor(() => expect(container.textContent).toContain('Cần kiểm tra trạng thái thao tác'));
    expect(moduleMocks.execute.mock.calls[2][2].idempotencyKey).toBe(originalKey);
    expect(container.querySelector<HTMLInputElement>('#document-formatting-file')?.disabled).toBe(true);
    const recoveryRecord = JSON.parse(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1') || 'null');
    expect(recoveryRecord).toMatchObject({ userId: 'user-1', phase: 'recovery', idempotencyKey: originalKey, input: originalInput });

    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain('Cần kiểm tra trạng thái thao tác'));
    expect(moduleMocks.execute).toHaveBeenCalledTimes(3);

    await clickButton('Kiểm tra lại bằng cùng mã thao tác');
    // Re-issuing a challenge over a dispatched mutation must not present a
    // cancelable challenge; the ambiguous state stays visible instead.
    await vi.waitFor(() => expect(container.textContent).toContain('Yêu cầu xác nhận mới đã được cấp'));
    expect(container.textContent).not.toContain('Xác nhận tạo bản DOCX mới');
    const recoveryPreflight = moduleMocks.execute.mock.calls[3];
    expect(recoveryPreflight[1]).toEqual(originalInput);
    expect(recoveryPreflight[2].idempotencyKey).toBe(originalKey);
    expect(recoveryPreflight[2].confirmationId).toBeUndefined();

    await clickButton('Xác nhận lại bằng cùng mã thao tác');
    await vi.waitFor(() => expect(container.textContent).toContain('Đã tạo và kiểm tra bản DOCX mới'));
    const recoveredConfirm = moduleMocks.execute.mock.calls[4];
    expect(recoveredConfirm[1]).toEqual(originalInput);
    expect(recoveredConfirm[2].idempotencyKey).toBe(originalKey);
    expect(recoveredConfirm[2].confirmationId).toBe('confirm-second');
    expect(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1')).toBeNull();
  });

  it('blocks edits when package inspection says the DOCX is not safe to mutate', async () => {
    moduleMocks.execute.mockResolvedValueOnce({
      success: true,
      result: { sourceFileId: 'source-1', inspection: { ...inspection, safeToMutate: false, packagePolicy: 'GUARDED' as const } },
    });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chỉ kiểm tra; không cho phép chỉnh sửa'));

    expect(container.querySelector<HTMLInputElement>('input[name="document-target"]')?.disabled).toBe(true);
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Tiếp tục để xem xác nhận'))?.disabled).toBe(true);
    expect(moduleMocks.execute).toHaveBeenCalledOnce();
  });

  it('renders business results in Vietnamese instead of raw policy codes', async () => {
    moduleMocks.execute.mockResolvedValueOnce({
      success: true,
      result: {
        sourceFileId: 'source-1',
        inspection: {
          ...inspection,
          packagePolicy: 'AUDIT_ONLY' as const,
          safeToMutate: false,
          diagnostics: [{ code: 'SIGNED_PACKAGE', message: 'raw processor text' }],
        },
      },
    });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chỉ kiểm tra; không cho phép chỉnh sửa'));

    const text = container.textContent || '';
    expect(text).toContain('chỉ đọc — tài liệu có chữ ký số');
    expect(text).toContain('Tài liệu mang dấu hiệu chữ ký số');
    expect(text).not.toContain('AUDIT_ONLY');
    expect(text).not.toContain('SIGNED_PACKAGE');
    expect(text).not.toContain('raw processor text');
  });

  it('clears the pending-apply marker when an undispatched challenge is cancelled', async () => {
    const expiry = new Date(Date.now() + 60_000).toISOString();
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'confirm-cancel', confirmationExpiresAt: expiry });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));
    const target = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]')!;
    await act(async () => target.click());
    await setValue('13');
    await clickButton('Tiếp tục để xem xác nhận');
    await vi.waitFor(() => expect(container.textContent).toContain('Xác nhận tạo bản DOCX mới'));

    const stored = JSON.parse(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1') || 'null');
    expect(stored).toMatchObject({ phase: 'challenge', dispatched: false });
    expect(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1')).not.toBeNull();

    await clickButton('Hủy');
    await vi.waitFor(() => expect(container.textContent).not.toContain('Xác nhận tạo bản DOCX mới'));
    expect(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1')).toBeNull();
    // Only the challenge preflight ran; no mutation was ever dispatched.
    expect(moduleMocks.execute).toHaveBeenCalledTimes(2);
  });

  /**
   * Regression: a fresh challenge issued over an already-dispatched mutation
   * returns the record to phase `challenge`. Phase alone therefore cannot prove
   * the mutation is discardable, so cancel, clear and reload must all keep the
   * marker and must never mint a new operation key.
   */
  it('keeps an ambiguous marker across a re-issued challenge so cancel and clear cannot discard it', async () => {
    const firstExpiry = new Date(Date.now() + 60_000).toISOString();
    const secondExpiry = new Date(Date.now() + 60_000).toISOString();
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'confirm-amb-1', confirmationExpiresAt: firstExpiry })
      .mockResolvedValueOnce({ success: false, errorCode: 'EXECUTION_RECONCILIATION_REQUIRED' })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'confirm-amb-2', confirmationExpiresAt: secondExpiry });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));
    const target = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]')!;
    await act(async () => target.click());
    await setValue('13');
    await clickButton('Tiếp tục để xem xác nhận');
    await vi.waitFor(() => expect(container.textContent).toContain('Xác nhận tạo bản DOCX mới'));
    const originalInput = moduleMocks.execute.mock.calls[1][1];
    const originalKey = moduleMocks.execute.mock.calls[1][2].idempotencyKey;

    await clickButton('Xác nhận và tạo bản sao');
    await vi.waitFor(() => expect(container.textContent).toContain('Cần kiểm tra trạng thái thao tác'));
    expect(JSON.parse(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1') || 'null'))
      .toMatchObject({ phase: 'recovery', dispatched: true, idempotencyKey: originalKey });

    await clickButton('Kiểm tra lại bằng cùng mã thao tác');
    await vi.waitFor(() => expect(container.textContent).toContain('Yêu cầu xác nhận mới đã được cấp'));
    expect(moduleMocks.execute.mock.calls[3][2].idempotencyKey).toBe(originalKey);

    // The new challenge is on top of a dispatched mutation: cancel must not apply.
    expect(container.textContent).not.toContain('Xác nhận tạo bản DOCX mới');
    const cancelButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === 'Hủy');
    expect(cancelButton).toBeUndefined();

    // The file is still selected in this session, so "Xóa lựa chọn" is present
    // but must refuse to drop the ambiguous marker.
    const clearButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.includes('Xóa lựa chọn'));
    expect(clearButton?.disabled).toBe(true);
    await act(async () => clearButton?.click());
    expect(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1')).not.toBeNull();
    expect(container.textContent).toContain('Cần kiểm tra trạng thái thao tác');

    // Reload must restore the same input and the same operation key.
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain('Cần kiểm tra trạng thái thao tác'));
    expect(moduleMocks.execute).toHaveBeenCalledTimes(4);
    const restored = JSON.parse(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1') || 'null');
    expect(restored).toMatchObject({ phase: 'challenge', dispatched: true, idempotencyKey: originalKey, input: originalInput });
    expect(container.querySelector<HTMLInputElement>('#document-formatting-file')?.disabled).toBe(true);
    // Per-owner isolation already dropped the file selection, so there is no
    // clear affordance at all; the marker still survives untouched.
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>('button')).some(item => item.textContent?.includes('Xóa lựa chọn'))).toBe(false);
    expect(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1')).not.toBeNull();
  });

  it('never mints a new operation key while an ambiguous marker is unresolved', async () => {
    const firstExpiry = new Date(Date.now() + 60_000).toISOString();
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'confirm-key-1', confirmationExpiresAt: firstExpiry })
      .mockResolvedValueOnce({ success: false, errorCode: 'EXECUTION_RECONCILIATION_REQUIRED' });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));
    const target = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]')!;
    await act(async () => target.click());
    await setValue('13');
    await clickButton('Tiếp tục để xem xác nhận');
    await vi.waitFor(() => expect(container.textContent).toContain('Xác nhận tạo bản DOCX mới'));
    const originalKey = moduleMocks.execute.mock.calls[1][2].idempotencyKey;

    await clickButton('Xác nhận và tạo bản sao');
    await vi.waitFor(() => expect(container.textContent).toContain('Cần kiểm tra trạng thái thao tác'));

    // Re-picking a target and re-inspecting must not drop the marker.
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain('Cần kiểm tra trạng thái thao tác'));

    const stored = JSON.parse(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1') || 'null');
    expect(stored).toMatchObject({ dispatched: true, idempotencyKey: originalKey });
    // No new prepare request was issued for this owner.
    expect(moduleMocks.execute.mock.calls.every(call => call[2]?.idempotencyKey !== undefined ? true : call[0] === 'document.inspect')).toBe(true);
    const keys = moduleMocks.execute.mock.calls.map(call => call[2]?.idempotencyKey).filter(Boolean);
    expect(new Set(keys).size).toBe(1);
  });

  it('restores a legacy marker without dispatch provenance and keeps it locked', async () => {
    const input = { fileId: 'source-1', sourceSha256: 'a'.repeat(64), paragraphId: 'p1', expectedBefore: 'LEFT', desiredAfter: 'RIGHT' };
    // Marker written by the previous build: no `dispatched` field at all.
    for (const phase of ['recovery', 'challenge'] as const) {
      window.sessionStorage.setItem('document-formatting:pending-apply:v1:user-1', JSON.stringify({
        version: 1,
        userId: 'user-1',
        input,
        confirmationId: `legacy-${phase}`,
        confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        idempotencyKey: '11111111-2222-3333-4444-555555555555',
        phase,
      }));
      await act(async () => root.unmount());
      root = createRoot(container);
      await render();

      // Conservative migration: provenance unknown resolves to uncertain, so the
      // record is kept and the ambiguous surface is shown rather than discarded.
      await vi.waitFor(() => expect(container.textContent).toContain('Cần kiểm tra trạng thái thao tác'));
      const restored = JSON.parse(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1') || 'null');
      expect(restored).toMatchObject({ version: 1, userId: 'user-1', phase, dispatched: true, input, idempotencyKey: '11111111-2222-3333-4444-555555555555' });
      expect(container.querySelector<HTMLInputElement>('#document-formatting-file')?.disabled).toBe(true);
      expect(container.textContent).toContain(`legacy-${phase}`.length > 0 ? 'Cần kiểm tra trạng thái thao tác' : '');
      expect(moduleMocks.execute).not.toHaveBeenCalled();
      window.sessionStorage.clear();
    }
  });

  it('still drops a structurally invalid marker rather than restoring garbage', async () => {
    window.sessionStorage.setItem('document-formatting:pending-apply:v1:user-1', JSON.stringify({
      version: 1, userId: 'user-1', input: { fileId: 'x', sourceSha256: 'not-a-sha', paragraphId: 'zz', expectedBefore: 'LEFT', desiredAfter: 'RIGHT' },
      confirmationId: 'c', confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: '11111111-2222-3333-4444-555555555555', phase: 'recovery',
    }));
    await render();
    await vi.waitFor(() => expect(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1')).toBeNull());
  });

  it('keeps every control unavailable and asks for sign-in once the session is closed', async () => {
    moduleMocks.execute.mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } });
    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));

    moduleMocks.auth.user = null;
    await render();

    await vi.waitFor(() => expect(container.textContent).toContain('Bạn đang không đăng nhập'));
    expect(container.querySelector<HTMLInputElement>('#document-formatting-file')?.disabled).toBe(true);
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every(button => button.disabled)).toBe(true);
    // No owner-scoped content may survive the sign-out.
    expect(container.textContent).not.toContain('Nội dung đoạn một');
    expect(container.textContent).not.toContain('Chọn nội dung cần sửa');

    // Signing back in restores the normal surface.
    moduleMocks.auth.user = { uid: 'user-1' };
    await render();
    await vi.waitFor(() => expect(container.textContent).not.toContain('Bạn đang không đăng nhập'));
  });

  it('aborts and discards an in-flight inspection when the module is disabled', async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise(resolve => release = resolve);
    const seenSignals: AbortSignal[] = [];
    moduleMocks.execute.mockImplementation((_id: string, _input: unknown, options: { signal?: AbortSignal }) => {
      seenSignals.push(options.signal as AbortSignal);
      return pending;
    });

    await render();
    await selectDocx();
    const uploadButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.includes('Tải lên và kiểm tra'))!;
    await act(async () => { uploadButton.click(); });
    await vi.waitFor(() => expect(seenSignals.length).toBe(1));

    moduleMocks.moduleEnabled = false;
    await act(async () => { moduleMocks.listeners.get('module.statusChanged')?.({ moduleId: 'document-formatting', enabled: false }); });

    // The in-flight request was aborted and the module left the enabled state.
    expect(seenSignals[0].aborted).toBe(true);
    expect(container.textContent).toContain('Phân hệ Định dạng văn bản đang tắt');

    // A late response from the previous owner state must not be rendered.
    release({ success: true, result: { sourceFileId: 'source-1', inspection } });
    await act(async () => { await pending; await Promise.resolve(); });
    expect(container.textContent).not.toContain('Chọn nội dung cần sửa');
    expect(container.textContent).not.toContain('Nội dung đoạn một');
  });

  it('aborts and discards an in-flight inspection when the account changes', async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise(resolve => release = resolve);
    const seenSignals: AbortSignal[] = [];
    moduleMocks.execute.mockImplementation((_id: string, _input: unknown, options: { signal?: AbortSignal }) => {
      seenSignals.push(options.signal as AbortSignal);
      return pending;
    });

    await render();
    await selectDocx();
    const uploadButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.includes('Tải lên và kiểm tra'))!;
    await act(async () => { uploadButton.click(); });
    await vi.waitFor(() => expect(seenSignals.length).toBe(1));

    moduleMocks.auth.user = { uid: 'user-2' };
    await render();
    expect(seenSignals[0].aborted).toBe(true);

    release({ success: true, result: { sourceFileId: 'source-1', inspection } });
    await act(async () => { await pending; await Promise.resolve(); });
    // user-2 must never see user-1's inspection result.
    expect(container.textContent).not.toContain('Chọn nội dung cần sửa');
    expect(container.textContent).not.toContain('Nội dung đoạn một');
  });

  it('restores the recovery marker for its own uid only after a reload', async () => {
    const firstExpiry = new Date(Date.now() + 60_000).toISOString();
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'confirm-restore', confirmationExpiresAt: firstExpiry })
      .mockResolvedValueOnce({ success: false, errorCode: 'EXECUTION_RECONCILIATION_REQUIRED' });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));
    const target = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]')!;
    await act(async () => target.click());
    await setValue('13');
    await clickButton('Tiếp tục để xem xác nhận');
    await vi.waitFor(() => expect(container.textContent).toContain('Xác nhận tạo bản DOCX mới'));
    await clickButton('Xác nhận và tạo bản sao');
    await vi.waitFor(() => expect(container.textContent).toContain('Cần kiểm tra trạng thái thao tác'));
    const ambiguousInput = moduleMocks.execute.mock.calls[2][1];
    const ambiguousKey = moduleMocks.execute.mock.calls[2][2].idempotencyKey;

    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain('Cần kiểm tra trạng thái thao tác'));
    expect(JSON.parse(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1') || 'null'))
      .toMatchObject({ phase: 'recovery', dispatched: true, idempotencyKey: ambiguousKey, input: ambiguousInput });
    expect(moduleMocks.execute).toHaveBeenCalledTimes(3);
  });

  it('never exposes one owner document, inspection or marker to another uid', async () => {
    const expiry = new Date(Date.now() + 60_000).toISOString();
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'confirm-owner-1', confirmationExpiresAt: expiry });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));
    const target = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]')!;
    await act(async () => target.click());
    await setValue('13');
    await clickButton('Tiếp tục để xem xác nhận');
    await vi.waitFor(() => expect(container.textContent).toContain('Xác nhận tạo bản DOCX mới'));

    moduleMocks.auth.user = { uid: 'user-2' };
    await render();

    await vi.waitFor(() => expect(container.textContent).not.toContain('Xác nhận tạo bản DOCX mới'));
    expect(container.textContent).not.toContain('Chọn nội dung cần sửa');
    expect(container.textContent).not.toContain('Nội dung đoạn một');
    expect(container.querySelector<HTMLInputElement>('#document-formatting-file')?.files?.[0]).toBeUndefined();
    // The previous owner's marker stays recoverable under its own key only.
    expect(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1')).not.toBeNull();
    expect(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-2')).toBeNull();

    moduleMocks.auth.user = { uid: 'user-1' };
    await render();
    await vi.waitFor(() => expect(container.textContent).toContain('Xác nhận tạo bản DOCX mới'));
  });

  it('drops in-memory owner state when the signed-out session arrives', async () => {
    moduleMocks.execute.mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } });
    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));

    moduleMocks.auth.user = null;
    await render();

    // The previous owner's document content must not survive the sign-out.
    await vi.waitFor(() => expect(container.textContent).not.toContain('Chọn nội dung cần sửa'));
    expect(container.querySelector<HTMLInputElement>('input[name="document-target"]')).toBeNull();
  });

  it('fails closed and stops in-flight work when the module is disabled mid-session', async () => {
    moduleMocks.execute.mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } });
    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));

    moduleMocks.moduleEnabled = false;
    await act(async () => { moduleMocks.listeners.get('module.statusChanged')?.({ moduleId: 'document-formatting', enabled: false }); });

    await vi.waitFor(() => expect(container.textContent).toContain('Phân hệ Định dạng văn bản đang tắt'));
    expect(container.textContent).not.toContain('Chọn nội dung cần sửa');
    expect(container.querySelector<HTMLInputElement>('input[name="document-target"]')).toBeNull();
  });

  it('ignores module status changes belonging to other modules', async () => {
    moduleMocks.execute.mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } });
    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));

    await act(async () => { moduleMocks.listeners.get('module.statusChanged')?.({ moduleId: 'tasks', enabled: false }); });
    expect(container.textContent).toContain('Chọn nội dung cần sửa');
  });

  it('re-checks the enable state after a server module sync', async () => {
    await render();
    moduleMocks.moduleEnabled = false;
    await act(async () => { moduleMocks.listeners.get('modules.synced')?.({}); });
    await vi.waitFor(() => expect(container.textContent).toContain('Phân hệ Định dạng văn bản đang tắt'));
  });

  it('downloads the generated DOCX through the authenticated file API', async () => {
    const blob = new Blob([new Uint8Array(30)], { type: DOCX_MIME_TYPE });
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'confirm-dl', confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString() })
      .mockResolvedValueOnce({ success: true, result: output });
    moduleMocks.authFetch.mockResolvedValueOnce(new Response(blob, { status: 200, headers: { 'content-type': DOCX_MIME_TYPE } }));
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:docx');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));
    const target = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]')!;
    await act(async () => target.click());
    await setValue('13');
    await clickButton('Tiếp tục để xem xác nhận');
    await vi.waitFor(() => expect(container.textContent).toContain('Xác nhận tạo bản DOCX mới'));
    await clickButton('Xác nhận và tạo bản sao');
    await vi.waitFor(() => expect(container.textContent).toContain('Đã tạo và kiểm tra bản DOCX mới'));

    await clickButton('Tải bản DOCX mới');

    await vi.waitFor(() => expect(moduleMocks.authFetch).toHaveBeenCalledOnce());
    expect(moduleMocks.authFetch.mock.calls[0][0]).toBe('/api/files/output-1/content');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('reports a failed download in Vietnamese without touching the source file', async () => {
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'confirm-dl2', confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString() })
      .mockResolvedValueOnce({ success: true, result: output });
    moduleMocks.authFetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 }));

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));
    const target = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]')!;
    await act(async () => target.click());
    await setValue('13');
    await clickButton('Tiếp tục để xem xác nhận');
    await vi.waitFor(() => expect(container.textContent).toContain('Xác nhận tạo bản DOCX mới'));
    await clickButton('Xác nhận và tạo bản sao');
    await vi.waitFor(() => expect(container.textContent).toContain('Đã tạo và kiểm tra bản DOCX mới'));

    await clickButton('Tải bản DOCX mới');

    await vi.waitFor(() => expect(container.textContent).toContain('Phiên đăng nhập không còn hợp lệ'));
  });

  it('surfaces a stale-document failure as a readable Vietnamese message', async () => {
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, errorCode: 'STALE_DOCUMENT' });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn nội dung cần sửa'));
    const target = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]')!;
    await act(async () => target.click());
    await setValue('13');
    await clickButton('Tiếp tục để xem xác nhận');

    await vi.waitFor(() => expect(container.textContent).toContain('Tệp nguồn đã thay đổi sau khi kiểm tra'));
    expect(container.textContent).not.toContain('STALE_DOCUMENT');
    expect(window.sessionStorage.getItem('document-formatting:pending-apply:v1:user-1')).toBeNull();
  });

  it('blocks the proposal until the owner confirms an unconfirmed document type', async () => {
    const expiry = new Date(Date.now() + 60_000).toISOString();
    moduleMocks.execute.mockResolvedValueOnce({
      success: true,
      result: {
        sourceFileId: 'source-1',
        inspection: {
          ...inspection,
          binding: { ...inspection.binding, documentTypeConfirmed: false },
        },
      },
    });

    await render();
    await selectDocx();
    await clickButton('T\u1ea3i l\u00ean v\u00e0 ki\u1ec3m tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Ch\u1ecdn n\u1ed9i dung c\u1ea7n s\u1eeda'));

    // The type selector is rendered even though detection was not conclusive.
    const typeSelect = container.querySelector<HTMLSelectElement>('#document-confirm-type')!;
    expect(typeSelect).not.toBeNull();
    expect(typeSelect.value).toBe('');
    expect(container.textContent).toContain('c\u1ea7n b\u1ea1n x\u00e1c nh\u1eadn l\u1ea1i tr\u01b0\u1edbc khi s\u1eeda');

    // With no confirmed type every target stays unselectable and no apply is issued.
    expect(container.querySelector<HTMLInputElement>('input[name="document-target"]')?.disabled).toBe(true);
    const applyCallsBefore = moduleMocks.execute.mock.calls.filter(call => call[0] === 'document.applyAlignment').length;
    expect(applyCallsBefore).toBe(0);
  });

  it('re-inspects under the chosen type and binds that type, not the detected one', async () => {
    const expiry = new Date(Date.now() + 60_000).toISOString();
    const baoCaoInspection = {
      ...inspection,
      binding: { ...inspection.binding, documentTypeKey: 'bao_cao', documentTypeLabelVi: 'Bao cao', ownerConfirmed: true },
      findings: [{
        ruleId: 'ND30.PL1.II.A.1',
        targetKey: 'semantic_component.header.font_size_pt',
        property: 'run.font_size_pt',
        status: 'FAIL' as const,
        severity: 'LEGAL_ERROR',
        expected: 'type=numeric_range; min=13; max=14; unit=pt',
        observed: '12',
        patchEligibility: 'ELIGIBLE',
        propertyLabelVi: 'Co chu doan',
        unit: 'pt',
        targetId: 'p1',
      }],
    };
    moduleMocks.execute
      .mockResolvedValueOnce({
        success: true,
        result: {
          sourceFileId: 'source-1',
          inspection: { ...inspection, binding: { ...inspection.binding, documentTypeConfirmed: false } },
        },
      })
      // The re-inspection is what re-scopes the findings to the chosen type.
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection: baoCaoInspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'confirm-b', confirmationExpiresAt: expiry });

    await render();
    await selectDocx();
    await clickButton('T\u1ea3i l\u00ean v\u00e0 ki\u1ec3m tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Ch\u1ecdn n\u1ed9i dung c\u1ea7n s\u1eeda'));

    const typeSelect = container.querySelector<HTMLSelectElement>('#document-confirm-type')!;
    expect(typeSelect.value).toBe('');
    const setSelect = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    await act(async () => {
      setSelect?.call(typeSelect, 'bao_cao');
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await vi.waitFor(() => expect(moduleMocks.execute.mock.calls.length).toBeGreaterThanOrEqual(2));
    // The chosen type was sent for re-inspection and is what the result is bound to.
    expect(moduleMocks.execute.mock.calls[1][0]).toBe('document.inspect');
    expect((moduleMocks.execute.mock.calls[1][1] as { confirmedDocumentTypeKey: string }).confirmedDocumentTypeKey).toBe('bao_cao');
    // The B-scoped finding from the re-inspection is what is now on screen. The UI
    // renders it as business text, so assert the values rather than the raw rule id.
    await vi.waitFor(() => expect(container.textContent).toContain('hiện tại 12'));
    expect(container.textContent).not.toContain('ND30.PL1.I.II.6E.BODY_SIZE');
    expect(container.querySelector<HTMLSelectElement>('#document-confirm-type')!.value).toBe('bao_cao');

    const target = container.querySelector<HTMLInputElement>('input[name="document-target"][value="run.font_size_pt::p1"]')!;
    expect(target.disabled).toBe(false);
    await act(async () => target.click());
    await setValue('13');
    await clickButton('Ti\u1ebfp t\u1ee5c \u0111\u1ec3 xem x\u00e1c nh\u1eadn');
    await vi.waitFor(() => expect(container.textContent).toContain('X\u00e1c nh\u1eadn t\u1ea1o b\u1ea3n DOCX m\u1edbi'));

    const applyInput = moduleMocks.execute.mock.calls[2][1] as { documentTypeKey: string };
    expect(moduleMocks.execute.mock.calls[2][0]).toBe('document.applyAlignment');
    expect(applyInput.documentTypeKey).toBe('bao_cao');

    // While a challenge marker exists the confirmed type may not drift visually.
    expect(container.querySelector<HTMLSelectElement>('#document-confirm-type')?.disabled).toBe(true);
  });

  it('renders a generic margin change with its own label, unit and rule instead of alignment wording', async () => {
    const marginOutput = {
      ...output,
      changeManifest: {
        property: 'section.margin_right_mm',
        targetId: 's1',
        propertyLabelVi: 'L\u1ec1 ph\u1ea3i',
        unit: 'mm',
        before: '15',
        after: '17',
        ruleId: 'ND30.PL1.I.GENERAL.MARGIN_RIGHT',
        sourceSha256: 'a'.repeat(64),
        outputSha256: 'c'.repeat(64),
        appliedAt: '2026-10-03T00:00:00.000Z',
      },
    };
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId: 'c1', confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString() })
      .mockResolvedValueOnce({ success: true, result: marginOutput, confirmationId: 'c1' });

    await render();
    await selectDocx();
    await clickButton('T\u1ea3i l\u00ean v\u00e0 ki\u1ec3m tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Ch\u1ecdn n\u1ed9i dung c\u1ea7n s\u1eeda'));

    const marginTarget = container.querySelector<HTMLInputElement>('input[name="document-target"][value="section.margin_right_mm::s1"]')!;
    expect(marginTarget.disabled).toBe(false);
    await act(async () => marginTarget.click());
    await setValue('17');
    await clickButton('Ti\u1ebfp t\u1ee5c \u0111\u1ec3 xem x\u00e1c nh\u1eadn');
    await vi.waitFor(() => expect(container.textContent).toContain('X\u00e1c nh\u1eadn t\u1ea1o b\u1ea3n DOCX m\u1edbi'));
    await clickButton('X\u00e1c nh\u1eadn v\u00e0 t\u1ea1o b\u1ea3n sao');
    await vi.waitFor(() => expect(container.textContent).toContain('\u0110\u00e3 t\u1ea1o v\u00e0 ki\u1ec3m tra b\u1ea3n DOCX m\u1edbi'));

    const text = container.textContent || '';
    expect(text).toContain('L\u1ec1 ph\u1ea3i');
    expect(text).toContain('15 mm');
    expect(text).toContain('17 mm');
    expect(text).toContain('ND30.PL1.I.GENERAL.MARGIN_RIGHT');
    // Alignment wording must not leak into a margin result.
    expect(text).not.toContain('C\u0103n \u0111\u1ecbu hai l\u1ec1');
  });

  it('offers no dead recovery action for a current-shape marker that is already a challenge', async () => {
    // A marker that was already dispatched and then re-armed as a challenge: the
    // outcome is still unknown, but there is nothing for a "check again" action to do
    // because `refreshRecoveryChallenge` only acts on a recovery-phase marker.
    const expiry = new Date(Date.now() + 60_000).toISOString();
    window.sessionStorage.setItem('document-formatting:pending-apply:v1:user-1', JSON.stringify({
      version: 1,
      userId: 'user-1',
      input: {
        fileId: 'source-1',
        sourceSha256: 'a'.repeat(64),
        property: 'run.font_size_pt',
        targetId: 'p1',
        documentTypeKey: 'quyet_dinh',
        expectedBefore: '12',
        desiredAfter: '13',
        profileId: 'HOATIEU-MIENBAC-ADMIN-V1',
        profileDigest: 'b'.repeat(64),
        ruleId: 'ND30.PL1.I.II.6E.BODY_SIZE',
      },
      confirmationId: 'confirm-dead',
      confirmationExpiresAt: expiry,
      idempotencyKey: '11111111-2222-3333-4444-555555555555',
      phase: 'challenge',
      dispatched: true,
    }));

    await render();
    await vi.waitFor(() => expect(container.textContent).toContain('Cần kiểm tra trạng thái thao tác'));

    // The confirm-again action remains, because that is the action that works here.
    expect(container.textContent).toContain('Xác nhận lại bằng cùng mã thao tác');
    // The dead action must not be rendered for this state.
    expect(container.textContent).not.toContain('Kiểm tra lại bằng cùng mã thao tác');
  });

  it('presents an actionable message for a wrapped processor failure instead of the generic catch-all', async () => {
    moduleMocks.execute.mockResolvedValueOnce({
      success: false,
      errorCode: 'DOCUMENT_PROCESSING_FAILED',
    });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Máy chủ không hoàn tất được kiểm tra tệp'));

    // The generic catch-all must not be what the owner sees for a known server code.
    expect(container.textContent).not.toContain('Không thể hoàn tất thao tác DOCX');
    // It must stay honest: the original is untouched and the owner is told to retry.
    expect(container.textContent).toContain('Tệp gốc không bị ghi đè');
  });

  it('describes the implemented formatting scope, not the old alignment-only wording', async () => {
    moduleMocks.execute.mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } });

    await render();
    await selectDocx();
    await clickButton('T\u1ea3i l\u00ean v\u00e0 ki\u1ec3m tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Ch\u1ecdn n\u1ed9i dung c\u1ea7n s\u1eeda'));

    const text = container.textContent || '';
    // Scope copy must name the properties the profile actually implements.
    expect(text).toContain('thu\u1ed9c t\u00ednh \u0111\u1ecbnh d\u1ea1ng');
    // Alignment-only wording must be gone from the scope line and the inspection title.
    expect(text).not.toContain('\u0111\u1ed5i c\u0103n l\u1ec1 tr\u1ef1c ti\u1ebfp');
    expect(text).not.toContain('c\u00f3 th\u1ec3 ch\u1ecdn c\u0103n l\u1ec1');
    expect(text).toContain('c\u00f3 th\u1ec3 ch\u1ecdn thu\u1ed9c t\u00ednh c\u1ea7n s\u1eeda');
  });

});
