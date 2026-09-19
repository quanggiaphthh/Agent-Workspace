import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import { useContextStore } from '../../core/context/contextStore';
import { useAIKeysStore } from '../../modules/settings/aiKeysStore';
import { AdkEventAccumulator } from '@assistant-ui/react-google-adk';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';
import { authFetch } from '../../lib/authFetch';
import { AgentSseProtocolError, processAgentSseData } from '../runtime/sseLifecycle';
import { mergeStreamingMessages } from '../runtime/streamMessageMerge';
import { AgentRunGate } from '../runtime/runLifecycle';
import { decideSessionHydration } from '../runtime/sessionHistoryPolicy';
import { reconstructPendingConfirmations } from '../runtime/temporaryRecoveryPolicy';

export interface ChatMessagePart {
  type: 'text' | 'reasoning' | 'tool-call' | 'tool-response' | 'sources' | 'error';
  text?: string;
  reasoning?: string;
  toolName?: string;
  toolCallId?: string;
  args?: any;
  result?: any;
  error?: string;
  sources?: { title: string; url: string }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: ChatMessagePart[] | string;
  timestamp?: number;
  starred?: boolean;
}

export interface ToolConfirmationItem {
  id: string;
  toolCallId: string;
  name: string;
  args: any;
  confirmation?: {
    hint?: string;
    payload?: any;
  };
}

export interface AgentRuntimeContextValue {
  runtime: any;
  threadState: {
    messages: ChatMessage[];
    isRunning: boolean;
    isLoading: boolean;
    isReady: boolean;
    historyError?: string;
  };
  sendMessage: (text: string) => Promise<void>;
  cancelRun: () => void;
  toolConfirmations: ToolConfirmationItem[];
  confirmTool: (toolCallId: string, confirmed: boolean, payload?: any) => Promise<void>;
  clearHistory: () => Promise<void>;
  newConversation: () => void;
  activeSessionId: string;
  loadConversation: (sessionId: string, messages: ChatMessage[]) => void;
  editMessage: (id: string, newText: string) => Promise<void>;
  regenerate: () => Promise<void>;
  toggleStarMessage: (id: string) => void;
  temporaryMode: boolean;
  setTemporaryMode: (mode: boolean) => void;
}

export const AgentRuntimeContext = createContext<AgentRuntimeContextValue | null>(null);

export function useAgentRuntime(): AgentRuntimeContextValue {
  const ctx = useContext(AgentRuntimeContext);
  if (!ctx) {
    throw new Error('useAgentRuntime must be used within AdkRuntimeProvider');
  }
  return ctx;
}

export function useAdkToolConfirmations(): ToolConfirmationItem[] {
  const ctx = useAgentRuntime();
  return ctx.toolConfirmations;
}

export function useAdkConfirmTool() {
  const ctx = useAgentRuntime();
  return ctx.confirmTool;
}

interface AdkRuntimeProviderProps {
  children: React.ReactNode;
}

let messageIdCounter = 0;
function nextId(): string {
  messageIdCounter += 1;
  return `msg-${Date.now()}-${messageIdCounter}`;
}

export function AdkRuntimeProvider({ children }: AdkRuntimeProviderProps) {
  const getAppContext = useContextStore((state) => state.getAppContext);
  const { user, loading: authLoading } = useFirebaseAuth();
  const aiSettingsHydrated = useAIKeysStore((state) => state.aiSettingsHydrated);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [temporaryMode, setTemporaryModeState] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toolConfirmations, setToolConfirmations] = useState<ToolConfirmationItem[]>([]);
  const [historyError, setHistoryError] = useState<string | undefined>();
  const [isHydratingHistory, setIsHydratingHistory] = useState(false);

  const prefix = user ? `uid_${user.uid}_` : '';

  const isLoaded = useRef(false);

  // Persistent chats use the server session as durable history authority. localStorage
  // stores only the active client session pointer; legacy transcript cache is removed.
  useEffect(() => {
    let disposed = false;
    isLoaded.current = false;
    setHistoryError(undefined);
    setIsHydratingHistory(!temporaryMode);
    if (temporaryMode) {
      // The mode transition owns creation/clearing of the ephemeral identity.
      // Never read/write the durable active-session pointer while temporary.
      isLoaded.current = true;
      setIsHydratingHistory(false);
      return () => { disposed = true; };
    }
    if (!user || authLoading) return () => { disposed = true; };

    const sessionKey = `${prefix}adk_active_session_id`;
    const legacyHistoryKey = `${prefix}adk_chat_history_v2`;
    let sessionId = localStorage.getItem(sessionKey) || crypto.randomUUID();
    localStorage.setItem(sessionKey, sessionId);
    localStorage.removeItem(legacyHistoryKey);
    setActiveSessionId(sessionId);

    void (async () => {
      try {
        const response = await authFetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}`);
        let serverMessages: ChatMessage[] = [];
        if (response.ok) {
          const data = await response.json();
          serverMessages = Array.isArray(data?.session?.messages) ? data.session.messages : [];
        }
        const replacementSessionId = crypto.randomUUID();
        const decision = decideSessionHydration({ sessionId, status: response.status, serverMessages, replacementSessionId });
        if (disposed) return;
        if (decision.kind === 'hydrate') {
          const hydratedMessages = decision.messages as ChatMessage[];
          setMessages(hydratedMessages);
          setToolConfirmations(reconstructPendingConfirmations(hydratedMessages) as ToolConfirmationItem[]);
        } else if (decision.kind === 'missing') {
          sessionId = decision.replacementSessionId;
          localStorage.setItem(sessionKey, sessionId);
          setActiveSessionId(sessionId);
          setMessages([]);
          setToolConfirmations([]);
        } else {
          setHistoryError(decision.message);
        }
      } catch {
        if (!disposed) setHistoryError('Không thể tải lịch sử hội thoại từ máy chủ. Vui lòng thử tải lại.');
      } finally {
        if (!disposed) { isLoaded.current = true; setIsHydratingHistory(false); }
      }
    })();
    return () => { disposed = true; };
  }, [user, authLoading, temporaryMode, prefix]);

  useEffect(() => {
    if (temporaryMode || !isLoaded.current || !activeSessionId) return;
    try { localStorage.setItem(`${prefix}adk_active_session_id`, activeSessionId); }
    catch (e) { console.warn('Failed to save active Agent session pointer', e); }
  }, [activeSessionId, temporaryMode, prefix]);

  const runGate = useRef(new AgentRunGate());

  const cancelRun = useCallback(() => {
    runGate.current.cancel();
    setIsRunning(false);
    setIsLoading(false);
  }, []);

  const setTemporaryMode = useCallback((mode: boolean) => {
    if (mode === temporaryMode) return;
    // Mode boundaries are run boundaries. The persistent pointer remains in
    // localStorage; temporary identity/transcript never becomes durable.
    cancelRun();
    setHistoryError(undefined);
    setMessages([]);
    setToolConfirmations([]);
    if (mode) setActiveSessionId(crypto.randomUUID());
    setTemporaryModeState(mode);
  }, [cancelRun, temporaryMode]);

  const sendPayloadToAgent = useCallback(async (bodyPayload: any, overrideSessionId?: string, initialMessagesOverride?: ChatMessage[], optimisticUserMessageId?: string) => {
    // Starting a new run aborts the previous transport and gives this async
    // execution exclusive ownership of UI mutations.
    const run = runGate.current.start();
    const controller = run.controller;
    setIsRunning(true);
    setIsLoading(true);

    // Capture the exact transcript that should precede this run. Branching
    // callers pass it explicitly so React state batching cannot lose context.
    let initialMsgs: ChatMessage[] = initialMessagesOverride || [];
    if (!initialMessagesOverride) {
      setMessages(prev => {
        initialMsgs = prev;
        return prev;
      });
    }

    try {
      if (!user || authLoading) {
        throw new Error('Phiên đăng nhập chưa sẵn sàng. Vui lòng thử lại sau khi xác thực hoàn tất.');
      }
      if (!aiSettingsHydrated) {
        throw new Error('Cài đặt AI đang được nạp. Vui lòng thử lại sau khi hoàn tất đồng bộ.');
      }

      const state = useAIKeysStore.getState();
      const aiConfig = {
        credentialId: state.credentialId,
        agentProvider: state.agentProvider,
        agentModel: state.agentModel,
        autoRotate: state.autoRotate,
        memoryEnabled: state.memoryEnabled,
        webSearchEnabled: state.webSearchEnabled,
      };

      const enrichedPayload = {
        ...bodyPayload,
        aiConfig,
        sessionId: overrideSessionId || activeSessionId,
        temporaryMode,
      };

      const response = await authFetch('/api/agent/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enrichedPayload),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorData: any;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `API request failed with status: ${response.status}` };
        }
        throw new Error(errorData.error || errorData.message || 'Unknown API error');
      }

      if (!runGate.current.isCurrent(run)) return;
      setIsLoading(false);

      if (!response.body) {
        throw Object.assign(new Error('Máy chủ không trả về luồng phản hồi.'), { code: 'STREAM_MISSING' });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      const accumulator = new AdkEventAccumulator();

      let streamCompleted = false;
      let streamError: { code: string; message: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();

            let event: unknown = null;
            try {
              const kind = processAgentSseData(dataStr, {
                onAdkEvent: (value) => { event = value; },
                onComplete: () => { streamCompleted = true; },
                onError: (error) => { streamError = error; },
              });
              if (kind === 'ignored' || kind === 'complete') continue;
              if (kind === 'error') break;
              try {
                accumulator.processEvent(event as any);
              } catch {
                throw new AgentSseProtocolError();
              }
              
              const adkMessages = accumulator.getMessages();
              const newToolConfirmations = accumulator.getToolConfirmations();

              // Map ADK messages to ChatMessage format
              const mappedMessages: ChatMessage[] = adkMessages.map((msg: any) => {
                const isUser = msg.type === 'human';
                const role = isUser ? 'user' : 'assistant';
                const content: ChatMessagePart[] = [];

                if (typeof msg.content === 'string') {
                  content.push({ type: 'text', text: msg.content });
                } else if (Array.isArray(msg.content)) {
                  msg.content.forEach((part: any) => {
                    if (part.type === 'text') {
                      content.push({ type: 'text', text: part.text });
                    } else if (part.type === 'reasoning') {
                      content.push({ type: 'reasoning', reasoning: part.text });
                    } else if (part.type === 'code') {
                      // Keep code as text for now but properly formatted
                      content.push({ type: 'text', text: `\n\`\`\`${part.language || 'python'}\n${part.code}\n\`\`\`\n` });
                    } else if (part.type === 'code_result') {
                      content.push({ type: 'text', text: `\n> **Kết quả thực thi:**\n> \`\`\`\n> ${part.output}\n> \`\`\`\n` });
                    }
                  });
                }

                if (msg.type === 'ai' && msg.tool_calls) {
                  msg.tool_calls.forEach((tc: any) => {
                    content.push({
                      type: 'tool-call',
                      toolName: tc.name,
                      toolCallId: tc.id,
                      args: tc.args
                    });
                  });
                }

                if (msg.type === 'tool') {
                  let result = msg.content;
                  try {
                    result = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
                  } catch { /* ignore */ }
                  content.push({
                    type: 'tool-response',
                    toolCallId: msg.tool_call_id,
                    toolName: msg.name,
                    result
                  });
                  const sourceCandidate = result?.result?.sources || result?.sources;
                  if (Array.isArray(sourceCandidate) && sourceCandidate.length > 0) {
                    const sources = sourceCandidate
                      .filter((source: any) => typeof source?.url === 'string' && source.url.length > 0)
                      .map((source: any) => ({
                        title: typeof source.title === 'string' && source.title.trim() ? source.title : source.url,
                        url: source.url,
                      }));
                    if (sources.length > 0) content.push({ type: 'sources', sources });
                  }
                }

                if (msg.status?.type === 'incomplete' && msg.status?.reason === 'error') {
                  content.push({
                    type: 'error',
                    error: msg.status.error || 'Đã xảy ra lỗi khi xử lý.'
                  });
                }

                return {
                  id: msg.id,
                  role,
                  content,
                  timestamp: Date.now(),
                };
              });

              if (!runGate.current.isCurrent(run)) return;
              setMessages(mergeStreamingMessages(initialMsgs, mappedMessages, { optimisticUserMessageId }));
              
              setToolConfirmations(newToolConfirmations.map((tc: any) => ({
                id: tc.toolCallId,
                toolCallId: tc.toolCallId,
                name: tc.toolName,
                args: tc.args,
                confirmation: {
                  hint: tc.hint,
                  payload: tc.payload
                }
              })));

            } catch (err) {
              if (err instanceof AgentSseProtocolError) throw err;
              throw new AgentSseProtocolError();
            }
          }
        }
        if (streamError) break;
      }

      if (streamError) {
        throw Object.assign(new Error((streamError as any).message), { code: (streamError as any).code });
      }
      if (!controller.signal.aborted && !streamCompleted) {
        throw Object.assign(new Error('Luồng phản hồi kết thúc trước khi nhận tín hiệu hoàn tất.'), { code: 'STREAM_INCOMPLETE' });
      }
    } catch (err: any) {
      const intentionalAbort = controller.signal.aborted || err?.name === 'AbortError';
      if (!intentionalAbort && runGate.current.isCurrent(run)) {
        console.error('Agent chat error:', err);
        setMessages(prev => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            content: [{ type: 'text', text: `❌ **Lỗi hệ thống:** ${err.message || 'Không thể kết nối với Trợ lý AI.'}` }],
            timestamp: Date.now()
          }
        ]);
      }
    } finally {
      // A stopped/stale run must never clear lifecycle state owned by a newer run.
      if (runGate.current.finish(run)) {
        setIsRunning(false);
        setIsLoading(false);
      }
    }
  }, [activeSessionId, user, authLoading, aiSettingsHydrated, temporaryMode]);

  const resetLocalConversation = useCallback((sessionId: string) => {
    setMessages([]);
    setToolConfirmations([]);
    setActiveSessionId(sessionId);
    if (temporaryMode) return;
    try {
      const sessionKey = `${prefix}adk_active_session_id`;
      localStorage.removeItem(`${prefix}adk_chat_history_v2`);
      localStorage.setItem(sessionKey, sessionId);
    } catch (e) {
      console.warn('Failed to reset local chat state', e);
    }
  }, [prefix, temporaryMode]);

  const clearHistory = useCallback(async () => {
    const sessionToDelete = activeSessionId;
    if (!temporaryMode && sessionToDelete && user) {
      try {
        const response = await authFetch(`/api/agent/sessions/${encodeURIComponent(sessionToDelete)}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 404) {
          throw new Error((await response.json()).error || 'Không thể xóa hội thoại');
        }
      } catch (err) {
        console.error('Failed to delete persistent Agent session:', err);
        throw err;
      }
    }
    resetLocalConversation(crypto.randomUUID());
  }, [activeSessionId, resetLocalConversation, temporaryMode, user]);

  const newConversation = useCallback(() => {
    cancelRun();
    setHistoryError(undefined);
    resetLocalConversation(crypto.randomUUID());
  }, [cancelRun, resetLocalConversation]);

  const loadConversation = useCallback((sessionId: string, sessionMessages: ChatMessage[]) => {
    if (!sessionId) return;
    // Loading a different durable session invalidates ownership of any active run.
    cancelRun();
    setToolConfirmations(reconstructPendingConfirmations(sessionMessages) as ToolConfirmationItem[]);
    setActiveSessionId(sessionId);
    setMessages(sessionMessages);
    if (temporaryMode) return;
    try {
      localStorage.setItem(`${prefix}adk_active_session_id`, sessionId);
      localStorage.removeItem(`${prefix}adk_chat_history_v2`);
    } catch (e) {
      console.warn('Failed to persist loaded conversation locally', e);
    }
  }, [cancelRun, prefix, temporaryMode]);

  const branchConversation = useCallback(async (beforeUserTurn: number) => {
    if (!activeSessionId) throw new Error('Không có session đang hoạt động để tạo nhánh.');
    const response = await authFetch('/api/agent/sessions/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceSessionId: activeSessionId,
        beforeUserTurn,
        temporaryMode,
      }),
    });
    if (!response.ok) throw new Error((await response.json()).error || 'Không thể tạo nhánh hội thoại');
    const data = await response.json();
    return data.branch as { sessionId: string; messages: ChatMessage[] };
  }, [activeSessionId, temporaryMode]);

  const editMessage = useCallback(async (id: string, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    const targetIndex = messages.findIndex((message) => message.id === id && message.role === 'user');
    if (targetIndex < 0) return;

    const beforeUserTurn = messages.slice(0, targetIndex).filter((message) => message.role === 'user').length;
    const branch = await branchConversation(beforeUserTurn);
    const editedMessage: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: [{ type: 'text', text: trimmed }],
      timestamp: Date.now(),
    };
    const baseMessages = [...(branch.messages || []), editedMessage];
    loadConversation(branch.sessionId, baseMessages);

    const appContext = getAppContext();
    await sendPayloadToAgent({
      message: trimmed,
      stateDelta: appContext,
    }, branch.sessionId, baseMessages, editedMessage.id);
  }, [branchConversation, getAppContext, loadConversation, messages, sendPayloadToAgent]);

  const regenerate = useCallback(async () => {
    let targetIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') {
        targetIndex = index;
        break;
      }
    }
    if (targetIndex < 0) return;

    const target = messages[targetIndex];
    const text = typeof target.content === 'string'
      ? target.content
      : target.content.map((part) => part.text || '').join('').trim();
    if (!text) return;

    const beforeUserTurn = messages.slice(0, targetIndex).filter((message) => message.role === 'user').length;
    const branch = await branchConversation(beforeUserTurn);
    const replayedUser: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: Date.now(),
    };
    const baseMessages = [...(branch.messages || []), replayedUser];
    loadConversation(branch.sessionId, baseMessages);

    const appContext = getAppContext();
    await sendPayloadToAgent({
      message: text,
      stateDelta: appContext,
    }, branch.sessionId, baseMessages, replayedUser.id);
  }, [branchConversation, getAppContext, loadConversation, messages, sendPayloadToAgent]);

  const toggleStarMessage = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, starred: !m.starred } : m))
    );
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMessageId = nextId();
    const userMsg: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: [{ type: 'text', text: text.trim() }],
      timestamp: Date.now(),
    };

    const optimisticTranscript = [...messages, userMsg];
    setMessages(optimisticTranscript);

    const appContext = getAppContext();
    await sendPayloadToAgent({
      message: text.trim(),
      stateDelta: appContext,
    }, undefined, optimisticTranscript, userMessageId);
  }, [getAppContext, messages, sendPayloadToAgent]);

  const confirmTool = useCallback(async (toolCallId: string, confirmed: boolean, payload?: any) => {
    setToolConfirmations((prev) => prev.filter((item) => item.toolCallId !== toolCallId && item.id !== toolCallId));

    const appContext = getAppContext();
    
    // Send the correct ADK FunctionResponse block representing the confirmation response
    await sendPayloadToAgent({
      toolResponse: {
        role: 'user',
        parts: [{
          functionResponse: {
            id: toolCallId,
            name: 'adk_request_confirmation',
            response: { confirmed, payload }
          }
        }]
      },
      stateDelta: appContext,
    });
  }, [getAppContext, sendPayloadToAgent]);

  const isReady = Boolean(user) && !authLoading && aiSettingsHydrated && !isHydratingHistory;

  const threadState = useMemo(() => ({
    messages,
    isRunning,
    isLoading,
    isReady,
    historyError,
  }), [messages, isRunning, isLoading, isReady, historyError]);

  const contextValue: AgentRuntimeContextValue = useMemo(() => ({
    runtime: null,
    threadState,
    sendMessage,
    cancelRun,
    toolConfirmations,
    confirmTool,
    clearHistory,
    newConversation,
    activeSessionId,
    loadConversation,
    editMessage,
    regenerate,
    toggleStarMessage,
    temporaryMode,
    setTemporaryMode,
  }), [threadState, sendMessage, cancelRun, toolConfirmations, confirmTool, clearHistory, newConversation, activeSessionId, loadConversation, editMessage, regenerate, toggleStarMessage, temporaryMode, setTemporaryMode]);

  return (
    <AgentRuntimeContext.Provider value={contextValue}>
      {children}
    </AgentRuntimeContext.Provider>
  );
}
