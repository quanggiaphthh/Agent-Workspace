import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { NavigationContribution } from '../../../shared/contracts/module';
import { useContextStore } from '../../core/context/contextStore';
import { eventBus } from '../../core/events/eventBus';
import { Button } from '../../components/ui/Button';
import {
  LayoutDashboard,
  ListTodo,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react';

interface ModuleSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobile?: boolean;
  onCloseMobile?: () => void;
}

export function ModuleSidebar({
  collapsed,
  onToggleCollapse,
  isMobile = false,
  onCloseMobile,
}: ModuleSidebarProps) {
  const [navItems, setNavItems] = useState<NavigationContribution[]>([]);
  const user = useContextStore(s => s.user);
  const location = useLocation();
  const navigate = useNavigate();

  const refreshNav = () => {
    setNavItems(moduleRegistry.getNavigation());
  };

  useEffect(() => {
    refreshNav();
    const unsub1 = eventBus.on('module.statusChanged', refreshNav);
    const unsub2 = eventBus.on('modules.synced', refreshNav);
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const getIcon = (iconName?: string) => {
    switch (iconName) {
      case 'LayoutDashboard':
      case 'Home':
        return <LayoutDashboard className="h-4 w-4 shrink-0" />;
      case 'ListTodo':
      case 'CheckSquare':
        return <ListTodo className="h-4 w-4 shrink-0" />;
      case 'Sliders':
      case 'Settings':
        return <Sliders className="h-4 w-4 shrink-0" />;
      default:
        return <Layers className="h-4 w-4 shrink-0" />;
    }
  };

  const sortedNavItems = [...navItems].sort((a, b) => {
    const isASettings = a.id === 'settings-nav' || a.path === '/settings' || a.label.toLowerCase().includes('cài đặt');
    const isBSettings = b.id === 'settings-nav' || b.path === '/settings' || b.label.toLowerCase().includes('cài đặt');
    if (isASettings && !isBSettings) return 1;
    if (!isASettings && isBSettings) return -1;
    return (a.order || 0) - (b.order || 0);
  });

  return (
    <aside
      className={`border-r border-neutral-200 bg-neutral-900 text-neutral-100 flex flex-col shrink-0 transition-all duration-200 ${
        isMobile
          ? 'w-64 h-full'
          : collapsed
          ? 'w-16 h-full'
          : 'w-60 xl:w-64 h-full'
      }`}
    >
      {/* Brand Header */}
      <div className="h-14 border-b border-neutral-800 flex items-center justify-between px-3.5 shrink-0">
        {!collapsed || isMobile ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-7 w-7 rounded-md bg-white text-neutral-950 font-bold flex items-center justify-center text-xs shadow-xs">
              M
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-xs tracking-tight text-white truncate">
                Trợ lý Đa nhiệm
              </h1>
              <span className="text-[10px] text-neutral-400 block font-mono">Giao diện V1.0</span>
            </div>
          </div>
        ) : (
          <div className="mx-auto h-7 w-7 rounded-md bg-white text-neutral-950 font-bold flex items-center justify-center text-xs">
            M
          </div>
        )}

        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-7 w-7 text-neutral-400 hover:text-white hover:bg-neutral-800"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      {/* Dynamic Module Navigation (Rendered from Manifest Contributions) */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {sortedNavItems.map(item => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <button
              key={item.id}
              onClick={() => {
                navigate({ to: item.path as any });
                if (onCloseMobile) onCloseMobile();
              }}
              title={collapsed && !isMobile ? item.label : undefined}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium cursor-pointer border-none transition-colors ${
                isActive
                  ? 'bg-white text-neutral-950 shadow-xs font-semibold'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
              } ${collapsed && !isMobile ? 'justify-center px-0' : ''}`}
            >
              {getIcon(item.icon)}
              {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
              {(!collapsed || isMobile) && item.badge !== undefined && (
                <span className="ml-auto text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.2 rounded font-mono">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* User & Role Footer */}
      <div className="p-3 border-t border-neutral-800 bg-neutral-950 shrink-0">
        {!collapsed || isMobile ? (
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-semibold text-neutral-200 shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white truncate">{user.name}</div>
              <div className="text-[10px] text-neutral-400 font-mono truncate">{user.email}</div>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
              Quản trị viên
            </span>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="h-7 w-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-semibold text-neutral-200">
              {user.name.charAt(0)}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
