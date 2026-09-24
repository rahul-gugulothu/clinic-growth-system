export type KnowledgeDocumentStatus =
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'archived';

export interface KnowledgeDocumentRecord {
  id: string;
  organization_id: string;
  name: string;
  mime_type: string;
  status: KnowledgeDocumentStatus;
  file_size: number;
  chunk_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface KnowledgeChunkRecord {
  id: string;
  document_id: string;
  organization_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  created_at: string;
}

export interface KnowledgeDocumentWithChunks extends KnowledgeDocumentRecord {
  chunks: KnowledgeChunkRecord[];
}

export interface KnowledgeDocumentListResponse {
  documents: KnowledgeDocumentRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export interface KnowledgeDocumentUploadResponse {
  document_id: string;
  status: KnowledgeDocumentStatus;
  chunk_count: number;
}

export interface KnowledgeDocumentDetailResponse {
  document: KnowledgeDocumentWithChunks;
}

export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const isSupportedMimeType = (mimeType: string): mimeType is SupportedMimeType => {
  return SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMimeType);
};

export const CHUNK_TARGET_TOKENS = 650; // Middle of 500-800 range
export const CHUNK_OVERLAP_TOKENS = 35; // Middle of 20-50 range