import { getClient } from '../db/index.js';
import { PoolClient } from 'pg';
import { BadRequestError, NotFoundError } from '../types/index.js';
import { logger } from '../utils/logger.js';
import type {
  ConversationDetail,
  ConversationMessageRecord,
  ConversationRecord,
  ConversationSummary,
  CreateMessageInput,
  FounderPromptContext,
  MessageRole,
  PaginatedConversations,
} from '../types/founderMemory.js';

const MESSAGE_ROLES: MessageRole[] = ['system', 'user', 'assistant', 'tool'];

const isMessageRole = (value: unknown): value is MessageRole =>
  typeof value === 'string' && (MESSAGE_ROLES as readonly string[]).includes(value);

const DEFAULT_TITLE = 'New Conversation';
const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 10000;
const PREVIEW_LENGTH = 120;
const DEFAULT_CONTEXT_LIMIT = 12;
const MAX_AUTO_TITLE_LENGTH = 60;

const normalizeTitle = (title?: string | null): string => {
  const trimmed = (title ?? DEFAULT_TITLE).trim();
  return trimmed.length === 0 ? DEFAULT_TITLE : trimmed;
};

const generateAutoTitles = (content: string): string => {
  let title = content.trim();
  if (title.length > MAX_AUTO_TITLE_LENGTH) {
    title = title.slice(0, MAX_AUTO_TITLE_LENGTH).trim();
  }
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  title = title.replace(/[.!?]+$/, '');
  return title;
};

export const createConversation = async (params: {
  organizationId: string;
  userId: string;
  clinicId?: string | null;
  title?: string | null;
}): Promise<ConversationRecord> => {
  const title = normalizeTitle(params.title);
  if (title.length > MAX_TITLE_LENGTH) {
    throw new BadRequestError(`Title must be at most ${MAX_TITLE_LENGTH} characters`);
  }

  const client = await getClient();
  try {
    const result = await client.query<ConversationRecord>(
      `INSERT INTO founder_conversations
         (organization_id, user_id, clinic_id, title, archived)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING id, organization_id, user_id, clinic_id, title, archived, created_at, updated_at`,
      [params.organizationId, params.userId, params.clinicId ?? null, title]
    );

    const record = result.rows[0];
    logger.info(
      {
        event: 'founder_conversation_created',
        organizationId: params.organizationId,
        conversationId: record.id,
        userId: params.userId,
      },
      'Founder conversation created'
    );
    return record;
  } catch (err) {
    logger.error(
      {
        err,
        event: 'founder_conversation_create_failed',
        organizationId: params.organizationId,
        userId: params.userId,
      },
      'Failed to create founder conversation'
    );
    throw err;
  } finally {
    client.release();
  }
};

export const listConversations = async (
  organizationId: string,
  userId: string,
  limit: number,
  offset: number,
  archived?: boolean
): Promise<PaginatedConversations> => {
  const client = await getClient();
  try {
    const hasArchivedFilter = archived !== undefined;
    const archivedClause = hasArchivedFilter ? ` AND archived = $3` : '';
    const countParams: unknown[] = hasArchivedFilter
      ? [organizationId, userId, archived]
      : [organizationId, userId];
    const selectParams: unknown[] = hasArchivedFilter
      ? [organizationId, userId, archived, limit, offset]
      : [organizationId, userId, limit, offset];
    const limitIdx = hasArchivedFilter ? '$4' : '$3';
    const offsetIdx = hasArchivedFilter ? '$5' : '$4';

    const countResult = await client.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM founder_conversations
       WHERE organization_id = $1
         AND user_id = $2
       ${archivedClause}`,
      countParams
    );

    const result = await client.query<ConversationSummary>(
      `SELECT fc.id, fc.title, fc.clinic_id, fc.created_at, fc.updated_at,
              substring(m.content, 1, ${PREVIEW_LENGTH}) AS last_message_preview,
              COALESCE(mc.message_count, 0) AS message_count
       FROM founder_conversations fc
       LEFT JOIN (
         SELECT DISTINCT ON (conversation_id) conversation_id, content
         FROM founder_conversation_messages
         ORDER BY conversation_id, created_at DESC
       ) m ON m.conversation_id = fc.id
       LEFT JOIN (
         SELECT conversation_id, COUNT(*)::int AS message_count
         FROM founder_conversation_messages
         GROUP BY conversation_id
       ) mc ON mc.conversation_id = fc.id
       WHERE fc.organization_id = $1
         AND fc.user_id = $2
       ${archivedClause}
       ORDER BY fc.updated_at DESC
       LIMIT ${limitIdx} OFFSET ${offsetIdx}`,
      selectParams
    );

    logger.info(
      {
        event: 'founder_conversation_listed',
        organizationId,
        userId,
        limit,
        offset,
        archived: archived ?? null,
        count: result.rows.length,
      },
      'Founder conversation list retrieved'
    );

    return {
      conversations: result.rows,
      pagination: {
        limit,
        offset,
        total: countResult.rows[0].total,
      },
    };
  } catch (err) {
    logger.error(
      { err, event: 'founder_conversation_list_failed', organizationId, userId },
      'Failed to list founder conversations'
    );
    throw err;
  } finally {
    client.release();
  }
};

export const getConversation = async (
  organizationId: string,
  conversationId: string
): Promise<ConversationDetail | null> => {
  const client = await getClient();
  try {
    const convResult = await client.query<ConversationRecord>(
      `SELECT id, organization_id, user_id, clinic_id, title, archived, created_at, updated_at
       FROM founder_conversations
       WHERE id = $1 AND organization_id = $2`,
      [conversationId, organizationId]
    );

    if (convResult.rowCount === 0) {
      return null;
    }

    const messagesResult = await client.query<ConversationMessageRecord>(
      `SELECT id, conversation_id, organization_id, role, content, tool_execution_id, metadata, created_at
       FROM founder_conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    logger.info(
      {
        event: 'founder_conversation_retrieved',
        organizationId,
        conversationId,
      },
      'Founder conversation retrieved'
    );

    return {
      conversation: convResult.rows[0],
      messages: messagesResult.rows,
    };
  } catch (err) {
    logger.error(
      { err, event: 'founder_conversation_get_failed', organizationId, conversationId },
      'Failed to retrieve founder conversation'
    );
    throw err;
  } finally {
    client.release();
  }
};

export const addMessage = async (params: CreateMessageInput): Promise<ConversationMessageRecord> => {
  if (!isMessageRole(params.role)) {
    throw new BadRequestError('Invalid message role');
  }

  const trimmed = params.content.trim();
  if (trimmed.length === 0) {
    throw new BadRequestError('Message content is required');
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new BadRequestError(`Message content must be at most ${MAX_MESSAGE_LENGTH} characters`);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const ownership = await client.query<{ id: string }>(
      `SELECT id
       FROM founder_conversations
       WHERE id = $1 AND organization_id = $2`,
      [params.conversationId, params.organizationId]
    );

    if (ownership.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new NotFoundError('Conversation not found');
    }

    const result = await client.query<ConversationMessageRecord>(
      `INSERT INTO founder_conversation_messages
         (conversation_id, organization_id, role, content, tool_execution_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, conversation_id, organization_id, role, content, tool_execution_id, metadata, created_at`,
      [
        params.conversationId,
        params.organizationId,
        params.role,
        trimmed,
        params.toolExecutionId ?? null,
        params.metadata ?? {},
      ]
    );

     await client.query(
       `UPDATE founder_conversations
          SET updated_at = NOW()
        WHERE id = $1`,
       [params.conversationId]
     );

     await maybeAutoTitles(
       client,
       params.conversationId,
       params.organizationId,
       params.role,
       trimmed
     );

     await client.query('COMMIT');

    const message = result.rows[0];
    logger.info(
      {
        event: 'founder_message_added',
        organizationId: params.organizationId,
        conversationId: params.conversationId,
      },
      'Founder message added'
    );
    return message;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error(
      {
        err,
        event: 'founder_message_add_failed',
        organizationId: params.organizationId,
        conversationId: params.conversationId,
      },
      'Failed to add founder message'
    );
    throw err;
  } finally {
    client.release();
  }
};

const maybeAutoTitles = async (
  client: PoolClient,
  conversationId: string,
  organizationId: string,
  role: MessageRole,
  content: string
): Promise<void> => {
  if (role !== 'user' || content.trim().length === 0) return;

  const convResult = await client.query<{ title: string }>(
    `SELECT title FROM founder_conversations
     WHERE id = $1 AND organization_id = $2`,
    [conversationId, organizationId]
  );

  if (convResult.rowCount === 0) return;

  const currentTitle = convResult.rows[0].title;
  if (currentTitle !== DEFAULT_TITLE) return;

  const newTitle = generateAutoTitles(content);
  await client.query(
    `UPDATE founder_conversations
       SET title = $1,
           updated_at = NOW()
     WHERE id = $2 AND organization_id = $3`,
    [newTitle, conversationId, organizationId]
  );

  logger.info(
    {
      event: 'founder_conversation_auto_titled',
      organizationId,
      conversationId,
    },
    'Founder conversation auto-titled from first user message'
  );
};

export const updateConversationTitle = async (
  organizationId: string,
  conversationId: string,
  title: string
): Promise<ConversationRecord | null> => {
  const normalized = title.trim();
  if (normalized.length === 0) {
    throw new BadRequestError(`Title must be between 1 and ${MAX_TITLE_LENGTH} characters`);
  }
  if (normalized.length > MAX_TITLE_LENGTH) {
    throw new BadRequestError(`Title must be between 1 and ${MAX_TITLE_LENGTH} characters`);
  }

  const client = await getClient();
  try {
    const result = await client.query<ConversationRecord>(
      `UPDATE founder_conversations
         SET title = $1,
             updated_at = NOW()
       WHERE id = $2 AND organization_id = $3
       RETURNING id, organization_id, user_id, clinic_id, title, archived, created_at, updated_at`,
      [normalized, conversationId, organizationId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    logger.info(
      {
        event: 'founder_conversation_renamed',
        organizationId,
        conversationId,
      },
      'Founder conversation renamed'
    );
    return result.rows[0];
  } catch (err) {
    logger.error(
      { err, event: 'founder_conversation_rename_failed', organizationId, conversationId },
      'Failed to rename founder conversation'
    );
    throw err;
  } finally {
    client.release();
  }
};

export const archiveConversation = async (
  organizationId: string,
  conversationId: string
): Promise<ConversationRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<ConversationRecord>(
      `UPDATE founder_conversations
         SET archived = TRUE,
             updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND archived = FALSE
       RETURNING id, organization_id, user_id, clinic_id, title, archived, created_at, updated_at`,
      [conversationId, organizationId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Conversation not found');
    }

    logger.info(
      {
        event: 'founder_conversation_archived',
        organizationId,
        conversationId,
      },
      'Founder conversation archived'
    );
    return result.rows[0];
  } catch (err) {
    logger.error(
      { err, event: 'founder_conversation_archive_failed', organizationId, conversationId },
      'Failed to archive founder conversation'
    );
    throw err;
  } finally {
    client.release();
  }
};

export const deleteConversation = async (
  organizationId: string,
  conversationId: string
): Promise<void> => {
  const client = await getClient();
  try {
    const result = await client.query(
      `DELETE FROM founder_conversations
       WHERE id = $1 AND organization_id = $2`,
      [conversationId, organizationId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Conversation not found');
    }

    logger.info(
      {
        event: 'founder_conversation_deleted',
        organizationId,
        conversationId,
      },
      'Founder conversation deleted'
    );
   } catch (err) {
    logger.error(
      { err, event: 'founder_conversation_delete_failed', organizationId, conversationId },
      'Failed to delete founder conversation'
    );
    throw err;
  } finally {
    client.release();
  }
};

export const getConversationContext = async (
  organizationId: string,
  userId: string,
  conversationId: string,
  limit: number = DEFAULT_CONTEXT_LIMIT
): Promise<ConversationMessageRecord[]> => {
  const safeLimit = limit > 0 ? limit : DEFAULT_CONTEXT_LIMIT;

  const client = await getClient();
  try {
    const ownership = await client.query<{ id: string }>(
      `SELECT id
       FROM founder_conversations
       WHERE id = $1 AND organization_id = $2 AND user_id = $3`,
      [conversationId, organizationId, userId]
    );

    if (ownership.rowCount === 0) {
      return [];
    }

    const totalResult = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM founder_conversation_messages
       WHERE conversation_id = $1`,
      [conversationId]
    );

    const total = totalResult.rows[0]?.count ?? 0;
    const messageCount = Math.min(total, safeLimit);
    const startIndex = total > safeLimit ? total - safeLimit : 0;

    const messages = await client.query<ConversationMessageRecord>(
      `SELECT id, conversation_id, organization_id, role, content, tool_execution_id, metadata, created_at
       FROM founder_conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [conversationId, messageCount, startIndex]
    );

    logger.info(
      {
        event: 'founder_context_retrieved',
        organizationId,
        conversationId,
        limit: safeLimit,
        messageCount: messages.rowCount,
      },
      'Founder conversation context retrieved'
    );

    return messages.rows;
  } catch (err) {
    logger.error(
      {
        err,
        event: 'founder_context_retrieval_failed',
        organizationId,
        conversationId,
      },
      'Failed to retrieve founder conversation context'
    );
    throw err;
  } finally {
    client.release();
  }
};

export const buildFounderPromptContext = async (
  conversationId: string,
  organizationId: string,
  userId: string,
  systemPrompt: string,
  latestUserMessage: string
): Promise<FounderPromptContext> => {
  const history = await getConversationContext(
    organizationId,
    userId,
    conversationId,
    DEFAULT_CONTEXT_LIMIT
  );

  const latestMessage: ConversationMessageRecord = {
    id: '',
    conversation_id: conversationId,
    organization_id: organizationId,
    role: 'user',
    content: latestUserMessage,
    tool_execution_id: null,
    metadata: {},
    created_at: new Date().toISOString(),
  };

  const messages = [...history, latestMessage];

  logger.info(
    {
      event: 'founder_prompt_context_built',
      organizationId,
      conversationId,
      historyLength: history.length,
    },
    'Founder prompt context built'
  );

  return {
    systemPrompt,
    messages,
  };
};
