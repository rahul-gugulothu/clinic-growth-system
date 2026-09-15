import * as React from 'react';
import { cn } from '@/utils/cn';

export const Badge = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement> & { tone?: 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'info' }>(
  ({ className, tone = 'default', ...props }, ref) => {
    const tones: Record<string, string> = {
      default: 'bg-primary/10 text-primary',
      success: 'bg-success/10 text-success',
      warning: 'bg-warning/10 text-warning',
      destructive: 'bg-destructive/10 text-destructive',
      muted: 'bg-muted text-muted-foreground',
      info: 'bg-blue-100 text-blue-700',
    };
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          tones[tone],
          className,
        )}
        {...props}
      />
    );
  },
);
Badge.displayName = 'Badge';