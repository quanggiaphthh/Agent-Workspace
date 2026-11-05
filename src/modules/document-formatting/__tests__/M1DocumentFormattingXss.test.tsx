// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const authFetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/authFetch', () => ({ authFetch: authFetchMock }));
import { DocumentFormattingModule } from '../DocumentFormattingModule';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => { authFetchMock.mockReset(); vi.restoreAllMocks(); });

it('renders a hostile API error as text rather than executable HTML/XSS', async () => {
  const attack = '<img src=x onerror="globalThis.__m1XssExecuted = true">';
  authFetchMock.mockResolvedValue({
    ok: false, status: 422,
    json: async () => ({ error: attack }),
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<DocumentFormattingModule />));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [new File(['invalid-docx'], 'untrusted.docx')], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(authFetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(attack);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect((globalThis as Record<string, unknown>).__m1XssExecuted).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as Record<string, unknown>).__m1XssExecuted;
  }
});
