export type AiExecutionStatus =
  | 'requested'
  | 'running'
  | 'completed'
  | 'failed'
  | 'requires_approval'
  | 'approved'
  | 'rejected';

export type StreamEventType =
  | 'message_start'
  | 'message_chunk'
  | 'tool_event'
  | 'message_complete'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  accumulated?: string;
  tool_id?: string;
  status?: 'running' | 'completed' | 'failed';
  execution_id?: string;
  label?: string;
  message?: string;
  kind?: string;
}

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

export interface IntegrationProviderHealth {
  configured: boolean;
  missing_keys: string[];
  healthy: boolean | null;
  checked_at: string | null;
}

export interface IntegrationHealthResponse {
  status: 'ok';
  integrations: Record<string, IntegrationProviderHealth>;
  all_healthy: boolean;
}

export interface IntegrationConfigStatus {
  provider: string;
  config_key?: string;
  configured: boolean;
}

export interface IntegrationConfigSetResponse {
  provider: string;
  config_key: string;
  configured: boolean;
}

export interface IntegrationConfigDeleteResponse {
  provider: string;
  config_key: string;
  deleted: boolean;
}

export interface FounderConversationSummary {
  id: string;
  title: string;
  clinic_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
  message_count: number;
}

export interface FounderConversationMessage {
  id: string;
  conversation_id: string;
  organization_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_execution_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface FounderConversationRecord {
  id: string;
  organization_id: string;
  user_id: string;
  clinic_id: string | null;
  title: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationListResponse {
  conversations: FounderConversationSummary[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface ConversationCreateResponse {
  conversation: FounderConversationRecord;
}

export interface ConversationDetailResponse {
  conversation: FounderConversationRecord;
  messages: FounderConversationMessage[];
}

export interface ConversationRenameResponse {
  conversation: FounderConversationRecord;
}

export interface ConversationDeleteResponse {
  deleted: boolean;
}

export interface ConversationArchiveResponse {
  archived: boolean;
  conversation: FounderConversationRecord;
}
