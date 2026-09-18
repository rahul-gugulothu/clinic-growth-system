import { getClient } from '../db/index.js';
import { logger } from '../utils/logger.js';

export interface AuditLogParams {
  organizationId: string;
  userId?: string | null;
  clinicId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export const logAuditEvent = async (params: AuditLogParams): Promise<void> => {
  const client = await getClient();
  try {
    await client.query(
      `INSERT INTO audit_log (organization_id, user_id, clinic_id, action, entity, entity_id, old_values, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.organizationId,
        params.userId ?? null,
        params.clinicId ?? null,
        params.action,
        params.entity,
        params.entityId ?? null,
        params.oldValues ? JSON.stringify(params.oldValues) : null,
        params.newValues ? JSON.stringify(params.newValues) : null,
        params.ipAddress ?? null,
      ]
    );
  } catch (err) {
    logger.error({ err, event: 'audit_log_failed', action: params.action }, 'Failed to write audit log');
  } finally {
    client.release();
  }
};

export const logAuthEvent = async (params: {
  organizationId: string;
  userId?: string | null;
  clinicId?: string | null;
  action: 'login_success' | 'login_failed' | 'logout' | 'token_refresh' | 'permission_denied';
  ipAddress?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> => {
  await logAuditEvent({
    organizationId: params.organizationId,
    userId: params.userId,
    clinicId: params.clinicId,
    action: params.action,
    entity: 'auth',
    entityId: params.userId ?? null,
    newValues: params.detail ? { event: params.action, ...params.detail } : { event: params.action },
    ipAddress: params.ipAddress,
  });
};
