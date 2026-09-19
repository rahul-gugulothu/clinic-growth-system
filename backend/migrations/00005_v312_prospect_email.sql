-- V3.1.2-C3-A Prospect Email
--
-- Adds a nullable email column to the prospects table to provide a routable
-- recipient address for outbound email integrations (e.g. SendGrid).
--
-- This is a non-destructive, additive change:
-- - No existing rows are deleted or modified.
-- - The column is nullable; existing rows receive NULL and no backfill is performed.
-- - No indexes or uniqueness constraints are added.

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS email TEXT NULL;
