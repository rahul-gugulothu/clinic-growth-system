import { getClient } from '../db/index.js';
import {
  BadRequestError,
  NotFoundError,
} from '../types/index.js';
import { logAuditEvent } from './audit.js';
import { logger } from '../utils/logger.js';
import type {
  IntegrationEventRecord,
  CreateIntegrationEventParams,
  GetIntegrationEventParams,
  GetExecutionEventsParams,
} from '../types/integrations.js';
import type { AiToolExecutionRecord } from '../types/aiTools.js';

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
