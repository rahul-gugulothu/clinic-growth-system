import type { z } from 'zod';

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
