import React, { useState } from 'react';
import { useAgentRuntime } from './AdkRuntimeProvider';
import { Bot, User, Wrench, Clock, CheckCircle2, History, Search, Trash2, X, Pin, ArrowLeft, Download, MessageSquare } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export function AgentCoordinationHistory() {
  const { threadState, clearHistory, newConversation } = useAgentRuntime();
  const { messages } = threadState;
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  // Mock conversation sessions grouping based on current messages
  const currentSessionTitle = messages.length > 0 && typeof messages[0].content === 'string'
    ? messages[0].content
    : messages.length > 0 && Array.isArray(messages[0].content) && messages[0].content[0]?.text
      ? messages[0].content[0].text
      : 'Cuộc hội thoại hiện tại';

  const sessions = messages.length > 0 ? [
    {
      id: 'current-session',
      title: currentSessionTitle.length > 40 ? currentSessionTitle.substring(0, 40) + '...' : currentSessionTitle,
      timestamp: Date.now(),
      dateGroup: 'Hôm nay',
      messageCount: messages.length,
      messages: messages,
    }
  ] : [];

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const exportConversation = (session: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(session.messages, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `chat_session_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredSessions = sessions.filter(s =>
    s.title.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  const selectedSession = sessions.find(s => s.id === selectedConversationId);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-50/50">
      {/* Header Controls */}
      <div className="p-3.5 border-b border-neutral-200 bg-white space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
            {selectedSession ? (
              <button
                onClick={() => setSelectedConversationId(null)}
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
            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearHistory}
                  className="h-7 px-2.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 rounded-md flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Xóa
                </Button>
              )}
            </div>
          )}
        </div>

        {!selectedSession && (
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
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

      {/* Body View: 2-tier list or Detail view */}
      {selectedSession ? (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-2xs flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-neutral-900">{selectedSession.title}</h4>
              <p className="text-[10px] text-neutral-400 font-mono mt-0.5">{selectedSession.messageCount} trao đổi</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => exportConversation(selectedSession, e)}
              className="h-7 text-xs gap-1"
            >
              <Download className="h-3 w-3" /> Xuất JSON
            </Button>
          </div>

          <div className="space-y-2">
            {selectedSession.messages.map((msg: any, idx: number) => (
              <div key={msg.id || idx} className="p-3 bg-white rounded-xl border border-neutral-200/80 shadow-2xs space-y-1 text-xs">
                <div className="flex items-center justify-between font-semibold text-neutral-700">
                  <span className="flex items-center gap-1.5">
                    {msg.role === 'user' ? (
                      <User className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Bot className="h-3.5 w-3.5 text-neutral-900" />
                    )}
                    {msg.role === 'user' ? 'Người dùng' : 'Trợ lý AI'}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
                <div className="text-neutral-600 text-[11px] bg-neutral-50 p-2 rounded border border-neutral-100">
                  {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
          <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider font-mono">
            Hôm nay ({filteredSessions.length})
          </div>

          {filteredSessions.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-neutral-400">
              <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-xs">Chưa có lịch sử hội thoại nào.</p>
              <p className="text-[10px] text-neutral-400 mt-1">Các cuộc hội thoại sẽ tự động lưu tại đây.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSessions.map((session) => {
                const isPinned = pinnedIds.includes(session.id);
                return (
                  <div
                    key={session.id}
                    onClick={() => setSelectedConversationId(session.id)}
                    className="p-3 bg-white rounded-xl border border-neutral-200/80 shadow-2xs hover:border-neutral-400 transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-neutral-900 truncate">{session.title}</div>
                        <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                          {session.messageCount} trao đổi • {new Date(session.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => togglePin(session.id, e)}
                        className={`p-1.5 rounded hover:bg-neutral-100 ${isPinned ? 'text-amber-500' : 'text-neutral-400'}`}
                        title={isPinned ? 'Bỏ ghim' : 'Ghim hội thoại'}
                      >
                        <Pin className={`h-3.5 w-3.5 ${isPinned ? 'fill-amber-500' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => exportConversation(session, e)}
                        className="p-1.5 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700"
                        title="Xuất tệp hội thoại"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
