import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';

interface ActiveContextHeaderProps {
  prospectId?: string;
  prospectName?: string;
  auditId?: string;
  onClear: () => void;
}

export function ActiveContextHeader({ prospectId, prospectName, auditId, onClear }: ActiveContextHeaderProps) {
  if (!prospectId && !auditId) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground bg-muted/30 rounded-md">
        <span>No active business context</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-md', 'bg-purple-50 dark:bg-purple-950/30')}>
      <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
        Working with:
      </span>
      {auditId ? (
        <Badge tone="info" className="text-xs">
          Audit: {auditId}
        </Badge>
      ) : prospectId && prospectName ? (
        <Link
          to={`/internal/prospects/${prospectId}`}
          className="text-xs font-medium text-purple-700 hover:underline dark:text-purple-300"
        >
          {prospectName}
        </Link>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        aria-label="Clear active context"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
