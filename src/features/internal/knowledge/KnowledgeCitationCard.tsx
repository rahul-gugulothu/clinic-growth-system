import * as React from 'react';
import { FileText, ExternalLink } from 'lucide-react';
import type { KnowledgeCitation } from '../ai/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';

export interface KnowledgeCitationCardProps {
  citation: KnowledgeCitation;
  onClick?: (citation: KnowledgeCitation) => void;
  className?: string;
}

export function KnowledgeCitationCard({
  citation,
  onClick,
  className,
}: KnowledgeCitationCardProps) {
  const matchPercentage = Math.round(citation.similarityScore * 100);

  const handleClick = () => {
    if (onClick) {
      onClick(citation);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onClick) {
      e.preventDefault();
      onClick(citation);
    }
  };

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-testid="knowledge-citation-card"
      aria-label={`Citation: ${citation.documentName}`}
      className={cn(
        'group relative flex flex-col gap-1.5 rounded-lg border border-border/70 bg-card p-3 text-left shadow-sm transition-all',
        onClick && 'cursor-pointer hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-semibold text-foreground">
            {citation.documentName}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            (Chunk #{citation.chunkIndex + 1})
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge tone="info" className="text-[10px] px-1.5 py-0">
            {matchPercentage}% match
          </Badge>
          {onClick && (
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </div>

      <p className="line-clamp-2 text-xs text-muted-foreground italic">
        "{citation.excerpt}"
      </p>
    </div>
  );
}
