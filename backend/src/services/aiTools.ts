import { z } from 'zod';
import { getClient } from '../db/index.js';
import {
  BadRequestError,
  NotFoundError,
  InternalServerError,
} from '../types/index.js';
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

export const TOOL_REGISTRY: AiToolDefinition[] = [
  priorityClinicsTool,
  prospectSummaryTool,
  pipelineDiagnosisTool,
  auditSummaryTool,
  callPreparationTool,
  weeklyReportTool,
  workPlannerTool,
  growthOpportunitiesTool,
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
       VALUES ($1, $2, $3, $4, $5, 'requested', $6, FALSE, FALSE)
       RETURNING id, created_at`,
      [
        organizationId,
        userId ?? null,
        clinicId ?? null,
        toolId,
        JSON.stringify(toolContext),
        startedAt,
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

      // 7. Move to 'completed'
      await client.query(
        `UPDATE ai_tool_executions
           SET status = 'completed',
               completed_at = $1,
               duration_ms = $2,
               success = TRUE,
               result_output = $3,
               error = NULL
         WHERE id = $4`,
        [completedAt, durationMs, JSON.stringify(resultData), executionId]
      );

      // 8. Return the structured result
      return {
        id: executionId,
        organization_id: organizationId,
        tool_id: toolId,
        status: 'completed' as AiExecutionStatus,
        data: resultData,
        requires_human_review: false,
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
