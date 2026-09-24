import * as React from 'react';
import {
  FileText,
  Layers,
  Eye,
  Loader2,
  FolderOpen,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { KnowledgeSearchBar } from './KnowledgeSearchBar';
import { KnowledgePreviewModal } from './KnowledgePreviewModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { getToken } from '@/api/client';

export interface KnowledgeDocument {
  id: string;
  name: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed' | 'archived';
  mimeType?: string;
  fileType?: string;
  fileSize?: number;
  fileSizeBytes?: number;
  chunkCount: number;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string | null;
}

export interface KnowledgeBasePageProps {
  initialDocuments?: KnowledgeDocument[];
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function KnowledgeBasePage({ initialDocuments }: KnowledgeBasePageProps) {
  const [documents, setDocuments] = React.useState<KnowledgeDocument[]>(initialDocuments || []);
  const [loading, setLoading] = React.useState(!initialDocuments);
  const [error, setError] = React.useState<string | null>(null);

  // Search & filter state
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [includeArchived, setIncludeArchived] = React.useState(false);

  // Preview modal state
  const [previewDocId, setPreviewDocId] = React.useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);

  const fetchDocuments = React.useCallback(async () => {
    if (initialDocuments) return;

    setLoading(true);
    setError(null);

    const baseUrl =
      (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE_URL : undefined) ||
      'http://localhost:3001/api/v1';

    const token = getToken();

    const params = new URLSearchParams();
    if (query.trim()) params.append('q', query.trim());
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (includeArchived) params.append('includeArchived', 'true');

    try {
      const res = await fetch(`${baseUrl}/founder-knowledge/search?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load knowledge documents (${res.status})`);
      }

      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred fetching documents');
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter, includeArchived, initialDocuments]);

  React.useEffect(() => {
    if (!initialDocuments) {
      fetchDocuments();
    }
  }, [fetchDocuments, initialDocuments]);

  // When initialDocuments is provided (e.g. In unit tests), apply filters in-memory
  const displayedDocuments = React.useMemo(() => {
    if (!initialDocuments) return documents;

    return initialDocuments.filter((doc) => {
      // Archive filter
      if (!includeArchived && doc.status === 'archived') {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all' && doc.status !== statusFilter) {
        return false;
      }
      // Search query
      if (query.trim()) {
        const q = query.toLowerCase();
        return doc.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [initialDocuments, documents, query, statusFilter, includeArchived]);

  const handleOpenPreview = (docId: string) => {
    setPreviewDocId(docId);
    setIsPreviewOpen(true);
  };

  const getStatusBadge = (status: KnowledgeDocument['status']) => {
    switch (status) {
      case 'ready':
        return <Badge tone="success" className="capitalize">Ready</Badge>;
      case 'processing':
        return <Badge tone="warning" className="capitalize">Processing</Badge>;
      case 'uploading':
        return <Badge tone="warning" className="capitalize">Uploading</Badge>;
      case 'failed':
        return <Badge tone="destructive" className="capitalize">Failed</Badge>;
      case 'archived':
        return <Badge tone="muted" className="capitalize">Archived</Badge>;
      default:
        return <Badge tone="default" className="capitalize">{status}</Badge>;
    }
  };

  const totalChunks = displayedDocuments.reduce((sum, d) => sum + (d.chunkCount || 0), 0);
  const readyCount = displayedDocuments.filter((d) => d.status === 'ready').length;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto" data-testid="knowledge-base-page">
      {/* Page Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Founder Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground">
            Central repository of clinic procedures, playbooks, and knowledge documents retrieved by Founder AI.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Documents
            </CardTitle>
            <FolderOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-total-docs">
              {displayedDocuments.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Available in library</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Ready for AI Search
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success" data-testid="metric-ready-docs">
              {readyCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Indexed with embeddings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Indexed Chunks
            </CardTitle>
            <Layers className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-total-chunks">
              {totalChunks}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Retrieval segments</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <KnowledgeSearchBar
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        includeArchived={includeArchived}
        onIncludeArchivedChange={setIncludeArchived}
        onSearch={fetchDocuments}
        onClear={() => {
          setQuery('');
          if (!initialDocuments) fetchDocuments();
        }}
      />

      {/* Document List / Table */}
      <div className="rounded-lg border border-border/80 bg-card shadow-sm overflow-hidden">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="text-sm">Loading knowledge documents...</span>
          </div>
        )}

        {error && !loading && (
          <div className="p-8 text-center space-y-2">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm text-destructive font-medium">{error}</p>
            <Button size="sm" variant="outline" onClick={fetchDocuments}>
              Try Again
            </Button>
          </div>
        )}

        {!loading && !error && displayedDocuments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
            <FolderOpen className="h-10 w-10 text-muted-foreground/60" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">No documents found</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                {query || statusFilter !== 'all' || !includeArchived
                  ? 'No documents match your active search or filter criteria. Try adjusting your filters.'
                  : 'No knowledge documents have been uploaded yet.'}
              </p>
            </div>
            {(query || statusFilter !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('all');
                }}
              >
                Reset Filters
              </Button>
            )}
          </div>
        )}

        {!loading && !error && displayedDocuments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="knowledge-documents-table">
              <thead className="bg-muted/50 border-b text-xs text-muted-foreground uppercase font-medium">
                <tr>
                  <th className="py-3 px-4">Document</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Chunks</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayedDocuments.map((doc) => {
                  const size = doc.fileSize ?? doc.fileSizeBytes;
                  return (
                    <tr
                      key={doc.id}
                      data-testid={`document-row-${doc.id}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate max-w-xs sm:max-w-md">
                              {doc.name}
                            </p>
                            {size !== undefined && (
                              <span className="text-[11px] text-muted-foreground">
                                {formatFileSize(size)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(doc.status)}</td>
                      <td className="py-3 px-4">
                        <span
                          data-testid={`chunk-count-${doc.id}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground font-mono"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          {doc.chunkCount}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`preview-button-${doc.id}`}
                          onClick={() => handleOpenPreview(doc.id)}
                          className="h-8 px-2.5 text-xs flex items-center gap-1.5 ml-auto"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Preview</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Document Preview Modal */}
      <KnowledgePreviewModal
        documentId={previewDocId}
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
      />
    </div>
  );
}
