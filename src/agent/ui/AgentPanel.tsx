import React, { useState } from 'react';
import { AdkRuntimeProvider } from './AdkRuntimeProvider';
import { AgentChatThread } from './AgentChatThread';
import { AgentCoordinationHistory } from './AgentCoordinationHistory';
import { AgentMemoryPanel } from './AgentMemoryPanel';
import { Button } from '../../components/ui/Button';
import { Bot, Brain, ChevronRight, Focus, History, Layers, Minimize2, Tag, X } from 'lucide-react';
import { AdkToolHandler } from './AdkToolHandler';
import { useContextStore } from '../../core/context/contextStore';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { useAIKeysStore } from '../../modules/settings/aiKeysStore';
import type { AgentDisplayMode } from '../../app/shell/AppShell';

interface AgentPanelProps {
  mode: AgentDisplayMode;
  onOpen: (trigger?: HTMLElement) => void;
  onClose: () => void;
  onFocus: () => void;
  onRestore: () => void;
  isOverlay?: boolean;
}

type AgentSurface = 'chat' | 'history' | 'memory';

export function AgentPanel({ mode, onOpen, onClose, onFocus, onRestore, isOverlay = false }: AgentPanelProps) {
  const activeModuleId = useContextStore(state => state.activeModule);
  const selectedEntity = useContextStore(state => state.selectedEntity);
  const setSelectedEntity = useContextStore(state => state.setSelectedEntity);
  const memoryEnabled = useAIKeysStore(state => state.memoryEnabled);
  const agentProvider = useAIKeysStore(state => state.agentProvider);
  const [surface, setSurface] = useState<AgentSurface>('chat');
  const [contextOpen, setContextOpen] = useState(false);
  const activeModule = moduleRegistry.resolve(activeModuleId || 'home');
  const activeModuleName = activeModule?.meta?.name || 'Trang hiện tại';
  const isFocus = mode === 'focus';

  if (mode === 'closed' && !isOverlay) {
    return (
      <aside id="agent-panel" aria-label="Trợ lý AI" className="w-12 border-l border-neutral-200 bg-white flex flex-col items-center py-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={(event) => onOpen(event.currentTarget)} title="Mở Trợ lý AI" aria-label="Mở Trợ lý AI" aria-expanded="false" aria-controls="agent-panel-content" className="h-10 w-10 text-neutral-700 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-500">
          <Bot className="h-5 w-5" />
        </Button>
      </aside>
    );
  }

  return (
    <AdkRuntimeProvider>
      <AdkToolHandler />
      <aside
        id="agent-panel"
        aria-label="Trợ lý AI"
        className={`border-l border-neutral-200 bg-white flex flex-col min-w-0 h-full ${isFocus ? 'w-full flex-1' : isOverlay ? 'w-full' : 'w-[440px] max-w-[46vw] shrink-0'}`}
      >
        <div className="px-3 py-2.5 border-b border-neutral-200 bg-white shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0"><Bot className="h-4 w-4" /></div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-neutral-900">Trợ lý AI</div>
                <div className="text-[10px] text-neutral-500">{agentProvider === 'google' ? 'Sẵn sàng hỗ trợ theo ngữ cảnh' : 'Kiểm tra cấu hình Trợ lý trong Cài đặt'}</div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <div className="relative">
                <button type="button" onClick={() => setContextOpen(value => !value)} aria-expanded={contextOpen} aria-controls="agent-context-details" className="h-8 max-w-40 inline-flex items-center gap-1.5 px-2.5 rounded-full border border-neutral-200 bg-neutral-50 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500">
                  <Layers className="h-3.5 w-3.5 text-neutral-500" /><span className="truncate">{activeModuleName}</span>
                </button>
                {contextOpen && (
                  <div id="agent-context-details" className="absolute right-0 top-10 z-30 w-64 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg text-[11px] space-y-2" role="status">
                    <div className="font-semibold text-neutral-900">Ngữ cảnh Trợ lý</div>
                    <div className="flex justify-between gap-3"><span className="text-neutral-500">Phân hệ</span><span className="font-medium text-neutral-800 truncate">{activeModuleName}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-neutral-500">Bộ nhớ</span><span className="font-medium text-neutral-800">{memoryEnabled ? 'Đang bật' : 'Đang tắt'}</span></div>
                    {selectedEntity && (
                      <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-neutral-600"><Tag className="h-3 w-3" />1 mục đang chọn</span>
                        <button type="button" onClick={() => setSelectedEntity(null)} aria-label="Bỏ chọn mục" className="p-1 rounded hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"><X className="h-3 w-3" /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Button variant={surface === 'history' ? 'secondary' : 'ghost'} size="icon" onClick={() => setSurface(surface === 'history' ? 'chat' : 'history')} title="Hội thoại" aria-label="Mở Hội thoại" aria-pressed={surface === 'history'} className="h-8 w-8"><History className="h-4 w-4" /></Button>
              <Button variant={surface === 'memory' ? 'secondary' : 'ghost'} size="icon" onClick={() => setSurface(surface === 'memory' ? 'chat' : 'memory')} title="Bộ nhớ" aria-label="Mở Bộ nhớ" aria-pressed={surface === 'memory'} className="h-8 w-8"><Brain className="h-4 w-4" /></Button>
              {isFocus ? (
                <Button variant="ghost" size="icon" onClick={onRestore} title="Thu nhỏ" aria-label="Thu nhỏ Trợ lý về bảng bên" className="h-8 w-8"><Minimize2 className="h-4 w-4" /></Button>
              ) : (
                <Button variant="ghost" size="icon" onClick={onFocus} title="Mở không gian tập trung" aria-label="Mở Trợ lý ở chế độ tập trung" className="h-8 w-8"><Focus className="h-4 w-4" /></Button>
              )}
              <Button variant="ghost" size="icon" onClick={onClose} title="Đóng Trợ lý" aria-label="Đóng Trợ lý AI" className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>

        <div className="sr-only" aria-live="polite">{surface === 'chat' ? 'Trò chuyện' : surface === 'history' ? 'Hội thoại' : 'Bộ nhớ'}</div>
        <div id="agent-panel-content" className="min-h-0 flex-1 flex flex-col overflow-hidden relative">
          {surface === 'chat' ? <AgentChatThread /> : surface === 'memory' ? <AgentMemoryPanel /> : <AgentCoordinationHistory onOpenChat={() => setSurface('chat')} />}
        </div>
      </aside>
    </AdkRuntimeProvider>
  );
}
