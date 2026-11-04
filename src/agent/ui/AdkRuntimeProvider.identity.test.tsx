// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  uid: 'A' as string | null,
  loading: false,
  fetch: vi.fn(),
}));

vi.mock('../../lib/FirebaseAuthProvider', () => ({
  useFirebaseAuth: () => ({
    user: state.uid ? { uid: state.uid } : null,
    loading: state.loading,
  }),
}));
vi.mock('../../lib/authFetch', () => ({ authFetch: state.fetch }));
vi.mock('../../core/context/contextStore', () => ({
  useContextStore: (selector: (value: unknown) => unknown) => selector({
    getAppContext: () => ({ activeModule: 'home', selectedEntity: null }),
  }),
}));
vi.mock('../../modules/settings/aiKeysStore', () => {
  const getState = () => ({
    aiSettingsHydrated: true,
    credentialId: 'system', agentProvider: 'google', agentModel: 'gemini',
    autoRotate: false, memoryEnabled: false, webSearchEnabled: false,
  });
  return { useAIKeysStore: Object.assign((selector: (value: unknown) => unknown) => selector(getState()), { getState }) };
});
vi.mock('@assistant-ui/react-google-adk', () => ({
  AdkEventAccumulator: class {
    processEvent() {}
    getMessages() { return []; }
    getToolConfirmations() { return []; }
  },
}));

import { AdkRuntimeProvider, useAgentRuntime, type AgentRuntimeContextValue } from './AdkRuntimeProvider';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const transcript = (userId: string) => [{
  id: 'private-' + userId, role: 'assistant' as const,
  content: [{ type: 'text' as const, text: 'Private transcript ' + userId }],
}];

describe('CAT-02 Agent session identity boundary', () => {
  let root: Root;
  let container: HTMLDivElement;
  let runtime: AgentRuntimeContextValue | null;
  let replyToB: ((response: unknown) => void) | null;

  function Probe() {
    runtime = useAgentRuntime();
    return <div data-testid="transcript">{runtime.threadState.messages.map(message => message.id).join(',')}</div>;
  }

  const app = () => <AdkRuntimeProvider><Probe /></AdkRuntimeProvider>;

  beforeEach(() => {
    state.uid = 'A';
    state.loading = false;
    state.fetch.mockReset();
    localStorage.clear();
    localStorage.setItem('uid_A_adk_active_session_id', 'session-A');
    localStorage.setItem('uid_B_adk_active_session_id', 'session-B');
    runtime = null;
    replyToB = null;
    state.fetch.mockImplementation((url: string) => {
      if (url === '/api/agent/sessions/session-A') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ session: { messages: transcript('A') } }) });
      }
      if (url === '/api/agent/sessions/session-B') {
        return new Promise(resolve => { replyToB = resolve; });
      }
      throw new Error('Unexpected Agent test request ' + url);
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  async function loginA() {
    await act(async () => { root.render(app()); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(runtime!.threadState.messages.map(message => message.id)).toEqual(['private-A']);
  }

  it('clears owner A transcript before owner B history resolves', async () => {
    await loginA();
    state.uid = 'B';
    await act(async () => { root.render(app()); });
    expect(runtime!.threadState.messages).toEqual([]);
    expect(runtime!.toolConfirmations).toEqual([]);
    expect(runtime!.activeSessionId).toBe('session-B');
    expect(replyToB).toBeTypeOf('function');

    await act(async () => {
      replyToB!({ ok: true, status: 200, json: async () => ({ session: { messages: transcript('B') } }) });
      await Promise.resolve();
    });
    expect(runtime!.threadState.messages.map(message => message.id)).toEqual(['private-B']);
  });

  it('clears transcript, selection and current session after logout', async () => {
    await loginA();
    state.uid = null;
    await act(async () => { root.render(app()); });
    expect(runtime!.threadState.messages).toEqual([]);
    expect(runtime!.toolConfirmations).toEqual([]);
    expect(runtime!.activeSessionId).toBe('');
    expect(runtime!.threadState.isReady).toBe(false);
  });

  it('aborts active owner A stream on account switch rather than letting it update B', async () => {
    await loginA();
    let signal: AbortSignal | undefined;
    state.fetch.mockImplementation((url: string, options?: { signal?: AbortSignal }) => {
      if (url === '/api/agent/chat') {
        signal = options?.signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        });
      }
      if (url === '/api/agent/sessions/session-B') return new Promise(resolve => { replyToB = resolve; });
      throw new Error('Unexpected Agent test request ' + url);
    });
    let pending!: Promise<void>;
    await act(async () => {
      pending = runtime!.sendMessage('User A request');
      await Promise.resolve();
    });
    expect(signal?.aborted).toBe(false);
    state.uid = 'B';
    await act(async () => { root.render(app()); });
    await act(async () => { await pending; });
    expect(signal?.aborted).toBe(true);
    expect(runtime!.threadState.messages).toEqual([]);
    expect(runtime!.threadState.isRunning).toBe(false);
  });
});
