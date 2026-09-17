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
import { useAIKeysStore } from '../../modules/settings/aiKeysStore';

interface AgentPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobile?: boolean;
}

export function AgentPanel({ collapsed, onToggleCollapse, isMobile = false }: AgentPanelProps) {
  const activeModule = useContextStore(state => state.activeModule);
  const selectedEntity = useContextStore(state => state.selectedEntity);
  const setSelectedEntity = useContextStore(state => state.setSelectedEntity);
  const [activeTab, setActiveTab] = useState<'chat' | 'memory' | 'history'>('chat');
  const agentProvider = useAIKeysStore(state => state.agentProvider);

  if (collapsed && !isMobile) {
    return (
      <div className="w-12 border-l border-neutral-200 bg-white flex flex-col items-center py-4 gap-4 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          title="Mở bảng Trợ lý"
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
        className={`border-l border-neutral-200 bg-white flex flex-col shrink-0 h-full ${
          isMobile ? 'w-full' : 'w-[380px] xl:w-[420px]'
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
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <span className="text-[10px] text-neutral-500 font-mono">Nền tảng Google AI</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                title="Thu gọn bảng"
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
                Hệ thống đang buộc sử dụng nhà cung cấp <strong>Google/Gemini</strong> cho Trợ lý AI. Vui lòng cập nhật cấu hình trong <strong>Cài đặt</strong> nếu cần thiết.
              </span>
            </div>
          )}

          {/* Live Context Bridge Status Bar */}
          <div className="p-2 rounded bg-white border border-neutral-200/80 text-[11px] space-y-1">
            <div className="flex items-center justify-between text-neutral-500">
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3 text-neutral-400" />
                Phân hệ hiện tại:
              </span>
              <span className="font-semibold text-neutral-800 capitalize font-mono">{activeModule}</span>
            </div>

            {selectedEntity && (
              <div className="flex items-center justify-between text-neutral-500 pt-1 border-t border-neutral-100">
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3 text-neutral-400" />
                  Đối tượng mục tiêu:
                </span>
                <span className="inline-flex items-center gap-1 font-mono font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 text-[10px]">
                  {selectedEntity.entityId}
                  <button
                    onClick={() => setSelectedEntity(null)}
                    className="hover:text-rose-600 ml-0.5 cursor-pointer"
                    title="Gỡ bỏ đối tượng mục tiêu"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              </div>
            )}
          </div>

          {/* Persistent Sidebar Tabs: Chat, Memory & History */}
          <div className="flex bg-neutral-200/70 p-0.5 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
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
        <div className="flex-1 flex flex-col overflow-hidden relative">
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
