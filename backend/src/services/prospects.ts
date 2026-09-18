import { getClient } from '../db/index.js';
import { NotFoundError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface ProspectRecord {
  id: string;
  organization_id: string;
  clinic_name: string;
  doctor_name: string;
  specialty: string;
  area: string;
  phone: string | null;
  website: string | null;
  google_rating: number | null;
  review_count: number | null;
  instagram_url: string | null;
  booking_available: boolean;
  whatsapp_available: boolean;
  visible_advertising: string | null;
  content_quality: 'Low' | 'Medium' | 'High' | null;
  obvious_problem: string | null;
  priority: 'Low' | 'Medium' | 'High' | null;
  source_urls: string[] | null;
  notes: string | null;
  data_source: 'real' | 'demo';
  created_at: string;
  updated_at: string;
}

export interface ListProspectsOptions {
  limit?: number;
  offset?: number;
}

export interface CreateProspectInput {
  clinic_name: string;
  doctor_name: string;
  specialty: string;
  area: string;
  phone?: string | null;
  website?: string | null;
  google_rating?: number | null;
  review_count?: number | null;
  instagram_url?: string | null;
  booking_available?: boolean;
  whatsapp_available?: boolean;
  visible_advertising?: string | null;
  content_quality?: 'Low' | 'Medium' | 'High' | null;
  obvious_problem?: string | null;
  priority?: 'Low' | 'Medium' | 'High' | null;
  source_urls?: string[] | null;
  notes?: string | null;
}

export interface UpdateProspectInput {
  clinic_name?: string;
  doctor_name?: string;
  specialty?: string;
  area?: string;
  phone?: string | null;
  website?: string | null;
  google_rating?: number | null;
  review_count?: number | null;
  instagram_url?: string | null;
  booking_available?: boolean;
  whatsapp_available?: boolean;
  visible_advertising?: string | null;
  content_quality?: 'Low' | 'Medium' | 'High' | null;
  obvious_problem?: string | null;
  priority?: 'Low' | 'Medium' | 'High' | null;
  source_urls?: string[] | null;
  notes?: string | null;
}

export const listProspects = async (
  organizationId: string,
  options: ListProspectsOptions = {}
): Promise<ProspectRecord[]> => {
  const client = await getClient();
  try {
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;

    const result = await client.query<ProspectRecord>(
      `SELECT id, organization_id, clinic_name, doctor_name, specialty, area,
              phone, website, google_rating, review_count, instagram_url,
              booking_available, whatsapp_available, visible_advertising,
              content_quality, obvious_problem, priority, source_urls, notes,
              data_source, created_at, updated_at
       FROM prospects
       WHERE organization_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset]
    );

    return result.rows;
  } catch (err) {
    logger.error({ err, organizationId, event: 'list_prospects_failed' }, 'Failed to list prospects');
    throw err;
  } finally {
    client.release();
  }
};

export const getProspect = async (
  organizationId: string,
  prospectId: string
): Promise<ProspectRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<ProspectRecord>(
      `SELECT id, organization_id, clinic_name, doctor_name, specialty, area,
              phone, website, google_rating, review_count, instagram_url,
              booking_available, whatsapp_available, visible_advertising,
              content_quality, obvious_problem, priority, source_urls, notes,
              data_source, created_at, updated_at
       FROM prospects
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [prospectId, organizationId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Prospect not found');
    }

    return result.rows[0];
  } catch (err) {
    logger.error({ err, organizationId, prospectId, event: 'get_prospect_failed' }, 'Failed to get prospect');
    throw err;
  } finally {
    client.release();
  }
};
export const createProspect = async (
  organizationId: string,
  input: CreateProspectInput
): Promise<ProspectRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<ProspectRecord>(
      `INSERT INTO prospects (
        organization_id, clinic_name, doctor_name, specialty, area,
        phone, website, google_rating, review_count, instagram_url,
        booking_available, whatsapp_available, visible_advertising,
        content_quality, obvious_problem, priority, source_urls, notes
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18
      )
      RETURNING id, organization_id, clinic_name, doctor_name, specialty, area,
                phone, website, google_rating, review_count, instagram_url,
                booking_available, whatsapp_available, visible_advertising,
                content_quality, obvious_problem, priority, source_urls, notes,
                data_source, created_at, updated_at`,
      [
        organizationId,
        input.clinic_name,
        input.doctor_name,
        input.specialty,
        input.area,
        input.phone ?? null,
        input.website ?? null,
        input.google_rating ?? null,
        input.review_count ?? null,
        input.instagram_url ?? null,
        input.booking_available ?? false,
        input.whatsapp_available ?? false,
        input.visible_advertising ?? null,
        input.content_quality ?? null,
        input.obvious_problem ?? null,
        input.priority ?? null,
        input.source_urls ?? null,
        input.notes ?? null,
      ]
    );

    return result.rows[0];
  } catch (err) {
    logger.error({ err, organizationId, event: 'create_prospect_failed' }, 'Failed to create prospect');
    throw err;
  } finally {
    client.release();
  }
};

export const updateProspect = async (
  organizationId: string,
  prospectId: string,
  input: UpdateProspectInput
): Promise<ProspectRecord> => {
  const client = await getClient();
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [prospectId, organizationId];
    let paramIndex = 3;

    const updatableFields: (keyof UpdateProspectInput)[] = [
      'clinic_name', 'doctor_name', 'specialty', 'area',
      'phone', 'website', 'google_rating', 'review_count',
      'instagram_url', 'booking_available', 'whatsapp_available',
      'visible_advertising', 'content_quality', 'obvious_problem',
      'priority', 'source_urls', 'notes',
    ];

    for (const field of updatableFields) {
      if (input[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(input[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No fields to update');
    }

    setClauses.push(`updated_at = NOW()`);

    const result = await client.query<ProspectRecord>(
      `UPDATE prospects
       SET ${setClauses.join(', ')}
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
       RETURNING id, organization_id, clinic_name, doctor_name, specialty, area,
                 phone, website, google_rating, review_count, instagram_url,
                 booking_available, whatsapp_available, visible_advertising,
                 content_quality, obvious_problem, priority, source_urls, notes,
                 data_source, created_at, updated_at`,
      values
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Prospect not found');
    }

    return result.rows[0];
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw err;
    }
    logger.error({ err, organizationId, prospectId, event: 'update_prospect_failed' }, 'Failed to update prospect');
    throw err;
  } finally {
    client.release();
  }
};
