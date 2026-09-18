import { getClient } from '../db/index.js';
import { BadRequestError, NotFoundError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type AppointmentStatus = 'Booked' | 'Attended' | 'NoShow' | 'Cancelled';
export type ReminderStatus = 'Pending' | 'Sent' | 'Skipped';
export type DataSource = 'real' | 'demo';

export interface AppointmentRecord {
  id: string;
  organization_id: string;
  lead_id: string;
  doctor_id: string;
  scheduled_at: string;
  status: AppointmentStatus;
  reminder_status: ReminderStatus;
  attended_at: string | null;
  data_source: DataSource;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateAppointmentInput {
  lead_id: string;
  doctor_id: string;
  scheduled_at: string;
}

export interface UpdateAppointmentInput {
  scheduled_at?: string;
  status?: AppointmentStatus;
  reminder_status?: ReminderStatus;
  attended_at?: string | null;
}

export interface AppointmentListResponse {
  appointments: AppointmentRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  Booked: ['Attended', 'NoShow', 'Cancelled'],
  Attended: [],
  NoShow: ['Cancelled'],
  Cancelled: [],
};

export const validateAppointmentStatusTransition = (
  current: AppointmentStatus,
  next: AppointmentStatus
): void => {
  if (!APPOINTMENT_TRANSITIONS[current]?.includes(next)) {
    throw new BadRequestError(
      `Invalid status transition: ${current} → ${next}`
    );
  }
};

export const validateLeadClinic = async (
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
    logger.error({ err, leadId, organizationId, event: 'validate_lead_clinic_failed' }, 'Failed to validate lead clinic');
    throw err;
  } finally {
    client.release();
  }
};

export const validateDoctorClinic = async (
  doctorId: string,
  organizationId: string,
  clinicId: string | null
): Promise<void> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query(
        `SELECT id FROM doctors WHERE id = $1 AND organization_id = $2 AND clinic_id = $3 AND deleted_at IS NULL`,
        [doctorId, organizationId, clinicId]
      );
      if (result.rowCount === 0) {
        throw new NotFoundError('Doctor not found');
      }
      return;
    }
    const result = await client.query(
      `SELECT id FROM doctors WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [doctorId, organizationId]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Doctor not found');
    }
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw err;
    }
    logger.error({ err, doctorId, organizationId, event: 'validate_doctor_clinic_failed' }, 'Failed to validate doctor clinic');
    throw err;
  } finally {
    client.release();
  }
};

export const listAppointments = async (
  organizationId: string,
  clinicId: string | null,
  page: number,
  limit: number
): Promise<AppointmentListResponse> => {
  const client = await getClient();
  try {
    const offset = (page - 1) * limit;

    if (clinicId) {
      const countResult = await client.query<{ total: number }>(
        `SELECT COUNT(*)::INTEGER as total
         FROM appointments a
         JOIN leads l ON a.lead_id = l.id
         WHERE a.organization_id = $1 AND l.clinic_id = $2 AND a.deleted_at IS NULL`,
        [organizationId, clinicId]
      );
      const total = countResult.rows[0]?.total ?? 0;

      const listResult = await client.query<AppointmentRecord>(
        `SELECT a.id, a.organization_id, a.lead_id, a.doctor_id, a.scheduled_at,
                a.status, a.reminder_status, a.attended_at, a.data_source,
                a.created_at, a.updated_at
         FROM appointments a
         JOIN leads l ON a.lead_id = l.id
         WHERE a.organization_id = $1 AND l.clinic_id = $2 AND a.deleted_at IS NULL
         ORDER BY a.scheduled_at DESC
         LIMIT $3 OFFSET $4`,
        [organizationId, clinicId, limit, offset]
      );
      const hasMore = offset + listResult.rows.length < total;
      return { appointments: listResult.rows, pagination: { page, limit, total, hasMore } };
    }

    const countResult = await client.query<{ total: number }>(
      `SELECT COUNT(*)::INTEGER as total FROM appointments WHERE organization_id = $1 AND deleted_at IS NULL`,
      [organizationId]
    );
    const total = countResult.rows[0]?.total ?? 0;

    const listResult = await client.query<AppointmentRecord>(
      `SELECT id, organization_id, lead_id, doctor_id, scheduled_at,
              status, reminder_status, attended_at, data_source, created_at, updated_at
       FROM appointments
       WHERE organization_id = $1 AND deleted_at IS NULL
       ORDER BY scheduled_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset]
    );
    const hasMore = offset + listResult.rows.length < total;
    return { appointments: listResult.rows, pagination: { page, limit, total, hasMore } };
  } catch (err) {
    logger.error({ err, organizationId, event: 'list_appointments_failed' }, 'Failed to list appointments');
    throw err;
  } finally {
    client.release();
  }
};

export const getAppointmentById = async (
  appointmentId: string,
  organizationId: string,
  clinicId: string | null
): Promise<AppointmentRecord | null> => {
  const client = await getClient();
  try {
    if (clinicId) {
      const result = await client.query<AppointmentRecord>(
        `SELECT a.id, a.organization_id, a.lead_id, a.doctor_id, a.scheduled_at,
                a.status, a.reminder_status, a.attended_at, a.data_source,
                a.created_at, a.updated_at
         FROM appointments a
         JOIN leads l ON a.lead_id = l.id
         WHERE a.id = $1 AND a.organization_id = $2 AND l.clinic_id = $3 AND a.deleted_at IS NULL`,
        [appointmentId, organizationId, clinicId]
      );
      if (result.rowCount === 0) return null;
      return result.rows[0];
    }

    const result = await client.query<AppointmentRecord>(
      `SELECT id, organization_id, lead_id, doctor_id, scheduled_at,
              status, reminder_status, attended_at, data_source, created_at, updated_at
       FROM appointments
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [appointmentId, organizationId]
    );
    if (result.rowCount === 0) return null;
    return result.rows[0];
  } catch (err) {
    logger.error({ err, appointmentId, organizationId, event: 'get_appointment_failed' }, 'Failed to get appointment');
    throw err;
  } finally {
    client.release();
  }
};

export const createAppointment = async (
  organizationId: string,
  input: CreateAppointmentInput
): Promise<AppointmentRecord> => {
  const client = await getClient();
  try {
    const result = await client.query<AppointmentRecord>(
      `INSERT INTO appointments (
         organization_id, lead_id, doctor_id, scheduled_at, status, reminder_status,
         attended_at, data_source
       ) VALUES (
         $1, $2, $3, $4, 'Booked', 'Pending', NULL, 'demo'
       )
       RETURNING id, organization_id, lead_id, doctor_id, scheduled_at,
                 status, reminder_status, attended_at, data_source, created_at, updated_at`,
      [
        organizationId,
        input.lead_id,
        input.doctor_id,
        input.scheduled_at,
      ]
    );
    return result.rows[0];
  } catch (err) {
    logger.error({ err, organizationId, event: 'create_appointment_failed' }, 'Failed to create appointment');
    throw err;
  } finally {
    client.release();
  }
};

export const updateAppointment = async (
  appointmentId: string,
  organizationId: string,
  input: UpdateAppointmentInput,
  clinicId: string | null
): Promise<AppointmentRecord | null> => {
  const client = await getClient();
  try {
    const setClauses: string[] = [];
    const values: unknown[] = [appointmentId, organizationId];
    let paramIndex = 3;

    if (input.scheduled_at !== undefined) {
      setClauses.push(`scheduled_at = $${paramIndex}`);
      values.push(input.scheduled_at);
      paramIndex++;
    }
    if (input.status !== undefined) {
      setClauses.push(`status = $${paramIndex}`);
      values.push(input.status);
      paramIndex++;
    }
    if (input.reminder_status !== undefined) {
      setClauses.push(`reminder_status = $${paramIndex}`);
      values.push(input.reminder_status);
      paramIndex++;
    }
    if (input.attended_at !== undefined) {
      setClauses.push(`attended_at = $${paramIndex}`);
      values.push(input.attended_at);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      throw new BadRequestError('No fields to update');
    }

    setClauses.push(`updated_at = NOW()`);

    let whereClause = `WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`;
    if (clinicId) {
      whereClause += ` AND lead_id IN (SELECT id FROM leads WHERE clinic_id = $${paramIndex} AND deleted_at IS NULL)`;
      values.push(clinicId);
    }

    const result = await client.query<AppointmentRecord>(
      `UPDATE appointments
       SET ${setClauses.join(', ')}
       ${whereClause}
       RETURNING id, organization_id, lead_id, doctor_id, scheduled_at,
                 status, reminder_status, attended_at, data_source, created_at, updated_at`,
      values
    );

    if (result.rowCount === 0) return null;
    return result.rows[0];
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    logger.error({ err, appointmentId, organizationId, event: 'update_appointment_failed' }, 'Failed to update appointment');
    throw err;
  } finally {
    client.release();
  }
};
