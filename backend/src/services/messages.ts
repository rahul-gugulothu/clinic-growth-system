import { getClient } from '../db/index.js';
import { logger } from '../utils/logger.js';

export type MessageSender = 'clinic' | 'lead' | 'system';
export type DataSource = 'real' | 'demo';

export interface MessageRecord {
  id: string;
  organization_id: string;
  conversation_id: string;
  sender: MessageSender;
  body: string;
  sent_at: string;
  data_source: DataSource;
  created_at: string;
  deleted_at: string | null;
}

export interface CreateMessageInput {
  sender: MessageSender;
  body: string;
}

export interface MessageListResponse {
  messages: MessageRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export const listMessages = async (
  conversationId: string,
  organizationId: string,
  clinicId: string | null,
  page: number,
  limit: number
): Promise<MessageListResponse> => {
  const client = await getClient();
  try {
    const offset = (page - 1) * limit;

    if (clinicId) {
      const countResult = await client.query<{ total: number }>(
        `SELECT COUNT(*)::INTEGER as total
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         JOIN leads l ON c.lead_id = l.id
         WHERE m.conversation_id = $1 AND m.organization_id = $2 AND l.clinic_id = $3 AND m.deleted_at IS NULL`,
        [conversationId, organizationId, clinicId]
      );

      const total = countResult.rows[0]?.total ?? 0;

      const listResult = await client.query<MessageRecord>(
        `SELECT m.id, m.organization_id, m.conversation_id, m.sender, m.body, m.sent_at,
                m.data_source, m.created_at
         FROM messages m
         WHERE m.conversation_id = $1 AND m.organization_id = $2
         AND EXISTS (
           SELECT 1 FROM conversations c
           JOIN leads l ON c.lead_id = l.id
           WHERE c.id = $1 AND l.clinic_id = $3 AND l.deleted_at IS NULL
         )
         AND m.deleted_at IS NULL
         ORDER BY m.sent_at ASC
         LIMIT $4 OFFSET $5`,
        [conversationId, organizationId, clinicId, limit, offset]
      );

      const hasMore = offset + listResult.rows.length < total;

      return {
        messages: listResult.rows,
        pagination: { page, limit, total, hasMore },
      };
    }

    const countResult = await client.query<{ total: number }>(
      `SELECT COUNT(*)::INTEGER as total
       FROM messages
       WHERE conversation_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [conversationId, organizationId]
    );

    const total = countResult.rows[0]?.total ?? 0;

    const listResult = await client.query<MessageRecord>(
      `SELECT id, organization_id, conversation_id, sender, body, sent_at,
              data_source, created_at
       FROM messages
       WHERE conversation_id = $1 AND organization_id = $2 AND deleted_at IS NULL
       ORDER BY sent_at ASC
       LIMIT $3 OFFSET $4`,
      [conversationId, organizationId, limit, offset]
    );

    const hasMore = offset + listResult.rows.length < total;

    return {
      messages: listResult.rows,
      pagination: { page, limit, total, hasMore },
    };
  } catch (err) {
    logger.error({ err, conversationId, organizationId, event: 'list_messages_failed' }, 'Failed to list messages');
    throw err;
  } finally {
    client.release();
  }
};

export const getConversationAuthorized = async (
  conversationId: string,
  organizationId: string,
  clinicId: string | null
): Promise<boolean> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query(
        `SELECT 1
         FROM conversations c
         JOIN leads l ON c.lead_id = l.id
         WHERE c.id = $1 AND c.organization_id = $2 AND l.clinic_id = $3 AND c.deleted_at IS NULL`,
        [conversationId, organizationId, clinicId]
      );

      return (result.rowCount ?? 0) > 0;
    }

    const result = await client.query(
      `SELECT 1 FROM conversations
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [conversationId, organizationId]
    );

    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error({ err, conversationId, organizationId, event: 'get_conversation_authorized_failed' }, 'Failed to check conversation access');
    throw err;
  } finally {
    client.release();
  }
};

export const createMessage = async (
  conversationId: string,
  organizationId: string,
  input: CreateMessageInput
): Promise<MessageRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<MessageRecord>(
      `INSERT INTO messages (
         organization_id, conversation_id, sender, body, sent_at, data_source
       ) VALUES (
         $1, $2, $3, $4, NOW(), 'demo'
       )
       RETURNING id, organization_id, conversation_id, sender, body, sent_at,
                 data_source, created_at`,
      [
        organizationId,
        conversationId,
        input.sender,
        input.body,
      ]
    );

    return result.rows[0];
  } catch (err) {
    logger.error({ err, conversationId, organizationId, event: 'create_message_failed' }, 'Failed to create message');
    throw err;
  } finally {
    client.release();
  }
};
