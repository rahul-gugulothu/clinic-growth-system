import { getClient } from '../db/index.js';
import { NotFoundError, BadRequestError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type ClinicStatus = 'Onboarding' | 'Active' | 'Paused' | 'Churned';
export type DataSource = 'real' | 'demo';

export interface ClinicRecord {
  id: string;
  organization_id: string;
  prospect_id: string;
  name: string;
  specialty: string;
  address: string;
  city: string;
  phone: string;
  website: string | null;
  whatsapp_number: string | null;
  working_hours: string | null;
  status: ClinicStatus;
  data_source: DataSource;
  created_at: string;
  updated_at: string;
}

export interface UpdateClinicInput {
  name?: string;
  specialty?: string;
  address?: string;
  city?: string;
  phone?: string;
  website?: string | null;
  whatsapp_number?: string | null;
  working_hours?: string | null;
  status?: ClinicStatus;
}

export const getClinic = async (
  clinicId: string,
  organizationId: string
): Promise<ClinicRecord | null> => {
  const client = await getClient();
  try {
    const result = await client.query<ClinicRecord>(
      `SELECT id, organization_id, prospect_id, name, specialty, address, city, phone,
              website, whatsapp_number, working_hours, status, data_source,
              created_at, updated_at
       FROM clinics
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [clinicId, organizationId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } catch (err) {
    logger.error({ err, clinicId, organizationId, event: 'get_clinic_failed' }, 'Failed to get clinic');
    throw err;
  } finally {
    client.release();
  }
};

export const updateClinic = async (
  clinicId: string,
  organizationId: string,
  input: UpdateClinicInput
): Promise<ClinicRecord | null> => {
  const client = await getClient();
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [clinicId, organizationId];
    let paramIndex = 3;

    const updatableFields: (keyof UpdateClinicInput)[] = [
      'name', 'specialty', 'address', 'city', 'phone',
      'website', 'whatsapp_number', 'working_hours', 'status',
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

    const result = await client.query<ClinicRecord>(
      `UPDATE clinics
       SET ${setClauses.join(', ')}
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
       RETURNING id, organization_id, prospect_id, name, specialty, address, city, phone,
                 website, whatsapp_number, working_hours, status, data_source,
                 created_at, updated_at`,
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
    logger.error({ err, clinicId, organizationId, event: 'update_clinic_failed' }, 'Failed to update clinic');
    throw err;
  } finally {
    client.release();
  }
};

export interface OnboardFromProspectInput {
  address?: string;
  whatsapp_number?: string | null;
  working_hours?: string | null;
}

export const onboardFromProspect = async (
  prospectId: string,
  organizationId: string,
  input: OnboardFromProspectInput = {}
): Promise<ClinicRecord> => {
  const client = await getClient();
  try {
    const prospectResult = await client.query(
      `SELECT id, clinic_name, doctor_name, specialty, area, phone, website
       FROM prospects
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [prospectId, organizationId]
    );

    if (prospectResult.rowCount === 0) {
      throw new NotFoundError('Prospect not found');
    }

    const prospect = prospectResult.rows[0];

    const existingClinic = await client.query(
      `SELECT id FROM clinics WHERE prospect_id = $1 AND deleted_at IS NULL`,
      [prospectId]
    );

    if ((existingClinic.rowCount ?? 0) > 0) {
      throw new BadRequestError('Clinic already onboarded for this prospect');
    }

    const address = input.address ?? prospect.area;

    const result = await client.query<ClinicRecord>(
      `INSERT INTO clinics (
         organization_id, prospect_id, name, specialty, address, city, phone,
         website, whatsapp_number, working_hours, status, data_source
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Onboarding', 'demo'
       )
       RETURNING id, organization_id, prospect_id, name, specialty, address, city, phone,
                 website, whatsapp_number, working_hours, status, data_source,
                 created_at, updated_at`,
      [
        organizationId,
        prospectId,
        prospect.clinic_name,
        prospect.specialty,
        address,
        prospect.area,
        prospect.phone ?? '',
        prospect.website ?? null,
        input.whatsapp_number ?? null,
        input.working_hours ?? null,
      ]
    );

    logger.info(
      { clinicId: result.rows[0].id, prospectId, organizationId, event: 'clinic_onboarded' },
      'Clinic onboarded from prospect'
    );

    return result.rows[0];
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof BadRequestError) {
      throw err;
    }
    logger.error({ err, prospectId, organizationId, event: 'onboard_from_prospect_failed' }, 'Failed to onboard clinic');
    throw err;
  } finally {
    client.release();
  }
};
