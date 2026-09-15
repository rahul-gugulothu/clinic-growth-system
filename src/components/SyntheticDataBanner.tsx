import { AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/cn';

export function SyntheticDataBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground',
        className,
      )}
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
      <div>
        <div className="font-medium text-foreground">Demo data — not a real clinic</div>
        <div className="text-xs text-muted-foreground">
          All operational records are synthetic and used solely for prototype demonstration.
        </div>
      </div>
    </div>
  );
}