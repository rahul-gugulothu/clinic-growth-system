import { useEffect, useRef, useCallback } from 'react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';

interface ChatWindowProps {
  messages: ChatMessage[];
  onApproveExecution?: (executionId: string) => Promise<void>;
  onRejectExecution?: (executionId: string, reason: string) => Promise<void>;
  onRetryStream?: (messageId: string) => void;
}

export function ChatWindow({ messages, onApproveExecution, onRejectExecution, onRetryStream }: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserNearBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const isNearBottom = useCallback((threshold = 80): boolean => {
    if (!scrollRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    return scrollHeight - scrollTop - clientHeight < threshold;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      isUserNearBottomRef.current = isNearBottom();
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isNearBottom]);

  // Auto-scroll when new messages arrive or streaming messages update
  useEffect(() => {
    if (isUserNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  return (
    <div ref={scrollRef} className="flex flex-col gap-4 overflow-y-auto flex-1 p-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onApproveExecution={onApproveExecution}
          onRejectExecution={onRejectExecution}
          onRetryStream={onRetryStream}
        />
      ))}
    </div>
  );
}