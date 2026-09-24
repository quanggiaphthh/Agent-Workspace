import React, { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ModuleSidebar } from './ModuleSidebar';
import { Header } from './Header';
import { Canvas } from './Canvas';
import { AgentPanel } from '../../agent/ui/AgentPanel';
import { GlobalOverlay } from './GlobalOverlay';
import { NavigationSync } from '../../core/navigation/NavigationSync';
import { navigationService } from '../../core/navigation/navigationService';

interface AppShellProps {
  children?: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [agentCollapsed, setAgentCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileAgentOpen, setMobileAgentOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches
  );
  const navigate = useNavigate();

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const syncViewport = () => setIsDesktopViewport(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener?.('change', syncViewport);

    return () => mediaQuery.removeEventListener?.('change', syncViewport);
  }, []);

  useEffect(() => {
    navigationService.setNavigateFn((path) => navigate({ to: path as any }));
  }, [navigate]);

  useEffect(() => {
    const handleCustomPaletteOpen = () => setCommandPaletteOpen(true);
    window.addEventListener('open-command-palette', handleCustomPaletteOpen);

    return () => {
      window.removeEventListener('open-command-palette', handleCustomPaletteOpen);
    };
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen && !mobileAgentOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobileSidebarOpen(false);
      setMobileAgentOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileAgentOpen, mobileSidebarOpen]);

  return (
    <div className="h-screen w-screen flex min-h-0 flex-col bg-neutral-100 text-neutral-900 overflow-hidden font-sans antialiased">
      <NavigationSync />
      {/* 3-Pane Body Layout */}
      <div className="min-h-0 flex-1 flex overflow-hidden">
        {/* Desktop / iPad Left Sidebar */}
        <div className="hidden lg:flex shrink-0">
          <ModuleSidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>

        {/* Mobile Sidebar Overlay (Drawer) */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Điều hướng chính">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
              aria-hidden="true"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="relative z-50 h-full">
              <ModuleSidebar
                collapsed={false}
                onToggleCollapse={() => {}}
                isMobile
                onCloseMobile={() => setMobileSidebarOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Central Work Area (Header + ModuleCanvas/Children) */}
        <div className="min-h-0 flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onToggleAgent={() => {
              if (!isDesktopViewport) {
                setMobileAgentOpen(!mobileAgentOpen);
              } else {
                setAgentCollapsed(!agentCollapsed);
              }
            }}
            agentCollapsed={isDesktopViewport ? agentCollapsed : !mobileAgentOpen}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          />

          <Canvas>
            {children}
          </Canvas>
        </div>

        {/* Desktop / iPad Persistent Agent Panel */}
        <div className="hidden lg:flex shrink-0">
          <AgentPanel
            collapsed={agentCollapsed}
            onToggleCollapse={() => setAgentCollapsed(!agentCollapsed)}
          />
        </div>

        {/* Mobile Agent Panel (Bottom/Side Sheet) */}
        {mobileAgentOpen && (
          <div className="fixed inset-0 z-50 flex justify-end lg:hidden" role="dialog" aria-modal="true" aria-label="Bảng Trợ lý">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
              aria-hidden="true"
              onClick={() => setMobileAgentOpen(false)}
            />
            <div className="relative z-50 w-[90%] max-w-md h-full bg-white shadow-2xl">
              <AgentPanel
                collapsed={false}
                onToggleCollapse={() => setMobileAgentOpen(false)}
                isMobile
              />
            </div>
          </div>
        )}
      </div>

      {/* Global Overlay (Command Palette, Confirm Dialogs, Toasts) */}
      <GlobalOverlay
        commandPaletteOpen={commandPaletteOpen}
        onCloseCommandPalette={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}
