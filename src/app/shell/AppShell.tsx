import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ModuleSidebar } from './ModuleSidebar';
import { Header } from './Header';
import { Canvas } from './Canvas';
import { AgentPanel } from '../../agent/ui/AgentPanel';
import { GlobalOverlay } from './GlobalOverlay';
import { NavigationSync } from '../../core/navigation/NavigationSync';
import { navigationService } from '../../core/navigation/navigationService';
import { eventBus } from '../../core/events/eventBus';

interface AppShellProps { children?: React.ReactNode; }
export type AgentDisplayMode = 'closed' | 'panel' | 'focus';
const HOME_OPEN_AGENT_EVENT = 'workspace:open-agent';

export function nextAgentDisplayMode(mode: AgentDisplayMode, action: 'open' | 'close' | 'focus' | 'restore'): AgentDisplayMode {
  if (action === 'close') return 'closed';
  if (action === 'focus') return 'focus';
  if (action === 'restore') return 'panel';
  return mode === 'closed' ? 'panel' : mode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentDisplayMode>('closed');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [viewport, setViewport] = useState<'wide' | 'medium' | 'narrow'>(() => {
    if (typeof window === 'undefined') return 'wide';
    if (window.matchMedia('(min-width: 1280px)').matches) return 'wide';
    if (window.matchMedia('(min-width: 768px)').matches) return 'medium';
    return 'narrow';
  });
  const lastAgentTriggerRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1280px)');
    const medium = window.matchMedia('(min-width: 768px)');
    const sync = () => setViewport(wide.matches ? 'wide' : medium.matches ? 'medium' : 'narrow');
    sync();
    wide.addEventListener?.('change', sync);
    medium.addEventListener?.('change', sync);
    return () => { wide.removeEventListener?.('change', sync); medium.removeEventListener?.('change', sync); };
  }, []);

  useEffect(() => { navigationService.setNavigateFn((path) => navigate({ to: path as any })); }, [navigate]);

  useEffect(() => {
    const open = () => setCommandPaletteOpen(true);
    window.addEventListener('open-command-palette', open);
    return () => window.removeEventListener('open-command-palette', open);
  }, []);

  useEffect(() => eventBus.on(HOME_OPEN_AGENT_EVENT, () => setAgentMode('panel')), []);

  const restoreAgentTrigger = () => {
    requestAnimationFrame(() => lastAgentTriggerRef.current?.focus());
  };

  const closeAgent = (restoreFocus = true) => {
    setAgentMode('closed');
    if (restoreFocus) restoreAgentTrigger();
  };

  const toggleAgent = (trigger?: HTMLElement) => {
    if (trigger) lastAgentTriggerRef.current = trigger;
    if (agentMode === 'closed') setAgentMode('panel');
    else closeAgent(Boolean(trigger));
  };

  const agentIsOverlay = agentMode !== 'closed' && viewport !== 'wide';

  useEffect(() => {
    if (!agentIsOverlay && !mobileSidebarOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (agentIsOverlay) closeAgent(true);
      if (mobileSidebarOpen) setMobileSidebarOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [agentIsOverlay, mobileSidebarOpen]);

  const agentPanel = (
    <AgentPanel
      mode={agentMode}
      onOpen={(trigger) => { if (trigger) lastAgentTriggerRef.current = trigger; setAgentMode('panel'); }}
      onClose={() => closeAgent(true)}
      onFocus={() => setAgentMode('focus')}
      onRestore={() => setAgentMode('panel')}
      isOverlay={agentIsOverlay}
    />
  );

  return (
    <div className="h-screen w-screen flex min-h-0 flex-col bg-neutral-100 text-neutral-900 overflow-hidden font-sans antialiased">
      <NavigationSync />
      <div className="min-h-0 flex-1 flex overflow-hidden">
        <div className="hidden lg:flex shrink-0">
          <ModuleSidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} />
        </div>

        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Điều hướng chính">
            <button type="button" aria-label="Đóng điều hướng" className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setMobileSidebarOpen(false)} />
            <div className="relative z-50 h-full"><ModuleSidebar collapsed={false} onToggleCollapse={() => {}} isMobile onCloseMobile={() => setMobileSidebarOpen(false)} /></div>
          </div>
        )}

        <div className="relative min-h-0 flex-1 flex min-w-0 overflow-hidden">
          <div className="min-h-0 flex-1 flex flex-col min-w-0 overflow-hidden">
            <Header
              onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
              onToggleAgent={toggleAgent}
              agentOpen={agentMode !== 'closed'}
              onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            />
            <Canvas>{children}</Canvas>
          </div>

          {viewport === 'wide' && (
            <div className={agentMode === 'focus' ? 'absolute inset-x-0 top-14 bottom-0 z-30 flex bg-white' : 'flex shrink-0'}>
              {agentPanel}
            </div>
          )}

          {agentIsOverlay && (
            <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Trợ lý AI">
              <button type="button" aria-label="Đóng Trợ lý AI" className="fixed inset-0 bg-black/45 backdrop-blur-xs" onClick={() => closeAgent(true)} />
              <div className={`relative z-50 h-full bg-white shadow-2xl ${viewport === 'narrow' || agentMode === 'focus' ? 'w-full' : 'w-[min(460px,92vw)]'}`}>
                {agentPanel}
              </div>
            </div>
          )}
        </div>
      </div>
      <GlobalOverlay commandPaletteOpen={commandPaletteOpen} onCloseCommandPalette={() => setCommandPaletteOpen(false)} />
    </div>
  );
}
