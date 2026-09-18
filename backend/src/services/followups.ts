import { getClient } from '../db/index.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type FollowupType = 'Reminder' | 'Recovery' | 'Reschedule' | 'Review Request';
export type FollowupStatus = 'Scheduled' | 'Completed' | 'Missed' | 'Cancelled';
export type ChannelType = 'Email' | 'Phone' | 'WhatsApp' | 'InPerson';
export type DataSource = 'real' | 'demo';

export interface FollowupRecord {
  id: string;
  organization_id: string;
  lead_id: string | null;
  appointment_id: string | null;
  type: FollowupType;
  scheduled_at: string;
  channel: ChannelType;
  status: FollowupStatus;
  outcome: string | null;
  data_source: DataSource;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateFollowupInput {
  type: FollowupType;
  scheduled_at: string;
  channel: ChannelType;
  lead_id?: string | null;
  appointment_id?: string | null;
}

export interface UpdateFollowupInput {
  scheduled_at?: string;
  channel?: ChannelType;
  status?: FollowupStatus;
  outcome?: string | null;
}

export interface FollowupListResponse {
  followups: FollowupRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

const FOLLOWUP_TRANSITIONS: Record<FollowupStatus, FollowupStatus[]> = {
  Scheduled: ['Completed', 'Missed', 'Cancelled'],
  Completed: [],
  Missed: ['Scheduled'],
  Cancelled: [],
};

export const validateFollowupStatusTransition = (
  current: FollowupStatus,
  next: FollowupStatus
): void => {
  if (!FOLLOWUP_TRANSITIONS[current]?.includes(next)) {
    throw new BadRequestError(
      `Invalid status transition: ${current} -> ${next}`
    );
  }
};

const getClinicScopeCondition = (organizationId: string, clinicId: string | null) => {
  if (clinicId) {
    return {
      where: `WHERE organization_id = $1
              AND deleted_at IS NULL
              AND (
                (lead_id IS NOT NULL AND lead_id IN (SELECT id FROM leads WHERE clinic_id = $2 AND deleted_at IS NULL))
                OR
                (appointment_id IS NOT NULL AND appointment_id IN (SELECT id FROM appointments WHERE lead_id IN (SELECT id FROM leads WHERE clinic_id = $2 AND deleted_at IS NULL) AND deleted_at IS NULL))
              )`,
      params: [organizationId, clinicId],
    };
  }
  return {
    where: `WHERE organization_id = $1 AND deleted_at IS NULL`,
    params: [organizationId],
  };
};

export const listFollowups = async (
  organizationId: string,
  clinicId: string | null,
  page: number,
  limit: number
): Promise<FollowupListResponse> => {
  const client = await getClient();
  try {
    const offset = (page - 1) * limit;
    const scope = getClinicScopeCondition(organizationId, clinicId);

    const countResult = await client.query<{ total: number }>(
      `SELECT COUNT(*)::INTEGER as total FROM followups f ${scope.where}`,
      scope.params
    );
    const total = countResult.rows[0]?.total ?? 0;

    const listResult = await client.query<FollowupRecord>(
      `SELECT id, organization_id, lead_id, appointment_id, type,
              scheduled_at, channel, status, outcome, data_source,
              created_at, updated_at
       FROM followups f
       ${scope.where}
       ORDER BY scheduled_at DESC
       LIMIT $${scope.params.length + 1} OFFSET $${scope.params.length + 2}`,
      [...scope.params, limit, offset]
    );

    const hasMore = offset + listResult.rows.length < total;
    return { followups: listResult.rows, pagination: { page, limit, total, hasMore } };
  } catch (err) {
    logger.error({ err, organizationId, event: 'list_followups_failed' }, 'Failed to list followups');
    throw err;
  } finally {
    client.release();
  }
};

export const getFollowupById = async (
  followupId: string,
  organizationId: string,
  clinicId: string | null
): Promise<FollowupRecord | null> => {
  const client = await getClient();
  try {
    const scope = getClinicScopeCondition(organizationId, clinicId);
    const params = [...scope.params, followupId];

    const result = await client.query<FollowupRecord>(
      `SELECT id, organization_id, lead_id, appointment_id, type,
              scheduled_at, channel, status, outcome, data_source,
              created_at, updated_at
       FROM followups f
       ${scope.where} AND id = $${params.length}
       LIMIT 1`,
      params
    );

    if (result.rowCount === 0) return null;
    return result.rows[0];
  } catch (err) {
    logger.error({ err, followupId, organizationId, event: 'get_followup_failed' }, 'Failed to get followup');
    throw err;
  } finally {
    client.release();
  }
};

export const validateLeadExists = async (
  leadId: string,
  organizationId: string
): Promise<void> => {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT id FROM leads WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [leadId, organizationId]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Lead not found');
    }
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    logger.error({ err, leadId, organizationId, event: 'validate_lead_exists_failed' }, 'Failed to validate lead');
    throw err;
  } finally {
    client.release();
  }
};

export const validateAppointmentExists = async (
  appointmentId: string,
  organizationId: string
): Promise<void> => {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT id FROM appointments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [appointmentId, organizationId]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Appointment not found');
    }
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    logger.error({ err, appointmentId, organizationId, event: 'validate_appointment_exists_failed' }, 'Failed to validate appointment');
    throw err;
  } finally {
    client.release();
  }
};

export const createFollowup = async (
  organizationId: string,
  input: CreateFollowupInput
): Promise<FollowupRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<FollowupRecord>(
      `INSERT INTO followups (
         organization_id, lead_id, appointment_id, type, scheduled_at,
         channel, status, outcome, data_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'Scheduled', NULL, 'demo'
       )
       RETURNING id, organization_id, lead_id, appointment_id, type,
                 scheduled_at, channel, status, outcome, data_source,
                 created_at, updated_at`,
      [
        organizationId,
        input.lead_id ?? null,
        input.appointment_id ?? null,
        input.type,
        input.scheduled_at,
        input.channel,
      ]
    );
    return result.rows[0];
  } catch (err) {
    logger.error({ err, organizationId, event: 'create_followup_failed' }, 'Failed to create followup');
    throw err;
  } finally {
    client.release();
  }
};

export const updateFollowup = async (
  followupId: string,
  organizationId: string,
  input: UpdateFollowupInput,
  clinicId: string | null
): Promise<FollowupRecord | null> => {
  const client = await getClient();
  try {
    const scope = getClinicScopeCondition(organizationId, clinicId);
    const scopeParams = scope.params;
    const setClauses: string[] = [];
    const setValues: unknown[] = [];
    let paramIndex = scopeParams.length + 1;

    if (input.scheduled_at !== undefined) {
      setClauses.push(`scheduled_at = $${paramIndex}`);
      setValues.push(input.scheduled_at);
      paramIndex++;
    }
    if (input.channel !== undefined) {
      setClauses.push(`channel = $${paramIndex}`);
      setValues.push(input.channel);
      paramIndex++;
    }
    if (input.status !== undefined) {
      setClauses.push(`status = $${paramIndex}`);
      setValues.push(input.status);
      paramIndex++;
    }
    if (input.outcome !== undefined) {
      setClauses.push(`outcome = $${paramIndex}`);
      setValues.push(input.outcome);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      throw new BadRequestError('No fields to update');
    }

    setClauses.push(`updated_at = NOW()`);

    const whereClause = `${scope.where} AND id = $${scopeParams.length + setValues.length + 1}`;
    const allParams = [...scopeParams, ...setValues, followupId];

    const result = await client.query<FollowupRecord>(
      `UPDATE followups
       SET ${setClauses.join(', ')}
       ${whereClause}
       RETURNING id, organization_id, lead_id, appointment_id, type,
                 scheduled_at, channel, status, outcome, data_source,
                 created_at, updated_at`,
      allParams
    );

    if (result.rowCount === 0) return null;
    return result.rows[0];
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    logger.error({ err, followupId, organizationId, event: 'update_followup_failed' }, 'Failed to update followup');
    throw err;
  } finally {
    client.release();
  }
};



