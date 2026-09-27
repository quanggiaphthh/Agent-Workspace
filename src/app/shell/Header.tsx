import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useContextStore } from '../../core/context/contextStore';
import { Button } from '../../components/ui/Button';
import { Menu, Bot, Search, Sliders, X, Command } from 'lucide-react';
import { UserAuth } from '../../components/UserAuth';

interface HeaderProps {
  onOpenMobileSidebar: () => void;
  onToggleAgent: (trigger?: HTMLElement) => void;
  agentOpen: boolean;
  onOpenCommandPalette: () => void;
}

function selectedEntityText(entity: ReturnType<typeof useContextStore.getState>['selectedEntity']): string | null {
  if (!entity) return null;
  const typeLabel = entity.moduleId === 'tasks' && entity.entityType === 'task' ? 'Công việc' : entity.entityType;
  return `${typeLabel} · ${entity.label || entity.entityId}`;
}

export function Header({ onOpenMobileSidebar, onToggleAgent, agentOpen, onOpenCommandPalette }: HeaderProps) {
  const selectedEntity = useContextStore(s => s.selectedEntity);
  const setSelectedEntity = useContextStore(s => s.setSelectedEntity);
  const navigate = useNavigate();
  const contextLabel = selectedEntityText(selectedEntity);

  return (
    <header className="h-14 border-b border-neutral-200 bg-white px-4 flex items-center justify-between gap-3 shrink-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="icon" onClick={onOpenMobileSidebar} aria-label="Mở điều hướng" aria-controls="primary-navigation" className="min-[1400px]:hidden h-8 w-8 text-neutral-600"><Menu className="h-4 w-4" /></Button>
        <div className="flex items-center gap-2 min-w-0 text-xs">
          {selectedEntity && contextLabel && (
            <div className="hidden sm:inline-flex max-w-[300px] items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="font-semibold truncate">{contextLabel}</span>
              <button type="button" onClick={() => setSelectedEntity(null)} aria-label={`Bỏ ngữ cảnh ${contextLabel}`} className="shrink-0 hover:text-rose-600 p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"><X className="h-3 w-3" /></button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={onOpenCommandPalette} aria-label="Mở tìm kiếm và thao tác nhanh" aria-haspopup="dialog" className="hidden md:flex items-center gap-2 h-8 px-2.5 rounded-md border border-neutral-200 bg-neutral-50 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400">
          <Search className="h-3.5 w-3.5 text-neutral-400" /><span>Tìm kiếm & thao tác nhanh...</span><kbd className="inline-flex items-center gap-0.5 rounded bg-white border border-neutral-200 px-1.5 py-0.5 text-[10px] font-mono text-neutral-500"><Command className="h-2.5 w-2.5" />K</kbd>
        </button>
        <Button variant="ghost" size="icon" title="Mở cài đặt" aria-label="Mở cài đặt" onClick={() => navigate({ to: '/settings' as any })} className="h-8 w-8 text-neutral-600 hover:text-neutral-900"><Sliders className="h-4 w-4" /></Button>
        <div className="h-4 w-px bg-neutral-200 mx-1" />
        <UserAuth />
        <Button
          variant={agentOpen ? 'secondary' : 'default'} size="sm"
          onClick={(event) => onToggleAgent(event.currentTarget)}
          aria-label={agentOpen ? 'Đóng Trợ lý AI' : 'Mở Trợ lý AI'} aria-expanded={agentOpen} aria-controls="agent-panel"
          className="text-xs gap-1.5 h-8 px-2.5 font-medium focus-visible:ring-2 focus-visible:ring-neutral-500"
        >
          <Bot className="h-3.5 w-3.5 text-emerald-500" /><span className="hidden sm:inline">Trợ lý</span>{agentOpen && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="Đang mở" />}
        </Button>
      </div>
    </header>
  );
}
