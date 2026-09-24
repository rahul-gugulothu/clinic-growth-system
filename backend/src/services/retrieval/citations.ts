import type { RetrievedChunk } from './vectorSearch.js';

export interface KnowledgeCitation {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  similarityScore: number;
  excerpt: string;
}

export function createExcerpt(content: string, maxLength = 180): string {
  if (!content) return '';
  const cleaned = content.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + '...';
}

export function buildCitations(chunks: RetrievedChunk[]): KnowledgeCitation[] {
  if (!chunks || chunks.length === 0) return [];

  return chunks.map((chunk) => ({
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    chunkIndex: chunk.chunkIndex,
    similarityScore: Number(chunk.similarityScore.toFixed(4)),
    excerpt: createExcerpt(chunk.content),
  }));
}
