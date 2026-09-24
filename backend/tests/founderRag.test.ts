import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, type TestDatabase } from './helpers.js';
import { setPool } from '../src/db/index.js';
import {
  createConversation,
  addMessage,
  buildFounderPromptContext,
} from '../src/services/founderMemory.js';
import { MockLLMClient } from '../src/services/llm/client.js';
import { MockEmbeddingClient } from '../src/services/embeddings/client.js';

const DEV_ORG_ID = '00000000-0000-0000-0000-000000000001';
const DEV_FOUNDER_ID = '00000000-0000-0000-0000-000000000002';
const ORG_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee03';

describe('Founder AI RAG Integration', () => {
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
    await memPool.query(`DELETE FROM founder_conversation_messages`);
    await memPool.query(`DELETE FROM founder_conversations`);
    vi.restoreAllMocks();
  });

  async function seedDocWithVector(params: {
    orgId?: string;
    userId?: string;
    docName?: string;
    docStatus?: string;
    content: string;
    embedding?: number[];
  }) {
    const orgId = params.orgId ?? DEV_ORG_ID;
    const userId = params.userId ?? DEV_FOUNDER_ID;
    const docName = params.docName ?? 'Standard Operating Procedure.pdf';
    const docStatus = params.docStatus ?? 'ready';

    let vec = params.embedding;
    if (!vec) {
      const mockClient = new MockEmbeddingClient();
      const res = await mockClient.generateEmbeddings({ text: params.content });
      vec = res.embeddings[0];
    }

    const docRes = await memPool.query<{ id: string }>(
      `INSERT INTO knowledge_documents (organization_id, name, mime_type, status, file_size, created_by)
       VALUES ($1, $2, 'application/pdf', $3, 500, $4)
       RETURNING id`,
      [orgId, docName, docStatus, userId]
    );
    const documentId = docRes.rows[0].id;

    const chunkRes = await memPool.query<{ id: string }>(
      `INSERT INTO knowledge_chunks (document_id, organization_id, chunk_index, content, token_count)
       VALUES ($1, $2, 0, $3, 20)
       RETURNING id`,
      [documentId, orgId, params.content]
    );
    const chunkId = chunkRes.rows[0].id;

    await memPool.query(
      `INSERT INTO knowledge_chunk_embeddings
         (organization_id, chunk_id, provider, dimensions, embedding, status)
       VALUES ($1, $2, 'mock', $3, $4::jsonb, 'ready')`,
      [orgId, chunkId, vec.length, JSON.stringify(vec)]
    );

    return { documentId, chunkId };
  }

  it('should retrieve knowledge chunks and attach context when building Founder prompt context', async () => {
    await seedDocWithVector({
      content: 'Receptionist must call lead within 5 minutes of form submission.',
    });

    const conv = await createConversation({
      organizationId: DEV_ORG_ID,
      userId: DEV_FOUNDER_ID,
    });

    const promptContext = await buildFounderPromptContext(
      conv.id,
      DEV_ORG_ID,
      DEV_FOUNDER_ID,
      'You are Founder AI executive assistant.',
      'Receptionist must call lead within 5 minutes of form submission.'
    );

    expect(promptContext.systemPrompt).toContain('You are Founder AI executive assistant.');
    expect(promptContext.systemPrompt).toContain('Context Information from Founder Knowledge Base:');
    expect(promptContext.systemPrompt).toContain('Receptionist must call lead within 5 minutes');
    expect(promptContext.retrievedChunks).toBeDefined();
    expect(promptContext.retrievedChunks?.length).toBe(1);
    expect(promptContext.messages[promptContext.messages.length - 1].content).toBe(
      'Receptionist must call lead within 5 minutes of form submission.'
    );
  });

  it('should fall back to conversation memory only when no matching knowledge chunks exist', async () => {
    const conv = await createConversation({
      organizationId: DEV_ORG_ID,
      userId: DEV_FOUNDER_ID,
    });

    await addMessage({
      conversationId: conv.id,
      organizationId: DEV_ORG_ID,
      role: 'user',
      content: 'What is our Q3 target?',
    });

    const promptContext = await buildFounderPromptContext(
      conv.id,
      DEV_ORG_ID,
      DEV_FOUNDER_ID,
      'You are Founder AI.',
      'What is our Q3 target?'
    );

    expect(promptContext.systemPrompt).toBe('You are Founder AI.');
    expect(promptContext.systemPrompt).not.toContain('Context Information');
    expect(promptContext.retrievedChunks).toEqual([]);
    expect(promptContext.messages.length).toBeGreaterThan(0);
  });

  it('should support streaming path using retrieved prompt context', async () => {
    await seedDocWithVector({
      content: 'Always offer same-day appointments for emergency dental consultations.',
    });

    const conv = await createConversation({
      organizationId: DEV_ORG_ID,
      userId: DEV_FOUNDER_ID,
    });

    const userMsg = 'Always offer same-day appointments for emergency dental consultations.';
    const promptContext = await buildFounderPromptContext(
      conv.id,
      DEV_ORG_ID,
      DEV_FOUNDER_ID,
      'You are Founder AI.',
      userMsg
    );

    const llmClient = new MockLLMClient();
    const chunks: string[] = [];

    for await (const chunk of llmClient.generateCompletionStream!({
      prompt: promptContext.messages[promptContext.messages.length - 1].content,
      systemPrompt: promptContext.systemPrompt,
      messages: promptContext.messages.map((m) => ({ role: m.role, content: m.content })),
    })) {
      chunks.push(chunk.content);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(promptContext.systemPrompt).toContain('emergency dental consultations');
  });

  it('should enforce organization isolation in founder RAG', async () => {
    await seedDocWithVector({
      orgId: DEV_ORG_ID,
      userId: DEV_FOUNDER_ID,
      content: 'Org A Confidential Strategy Document',
    });

    const convB = await createConversation({
      organizationId: ORG_B_ID,
      userId: USER_B_ID,
    });

    const promptContextB = await buildFounderPromptContext(
      convB.id,
      ORG_B_ID,
      USER_B_ID,
      'You are Founder AI.',
      'What is our strategy?'
    );

    expect(promptContextB.systemPrompt).not.toContain('Org A Confidential Strategy Document');
    expect(promptContextB.retrievedChunks).toEqual([]);
  });

  it('should rank multiple documents correctly by vector relevance', async () => {
    await seedDocWithVector({
      docName: 'Policy A.pdf',
      content: 'Policy A content snippet for reception booking',
    });

    await seedDocWithVector({
      docName: 'Policy B.pdf',
      content: 'Policy B content snippet for reception booking',
    });

    const conv = await createConversation({
      organizationId: DEV_ORG_ID,
      userId: DEV_FOUNDER_ID,
    });

    const promptContext = await buildFounderPromptContext(
      conv.id,
      DEV_ORG_ID,
      DEV_FOUNDER_ID,
      'System prompt',
      'Policy A content snippet for reception booking'
    );

    expect(promptContext.retrievedChunks).toBeDefined();
    expect(promptContext.retrievedChunks?.length).toBeGreaterThan(0);
    expect(promptContext.systemPrompt).toContain('Policy A.pdf');
  });

  it('should ignore archived documents during founder RAG retrieval', async () => {
    await seedDocWithVector({
      docName: 'Archived Policy.pdf',
      docStatus: 'archived',
      content: 'Archived obsolete content for reception booking',
    });

    const conv = await createConversation({
      organizationId: DEV_ORG_ID,
      userId: DEV_FOUNDER_ID,
    });

    const promptContext = await buildFounderPromptContext(
      conv.id,
      DEV_ORG_ID,
      DEV_FOUNDER_ID,
      'System prompt',
      'Archived obsolete content for reception booking'
    );

    expect(promptContext.systemPrompt).not.toContain('Archived obsolete content');
    expect(promptContext.retrievedChunks).toEqual([]);
  });
});
