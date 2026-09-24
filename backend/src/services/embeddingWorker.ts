import { getClient } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { createEmbeddingClient, EmbeddingError } from './embeddings/client.js';
import type { EmbeddingProvider, KnowledgeChunkEmbeddingRecord } from '../types/embeddings.js';

export interface ProcessEmbeddingsOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface ProcessEmbeddingsResult {
  documentId: string;
  processedCount: number;
  status: 'ready' | 'failed';
  error?: string;
}

interface ChunkRow {
  id: string;
  organization_id: string;
  chunk_index: number;
  content: string;
}

export async function processDocumentEmbeddings(
  documentId: string,
  organizationId?: string,
  options: ProcessEmbeddingsOptions = {}
): Promise<ProcessEmbeddingsResult> {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 0;

  const client = await getClient();

  try {
    // 1. Load chunks for the document
    let query = `
      SELECT id, organization_id, chunk_index, content
      FROM knowledge_chunks
      WHERE document_id = $1
    `;
    const params: unknown[] = [documentId];

    if (organizationId) {
      query += ` AND organization_id = $2`;
      params.push(organizationId);
    }

    query += ` ORDER BY chunk_index ASC`;

    const chunksResult = await client.query<ChunkRow>(query, params);

    if (chunksResult.rowCount === 0) {
      logger.warn({ documentId, organizationId }, 'No chunks found for document embedding processing');
      return {
        documentId,
        processedCount: 0,
        status: 'ready',
      };
    }

    const chunks = chunksResult.rows;
    const docOrgId = organizationId ?? chunks[0].organization_id;

    // 2. Initialize or update embedding records to 'processing'
    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO knowledge_chunk_embeddings
           (organization_id, chunk_id, provider, dimensions, embedding, status)
         VALUES ($1, $2, 'pending', 0, '[]'::jsonb, 'processing')
         ON CONFLICT (chunk_id) DO UPDATE SET
           status = 'processing',
           updated_at = NOW()`,
        [docOrgId, chunk.id]
      );
    }

    // 3. Obtain embedding client for organization
    const embeddingClient = await createEmbeddingClient(docOrgId);

    if (!embeddingClient) {
      const providerStr = process.env.EMBEDDING_PROVIDER || 'mock';
      logger.error(
        { documentId, organizationId: docOrgId, provider: providerStr },
        'Failed to obtain embedding client (API key missing or unsupported provider)'
      );
      for (const chunk of chunks) {
        await client.query(
          `UPDATE knowledge_chunk_embeddings
             SET status = 'failed', provider = $1, updated_at = NOW()
           WHERE chunk_id = $2`,
          [providerStr, chunk.id]
        );
      }
      return {
        documentId,
        processedCount: 0,
        status: 'failed',
        error: 'Embedding client not available',
      };
    }

    const providerName: EmbeddingProvider =
      (process.env.EMBEDDING_PROVIDER as EmbeddingProvider) || 'mock';

    // 4. Generate embeddings with retry loop
    const contents = chunks.map((c) => c.content);
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < maxRetries) {
      attempt++;
      try {
        const response = await embeddingClient.generateEmbeddings({ text: contents });

        // 5. Store vectors and set status to 'ready'
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const vector = response.embeddings[i];

          await client.query(
            `INSERT INTO knowledge_chunk_embeddings
               (organization_id, chunk_id, provider, dimensions, embedding, status)
             VALUES ($1, $2, $3, $4, $5::jsonb, 'ready')
             ON CONFLICT (chunk_id) DO UPDATE SET
               provider = EXCLUDED.provider,
               dimensions = EXCLUDED.dimensions,
               embedding = EXCLUDED.embedding,
               status = 'ready',
               updated_at = NOW()`,
            [docOrgId, chunk.id, providerName, response.dimensions, JSON.stringify(vector)]
          );
        }

        logger.info(
          { documentId, organizationId: docOrgId, chunkCount: chunks.length, provider: providerName },
          'Document embeddings generated and stored successfully'
        );

        return {
          documentId,
          processedCount: chunks.length,
          status: 'ready',
        };
      } catch (err) {
        lastError = err;
        const isRetryable =
          err instanceof EmbeddingError && (err.kind === 'timeout' || err.kind === 'network');

        if (isRetryable && attempt < maxRetries) {
          logger.warn(
            { documentId, attempt, maxRetries, errMessage: (err as Error).message },
            'Retryable error generating embeddings; retrying'
          );
          if (retryDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          }
          continue;
        }

        // Non-retryable or max retries exceeded
        break;
      }
    }

    // Mark status as 'failed' for all chunks of this document
    const errorMsg = lastError instanceof Error ? lastError.message : 'Unknown embedding error';
    logger.error(
      { documentId, organizationId: docOrgId, attempt, err: lastError },
      'Embedding generation failed permanently'
    );

    for (const chunk of chunks) {
      await client.query(
        `UPDATE knowledge_chunk_embeddings
           SET status = 'failed', provider = $1, updated_at = NOW()
         WHERE chunk_id = $2`,
        [providerName, chunk.id]
      );
    }

    return {
      documentId,
      processedCount: 0,
      status: 'failed',
      error: errorMsg,
    };
  } finally {
    client.release();
  }
}

export async function getChunkEmbeddings(
  chunkIds: string[],
  organizationId?: string
): Promise<KnowledgeChunkEmbeddingRecord[]> {
  if (chunkIds.length === 0) return [];

  const client = await getClient();
  try {
    const placeholders = chunkIds.map((_, i) => `$${i + 1}`).join(', ');
    let query = `
      SELECT id, organization_id, chunk_id, provider, dimensions, embedding, status, created_at, updated_at
      FROM knowledge_chunk_embeddings
      WHERE chunk_id IN (${placeholders})
    `;
    const params: unknown[] = [...chunkIds];

    if (organizationId) {
      query += ` AND organization_id = $${chunkIds.length + 1}`;
      params.push(organizationId);
    }

    const result = await client.query<Record<string, unknown>>(query, params);

    return result.rows.map((row) => ({
      id: row.id as string,
      organization_id: row.organization_id as string,
      chunk_id: row.chunk_id as string,
      provider: row.provider as string,
      dimensions: Number(row.dimensions),
      embedding: (typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding) as number[],
      status: row.status as KnowledgeChunkEmbeddingRecord['status'],
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    }));
  } finally {
    client.release();
  }
}
