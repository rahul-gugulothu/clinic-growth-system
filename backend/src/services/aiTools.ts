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
import { createIntegrationEvent, getExecutionEvents } from './integrations.js';
import { logger } from '../utils/logger.js';
import type {
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolContext,
  AiExecutionStatus,
  AiToolExecutionRecord,
  AiToolExecutionResult,
  AiExecutionWithIntegration,
  AiExecutionWithDeliveryStatus,
  IntegrationDeliveryEvent,
  StreamEvent,
  StreamMessageStart,
  StreamMessageChunk,
  StreamToolEvent,
  StreamMessageComplete,
  StreamError,
} from '../types/aiTools.js';
import type {
  IntegrationEventStatus,
  IntegrationEventRecord,
} from '../types/integrations.js';
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
import { createLLMClient } from './llm/index.js';
import { addMessage, buildFounderPromptContext } from './founderMemory.js';
import type { FounderPromptContext } from '../types/founderMemory.js';

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

export interface AiExecutionListWithDelivery {
  executions: AiExecutionWithDeliveryStatus[];
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

const toDeliveryEvent = (
  event: IntegrationEventRecord
): IntegrationDeliveryEvent => ({
  provider: event.provider,
  event_type: event.event_type,
  status: event.status,
  retry_count: event.retry_count,
  error_message: event.error_message,
  next_retry_at: event.next_retry_at,
  sent_at: event.sent_at,
});

export const getExecutionWithIntegrationStatus = async (
  executionId: string,
  organizationId: string
): Promise<AiExecutionWithIntegration | null> => {
  const execution = await getExecutionResult(executionId, organizationId);
  if (!execution) return null;

  const events = await getExecutionEvents({
    executionId,
    organizationId,
  });

  return {
    ...execution,
    integration_events: events.map(toDeliveryEvent),
  };
};

export const listExecutionsWithIntegrationStatus = async (
  organizationId: string,
  filter: AiExecutionFilter
): Promise<AiExecutionListWithDelivery> => {
  const baseResult = await listExecutions(organizationId, filter);

  if (baseResult.executions.length === 0) {
    return {
      executions: [],
      pagination: baseResult.pagination,
    };
  }

  const executionIds = baseResult.executions.map((e) => e.id);

  const client = await getClient();
  try {
    const statusResult = await client.query<{
      ai_execution_id: string;
      latest_status: IntegrationEventStatus;
    }>(
      `SELECT DISTINCT ON (ai_execution_id)
         ai_execution_id,
         status AS latest_status
       FROM integration_events
       WHERE ai_execution_id = ANY($1)
         AND organization_id = $2
       ORDER BY ai_execution_id, created_at DESC`,
      [executionIds, organizationId]
    );

    const statusMap = new Map<string, IntegrationEventStatus>();
    for (const row of statusResult.rows) {
      if (row.ai_execution_id && row.latest_status) {
        statusMap.set(row.ai_execution_id, row.latest_status);
      }
    }

    const executions = baseResult.executions.map((exec) => {
      const latest = statusMap.get(exec.id);
      return {
        ...exec,
        latest_integration_status: latest ?? null,
        has_integration_events: latest !== undefined,
      };
    });

    return {
      executions,
      pagination: baseResult.pagination,
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
  rawContext: Record<string, unknown>,
  conversationId?: string,
  userMessage?: string
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
     llmClient: await createLLMClient(organizationId),
   };

   const client = await getClient();

   let founderPromptContext: FounderPromptContext | undefined;
   if (conversationId && userId && userMessage) {
     founderPromptContext = await buildFounderPromptContext(
       conversationId,
       organizationId,
       userId,
       'You are a helpful assistant that produces structured JSON.',
       userMessage
     );
     execContext.founderPromptContext = founderPromptContext;
   }

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
     const createdAt = insertResult.rows[0].created_at as string;

     // 5. Move to 'running'
     await client.query(
       `UPDATE ai_tool_executions SET status = 'running' WHERE id = $1`,
       [executionId]
     );

     // V3.1.13-B: Persist the user message to the conversation before tool execution
     if (conversationId && userId && userMessage) {
       const systemPrompt = founderPromptContext?.systemPrompt ?? 'You are a helpful assistant.';
       await addMessage({
         conversationId,
         organizationId,
         role: 'user',
         content: userMessage,
         metadata: {
           tool_id: toolId,
           execution_id: executionId,
           system_prompt: systemPrompt,
         },
       });
     }

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

       // V3.1.13-B: Persist tool message and assistant message after successful execution
       if (conversationId && userId) {
         await addMessage({
           conversationId,
           organizationId,
           role: 'tool',
           content: `Tool executed: ${toolId}`,
           toolExecutionId: executionId,
           metadata: {
             tool_id: toolId,
             execution_id: executionId,
             status: newStatus,
           },
         });

         await addMessage({
           conversationId,
           organizationId,
           role: 'assistant',
           content: JSON.stringify(resultData, null, 2),
           metadata: {
             tool_id: toolId,
             execution_id: executionId,
             role: 'assistant',
             status: newStatus,
           },
         });
       }

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

       // V3.1.13-B: Persist tool message and assistant message on failure
       if (conversationId && userId) {
         await addMessage({
           conversationId,
           organizationId,
           role: 'tool',
           content: `Tool executed: ${toolId}`,
           toolExecutionId: executionId,
           metadata: {
             tool_id: toolId,
             execution_id: executionId,
             status: 'failed',
           },
         }).catch((persistErr) => {
           logger.error(
             { persistErr, toolId, executionId, organizationId },
             'Failed to persist tool message on execution failure'
           );
         });

         await addMessage({
           conversationId,
           organizationId,
           role: 'assistant',
           content: `Tool '${toolId}' failed: ${errorMsg}`,
           metadata: {
             tool_id: toolId,
             execution_id: executionId,
             role: 'assistant',
             status: 'failed',
           },
         }).catch((persistErr) => {
           logger.error(
             { persistErr, toolId, executionId, organizationId },
             'Failed to persist assistant message on execution failure'
           );
         });
       }

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
// V3.1.13-D: STREAMING EXECUTION
// ==================================================================

export interface ExecuteToolStreamParams {
  toolId: string;
  organizationId: string;
  userId: string | null;
  clinicId: string | null;
  rawContext: Record<string, unknown>;
  conversationId?: string;
  userMessage?: string;
  signal?: AbortSignal;
}

export async function* executeToolStream(
  params: ExecuteToolStreamParams
): AsyncGenerator<StreamEvent, void, unknown> {
  const { toolId, organizationId, userId, clinicId, rawContext, conversationId, userMessage, signal } = params;

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
    throw new BadRequestError(`Tool '${toolId}' requires organization-level access`);
  }

  // 4. Build exec context
  const execContext: AiToolExecutionContext = {
    organizationId,
    userId,
    clinicId,
    llmClient: await createLLMClient(organizationId),
  };

  const client = await getClient();

  let founderPromptContext: FounderPromptContext | undefined;
  if (conversationId && userId && userMessage) {
    founderPromptContext = await buildFounderPromptContext(
      conversationId,
      organizationId,
      userId,
      'You are a helpful assistant that produces structured JSON.',
      userMessage
    );
    execContext.founderPromptContext = founderPromptContext;
  }

  // 5. Create execution record BEFORE emitting message_start (fixes ordering)
  const startedAt = new Date().toISOString();
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

  // 6. Move to 'running'
  await client.query(
    `UPDATE ai_tool_executions SET status = 'running' WHERE id = $1`,
    [executionId]
  );

  // 7. Emit message_start (now execution record exists)
  const startEvent: StreamMessageStart = { type: 'message_start', execution_id: executionId };
  yield startEvent;

  // 8. Check for abort
  if (signal?.aborted) {
    const abortEvent: StreamError = { type: 'error', message: 'Stream aborted', kind: 'cancelled' };
    yield abortEvent;
    return;
  }

  // 9. Emit tool_event running
  const toolStartEvent: StreamToolEvent = {
    type: 'tool_event',
    tool_id: toolId,
    status: 'running',
    execution_id: executionId,
  };
  yield toolStartEvent;

  // 10. Persist the user message
  if (conversationId && userId && userMessage) {
    const systemPrompt = founderPromptContext?.systemPrompt ?? 'You are a helpful assistant.';
    await addMessage({
      conversationId,
      organizationId,
      role: 'user',
      content: userMessage,
      metadata: {
        tool_id: toolId,
        execution_id: executionId,
        system_prompt: systemPrompt,
      },
    });
  }

  const startTime = Date.now();

  try {
    // 11. Execute the tool
    const resultData = await tool.execute(execContext, toolContext);
    const durationMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();

    // 12. Update execution status
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

    // 13. Persist messages
    if (conversationId && userId) {
      await addMessage({
        conversationId,
        organizationId,
        role: 'tool',
        content: `Tool executed: ${toolId}`,
        toolExecutionId: executionId,
        metadata: {
          tool_id: toolId,
          execution_id: executionId,
          status: newStatus,
        },
      });

      await addMessage({
        conversationId,
        organizationId,
        role: 'assistant',
        content: JSON.stringify(resultData, null, 2),
        metadata: {
          tool_id: toolId,
          execution_id: executionId,
          role: 'assistant',
          status: newStatus,
        },
      });
    }

    // 14. Stream the result as chunks
    const resultContent = JSON.stringify(resultData, null, 2);
    const chunks = splitContentIntoChunks(resultContent, 64);
    let accumulatedContent = '';

    for (const chunk of chunks) {
      if (signal?.aborted) {
        const abortEvent: StreamError = { type: 'error', message: 'Stream aborted', kind: 'cancelled' };
        yield abortEvent;
        return;
      }

      accumulatedContent += chunk;

      const chunkEvent: StreamMessageChunk = {
        type: 'message_chunk',
        content: chunk,
        accumulated: accumulatedContent,
      };
      yield chunkEvent;
    }

    // 15. Emit tool_event completed
    const toolCompleteEvent: StreamToolEvent = {
      type: 'tool_event',
      tool_id: toolId,
      status: 'completed',
      execution_id: executionId,
    };
    yield toolCompleteEvent;

    // 16. Emit message_complete
    const completeEvent: StreamMessageComplete = {
      type: 'message_complete',
      content: resultContent,
    };
    yield completeEvent;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Update execution as failed
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

    // Persist error messages
    if (conversationId && userId) {
      await addMessage({
        conversationId,
        organizationId,
        role: 'tool',
        content: `Tool executed: ${toolId}`,
        toolExecutionId: executionId,
        metadata: {
          tool_id: toolId,
          execution_id: executionId,
          status: 'failed',
        },
      }).catch((persistErr) => {
        logger.error(
          { persistErr, toolId, executionId, organizationId },
          'Failed to persist tool message on streaming execution failure'
        );
      });

      await addMessage({
        conversationId,
        organizationId,
        role: 'assistant',
        content: `Tool '${toolId}' failed: ${errorMsg}`,
        metadata: {
          tool_id: toolId,
          execution_id: executionId,
          role: 'assistant',
          status: 'failed',
        },
      }).catch((persistErr) => {
        logger.error(
          { persistErr, toolId, executionId, organizationId },
          'Failed to persist assistant message on streaming execution failure'
        );
      });
    }

    // Emit error event
    const errorEvent: StreamError = {
      type: 'error',
      message: errorMsg,
      kind: err instanceof BadRequestError ? 'bad_request' : 'execution_error',
    };
    yield errorEvent;

    if (err instanceof BadRequestError) throw err;
    if (err instanceof NotFoundError) throw err;
    throw new InternalServerError(`Tool '${toolId}' execution failed: ${errorMsg}`);
  } finally {
    client.release();
  }
}

function splitContentIntoChunks(content: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }
  return chunks;
}


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

    // V3.1.12-A: bridge approved draft-whatsapp executions to a whatsapp.message
    // integration event. draftWhatsApp returns { channel, recipient, draftText, reasoning }
    // where recipient is a human-readable prospect name, NOT an E.164 phone number.
    // The bridge maps recipient -> to and draftText -> message; the whatsapp
    // provider will reject the payload at validation time (non-E.164 to) and
    // the event will be classified as a terminal failure, not a retry.
    if (record.tool_id === 'draft-whatsapp' && record.requires_human_review) {
      const output = record.result_output ?? {};
      await createIntegrationEvent({
        executionId: record.id,
        organizationId: record.organization_id,
        userId: params.userId,
        clinicId: record.clinic_id,
        provider: 'whatsapp',
        eventType: 'whatsapp.message',
        payload: {
          to: output.recipient ?? '',
          message: output.draftText ?? '',
        },
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

