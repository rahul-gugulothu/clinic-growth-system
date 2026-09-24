import { useState } from 'react';
import type { ChatMessage, KnowledgeCitation } from '../types';
import { Sparkles, Check, X, Wrench, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { ToolResultRenderer } from './results/ToolResultRenderer';
import { TypingIndicator } from './TypingIndicator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { KnowledgeCitationCard } from '../../knowledge/KnowledgeCitationCard';
import { KnowledgePreviewModal } from '../../knowledge/KnowledgePreviewModal';

interface MessageBubbleProps {
  message: ChatMessage;
  onApproveExecution?: (executionId: string) => Promise<void>;
  onRejectExecution?: (executionId: string, reason: string) => Promise<void>;
  onRetryStream?: (messageId: string) => void;
  onCitationClick?: (citation: KnowledgeCitation) => void;
}

export function MessageBubble({
  message,
  onApproveExecution,
  onRejectExecution,
  onRetryStream,
  onCitationClick,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const isSystem = message.role === 'system';

  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  if (isSystem) return null;

  const hasStructuredResult = !isUser && !isTool && message.toolResult && !message.isLoading;
  const needsApproval =
    message.toolResult?.executionStatus === 'requires_approval' &&
    message.toolResult?.executionId &&
    onApproveExecution &&
    onRejectExecution;

  const isStreaming = message.isStreaming === true;
  const streamingStatus = message.streamingStatus;

  // Citations are shown below assistant messages once streaming is complete (or for static messages)
  const showCitations =
    !isUser &&
    !isTool &&
    !isStreaming &&
    message.citations &&
    message.citations.length > 0;

  const handleCitationClick = (citation: KnowledgeCitation) => {
    setPreviewDocId(citation.documentId);
    setIsPreviewOpen(true);
    if (onCitationClick) {
      onCitationClick(citation);
    }
  };

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
    if (status === 'requires_approval') {
      return <Badge tone="muted" className="text-xs">Awaiting Review</Badge>;
    }
    return null;
  };

  const StreamingStatusBadge = () => {
    if (!isStreaming && streamingStatus !== 'complete' && streamingStatus !== 'cancelled' && streamingStatus !== 'error') {
      return null;
    }
    if (streamingStatus === 'cancelled') {
      return (
        <Badge tone="muted" className="text-xs flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Cancelled
        </Badge>
      );
    }
    if (streamingStatus === 'error') {
      return (
        <Badge tone="destructive" className="text-xs flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      );
    }
    if (isStreaming) {
      return (
        <Badge tone="muted" className="text-xs flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Streaming
        </Badge>
      );
    }
    return null;
  };

  const handleRetry = () => {
    if (onRetryStream && (streamingStatus === 'cancelled' || streamingStatus === 'error')) {
      onRetryStream(message.id);
    }
  };

  return (
    <>
      <div
        className={cn(
          'flex gap-3',
          isUser ? 'flex-row-reverse' : 'flex-row',
          isTool ? 'ml-8' : '',
        )}
      >
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isUser ? 'bg-primary text-primary-foreground' :
            isTool ? 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300' :
            'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300'
          )}
        >
          {isUser ? (
            <span className="text-sm font-medium">Y</span>
          ) : isTool ? (
            <Wrench className="h-4 w-4" />
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
                : isTool
                  ? 'rounded-md bg-orange-50 px-3 py-1.5 text-xs dark:bg-orange-950/30'
                  : 'rounded-lg bg-purple-50 px-4 py-2 text-sm dark:bg-purple-950/30'
          )}
        >
          {isTool ? (
            <div className="flex items-center gap-2">
              <span className="font-medium text-orange-700 dark:text-orange-300">Tool</span>
              <span className="text-orange-600 dark:text-orange-400">{message.content}</span>
              {message.toolResult && (
                <Badge tone="muted" className="text-xs">
                  {message.toolResult.executionStatus || 'completed'}
                </Badge>
              )}
            </div>
          ) : hasStructuredResult && message.toolResult ? (
            <div>
              <ToolResultRenderer result={message.toolResult} />
              <StatusBadge />
              <StreamingStatusBadge />
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
          ) : message.isLoading && message.content === '' ? (
            <div className="flex items-center gap-2">
              <TypingIndicator />
              <span>Thinking...</span>
            </div>
          ) : isStreaming ? (
            <div className="flex items-center gap-2">
              <div className="whitespace-pre-wrap">{message.content}<span className="inline-block w-1 h-4 bg-current animate-pulse ml-0.5" /></div>
              <StreamingStatusBadge />
            </div>
          ) : streamingStatus === 'cancelled' ? (
            <div className="flex items-center gap-2">
              <div className="whitespace-pre-wrap">{message.content}</div>
              <StreamingStatusBadge />
              <Button variant="ghost" size="sm" onClick={handleRetry} className="ml-2">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : streamingStatus === 'error' ? (
            <div className="flex items-center gap-2">
              <div className="whitespace-pre-wrap text-destructive">{message.content}</div>
              <StreamingStatusBadge />
              <Button variant="ghost" size="sm" onClick={handleRetry} className="ml-2">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )}

          {/* Knowledge Citations */}
          {showCitations && message.citations && (
            <div className="mt-3 space-y-1.5 border-t border-purple-200/60 dark:border-purple-800/60 pt-2.5" data-testid="message-citations">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Sources ({message.citations.length})
              </div>
              <div className="flex flex-col gap-1.5">
                {message.citations.map((citation, index) => (
                  <KnowledgeCitationCard
                    key={`${citation.documentId}-${citation.chunkIndex}-${index}`}
                    citation={citation}
                    onClick={handleCitationClick}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal for Citation Click */}
      <KnowledgePreviewModal
        documentId={previewDocId}
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
      />
    </>
  );
}