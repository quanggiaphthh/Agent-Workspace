import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAgentRuntime, type ChatMessage } from './AdkRuntimeProvider';
import { Bot, User, History, Search, Plus, Trash2, X, Pin, ArrowLeft, Download, MessageSquare, Loader2, Play } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { authFetch } from '../../lib/authFetch';
import { useFirebaseAuth } from '../../lib/FirebaseAuthProvider';

interface SessionSummary {
  id: string;
  title: string;
  lastUpdateTime: number;
  eventCount: number;
}

interface SessionDetail {
  id: string;
  lastUpdateTime: number;
  messages: ChatMessage[];
}

interface AgentCoordinationHistoryProps {
  onOpenChat?: () => void;
}

export function AgentCoordinationHistory({ onOpenChat }: AgentCoordinationHistoryProps) {
  const { user } = useFirebaseAuth();
  const { newConversation, activeSessionId, loadConversation, temporaryMode } = useAgentRuntime();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [persistenceDegraded, setPersistenceDegraded] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!user || temporaryMode) {
      setSessions([]);
      return;
    }
    try {
      setLoading(true);
      const response = await authFetch('/api/agent/sessions?limit=100');
      if (!response.ok) throw new Error((await response.json()).error || 'Không thể tải lịch sử hội thoại');
      const data = await response.json();
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setPersistenceDegraded(Boolean(data.persistence?.degraded));
    } catch (err) {
      console.error('Failed to load Agent session history:', err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [temporaryMode, user]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const openSession = useCallback(async (sessionId: string) => {
    try {
      setLoading(true);
      const response = await authFetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}`);
      if (!response.ok) throw new Error((await response.json()).error || 'Không thể tải hội thoại');
      const data = await response.json();
      setSelectedConversationId(sessionId);
      setSelectedSession(data.session || null);
    } catch (err) {
      console.error('Failed to load Agent session:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!window.confirm('Xóa vĩnh viễn hội thoại này khỏi máy chủ?')) return;
    try {
      const response = await authFetch(`/api/agent/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) {
        throw new Error((await response.json()).error || 'Không thể xóa hội thoại');
      }
      if (sessionId === activeSessionId) newConversation();
      setSelectedConversationId(null);
      setSelectedSession(null);
      await fetchSessions();
    } catch (err) {
      console.error('Failed to delete Agent session:', err);
    }
  }, [activeSessionId, fetchSessions, newConversation]);

  const continueConversation = useCallback(() => {
    if (!selectedSession || temporaryMode) return;
    loadConversation(selectedSession.id, selectedSession.messages || []);
    setSelectedConversationId(null);
    setSelectedSession(null);
    onOpenChat?.();
  }, [loadConversation, onOpenChat, selectedSession, temporaryMode]);

  const startNewConversation = useCallback(() => {
    newConversation();
    setSelectedConversationId(null);
    setSelectedSession(null);
    onOpenChat?.();
  }, [newConversation, onOpenChat]);

  const togglePin = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setPinnedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const exportConversation = (session: SessionDetail) => {
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(session.messages, null, 2))}`;
    const anchor = document.createElement('a');
    anchor.setAttribute('href', dataStr);
    anchor.setAttribute('download', `chat_session_${session.id}.json`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const filteredSessions = useMemo(() => {
    const keyword = searchKeyword.trim().toLocaleLowerCase('vi');
    return sessions
      .filter((session) => !keyword || session.title.toLocaleLowerCase('vi').includes(keyword))
      .sort((a, b) => {
        const pinDelta = Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id));
        return pinDelta || b.lastUpdateTime - a.lastUpdateTime;
      });
  }, [pinnedIds, searchKeyword, sessions]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-50/50">
      <div className="p-3.5 border-b border-neutral-200 bg-white space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
            {selectedSession ? (
              <button
                onClick={() => { setSelectedConversationId(null); setSelectedSession(null); }}
                className="flex items-center gap-1 text-neutral-600 hover:text-neutral-900 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" /> <span>Quay lại danh sách</span>
              </button>
            ) : (
              <>
                <History className="h-4 w-4 text-neutral-600" />
                <span>Nhật ký & Hội thoại</span>
              </>
            )}
          </div>
          {!selectedSession && (
            <Button
              variant="default"
              size="sm"
              onClick={startNewConversation}
              className="h-7 px-2.5 text-xs bg-neutral-900 hover:bg-neutral-800 text-white rounded-md flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Hội thoại mới
            </Button>
          )}
        </div>

        {persistenceDegraded && !temporaryMode && (
          <div className="text-[10px] px-2.5 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-800">
            Session persistence đang DEGRADED: máy chủ đang dùng bộ nhớ tiến trình thay vì Firestore.
          </div>
        )}

        {temporaryMode && (
          <div className="text-[10px] px-2.5 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-800">
            Chế độ tạm thời không ghi lịch sử lên máy chủ. Tắt chế độ tạm thời để xem hoặc tiếp tục hội thoại đã lưu.
          </div>
        )}

        {!selectedSession && !temporaryMode && (
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="Tìm kiếm cuộc hội thoại..."
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-900 text-neutral-800"
            />
            {searchKeyword && (
              <button onClick={() => setSearchKeyword('')} className="absolute right-2 text-neutral-400 hover:text-neutral-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {selectedSession ? (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-2xs flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-neutral-900">Hội thoại đã lưu</h4>
              <p className="text-[10px] text-neutral-400 font-mono mt-0.5">
                {selectedSession.messages.length} tin nhắn • {new Date(selectedSession.lastUpdateTime).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => exportConversation(selectedSession)} className="h-7 text-xs gap-1">
                <Download className="h-3 w-3" /> Xuất JSON
              </Button>
              <Button size="sm" onClick={continueConversation} disabled={temporaryMode} className="h-7 text-xs gap-1 bg-neutral-900 text-white">
                <Play className="h-3 w-3" /> Tiếp tục
              </Button>
              <Button size="sm" variant="outline" onClick={() => deleteSession(selectedSession.id)} className="h-7 text-xs gap-1 text-rose-600 border-rose-200">
                <Trash2 className="h-3 w-3" /> Xóa
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {selectedSession.messages.map((msg, index) => (
              <div key={msg.id || index} className="p-3 bg-white rounded-xl border border-neutral-200/80 shadow-2xs space-y-1 text-xs">
                <div className="flex items-center justify-between font-semibold text-neutral-700">
                  <span className="flex items-center gap-1.5">
                    {msg.role === 'user' ? <User className="h-3.5 w-3.5 text-emerald-600" /> : <Bot className="h-3.5 w-3.5 text-neutral-900" />}
                    {msg.role === 'user' ? 'Người dùng' : 'Trợ lý AI'}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
                <div className="text-neutral-600 text-[11px] bg-neutral-50 p-2 rounded border border-neutral-100 whitespace-pre-wrap">
                  {typeof msg.content === 'string'
                    ? msg.content
                    : msg.content.map((part) => part.text || '').filter(Boolean).join('\n')}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {loading ? (
            <div className="h-40 flex items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : temporaryMode || filteredSessions.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-neutral-400">
              <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-xs">{temporaryMode ? 'Lịch sử không khả dụng trong chế độ tạm thời.' : 'Chưa có lịch sử hội thoại nào.'}</p>
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isPinned = pinnedIds.includes(session.id);
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => void openSession(session.id)}
                  className={`p-3 bg-white rounded-xl border shadow-2xs transition-all cursor-pointer flex items-center justify-between group ${isActive ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-neutral-200/80 hover:border-neutral-400'}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
                      <MessageSquare className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-neutral-900 truncate">{session.title || 'Cuộc hội thoại'}</div>
                      <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                        {session.eventCount} sự kiện • {new Date(session.lastUpdateTime).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(event) => togglePin(session.id, event)}
                      className={`p-1.5 rounded hover:bg-neutral-100 ${isPinned ? 'text-amber-500' : 'text-neutral-400'}`}
                      title={isPinned ? 'Bỏ ghim' : 'Ghim hội thoại'}
                    >
                      <Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-amber-500' : ''}`} />
                    </button>
                    <button
                      onClick={(event) => { event.stopPropagation(); void deleteSession(session.id); }}
                      className="p-1.5 rounded hover:bg-rose-50 text-neutral-400 hover:text-rose-600"
                      title="Xóa hội thoại"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
