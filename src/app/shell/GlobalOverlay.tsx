import React, { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ToastContainer } from '../../components/ui/Toast';
import { useContextStore } from '../../core/context/contextStore';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import {
  Search,
  LayoutDashboard,
  Circle,
  ArrowRight,
  X,
  Command,
} from 'lucide-react';

interface GlobalOverlayProps {
  commandPaletteOpen: boolean;
  onCloseCommandPalette: () => void;
}

export function GlobalOverlay({
  commandPaletteOpen,
  onCloseCommandPalette,
}: GlobalOverlayProps) {
  const [search, setSearch] = useState('');
  const setSelectedEntity = useContextStore(s => s.setSelectedEntity);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (commandPaletteOpen) {
          onCloseCommandPalette();
        } else {
          // Trigger open
          const evt = new CustomEvent('open-command-palette');
          window.dispatchEvent(evt);
        }
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        onCloseCommandPalette();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, onCloseCommandPalette]);

  if (!commandPaletteOpen) {
    return <ToastContainer />;
  }

  const navItems = moduleRegistry.getNavigation();

  const commands = navItems.map(item => ({
    id: `nav-${item.id}`,
    label: item.label,
    category: 'Điều hướng',
    icon: item.icon ? React.createElement(item.icon as any, { className: "h-4 w-4 text-neutral-500" }) : <Circle className="h-4 w-4 text-neutral-500" />,
    action: () => {
      navigate({ to: item.path as any });
      onCloseCommandPalette();
    },
  }));

  const filteredCommands = commands.filter(c =>
    c.label.toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
          onClick={onCloseCommandPalette}
        />

        {/* Palette Card */}
        <div className="relative z-50 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center px-3.5 border-b border-neutral-100">
            <Search className="h-4 w-4 text-neutral-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nhập lệnh hoặc chuyển đến phân hệ..."
              className="w-full h-11 px-3 text-xs bg-transparent focus:outline-none placeholder:text-neutral-400"
              autoFocus
            />
            <kbd className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
              ESC
            </kbd>
          </div>

          <div className="max-h-72 overflow-y-auto p-2 divide-y divide-neutral-50">
            {filteredCommands.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-400">
                Không tìm thấy kết quả phù hợp.
              </div>
            ) : (
              filteredCommands.map(cmd => (
                <div
                  key={cmd.id}
                  onClick={cmd.action}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-neutral-100/80 cursor-pointer transition-colors text-xs select-none"
                >
                  <div className="flex items-center gap-2.5">
                    {cmd.icon}
                    <span className="font-medium text-neutral-800">{cmd.label}</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">{cmd.category}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ToastContainer />
    </>
  );
}
