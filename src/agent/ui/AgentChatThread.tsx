import React, { useState, useRef, useEffect, useReducer } from 'react';
import { useAgentRuntime } from './AdkRuntimeProvider';
import { Button } from '../../components/ui/Button';
import {
  Send,
  StopCircle,
  Bot,
  User,
  Sparkles,
  Wrench,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Edit2,
  RefreshCw,
  Star,
  Reply,
  Save,
  Brain,
  ShieldAlert,
  CornerUpLeft,
  Quote,
  Paperclip,
  X,
  Loader2,
  FileText
} from 'lucide-react';
import Markdown from 'react-markdown';
import { AdkConfirmation } from './AdkConfirmation';
import { useContextStore } from '../../core/context/contextStore';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';
import { uploadUserFile, type UploadProblem } from '../../modules/home/fileUploadClient';
import type { AttachmentReference } from '../../../server/agent/chat/chatRequestContract';
import { MAX_ATTACHMENTS_PER_TURN } from '../../../server/agent/chat/attachmentPolicy';
import { SUPPORTED_FILE_ACCEPT } from '../../../shared/contracts/fileUploadPolicy';


export type ComposerAttachment = {
  localId: string;
  file: File;
  name: string;
  phase: 'uploading' | 'complete' | 'error';
  fileId?: string;
  error?: string;
};

export type ComposerAttachmentAction =
  | { type: 'add'; attachment: ComposerAttachment }
  | { type: 'complete'; localId: string; fileId: string }
  | { type: 'error'; localId: string; error: string }
  | { type: 'remove'; localId: string }
  | { type: 'reset' };

export function createComposerAttachment(file: File, localId: string = crypto.randomUUID()): ComposerAttachment {
  return { localId, file, name: file.name, phase: 'uploading' };
}

export function composerAttachmentReducer(
  state: ComposerAttachment[],
  action: ComposerAttachmentAction,
): ComposerAttachment[] {
  if (action.type === 'reset') return [];
  if (action.type === 'remove') return state.filter((item) => item.localId !== action.localId);
  if (action.type === 'add') {
    if (state.length >= MAX_ATTACHMENTS_PER_TURN) return state;
    return [...state, action.attachment];
  }
  return state.map((item) => {
    if (item.localId !== action.localId) return item;
    if (action.type === 'complete') return { ...item, phase: 'complete', fileId: action.fileId, error: undefined };
    return { ...item, phase: 'error', fileId: undefined, error: action.error };
  });
}

export function successfulAttachmentReferences(attachments: ComposerAttachment[]): AttachmentReference[] {
  return attachments.flatMap((attachment) =>
    attachment.phase === 'complete' && attachment.fileId ? [{ fileId: attachment.fileId }] : [],
  );
}

export function AgentChatThread() {
  const { user } = useFirebaseAuth();
  const { 
    threadState, 
    sendMessage, 
    cancelRun, 
    editMessage, 
    regenerate, 
    toggleStarMessage,
    temporaryMode,
    setTemporaryMode
  } = useAgentRuntime();
  const activeModule = useContextStore(state => state.activeModule);
  const appUser = useContextStore(state => state.user);
  const canWriteMemory = appUser.permissions.includes('memory.write') || appUser.roles.includes('admin');
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedMemoryId, setSavedMemoryId] = useState<string | null>(null);
  const [attachments, dispatchAttachment] = useReducer(composerAttachmentReducer, []);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editing state for user messages
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, isRunning, isReady, historyError } = threadState;

  useEffect(() => () => {
    uploadControllersRef.current.forEach((controller) => controller.abort());
    uploadControllersRef.current.clear();
  }, []);

  // Auto-scroll to bottom on update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRunning]);

  const handleSend = async () => {
    if (!inputText.trim() || isRunning || !isReady) return;
    if (attachments.some((attachment) => attachment.phase === 'uploading')) {
      setAttachmentNotice('Vui lòng chờ tệp tải lên hoàn tất trước khi gửi.');
      return;
    }

    const attachmentReferences = successfulAttachmentReferences(attachments);
    await sendMessage(inputText.trim(), attachmentReferences);
    setInputText('');
    dispatchAttachment({ type: 'reset' });
    setAttachmentNotice(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;
    const availableSlots = MAX_ATTACHMENTS_PER_TURN - attachments.length;
    if (availableSlots <= 0) {
      setAttachmentNotice(`Chỉ được đính kèm tối đa ${MAX_ATTACHMENTS_PER_TURN} tệp cho mỗi tin nhắn.`);
      return;
    }

    const selected = Array.from(files).slice(0, availableSlots);
    if (files.length > availableSlots) {
      setAttachmentNotice(`Chỉ nhận ${availableSlots} tệp còn lại; tối đa ${MAX_ATTACHMENTS_PER_TURN} tệp cho mỗi tin nhắn.`);
    } else {
      setAttachmentNotice(null);
    }

    selected.forEach((file) => {
      const attachment = createComposerAttachment(file);
      const controller = new AbortController();
      uploadControllersRef.current.set(attachment.localId, controller);
      dispatchAttachment({ type: 'add', attachment });

      void uploadUserFile(file, controller.signal)
        .then((uploaded) => {
          dispatchAttachment({ type: 'complete', localId: attachment.localId, fileId: uploaded.fileId });
        })
        .catch((error: UploadProblem) => {
          if (error?.code !== 'ABORTED') {
            dispatchAttachment({
              type: 'error',
              localId: attachment.localId,
              error: error?.message || 'Không thể tải tệp lên. Vui lòng thử lại.',
            });
          }
        })
        .finally(() => {
          uploadControllersRef.current.delete(attachment.localId);
        });
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAttachment = (localId: string) => {
    uploadControllersRef.current.get(localId)?.abort();
    uploadControllersRef.current.delete(localId);
    dispatchAttachment({ type: 'remove', localId });
    setAttachmentNotice(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddToMemory = async (text: string, id: string) => {
    if (!user || !canWriteMemory) return;
    try {
      const response = await authFetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text.length > 200 ? text.substring(0, 200) + '...' : text,
          category: 'Trò chuyện',
          source: 'Thêm thủ công từ khung chat',
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Không thể lưu vào bộ nhớ');
      setSavedMemoryId(id);
      setTimeout(() => setSavedMemoryId(null), 2500);
    } catch (err) {
      console.error('Failed to add response to memory:', err);
    }
  };

  const handleQuote = (text: string) => {
    const quoted = text.split('\n').map(line => `> ${line}`).join('\n');
    setInputText(prev => `${quoted}\n\n${prev}`);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Context-aware quick prompt suggestions based on activeModule
  const getContextualSuggestions = () => {
    switch (activeModule) {
      case 'tasks':
        return [
          'Liệt kê toàn bộ nhiệm vụ đang thực hiện',
          'Tạo nhiệm vụ mới: Chuẩn bị tài liệu họp tuần',
          'Thống kê tỷ lệ hoàn thành công việc',
        ];
      case 'settings':
        return [
          'Kiểm tra trạng thái cấu hình hệ thống',
          'Xem thông tin phân hệ đã kích hoạt',
        ];
      case 'home':
      default:
        return [
          'Hiển thị tổng quan các widget và hệ thống',
          'Tóm tắt trạng thái các phân hệ đang hoạt động',
          'Trợ giúp sử dụng Trợ lý AI',
        ];
    }
  };

  const suggestions = getContextualSuggestions();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-50/40 relative">
      {historyError && !temporaryMode && (
        <div className="px-3 py-2 border-b border-amber-200 bg-amber-50 text-[11px] text-amber-800 shrink-0">
          {historyError}
        </div>
      )}
      {/* Top Temporary Mode bar */}
      <div className="px-3 py-1.5 bg-white border-b border-neutral-200/80 flex items-center justify-between text-[11px] shrink-0">
        <span className="text-neutral-500 flex items-center gap-1">
          {temporaryMode ? (
            <span className="text-amber-700 font-medium flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> Chế độ hội thoại tạm thời (Không lưu lịch sử)
            </span>
          ) : (
            <span>Hội thoại tiêu chuẩn (Đã bật lưu trữ)</span>
          )}
        </span>
        <button
          onClick={() => setTemporaryMode(!temporaryMode)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
            temporaryMode ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          {temporaryMode ? 'Tắt tạm thời' : 'Bật tạm thời'}
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center p-4">
            <div className="h-10 w-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center mb-3 shadow-sm">
              <Bot className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-neutral-800">
              Tôi có thể hỗ trợ gì cho bạn?
            </h3>
            <p className="text-xs text-neutral-500 max-w-xs mt-1 leading-relaxed">
              Ra lệnh bằng ngôn ngữ tự nhiên để thao tác trên phân hệ <span className="font-semibold text-neutral-700 capitalize">{activeModule}</span>, tạo dữ liệu hoặc tra cứu thông tin hệ thống.
            </p>

            <div className="w-full mt-6 space-y-2">
              <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center justify-center gap-1">
                <Sparkles className="h-3 w-3" /> Gợi ý thao tác theo ngữ cảnh ({activeModule})
              </div>
              <div className="flex flex-col gap-1.5">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendMessage(suggestion)}
                    className="text-left text-xs bg-white hover:bg-neutral-100/80 text-neutral-700 px-3 py-2 rounded-lg border border-neutral-200 transition-colors shadow-xs"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg: any, msgIndex: number) => {
            const isUser = msg.role === 'user';
            const msgText = typeof msg.content === 'string'
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content.map((p: any) => p.text || '').join('')
                : '';
            const isEditing = editingMsgId === msg.id;

            return (
              <div
                key={msg.id || msgIndex}
                className={`flex gap-3 group ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="h-7 w-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`relative max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'bg-white border border-neutral-200/80 text-neutral-800 shadow-xs'
                  } ${msg.starred ? 'ring-2 ring-amber-400' : ''}`}
                >
                  {/* Starred badge */}
                  {msg.starred && (
                    <div className="absolute -top-2 -right-2 bg-amber-400 text-neutral-950 p-1 rounded-full shadow-xs" title="Đã đánh dấu quan trọng">
                      <Star className="h-3 w-3 fill-neutral-950" />
                    </div>
                  )}

                  {isUser && isEditing ? (
                    <div className="space-y-2 py-1">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full bg-neutral-800 text-white text-xs p-2 rounded border border-neutral-700 focus:outline-none resize-none"
                        rows={2}
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingMsgId(null)}
                          className="h-6 px-2 text-[10px] text-neutral-300 hover:text-white"
                        >
                          Hủy
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            if (editText.trim()) {
                              editMessage(msg.id, editText);
                              setEditingMsgId(null);
                            }
                          }}
                          className="h-6 px-2 text-[10px] bg-white text-neutral-900 hover:bg-neutral-100"
                        >
                          <Save className="h-3 w-3 mr-1" /> Lưu & Gửi
                        </Button>
                      </div>
                    </div>
                  ) : Array.isArray(msg.content) ? (
                    msg.content.map((part: any, pIdx: number) => {
                      if (part.type === 'text') {
                        return (
                          <div key={pIdx} className="prose prose-xs max-w-none dark:prose-invert">
                            <Markdown>{part.text}</Markdown>
                          </div>
                        );
                      }
                      if (part.type === 'reasoning') {
                        return (
                          <div key={pIdx} className="my-2 p-2.5 bg-neutral-100/50 rounded-lg border-l-2 border-neutral-300 text-[11px] italic text-neutral-600">
                             <Markdown>{`> *Suy nghĩ: ${part.reasoning}*`}</Markdown>
                          </div>
                        );
                      }
                      if (part.type === 'tool-call') {
                        return (
                          <div key={pIdx} className="my-2 p-2.5 bg-neutral-100/90 rounded-lg border border-neutral-200 text-[11px] font-mono space-y-1">
                            <div className="flex items-center gap-1.5 text-neutral-700 font-bold">
                              <Wrench className="h-3.5 w-3.5 text-amber-600" />
                              <span>Thực thi: {part.toolName}</span>
                            </div>
                            <pre className="text-[10px] bg-white p-1.5 rounded border border-neutral-200 text-neutral-600 overflow-x-auto">
                              {JSON.stringify(part.args, null, 2)}
                            </pre>
                          </div>
                        );
                      }
                      if (part.type === 'tool-response') {
                        return (
                          <div key={pIdx} className="my-2 p-2.5 bg-emerald-50/70 rounded-lg border border-emerald-200 text-[11px] font-mono space-y-1">
                            <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Kết quả: {part.toolName}</span>
                            </div>
                            <pre className="text-[10px] bg-white p-1.5 rounded border border-emerald-200 text-neutral-700 overflow-x-auto">
                              {typeof part.result === 'string' ? part.result : JSON.stringify(part.result, null, 2)}
                            </pre>
                          </div>
                        );
                      }
                      if (part.type === 'sources' && Array.isArray(part.sources) && part.sources.length > 0) {
                        return (
                          <div key={pIdx} className="my-2 p-2.5 bg-sky-50/70 rounded-lg border border-sky-200 text-[11px] space-y-1.5">
                            <div className="font-bold text-sky-900">Nguồn tham khảo</div>
                            <div className="space-y-1">
                              {part.sources.map((source: any, sourceIndex: number) => (
                                <a
                                  key={`${source.url}-${sourceIndex}`}
                                  href={source.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block text-sky-700 hover:underline break-all"
                                >
                                  {source.title || source.url}
                                </a>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      if (part.type === 'error') {
                        return (
                          <div key={pIdx} className="my-2 p-2.5 bg-rose-50/70 rounded-lg border border-rose-200 text-[11px] space-y-1">
                            <div className="flex items-center gap-1.5 text-rose-800 font-bold">
                              <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                              <span>Lỗi hệ thống</span>
                            </div>
                            <div className="text-rose-700">
                              {part.error}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })
                  ) : (
                    <div className="prose prose-xs max-w-none dark:prose-invert">
                      <Markdown>{msgText}</Markdown>
                    </div>
                  )}

                  {/* Message Action Toolbar */}
                  <div className={`absolute -bottom-7 ${isUser ? 'right-0' : 'left-0'} opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-0.5 bg-white border border-neutral-200 rounded-lg p-0.5 shadow-md z-10`}>
                    {isUser ? (
                      <>
                        <button
                          onClick={() => {
                            setEditingMsgId(msg.id);
                            setEditText(msgText);
                          }}
                          className="p-1.5 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 rounded-md transition-colors"
                          title="Chỉnh sửa tin nhắn"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleCopy(msgText, msg.id || String(msgIndex))}
                          className="p-1.5 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 rounded-md transition-colors"
                          title="Sao chép"
                        >
                          {copiedId === (msg.id || String(msgIndex)) ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleCopy(msgText, msg.id || String(msgIndex))}
                          className="p-1.5 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 rounded-md transition-colors"
                          title="Sao chép"
                        >
                          {copiedId === (msg.id || String(msgIndex)) ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleQuote(msgText)}
                          className="p-1.5 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 rounded-md transition-colors"
                          title="Trích dẫn"
                        >
                          <Quote className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => regenerate()}
                          className="p-1.5 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 rounded-md transition-colors"
                          title="Thử lại (Regenerate)"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <div className="w-[1px] h-3 bg-neutral-200 mx-0.5" />
                        <button
                          onClick={() => toggleStarMessage(msg.id)}
                          className={`p-1.5 hover:bg-neutral-100 rounded-md transition-colors ${msg.starred ? 'text-amber-500' : 'text-neutral-500 hover:text-neutral-900'}`}
                          title={msg.starred ? 'Bỏ đánh dấu' : 'Đánh dấu quan trọng'}
                        >
                          <Star className={`h-3.5 w-3.5 ${msg.starred ? 'fill-amber-500' : ''}`} />
                        </button>
                        {canWriteMemory && (
                          <button
                            onClick={() => handleAddToMemory(msgText, msg.id || String(msgIndex))}
                            className="p-1.5 hover:bg-neutral-100 rounded-md transition-colors text-neutral-500 hover:text-neutral-900"
                            title="Thêm vào bộ nhớ AI"
                          >
                            {savedMemoryId === (msg.id || String(msgIndex)) ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Brain className="h-3.5 w-3.5 text-neutral-500" />
                            )}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {isUser && (
                  <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Running state indicator */}
        {isRunning && (
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0 animate-pulse">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-white border border-neutral-200 px-3 py-2 rounded-xl text-xs text-neutral-500 flex items-center gap-2 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Trợ lý đang suy nghĩ và xử lý yêu cầu...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Tool confirmations */}
      <AdkConfirmation />

      {/* Composer attachments */}
      {attachments.length > 0 && (
        <div className="px-3 pt-2 bg-white border-t border-neutral-200 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div key={attachment.localId} className="max-w-full flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[11px]">
              {attachment.phase === 'uploading' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-500 shrink-0" />
              ) : (
                <FileText className={`h-3.5 w-3.5 shrink-0 ${attachment.phase === 'error' ? 'text-rose-600' : 'text-emerald-600'}`} />
              )}
              <div className="min-w-0">
                <div className="truncate max-w-52 font-medium text-neutral-700">{attachment.name}</div>
                <div className={attachment.phase === 'error' ? 'text-rose-600' : 'text-neutral-500'}>
                  {attachment.phase === 'uploading' ? 'Đang tải lên…' : attachment.phase === 'complete' ? 'Đã tải lên' : attachment.error}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveAttachment(attachment.localId)}
                className="p-1 rounded hover:bg-neutral-200 text-neutral-500"
                title="Xóa tệp đính kèm"
                aria-label={`Xóa tệp ${attachment.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {attachmentNotice && (
        <div className="px-3 pt-1.5 bg-white text-[11px] text-amber-700">{attachmentNotice}</div>
      )}

      {/* Input Composer */}
      <div className="p-3 bg-white border-t border-neutral-200 shrink-0">
        <div className="flex items-end gap-2 bg-neutral-50 rounded-xl border border-neutral-200 p-2 focus-within:ring-2 focus-within:ring-neutral-900 transition-all">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={SUPPORTED_FILE_ACCEPT}
            className="hidden"
            onChange={(event) => handleFilesSelected(event.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isRunning || attachments.length >= MAX_ATTACHMENTS_PER_TURN}
            onClick={() => fileInputRef.current?.click()}
            className="h-8 w-8 shrink-0 text-neutral-600 rounded-lg"
            title={attachments.length >= MAX_ATTACHMENTS_PER_TURN ? `Đã đạt tối đa ${MAX_ATTACHMENTS_PER_TURN} tệp` : 'Đính kèm tệp'}
          >
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={`Nhập tin nhắn hoặc lệnh cho phân hệ ${activeModule}...`}
            className="flex-1 bg-transparent text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none resize-none max-h-32 py-1.5"
          />

          {isRunning ? (
            <Button
              type="button"
              variant="danger"
              size="icon"
              onClick={cancelRun}
              className="h-8 w-8 shrink-0 bg-rose-600 hover:bg-rose-700 text-white rounded-lg"
              title="Dừng phản hồi"
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              disabled={!inputText.trim() || !isReady}
              onClick={handleSend}
              className="h-8 w-8 shrink-0 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-white rounded-lg transition-opacity"
              title="Gửi tin nhắn"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-neutral-400 font-mono">
          <span>Nhấn Enter để gửi, Shift+Enter xuống dòng</span>
          <span>Google AI Studio Agent</span>
        </div>
      </div>
    </div>
  );
}
