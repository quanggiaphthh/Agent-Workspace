// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const authFetchMock = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock('../../../lib/authFetch', () => ({
  authFetch: authFetchMock.fetch,
}));

import { DocumentFormattingModule } from '../DocumentFormattingModule';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('DocumentFormattingModule Idempotency-Key binding', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    authFetchMock.fetch.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('generates one Idempotency-Key during prepareConfirmation and forwards the identical key to applyAndDownload', async () => {
    const inspectedSha = 'a'.repeat(64);
    const mockInspection = {
      sourceSha256: inspectedSha,
      profile: 'generic-direct-alignment-spike',
      safeToMutate: true,
      packagePolicy: 'NORMAL',
      paragraphs: [
        { paragraphId: 'p1', text: 'Paragraph one', directAlignment: 'LEFT', issueId: null },
      ],
      paragraphsTruncated: false,
      diagnostics: [],
    };

    authFetchMock.fetch
      // 1. inspect call
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ inspection: mockInspection }),
      })
      // 2. confirm call
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          requiresConfirmation: true,
          confirmationId: 'confirm-challenge-xyz',
          confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      })
      // 3. apply call
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'content-disposition': 'attachment; filename="test-formatted.docx"',
        }),
        blob: async () => new Blob(['PK\x03\x04test'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      });

    await act(async () => {
      root.render(<DocumentFormattingModule />);
    });

    // 1. Select a .docx file
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(['mock docx content'], 'test.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // 2. Click "Kiểm tra DOCX"
    const inspectButton = Array.from(container.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Kiểm tra DOCX'));
    expect(inspectButton).toBeTruthy();
    await act(async () => {
      inspectButton!.click();
    });

    expect(authFetchMock.fetch).toHaveBeenNthCalledWith(1, '/api/document-formatting/inspect', expect.anything());

    // 3. Click "Chuẩn bị xác nhận" (prepare confirmation)
    const prepareButton = Array.from(container.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Chuẩn bị xác nhận'));
    expect(prepareButton).toBeTruthy();
    await act(async () => {
      prepareButton!.click();
    });

    expect(authFetchMock.fetch).toHaveBeenNthCalledWith(2, '/api/document-formatting/confirm', expect.anything());
    const confirmCallHeaders = authFetchMock.fetch.mock.calls[1][1].headers;
    const confirmKey = confirmCallHeaders['Idempotency-Key'];
    expect(confirmKey).toBeDefined();
    expect(confirmKey).toMatch(/^docfmt:[A-Za-z0-9._:-]{8,128}$/);

    // 4. Click "Xác nhận và tải DOCX" (apply and download)
    const applyButton = Array.from(container.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Xác nhận và tải DOCX'));
    expect(applyButton).toBeTruthy();
    await act(async () => {
      applyButton!.click();
    });

    expect(authFetchMock.fetch).toHaveBeenNthCalledWith(3, '/api/document-formatting/apply', expect.anything());
    const applyCallHeaders = authFetchMock.fetch.mock.calls[2][1].headers;
    const applyKey = applyCallHeaders['Idempotency-Key'];

    // CRITICAL: The Idempotency-Key passed to /apply must be IDENTICAL to the one passed to /confirm
    expect(applyKey).toBe(confirmKey);
    expect(applyCallHeaders['X-Confirmation-ID']).toBe('confirm-challenge-xyz');
  });

  it('shows the actual page changes and a download after one automatic request', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x11]);
    const changes = [{ property: 'w:pgMar/@w:left', beforeTwips: 1400, afterTwips: 1701 }];
    authFetchMock.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'x-document-rule-profile': 'nd30-safe-v2',
        'x-document-changes': Buffer.from(JSON.stringify(changes)).toString('base64url'),
        'x-document-body-report': Buffer.from(JSON.stringify({ formattedParagraphs: 1, unclassifiedParagraphs: 2,
          adjustments: { font: 1, size: 1, spacing: 1, indent: 1, alignment: 1 } })).toString('base64url'),
        'x-document-output-sha256': createHash('sha256').update(bytes).digest('hex'),
      }),
      blob: async () => new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    });
    await act(async () => root.render(<DocumentFormattingModule />));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [new File([bytes], 'mau.docx')], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const button = Array.from(container.querySelectorAll('button'))
      .find(item => item.textContent?.includes('Tự động định dạng'));
    expect(button).toBeTruthy();
    await act(async () => { button!.click(); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(authFetchMock.fetch).toHaveBeenCalledWith('/api/document-formatting/automatic', expect.objectContaining({ method: 'POST' }));
    expect(container.textContent).toContain('Lề trái: 24.7 → 30.0 mm');
    expect(container.textContent).toContain('2 đoạn chưa xác định được vai trò');
    expect(container.textContent).toContain('Tải Word đã xử lý');
  });
});
