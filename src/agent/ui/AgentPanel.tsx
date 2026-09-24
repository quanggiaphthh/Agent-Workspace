import React, { useState } from 'react';
import { AdkRuntimeProvider } from './AdkRuntimeProvider';
import { AgentChatThread } from './AgentChatThread';
import { AgentCoordinationHistory } from './AgentCoordinationHistory';
import { AgentMemoryPanel } from './AgentMemoryPanel';
import { Button } from '../../components/ui/Button';
import {
  Bot,
  ChevronRight,
  Layers,
  Tag,
  X,
  MessageSquare,
  History,
  Brain,
} from 'lucide-react';
import { AdkToolHandler } from './AdkToolHandler';
import { useContextStore } from '../../core/context/contextStore';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { useAIKeysStore } from '../../modules/settings/aiKeysStore';

interface AgentPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobile?: boolean;
}

export function AgentPanel({ collapsed, onToggleCollapse, isMobile = false }: AgentPanelProps) {
  const activeModuleId = useContextStore(state => state.activeModule);
  const selectedEntity = useContextStore(state => state.selectedEntity);
  const setSelectedEntity = useContextStore(state => state.setSelectedEntity);
  const [activeTab, setActiveTab] = useState<'chat' | 'memory' | 'history'>('chat');
  const agentProvider = useAIKeysStore(state => state.agentProvider);
  const activeModule = moduleRegistry.resolve(activeModuleId || 'home');
  const activeModuleName = activeModule?.meta?.name || 'Trang hiện tại';

  if (collapsed && !isMobile) {
    return (
      <div id="agent-panel" aria-label="Bảng Trợ lý" className="w-12 border-l border-neutral-200 bg-white flex flex-col items-center py-4 gap-4 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          title="Mở bảng Trợ lý"
          aria-label="Mở bảng Trợ lý"
          className="h-8 w-8 text-neutral-600 hover:text-neutral-900"
        >
          <Bot className="h-5 w-5 text-neutral-800" />
        </Button>
        <span
          className="text-[11px] font-semibold text-neutral-400 uppercase tracking-widest -rotate-90 origin-center whitespace-nowrap mt-8"
        >
          Trung tâm Trợ lý
        </span>
      </div>
    );
  }

  return (
    <AdkRuntimeProvider>
      <AdkToolHandler />
      <aside
        id="agent-panel"
        aria-label="Bảng Trợ lý"
        className={`border-l border-neutral-200 bg-white flex flex-col shrink-0 h-full ${
          isMobile ? 'w-full' : 'w-[340px] xl:w-[380px] 2xl:w-[420px]'
        }`}
      >
        {/* Top Header with Context Badges */}
        <div className="p-3.5 border-b border-neutral-200 bg-neutral-50/70 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-neutral-900 text-white flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-neutral-900 tracking-tight">Trợ lý AI</span>
                </div>
                <span className="text-[10px] text-neutral-500">Hỗ trợ theo ngữ cảnh hiện tại</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                title="Thu gọn bảng"
                aria-label="Thu gọn bảng Trợ lý"
                className="h-7 w-7 text-neutral-400 hover:text-neutral-700"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {agentProvider !== 'google' && (
            <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] leading-relaxed flex items-start gap-1.5 shadow-3xs">
              <span className="text-amber-500 font-bold shrink-0">⚠️</span>
              <span>
                Trợ lý đang dùng cấu hình mặc định. Bạn có thể kiểm tra lại trong <strong>Cài đặt</strong>.
              </span>
            </div>
          )}

          {/* Live Context Bridge Status Bar */}
          <div className="p-2 rounded bg-white border border-neutral-200/80 text-[11px] space-y-1" aria-label="Ngữ cảnh hiện tại">
            <div className="flex items-center justify-between text-neutral-500">
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3 text-neutral-400" />
                Đang ở:
              </span>
              <span className="font-semibold text-neutral-800 truncate max-w-[170px]">{activeModuleName}</span>
            </div>

            {selectedEntity && (
              <div className="flex items-center justify-between text-neutral-500 pt-1 border-t border-neutral-100">
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3 text-neutral-400" />
                  Mục đang chọn:
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 text-[10px]">
                  Đã chọn
                  <button
                    type="button"
                    onClick={() => setSelectedEntity(null)}
                    aria-label="Bỏ chọn mục"
                    className="hover:text-rose-600 ml-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              </div>
            )}
          </div>

          {/* Persistent Sidebar Tabs: Chat, Memory & History */}
          <div className="flex bg-neutral-200/70 p-0.5 rounded-lg text-xs font-medium" role="tablist" aria-label="Các khu vực Trợ lý">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              role="tab"
              aria-selected={activeTab === 'chat'}
              aria-controls="agent-panel-content"
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md transition-all ${
                activeTab === 'chat'
                  ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Trò chuyện</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('memory')}
              role="tab"
              aria-selected={activeTab === 'memory'}
              aria-controls="agent-panel-content"
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md transition-all ${
                activeTab === 'memory'
                  ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Brain className="h-3.5 w-3.5" />
              <span>Bộ nhớ AI</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              role="tab"
              aria-selected={activeTab === 'history'}
              aria-controls="agent-panel-content"
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md transition-all ${
                activeTab === 'history'
                  ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Nhật ký</span>
            </button>
          </div>
        </div>

        {/* Content View */}
        <div id="agent-panel-content" role="tabpanel" className="min-h-0 flex-1 flex flex-col overflow-hidden relative">
          {activeTab === 'chat' ? (
            <AgentChatThread />
          ) : activeTab === 'memory' ? (
            <AgentMemoryPanel />
          ) : (
            <AgentCoordinationHistory />
          )}
        </div>
      </aside>
    </AdkRuntimeProvider>
  );
}
