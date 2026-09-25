import React, { useEffect, useReducer, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { useAgentRuntime } from './AdkRuntimeProvider';
import { AdkConfirmation } from './AdkConfirmation';
import { Button } from '../../components/ui/Button';
import { useContextStore } from '../../core/context/contextStore';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';
import { uploadUserFile, type UploadProblem } from '../../modules/home/fileUploadClient';
import type { AttachmentReference } from '../../../server/agent/chat/chatRequestContract';
import { MAX_ATTACHMENTS_PER_TURN } from '../../../server/agent/chat/attachmentPolicy';
import { SUPPORTED_FILE_ACCEPT } from '../../../shared/contracts/fileUploadPolicy';
import {
  Bot, Brain, Check, CheckCircle2, ChevronDown, ChevronRight, Copy, Edit2, FileText,
  Loader2, Paperclip, Quote, RefreshCw, Save, Send, ShieldAlert, Sparkles, Star,
  StopCircle, User, Wrench, X,
} from 'lucide-react';

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
export function composerAttachmentReducer(state: ComposerAttachment[], action: ComposerAttachmentAction): ComposerAttachment[] {
  if (action.type === 'reset') return [];
  if (action.type === 'remove') return state.filter(item => item.localId !== action.localId);
  if (action.type === 'add') return state.length >= MAX_ATTACHMENTS_PER_TURN ? state : [...state, action.attachment];
  return state.map(item => item.localId !== action.localId ? item : action.type === 'complete'
    ? { ...item, phase: 'complete', fileId: action.fileId, error: undefined }
    : { ...item, phase: 'error', fileId: undefined, error: action.error });
}
export function successfulAttachmentReferences(attachments: ComposerAttachment[]): AttachmentReference[] {
  return attachments.flatMap(attachment => attachment.phase === 'complete' && attachment.fileId ? [{ fileId: attachment.fileId }] : []);
}

function Activity({ complete }: { complete: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-2 rounded-lg border border-neutral-200 bg-neutral-50 text-[11px]">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="w-full flex items-center justify-between gap-2 p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-500">
        <span className="flex items-center gap-1.5 font-semibold text-neutral-700">
          {complete ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Wrench className="h-3.5 w-3.5 text-amber-600" />}
          Hoạt động · {complete ? 'Đã hoàn tất' : 'Đang thực hiện'}
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && <div className="px-2.5 pb-2.5 text-neutral-500">{complete ? 'Trợ lý đã hoàn tất thao tác được yêu cầu.' : 'Trợ lý đang xử lý thao tác này.'}</div>}
    </div>
  );
}

export function AgentChatThread() {
  const { user } = useFirebaseAuth();
  const { threadState, sendMessage, cancelRun, editMessage, regenerate, toggleStarMessage, temporaryMode, setTemporaryMode } = useAgentRuntime();
  const activeModuleId = useContextStore(state => state.activeModule) || 'home';
  const appUser = useContextStore(state => state.user);
  const availableCapabilities = useContextStore(state => state.availableCapabilities);
  const canWriteMemory = appUser.permissions.includes('memory.write') || appUser.roles.includes('admin');
  const activeModuleName = moduleRegistry.resolve(activeModuleId)?.meta?.name || 'trang hiện tại';
  const suggestions = moduleRegistry.getAgentSuggestions(activeModuleId, appUser, availableCapabilities);
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedMemoryId, setSavedMemoryId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [attachments, dispatchAttachment] = useReducer(composerAttachmentReducer, []);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { messages, isRunning, isReady, historyError } = threadState;

  useEffect(() => () => { uploadControllersRef.current.forEach(controller => controller.abort()); uploadControllersRef.current.clear(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isRunning]);

  const handleSend = async () => {
    if (!inputText.trim() || isRunning || !isReady) return;
    if (attachments.some(attachment => attachment.phase === 'uploading')) { setAttachmentNotice('Vui lòng chờ tệp tải lên hoàn tất trước khi gửi.'); return; }
    await sendMessage(inputText.trim(), successfulAttachmentReferences(attachments));
    setInputText(''); dispatchAttachment({ type: 'reset' }); setAttachmentNotice(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;
    const availableSlots = MAX_ATTACHMENTS_PER_TURN - attachments.length;
    if (availableSlots <= 0) { setAttachmentNotice(`Chỉ được đính kèm tối đa ${MAX_ATTACHMENTS_PER_TURN} tệp cho mỗi tin nhắn.`); return; }
    const selected = Array.from(files).slice(0, availableSlots);
    setAttachmentNotice(files.length > availableSlots ? `Chỉ nhận ${availableSlots} tệp còn lại; tối đa ${MAX_ATTACHMENTS_PER_TURN} tệp cho mỗi tin nhắn.` : null);
    selected.forEach(file => {
      const attachment = createComposerAttachment(file);
      const controller = new AbortController();
      uploadControllersRef.current.set(attachment.localId, controller);
      dispatchAttachment({ type: 'add', attachment });
      void uploadUserFile(file, controller.signal)
        .then(uploaded => dispatchAttachment({ type: 'complete', localId: attachment.localId, fileId: uploaded.fileId }))
        .catch((error: UploadProblem) => { if (error?.code !== 'ABORTED') dispatchAttachment({ type: 'error', localId: attachment.localId, error: error?.message || 'Không thể tải tệp lên. Vui lòng thử lại.' }); })
        .finally(() => uploadControllersRef.current.delete(attachment.localId));
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (localId: string) => { uploadControllersRef.current.get(localId)?.abort(); uploadControllersRef.current.delete(localId); dispatchAttachment({ type: 'remove', localId }); setAttachmentNotice(null); };
  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => { setInputText(event.target.value); event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`; };
  const handleCopy = (text: string, id: string) => { void navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };
  const handleQuote = (text: string) => { setInputText(previous => `${text.split('\n').map(line => `> ${line}`).join('\n')}\n\n${previous}`); textareaRef.current?.focus(); };
  const handleAddToMemory = async (text: string, id: string) => {
    if (!user || !canWriteMemory) return;
    try {
      const response = await authFetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text.length > 200 ? `${text.substring(0, 200)}...` : text, category: 'Trò chuyện', source: 'Thêm thủ công từ khung chat' }) });
      if (!response.ok) throw new Error('Không thể lưu vào bộ nhớ');
      setSavedMemoryId(id); setTimeout(() => setSavedMemoryId(null), 2500);
    } catch (error) { console.error('Failed to add response to memory:', error); }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-50/40 relative">
      {historyError && !temporaryMode && <div className="px-3 py-2 border-b border-amber-200 bg-amber-50 text-[11px] text-amber-800 shrink-0">{historyError}</div>}
      <div className="px-3 py-1.5 bg-white border-b border-neutral-200/80 flex items-center justify-between text-[11px] shrink-0">
        <span className={temporaryMode ? 'text-amber-700 font-medium' : 'text-neutral-500'}>{temporaryMode ? 'Chat tạm thời · Không lưu lịch sử' : 'Hội thoại được lưu'}</span>
        <button type="button" onClick={() => setTemporaryMode(!temporaryMode)} aria-label={temporaryMode ? 'Tắt chat tạm thời' : 'Bật chat tạm thời'} className={`px-2 py-1 rounded text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 ${temporaryMode ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{temporaryMode ? 'Chuyển sang chat lưu' : 'Dùng chat tạm thời'}</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center p-4">
            <div className="h-10 w-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center mb-3"><Bot className="h-5 w-5" /></div>
            <h3 className="text-sm font-bold text-neutral-800">Bạn muốn làm gì trong {activeModuleName}?</h3>
            <p className="text-xs text-neutral-500 max-w-xs mt-1 leading-relaxed">Trợ lý sử dụng ngữ cảnh hiện tại và các khả năng đang được bật để hỗ trợ bạn.</p>
            {suggestions.length > 0 && (
              <div className="w-full max-w-md mt-6 space-y-2">
                <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center justify-center gap-1"><Sparkles className="h-3 w-3" /> Gợi ý trong {activeModuleName}</div>
                <div className="flex flex-col gap-1.5">{suggestions.map(suggestion => <button key={suggestion.id} type="button" onClick={() => sendMessage(suggestion.prompt)} className="text-left text-xs bg-white hover:bg-neutral-100 text-neutral-700 px-3 py-2.5 rounded-lg border border-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500">{suggestion.label}</button>)}</div>
              </div>
            )}
          </div>
        ) : messages.map((msg: any, index: number) => {
          const isUser = msg.role === 'user';
          const msgText = typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.map((part: any) => part.text || '').join('') : '';
          const id = msg.id || String(index);
          return (
            <div key={id} className={`flex gap-3 group ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && <div className="h-7 w-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0 mt-0.5"><Bot className="h-4 w-4" /></div>}
              <div className={`relative max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${isUser ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-800'} ${msg.starred ? 'ring-2 ring-amber-400' : ''}`}>
                {isUser && editingMsgId === msg.id ? (
                  <div className="space-y-2"><textarea value={editText} onChange={event => setEditText(event.target.value)} rows={2} className="w-full bg-neutral-800 text-white text-xs p-2 rounded border border-neutral-700 focus:outline-none" /><div className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" onClick={() => setEditingMsgId(null)} className="h-7 text-[10px] text-neutral-300">Hủy</Button><Button size="sm" onClick={() => { if (editText.trim()) { void editMessage(msg.id, editText); setEditingMsgId(null); } }} className="h-7 text-[10px] bg-white text-neutral-900"><Save className="h-3 w-3 mr-1" />Lưu & Gửi</Button></div></div>
                ) : Array.isArray(msg.content) ? msg.content.map((part: any, partIndex: number) => {
                  if (part.type === 'text') return <div key={partIndex} className="prose prose-xs max-w-none"><Markdown>{part.text}</Markdown></div>;
                  if (part.type === 'tool-call') return <Activity key={partIndex} complete={false} />;
                  if (part.type === 'tool-response') return <Activity key={partIndex} complete />;
                  if (part.type === 'sources' && Array.isArray(part.sources) && part.sources.length) return <div key={partIndex} className="my-2 p-2.5 bg-sky-50 rounded-lg border border-sky-200 text-[11px]"><div className="font-bold text-sky-900 mb-1">Nguồn tham khảo</div>{part.sources.map((source: any, sourceIndex: number) => <a key={`${source.url}-${sourceIndex}`} href={source.url} target="_blank" rel="noreferrer" className="block text-sky-700 hover:underline break-all">{source.title || source.url}</a>)}</div>;
                  if (part.type === 'error') return <div key={partIndex} className="my-2 p-2.5 bg-rose-50 rounded-lg border border-rose-200 text-[11px]"><div className="flex items-center gap-1.5 text-rose-800 font-bold"><ShieldAlert className="h-3.5 w-3.5" />Yêu cầu chưa hoàn tất</div><div className="text-rose-700 mt-1">Vui lòng thử lại. Nếu lỗi tiếp tục xảy ra, hãy kiểm tra kết nối hoặc tải lại trang.</div></div>;
                  return null;
                }) : <div className="prose prose-xs max-w-none"><Markdown>{msgText}</Markdown></div>}

                <div className={`absolute -bottom-8 ${isUser ? 'right-0' : 'left-0'} opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center gap-0.5 bg-white border border-neutral-200 rounded-lg p-0.5 shadow-md z-10`}>
                  {isUser && <button onClick={() => { setEditingMsgId(msg.id); setEditText(msgText); }} className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded" aria-label="Chỉnh sửa tin nhắn"><Edit2 className="h-3.5 w-3.5" /></button>}
                  <button onClick={() => handleCopy(msgText, id)} className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded" aria-label={isUser ? 'Sao chép tin nhắn' : 'Sao chép phản hồi'}>{copiedId === id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}</button>
                  {!isUser && <><button onClick={() => handleQuote(msgText)} className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded" aria-label="Trích dẫn phản hồi"><Quote className="h-3.5 w-3.5" /></button><button onClick={() => void regenerate()} className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded" aria-label="Tạo lại phản hồi"><RefreshCw className="h-3.5 w-3.5" /></button><button onClick={() => toggleStarMessage(msg.id)} className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded" aria-label={msg.starred ? 'Bỏ đánh dấu quan trọng' : 'Đánh dấu phản hồi là quan trọng'}><Star className={`h-3.5 w-3.5 ${msg.starred ? 'fill-amber-500 text-amber-500' : ''}`} /></button>{canWriteMemory && <button onClick={() => void handleAddToMemory(msgText, id)} className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded" aria-label="Thêm phản hồi vào bộ nhớ AI">{savedMemoryId === id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Brain className="h-3.5 w-3.5" />}</button>}</>}
                </div>
              </div>
              {isUser && <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5"><User className="h-4 w-4" /></div>}
            </div>
          );
        })}
        {isRunning && <div className="flex items-center gap-3" role="status"><div className="h-7 w-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0"><Bot className="h-4 w-4" /></div><div className="bg-white border border-neutral-200 px-3 py-2 rounded-xl text-xs text-neutral-500 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /><span>Trợ lý đang xử lý yêu cầu…</span></div></div>}
        <div ref={messagesEndRef} />
      </div>

      <AdkConfirmation />

      {attachments.length > 0 && <div className="px-3 pt-2 bg-white border-t border-neutral-200 flex flex-wrap gap-2">{attachments.map(attachment => <div key={attachment.localId} className="max-w-full flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[11px]">{attachment.phase === 'uploading' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-500 shrink-0" /> : <FileText className={`h-3.5 w-3.5 shrink-0 ${attachment.phase === 'error' ? 'text-rose-600' : 'text-emerald-600'}`} />}<div className="min-w-0"><div className="truncate max-w-52 font-medium text-neutral-700">{attachment.name}</div><div className={attachment.phase === 'error' ? 'text-rose-600' : 'text-neutral-500'}>{attachment.phase === 'uploading' ? 'Đang tải lên…' : attachment.phase === 'complete' ? 'Đã tải lên' : attachment.error}</div></div><button type="button" onClick={() => removeAttachment(attachment.localId)} className="p-1 rounded hover:bg-neutral-200 text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500" aria-label={`Xóa tệp ${attachment.name}`}><X className="h-3.5 w-3.5" /></button></div>)}</div>}
      {attachmentNotice && <div className="px-3 pt-1.5 bg-white text-[11px] text-amber-700" role="status">{attachmentNotice}</div>}

      <div className="p-3 bg-white border-t border-neutral-200 shrink-0">
        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-neutral-500"><span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1"><Sparkles className="h-3 w-3" />{activeModuleName}</span><span>{temporaryMode ? 'Tạm thời' : 'Được lưu'}</span></div>
        <div className="flex items-end gap-2 bg-neutral-50 rounded-xl border border-neutral-200 p-2 focus-within:ring-2 focus-within:ring-neutral-900">
          <input ref={fileInputRef} type="file" multiple accept={SUPPORTED_FILE_ACCEPT} className="hidden" onChange={event => handleFilesSelected(event.target.files)} />
          <Button type="button" variant="ghost" size="icon" disabled={isRunning || attachments.length >= MAX_ATTACHMENTS_PER_TURN} onClick={() => fileInputRef.current?.click()} className="h-10 w-10 shrink-0 text-neutral-600 rounded-lg" aria-label="Đính kèm tệp"><Paperclip className="h-4 w-4" /></Button>
          <textarea ref={textareaRef} rows={1} value={inputText} onChange={handleInput} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void handleSend(); } }} placeholder="Nhập tin nhắn cho Trợ lý AI…" className="flex-1 bg-transparent text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none resize-none max-h-32 py-2.5" aria-label="Tin nhắn cho Trợ lý AI" />
          {isRunning ? <Button type="button" variant="danger" size="icon" onClick={cancelRun} className="h-10 w-10 shrink-0 bg-rose-600 hover:bg-rose-700 text-white rounded-lg" aria-label="Dừng phản hồi"><StopCircle className="h-4 w-4" /></Button> : <Button type="button" size="icon" disabled={!inputText.trim() || !isReady} onClick={() => void handleSend()} className="h-10 w-10 shrink-0 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-white rounded-lg" aria-label="Gửi tin nhắn"><Send className="h-4 w-4" /></Button>}
        </div>
        <div className="mt-1 px-1 text-[10px] text-neutral-400"><span className="hidden sm:inline">Enter để gửi · Shift+Enter xuống dòng</span></div>
      </div>
    </div>
  );
}
