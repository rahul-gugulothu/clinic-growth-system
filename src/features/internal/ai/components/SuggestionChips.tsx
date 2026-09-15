import { cn } from '@/utils/cn';
import { PROMPT_TEMPLATES } from '../utils/promptTemplates';

interface SuggestionChipsProps {
  onSelect: (prompt: string) => void;
}

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROMPT_TEMPLATES.suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          className={cn(
            'rounded-full border bg-background px-3 py-1.5 text-sm',
            'text-muted-foreground transition-colors',
            'hover:border-purple-300 hover:bg-purple-50 hover:text-foreground',
            'dark:hover:border-purple-700 dark:hover:bg-purple-950/30'
          )}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
