-- V3.1.3-A — Founder AI Conversation Memory Foundation
--
-- Adds persistent Founder AI conversation storage so conversations survive
-- across sessions while remaining organization- and user-scoped.
--
--   founder_conversations          — a single conversation thread per founder
--   founder_conversation_messages  — ordered messages within a thread
--
-- Messages cascade-delete with their parent conversation. `updated_at` on the
-- parent row is maintained explicitly by the service (no triggers) so that the
-- most-recently-active conversation sorts first.

-- ============================================================================
-- founder_conversations
-- ============================================================================

CREATE TABLE founder_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    user_id         UUID NOT NULL,
    clinic_id       UUID NULL,
    title           TEXT NOT NULL DEFAULT 'New Conversation',
    archived        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_founder_conversations_organization_id ON founder_conversations(organization_id);
CREATE INDEX idx_founder_conversations_user_id         ON founder_conversations(user_id);
CREATE INDEX idx_founder_conversations_clinic_id        ON founder_conversations(clinic_id);
CREATE INDEX idx_founder_conversations_archived         ON founder_conversations(archived);
CREATE INDEX idx_founder_conversations_updated_at_desc ON founder_conversations(updated_at DESC);

-- ============================================================================
-- founder_conversation_messages
-- ============================================================================

CREATE TABLE founder_conversation_messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES founder_conversations(id) ON DELETE CASCADE,
    organization_id  UUID NOT NULL,
    role             TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
    content          TEXT NOT NULL,
    tool_execution_id UUID NULL REFERENCES ai_tool_executions(id),
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_founder_conversation_messages_conversation_id ON founder_conversation_messages(conversation_id);
CREATE INDEX idx_founder_conversation_messages_organization_id ON founder_conversation_messages(organization_id);
CREATE INDEX idx_founder_conversation_messages_created_at        ON founder_conversation_messages(created_at);
