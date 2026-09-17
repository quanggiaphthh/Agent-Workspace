import React from 'react';
import { cn } from './Button';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  className?: string;
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger' | 'info';
  children?: React.ReactNode;
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors whitespace-nowrap';

  const variants = {
    default: 'bg-neutral-900 text-white',
    secondary: 'bg-neutral-100 text-neutral-800 border border-neutral-200',
    outline: 'border border-neutral-300 text-neutral-700 bg-white',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    info: 'bg-sky-50 text-sky-700 border border-sky-200',
  };

  return (
    <span className={cn(base, variants[variant], className)} {...props}>
      {children}
    </span>
  );
}
