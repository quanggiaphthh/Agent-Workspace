import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import { useContextStore } from '../../core/context/contextStore';
import { useAIKeysStore } from '../../modules/settings/aiKeysStore';
import { AdkEventAccumulator } from '@assistant-ui/react-google-adk';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';
import { authFetch } from '../../lib/authFetch';

export interface ChatMessagePart {
  type: 'text' | 'reasoning' | 'tool-call' | 'tool-response' | 'error';
  text?: string;
  reasoning?: string;
  toolName?: string;
  toolCallId?: string;
  args?: any;
  result?: any;
  error?: string;
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
  };
  sendMessage: (text: string) => Promise<void>;
  cancelRun: () => void;
  toolConfirmations: ToolConfirmationItem[];
  confirmTool: (toolCallId: string, confirmed: boolean, payload?: any) => Promise<void>;
  clearHistory: () => void;
  newConversation: () => void;
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
  const { user, getToken } = useFirebaseAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [temporaryMode, setTemporaryMode] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toolConfirmations, setToolConfirmations] = useState<ToolConfirmationItem[]>([]);

  const prefix = user ? `uid_${user.uid}_` : '';

  const isLoaded = useRef(false);

  // Dynamic state loader on user/mode changes
  useEffect(() => {
    isLoaded.current = false;
    if (temporaryMode) {
      setMessages([]);
      setActiveSessionId(crypto.randomUUID());
      isLoaded.current = true;
      return;
    }
    try {
      const historyKey = `${prefix}adk_chat_history_v2`;
      const sessionKey = `${prefix}adk_active_session_id`;
      
      const savedHistory = localStorage.getItem(historyKey);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        } else {
          setMessages([]);
        }
      } else {
        setMessages([]);
      }

      const savedSession = localStorage.getItem(sessionKey);
      if (savedSession) {
        setActiveSessionId(savedSession);
      } else {
        const newId = crypto.randomUUID();
        localStorage.setItem(sessionKey, newId);
        setActiveSessionId(newId);
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage', e);
    } finally {
      isLoaded.current = true;
    }
  }, [user, temporaryMode, prefix]);

  // Persist messages and session to localStorage
  useEffect(() => {
    if (temporaryMode) return;
    if (!isLoaded.current) return; // Prevent overwriting history before loading completes
    if (!activeSessionId) return; // Wait until loaded/initialized
    try {
      const historyKey = `${prefix}adk_chat_history_v2`;
      const sessionKey = `${prefix}adk_active_session_id`;
      localStorage.setItem(historyKey, JSON.stringify(messages));
      localStorage.setItem(sessionKey, activeSessionId);
    } catch (e) {
      console.warn('Failed to save state to localStorage', e);
    }
  }, [messages, activeSessionId, temporaryMode, prefix]);

  const activeAbortController = useRef<AbortController | null>(null);

  const cancelRun = useCallback(() => {
    if (activeAbortController.current) {
      activeAbortController.current.abort();
      activeAbortController.current = null;
    }
    setIsRunning(false);
    setIsLoading(false);
  }, []);

  const sendPayloadToAgent = useCallback(async (bodyPayload: any, overrideSessionId?: string) => {
    cancelRun();

    const controller = new AbortController();
    activeAbortController.current = controller;
    setIsRunning(true);
    setIsLoading(true);

    // Capture messages before the run starts
    let initialMsgs: ChatMessage[] = [];
    setMessages(prev => {
      initialMsgs = prev;
      return prev;
    });

    try {
      const state = useAIKeysStore.getState();
      
      const aiConfig: any = {
        credentialId: state.credentialId, // Use the selected credential ID
        providerId: state.agentProvider,
        modelId: state.agentModel || 'gemini-3.8-flash',
        globalDefaultModel: state.globalDefaultModel,
        autoRotate: state.autoRotate, // Add this!
        memoryEnabled: localStorage.getItem(`uid_${user?.uid}_agent_memory_enabled`) !== 'false',
      };
      
      // Note: We no longer send raw keys here. 
      // The server resolves credentialId to a key.

      const enrichedPayload = { 
        ...bodyPayload, 
        aiConfig,
        sessionId: overrideSessionId || activeSessionId
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

      setIsLoading(false);

      if (!response.body) {
        setIsRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      const accumulator = new AdkEventAccumulator();

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
            if (dataStr === '[DONE]') continue;

            try {
              const event = JSON.parse(dataStr);
              accumulator.processEvent(event);
              
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

              setMessages([...initialMsgs, ...mappedMessages]);
              
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
              console.warn('Failed to parse SSE data', err);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
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
      setIsRunning(false);
      setIsLoading(false);
      activeAbortController.current = null;
    }
  }, [cancelRun, getAppContext, activeSessionId, getToken]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    const newId = crypto.randomUUID();
    setActiveSessionId(newId);
    if (temporaryMode) return;
    try {
      const historyKey = `${prefix}adk_chat_history_v2`;
      const sessionKey = `${prefix}adk_active_session_id`;
      localStorage.removeItem(historyKey);
      localStorage.setItem(sessionKey, newId);
    } catch (e) {
      console.warn('Failed to clear chat history from localStorage', e);
    }
  }, [prefix, temporaryMode]);

  const newConversation = useCallback(() => {
    clearHistory();
  }, [clearHistory]);

  const editMessage = useCallback(async (id: string, newText: string) => {
    if (!newText.trim()) return;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx === -1) return prev;
      const sliced = prev.slice(0, idx);
      return [
        ...sliced,
        {
          id,
          role: 'user',
          content: [{ type: 'text', text: newText.trim() }],
          timestamp: Date.now(),
        },
      ];
    });

    const newSessionId = crypto.randomUUID();
    setActiveSessionId(newSessionId);

    const appContext = getAppContext();
    await sendPayloadToAgent({
      message: newText.trim(),
      stateDelta: appContext,
    }, newSessionId);
  }, [getAppContext, sendPayloadToAgent]);

  const regenerate = useCallback(async () => {
    setMessages((prev) => {
      const lastUserMsgIndex = [...prev].reverse().findIndex((m) => m.role === 'user');
      if (lastUserMsgIndex === -1) return prev;
      const actualIndex = prev.length - 1 - lastUserMsgIndex;
      return prev.slice(0, actualIndex + 1);
    });

    const newSessionId = crypto.randomUUID();
    setActiveSessionId(newSessionId);

    setTimeout(async () => {
      const currentMessages = messages;
      const lastUser = [...currentMessages].reverse().find((m) => m.role === 'user');
      if (lastUser) {
        const text = typeof lastUser.content === 'string'
          ? lastUser.content
          : Array.isArray(lastUser.content)
            ? lastUser.content.map((p) => p.text || '').join('')
            : '';
        if (text) {
          const appContext = getAppContext();
          await sendPayloadToAgent({
            message: text,
            stateDelta: appContext,
          }, newSessionId);
        }
      }
    }, 50);
  }, [messages, getAppContext, sendPayloadToAgent]);

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

    setMessages((prev) => [...prev, userMsg]);

    const appContext = getAppContext();
    await sendPayloadToAgent({
      message: text.trim(),
      stateDelta: appContext,
    });
  }, [getAppContext, sendPayloadToAgent]);

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

  const threadState = useMemo(() => ({
    messages,
    isRunning,
    isLoading,
  }), [messages, isRunning, isLoading]);

  const contextValue: AgentRuntimeContextValue = useMemo(() => ({
    runtime: null,
    threadState,
    sendMessage,
    cancelRun,
    toolConfirmations,
    confirmTool,
    clearHistory,
    newConversation,
    editMessage,
    regenerate,
    toggleStarMessage,
    temporaryMode,
    setTemporaryMode,
  }), [threadState, sendMessage, cancelRun, toolConfirmations, confirmTool, clearHistory, newConversation, editMessage, regenerate, toggleStarMessage, temporaryMode, setTemporaryMode]);

  return (
    <AgentRuntimeContext.Provider value={contextValue}>
      {children}
    </AgentRuntimeContext.Provider>
  );
}
