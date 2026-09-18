import { getClient } from '../db/index.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type ReviewStatus = 'Requested' | 'Received' | 'Declined';
export type ReviewSource = 'Google' | 'Practo' | 'Justdial' | 'Other';
export type DataSource = 'real' | 'demo';

export interface ReviewRecord {
  id: string;
  organization_id: string;
  clinic_id: string;
  appointment_id: string | null;
  requested_at: string;
  status: ReviewStatus;
  rating: number | null;
  source: ReviewSource;
  data_source: DataSource;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateReviewInput {
  appointment_id?: string | null;
  rating?: number | null;
  source?: ReviewSource;
}

export interface UpdateReviewInput {
  status?: ReviewStatus;
  rating?: number | null;
  source?: ReviewSource;
}

export interface ReviewListResponse {
  reviews: ReviewRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

const REVIEW_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  Requested: ['Received', 'Declined'],
  Received: [],
  Declined: [],
};

export const validateReviewStatusTransition = (
  current: ReviewStatus,
  next: ReviewStatus
): void => {
  if (!REVIEW_TRANSITIONS[current]?.includes(next)) {
    throw new BadRequestError(
      `Invalid status transition: ${current} -> ${next}`
    );
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

export const validateAppointmentClinic = async (
  appointmentId: string,
  organizationId: string,
  clinicId: string | null
): Promise<void> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query(
        `SELECT a.id FROM appointments a
         JOIN leads l ON a.lead_id = l.id
         WHERE a.id = $1 AND a.organization_id = $2 AND l.clinic_id = $3 AND a.deleted_at IS NULL`,
        [appointmentId, organizationId, clinicId]
      );
      if (result.rowCount === 0) {
        throw new NotFoundError('Appointment not found');
      }
      return;
    }
    const result = await client.query(
      `SELECT id FROM appointments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [appointmentId, organizationId]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Appointment not found');
    }
  } catch (err) {
    if (err instanceof NotFoundError) throw err;
    logger.error({ err, appointmentId, organizationId, event: 'validate_appointment_clinic_failed' }, 'Failed to validate appointment clinic');
    throw err;
  } finally {
    client.release();
  }
};

export const listReviews = async (
  organizationId: string,
  clinicId: string | null,
  page: number,
  limit: number
): Promise<ReviewListResponse> => {
  const client = await getClient();
  try {
    const offset = (page - 1) * limit;

    if (clinicId) {
      const countResult = await client.query<{ total: number }>(
        `SELECT COUNT(*)::INTEGER as total FROM reviews WHERE organization_id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
        [organizationId, clinicId]
      );
      const total = countResult.rows[0]?.total ?? 0;

      const listResult = await client.query<ReviewRecord>(
        `SELECT id, organization_id, clinic_id, appointment_id, requested_at,
                status, rating, source, data_source, created_at, updated_at
         FROM reviews
         WHERE organization_id = $1 AND clinic_id = $2 AND deleted_at IS NULL
         ORDER BY requested_at DESC
         LIMIT $3 OFFSET $4`,
        [organizationId, clinicId, limit, offset]
      );
      const hasMore = offset + listResult.rows.length < total;
      return { reviews: listResult.rows, pagination: { page, limit, total, hasMore } };
    }

    const countResult = await client.query<{ total: number }>(
      `SELECT COUNT(*)::INTEGER as total FROM reviews WHERE organization_id = $1 AND deleted_at IS NULL`,
      [organizationId]
    );
    const total = countResult.rows[0]?.total ?? 0;

    const listResult = await client.query<ReviewRecord>(
      `SELECT id, organization_id, clinic_id, appointment_id, requested_at,
              status, rating, source, data_source, created_at, updated_at
       FROM reviews
       WHERE organization_id = $1 AND deleted_at IS NULL
       ORDER BY requested_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset]
    );
    const hasMore = offset + listResult.rows.length < total;
    return { reviews: listResult.rows, pagination: { page, limit, total, hasMore } };
  } catch (err) {
    logger.error({ err, organizationId, event: 'list_reviews_failed' }, 'Failed to list reviews');
    throw err;
  } finally {
    client.release();
  }
};

export const getReviewById = async (
  reviewId: string,
  organizationId: string,
  clinicId: string | null
): Promise<ReviewRecord | null> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query<ReviewRecord>(
        `SELECT id, organization_id, clinic_id, appointment_id, requested_at,
                status, rating, source, data_source, created_at, updated_at
         FROM reviews
         WHERE id = $1 AND organization_id = $2 AND clinic_id = $3 AND deleted_at IS NULL`,
        [reviewId, organizationId, clinicId]
      );
      if (result.rowCount === 0) return null;
      return result.rows[0];
    }

    const result = await client.query<ReviewRecord>(
      `SELECT id, organization_id, clinic_id, appointment_id, requested_at,
              status, rating, source, data_source, created_at, updated_at
       FROM reviews
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [reviewId, organizationId]
    );
    if (result.rowCount === 0) return null;
    return result.rows[0];
  } catch (err) {
    logger.error({ err, reviewId, organizationId, event: 'get_review_failed' }, 'Failed to get review');
    throw err;
  } finally {
    client.release();
  }
};

export const createReview = async (
  organizationId: string,
  clinicId: string,
  input: CreateReviewInput
): Promise<ReviewRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<ReviewRecord>(
      `INSERT INTO reviews (
         organization_id, clinic_id, appointment_id, requested_at, status, rating, source, data_source
       ) VALUES (
         $1, $2, $3, NOW(), 'Requested', $4, $5, 'demo'
       )
       RETURNING id, organization_id, clinic_id, appointment_id, requested_at,
                 status, rating, source, data_source, created_at, updated_at`,
      [
        organizationId,
        clinicId,
        input.appointment_id ?? null,
        input.rating ?? null,
        input.source ?? 'Other',
      ]
    );
    return result.rows[0];
  } catch (err) {
    logger.error({ err, organizationId, event: 'create_review_failed' }, 'Failed to create review');
    throw err;
  } finally {
    client.release();
  }
};

export const updateReview = async (
  reviewId: string,
  organizationId: string,
  input: UpdateReviewInput,
  clinicId: string | null
): Promise<ReviewRecord | null> => {
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
    if (input.rating !== undefined) {
      setClauses.push(`rating = $${paramIndex}`);
      values.push(input.rating);
      paramIndex++;
    }
    if (input.source !== undefined) {
      setClauses.push(`source = $${paramIndex}`);
      values.push(input.source);
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
    values.push(reviewId);
    paramIndex++;

    const result = await client.query<ReviewRecord>(
      `UPDATE reviews
       SET ${setClauses.join(', ')}
       ${whereClause}
       RETURNING id, organization_id, clinic_id, appointment_id, requested_at,
                 status, rating, source, data_source, created_at, updated_at`,
      values
    );

    if (result.rowCount === 0) return null;
    return result.rows[0];
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    logger.error({ err, reviewId, organizationId, event: 'update_review_failed' }, 'Failed to update review');
    throw err;
  } finally {
    client.release();
  }
};
