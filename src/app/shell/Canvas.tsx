import React, { useEffect, useState } from 'react';
import { useContextStore } from '../../core/context/contextStore';
import { Maximize2, RefreshCw } from 'lucide-react';
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
      <div className="shrink-0 px-3 py-1 bg-white border-b border-neutral-200/80 flex items-center justify-end shadow-2xs">
        <div className="flex items-center gap-1">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 relative bg-gradient-to-b from-neutral-50/30 to-neutral-100/50">
        <div className="max-w-7xl mx-auto h-full w-full flex flex-col animate-in fade-in duration-200">
          {isLoadingModule ? <CanvasSkeleton /> : children}
        </div>
      </div>
    </div>
  );
}
