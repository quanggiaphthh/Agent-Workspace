import React, { useState, useEffect } from 'react';
import { eventBus } from '../../core/events/eventBus';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from './Button';

export interface ToastMessage {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsub = eventBus.on('notification.show', (toast: Omit<ToastMessage, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastMessage = { ...toast, id, duration: toast.duration || 4000 };
      setToasts(prev => [...prev, newToast]);

      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, newToast.duration);
    });

    return () => unsub();
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {toasts.map(toast => {
        const icons = {
          success: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />,
          error: <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />,
          warning: <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />,
          info: <Info className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />,
        };

        const borders = {
          success: 'border-emerald-200 bg-emerald-50/90 text-emerald-950',
          error: 'border-rose-200 bg-rose-50/90 text-rose-950',
          warning: 'border-amber-200 bg-amber-50/90 text-amber-950',
          info: 'border-sky-200 bg-sky-50/90 text-sky-950',
        };

        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 p-3 rounded-lg border shadow-md text-xs backdrop-blur-xs transition-all animate-in slide-in-from-bottom-2 duration-150',
              borders[toast.type || 'info']
            )}
          >
            {icons[toast.type || 'info']}
            <div className="flex-1 font-medium leading-relaxed">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-neutral-400 hover:text-neutral-700 p-0.5 rounded cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
