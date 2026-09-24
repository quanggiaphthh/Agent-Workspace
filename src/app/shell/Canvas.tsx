import React, { useState, useEffect } from 'react';
import { useContextStore } from '../../core/context/contextStore';
import { moduleRegistry } from '../../core/modules/moduleRegistry';
import { Maximize2, RefreshCw, Layers } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { eventBus } from '../../core/events/eventBus';
import { CanvasSkeleton } from './CanvasSkeleton';

interface CanvasProps {
  children?: React.ReactNode;
}

export function Canvas({ children }: CanvasProps) {
  const activeModuleId = useContextStore((state) => state.activeModule);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingModule, setIsLoadingModule] = useState(false);

  const activeModule = moduleRegistry.resolve(activeModuleId || 'home');

  // Trigger skeleton loading state whenever activeModuleId changes
  useEffect(() => {
    setIsLoadingModule(true);
    const timer = setTimeout(() => {
      setIsLoadingModule(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [activeModuleId]);

  const handleRefreshCanvas = () => {
    setIsRefreshing(true);
    setIsLoadingModule(true);
    eventBus.emit('canvas.refreshRequested', { moduleId: activeModuleId });
    setTimeout(() => {
      setIsRefreshing(false);
      setIsLoadingModule(false);
    }, 600);
  };

  return (
    <div
      className={`flex-1 flex flex-col min-w-0 overflow-hidden bg-neutral-50/60 transition-all duration-300 ${
        isMaximized ? 'fixed inset-0 z-40 bg-white p-6' : 'relative'
      }`}
    >
      {/* Canvas Workspace Toolbar */}
      <div className="shrink-0 px-4 py-2 bg-white border-b border-neutral-200/80 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-neutral-900 text-white flex items-center justify-center text-xs font-bold">
            {activeModule?.meta?.icon ? (
              <span className="text-xs">{activeModule.meta.icon.substring(0, 1)}</span>
            ) : (
              <Layers className="h-3.5 w-3.5" />
            )}
          </div>
          <div>
            <div className="text-xs font-bold text-neutral-900 capitalize tracking-tight flex items-center gap-1.5">
              <span>{activeModule?.meta?.name || 'Không gian làm việc'}</span>
            </div>
            <p className="text-[10px] text-neutral-500 truncate max-w-md">
              {activeModule?.meta?.description || 'Nội dung của trang đang mở.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefreshCanvas}
            title="Làm mới nội dung"
            aria-label="Làm mới nội dung"
            className="h-7 w-7 text-neutral-500 hover:text-neutral-900"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? 'Thu nhỏ cửa sổ' : 'Phóng to toàn màn hình'}
            aria-label={isMaximized ? 'Thu nhỏ nội dung' : 'Phóng to nội dung'}
            className="h-7 w-7 text-neutral-500 hover:text-neutral-900"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Canvas Workspace Stage */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 relative bg-gradient-to-b from-neutral-50/30 to-neutral-100/50">
        <div className="max-w-7xl mx-auto h-full w-full flex flex-col animate-in fade-in duration-200">
          {isLoadingModule ? <CanvasSkeleton /> : children}
        </div>
      </div>
    </div>
  );
}
