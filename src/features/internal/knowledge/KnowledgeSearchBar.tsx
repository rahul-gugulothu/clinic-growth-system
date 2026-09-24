import * as React from 'react';
import { Search, X, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export interface KnowledgeSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  includeArchived: boolean;
  onIncludeArchivedChange: (includeArchived: boolean) => void;
  onSearch?: () => void;
  onClear?: () => void;
  className?: string;
}

export function KnowledgeSearchBar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  includeArchived,
  onIncludeArchivedChange,
  onSearch,
  onClear,
  className,
}: KnowledgeSearchBarProps) {
  const handleClear = () => {
    onQueryChange('');
    if (onClear) {
      onClear();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      e.preventDefault();
      onSearch();
    }
  };

  return (
    <div
      data-testid="knowledge-search-bar"
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border/80 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search documents and knowledge chunks..."
          aria-label="Search documents"
          data-testid="knowledge-search-input"
          className="pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search query"
            data-testid="knowledge-search-clear"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 min-w-[140px]">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:inline" />
          <Select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            aria-label="Filter by status"
            data-testid="knowledge-status-filter"
            className="h-9 text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="ready">Ready</option>
            <option value="processing">Processing</option>
            <option value="uploading">Uploading</option>
            <option value="failed">Failed</option>
            <option value="archived">Archived</option>
          </Select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => onIncludeArchivedChange(e.target.checked)}
            data-testid="knowledge-archive-toggle"
            className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
          />
          <span>Include Archived</span>
        </label>

        {onSearch && (
          <Button
            size="sm"
            onClick={onSearch}
            data-testid="knowledge-search-button"
            className="h-9 px-3 text-xs"
          >
            Search
          </Button>
        )}
      </div>
    </div>
  );
}
