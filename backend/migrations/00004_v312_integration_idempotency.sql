-- V3.1.2-A Integration Event Idempotency
--
-- Adds a database-level uniqueness constraint on integration_events to prevent
-- duplicate integration events from being created for the same AI execution.
--
-- The invariant enforced is:
--   one event per (ai_execution_id, provider, event_type)
--
-- ai_execution_id is nullable (added in 00003 without NOT NULL), so a partial
-- unique index is used: the constraint only applies when ai_execution_id IS NOT NULL.
-- Rows with NULL ai_execution_id (pre-existing or manually created) are unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_events_execution_provider_type
  ON integration_events (ai_execution_id, provider, event_type)
  WHERE ai_execution_id IS NOT NULL;

-- ============================================================================
-- NOTES
-- ============================================================================
-- This is a non-destructive, additive change:
-- - No existing rows are deleted or modified.
-- - No columns are added or removed.
-- - No enum types are changed.
-- - The constraint only affects rows with a non-NULL ai_execution_id.
--
-- If a duplicate (ai_execution_id, provider, event_type) is inserted, PostgreSQL
-- will raise a unique violation error (SQLSTATE 23505), which the application
-- layer catches to return the existing event.
