export type EmbeddingProvider = 'mock' | 'openai';

export type EmbeddingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface KnowledgeChunkEmbeddingRecord {
  id: string;
  organization_id: string;
  chunk_id: string;
  provider: string;
  dimensions: number;
  embedding: number[];
  status: EmbeddingStatus;
  created_at: string;
  updated_at: string;
}

export interface EmbeddingRequest {
  text: string | string[];
}

export interface EmbeddingResponse {
  embeddings: number[][];
  dimensions: number;
  inputTokens?: number;
}

export interface EmbeddingClient {
  generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}

export interface SearchVectorKnowledgeParams {
  organizationId: string;
  queryText: string;
  topK?: number;
  similarityThreshold?: number;
}

export interface RetrievedChunk {
  documentId: string;
  documentName: string;
  chunkId: string;
  chunkIndex: number;
  similarityScore: number;
  content: string;
}
