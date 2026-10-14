// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { documentFormattingManifest } from '../document-formatting/manifest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/authFetch', () => ({ authFetch: fetchMock }));

import { ModuleManagerTab } from './ModuleManagerTab';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  moduleRegistry.reset();
  fetchMock.mockReset();
  vi.restoreAllMocks();
});

it('lets the owner turn off document formatting inside a frame without a browser confirmation dialog', async () => {
  moduleRegistry.register(documentFormattingManifest);
  await moduleRegistry.setEnabled('document-formatting', true);
  const confirm = vi.fn(() => false);
  const previousConfirm = window.confirm;
  window.confirm = confirm;
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ModuleManagerTab />));
    const card = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Tắt'));
    expect(card).toBeTruthy();
    await act(async () => card!.click());
    expect(confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/modules/document-formatting/toggle', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ enabled: false }),
    }));
    expect(moduleRegistry.isEnabled('document-formatting')).toBe(false);
  } finally {
    window.confirm = previousConfirm;
    await act(async () => root.unmount());
    container.remove();
  }
});
