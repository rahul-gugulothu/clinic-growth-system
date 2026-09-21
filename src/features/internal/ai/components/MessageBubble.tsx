import { useState } from 'react';
import type { ChatMessage } from '../types';
import { Sparkles, Check, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { ToolResultRenderer } from './results/ToolResultRenderer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface MessageBubbleProps {
  message: ChatMessage;
  onApproveExecution?: (executionId: string) => Promise<void>;
  onRejectExecution?: (executionId: string, reason: string) => Promise<void>;
}

export function MessageBubble({ message, onApproveExecution, onRejectExecution }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasStructuredResult = !isUser && message.toolResult && !message.isLoading;
  const needsApproval =
    message.toolResult?.executionStatus === 'requires_approval' &&
    message.toolResult?.executionId &&
    onApproveExecution &&
    onRejectExecution;

  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isApproving, setIsApproving] = useState(false);

  const handleApprove = async () => {
    if (!message.toolResult?.executionId || !onApproveExecution) return;
    setIsApproving(true);
    try {
      await onApproveExecution(message.toolResult.executionId);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!message.toolResult?.executionId || !onRejectExecution) return;
    if (!rejectReason.trim()) return;
    setIsRejecting(true);
    try {
      await onRejectExecution(message.toolResult.executionId, rejectReason.trim());
      setIsRejecting(false);
      setRejectReason('');
    } finally {
      setIsRejecting(false);
    }
  };

  const StatusBadge = () => {
    if (!message.toolResult?.executionStatus) return null;
    const status = message.toolResult.executionStatus;
    if (status === 'approved') {
      return <Badge tone="success" className="text-xs">Approved</Badge>;
    }
    if (status === 'rejected') {
      return <Badge tone="destructive" className="text-xs">Rejected</Badge>;
    }
    return null;
  };

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
          <div>
            <ToolResultRenderer result={message.toolResult} />
            <StatusBadge />
            {needsApproval && !isRejecting && (
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleApprove} disabled={isApproving}>
                  <Check className="mr-1 h-4 w-4" />
                  {isApproving ? 'Approving...' : 'Approve'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsRejecting(true)} disabled={isApproving}>
                  <X className="mr-1 h-4 w-4" />
                  Reject
                </Button>
              </div>
            )}
            {needsApproval && isRejecting && (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  className="min-h-[60px] text-sm"
                  disabled={isRejecting}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleReject} disabled={isRejecting || !rejectReason.trim()}>
                    {isRejecting ? 'Rejecting...' : 'Confirm Reject'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setIsRejecting(false); setRejectReason(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </div>
    </div>
  );
}
