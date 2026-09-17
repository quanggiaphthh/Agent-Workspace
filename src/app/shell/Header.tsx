import React from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useContextStore } from '../../core/context/contextStore';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { Button } from '../../components/ui/Button';
import {
  Menu,
  Bot,
  Search,
  Sliders,
  X,
  Command,
} from 'lucide-react';
import { UserAuth } from '../../components/UserAuth';

interface HeaderProps {
  onOpenMobileSidebar: () => void;
  onToggleAgent: () => void;
  agentCollapsed: boolean;
  onOpenCommandPalette: () => void;
}

export function Header({
  onOpenMobileSidebar,
  onToggleAgent,
  agentCollapsed,
  onOpenCommandPalette,
}: HeaderProps) {
  const selectedEntity = useContextStore(s => s.selectedEntity);
  const setSelectedEntity = useContextStore(s => s.setSelectedEntity);
  const location = useLocation();
  const navigate = useNavigate();

  // Dynamically resolve active module from URL
  const activeModuleId = moduleRegistry.resolveModuleByPath(location.pathname);
  const manifest = moduleRegistry.resolve(activeModuleId);
  const displayTitle = manifest?.meta?.name || activeModuleId.charAt(0).toUpperCase() + activeModuleId.slice(1);

  return (
    <header className="h-14 border-b border-neutral-200 bg-white px-4 flex items-center justify-between gap-3 shrink-0 z-10">
      {/* Left section: mobile hamburger & breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobileSidebar}
          className="lg:hidden h-8 w-8 text-neutral-600"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 min-w-0 text-xs">
          <span className="font-semibold text-neutral-900 truncate">
            {displayTitle}
          </span>

          {/* Bound Entity Context Chip */}
          {selectedEntity && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="font-bold truncate max-w-[140px]">{selectedEntity.entityId}</span>
              <button
                onClick={() => setSelectedEntity(null)}
                className="hover:text-rose-600 cursor-pointer p-0.5"
                title="Bỏ chọn đối tượng"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right section: Search / Command Palette and Agent Toggle */}
      <div className="flex items-center gap-2">
        {/* Command Palette trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 h-8 px-2.5 rounded-md border border-neutral-200 bg-neutral-50 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition-colors cursor-pointer"
        >
          <Search className="h-3.5 w-3.5 text-neutral-400" />
          <span>Tìm kiếm & thao tác nhanh...</span>
          <kbd className="inline-flex items-center gap-0.5 rounded bg-white border border-neutral-200 px-1.5 py-0.5 text-[10px] font-mono text-neutral-500">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        {/* Quick Module Manager Shortcut */}
        <Button
          variant="ghost"
          size="icon"
          title="Quản lý phân hệ"
          onClick={() => {
            navigate({ to: '/settings' as any });
          }}
          className="h-8 w-8 text-neutral-600 hover:text-neutral-900"
        >
          <Sliders className="h-4 w-4" />
        </Button>

        <div className="h-4 w-[1px] bg-neutral-200 mx-1" />

        <UserAuth />

        {/* Agent Toggle Button */}
        <Button
          variant={agentCollapsed ? 'default' : 'secondary'}
          size="sm"
          onClick={onToggleAgent}
          className="text-xs gap-1.5 h-8 px-2.5 font-medium"
        >
          <Bot className="h-3.5 w-3.5 text-emerald-500" />
          <span className="hidden sm:inline">Bảng Trợ lý</span>
          {!agentCollapsed && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
        </Button>
      </div>
    </header>
  );
}

