export const MESSAGE_ROLES = ['system', 'user', 'assistant', 'tool'] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

export interface ConversationRecord {
  id: string;
  organization_id: string;
  user_id: string;
  clinic_id: string | null;
  title: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessageRecord {
  id: string;
  conversation_id: string;
  organization_id: string;
  role: MessageRole;
  content: string;
  tool_execution_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateConversationInput {
  organizationId: string;
  userId: string;
  clinicId?: string | null;
  title?: string | null;
}

export interface CreateMessageInput {
  conversationId: string;
  organizationId: string;
  role: MessageRole;
  content: string;
  toolExecutionId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ConversationSummary {
  id: string;
  title: string;
  clinic_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
  message_count: number;
}

export interface ConversationDetail {
  conversation: ConversationRecord;
  messages: ConversationMessageRecord[];
}

export interface PaginatedConversations {
  conversations: ConversationSummary[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}
