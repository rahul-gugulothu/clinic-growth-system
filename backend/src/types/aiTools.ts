import type { z } from 'zod';
import type { IntegrationEventStatus } from './integrations.js';
import type { LLMClient } from '../services/llm/client.js';
import type { FounderPromptContext } from './founderMemory.js';
import type { RetrievedChunk } from './embeddings.js';

export type AiExecutionStatus =
  | 'requested'
  | 'running'
  | 'completed'
  | 'failed'
  | 'requires_approval'
  | 'approved'
  | 'rejected';

export type AiToolTenantScope = 'org' | 'clinic' | 'mixed';

export interface AiToolExecutionContext {
  organizationId: string;
  userId: string | null;
  clinicId: string | null;
  llmClient?: LLMClient;
  founderPromptContext?: FounderPromptContext;
  retrievedChunks?: RetrievedChunk[];
}

export interface AiToolContext {
  prospectId?: string;
  auditId?: string;
  [key: string]: unknown;
}

export interface AiToolOutput {
  data: unknown;
  requires_human_review: boolean;
}

export interface AiToolDefinition {
  id: string;
  name: string;
  description: string;
  tenant_scope: AiToolTenantScope;
  required_context: string[];
  human_review_required: boolean;
  context_schema: z.ZodType;
  execute(
    execContext: AiToolExecutionContext,
    toolContext: AiToolContext
  ): Promise<unknown>;
}

export interface AiToolExecutionRecord {
  id: string;
  organization_id: string;
  clinic_id: string | null;
  user_id: string | null;
  tool_id: string;
  context: AiToolContext | null;
  status: AiExecutionStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  result_id: string | null;
  result_output: Record<string, unknown> | null;
  requires_human_review: boolean;
  approved_by: string | null;
  approved_at: string | null;
  success: boolean;
  error: string | null;
  created_at: string;
}

export interface AiToolExecutionResult {
  id: string;
  organization_id: string;
  tool_id: string;
  status: AiExecutionStatus;
  data: unknown;
  requires_human_review: boolean;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

export interface IntegrationDeliveryEvent {
  provider: string;
  event_type: string;
  status: IntegrationEventStatus;
  retry_count: number;
  error_message: string | null;
  next_retry_at: string | null;
  sent_at: string | null;
}

export interface AiExecutionWithIntegration
  extends AiToolExecutionRecord {
  integration_events: IntegrationDeliveryEvent[];
}

export interface AiExecutionWithDeliveryStatus
  extends AiToolExecutionRecord {
  latest_integration_status: IntegrationEventStatus | null;
  has_integration_events: boolean;
}

// V3.1.13-D: Streaming types

export type StreamEventType =
  | 'message_start'
  | 'message_chunk'
  | 'tool_event'
  | 'message_complete'
  | 'error';

export interface StreamBase {
  type: StreamEventType;
}

export interface StreamMessageStart extends StreamBase {
  type: 'message_start';
  execution_id: string;
}

export interface StreamMessageChunk extends StreamBase {
  type: 'message_chunk';
  content: string;
  accumulated: string;
}

export interface StreamToolEvent extends StreamBase {
  type: 'tool_event';
  tool_id: string;
  status: 'running' | 'completed' | 'failed';
  execution_id?: string;
  label?: string;
}

export interface StreamMessageComplete extends StreamBase {
  type: 'message_complete';
  content: string;
}

export interface StreamError extends StreamBase {
  type: 'error';
  message: string;
  kind?: string;
}

export type StreamEvent =
  | StreamMessageStart
  | StreamMessageChunk
  | StreamToolEvent
  | StreamMessageComplete
  | StreamError;
