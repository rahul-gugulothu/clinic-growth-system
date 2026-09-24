import * as React from 'react';
import { Loader2, FileText, AlertCircle, Layers } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getToken } from '@/api/client';

export interface KnowledgeChunkPreview {
  id: string;
  chunk_index?: number;
  chunkIndex?: number;
  content: string;
  token_count?: number;
  tokenCount?: number;
}

export interface DocumentPreviewData {
  document: {
    id: string;
    name: string;
    status: string;
    file_type?: string;
    fileType?: string;
    mime_type?: string;
    mimeType?: string;
    file_size_bytes?: number;
    fileSizeBytes?: number;
    file_size?: number;
    fileSize?: number;
    chunk_count: number;
    chunkCount?: number;
    created_at?: string;
    createdAt?: string;
    updated_at?: string;
    updatedAt?: string;
    archived_at?: string | null;
    archivedAt?: string | null;
  };
  previewChunks: KnowledgeChunkPreview[];
}

export interface KnowledgePreviewModalProps {
  documentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewData?: DocumentPreviewData | null;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function KnowledgePreviewModal({
  documentId,
  open,
  onOpenChange,
  previewData: initialPreviewData,
}: KnowledgePreviewModalProps) {
  const [data, setData] = React.useState<DocumentPreviewData | null>(initialPreviewData || null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialPreviewData) {
      setData(initialPreviewData);
      setLoading(false);
      setError(null);
      return;
    }

    if (!open || !documentId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const baseUrl =
      (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE_URL : undefined) ||
      'http://localhost:3001/api/v1';

    const token = getToken();

    fetch(`${baseUrl}/founder-knowledge/${documentId}/preview`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Failed to fetch preview (${res.status})`);
        }
        return res.json();
      })
      .then((json: DocumentPreviewData) => {
        if (isMounted) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (isMounted) {
          setError(err.message || 'An error occurred loading preview');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [open, documentId, initialPreviewData]);

  const doc = data?.document;
  const chunks = data?.previewChunks || [];

  const getStatusTone = (status?: string): 'default' | 'success' | 'warning' | 'destructive' | 'muted' => {
    switch (status) {
      case 'ready':
        return 'success';
      case 'processing':
      case 'uploading':
        return 'warning';
      case 'failed':
        return 'destructive';
      case 'archived':
        return 'muted';
      default:
        return 'default';
    }
  };

  const fileSize = doc?.file_size_bytes ?? doc?.fileSizeBytes ?? doc?.file_size ?? doc?.fileSize ?? 0;
  const chunkTotal = doc?.chunk_count ?? doc?.chunkCount ?? chunks.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="knowledge-preview-modal">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              <DialogTitle className="truncate text-base font-semibold">
                {doc?.name || 'Document Preview'}
              </DialogTitle>
            </div>
            {doc?.status && (
              <Badge tone={getStatusTone(doc.status)} className="capitalize shrink-0">
                {doc.status}
              </Badge>
            )}
          </div>
          <DialogDescription className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
            <span>Size: {formatBytes(fileSize)}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              {chunkTotal} {chunkTotal === 1 ? 'chunk' : 'chunks'}
            </span>
            {doc?.created_at && (
              <>
                <span>•</span>
                <span>Uploaded {new Date(doc.created_at).toLocaleDateString()}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-sm">Loading document preview...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && chunks.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No preview chunks available for this document.
            </div>
          )}

          {!loading && !error && chunks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pb-1">
                <span>First {chunks.length} Chunks</span>
                <span>Showing initial document content</span>
              </div>
              {chunks.map((chunk, idx) => {
                const chunkNum =
                  chunk.chunk_index !== undefined
                    ? chunk.chunk_index + 1
                    : chunk.chunkIndex !== undefined
                      ? chunk.chunkIndex + 1
                      : idx + 1;
                const tokenCount = chunk.token_count ?? chunk.tokenCount;

                return (
                  <div
                    key={chunk.id || idx}
                    data-testid="preview-chunk"
                    className="rounded-md border border-border/80 bg-muted/30 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                      <span>Chunk #{chunkNum}</span>
                      {tokenCount !== undefined && <span>{tokenCount} tokens</span>}
                    </div>
                    <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap font-sans">
                      {chunk.content}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t pt-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
