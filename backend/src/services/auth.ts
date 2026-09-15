import { getClient } from '../db/index.js';
import type { UserRecord, UserRole } from '../types/index.js';

export const getUserById = async (userId: string): Promise<UserRecord | null> => {
  const client = await getClient();
  try {
    const result = await client.query<UserRecord>(
      `SELECT id, email, role, organization_id, clinic_id
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } finally {
    client.release();
  }
};

export const getUserByEmail = async (email: string): Promise<UserRecord | null> => {
  const client = await getClient();
  try {
    const result = await client.query<UserRecord>(
      `SELECT id, email, role, organization_id, clinic_id
       FROM users
       WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } finally {
    client.release();
  }
};

export const getOrganizationById = async (
  organizationId: string
): Promise<{ id: string; name: string; status: string } | null> => {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT id, name, status FROM organizations
       WHERE id = $1 AND deleted_at IS NULL`,
      [organizationId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } finally {
    client.release();
  }
};

export const getClinicById = async (
  clinicId: string,
  organizationId: string
): Promise<{ id: string; name: string } | null> => {
  const client = await getClient();
  try {
    const result = await client.query(
      `SELECT id, name FROM clinics
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [clinicId, organizationId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  } finally {
    client.release();
  }
};

export const validateUserRole = (role: string): UserRole | null => {
  const validRoles: UserRole[] = [
    'org_admin',
    'founder',
    'clinic_owner',
    'clinic_doctor',
    'clinic_reception',
    'clinic_coordinator',
  ];
  return validRoles.includes(role as UserRole) ? (role as UserRole) : null;
};
