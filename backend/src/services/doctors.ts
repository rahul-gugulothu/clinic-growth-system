import { getClient } from '../db/index.js';
import { BadRequestError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type DoctorRole = 'Owner' | 'Consultant' | 'Resident';
export type PersonStatus = 'Active' | 'Inactive';
export type DataSource = 'real' | 'demo';

export interface DoctorRecord {
  id: string;
  organization_id: string;
  clinic_id: string;
  name: string;
  specialty: string;
  role: DoctorRole;
  status: PersonStatus;
  data_source: DataSource;
  created_at: string;
  updated_at: string;
}

export interface CreateDoctorInput {
  name: string;
  specialty: string;
  role: DoctorRole;
  status?: PersonStatus;
}

export type UpdateDoctorInput = Partial<CreateDoctorInput>;

export const listDoctors = async (
  clinicId: string,
  organizationId: string
): Promise<DoctorRecord[]> => {
  const client = await getClient();
  try {
    const result = await client.query<DoctorRecord>(
      `SELECT id, organization_id, clinic_id, name, specialty, role, status,
              data_source, created_at, updated_at
       FROM doctors
       WHERE clinic_id = $1 AND organization_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [clinicId, organizationId]
    );

    return result.rows;
  } catch (err) {
    logger.error({ err, clinicId, organizationId, event: 'list_doctors_failed' }, 'Failed to list doctors');
    throw err;
  } finally {
    client.release();
  }
};

export const getDoctor = async (
  doctorId: string,
  organizationId: string,
  clinicId?: string | null
): Promise<DoctorRecord | null> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query<DoctorRecord>(
        `SELECT id, organization_id, clinic_id, name, specialty, role, status,
                data_source, created_at, updated_at
         FROM doctors
         WHERE id = $1 AND organization_id = $2 AND clinic_id = $3 AND deleted_at IS NULL`,
        [doctorId, organizationId, clinicId]
      );

      if (result.rowCount === 0) {
        return null;
      }

      return result.rows[0];
    }

    const result = await client.query<DoctorRecord>(
      `SELECT id, organization_id, clinic_id, name, specialty, role, status,
              data_source, created_at, updated_at
       FROM doctors
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [doctorId, organizationId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } catch (err) {
    logger.error({ err, doctorId, organizationId, event: 'get_doctor_failed' }, 'Failed to get doctor');
    throw err;
  } finally {
    client.release();
  }
};

export const createDoctor = async (
  clinicId: string,
  organizationId: string,
  input: CreateDoctorInput
): Promise<DoctorRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<DoctorRecord>(
      `INSERT INTO doctors (
         organization_id, clinic_id, name, specialty, role, status, data_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'demo'
       )
       RETURNING id, organization_id, clinic_id, name, specialty, role, status,
                 data_source, created_at, updated_at`,
      [
        organizationId,
        clinicId,
        input.name,
        input.specialty,
        input.role,
        input.status ?? 'Active',
      ]
    );

    return result.rows[0];
  } catch (err) {
    logger.error({ err, clinicId, organizationId, event: 'create_doctor_failed' }, 'Failed to create doctor');
    throw err;
  } finally {
    client.release();
  }
};

export const updateDoctor = async (
  doctorId: string,
  organizationId: string,
  input: UpdateDoctorInput,
  clinicId?: string | null
): Promise<DoctorRecord | null> => {
  const client = await getClient();
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [doctorId, organizationId];
    let paramIndex = 3;

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIndex}`);
      values.push(input.name);
      paramIndex++;
    }
    if (input.specialty !== undefined) {
      setClauses.push(`specialty = $${paramIndex}`);
      values.push(input.specialty);
      paramIndex++;
    }
    if (input.role !== undefined) {
      setClauses.push(`role = $${paramIndex}`);
      values.push(input.role);
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

    const result = await client.query<DoctorRecord>(
      `UPDATE doctors
       SET ${setClauses.join(', ')}
       WHERE id = $1 AND organization_id = $2${whereClinic} AND deleted_at IS NULL
       RETURNING id, organization_id, clinic_id, name, specialty, role, status,
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
    logger.error({ err, doctorId, organizationId, event: 'update_doctor_failed' }, 'Failed to update doctor');
    throw err;
  } finally {
    client.release();
  }
};
