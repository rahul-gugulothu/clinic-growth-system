import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import request from 'supertest';
import type { AuthContext } from '../src/types/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';
import * as chunkingModule from '../src/services/chunking.js';
import * as parserModule from '../src/services/documentParser.js';

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03';

const founderAuth: AuthContext = {
  userId: DEV_FOUNDER_ID,
  organizationId: DEV_ORG_ID,
  role: 'founder',
  clinicId: null,
};

const orgBFoundersAuth: AuthContext = {
  userId: USER_B_ID,
  organizationId: ORG_B_ID,
  role: 'founder',
  clinicId: null,
};

const authHeader = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});

const founderToken = signAccessToken(founderAuth);
const orgBToken = signAccessToken(orgBFoundersAuth);

describe('V3.1.14-A Founder Knowledge Base API', () => {
  let tdb: TestDatabase;
  let memPool: Pool;
  let app: ReturnType<typeof createApp>;

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

    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  beforeEach(async () => {
    await memPool.query(`DELETE FROM knowledge_chunks`);
    await memPool.query(`DELETE FROM knowledge_documents`);
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/founder-knowledge/upload', () => {
    it('should successfully upload and process a valid text file', async () => {
      // Mock processing functions to avoid actual processing overhead in DB tests
      vi.spyOn(parserModule, 'parseDocument').mockResolvedValue({ success: true, text: 'Mock parsed text content' });
      vi.spyOn(chunkingModule, 'createChunks').mockReturnValue([
        { content: 'Chunk 1', tokenCount: 2, chunkIndex: 0 },
        { content: 'Chunk 2', tokenCount: 2, chunkIndex: 1 }
      ]);

      const response = await request(app)
        .post('/api/v1/founder-knowledge/upload')
        .set(authHeader(founderToken))
        .attach('file', Buffer.from('Test document content'), { filename: 'test.txt', contentType: 'text/plain' });

      expect(response.status).toBe(201);
      // processDocumentUpload returns KnowledgeDocumentUploadResponse: { document_id, status, chunk_count }
      expect(response.body).toHaveProperty('document_id');
      expect(response.body.status).toBe('ready');
      expect(response.body.chunk_count).toBe(2);

      const docId = response.body.document_id;

      // Verify chunks were created
      const chunks = await memPool.query(
        'SELECT * FROM knowledge_chunks WHERE document_id = $1 ORDER BY chunk_index ASC',
        [docId]
      );
      expect(chunks.rows.length).toBe(2);
      expect(chunks.rows[0].content).toBe('Chunk 1');
      expect(chunks.rows[1].content).toBe('Chunk 2');
    });

    it('should reject invalid upload with no file', async () => {
      const response = await request(app)
        .post('/api/v1/founder-knowledge/upload')
        .set(authHeader(founderToken));

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/No file uploaded/);
    });

    it('should reject unsupported MIME type', async () => {
      const response = await request(app)
        .post('/api/v1/founder-knowledge/upload')
        .set(authHeader(founderToken))
        .attach('file', Buffer.from('fake exe content'), {
          filename: 'test.exe',
          contentType: 'application/x-msdownload'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch(/Unsupported file type/);
    });

    it('should reject oversized file', async () => {
      // Create a 11MB buffer
      const bigBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
      
      const response = await request(app)
        .post('/api/v1/founder-knowledge/upload')
        .set(authHeader(founderToken))
        .attach('file', bigBuffer, 'big.txt');

      expect(response.status).toBe(500);
    });

    it('should handle processing failure gracefully', async () => {
      vi.spyOn(parserModule, 'parseDocument').mockRejectedValue(new Error('Parse error mock'));

      const response = await request(app)
        .post('/api/v1/founder-knowledge/upload')
        .set(authHeader(founderToken))
        .attach('file', Buffer.from('Bad content'), { filename: 'bad.txt', contentType: 'text/plain' });

      // processDocumentUpload throws before any DB write when parseDocument fails,
      // so the error propagates as a 500 (or BadRequestError → 400).
      expect([400, 500]).toContain(response.status);
    });
  });

  describe('GET /api/v1/founder-knowledge', () => {
    it('should list documents for the organization', async () => {
      // Create test doc
      await memPool.query(`
        INSERT INTO knowledge_documents (id, organization_id, created_by, name, file_size, mime_type, status)
        VALUES (gen_random_uuid(), $1, $2, 'test1.txt', 100, 'text/plain', 'ready')
      `, [DEV_ORG_ID, DEV_FOUNDER_ID]);
      
      await memPool.query(`
        INSERT INTO knowledge_documents (id, organization_id, created_by, name, file_size, mime_type, status)
        VALUES (gen_random_uuid(), $1, $2, 'test2.txt', 200, 'text/plain', 'ready')
      `, [DEV_ORG_ID, DEV_FOUNDER_ID]);

      const response = await request(app)
        .get('/api/v1/founder-knowledge')
        .set(authHeader(founderToken));

      expect(response.status).toBe(200);
      expect(response.body.documents).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });

    it('should isolate documents by organization', async () => {
      // Create doc in org A
      await memPool.query(`
        INSERT INTO knowledge_documents (id, organization_id, created_by, name, file_size, mime_type, status)
        VALUES (gen_random_uuid(), $1, $2, 'orga.txt', 100, 'text/plain', 'ready')
      `, [DEV_ORG_ID, DEV_FOUNDER_ID]);

      // Create doc in org B
      await memPool.query(`
        INSERT INTO knowledge_documents (id, organization_id, created_by, name, file_size, mime_type, status)
        VALUES (gen_random_uuid(), $1, $2, 'orgb.txt', 100, 'text/plain', 'ready')
      `, [ORG_B_ID, USER_B_ID]);

      const responseA = await request(app)
        .get('/api/v1/founder-knowledge')
        .set(authHeader(founderToken));

      expect(responseA.body.documents).toHaveLength(1);
      expect(responseA.body.documents[0].name).toBe('orga.txt');

      const responseB = await request(app)
        .get('/api/v1/founder-knowledge')
        .set(authHeader(orgBToken));

      expect(responseB.body.documents).toHaveLength(1);
      expect(responseB.body.documents[0].name).toBe('orgb.txt');
    });

    it('should exclude archived documents from list', async () => {
      await memPool.query(`
        INSERT INTO knowledge_documents (id, organization_id, created_by, name, file_size, mime_type, status)
        VALUES (gen_random_uuid(), $1, $2, 'active.txt', 100, 'text/plain', 'ready')
      `, [DEV_ORG_ID, DEV_FOUNDER_ID]);

      await memPool.query(`
        INSERT INTO knowledge_documents (id, organization_id, created_by, name, file_size, mime_type, status)
        VALUES (gen_random_uuid(), $1, $2, 'archived.txt', 100, 'text/plain', 'archived')
      `, [DEV_ORG_ID, DEV_FOUNDER_ID]);

      const response = await request(app)
        .get('/api/v1/founder-knowledge')
        .set(authHeader(founderToken));

      expect(response.status).toBe(200);
      expect(response.body.documents).toHaveLength(1);
      expect(response.body.documents[0].name).toBe('active.txt');
    });
  });

  describe('GET /api/v1/founder-knowledge/:id', () => {
    it('should get a document by id', async () => {
      const res = await memPool.query(`
        INSERT INTO knowledge_documents (id, organization_id, created_by, name, file_size, mime_type, status)
        VALUES (gen_random_uuid(), $1, $2, 'specific.txt', 100, 'text/plain', 'ready')
        RETURNING id
      `, [DEV_ORG_ID, DEV_FOUNDER_ID]);
      const docId = res.rows[0].id;

      const response = await request(app)
        .get(`/api/v1/founder-knowledge/${docId}`)
        .set(authHeader(founderToken));

      expect(response.status).toBe(200);
      // GET /:id returns { document: KnowledgeDocumentWithChunks }
      expect(response.body.document.name).toBe('specific.txt');
    });

    it('should return 404 for non-existent document', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/v1/founder-knowledge/${fakeId}`)
        .set(authHeader(founderToken));

      expect(response.status).toBe(404);
    });
    
    it('should return 404 for document from different organization', async () => {
      const res = await memPool.query(`
        INSERT INTO knowledge_documents (id, organization_id, created_by, name, file_size, mime_type, status)
        VALUES (gen_random_uuid(), $1, $2, 'other.txt', 100, 'text/plain', 'ready')
        RETURNING id
      `, [ORG_B_ID, USER_B_ID]);
      const docId = res.rows[0].id;

      const response = await request(app)
        .get(`/api/v1/founder-knowledge/${docId}`)
        .set(authHeader(founderToken)); // wrong org

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/founder-knowledge/:id', () => {
    it('should soft archive a document', async () => {
      const res = await memPool.query(`
        INSERT INTO knowledge_documents (id, organization_id, created_by, name, file_size, mime_type, status)
        VALUES (gen_random_uuid(), $1, $2, 'to_delete.txt', 100, 'text/plain', 'ready')
        RETURNING id
      `, [DEV_ORG_ID, DEV_FOUNDER_ID]);
      const docId = res.rows[0].id;

      const response = await request(app)
        .delete(`/api/v1/founder-knowledge/${docId}`)
        .set(authHeader(founderToken));

      expect(response.status).toBe(200);
      expect(response.body.archived).toBe(true);
      expect(response.body.document.status).toBe('archived');

      // Verify in DB
      const dbDoc = await memPool.query('SELECT status FROM knowledge_documents WHERE id = $1', [docId]);
      expect(dbDoc.rows[0].status).toBe('archived');
    });
  });
});
