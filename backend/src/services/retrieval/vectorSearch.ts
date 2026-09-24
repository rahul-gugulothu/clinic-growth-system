import { getClient } from '../../db/index.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { createEmbeddingClient } from '../embeddings/client.js';

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

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface ChunkDbRow {
  chunk_id: string;
  embedding: unknown;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
}

export async function searchVectorKnowledge(
  params: SearchVectorKnowledgeParams
): Promise<RetrievedChunk[]> {
  const {
    organizationId,
    queryText,
    topK = config.rag?.topK ?? 5,
    similarityThreshold = config.rag?.similarityThreshold ?? 0.75,
  } = params;

  if (!queryText || queryText.trim().length === 0) {
    return [];
  }

  const embeddingClient = await createEmbeddingClient(organizationId);
  if (!embeddingClient) {
    logger.warn({ organizationId }, 'No embedding client available for vector search');
    return [];
  }

  let queryVector: number[];
  try {
    const res = await embeddingClient.generateEmbeddings({ text: queryText });
    if (!res.embeddings || res.embeddings.length === 0) {
      return [];
    }
    queryVector = res.embeddings[0];
  } catch (err) {
    logger.error({ err, organizationId }, 'Failed to generate query embedding for vector search');
    return [];
  }

  const client = await getClient();
  try {
    const result = await client.query<ChunkDbRow>(
      `SELECT
         e.chunk_id,
         e.embedding,
         c.document_id,
         d.name AS document_name,
         c.chunk_index,
         c.content
       FROM knowledge_chunk_embeddings e
       JOIN knowledge_chunks c ON e.chunk_id = c.id
       JOIN knowledge_documents d ON c.document_id = d.id
       WHERE e.organization_id = $1
         AND e.status = 'ready'
         AND d.status != 'archived'`,
      [organizationId]
    );

    const scoredChunks: RetrievedChunk[] = [];

    for (const row of result.rows) {
      let vec: number[];
      try {
        vec = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : (row.embedding as number[]);
      } catch {
        continue;
      }

      const score = cosineSimilarity(queryVector, vec);
      if (score >= similarityThreshold) {
        scoredChunks.push({
          documentId: row.document_id,
          documentName: row.document_name,
          chunkId: row.chunk_id,
          chunkIndex: Number(row.chunk_index),
          similarityScore: score,
          content: row.content,
        });
      }
    }

    scoredChunks.sort((a, b) => b.similarityScore - a.similarityScore);

    const topResults = scoredChunks.slice(0, topK);

    logger.info(
      {
        organizationId,
        queryLength: queryText.length,
        candidateCount: result.rowCount,
        matchCount: scoredChunks.length,
        returnedCount: topResults.length,
        topK,
        similarityThreshold,
      },
      'Vector knowledge search completed'
    );

    return topResults;
  } finally {
    client.release();
  }
}
