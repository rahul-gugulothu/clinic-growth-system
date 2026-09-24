import { cn } from '@/utils/cn';

interface TypingIndicatorProps {
  className?: string;
}

export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <div className={cn('typewriter-dots inline-flex items-center gap-1', className)}>
      <span className="dot-animate block h-2 w-2 rounded-full bg-muted-foreground" />
      <span className="dot-animate block h-2 w-2 rounded-full bg-muted-foreground" />
      <span className="dot-animate block h-2 w-2 rounded-full bg-muted-foreground" />
    </div>
  );
}
