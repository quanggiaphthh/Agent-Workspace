import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAgentRuntime, type ChatMessage } from './AdkRuntimeProvider';
import { ArrowLeft, Bot, Download, History, Loader2, MessageSquare, Pin, Play, Plus, Search, Trash2, User, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';

interface SessionSummary { id: string; title: string; lastUpdateTime: number; eventCount: number; }
interface SessionDetail { id: string; lastUpdateTime: number; messages: ChatMessage[]; }
interface AgentCoordinationHistoryProps { onOpenChat?: () => void; }

export function AgentCoordinationHistory({ onOpenChat }: AgentCoordinationHistoryProps) {
  const { user } = useFirebaseAuth();
  const { newConversation, activeSessionId, loadConversation, temporaryMode } = useAgentRuntime();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [persistenceDegraded, setPersistenceDegraded] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!user || temporaryMode) { setSessions([]); return; }
    try {
      setLoading(true);
      const response = await authFetch('/api/agent/sessions?limit=100');
      if (!response.ok) throw new Error((await response.json()).error || 'Không thể tải hội thoại');
      const data = await response.json();
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setPersistenceDegraded(Boolean(data.persistence?.degraded));
    } catch (error) { console.error('Failed to load Agent session history:', error); setSessions([]); }
    finally { setLoading(false); }
  }, [temporaryMode, user]);
  useEffect(() => { void fetchSessions(); }, [fetchSessions]);

  const openSession = useCallback(async (sessionId: string) => {
    try {
      setLoading(true);
      const response = await authFetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}`);
      if (!response.ok) throw new Error((await response.json()).error || 'Không thể tải hội thoại');
      const data = await response.json();
      setSelectedSession(data.session || null);
    } catch (error) { console.error('Failed to load Agent session:', error); }
    finally { setLoading(false); }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!window.confirm('Xóa vĩnh viễn hội thoại này?')) return;
    try {
      const response = await authFetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error('Không thể xóa hội thoại');
      if (sessionId === activeSessionId) newConversation();
      setSelectedSession(null);
      await fetchSessions();
    } catch (error) { console.error('Failed to delete Agent session:', error); }
  }, [activeSessionId, fetchSessions, newConversation]);

  const continueConversation = useCallback(() => {
    if (!selectedSession || temporaryMode) return;
    const durableMessages = (selectedSession.messages || []).map(message => message.role === 'user' ? { ...message, replaySafe: false } : message);
    loadConversation(selectedSession.id, durableMessages);
    setSelectedSession(null);
    onOpenChat?.();
  }, [loadConversation, onOpenChat, selectedSession, temporaryMode]);

  const startNewConversation = () => { newConversation(); setSelectedSession(null); onOpenChat?.(); };
  const filteredSessions = useMemo(() => {
    const keyword = searchKeyword.trim().toLocaleLowerCase('vi');
    return sessions.filter(session => !keyword || session.title.toLocaleLowerCase('vi').includes(keyword)).sort((a, b) => Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id)) || b.lastUpdateTime - a.lastUpdateTime);
  }, [pinnedIds, searchKeyword, sessions]);

  const exportConversation = (session: SessionDetail) => {
    const anchor = document.createElement('a');
    anchor.href = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(session.messages, null, 2))}`;
    anchor.download = `chat_session_${session.id}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-50/50">
      <div className="p-3.5 border-b border-neutral-200 bg-white space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          {selectedSession ? <button type="button" onClick={() => setSelectedSession(null)} className="flex items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 rounded"><ArrowLeft className="h-4 w-4" />Quay lại Hội thoại</button> : <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800"><History className="h-4 w-4" />Hội thoại</div>}
          {!selectedSession && <Button size="sm" onClick={startNewConversation} className="h-8 px-2.5 text-xs bg-neutral-900 text-white gap-1"><Plus className="h-3.5 w-3.5" />Hội thoại mới</Button>}
        </div>
        {persistenceDegraded && !temporaryMode && <div className="text-[10px] px-2.5 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-800">Lịch sử đang được lưu ở chế độ dự phòng. Một số hội thoại có thể chỉ khả dụng trong phiên hiện tại.</div>}
        {temporaryMode && <div className="text-[10px] px-2.5 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-800">Chat tạm thời không được lưu. Chuyển sang chat lưu để xem hoặc tiếp tục Hội thoại.</div>}
        {!selectedSession && !temporaryMode && <div className="relative flex items-center"><Search className="absolute left-2.5 h-3.5 w-3.5 text-neutral-400" /><input type="search" value={searchKeyword} onChange={event => setSearchKeyword(event.target.value)} placeholder="Tìm Hội thoại..." aria-label="Tìm Hội thoại" className="w-full pl-8 pr-8 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-500" />{searchKeyword && <button type="button" onClick={() => setSearchKeyword('')} aria-label="Xóa từ khóa tìm kiếm" className="absolute right-2 p-1 text-neutral-400 hover:text-neutral-700"><X className="h-3.5 w-3.5" /></button>}</div>}
      </div>

      {selectedSession ? (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          <div className="bg-white p-3 rounded-xl border border-neutral-200 flex items-center justify-between gap-2"><div><h4 className="text-xs font-bold text-neutral-900">Hội thoại đã lưu</h4><p className="text-[10px] text-neutral-400 mt-0.5">{selectedSession.messages.length} tin nhắn · {new Date(selectedSession.lastUpdateTime).toLocaleString()}</p></div><div className="flex items-center gap-1.5"><Button size="sm" variant="outline" onClick={() => exportConversation(selectedSession)} className="h-8 text-xs gap-1"><Download className="h-3 w-3" />Xuất</Button><Button size="sm" onClick={continueConversation} disabled={temporaryMode} className="h-8 text-xs gap-1 bg-neutral-900 text-white"><Play className="h-3 w-3" />Tiếp tục</Button><Button size="sm" variant="outline" onClick={() => void deleteSession(selectedSession.id)} className="h-8 text-xs gap-1 text-rose-600 border-rose-200"><Trash2 className="h-3 w-3" />Xóa</Button></div></div>
          <div className="space-y-2">{selectedSession.messages.map((msg, index) => <div key={msg.id || index} className="p-3 bg-white rounded-xl border border-neutral-200 space-y-1 text-xs"><div className="flex items-center justify-between font-semibold text-neutral-700"><span className="flex items-center gap-1.5">{msg.role === 'user' ? <User className="h-3.5 w-3.5 text-emerald-600" /> : <Bot className="h-3.5 w-3.5" />}{msg.role === 'user' ? 'Bạn' : 'Trợ lý AI'}</span><span className="text-[10px] text-neutral-400">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</span></div><div className="text-neutral-600 text-[11px] bg-neutral-50 p-2 rounded whitespace-pre-wrap">{typeof msg.content === 'string' ? msg.content : msg.content.map(part => part.text || '').filter(Boolean).join('\n')}</div></div>)}</div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
          {loading ? <div className="h-40 flex items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : temporaryMode || filteredSessions.length === 0 ? <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-neutral-400"><MessageSquare className="h-8 w-8 mb-2 opacity-40" /><p className="text-xs">{temporaryMode ? 'Hội thoại đã lưu không hiển thị khi đang dùng chat tạm thời.' : 'Chưa có Hội thoại nào.'}</p></div> : filteredSessions.map(session => {
            const isPinned = pinnedIds.includes(session.id); const isActive = session.id === activeSessionId;
            return <div key={session.id} role="button" tabIndex={0} onClick={() => void openSession(session.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openSession(session.id); } }} className={`p-3 bg-white rounded-xl border transition-colors cursor-pointer flex items-center justify-between group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 ${isActive ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-neutral-200 hover:border-neutral-400'}`}><div className="min-w-0"><div className="text-xs font-bold text-neutral-900 truncate">{session.title || 'Hội thoại'}</div><div className="text-[10px] text-neutral-400 mt-0.5">{session.eventCount} hoạt động · {new Date(session.lastUpdateTime).toLocaleString()}</div></div><div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><button type="button" onClick={event => { event.stopPropagation(); setPinnedIds(previous => previous.includes(session.id) ? previous.filter(id => id !== session.id) : [...previous, session.id]); }} className={`p-2 rounded hover:bg-neutral-100 ${isPinned ? 'text-amber-500' : 'text-neutral-400'}`} aria-label={isPinned ? 'Bỏ ghim Hội thoại' : 'Ghim Hội thoại'}><Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-amber-500' : ''}`} /></button><button type="button" onClick={event => { event.stopPropagation(); void deleteSession(session.id); }} className="p-2 rounded hover:bg-rose-50 text-neutral-400 hover:text-rose-600" aria-label="Xóa Hội thoại"><Trash2 className="h-3.5 w-3.5" /></button></div></div>;
          })}
        </div>
      )}
    </div>
  );
}
