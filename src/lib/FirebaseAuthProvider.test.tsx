// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  auth: {},
  authStateListener: null as null | ((user: any) => void),
  events: [] as string[],
  aiSettingsHydrated: false,
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  syncKeys: vi.fn(),
  rehydrate: vi.fn(),
  setAISettingsHydrated: vi.fn((value: boolean) => { authMocks.aiSettingsHydrated = value; }),
  setUser: vi.fn(),
  syncModules: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: authMocks.onAuthStateChanged,
  signInWithEmailAndPassword: authMocks.signInWithEmailAndPassword,
  signOut: authMocks.signOut,
}));

vi.mock('./firebase', () => ({ auth: authMocks.auth }));

vi.mock('../core/modules/moduleRegistry', () => ({
  moduleRegistry: { syncWithServer: authMocks.syncModules },
}));

vi.mock('../modules/settings/aiKeysStore', () => ({
  AI_SETTINGS_RESET: { aiSettingsHydrated: false, credentialId: 'system' },
  useAIKeysStore: {
    setState: vi.fn((state: { aiSettingsHydrated?: boolean }) => {
      if (state.aiSettingsHydrated !== undefined) authMocks.aiSettingsHydrated = state.aiSettingsHydrated;
    }),
    getState: vi.fn(() => ({
      syncKeys: authMocks.syncKeys,
      setAISettingsHydrated: authMocks.setAISettingsHydrated,
    })),
    persist: {
      setOptions: vi.fn(),
      rehydrate: vi.fn(async () => {
        authMocks.events.push('rehydrate');
        await authMocks.rehydrate();
      }),
    },
  },
}));

vi.mock('../core/context/contextStore', () => ({
  DEFAULT_USER: { id: 'guest', email: '', name: 'Khách', roles: [], permissions: [] },
  useContextStore: { getState: () => ({ setUser: authMocks.setUser }) },
}));

import { FirebaseAuthProvider, useFirebaseAuth } from './FirebaseAuthProvider';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('FirebaseAuthProvider authentication and hydration lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;
  let context: ReturnType<typeof useFirebaseAuth> | null;

  beforeEach(() => {
    authMocks.authStateListener = null;
    authMocks.events = [];
    authMocks.aiSettingsHydrated = false;
    authMocks.onAuthStateChanged.mockReset().mockImplementation((_auth, listener) => {
      authMocks.authStateListener = listener;
      return vi.fn();
    });
    authMocks.signInWithEmailAndPassword.mockReset().mockResolvedValue(undefined);
    authMocks.signOut.mockReset().mockResolvedValue(undefined);
    authMocks.syncKeys.mockReset().mockImplementation(async () => { authMocks.events.push('syncKeys'); });
    authMocks.rehydrate.mockReset().mockResolvedValue(undefined);
    authMocks.setAISettingsHydrated.mockClear();
    authMocks.setUser.mockReset();
    authMocks.syncModules.mockReset().mockResolvedValue(undefined);
    context = null;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  function Probe() {
    context = useFirebaseAuth();
    return <span>{context.user?.uid || 'signed-out'}</span>;
  }

  async function render() {
    await act(async () => root.render(<FirebaseAuthProvider><Probe /></FirebaseAuthProvider>));
    expect(authMocks.authStateListener).toBeTypeOf('function');
  }

  function makeUser() {
    return {
      uid: 'owner-1',
      email: 'owner@example.test',
      displayName: 'Owner',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { roles: ['user'] } }),
      getIdToken: vi.fn().mockResolvedValue('firebase-id-token'),
    };
  }

  it('uses Firebase email/password, preserves logout, and keeps the ID-token accessor', async () => {
    await render();
    const user = makeUser();
    await act(async () => {
      await context!.login('owner@example.test', 'transient-password');
      await context!.logout();
    });
    expect(authMocks.signInWithEmailAndPassword).toHaveBeenCalledWith(authMocks.auth, 'owner@example.test', 'transient-password');
    expect(authMocks.signOut).toHaveBeenCalledWith(authMocks.auth);

    await act(async () => authMocks.authStateListener!(user));
    expect(await context!.getToken()).toBe('firebase-id-token');
    expect(user.getIdToken).toHaveBeenCalledOnce();
  });

  it('waits for persisted settings and eager credential reconciliation before hydration and user setup', async () => {
    let finishSync: (() => void) | undefined;
    authMocks.syncKeys.mockImplementation(() => {
      authMocks.events.push('syncKeys');
      return new Promise<boolean>((resolve) => {
        finishSync = () => {
          authMocks.aiSettingsHydrated = true;
          resolve(true);
        };
      });
    });
    await render();
    const user = makeUser();

    await act(async () => {
      authMocks.authStateListener!(user);
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(authMocks.syncKeys).toHaveBeenCalledOnce());

    expect(authMocks.events).toEqual(['rehydrate', 'syncKeys']);
    expect(authMocks.aiSettingsHydrated).toBe(false);
    expect(authMocks.setUser).not.toHaveBeenCalled();

    await act(async () => {
      finishSync?.();
      await vi.waitFor(() => expect(authMocks.syncModules).toHaveBeenCalledOnce());
    });

    expect(authMocks.aiSettingsHydrated).toBe(true);
    expect(authMocks.setAISettingsHydrated).not.toHaveBeenCalled();
    expect(authMocks.setUser).toHaveBeenCalledWith(expect.objectContaining({
      id: 'owner-1',
      email: 'owner@example.test',
      name: 'Owner',
      roles: ['user'],
    }));
  });

  it('keeps Agent settings unhydrated after a failed reconciliation attempt is safely caught', async () => {
    let failSync: ((error: Error) => void) | undefined;
    authMocks.syncKeys.mockImplementation(() => {
      authMocks.events.push('syncKeys');
      return new Promise<void>((_resolve, reject) => { failSync = reject; });
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await render();

    await act(async () => {
      authMocks.authStateListener!(makeUser());
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(authMocks.syncKeys).toHaveBeenCalledOnce());
    expect(authMocks.aiSettingsHydrated).toBe(false);

    await act(async () => {
      failSync?.(new Error('private metadata detail'));
      await vi.waitFor(() => expect(authMocks.syncModules).toHaveBeenCalledOnce());
    });

    expect(authMocks.aiSettingsHydrated).toBe(false);
    expect(authMocks.setAISettingsHydrated).not.toHaveBeenCalled();
    expect(authMocks.setUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'owner-1' }));
    expect(warning).toHaveBeenCalled();
    expect(warning.mock.calls.flat().join(' ')).not.toContain('private metadata detail');
    warning.mockRestore();
  });
});
