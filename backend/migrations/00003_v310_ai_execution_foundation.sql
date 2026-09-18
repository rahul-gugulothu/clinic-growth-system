-- V3.1.0-A — AI Execution Foundation
--
-- Adds the database columns and types required for:
-- - AI tool execution lifecycle tracking (V3.1.0)
-- - Human review / approval flow (V3.1.1)
-- - Integration event linkage (V3.1.2)
--
-- Does NOT modify 00001_initial_schema.sql or 00002_seed_dev_data.sql.
-- Preserves existing success/error/result_id columns for backward compatibility.

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE ai_execution_status AS ENUM (
  'requested',
  'running',
  'completed',
  'failed',
  'requires_approval',
  'approved',
  'rejected'
);

-- ============================================================================
-- ai_tool_executions: execution lifecycle columns
-- ============================================================================

ALTER TABLE ai_tool_executions
  ADD COLUMN status              ai_execution_status NOT NULL DEFAULT 'requested',
  ADD COLUMN started_at          TIMESTAMPTZ,
  ADD COLUMN completed_at        TIMESTAMPTZ,
  ADD COLUMN result_output       JSONB,
  ADD COLUMN requires_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN approved_by         UUID REFERENCES users(id),
  ADD COLUMN approved_at         TIMESTAMPTZ,
  ADD COLUMN clinic_id           UUID REFERENCES clinics(id);

CREATE INDEX idx_ai_tool_executions_status     ON ai_tool_executions(status);
CREATE INDEX idx_ai_tool_executions_started_at ON ai_tool_executions(started_at);
CREATE INDEX idx_ai_tool_executions_clinic_id  ON ai_tool_executions(clinic_id);

-- ============================================================================
-- audit_log: clinic attribution for clinic-scoped audit events
-- ============================================================================

ALTER TABLE audit_log
  ADD COLUMN clinic_id UUID REFERENCES clinics(id);

CREATE INDEX idx_audit_log_clinic_id ON audit_log(clinic_id);

-- ============================================================================
-- integration_events: trace from AI draft approval to outbound event
-- ============================================================================

ALTER TABLE integration_events
  ADD COLUMN ai_execution_id UUID REFERENCES ai_tool_executions(id);
