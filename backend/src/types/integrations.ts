export interface IntegrationEventRecord {
  id: string;
  organization_id: string;
  clinic_id: string | null;
  ai_execution_id: string | null;
  provider: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  status: IntegrationEventStatus;
  retry_count: number;
  error_message: string | null;
  next_retry_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export type IntegrationEventStatus = 'pending' | 'sent' | 'failed' | 'retry';

export interface IntegrationSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface IntegrationProvider {
  provider: string;
  send(params: {
    organizationId: string;
    event: IntegrationEventRecord;
  }): Promise<IntegrationSendResult>;
  validate(config: Record<string, unknown>): boolean;
  healthCheck?(): Promise<boolean>;
}

export interface CreateIntegrationEventParams {
  executionId: string;
  organizationId: string;
  userId: string | null;
  clinicId: string | null;
  provider: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface GetIntegrationEventParams {
  eventId: string;
  organizationId: string;
}

export interface GetExecutionEventsParams {
  executionId: string;
  organizationId: string;
}
