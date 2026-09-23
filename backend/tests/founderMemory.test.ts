import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import request from 'supertest';
import type { AuthContext } from '../src/types/index.js';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/utils/jwt.js';
import type { ConversationMessageRecord, ConversationRecord } from '../src/types/founderMemory.js';

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_CLINIC_ID = '00000000-0000-0000-0000-000000000020';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';

const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_A_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeaaaa';
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeebbbb';

const founderAuth: AuthContext = {
  userId: DEV_FOUNDER_ID,
  organizationId: DEV_ORG_ID,
  role: 'founder',
  clinicId: null,
};

const userAAuth: AuthContext = {
  userId: USER_A_ID,
  organizationId: DEV_ORG_ID,
  role: 'founder',
  clinicId: null,
};

const userBAuth: AuthContext = {
  userId: USER_B_ID,
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
const userAToken = signAccessToken(userAAuth);
const userBToken = signAccessToken(userBAuth);
const orgBToken = signAccessToken(orgBFoundersAuth);

const expect400 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(400);
  expect(res.body.error.status).toBe(400);
};

const expect401 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(401);
  expect(res.body.error.status).toBe(401);
};

const expect404 = (res: { status: number; body: { error: { status: number } } }) => {
  expect(res.status).toBe(404);
  expect(res.body.error.status).toBe(404);
};

describe('V3.1.3-A Founder AI Conversation Memory', () => {
  let tdb: TestDatabase;
  let memPool: Pool;
  let app: ReturnType<typeof createApp>;

  const query = (sql: string, params?: unknown[]) =>
    params ? memPool.query(sql, params) : memPool.query(sql);

  beforeAll(async () => {
    tdb = createTestDatabase();
    const pgLib = tdb.db.adapters.createPg();
    memPool = new pgLib.Pool();
    setPool(memPool);

    await tdb.public.none(`
      INSERT INTO organizations (id, name, status, timezone, data_source, created_at, updated_at)
      VALUES ('${ORG_B_ID}', 'Org B', 'trial', 'UTC', 'demo', NOW(), NOW())
    `);

    app = createApp();
  });

  afterAll(async () => {
    setPool(null);
    await memPool.end();
  });

  beforeEach(async () => {
    await memPool.query(`DELETE FROM founder_conversation_messages`);
    await memPool.query(`DELETE FROM founder_conversations`);
  });

  // =====================================================================
  // Conversation CRUD
  // =====================================================================
  describe('Conversation CRUD', () => {
    it('create conversation defaults title and returns 201', async () => {
      const res = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.conversation.title).toBe('New Conversation');
      expect(res.body.conversation.organization_id).toBe(DEV_ORG_ID);
      expect(res.body.conversation.user_id).toBe(DEV_FOUNDER_ID);
      expect(res.body.conversation.archived).toBe(false);
    });

    it('create conversation with custom title and clinic_id', async () => {
      const res = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'September Growth Plan', clinic_id: DEV_CLINIC_ID });

      expect(res.status).toBe(201);
      expect(res.body.conversation.title).toBe('September Growth Plan');
      expect(res.body.conversation.clinic_id).toBe(DEV_CLINIC_ID);
    });

    it('list conversations returns the created conversation', async () => {
      await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'List Me' });

      const res = await request(app)
        .get('/api/v1/founder/conversations')
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.conversations).toHaveLength(1);
      expect(res.body.conversations[0].title).toBe('List Me');
      expect(res.body.conversations[0].message_count).toBe(0);
    });

    it('pagination returns the correct slice and total', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/founder/conversations')
          .set(authHeader(founderToken))
          .send({ title: `Conv ${i}` });
      }

      const totalRes = await query(`SELECT COUNT(*)::int AS total FROM founder_conversations`);
      const total = totalRes.rows[0].total;

      const first = await request(app)
        .get('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .query({ limit: 2, offset: 0 });

      expect(first.body.pagination.total).toBe(total);
      expect(first.body.conversations).toHaveLength(2);

      const second = await request(app)
        .get('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .query({ limit: 2, offset: 2 });

      expect(second.body.conversations).toHaveLength(1);
    });

    it('archived filter excludes/inlcudes archived conversations', async () => {
      const active = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'Active' });

      const archived = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'Archivable' });

      await request(app)
        .delete(`/api/v1/founder/conversations/${archived.body.conversation.id}`)
        .set(authHeader(founderToken));

      const allRes = await request(app)
        .get('/api/v1/founder/conversations')
        .set(authHeader(founderToken));
      expect(allRes.body.pagination.total).toBe(2);

      const activeOnly = await request(app)
        .get('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .query({ archived: 'false' });
      expect(activeOnly.body.conversations).toHaveLength(1);
      expect(activeOnly.body.conversations[0].title).toBe('Active');

      const archivedOnly = await request(app)
        .get('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .query({ archived: 'true' });
      expect(archivedOnly.body.conversations).toHaveLength(1);
      expect(archivedOnly.body.conversations[0].title).toBe('Archivable');

      // cleanup reference
      void active;
    });

    it('rename conversation via PATCH', async () => {
      const created = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'Old Name' });

      const res = await request(app)
        .patch(`/api/v1/founder/conversations/${created.body.conversation.id}`)
        .set(authHeader(founderToken))
        .send({ title: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.conversation.title).toBe('New Name');
    });

    it('archive conversation via DELETE (default)', async () => {
      const created = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'To Archive' });

      const res = await request(app)
        .delete(`/api/v1/founder/conversations/${created.body.conversation.id}`)
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      expect(res.body.archived).toBe(true);
      expect(res.body.conversation.archived).toBe(true);

      const listed = await request(app)
        .get('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .query({ archived: 'true' });
      expect(listed.body.conversations).toHaveLength(1);
    });

    it('hard delete conversation via DELETE ?hard=true', async () => {
      const created = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'To Hard Delete' });

      const res = await request(app)
        .delete(`/api/v1/founder/conversations/${created.body.conversation.id}`)
        .set(authHeader(founderToken))
        .query({ hard: 'true' });

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);

      const detail = await request(app)
        .get(`/api/v1/founder/conversations/${created.body.conversation.id}`)
        .set(authHeader(founderToken));
      expect404(detail);
    });
  });

  // =====================================================================
  // Messages
  // =====================================================================
  describe('Messages', () => {
    const createConv = async () => {
      const res = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'Chat' });
      return res.body.conversation.id as string;
    };

    it('add user message returns 201', async () => {
      const convId = await createConv();

      const res = await request(app)
        .post(`/api/v1/founder/conversations/${convId}/messages`)
        .set(authHeader(founderToken))
        .send({ role: 'user', content: 'Hello there' });

      expect(res.status).toBe(201);
      expect(res.body.message.role).toBe('user');
      expect(res.body.message.content).toBe('Hello there');
    });

    it('add assistant message returns 201', async () => {
      const convId = await createConv();

      await request(app)
        .post(`/api/v1/founder/conversations/${convId}/messages`)
        .set(authHeader(founderToken))
        .send({ role: 'user', content: 'Hi' });

      const res = await request(app)
        .post(`/api/v1/founder/conversations/${convId}/messages`)
        .set(authHeader(founderToken))
        .send({ role: 'assistant', content: 'How can I help?' });

      expect(res.status).toBe(201);
      expect(res.body.message.role).toBe('assistant');
    });

    it('add tool message returns 201', async () => {
      const convId = await createConv();

      const res = await request(app)
        .post(`/api/v1/founder/conversations/${convId}/messages`)
        .set(authHeader(founderToken))
        .send({ role: 'tool', content: 'tool result payload' });

      expect(res.status).toBe(201);
      expect(res.body.message.role).toBe('tool');
    });

    it('metadata persists on add message', async () => {
      const convId = await createConv();

      const res = await request(app)
        .post(`/api/v1/founder/conversations/${convId}/messages`)
        .set(authHeader(founderToken))
        .send({
          role: 'assistant',
          content: 'With metadata',
          metadata: { source: 'founder-ai', turn: 3 },
        });

      expect(res.status).toBe(201);
      expect(res.body.message.metadata).toEqual({ source: 'founder-ai', turn: 3 });
    });

    it('tool_execution_id persists on add message', async () => {
      const convId = await createConv();
      const execRes = await query(
        `INSERT INTO ai_tool_executions
           (organization_id, user_id, tool_id, success)
         VALUES ($1, $2, 'priority-clinics', TRUE)
         RETURNING id`,
        [DEV_ORG_ID, DEV_FOUNDER_ID]
      );
      const executionId = execRes.rows[0].id;

      const res = await request(app)
        .post(`/api/v1/founder/conversations/${convId}/messages`)
        .set(authHeader(founderToken))
        .send({
          role: 'tool',
          content: 'Tool call result',
          tool_execution_id: executionId,
        });

      expect(res.status).toBe(201);
      expect(res.body.message.tool_execution_id).toBe(executionId);
    });

    it('messages are returned in ASC order', async () => {
      const convId = await createConv();

      for (const [role, content] of [
        ['system', 's1'],
        ['user', 'u1'],
        ['assistant', 'a1'],
        ['user', 'u2'],
      ] as const) {
        await request(app)
          .post(`/api/v1/founder/conversations/${convId}/messages`)
          .set(authHeader(founderToken))
          .send({ role, content });
      }

      const res = await request(app)
        .get(`/api/v1/founder/conversations/${convId}`)
        .set(authHeader(founderToken));

      expect(res.status).toBe(200);
      const roles = res.body.messages.map((m: ConversationMessageRecord) => m.role);
      expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
      const contents = res.body.messages.map((m: ConversationMessageRecord) => m.content);
      expect(contents).toEqual(['s1', 'u1', 'a1', 'u2']);
    });
  });

  // =====================================================================
  // Authorization
  // =====================================================================
  describe('Authorization', () => {
    it('unauthenticated request → 401', async () => {
      const res = await request(app).get('/api/v1/founder/conversations');
      expect401(res);
    });

    it('organization isolation — cannot access another org conversation', async () => {
      const created = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'Private' });

      const res = await request(app)
        .get(`/api/v1/founder/conversations/${created.body.conversation.id}`)
        .set(authHeader(orgBToken));
      expect404(res);
    });

    it('organization isolation — cannot delete another org conversation', async () => {
      const created = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'Private' });

      const res = await request(app)
        .delete(`/api/v1/founder/conversations/${created.body.conversation.id}`)
        .set(authHeader(orgBToken));
      expect404(res);
    });

    it('user isolation — users do not see each other conversations in list', async () => {
      await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'User A conv' });

      const res = await request(app)
        .get('/api/v1/founder/conversations')
        .set(authHeader(userBToken));

      expect(res.body.pagination.total).toBe(0);
      expect(res.body.conversations).toHaveLength(0);
    });

    it('cannot add message to another org conversation', async () => {
      const created = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'Private' });

      const res = await request(app)
        .post(`/api/v1/founder/conversations/${created.body.conversation.id}/messages`)
        .set(authHeader(orgBToken))
        .send({ role: 'user', content: 'hi' });
      expect404(res);
    });
  });

  // =====================================================================
  // Validation
  // =====================================================================
  describe('Validation', () => {
    it('empty title → 400', async () => {
      const res = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: '' });
      expect400(res);
    });

    it('title too long → 400', async () => {
      const res = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'x'.repeat(121) });
      expect400(res);
    });

    it('empty content → 400', async () => {
      const created = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'Chat' });
      const convId = created.body.conversation.id as string;

      const res = await request(app)
        .post(`/api/v1/founder/conversations/${convId}/messages`)
        .set(authHeader(founderToken))
        .send({ role: 'user', content: '' });
      expect400(res);
    });

    it('invalid role → 400', async () => {
      const created = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'Chat' });
      const convId = created.body.conversation.id as string;

      const res = await request(app)
        .post(`/api/v1/founder/conversations/${convId}/messages`)
        .set(authHeader(founderToken))
        .send({ role: 'narrator', content: 'hi' });
      expect400(res);
    });
  });

  // =====================================================================
  // Cascade
  // =====================================================================
  describe('Cascade', () => {
    it('deleting a conversation deletes its messages', async () => {
      const created = await request(app)
        .post('/api/v1/founder/conversations')
        .set(authHeader(founderToken))
        .send({ title: 'Cascade' });
      const convId = created.body.conversation.id as string;

      await request(app)
        .post(`/api/v1/founder/conversations/${convId}/messages`)
        .set(authHeader(founderToken))
        .send({ role: 'user', content: 'msg one' });

      await request(app)
        .post(`/api/v1/founder/conversations/${convId}/messages`)
        .set(authHeader(founderToken))
        .send({ role: 'assistant', content: 'msg two' });

      const before = await query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM founder_conversation_messages WHERE conversation_id = $1`,
        [convId]
      );
      expect(before.rows[0].count).toBe(2);

      await request(app)
        .delete(`/api/v1/founder/conversations/${convId}`)
        .set(authHeader(founderToken))
        .query({ hard: 'true' });

      const after = await query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM founder_conversation_messages WHERE conversation_id = $1`,
        [convId]
      );
      expect(after.rows[0].count).toBe(0);
    });
  });
});
