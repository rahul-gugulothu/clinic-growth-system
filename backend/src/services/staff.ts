import { getClient } from '../db/index.js';
import { BadRequestError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type StaffRole = 'Reception' | 'Coordinator' | 'Manager';
export type PersonStatus = 'Active' | 'Inactive';
export type DataSource = 'real' | 'demo';

export interface StaffRecord {
  id: string;
  organization_id: string;
  clinic_id: string;
  name: string;
  role: StaffRole;
  email: string | null;
  phone: string | null;
  status: PersonStatus;
  data_source: DataSource;
  created_at: string;
  updated_at: string;
}

export interface CreateStaffInput {
  name: string;
  role: StaffRole;
  email?: string | null;
  phone?: string | null;
  status?: PersonStatus;
}

export type UpdateStaffInput = Partial<CreateStaffInput>;

export const listStaff = async (
  clinicId: string,
  organizationId: string
): Promise<StaffRecord[]> => {
  const client = await getClient();
  try {
    const result = await client.query<StaffRecord>(
      `SELECT id, organization_id, clinic_id, name, role, email, phone, status,
              data_source, created_at, updated_at
       FROM staff
       WHERE clinic_id = $1 AND organization_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [clinicId, organizationId]
    );

    return result.rows;
  } catch (err) {
    logger.error({ err, clinicId, organizationId, event: 'list_staff_failed' }, 'Failed to list staff');
    throw err;
  } finally {
    client.release();
  }
};

export const getStaffById = async (
  staffId: string,
  organizationId: string,
  clinicId?: string | null
): Promise<StaffRecord | null> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query<StaffRecord>(
        `SELECT id, organization_id, clinic_id, name, role, email, phone, status,
                data_source, created_at, updated_at
         FROM staff
         WHERE id = $1 AND organization_id = $2 AND clinic_id = $3 AND deleted_at IS NULL`,
        [staffId, organizationId, clinicId]
      );

      if (result.rowCount === 0) {
        return null;
      }

      return result.rows[0];
    }

    const result = await client.query<StaffRecord>(
      `SELECT id, organization_id, clinic_id, name, role, email, phone, status,
              data_source, created_at, updated_at
       FROM staff
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [staffId, organizationId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } catch (err) {
    logger.error({ err, staffId, organizationId, event: 'get_staff_failed' }, 'Failed to get staff');
    throw err;
  } finally {
    client.release();
  }
};

export const createStaff = async (
  clinicId: string,
  organizationId: string,
  input: CreateStaffInput
): Promise<StaffRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<StaffRecord>(
      `INSERT INTO staff (
         organization_id, clinic_id, name, role, email, phone, status, data_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'demo'
       )
       RETURNING id, organization_id, clinic_id, name, role, email, phone, status,
                 data_source, created_at, updated_at`,
      [
        organizationId,
        clinicId,
        input.name,
        input.role,
        input.email ?? null,
        input.phone ?? null,
        input.status ?? 'Active',
      ]
    );

    return result.rows[0];
  } catch (err) {
    logger.error({ err, clinicId, organizationId, event: 'create_staff_failed' }, 'Failed to create staff');
    throw err;
  } finally {
    client.release();
  }
};

export const updateStaff = async (
  staffId: string,
  organizationId: string,
  input: UpdateStaffInput,
  clinicId?: string | null
): Promise<StaffRecord | null> => {
  const client = await getClient();
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [staffId, organizationId];
    let paramIndex = 3;

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIndex}`);
      values.push(input.name);
      paramIndex++;
    }
    if (input.role !== undefined) {
      setClauses.push(`role = $${paramIndex}`);
      values.push(input.role);
      paramIndex++;
    }
    if (input.email !== undefined) {
      setClauses.push(`email = $${paramIndex}`);
      values.push(input.email);
      paramIndex++;
    }
    if (input.phone !== undefined) {
      setClauses.push(`phone = $${paramIndex}`);
      values.push(input.phone);
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

    const whereClinic = clinicId ? ` AND clinic_id = $${paramIndex}` : '';
    if (clinicId) {
      values.push(clinicId);
    }

    const result = await client.query<StaffRecord>(
      `UPDATE staff
       SET ${setClauses.join(', ')}
       WHERE id = $1 AND organization_id = $2${whereClinic} AND deleted_at IS NULL
       RETURNING id, organization_id, clinic_id, name, role, email, phone, status,
                 data_source, created_at, updated_at`,
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
    logger.error({ err, staffId, organizationId, event: 'update_staff_failed' }, 'Failed to update staff');
    throw err;
  } finally {
    client.release();
  }
};
