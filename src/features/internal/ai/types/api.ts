export type AiExecutionStatus =
  | 'requested'
  | 'running'
  | 'completed'
  | 'failed'
  | 'requires_approval'
  | 'approved'
  | 'rejected';

export type IntegrationEventStatus =
  | 'pending'
  | 'sent'
  | 'retry'
  | 'failed';

export interface IntegrationDeliveryEvent {
  provider: string;
  event_type: string;
  status: IntegrationEventStatus;
  retry_count: number;
  error_message: string | null;
  next_retry_at: string | null;
  sent_at: string | null;
}

export interface AiExecutionContext {
  [key: string]: unknown;
}

export interface AiExecution {
  id: string;
  organization_id: string;
  clinic_id: string | null;
  user_id: string | null;
  tool_id: string;
  context: AiExecutionContext | null;
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

export interface AiExecutionWithIntegration extends AiExecution {
  integration_events: IntegrationDeliveryEvent[];
}

export interface AiExecutionWithDeliveryStatus extends AiExecution {
  latest_integration_status: IntegrationEventStatus | null;
  has_integration_events: boolean;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface AiExecutionsListResponse {
  executions: AiExecutionWithDeliveryStatus[];
  pagination: Pagination;
}

export interface AiExecutionDetailResponse {
  execution: AiExecutionWithIntegration;
}

export interface ApproveExecutionResponse {
  execution: AiExecution;
}

export interface RejectExecutionResponse {
  execution: AiExecution;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface AiToolDefinition {
  id: string;
  name: string;
  description: string;
  tenant_scope: 'org' | 'clinic' | 'mixed';
  required_context: string[];
  human_review_required: boolean;
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

export interface JwtPayload {
  sub: string;
  org_id: string;
  role: string;
  clinic_id: string | null;
  token_type: 'access' | 'refresh';
  iat: number;
  exp: number;
}
