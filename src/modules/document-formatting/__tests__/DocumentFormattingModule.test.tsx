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
}));

vi.mock('../../../core/capabilities/capabilityRegistry', () => ({
  clientCapabilityRegistry: { execute: moduleMocks.execute },
}));
vi.mock('../../home/fileUploadClient', () => ({
  uploadUserFile: moduleMocks.uploadUserFile,
  precheckFile: moduleMocks.precheckFile,
  mapUploadErrorCode: moduleMocks.mapUploadErrorCode,
}));
vi.mock('../../../lib/authFetch', () => ({ authFetch: moduleMocks.authFetch }));

import { DocumentFormattingModule } from '../DocumentFormattingModule';
import { DOCX_MIME_TYPE } from '../../../../shared/contracts/fileUploadPolicy';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const inspection = {
  sourceSha256: 'a'.repeat(64),
  profile: 'generic-direct-alignment-spike' as const,
  safeToMutate: true,
  packagePolicy: 'NORMAL' as const,
  paragraphs: [{ paragraphId: 'p1', text: 'Nội dung đoạn một', directAlignment: 'LEFT' as const, issueId: null }],
  paragraphsTruncated: false,
  diagnostics: [],
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
    property: 'paragraph.alignment' as const,
    paragraphId: 'p1',
    before: 'LEFT' as const,
    after: 'RIGHT' as const,
    sourceSha256: 'a'.repeat(64),
    outputSha256: 'b'.repeat(64),
    appliedAt: '2026-10-03T00:00:00.000Z',
    summary: 'Direct paragraph alignment changed from LEFT to RIGHT.',
  },
  verification: { reopened: true as const, revalidated: true as const, sourceUnchanged: true as const, outputInspectionPassed: true as const },
};

describe('DocumentFormattingModule', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    moduleMocks.execute.mockReset();
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

  it('uploads, inspects, obtains a confirmation challenge and creates a verified copy', async () => {
    const confirmationId = 'confirm-001';
    moduleMocks.execute
      .mockResolvedValueOnce({ success: true, result: { sourceFileId: 'source-1', inspection } })
      .mockResolvedValueOnce({ success: false, requiresConfirmation: true, confirmationId, confirmationExpiresAt: '2026-10-03T01:00:00.000Z' })
      .mockResolvedValueOnce({ success: true, result: output, confirmationId });

    await render();
    await selectDocx();
    await clickButton('Tải lên và kiểm tra');
    await vi.waitFor(() => expect(container.textContent).toContain('Chọn một đoạn để đổi căn lề'));
    expect(moduleMocks.uploadUserFile).toHaveBeenCalledOnce();
    expect(moduleMocks.execute.mock.calls[0][0]).toBe('document.inspect');

    const paragraph = container.querySelector<HTMLInputElement>('input[name="document-paragraph"][value="p1"]');
    expect(paragraph?.disabled).toBe(false);
    await act(async () => paragraph!.click());
    const select = container.querySelector<HTMLSelectElement>('#document-formatting-alignment')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    await act(async () => {
      setValue?.call(select, 'RIGHT');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
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

    expect(container.querySelector<HTMLInputElement>('input[name="document-paragraph"]')?.disabled).toBe(true);
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('Tiếp tục để xem xác nhận'))?.disabled).toBe(true);
    expect(moduleMocks.execute).toHaveBeenCalledOnce();
  });
});
