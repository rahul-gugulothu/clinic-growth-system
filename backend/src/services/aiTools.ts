import { z } from 'zod';
import { getClient } from '../db/index.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  InternalServerError,
  type UserRole,
} from '../types/index.js';
import { logAuditEvent } from './audit.js';
import { createIntegrationEvent } from './integrations.js';
import { logger } from '../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
  AiExecutionStatus,
  AiToolExecutionRecord,
  AiToolExecutionResult,
} from '../types/aiTools.js';
import { priorityClinicsTool } from './aiTools/priorityClinics.js';
import { prospectSummaryTool } from './aiTools/prospectSummary.js';
import { pipelineDiagnosisTool } from './aiTools/pipelineDiagnosis.js';
import { auditSummaryTool } from './aiTools/auditSummary.js';
import { callPreparationTool } from './aiTools/callPreparation.js';
import { weeklyReportTool } from './aiTools/weeklyReport.js';
import { workPlannerTool } from './aiTools/workPlanner.js';
import { growthOpportunitiesTool } from './aiTools/growthOpportunities.js';
import { draftWhatsAppTool } from './aiTools/draftWhatsApp.js';
import { draftEmailTool } from './aiTools/draftEmail.js';
import { generateProposalTool } from './aiTools/generateProposal.js';

export const TOOL_REGISTRY: AiToolDefinition[] = [
  priorityClinicsTool,
  prospectSummaryTool,
  pipelineDiagnosisTool,
  auditSummaryTool,
  callPreparationTool,
  weeklyReportTool,
  workPlannerTool,
  growthOpportunitiesTool,
  draftWhatsAppTool,
  draftEmailTool,
  generateProposalTool,
];

export const TOOL_BY_ID: Record<string, AiToolDefinition> =
  Object.fromEntries(TOOL_REGISTRY.map((t) => [t.id, t]));

const contextParseSchema = z.record(z.unknown());

export const listTools = (): AiToolDefinition[] => TOOL_REGISTRY;

export const getTool = (toolId: string): AiToolDefinition | undefined =>
  TOOL_BY_ID[toolId];

export const getExecutionResult = async (
  executionId: string,
  organizationId: string
): Promise<AiToolExecutionRecord | null> => {
  const client = await getClient();
  try {
    const result = await client.query<AiToolExecutionRecord>(
      `SELECT *
       FROM ai_tool_executions
       WHERE id = $1 AND organization_id = $2`,
      [executionId, organizationId]
    );
    if (result.rowCount !== 1) return null;
    return result.rows[0];
  } finally {
    client.release();
  }
};

export interface AiExecutionFilter {
  tool_id?: string;
  limit?: number;
  offset?: number;
}

export interface AiExecutionListResponse {
  executions: AiToolExecutionRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export const listExecutions = async (
  organizationId: string,
  filter: AiExecutionFilter
): Promise<AiExecutionListResponse> => {
  const page = Math.max(1, filter.offset ? Math.floor(filter.offset / (filter.limit || 20)) + 1 : 1);
  const limit = filter.limit || 20;
  const offset = filter.offset || (page - 1) * limit;

  const client = await getClient();
  try {
    let whereClause =
      'WHERE organization_id = $1';
    const values: unknown[] = [organizationId];
    let paramIndex = 2;

    if (filter.tool_id) {
      whereClause += ` AND tool_id = $${paramIndex}`;
      values.push(filter.tool_id);
      paramIndex++;
    }

    const countResult = await client.query(
      `SELECT COUNT(*)::INTEGER as total
       FROM ai_tool_executions
       ${whereClause}`,
      values
    );
    const total = countResult.rows[0]?.total ?? 0;

    const dataResult = await client.query<AiToolExecutionRecord>(
      `SELECT *
       FROM ai_tool_executions
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    return {
      executions: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + (dataResult.rowCount ?? 0) < total,
      },
    };
  } finally {
    client.release();
  }
};

export const executeTool = async (
  toolId: string,
  organizationId: string,
  userId: string | null,
  clinicId: string | null,
  rawContext: Record<string, unknown>
): Promise<AiToolExecutionResult> => {
  // 1. Validate tool_id
  const tool = TOOL_BY_ID[toolId];
  if (!tool) {
    throw new BadRequestError(`Unknown tool: ${toolId}`);
  }

  // 2. Validate context with Zod
  const contextParseResult = contextParseSchema.safeParse(rawContext);
  if (!contextParseResult.success) {
    throw new BadRequestError('Invalid context: must be an object');
  }

  const safeContext = contextParseResult.data as AiToolContext;
  const toolContextResult = tool.context_schema.safeParse(safeContext);
  if (!toolContextResult.success) {
    throw new BadRequestError(
      `Invalid context: ${toolContextResult.error.issues.map((i) => i.message).join(', ')}`
    );
  }
  const toolContext = toolContextResult.data as AiToolContext;

  // 3. Enforce tenant scope
  if (tool.tenant_scope === 'org' && clinicId !== null) {
    logger.warn(
      { toolId, organizationId, clinicId, role: 'clinic-scoped' },
      'Organization-scoped tool requested by clinic-scoped user'
    );
    throw new BadRequestError(
      `Tool '${toolId}' requires organization-level access`
    );
  }

  const execContext: AiToolExecutionContext = {
    organizationId,
    userId,
    clinicId,
  };

  const client = await getClient();

  try {
    const startedAt = new Date().toISOString();

    // 4. Create execution row with status='requested'
    const insertResult = await client.query<{
      id: string;
      created_at: string;
    }>(
      `INSERT INTO ai_tool_executions
         (organization_id, user_id, clinic_id, tool_id, context, status, started_at, requires_human_review, success)
       VALUES ($1, $2, $3, $4, $5, 'requested', $6, $7, FALSE)
       RETURNING id, created_at`,
      [
        organizationId,
        userId ?? null,
        clinicId ?? null,
        toolId,
        JSON.stringify(toolContext),
        startedAt,
        tool.human_review_required,
      ]
    );

    const executionId = insertResult.rows[0].id;
    const createdAt = insertResult.rows[0].created_at;

    // 5. Move to 'running'
    await client.query(
      `UPDATE ai_tool_executions SET status = 'running' WHERE id = $1`,
      [executionId]
    );

    const startTime = Date.now();

    try {
      // 6. Execute the tool
      const resultData = await tool.execute(execContext, toolContext);
      const durationMs = Date.now() - startTime;
      const completedAt = new Date().toISOString();

      // 7. Move to completed or requires_approval
      const newStatus: AiExecutionStatus = tool.human_review_required
        ? 'requires_approval'
        : 'completed';

      await client.query(
        `UPDATE ai_tool_executions
           SET status = $1,
               completed_at = $2,
               duration_ms = $3,
               success = TRUE,
               result_output = $4,
               error = NULL
         WHERE id = $5`,
        [newStatus, completedAt, durationMs, JSON.stringify(resultData), executionId]
      );

      // 8. Return the structured result
      return {
        id: executionId,
        organization_id: organizationId,
        tool_id: toolId,
        status: newStatus,
        data: resultData,
        requires_human_review: tool.human_review_required,
        duration_ms: durationMs,
        created_at: createdAt,
        completed_at: completedAt,
        approved_by: null,
        approved_at: null,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const completedAt = new Date().toISOString();
      const errorMsg = err instanceof Error ? err.message : String(err);

      // 7b. Move to 'failed'
      await client.query(
        `UPDATE ai_tool_executions
           SET status = 'failed',
               completed_at = $1,
               duration_ms = $2,
               success = FALSE,
               error = $3
         WHERE id = $4`,
        [completedAt, durationMs, errorMsg, executionId]
      );

      logger.error(
        { err, toolId, executionId, organizationId },
        'AI tool execution failed'
      );

      if (err instanceof BadRequestError) throw err;
      if (err instanceof NotFoundError) throw err;
      throw new InternalServerError(`Tool '${toolId}' execution failed: ${errorMsg}`);
    }
  } finally {
    client.release();
  }
};

// ==================================================================
// V3.1.1 — HUMAN APPROVAL WORKFLOW
// ==================================================================

export interface ApproveExecutionParams {
  executionId: string;
  organizationId: string;
  userId: string;
  userRole: UserRole;
  clinicId: string | null;
}

export interface RejectExecutionParams {
  executionId: string;
  organizationId: string;
  userId: string;
  userRole: UserRole;
  reason: string;
  clinicId: string | null;
}

const ALLOWED_APPROVER_ROLES: UserRole[] = ['founder', 'org_admin'];

const AI_EXECUTION_TRANSITIONS: Record<AiExecutionStatus, AiExecutionStatus[]> = {
  requested: [],
  running: [],
  completed: [],
  failed: [],
  requires_approval: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

const validateExecutionTransition = (
  current: AiExecutionStatus,
  target: AiExecutionStatus
): void => {
  if (!AI_EXECUTION_TRANSITIONS[current]?.includes(target)) {
    throw new BadRequestError(
      `Cannot transition execution from '${current}' to '${target}'`
    );
  }
};

const enforceApproverRole = (role: UserRole): void => {
  if (!ALLOWED_APPROVER_ROLES.includes(role)) {
    throw new ForbiddenError(
      'Only organization-level users can approve AI executions'
    );
  }
};

// V3.1.2-C3-B: canonical machine-readable email payload that the approval
// bridge copies verbatim from a draft-email execution's result_output into a
// SendGrid integration event. Only these four keys may enter an event payload.
const draftEmailIntegrationPayloadSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  body_type: z.enum(['text', 'html']),
});

const buildDraftEmailIntegrationPayload = (
  record: AiToolExecutionRecord
): Record<string, unknown> => {
  const output = record.result_output ?? {};
  const parsed = draftEmailIntegrationPayloadSchema.safeParse({
    to: output.to,
    subject: output.subject,
    body: output.body,
    body_type: output.body_type,
  });
  if (!parsed.success) {
    throw new BadRequestError(
      `Draft email result missing or invalid structured email output: ${parsed.error.issues.map((i) => i.message).join(', ')}`
    );
  }
  return {
    to: parsed.data.to,
    subject: parsed.data.subject,
    body: parsed.data.body,
    body_type: parsed.data.body_type,
  };
};

export const approveExecution = async (
  params: ApproveExecutionParams
): Promise<AiToolExecutionRecord> => {
  enforceApproverRole(params.userRole);

  const client = await getClient();
  const approvedAt = new Date().toISOString();

  try {
    const updateResult = await client.query<AiToolExecutionRecord>(
      `UPDATE ai_tool_executions
         SET status = 'approved',
             approved_by = $1,
             approved_at = $2
       WHERE id = $3
         AND organization_id = $4
         AND status = 'requires_approval'
         AND requires_human_review = true
       RETURNING *`,
      [params.userId, approvedAt, params.executionId, params.organizationId]
    );

    if (updateResult.rowCount === 0) {
      const checkResult = await client.query<{
        status: AiExecutionStatus;
        organization_id: string;
        requires_human_review: boolean;
      }>(
        `SELECT status, organization_id, requires_human_review
         FROM ai_tool_executions
         WHERE id = $1`,
        [params.executionId]
      );

      if (checkResult.rowCount === 0) {
        throw new NotFoundError('Execution not found');
      }

      const record = checkResult.rows[0];

      if (record.organization_id !== params.organizationId) {
        throw new ForbiddenError('Access denied to this execution');
      }

      validateExecutionTransition(record.status, 'approved');

      if (!record.requires_human_review) {
        throw new BadRequestError('This execution does not require human review');
      }

      throw new BadRequestError(
        `Cannot approve execution in status: ${record.status}`
      );
    }

    const record = updateResult.rows[0];

    await logAuditEvent({
      organizationId: params.organizationId,
      userId: params.userId,
      clinicId: params.clinicId,
      action: 'ai_execution_approved',
      entity: 'ai_tool_execution',
      entityId: params.executionId,
      oldValues: { status: 'requires_approval' },
      newValues: {
        status: 'approved',
        approved_by: params.userId,
      },
    });

    // V3.1.2-C3-B: bridge approved draft-email executions to the integration
    // event system. Only draft-email actions create a SendGrid email event;
    // other approvals leave the integration system untouched. Event creation
    // uses its own client/transaction (see §7 atomicity limitation).
    if (record.tool_id === 'draft-email' && record.requires_human_review) {
      const payload = buildDraftEmailIntegrationPayload(record);
      await createIntegrationEvent({
        executionId: record.id,
        organizationId: record.organization_id,
        userId: params.userId,
        clinicId: record.clinic_id,
        provider: 'sendgrid',
        eventType: 'email.send',
        payload,
      });
    }

    return record;
  } finally {
    client.release();
  }
};

export const rejectExecution = async (
  params: RejectExecutionParams
): Promise<AiToolExecutionRecord> => {
  enforceApproverRole(params.userRole);

  const client = await getClient();

  try {
    const updateResult = await client.query<AiToolExecutionRecord>(
      `UPDATE ai_tool_executions
         SET status = 'rejected'
       WHERE id = $1
         AND organization_id = $2
         AND status = 'requires_approval'
         AND requires_human_review = true
       RETURNING *`,
      [params.executionId, params.organizationId]
    );

    if (updateResult.rowCount === 0) {
      const checkResult = await client.query<{
        status: AiExecutionStatus;
        organization_id: string;
        requires_human_review: boolean;
      }>(
        `SELECT status, organization_id, requires_human_review
         FROM ai_tool_executions
         WHERE id = $1`,
        [params.executionId]
      );

      if (checkResult.rowCount === 0) {
        throw new NotFoundError('Execution not found');
      }

      const record = checkResult.rows[0];

      if (record.organization_id !== params.organizationId) {
        throw new ForbiddenError('Access denied to this execution');
      }

      validateExecutionTransition(record.status, 'rejected');

      if (!record.requires_human_review) {
        throw new BadRequestError('This execution does not require human review');
      }

      throw new BadRequestError(
        `Cannot reject execution in status: ${record.status}`
      );
    }

    const record = updateResult.rows[0];

    await logAuditEvent({
      organizationId: params.organizationId,
      userId: params.userId,
      clinicId: params.clinicId,
      action: 'ai_execution_rejected',
      entity: 'ai_tool_execution',
      entityId: params.executionId,
      oldValues: { status: 'requires_approval' },
      newValues: {
        status: 'rejected',
        reason: params.reason,
      },
    });

    return record;
  } finally {
    client.release();
  }
};
