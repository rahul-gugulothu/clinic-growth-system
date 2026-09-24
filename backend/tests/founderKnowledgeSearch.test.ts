import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import request from 'supertest';
import type { AuthContext } from '../src/types/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';

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

const orgBAuth: AuthContext = {
  userId: USER_B_ID,
  organizationId: ORG_B_ID,
  role: 'founder',
  clinicId: null,
};

const authHeader = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});

const founderToken = signAccessToken(founderAuth);
const orgBToken = signAccessToken(orgBAuth);

describe('Founder Knowledge Base Search & Preview Endpoints', () => {
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
    await memPool.query(`DELETE FROM knowledge_chunk_embeddings`);
    await memPool.query(`DELETE FROM knowledge_chunks`);
    await memPool.query(`DELETE FROM knowledge_documents`);
    vi.restoreAllMocks();
  });

  async function seedDocument(params: {
    orgId?: string;
    name: string;
    status?: string;
    chunks?: string[];
  }) {
    const orgId = params.orgId ?? DEV_ORG_ID;
    const status = params.status ?? 'ready';
    const chunks = params.chunks ?? ['Default chunk content'];

    const docRes = await memPool.query<{ id: string }>(
      `INSERT INTO knowledge_documents (organization_id, name, mime_type, status, file_size, chunk_count, created_by)
       VALUES ($1, $2, 'text/plain', $3, 100, $4, $5)
       RETURNING id`,
      [orgId, params.name, status, chunks.length, DEV_FOUNDER_ID]
    );
    const documentId = docRes.rows[0].id;

    for (let i = 0; i < chunks.length; i++) {
      await memPool.query(
        `INSERT INTO knowledge_chunks (document_id, organization_id, chunk_index, content, token_count)
         VALUES ($1, $2, $3, $4, 15)`,
        [documentId, orgId, i, chunks[i]]
      );
    }

    return documentId;
  }

  describe('GET /api/v1/founder-knowledge/search', () => {
    it('should search documents by document name ILIKE', async () => {
      await seedDocument({ name: 'Dental Operations Guide.pdf' });
      await seedDocument({ name: 'Patient Followup Script.docx' });

      const response = await request(app)
        .get('/api/v1/founder-knowledge/search?q=Operations')
        .set(authHeader(founderToken));

      expect(response.status).toBe(200);
      expect(response.body.documents.length).toBe(1);
      expect(response.body.documents[0].name).toBe('Dental Operations Guide.pdf');
    });

    it('should search documents by chunk content ILIKE', async () => {
      await seedDocument({
        name: 'Staff Handbook.pdf',
        chunks: ['Special protocol for receptionist phone calls'],
      });
      await seedDocument({
        name: 'Financial Audit.pdf',
        chunks: ['Quarterly revenue breakdown'],
      });

      const response = await request(app)
        .get('/api/v1/founder-knowledge/search?q=receptionist')
        .set(authHeader(founderToken));

      expect(response.status).toBe(200);
      expect(response.body.documents.length).toBe(1);
      expect(response.body.documents[0].name).toBe('Staff Handbook.pdf');
    });

    it('should filter search results by status', async () => {
      await seedDocument({ name: 'Doc Ready.pdf', status: 'ready' });
      await seedDocument({ name: 'Doc Uploading.pdf', status: 'uploading' });

      const response = await request(app)
        .get('/api/v1/founder-knowledge/search?status=ready')
        .set(authHeader(founderToken));

      expect(response.status).toBe(200);
      expect(response.body.documents.length).toBe(1);
      expect(response.body.documents[0].name).toBe('Doc Ready.pdf');
    });

    it('should exclude archived documents by default', async () => {
      await seedDocument({ name: 'Active Doc.pdf', status: 'ready' });
      await seedDocument({ name: 'Archived Doc.pdf', status: 'archived' });

      const response = await request(app)
        .get('/api/v1/founder-knowledge/search?q=Doc')
        .set(authHeader(founderToken));

      expect(response.status).toBe(200);
      expect(response.body.documents.length).toBe(1);
      expect(response.body.documents[0].name).toBe('Active Doc.pdf');
    });

    it('should include archived documents when includeArchived=true', async () => {
      await seedDocument({ name: 'Active Doc.pdf', status: 'ready' });
      await seedDocument({ name: 'Archived Doc.pdf', status: 'archived' });

      const response = await request(app)
        .get('/api/v1/founder-knowledge/search?q=Doc&includeArchived=true')
        .set(authHeader(founderToken));

      expect(response.status).toBe(200);
      expect(response.body.documents.length).toBe(2);
    });

    it('should enforce organization isolation in search endpoint', async () => {
      await seedDocument({ orgId: DEV_ORG_ID, name: 'Org A Confidential Document.pdf' });
      await seedDocument({ orgId: ORG_B_ID, name: 'Org B Document.pdf' });

      const responseA = await request(app)
        .get('/api/v1/founder-knowledge/search?q=Document')
        .set(authHeader(founderToken));

      expect(responseA.status).toBe(200);
      expect(responseA.body.documents.length).toBe(1);
      expect(responseA.body.documents[0].name).toBe('Org A Confidential Document.pdf');

      const responseB = await request(app)
        .get('/api/v1/founder-knowledge/search?q=Document')
        .set(authHeader(orgBToken));

      expect(responseB.status).toBe(200);
      expect(responseB.body.documents.length).toBe(1);
      expect(responseB.body.documents[0].name).toBe('Org B Document.pdf');
    });
  });

  describe('GET /api/v1/founder-knowledge/:id/preview', () => {
    it('should return document metadata and first 5 preview chunks', async () => {
      const chunkContents = [
        'Chunk 0 content',
        'Chunk 1 content',
        'Chunk 2 content',
        'Chunk 3 content',
        'Chunk 4 content',
        'Chunk 5 content',
      ];
      const docId = await seedDocument({
        name: 'Multi Chunk Document.pdf',
        chunks: chunkContents,
      });

      const response = await request(app)
        .get(`/api/v1/founder-knowledge/${docId}/preview`)
        .set(authHeader(founderToken));

      expect(response.status).toBe(200);
      expect(response.body.document.id).toBe(docId);
      expect(response.body.document.name).toBe('Multi Chunk Document.pdf');
      expect(response.body.previewChunks.length).toBe(5);
      expect(response.body.previewChunks[0].content).toBe('Chunk 0 content');
      expect(response.body.previewChunks[4].content).toBe('Chunk 4 content');
    });

    it('should return 404 for non-existent document ID', async () => {
      const fakeId = '00000000-0000-0000-0000-999999999999';
      const response = await request(app)
        .get(`/api/v1/founder-knowledge/${fakeId}/preview`)
        .set(authHeader(founderToken));

      expect(response.status).toBe(404);
    });

    it('should enforce organization isolation for preview endpoint', async () => {
      const docId = await seedDocument({ orgId: DEV_ORG_ID, name: 'Org A Secret.pdf' });

      const response = await request(app)
        .get(`/api/v1/founder-knowledge/${docId}/preview`)
        .set(authHeader(orgBToken));

      expect(response.status).toBe(404);
    });
  });
});
