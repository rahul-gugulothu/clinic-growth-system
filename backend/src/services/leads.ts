import { getClient } from '../db/index.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Booked' | 'Attended' | 'Lost';
export type DataSource = 'real' | 'demo';

export interface LeadRecord {
  id: string;
  organization_id: string;
  clinic_id: string;
  source: string;
  created_at: string;
  service_interested: string | null;
  status: LeadStatus;
  assigned_staff_id: string | null;
  last_contact_at: string | null;
  next_action: string | null;
  data_source: DataSource;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateLeadInput {
  source: string;
  service_interested?: string | null;
  status?: LeadStatus;
  assigned_staff_id?: string | null;
  last_contact_at?: string | null;
  next_action?: string | null;
}

export type UpdateLeadInput = Partial<CreateLeadInput>;

export interface LeadListResponse {
  leads: LeadRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export const listLeads = async (
  organizationId: string,
  clinicId: string | null,
  page: number,
  limit: number
): Promise<LeadListResponse> => {
  const client = await getClient();
  try {
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE organization_id = $1 AND deleted_at IS NULL';
    const values: unknown[] = [organizationId];
    let paramIndex = 2;

    if (clinicId) {
      whereClause += ` AND clinic_id = $${paramIndex}`;
      values.push(clinicId);
      paramIndex++;
    }

    const countResult = await client.query(
      `SELECT COUNT(*)::INTEGER as total FROM leads ${whereClause}`,
      values.slice()
    );

    const total = countResult.rows[0]?.total ?? 0;

    const listValues = [...values, limit, offset];
    const listResult = await client.query<LeadRecord>(
      `SELECT id, organization_id, clinic_id, source, created_at, service_interested,
              status, assigned_staff_id, last_contact_at, next_action, data_source,
              updated_at
       FROM leads
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues
    );

    const hasMore = offset + listResult.rows.length < total;

    return {
      leads: listResult.rows,
      pagination: {
        page,
        limit,
        total,
        hasMore,
      },
    };
  } catch (err) {
    logger.error({ err, organizationId, event: 'list_leads_failed' }, 'Failed to list leads');
    throw err;
  } finally {
    client.release();
  }
};

export const getLeadById = async (
  leadId: string,
  organizationId: string,
  clinicId: string | null
): Promise<LeadRecord | null> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query<LeadRecord>(
        `SELECT id, organization_id, clinic_id, source, created_at, service_interested,
                status, assigned_staff_id, last_contact_at, next_action, data_source,
                updated_at
         FROM leads
         WHERE id = $1 AND organization_id = $2 AND clinic_id = $3 AND deleted_at IS NULL`,
        [leadId, organizationId, clinicId]
      );

      if (result.rowCount === 0) {
        return null;
      }

      return result.rows[0];
    }

    const result = await client.query<LeadRecord>(
      `SELECT id, organization_id, clinic_id, source, created_at, service_interested,
              status, assigned_staff_id, last_contact_at, next_action, data_source,
              updated_at
       FROM leads
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [leadId, organizationId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } catch (err) {
    logger.error({ err, leadId, organizationId, event: 'get_lead_failed' }, 'Failed to get lead');
    throw err;
  } finally {
    client.release();
  }
};

export const createLead = async (
  organizationId: string,
  clinicId: string,
  input: CreateLeadInput
): Promise<LeadRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<LeadRecord>(
      `INSERT INTO leads (
         organization_id, clinic_id, source, service_interested, status,
         assigned_staff_id, last_contact_at, next_action, data_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, 'demo'
       )
       RETURNING id, organization_id, clinic_id, source, created_at, service_interested,
                 status, assigned_staff_id, last_contact_at, next_action, data_source,
                 updated_at`,
      [
        organizationId,
        clinicId,
        input.source,
        input.service_interested ?? null,
        input.status ?? 'New',
        input.assigned_staff_id ?? null,
        input.last_contact_at ?? null,
        input.next_action ?? null,
      ]
    );

    return result.rows[0];
  } catch (err) {
    logger.error({ err, organizationId, clinicId, event: 'create_lead_failed' }, 'Failed to create lead');
    throw err;
  } finally {
    client.release();
  }
};

export const updateLead = async (
  leadId: string,
  organizationId: string,
  input: UpdateLeadInput,
  clinicId: string | null
): Promise<LeadRecord | null> => {
  const client = await getClient();
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [leadId, organizationId];
    let paramIndex = 3;

    const updatableFields: (keyof UpdateLeadInput)[] = [
      'source', 'service_interested', 'status', 'assigned_staff_id',
      'last_contact_at', 'next_action',
    ];

    for (const field of updatableFields) {
      if (input[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(input[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      throw new BadRequestError('No fields to update');
    }

    setClauses.push(`updated_at = NOW()`);

    const whereClinic = clinicId ? ` AND clinic_id = $${paramIndex}` : '';
    if (clinicId) {
      values.push(clinicId);
    }

    const result = await client.query<LeadRecord>(
      `UPDATE leads
       SET ${setClauses.join(', ')}
       WHERE id = $1 AND organization_id = $2${whereClinic} AND deleted_at IS NULL
       RETURNING id, organization_id, clinic_id, source, created_at, service_interested,
                 status, assigned_staff_id, last_contact_at, next_action, data_source,
                 updated_at`,
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
    logger.error({ err, leadId, organizationId, event: 'update_lead_failed' }, 'Failed to update lead');
    throw err;
  } finally {
    client.release();
  }
};

export const validateStaffAssignment = async (
  staffId: string,
  organizationId: string
): Promise<void> => {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT id FROM staff WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [staffId, organizationId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Assigned staff not found');
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw err;
    }
    logger.error({ err, staffId, organizationId, event: 'validate_staff_assignment_failed' }, 'Failed to validate staff assignment');
    throw err;
  } finally {
    client.release();
  }
};

export const validateClinic = async (
  clinicId: string,
  organizationId: string
): Promise<void> => {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT id FROM clinics WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [clinicId, organizationId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Clinic not found');
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw err;
    }
    logger.error({ err, clinicId, organizationId, event: 'validate_clinic_failed' }, 'Failed to validate clinic');
    throw err;
  } finally {
    client.release();
  }
};
