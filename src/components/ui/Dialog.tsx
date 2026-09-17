import React from 'react';
import { cn, Button } from './Button';
import { X } from 'lucide-react';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}: DialogProps) {
  if (!open) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div
        className={cn(
          'relative z-50 w-full rounded-lg border border-neutral-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150',
          maxWidths[maxWidth]
        )}
      >
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
            {description && <p className="text-xs text-neutral-500 mt-0.5">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-neutral-400 hover:text-neutral-700">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="py-4">{children}</div>

        {footer && <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">{footer}</div>}
      </div>
    </div>
  );
}
