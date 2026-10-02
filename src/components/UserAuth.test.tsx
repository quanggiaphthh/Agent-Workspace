// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  user: null as any,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../lib/FirebaseAuthProvider', () => ({
  useFirebaseAuth: () => authMock,
}));

import { UserAuth } from './UserAuth';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('UserAuth email and password UI', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    authMock.user = null;
    authMock.loading = false;
    authMock.login.mockReset().mockResolvedValue(undefined);
    authMock.logout.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render() {
    await act(async () => root.render(<UserAuth />));
  }

  async function click(button: HTMLButtonElement) {
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  async function fill(input: HTMLInputElement, value: string) {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  async function submit() {
    const form = container.querySelector('form');
    if (!form) throw new Error('Login form is not rendered');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
  }

  it('submits trimmed email and transient password without persisting either credential', async () => {
    await render();
    const openButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Đăng nhập'));
    expect(openButton).toBeTruthy();
    await click(openButton!);

    const email = container.querySelector<HTMLInputElement>('input[type="email"]');
    const password = container.querySelector<HTMLInputElement>('input[type="password"]');
    expect(email?.getAttribute('autocomplete')).toBe('username');
    expect(password?.getAttribute('autocomplete')).toBe('current-password');
    await fill(email!, '  owner@example.test  ');
    await fill(password!, 'transient-password');
    await submit();

    expect(authMock.login).toHaveBeenCalledWith('owner@example.test', 'transient-password');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('shows a safe mapped Firebase error without exposing raw details', async () => {
    const rawError = Object.assign(new Error('private backend detail must not be shown'), {
      code: 'auth/wrong-password',
    });
    authMock.login.mockRejectedValueOnce(rawError);
    await render();
    await click(Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Đăng nhập'))!);
    await fill(container.querySelector<HTMLInputElement>('input[type="email"]')!, 'owner@example.test');
    await fill(container.querySelector<HTMLInputElement>('input[type="password"]')!, 'bad-password');
    await submit();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Email hoặc mật khẩu không đúng.');
    expect(alert?.textContent).not.toContain('private backend detail');
    expect(container.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe('bad-password');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('supports dialog labels, initial focus, Escape, and focus restoration', async () => {
    await render();
    const openButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Đăng nhập'))!;
    await click(openButton);

    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    const email = container.querySelector<HTMLInputElement>('#login-email');
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(container.querySelector('label[for="login-email"]')).toBeTruthy();
    expect(document.activeElement).toBe(email);

    await act(async () => {
      email!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(openButton);
  });

  it('traps reverse tab navigation within the login dialog', async () => {
    await render();
    await click(Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Đăng nhập'))!);
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Đóng"]')!;
    const cancelButton = Array.from(container.querySelectorAll<HTMLButtonElement>('form button'))
      .find((button) => button.textContent?.includes('Hủy'))!;
    close.focus();

    await act(async () => {
      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    });

    expect(document.activeElement).toBe(cancelButton);
  });

  it('keeps the existing signed-in logout action', async () => {
    authMock.user = { displayName: 'Owner', email: 'owner@example.test' };
    await render();
    const logout = container.querySelector<HTMLButtonElement>('button[aria-label="Đăng xuất"]');
    expect(logout).toBeTruthy();
    await click(logout!);
    expect(authMock.logout).toHaveBeenCalledOnce();
  });
});
