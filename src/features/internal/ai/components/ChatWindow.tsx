import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';

interface ChatWindowProps {
  messages: ChatMessage[];
  onApproveExecution?: (executionId: string) => Promise<void>;
  onRejectExecution?: (executionId: string, reason: string) => Promise<void>;
}

export function ChatWindow({ messages, onApproveExecution, onRejectExecution }: ChatWindowProps) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto flex-1 p-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onApproveExecution={onApproveExecution}
          onRejectExecution={onRejectExecution}
        />
      ))}
    </div>
  );
}
