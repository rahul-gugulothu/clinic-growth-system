import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import {
  cosineSimilarity,
  searchVectorKnowledge,
} from '../src/services/retrieval/vectorSearch.js';
import * as embeddingsClientModule from '../src/services/embeddings/client.js';
import { MockEmbeddingClient } from '../src/services/embeddings/client.js';

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03';

describe('Vector Search & Cosine Similarity', () => {
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
    process.env.EMBEDDING_PROVIDER = 'mock';
    await memPool.query(`DELETE FROM knowledge_chunk_embeddings`);
    await memPool.query(`DELETE FROM knowledge_chunks`);
    await memPool.query(`DELETE FROM knowledge_documents`);
    vi.restoreAllMocks();
  });

  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const vec = [1, 2, 3, 4];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.0);
    });

    it('should return -1.0 for opposite vectors', () => {
      const vecA = [1, 2];
      const vecB = [-1, -2];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1.0);
    });

    it('should return 0 for empty or mismatched vectors', () => {
      expect(cosineSimilarity([], [1, 2])).toBe(0);
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });
  });

  describe('searchVectorKnowledge', () => {
    async function seedVectorDocument(params: {
      orgId?: string;
      userId?: string;
      docName?: string;
      docStatus?: string;
      chunks: Array<{ content: string; embedding?: number[]; status?: string }>;
    }) {
      const orgId = params.orgId ?? DEV_ORG_ID;
      const userId = params.userId ?? DEV_FOUNDER_ID;
      const docName = params.docName ?? 'Test Document.txt';
      const docStatus = params.docStatus ?? 'ready';

      const docRes = await memPool.query<{ id: string }>(
        `INSERT INTO knowledge_documents (organization_id, name, mime_type, status, file_size, created_by)
         VALUES ($1, $2, 'text/plain', $3, 100, $4)
         RETURNING id`,
        [orgId, docName, docStatus, userId]
      );
      const documentId = docRes.rows[0].id;

      const mockClient = new MockEmbeddingClient();
      const createdChunks = [];

      for (let i = 0; i < params.chunks.length; i++) {
        const item = params.chunks[i];
        const chunkRes = await memPool.query<{ id: string }>(
          `INSERT INTO knowledge_chunks (document_id, organization_id, chunk_index, content, token_count)
           VALUES ($1, $2, $3, $4, 10)
           RETURNING id`,
          [documentId, orgId, i, item.content]
        );
        const chunkId = chunkRes.rows[0].id;

        let embVec = item.embedding;
        if (!embVec) {
          const gen = await mockClient.generateEmbeddings({ text: item.content });
          embVec = gen.embeddings[0];
        }

        const embStatus = item.status ?? 'ready';
        await memPool.query(
          `INSERT INTO knowledge_chunk_embeddings
             (organization_id, chunk_id, provider, dimensions, embedding, status)
           VALUES ($1, $2, 'mock', $3, $4::jsonb, $5)`,
          [orgId, chunkId, embVec.length, JSON.stringify(embVec), embStatus]
        );

        createdChunks.push({ chunkId, content: item.content });
      }

      return { documentId, chunks: createdChunks };
    }

    it('should return empty array when queryText is empty', async () => {
      const results = await searchVectorKnowledge({
        organizationId: DEV_ORG_ID,
        queryText: '   ',
      });
      expect(results).toEqual([]);
    });

    it('should rank chunks by cosine similarity descending', async () => {
      const queryVec = new Array(1536).fill(0);
      queryVec[0] = 1;

      const highSimVec = new Array(1536).fill(0);
      highSimVec[0] = 0.9;
      highSimVec[1] = 0.1;

      const lowSimVec = new Array(1536).fill(0);
      lowSimVec[0] = 0.2;
      lowSimVec[1] = 0.8;

      const mockClient = new MockEmbeddingClient();
      vi.spyOn(mockClient, 'generateEmbeddings').mockResolvedValue({
        embeddings: [queryVec],
        dimensions: 1536,
      });
      vi.spyOn(embeddingsClientModule, 'createEmbeddingClient').mockResolvedValue(mockClient);

      await seedVectorDocument({
        chunks: [
          { content: 'Low similarity chunk', embedding: lowSimVec },
          { content: 'High similarity chunk', embedding: highSimVec },
        ],
      });

      const results = await searchVectorKnowledge({
        organizationId: DEV_ORG_ID,
        queryText: 'Test Query',
        similarityThreshold: 0.1,
      });

      expect(results.length).toBe(2);
      expect(results[0].content).toBe('High similarity chunk');
      expect(results[1].content).toBe('Low similarity chunk');
      expect(results[0].similarityScore).toBeGreaterThan(results[1].similarityScore);
    });

    it('should respect topK ordering and limit returned items', async () => {
      await seedVectorDocument({
        chunks: [
          { content: 'Chunk 1 content' },
          { content: 'Chunk 2 content' },
          { content: 'Chunk 3 content' },
        ],
      });

      const results = await searchVectorKnowledge({
        organizationId: DEV_ORG_ID,
        queryText: 'Chunk 1 content',
        topK: 2,
        similarityThreshold: 0.0,
      });

      expect(results.length).toBe(2);
    });

    it('should filter out chunks below similarityThreshold', async () => {
      const vecLow = new Array(1536).fill(0.001);
      await seedVectorDocument({
        chunks: [{ content: 'Below threshold chunk', embedding: vecLow }],
      });

      const results = await searchVectorKnowledge({
        organizationId: DEV_ORG_ID,
        queryText: 'Test Query',
        similarityThreshold: 0.99,
      });

      expect(results.length).toBe(0);
    });

    it('should ignore archived documents', async () => {
      await seedVectorDocument({
        docStatus: 'archived',
        chunks: [{ content: 'Archived doc chunk' }],
      });

      const results = await searchVectorKnowledge({
        organizationId: DEV_ORG_ID,
        queryText: 'Archived doc chunk',
        similarityThreshold: 0.0,
      });

      expect(results.length).toBe(0);
    });

    it('should ignore embeddings with status != ready', async () => {
      await seedVectorDocument({
        chunks: [{ content: 'Pending chunk', status: 'pending' }],
      });

      const results = await searchVectorKnowledge({
        organizationId: DEV_ORG_ID,
        queryText: 'Pending chunk',
        similarityThreshold: 0.0,
      });

      expect(results.length).toBe(0);
    });

    it('should enforce organization isolation during vector search', async () => {
      await seedVectorDocument({
        orgId: DEV_ORG_ID,
        userId: DEV_FOUNDER_ID,
        chunks: [{ content: 'Org A chunk' }],
      });

      await seedVectorDocument({
        orgId: ORG_B_ID,
        userId: USER_B_ID,
        chunks: [{ content: 'Org B chunk' }],
      });

      const resultsA = await searchVectorKnowledge({
        organizationId: DEV_ORG_ID,
        queryText: 'Org A chunk',
        similarityThreshold: 0.0,
      });

      expect(resultsA.length).toBe(1);
      expect(resultsA[0].content).toBe('Org A chunk');

      const resultsB = await searchVectorKnowledge({
        organizationId: ORG_B_ID,
        queryText: 'Org B chunk',
        similarityThreshold: 0.0,
      });

      expect(resultsB.length).toBe(1);
      expect(resultsB[0].content).toBe('Org B chunk');
    });

    it('should return complete metadata on retrieved chunks', async () => {
      const { documentId } = await seedVectorDocument({
        docName: 'Metadata Doc.pdf',
        chunks: [{ content: 'Metadata chunk content' }],
      });

      const results = await searchVectorKnowledge({
        organizationId: DEV_ORG_ID,
        queryText: 'Metadata chunk content',
        similarityThreshold: 0.0,
      });

      expect(results.length).toBe(1);
      expect(results[0].documentId).toBe(documentId);
      expect(results[0].documentName).toBe('Metadata Doc.pdf');
      expect(results[0].chunkIndex).toBe(0);
      expect(typeof results[0].chunkId).toBe('string');
      expect(typeof results[0].similarityScore).toBe('number');
      expect(results[0].content).toBe('Metadata chunk content');
    });
  });
});
