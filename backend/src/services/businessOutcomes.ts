import { getClient } from '../db/index.js';
import { BadRequestError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type ConfidenceLevel = 'Low' | 'Medium' | 'High';
export type DataSource = 'real' | 'demo';

export interface BusinessOutcomeRecord {
  id: string;
  organization_id: string;
  clinic_id: string;
  appointment_id: string | null;
  amount_inr: string;
  recorded_at: string;
  attribution_source: string | null;
  attribution_confidence: ConfidenceLevel | null;
  data_source: DataSource;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateBusinessOutcomeInput {
  appointment_id?: string | null;
  amount_inr: number;
  recorded_at?: string;
  attribution_source?: string | null;
  attribution_confidence?: ConfidenceLevel | null;
}

export interface UpdateBusinessOutcomeInput {
  amount_inr?: number;
  recorded_at?: string;
  attribution_source?: string | null;
  attribution_confidence?: ConfidenceLevel | null;
}

export interface BusinessOutcomeListResponse {
  business_outcomes: BusinessOutcomeRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export const listBusinessOutcomes = async (
  organizationId: string,
  clinicId: string | null,
  page: number,
  limit: number
): Promise<BusinessOutcomeListResponse> => {
  const client = await getClient();
  try {
    const offset = (page - 1) * limit;

    if (clinicId) {
      const countResult = await client.query<{ total: number }>(
        `SELECT COUNT(*)::INTEGER as total FROM business_outcomes WHERE organization_id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
        [organizationId, clinicId]
      );
      const total = countResult.rows[0]?.total ?? 0;

      const listResult = await client.query<BusinessOutcomeRecord>(
        `SELECT id, organization_id, clinic_id, appointment_id, amount_inr,
                recorded_at, attribution_source, attribution_confidence,
                data_source, created_at, updated_at
         FROM business_outcomes
         WHERE organization_id = $1 AND clinic_id = $2 AND deleted_at IS NULL
         ORDER BY recorded_at DESC
         LIMIT $3 OFFSET $4`,
        [organizationId, clinicId, limit, offset]
      );
      const hasMore = offset + listResult.rows.length < total;
      return { business_outcomes: listResult.rows, pagination: { page, limit, total, hasMore } };
    }

    const countResult = await client.query<{ total: number }>(
      `SELECT COUNT(*)::INTEGER as total FROM business_outcomes WHERE organization_id = $1 AND deleted_at IS NULL`,
      [organizationId]
    );
    const total = countResult.rows[0]?.total ?? 0;

    const listResult = await client.query<BusinessOutcomeRecord>(
      `SELECT id, organization_id, clinic_id, appointment_id, amount_inr,
              recorded_at, attribution_source, attribution_confidence,
              data_source, created_at, updated_at
       FROM business_outcomes
       WHERE organization_id = $1 AND deleted_at IS NULL
       ORDER BY recorded_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset]
    );
    const hasMore = offset + listResult.rows.length < total;
    return { business_outcomes: listResult.rows, pagination: { page, limit, total, hasMore } };
  } catch (err) {
    logger.error({ err, organizationId, event: 'list_business_outcomes_failed' }, 'Failed to list business outcomes');
    throw err;
  } finally {
    client.release();
  }
};

export const getBusinessOutcomeById = async (
  outcomeId: string,
  organizationId: string,
  clinicId: string | null
): Promise<BusinessOutcomeRecord | null> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query<BusinessOutcomeRecord>(
        `SELECT id, organization_id, clinic_id, appointment_id, amount_inr,
                recorded_at, attribution_source, attribution_confidence,
                data_source, created_at, updated_at
         FROM business_outcomes
         WHERE id = $1 AND organization_id = $2 AND clinic_id = $3 AND deleted_at IS NULL`,
        [outcomeId, organizationId, clinicId]
      );
      if (result.rowCount === 0) return null;
      return result.rows[0];
    }

    const result = await client.query<BusinessOutcomeRecord>(
      `SELECT id, organization_id, clinic_id, appointment_id, amount_inr,
              recorded_at, attribution_source, attribution_confidence,
              data_source, created_at, updated_at
       FROM business_outcomes
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [outcomeId, organizationId]
    );
    if (result.rowCount === 0) return null;
    return result.rows[0];
  } catch (err) {
    logger.error({ err, outcomeId, organizationId, event: 'get_business_outcome_failed' }, 'Failed to get business outcome');
    throw err;
  } finally {
    client.release();
  }
};

export const createBusinessOutcome = async (
  organizationId: string,
  clinicId: string,
  input: CreateBusinessOutcomeInput
): Promise<BusinessOutcomeRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<BusinessOutcomeRecord>(
      `INSERT INTO business_outcomes (
         organization_id, clinic_id, appointment_id, amount_inr, recorded_at,
         attribution_source, attribution_confidence, data_source
       ) VALUES (
         $1, $2, $3, $4, COALESCE($5, NOW()), $6, $7, 'demo'
       )
       RETURNING id, organization_id, clinic_id, appointment_id, amount_inr,
                 recorded_at, attribution_source, attribution_confidence,
                 data_source, created_at, updated_at`,
      [
        organizationId,
        clinicId,
        input.appointment_id ?? null,
        input.amount_inr,
        input.recorded_at ?? null,
        input.attribution_source ?? null,
        input.attribution_confidence ?? null,
       ]
     );
     const row = result.rows[0];
     return { ...row, amount_inr: String(row.amount_inr) };
   } catch (err) {
     logger.error({ err, organizationId, event: 'create_business_outcome_failed' }, 'Failed to create business outcome');
    throw err;
  } finally {
    client.release();
  }
};

export const updateBusinessOutcome = async (
  outcomeId: string,
  organizationId: string,
  input: UpdateBusinessOutcomeInput,
  clinicId: string | null
): Promise<BusinessOutcomeRecord | null> => {
  const client = await getClient();
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [organizationId];
    let paramIndex = 2;

    if (input.amount_inr !== undefined) {
      setClauses.push(`amount_inr = $${paramIndex}`);
      values.push(input.amount_inr);
      paramIndex++;
    }
    if (input.recorded_at !== undefined) {
      setClauses.push(`recorded_at = $${paramIndex}`);
      values.push(input.recorded_at);
      paramIndex++;
    }
    if (input.attribution_source !== undefined) {
      setClauses.push(`attribution_source = $${paramIndex}`);
      values.push(input.attribution_source);
      paramIndex++;
    }
    if (input.attribution_confidence !== undefined) {
      setClauses.push(`attribution_confidence = $${paramIndex}`);
      values.push(input.attribution_confidence);
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
    values.push(outcomeId);
    paramIndex++;

    const result = await client.query<BusinessOutcomeRecord>(
      `UPDATE business_outcomes
       SET ${setClauses.join(', ')}
       ${whereClause}
       RETURNING id, organization_id, clinic_id, appointment_id, amount_inr,
                 recorded_at, attribution_source, attribution_confidence,
                 data_source, created_at, updated_at`,
      values
    );

    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return { ...row, amount_inr: String(row.amount_inr) };
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    logger.error({ err, outcomeId, organizationId, event: 'update_business_outcome_failed' }, 'Failed to update business outcome');
    throw err;
  } finally {
    client.release();
  }
};
