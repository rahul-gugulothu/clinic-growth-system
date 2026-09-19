import { getClient } from '../db/index.js';
import { config } from '../config/index.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  INTERNAL_ROLES,
  type UserRole,
} from '../types/index.js';
import { logAuditEvent } from './audit.js';
import { logger } from '../utils/logger.js';
import { mockProvider } from './providers/mockProvider.js';
import { sendEmailProvider } from './providers/emailProvider.js';
import type {
  IntegrationEventRecord,
  IntegrationProvider,
  IntegrationSendResult,
  CreateIntegrationEventParams,
  GetIntegrationEventParams,
  GetExecutionEventsParams,
  ProcessIntegrationEventParams,
  RetryIntegrationEventParams,
  IntegrationBatchResult,
  INTEGRATION_EVENT_STATUS_TRANSITIONS,
} from '../types/integrations.js';
import { MAX_INTEGRATION_RETRIES } from '../types/integrations.js';
import type { AiToolExecutionRecord } from '../types/aiTools.js';

const PROVIDER_REGISTRY: Record<string, IntegrationProvider> = {
  mock: mockProvider,
  sendgrid: sendEmailProvider,
};

export const getIntegrationProvider = (
  provider: string
): IntegrationProvider | undefined => {
  return PROVIDER_REGISTRY[provider];
};

const ALLOWED_APPROVER_ROLES: UserRole[] = [...INTERNAL_ROLES];

const RETRY_BACKOFF_MS: Record<number, number> = {
  1: 60_000,
  2: 300_000,
  3: 900_000,
};

const calculateNextRetryAt = (retryCount: number): string => {
  const delayMs = RETRY_BACKOFF_MS[retryCount] ?? 900_000;
  return new Date(Date.now() + delayMs).toISOString();
};

export const createIntegrationEvent = async (
  params: CreateIntegrationEventParams
): Promise<IntegrationEventRecord> => {
  const client = await getClient();

  try {
    const executionResult = await client.query<AiToolExecutionRecord>(
      `SELECT *
       FROM ai_tool_executions
       WHERE id = $1 AND organization_id = $2`,
      [params.executionId, params.organizationId]
    );

    if (executionResult.rowCount !== 1) {
      throw new NotFoundError('AI execution not found');
    }

    const execution = executionResult.rows[0];

    if (execution.status !== 'approved') {
      throw new BadRequestError(
        `Cannot create integration event for execution with status '${execution.status}' — status must be 'approved'`
      );
    }

    if (!execution.requires_human_review) {
      throw new BadRequestError(
        'Cannot create integration event for non-human-review executions'
      );
    }

    try {
      const insertResult = await client.query<IntegrationEventRecord>(
        `INSERT INTO integration_events
           (organization_id, clinic_id, ai_execution_id, provider, event_type, payload, status, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0)
         RETURNING *`,
        [
          execution.organization_id,
          execution.clinic_id ?? null,
          execution.id,
          params.provider,
          params.eventType,
          JSON.stringify(params.payload),
        ]
      );

      const event = insertResult.rows[0];

      await logAuditEvent({
        organizationId: execution.organization_id,
        userId: params.userId ?? null,
        clinicId: execution.clinic_id ?? null,
        action: 'integration_event_created',
        entity: 'integration_event',
        entityId: event.id,
        oldValues: null,
        newValues: {
          provider: event.provider,
          event_type: event.event_type,
          status: 'pending',
          ai_execution_id: event.ai_execution_id,
          organization_id: event.organization_id,
          clinic_id: event.clinic_id,
        },
      });

      return event;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        const existingResult = await client.query<IntegrationEventRecord>(
          `SELECT *
           FROM integration_events
           WHERE ai_execution_id = $1
             AND provider = $2
             AND event_type = $3
             AND organization_id = $4`,
          [
            execution.id,
            params.provider,
            params.eventType,
            params.organizationId,
          ]
        );

        if (existingResult.rowCount === 1) {
          const existing = existingResult.rows[0];
          logger.info(
            {
              executionId: params.executionId,
              provider: params.provider,
              eventType: params.eventType,
              eventId: existing.id,
              event: 'integration_event_already_exists',
            },
            'Integration event already exists — returning existing'
          );
          return existing;
        }
      }

      throw err;
    }
  } finally {
    client.release();
  }
};

export const getIntegrationEvent = async (
  params: GetIntegrationEventParams
): Promise<IntegrationEventRecord | null> => {
  const client = await getClient();

  try {
    const result = await client.query<IntegrationEventRecord>(
      `SELECT *
       FROM integration_events
       WHERE id = $1 AND organization_id = $2`,
      [params.eventId, params.organizationId]
    );

    if (result.rowCount !== 1) {
      return null;
    }

    return result.rows[0];
  } finally {
    client.release();
  }
};

export const getExecutionEvents = async (
  params: GetExecutionEventsParams
): Promise<IntegrationEventRecord[]> => {
  const client = await getClient();

  try {
    const executionCheck = await client.query(
      `SELECT organization_id, clinic_id
       FROM ai_tool_executions
       WHERE id = $1 AND organization_id = $2`,
      [params.executionId, params.organizationId]
    );

    if (executionCheck.rowCount !== 1) {
      return [];
    }

    const result = await client.query<IntegrationEventRecord>(
      `SELECT *
       FROM integration_events
       WHERE ai_execution_id = $1
         AND organization_id = $2
       ORDER BY created_at ASC`,
      [params.executionId, params.organizationId]
    );

    return result.rows;
  } finally {
    client.release();
  }
};

const isUniqueViolation = (err: unknown): boolean => {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
};

const isExecutableStatus = (
  status: IntegrationEventRecord['status'],
  nextRetryAt: string | null
): boolean => {
  if (status === 'pending') return true;
  if (status === 'retry') {
    if (nextRetryAt === null) return true;
    return new Date(nextRetryAt) <= new Date();
  }
  return false;
};

export const processIntegrationEvent = async (
  params: ProcessIntegrationEventParams
): Promise<IntegrationEventRecord> => {
  const client = await getClient();
  let committed = false;

  try {
    await client.query('BEGIN');

    const lockResult = await client.query<IntegrationEventRecord>(
      `SELECT *
       FROM integration_events
       WHERE id = $1 AND organization_id = $2
       FOR UPDATE`,
      [params.eventId, params.organizationId]
    );

    if (lockResult.rowCount !== 1) {
      await client.query('ROLLBACK');
      committed = true;

      const checkResult = await client.query(
        `SELECT 1 FROM integration_events WHERE id = $1`,
        [params.eventId]
      );

      if (checkResult.rowCount === 0) {
        throw new NotFoundError('Integration event not found');
      }

      throw new NotFoundError('Integration event not found');
    }

    const event = lockResult.rows[0];

    if (!isExecutableStatus(event.status, event.next_retry_at)) {
      await client.query('ROLLBACK');
      committed = true;

      throw new BadRequestError(
        `Cannot process integration event in status '${event.status}'`
      );
    }

    const provider = getIntegrationProvider(event.provider);
    if (!provider) {
      await client.query('ROLLBACK');
      committed = true;

      throw new BadRequestError(`Unknown provider: ${event.provider}`);
    }

    const oldValues = {
      status: event.status,
      retry_count: event.retry_count,
      error_message: event.error_message,
      sent_at: event.sent_at,
      next_retry_at: event.next_retry_at,
    };

    const result: IntegrationSendResult = await provider.send({
      organizationId: event.organization_id,
      event,
    });

    const now = new Date().toISOString();

    if (result.success) {
      const updateResult = await client.query<IntegrationEventRecord>(
        `UPDATE integration_events
           SET status = 'sent',
               sent_at = $1,
               error_message = NULL,
               next_retry_at = NULL,
               updated_at = NOW()
         WHERE id = $2
           AND status IN ('pending', 'retry')
         RETURNING *`,
        [now, event.id]
      );

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        committed = true;
        throw new BadRequestError(
          'Integration event was modified by a concurrent process'
        );
      }

      await client.query('COMMIT');
      committed = true;

      await logAuditEvent({
        organizationId: event.organization_id,
        userId: params.userId,
        clinicId: params.clinicId,
        action: 'integration_sent',
        entity: 'integration_event',
        entityId: event.id,
        oldValues,
        newValues: {
          status: 'sent',
          sent_at: now,
          error_message: null,
          next_retry_at: null,
          provider_message_id: result.providerMessageId ?? null,
        },
      });

      return updateResult.rows[0];
    }

    const newRetryCount = event.retry_count + 1;
    const errorMsg = result.error ?? 'Provider error';

    if (newRetryCount > MAX_INTEGRATION_RETRIES) {
      const updateResult = await client.query<IntegrationEventRecord>(
        `UPDATE integration_events
           SET status = 'failed',
               retry_count = $1,
               error_message = $2,
               next_retry_at = NULL,
               updated_at = NOW()
         WHERE id = $3
           AND status IN ('pending', 'retry')
         RETURNING *`,
        [newRetryCount, errorMsg, event.id]
      );

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        committed = true;
        throw new BadRequestError(
          'Integration event was modified by a concurrent process'
        );
      }

      await client.query('COMMIT');
      committed = true;

      await logAuditEvent({
        organizationId: event.organization_id,
        userId: params.userId,
        clinicId: params.clinicId,
        action: 'integration_failed',
        entity: 'integration_event',
        entityId: event.id,
        oldValues,
        newValues: {
          status: 'failed',
          retry_count: newRetryCount,
          error_message: errorMsg,
          next_retry_at: null,
        },
      });

      return updateResult.rows[0];
    }

    const nextRetryAt = calculateNextRetryAt(newRetryCount);

    const updateResult = await client.query<IntegrationEventRecord>(
      `UPDATE integration_events
         SET status = 'retry',
             retry_count = $1,
             error_message = $2,
             next_retry_at = $3,
             updated_at = NOW()
       WHERE id = $4
         AND status IN ('pending', 'retry')
       RETURNING *`,
      [newRetryCount, errorMsg, nextRetryAt, event.id]
    );

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      committed = true;
      throw new BadRequestError(
        'Integration event was modified by a concurrent process'
      );
    }

    await client.query('COMMIT');
    committed = true;

    await logAuditEvent({
      organizationId: event.organization_id,
      userId: params.userId,
      clinicId: params.clinicId,
      action: 'integration_retry_scheduled',
      entity: 'integration_event',
      entityId: event.id,
      oldValues,
      newValues: {
        status: 'retry',
        retry_count: newRetryCount,
        error_message: errorMsg,
        next_retry_at: nextRetryAt,
      },
    });

    return updateResult.rows[0];
  } catch (err) {
    if (!committed) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw err;
  } finally {
    client.release();
  }
};

export const retryIntegrationEvent = async (
  params: RetryIntegrationEventParams
): Promise<IntegrationEventRecord> => {
  const client = await getClient();

  try {
    if (!ALLOWED_APPROVER_ROLES.includes(params.userRole)) {
      throw new ForbiddenError(
        'Only organization-level users can retry integration events'
      );
    }

    const checkResult = await client.query<IntegrationEventRecord>(
      `SELECT *
       FROM integration_events
       WHERE id = $1 AND organization_id = $2`,
      [params.eventId, params.organizationId]
    );

    if (checkResult.rowCount !== 1) {
      const existsResult = await client.query(
        `SELECT 1 FROM integration_events WHERE id = $1`,
        [params.eventId]
      );

      if (existsResult.rowCount === 0) {
        throw new NotFoundError('Integration event not found');
      }

      throw new NotFoundError('Integration event not found');
    }

    const event = checkResult.rows[0];
    const oldStatus = event.status;

    if (oldStatus === 'sent') {
      throw new BadRequestError('Cannot retry a sent event');
    }

    if (oldStatus === 'pending') {
      throw new BadRequestError('Event is already pending');
    }

    if (oldStatus !== 'failed' && oldStatus !== 'retry') {
      throw new BadRequestError(
        `Cannot retry event in status '${oldStatus}'`
      );
    }

    const oldValues = {
      status: oldStatus,
      retry_count: event.retry_count,
      next_retry_at: event.next_retry_at,
      error_message: event.error_message,
    };

    const updateResult = await client.query<IntegrationEventRecord>(
      `UPDATE integration_events
         SET status = 'pending',
             next_retry_at = NULL,
             updated_at = NOW()
       WHERE id = $1
         AND organization_id = $2
         AND status = $3
       RETURNING *`,
      [params.eventId, params.organizationId, oldStatus]
    );

    if (updateResult.rowCount === 0) {
      throw new BadRequestError(
        'Event status changed; retry is no longer possible'
      );
    }

    const updated = updateResult.rows[0];

    await logAuditEvent({
      organizationId: params.organizationId,
      userId: params.userId,
      clinicId: params.clinicId,
      action: 'integration_retry_requested',
      entity: 'integration_event',
      entityId: updated.id,
      oldValues,
      newValues: {
        status: 'pending',
        next_retry_at: null,
      },
    });

    return updated;
  } finally {
    client.release();
  }
};

export const processDueIntegrationEvents = async ({
  limit,
}: {
  limit?: number;
} = {}): Promise<IntegrationBatchResult> => {
  const client = await getClient();

  const batchSize = limit ?? config.integration.worker.batchSize;

  let events: IntegrationEventRecord[];
  try {
    const selectResult = await client.query<IntegrationEventRecord>(
      `SELECT *
       FROM integration_events
       WHERE status = 'pending'
          OR (status = 'retry' AND next_retry_at <= NOW())
       ORDER BY created_at ASC
       LIMIT $1`,
      [batchSize]
    );
    events = selectResult.rows;
  } finally {
    client.release();
  }

  const result: IntegrationBatchResult = {
    processed: 0,
    succeeded: 0,
    retried: 0,
    failed: 0,
  };

  for (const event of events) {
    result.processed += 1;
    try {
      const updated = await processIntegrationEvent({
        eventId: event.id,
        organizationId: event.organization_id,
        userId: null,
        clinicId: event.clinic_id,
      });

      if (updated.status === 'sent') {
        result.succeeded += 1;
      } else if (updated.status === 'retry') {
        result.retried += 1;
      } else if (updated.status === 'failed') {
        result.failed += 1;
      } else {
        result.failed += 1;
      }
    } catch {
      result.failed += 1;
    }
  }

  logger.info(
    {
      event: 'integration_events_batch_processed',
      processed: result.processed,
      succeeded: result.succeeded,
      retried: result.retried,
      failed: result.failed,
    },
    'Processed due integration events'
  );

  return result;
};

export { INTEGRATION_EVENT_STATUS_TRANSITIONS };
