-- V3.1.4-A Performance Index for AI Execution Delivery Status
--
-- Adds a composite index on integration_events to accelerate the two
-- V3.1.4-B query patterns:
--   1. Execution detail event lookup:
--      listExecutionsWithIntegrationStatus → getExecutionEvents
--      WHERE ai_execution_id = $1 AND organization_id = $2
--   2. Latest integration status list query:
--      listExecutionsWithIntegrationStatus
--      WHERE ai_execution_id = ANY($1) AND organization_id = $2
--
-- The index supports both the single-execution lookup (via prefix
-- ai_execution_id) and the batch lookup (via ai_execution_id IN (...)
-- combined with organization_id partitioning for tenant isolation).
--
-- This is a non-destructive, additive change:
-- - No existing rows are deleted or modified.
-- - No columns are added or removed.
-- - No constraints are changed.

CREATE INDEX IF NOT EXISTS idx_integration_events_ai_execution_org
  ON integration_events (ai_execution_id, organization_id);
