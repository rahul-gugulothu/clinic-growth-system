import { getClient } from '../db/index.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type ConversationStatus = 'Open' | 'Closed';
export type DataSource = 'real' | 'demo';

export interface ConversationRecord {
  id: string;
  organization_id: string;
  lead_id: string;
  channel: string;
  started_at: string;
  last_message_at: string | null;
  assigned_staff_id: string | null;
  status: ConversationStatus;
  data_source: DataSource;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateConversationInput {
  channel: string;
  assigned_staff_id?: string | null;
}

export type UpdateConversationInput = Partial<CreateConversationInput> & {
  status?: ConversationStatus;
};

export interface ConversationListResponse {
  conversations: ConversationRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export const listConversationsForLead = async (
  leadId: string,
  organizationId: string,
  clinicId: string | null,
  page: number,
  limit: number
): Promise<ConversationListResponse> => {
  const client = await getClient();
  try {
    const offset = (page - 1) * limit;

    if (clinicId) {
      const countResult = await client.query<{ total: number }>(
        `SELECT COUNT(*)::INTEGER as total
         FROM conversations c
         JOIN leads l ON c.lead_id = l.id
         WHERE c.lead_id = $1 AND c.organization_id = $2 AND l.clinic_id = $3 AND c.deleted_at IS NULL`,
        [leadId, organizationId, clinicId]
      );

      const total = countResult.rows[0]?.total ?? 0;

      const listResult = await client.query<ConversationRecord>(
        `SELECT c.id, c.organization_id, c.lead_id, c.channel, c.started_at, c.last_message_at,
                c.assigned_staff_id, c.status, c.data_source, c.created_at, c.updated_at
         FROM conversations c
         JOIN leads l ON c.lead_id = l.id
         WHERE c.lead_id = $1 AND c.organization_id = $2 AND l.clinic_id = $3 AND c.deleted_at IS NULL
         ORDER BY c.created_at DESC
         LIMIT $4 OFFSET $5`,
        [leadId, organizationId, clinicId, limit, offset]
      );

      const hasMore = offset + listResult.rows.length < total;

      return {
        conversations: listResult.rows,
        pagination: { page, limit, total, hasMore },
      };
    }

    const countResult = await client.query<{ total: number }>(
      `SELECT COUNT(*)::INTEGER as total
       FROM conversations c
       JOIN leads l ON c.lead_id = l.id
       WHERE c.lead_id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL`,
      [leadId, organizationId]
    );

    const total = countResult.rows[0]?.total ?? 0;

    const listResult = await client.query<ConversationRecord>(
      `SELECT c.id, c.organization_id, c.lead_id, c.channel, c.started_at, c.last_message_at,
              c.assigned_staff_id, c.status, c.data_source, c.created_at, c.updated_at
       FROM conversations c
       JOIN leads l ON c.lead_id = l.id
       WHERE c.lead_id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC
       LIMIT $3 OFFSET $4`,
      [leadId, organizationId, limit, offset]
    );

    const hasMore = offset + listResult.rows.length < total;

    return {
      conversations: listResult.rows,
      pagination: { page, limit, total, hasMore },
    };
  } catch (err) {
    logger.error({ err, leadId, organizationId, event: 'list_conversations_failed' }, 'Failed to list conversations');
    throw err;
  } finally {
    client.release();
  }
};

export const getConversationById = async (
  conversationId: string,
  organizationId: string,
  clinicId: string | null
): Promise<ConversationRecord | null> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query<ConversationRecord>(
        `SELECT c.id, c.organization_id, c.lead_id, c.channel, c.started_at,
                c.last_message_at, c.assigned_staff_id, c.status, c.data_source,
                c.created_at, c.updated_at
         FROM conversations c
         JOIN leads l ON c.lead_id = l.id
         WHERE c.id = $1 AND c.organization_id = $2 AND l.clinic_id = $3 AND c.deleted_at IS NULL`,
        [conversationId, organizationId, clinicId]
      );

      if (result.rowCount === 0) {
        return null;
      }

      return result.rows[0];
    }

    const result = await client.query<ConversationRecord>(
      `SELECT c.id, c.organization_id, c.lead_id, c.channel, c.started_at,
              c.last_message_at, c.assigned_staff_id, c.status, c.data_source,
              c.created_at, c.updated_at
       FROM conversations c
       WHERE c.id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL`,
      [conversationId, organizationId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } catch (err) {
    logger.error({ err, conversationId, organizationId, event: 'get_conversation_failed' }, 'Failed to get conversation');
    throw err;
  } finally {
    client.release();
  }
};

export const getConversationWithLeadScope = async (
  conversationId: string,
  organizationId: string,
  clinicId: string | null
): Promise<ConversationRecord | null> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query<ConversationRecord>(
        `SELECT c.id, c.organization_id, c.lead_id, c.channel, c.started_at,
                c.last_message_at, c.assigned_staff_id, c.status, c.data_source,
                c.created_at, c.updated_at
         FROM conversations c
         JOIN leads l ON c.lead_id = l.id
         WHERE c.id = $1 AND c.organization_id = $2 AND l.clinic_id = $3 AND c.deleted_at IS NULL`,
        [conversationId, organizationId, clinicId]
      );

      if (result.rowCount === 0) {
        return null;
      }

      return result.rows[0];
    }

    const result = await client.query<ConversationRecord>(
      `SELECT c.id, c.organization_id, c.lead_id, c.channel, c.started_at,
              c.last_message_at, c.assigned_staff_id, c.status, c.data_source,
              c.created_at, c.updated_at
       FROM conversations c
       WHERE c.id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL`,
      [conversationId, organizationId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } catch (err) {
    logger.error({ err, conversationId, organizationId, event: 'get_conversation_with_lead_scope_failed' }, 'Failed to get conversation with lead scope');
    throw err;
  } finally {
    client.release();
  }
};

export const validateLead = async (
  leadId: string,
  organizationId: string,
  clinicId: string | null
): Promise<void> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query(
        `SELECT id FROM leads WHERE id = $1 AND organization_id = $2 AND clinic_id = $3 AND deleted_at IS NULL`,
        [leadId, organizationId, clinicId]
      );

      if (result.rowCount === 0) {
        throw new NotFoundError('Lead not found');
      }
      return;
    }

    const result = await client.query(
      `SELECT id FROM leads WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [leadId, organizationId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Lead not found');
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw err;
    }
    logger.error({ err, leadId, organizationId, event: 'validate_lead_failed' }, 'Failed to validate lead');
    throw err;
  } finally {
    client.release();
  }
};

export const validateLeadClinic = async (
  leadId: string,
  clinicId: string
): Promise<void> => {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT id FROM leads WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
      [leadId, clinicId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Lead not found in this clinic');
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw err;
    }
    logger.error({ err, leadId, clinicId, event: 'validate_lead_clinic_failed' }, 'Failed to validate lead clinic');
    throw err;
  } finally {
    client.release();
  }
};

export const createConversation = async (
  leadId: string,
  organizationId: string,
  input: CreateConversationInput
): Promise<ConversationRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<ConversationRecord>(
      `INSERT INTO conversations (
         organization_id, lead_id, channel, started_at, last_message_at,
         assigned_staff_id, status, data_source
       ) VALUES (
         $1, $2, $3, NOW(), NULL, $4, 'Open', 'demo'
       )
       RETURNING id, organization_id, lead_id, channel, started_at, last_message_at,
                 assigned_staff_id, status, data_source, created_at, updated_at`,
      [
        organizationId,
        leadId,
        input.channel,
        input.assigned_staff_id ?? null,
      ]
    );

    return result.rows[0];
  } catch (err) {
    logger.error({ err, leadId, organizationId, event: 'create_conversation_failed' }, 'Failed to create conversation');
    throw err;
  } finally {
    client.release();
  }
};

export const updateConversation = async (
  conversationId: string,
  organizationId: string,
  input: UpdateConversationInput,
  clinicId: string | null
): Promise<ConversationRecord | null> => {
  const client = await getClient();
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [conversationId, organizationId];
    let paramIndex = 3;

    if (input.channel !== undefined) {
      setClauses.push(`channel = $${paramIndex}`);
      values.push(input.channel);
      paramIndex++;
    }
    if (input.assigned_staff_id !== undefined) {
      setClauses.push(`assigned_staff_id = $${paramIndex}`);
      values.push(input.assigned_staff_id);
      paramIndex++;
    }
    if (input.status !== undefined) {
      setClauses.push(`status = $${paramIndex}`);
      values.push(input.status);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      throw new BadRequestError('No fields to update');
    }

    setClauses.push(`updated_at = NOW()`);

    let whereClause = 'WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL';
    if (clinicId) {
      whereClause += ` AND lead_id IN (SELECT id FROM leads WHERE clinic_id = $${paramIndex} AND deleted_at IS NULL)`;
      values.push(clinicId);
    }

    const result = await client.query<ConversationRecord>(
      `UPDATE conversations
       SET ${setClauses.join(', ')}
       ${whereClause}
       RETURNING id, organization_id, lead_id, channel, started_at, last_message_at,
                 assigned_staff_id, status, data_source, created_at, updated_at`,
      values
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } catch (err) {
    if (err instanceof BadRequestError) {
      throw err;
    }
    logger.error({ err, conversationId, organizationId, event: 'update_conversation_failed' }, 'Failed to update conversation');
    throw err;
  } finally {
    client.release();
  }
};
