import React, { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ToastContainer } from '../../components/ui/Toast';
import { useContextStore } from '../../core/context/contextStore';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import {
  Search,
  LayoutDashboard,
  ListTodo,
  Sliders,
  Layers,
} from 'lucide-react';

const navigationIcons: Record<string, React.ElementType> = {
  LayoutDashboard,
  Home: LayoutDashboard,
  ListTodo,
  CheckSquare: ListTodo,
  Sliders,
  Settings: Sliders,
};

interface GlobalOverlayProps {
  commandPaletteOpen: boolean;
  onCloseCommandPalette: () => void;
}

export function GlobalOverlay({
  commandPaletteOpen,
  onCloseCommandPalette,
}: GlobalOverlayProps) {
  const [search, setSearch] = useState('');
  const user = useContextStore(s => s.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (commandPaletteOpen) setSearch('');
  }, [commandPaletteOpen]);

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

  const navItems = moduleRegistry.getNavigation(user);

  const commands = navItems.map(item => ({
    id: `nav-${item.id}`,
    label: item.label,
    category: 'Điều hướng',
    icon: (() => {
      const Icon = item.icon ? navigationIcons[item.icon] : Layers;
      return <Icon className="h-4 w-4 text-neutral-500" />;
    })(),
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
        <button
          type="button"
          aria-label="Đóng tìm kiếm"
          className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
          onClick={onCloseCommandPalette}
        />

        {/* Palette Card */}
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="command-palette-title"
          className="relative z-50 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center px-3.5 border-b border-neutral-100">
            <Search className="h-4 w-4 text-neutral-400 shrink-0" />
            <label id="command-palette-title" htmlFor="command-palette-search" className="sr-only">
              Tìm kiếm và thao tác nhanh
            </label>
            <input
              id="command-palette-search"
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Tìm kiếm và thao tác nhanh"
              placeholder="Tìm mục hoặc thao tác..."
              className="w-full h-11 px-3 text-xs bg-transparent focus:outline-none placeholder:text-neutral-400"
              autoFocus
            />
            <kbd className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
              ESC
            </kbd>
          </div>

          <div
            className="max-h-72 overflow-y-auto p-2 divide-y divide-neutral-50"
            role="listbox"
            aria-label="Kết quả điều hướng"
          >
            {filteredCommands.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-400" role="status">
                Không tìm thấy kết quả phù hợp.
              </div>
            ) : (
              filteredCommands.map(cmd => (
                <button
                  type="button"
                  key={cmd.id}
                  onClick={cmd.action}
                  role="option"
                  className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-neutral-100/80 cursor-pointer transition-colors text-xs select-none text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                >
                  <div className="flex items-center gap-2.5">
                    {cmd.icon}
                    <span className="font-medium text-neutral-800">{cmd.label}</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">{cmd.category}</span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      <ToastContainer />
    </>
  );
}
