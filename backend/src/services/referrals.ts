import { getClient } from '../db/index.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type ReferralStatus = 'New' | 'Converted' | 'Lost';
export type DataSource = 'real' | 'demo';

export interface ReferralRecord {
  id: string;
  organization_id: string;
  clinic_id: string;
  referring_lead_id: string | null;
  referred_lead_id: string | null;
  created_at: string;
  status: ReferralStatus;
  outcome: string | null;
  data_source: DataSource;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateReferralInput {
  referring_lead_id?: string | null;
  referred_lead_id?: string | null;
  outcome?: string | null;
}

export interface UpdateReferralInput {
  status?: ReferralStatus;
  outcome?: string | null;
}

export interface ReferralListResponse {
  referrals: ReferralRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

const REFERRAL_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  New: ['Converted', 'Lost'],
  Converted: [],
  Lost: [],
};

export const validateReferralStatusTransition = (
  current: ReferralStatus,
  next: ReferralStatus
): void => {
  if (!REFERRAL_TRANSITIONS[current]?.includes(next)) {
    throw new BadRequestError(
      `Invalid status transition: ${current} -> ${next}`
    );
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

export const validateLeadClinic = async (
  leadId: string,
  organizationId: string,
  clinicId: string
): Promise<void> => {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT id FROM leads WHERE id = $1 AND organization_id = $2 AND clinic_id = $3 AND deleted_at IS NULL`,
      [leadId, organizationId, clinicId]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Lead not found');
    }
  } catch (err) {
    logger.error({ err, leadId, organizationId, event: 'validate_lead_clinic_failed' }, 'Failed to validate lead clinic');
    throw err;
  } finally {
    client.release();
  }
};

export const listReferrals = async (
  organizationId: string,
  clinicId: string | null,
  page: number,
  limit: number
): Promise<ReferralListResponse> => {
  const client = await getClient();
  try {
    const offset = (page - 1) * limit;

    if (clinicId) {
      const countResult = await client.query<{ total: number }>(
        `SELECT COUNT(*)::INTEGER as total FROM referrals WHERE organization_id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
        [organizationId, clinicId]
      );
      const total = countResult.rows[0]?.total ?? 0;

      const listResult = await client.query<ReferralRecord>(
        `SELECT id, organization_id, clinic_id, referring_lead_id, referred_lead_id,
                created_at, status, outcome, data_source, updated_at
         FROM referrals
         WHERE organization_id = $1 AND clinic_id = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [organizationId, clinicId, limit, offset]
      );
      const hasMore = offset + listResult.rows.length < total;
      return { referrals: listResult.rows, pagination: { page, limit, total, hasMore } };
    }

    const countResult = await client.query<{ total: number }>(
      `SELECT COUNT(*)::INTEGER as total FROM referrals WHERE organization_id = $1 AND deleted_at IS NULL`,
      [organizationId]
    );
    const total = countResult.rows[0]?.total ?? 0;

    const listResult = await client.query<ReferralRecord>(
      `SELECT id, organization_id, clinic_id, referring_lead_id, referred_lead_id,
              created_at, status, outcome, data_source, updated_at
       FROM referrals
       WHERE organization_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset]
    );
    const hasMore = offset + listResult.rows.length < total;
    return { referrals: listResult.rows, pagination: { page, limit, total, hasMore } };
  } catch (err) {
    logger.error({ err, organizationId, event: 'list_referrals_failed' }, 'Failed to list referrals');
    throw err;
  } finally {
    client.release();
  }
};

export const getReferralById = async (
  referralId: string,
  organizationId: string,
  clinicId: string | null
): Promise<ReferralRecord | null> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query<ReferralRecord>(
        `SELECT id, organization_id, clinic_id, referring_lead_id, referred_lead_id,
                created_at, status, outcome, data_source, updated_at
         FROM referrals
         WHERE id = $1 AND organization_id = $2 AND clinic_id = $3 AND deleted_at IS NULL`,
        [referralId, organizationId, clinicId]
      );
      if (result.rowCount === 0) return null;
      return result.rows[0];
    }

    const result = await client.query<ReferralRecord>(
      `SELECT id, organization_id, clinic_id, referring_lead_id, referred_lead_id,
              created_at, status, outcome, data_source, updated_at
       FROM referrals
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [referralId, organizationId]
    );
    if (result.rowCount === 0) return null;
    return result.rows[0];
  } catch (err) {
    logger.error({ err, referralId, organizationId, event: 'get_referral_failed' }, 'Failed to get referral');
    throw err;
  } finally {
    client.release();
  }
};

export const createReferral = async (
  organizationId: string,
  clinicId: string,
  input: CreateReferralInput
): Promise<ReferralRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<ReferralRecord>(
      `INSERT INTO referrals (
         organization_id, clinic_id, referring_lead_id, referred_lead_id,
         created_at, status, outcome, data_source, updated_at
       ) VALUES (
         $1, $2, $3, $4, NOW(), 'New', $5, 'demo', NOW()
       )
       RETURNING id, organization_id, clinic_id, referring_lead_id, referred_lead_id,
                 created_at, status, outcome, data_source, updated_at`,
      [
        organizationId,
        clinicId,
        input.referring_lead_id ?? null,
        input.referred_lead_id ?? null,
        input.outcome ?? null,
      ]
    );
    return result.rows[0];
  } catch (err) {
    logger.error({ err, organizationId, event: 'create_referral_failed' }, 'Failed to create referral');
    throw err;
  } finally {
    client.release();
  }
};

export const updateReferral = async (
  referralId: string,
  organizationId: string,
  input: UpdateReferralInput,
  clinicId: string | null
): Promise<ReferralRecord | null> => {
  const client = await getClient();
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [organizationId];
    let paramIndex = 2;

    if (input.status !== undefined) {
      setClauses.push(`status = $${paramIndex}`);
      values.push(input.status);
      paramIndex++;
    }
    if (input.outcome !== undefined) {
      setClauses.push(`outcome = $${paramIndex}`);
      values.push(input.outcome);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      throw new BadRequestError('No fields to update');
    }

    setClauses.push(`updated_at = NOW()`);

    let whereClause = `WHERE organization_id = $1 AND deleted_at IS NULL`;
    if (clinicId) {
      whereClause += ` AND clinic_id = $${paramIndex}`;
      values.push(clinicId);
      paramIndex++;
    }
    whereClause += ` AND id = $${paramIndex}`;
    values.push(referralId);
    paramIndex++;

    const result = await client.query<ReferralRecord>(
      `UPDATE referrals
       SET ${setClauses.join(', ')}
       ${whereClause}
       RETURNING id, organization_id, clinic_id, referring_lead_id, referred_lead_id,
                 created_at, status, outcome, data_source, updated_at`,
      values
    );

    if (result.rowCount === 0) return null;
    return result.rows[0];
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    logger.error({ err, referralId, organizationId, event: 'update_referral_failed' }, 'Failed to update referral');
    throw err;
  } finally {
    client.release();
  }
};
