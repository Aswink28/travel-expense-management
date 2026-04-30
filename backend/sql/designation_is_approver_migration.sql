-- ============================================================
-- designation_is_approver_migration.sql
-- ────────────────────────────────────────────────────────────
-- Adds an explicit "Is Approver" flag to designation_tiers so
-- Tier Configuration's approver picker is driven by an admin
-- decision per designation instead of an implicit role denylist.
--
-- Rules:
--   * New column `is_approver BOOLEAN NOT NULL DEFAULT FALSE`.
--     Per spec, brand-new designations default to FALSE.
--   * Backfill marks existing rows TRUE iff their current role
--     would have shown them in the legacy approver picker
--     (i.e. role is set and not in the non-approver list:
--      Employee / Super Admin / Booking Admin). This preserves
--     today's behaviour with zero manual reconciliation.
-- Idempotent — safe to run repeatedly.
-- ============================================================

-- 1. Add the column.
ALTER TABLE designation_tiers
  ADD COLUMN IF NOT EXISTS is_approver BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. One-time backfill for rows that existed before this migration.
--    Detection heuristic: if the row currently has a role and the
--    role is NOT one of the known non-approver roles, we treat it
--    as an approver (mirrors TierConfig.jsx legacy filter).
--
--    We only flip rows that are still at the column default (FALSE)
--    to preserve any deliberate later edits made via the new UI.
UPDATE designation_tiers
   SET is_approver = TRUE
 WHERE is_approver = FALSE
   AND role IS NOT NULL
   AND role::text NOT IN ('Employee', 'Super Admin', 'Booking Admin');

-- 3. Lookup index — Tier Config queries filter by is_approver = TRUE
--    when listing approver-eligible designations.
CREATE INDEX IF NOT EXISTS idx_designation_tiers_is_approver
  ON designation_tiers(is_approver)
  WHERE is_approver = TRUE;
