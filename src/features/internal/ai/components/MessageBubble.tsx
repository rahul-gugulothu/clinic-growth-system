import type { ChatMessage } from '../types';
import { Sparkles } from 'lucide-react';
import { cn } from '@/utils/cn';
import { ToolResultRenderer } from './results/ToolResultRenderer';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasStructuredResult = !isUser && message.toolResult && !message.isLoading;

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300'
        )}
      >
        {isUser ? (
          <span className="text-sm font-medium">Y</span>
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </div>
      <div
        className={cn(
          'max-w-[80%]',
          isUser
            ? 'rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground'
            : message.isLoading
              ? 'rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground italic'
              : 'rounded-lg bg-purple-50 px-4 py-2 text-sm dark:bg-purple-950/30'
        )}
      >
        {hasStructuredResult && message.toolResult ? (
          <ToolResultRenderer result={message.toolResult} />
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </div>
    </div>
  );
}
