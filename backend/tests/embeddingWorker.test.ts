import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import {
  processDocumentEmbeddings,
  getChunkEmbeddings,
} from '../src/services/embeddingWorker.js';
import * as embeddingsClientModule from '../src/services/embeddings/client.js';
import { EmbeddingError } from '../src/services/embeddings/client.js';

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03';

describe('Embedding Worker Service', () => {
  let tdb: TestDatabase;
  let memPool: Pool;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    memPool = new pgLib.Pool();
    setPool(memPool);

    await tdb.public.none(`
      INSERT INTO organizations (id, name, status, timezone, data_source, created_at, updated_at)
      VALUES ('${ORG_B_ID}', 'Org B', 'trial', 'UTC', 'demo', NOW(), NOW())
    `);

    await tdb.public.none(`
      INSERT INTO users (id, email, role, organization_id, data_source, created_at, updated_at)
      VALUES ('${USER_B_ID}', 'userb@orgb.com', 'founder', '${ORG_B_ID}', 'demo', NOW(), NOW())
    `);
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
    process.env = originalEnv;
  });

  beforeEach(async () => {
    process.env = { ...originalEnv };
    await memPool.query(`DELETE FROM knowledge_chunk_embeddings`);
    await memPool.query(`DELETE FROM knowledge_chunks`);
    await memPool.query(`DELETE FROM knowledge_documents`);
    vi.restoreAllMocks();
  });

  async function seedDocWithChunks(orgId = DEV_ORG_ID, userId = DEV_FOUNDER_ID, chunkCount = 2) {
    const docRes = await memPool.query<{ id: string }>(
      `INSERT INTO knowledge_documents (organization_id, name, mime_type, status, file_size, created_by)
       VALUES ($1, 'Test Doc.txt', 'text/plain', 'ready', 100, $2)
       RETURNING id`,
      [orgId, userId]
    );
    const documentId = docRes.rows[0].id;

    const chunkIds: string[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunkRes = await memPool.query<{ id: string }>(
        `INSERT INTO knowledge_chunks (document_id, organization_id, chunk_index, content, token_count)
         VALUES ($1, $2, $3, $4, 10)
         RETURNING id`,
        [documentId, orgId, i, `Sample content for chunk ${i}`]
      );
      chunkIds.push(chunkRes.rows[0].id);
    }

    return { documentId, chunkIds };
  }

  describe('Worker Success Execution', () => {
    it('should process document embeddings successfully using MockEmbeddingClient', async () => {
      const { documentId, chunkIds } = await seedDocWithChunks(DEV_ORG_ID, DEV_FOUNDER_ID, 2);

      const result = await processDocumentEmbeddings(documentId, DEV_ORG_ID);

      expect(result.status).toBe('ready');
      expect(result.processedCount).toBe(2);

      const embeddings = await getChunkEmbeddings(chunkIds, DEV_ORG_ID);
      expect(embeddings.length).toBe(2);
      expect(embeddings[0].status).toBe('ready');
      expect(embeddings[0].provider).toBe('mock');
      expect(embeddings[0].dimensions).toBe(1536);
      expect(Array.isArray(embeddings[0].embedding)).toBe(true);
      expect(embeddings[0].embedding.length).toBe(1536);
    });

    it('should return 0 processed count for non-existent document or document without chunks', async () => {
      const nonExistentDocId = '00000000-0000-0000-0000-999999999999';
      const result = await processDocumentEmbeddings(nonExistentDocId, DEV_ORG_ID);

      expect(result.status).toBe('ready');
      expect(result.processedCount).toBe(0);
    });

    it('should fetch stored embeddings via getChunkEmbeddings correctly', async () => {
      const { documentId, chunkIds } = await seedDocWithChunks(DEV_ORG_ID, DEV_FOUNDER_ID, 1);
      await processDocumentEmbeddings(documentId, DEV_ORG_ID);

      const embeddings = await getChunkEmbeddings(chunkIds);
      expect(embeddings.length).toBe(1);
      expect(embeddings[0].chunk_id).toBe(chunkIds[0]);
      expect(embeddings[0].organization_id).toBe(DEV_ORG_ID);
    });
  });

  describe('Status Transitions & Failure Handling', () => {
    it('should mark status as failed when createEmbeddingClient returns undefined', async () => {
      const { documentId, chunkIds } = await seedDocWithChunks(DEV_ORG_ID, DEV_FOUNDER_ID, 1);

      vi.spyOn(embeddingsClientModule, 'createEmbeddingClient').mockResolvedValue(undefined);

      const result = await processDocumentEmbeddings(documentId, DEV_ORG_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/Embedding client not available/);

      const embeddings = await getChunkEmbeddings(chunkIds, DEV_ORG_ID);
      expect(embeddings.length).toBe(1);
      expect(embeddings[0].status).toBe('failed');
    });

    it('should transition status from processing to ready on success', async () => {
      const { documentId, chunkIds } = await seedDocWithChunks(DEV_ORG_ID, DEV_FOUNDER_ID, 1);

      const mockClient = new embeddingsClientModule.MockEmbeddingClient();
      vi.spyOn(mockClient, 'generateEmbeddings').mockImplementation(async (_req) => {
        // Inspect DB during execution to check 'processing' status transition
        const inProgress = await getChunkEmbeddings(chunkIds);
        expect(inProgress[0].status).toBe('processing');
        return { embeddings: [[0.1, 0.2]], dimensions: 2, inputTokens: 5 };
      });

      vi.spyOn(embeddingsClientModule, 'createEmbeddingClient').mockResolvedValue(mockClient);

      const result = await processDocumentEmbeddings(documentId, DEV_ORG_ID);
      expect(result.status).toBe('ready');

      const finalEmbeddings = await getChunkEmbeddings(chunkIds);
      expect(finalEmbeddings[0].status).toBe('ready');
      expect(finalEmbeddings[0].dimensions).toBe(2);
    });

    it('should mark status as failed when client throws non-retryable parse_error', async () => {
      const { documentId, chunkIds } = await seedDocWithChunks(DEV_ORG_ID, DEV_FOUNDER_ID, 1);

      const mockClient = new embeddingsClientModule.MockEmbeddingClient();
      vi.spyOn(mockClient, 'generateEmbeddings').mockRejectedValue(
        new EmbeddingError('Malformed response', 'parse_error')
      );
      vi.spyOn(embeddingsClientModule, 'createEmbeddingClient').mockResolvedValue(mockClient);

      const result = await processDocumentEmbeddings(documentId, DEV_ORG_ID);

      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/Malformed response/);

      const embeddings = await getChunkEmbeddings(chunkIds);
      expect(embeddings[0].status).toBe('failed');
    });
  });

  describe('Retry Logic', () => {
    it('should retry on timeout error and succeed if subsequent attempt succeeds', async () => {
      const { documentId, chunkIds } = await seedDocWithChunks(DEV_ORG_ID, DEV_FOUNDER_ID, 1);

      const mockClient = new embeddingsClientModule.MockEmbeddingClient();
      let calls = 0;
      vi.spyOn(mockClient, 'generateEmbeddings').mockImplementation(async () => {
        calls++;
        if (calls === 1) {
          throw new EmbeddingError('Request timeout', 'timeout');
        }
        return { embeddings: [[0.5, 0.6]], dimensions: 2, inputTokens: 10 };
      });
      vi.spyOn(embeddingsClientModule, 'createEmbeddingClient').mockResolvedValue(mockClient);

      const result = await processDocumentEmbeddings(documentId, DEV_ORG_ID, {
        maxRetries: 3,
        retryDelayMs: 1,
      });

      expect(calls).toBe(2);
      expect(result.status).toBe('ready');

      const embeddings = await getChunkEmbeddings(chunkIds);
      expect(embeddings[0].status).toBe('ready');
    });

    it('should retry on network error up to maxRetries and fail if all attempts fail', async () => {
      const { documentId, chunkIds } = await seedDocWithChunks(DEV_ORG_ID, DEV_FOUNDER_ID, 1);

      const mockClient = new embeddingsClientModule.MockEmbeddingClient();
      let calls = 0;
      vi.spyOn(mockClient, 'generateEmbeddings').mockImplementation(async () => {
        calls++;
        throw new EmbeddingError('Network disconnect', 'network');
      });
      vi.spyOn(embeddingsClientModule, 'createEmbeddingClient').mockResolvedValue(mockClient);

      const result = await processDocumentEmbeddings(documentId, DEV_ORG_ID, {
        maxRetries: 3,
        retryDelayMs: 1,
      });

      expect(calls).toBe(3);
      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/Network disconnect/);

      const embeddings = await getChunkEmbeddings(chunkIds);
      expect(embeddings[0].status).toBe('failed');
    });

    it('should not retry on config_error and immediately fail', async () => {
      const { documentId, chunkIds } = await seedDocWithChunks(DEV_ORG_ID, DEV_FOUNDER_ID, 1);

      const mockClient = new embeddingsClientModule.MockEmbeddingClient();
      let calls = 0;
      vi.spyOn(mockClient, 'generateEmbeddings').mockImplementation(async () => {
        calls++;
        throw new EmbeddingError('Invalid API key', 'config_error', 401);
      });
      vi.spyOn(embeddingsClientModule, 'createEmbeddingClient').mockResolvedValue(mockClient);

      const result = await processDocumentEmbeddings(documentId, DEV_ORG_ID, {
        maxRetries: 3,
        retryDelayMs: 1,
      });

      expect(calls).toBe(1); // No retries for config_error
      expect(result.status).toBe('failed');

      const embeddings = await getChunkEmbeddings(chunkIds);
      expect(embeddings[0].status).toBe('failed');
    });
  });

  describe('Organization Isolation', () => {
    it('should enforce organization isolation when processing embeddings', async () => {
      const docA = await seedDocWithChunks(DEV_ORG_ID, DEV_FOUNDER_ID, 1);
      const docB = await seedDocWithChunks(ORG_B_ID, USER_B_ID, 1);

      // Attempting to process Org A document with Org B filter should process 0 chunks
      const result = await processDocumentEmbeddings(docA.documentId, ORG_B_ID);
      expect(result.processedCount).toBe(0);

      // Org A chunk embedding should still not exist
      const embeddingsA = await getChunkEmbeddings(docA.chunkIds);
      expect(embeddingsA.length).toBe(0);

      // Processing Org B document with Org B filter should succeed
      const resultB = await processDocumentEmbeddings(docB.documentId, ORG_B_ID);
      expect(resultB.processedCount).toBe(1);

      // Verify Org B embeddings are isolated
      const embeddingsB = await getChunkEmbeddings(docB.chunkIds, ORG_B_ID);
      expect(embeddingsB.length).toBe(1);
      expect(embeddingsB[0].organization_id).toBe(ORG_B_ID);

      // Querying Org B chunk embeddings with Org A organizationId filter returns empty array
      const emptyForOrgA = await getChunkEmbeddings(docB.chunkIds, DEV_ORG_ID);
      expect(emptyForOrgA.length).toBe(0);
    });

    it('should set correct organization_id on inserted knowledge_chunk_embeddings rows', async () => {
      const { documentId, chunkIds } = await seedDocWithChunks(ORG_B_ID, USER_B_ID, 2);
      await processDocumentEmbeddings(documentId, ORG_B_ID);

      const embeddings = await getChunkEmbeddings(chunkIds, ORG_B_ID);
      expect(embeddings.length).toBe(2);
      expect(embeddings[0].organization_id).toBe(ORG_B_ID);
      expect(embeddings[1].organization_id).toBe(ORG_B_ID);
    });
  });
});
