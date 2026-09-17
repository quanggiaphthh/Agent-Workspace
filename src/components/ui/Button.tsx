import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap cursor-pointer';

    const variants = {
      default: 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-sm border border-neutral-900',
      outline: 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100/80',
      secondary: 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200/80 border border-neutral-200',
      ghost: 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm border border-red-600',
      success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm border border-emerald-600',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs rounded-md gap-1.5',
      md: 'h-9 px-4 text-sm rounded-md gap-2',
      lg: 'h-11 px-5 text-base rounded-md gap-2.5',
      icon: 'h-9 w-9 p-0 rounded-md',
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
