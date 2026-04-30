-- ============================================================
-- parallel_approval_migration.sql
-- ────────────────────────────────────────────────────────────
-- Adds support for Parallel approval flow alongside the existing
-- Sequential flow. The decision is now expressed by TWO fields:
--
--   approval_flow ∈ ('SEQUENTIAL', 'PARALLEL')   ← NEW
--   approval_type ∈ ('ANY_ONE',    'ALL')        ← existing, now
--                                                  meaningful only
--                                                  when flow=PARALLEL
--
-- For Sequential flow the engine ignores approval_type and behaves
-- exactly as it does today (step-by-step, all must approve in order).
--
-- Default = SEQUENTIAL for every existing record. No engine change
-- is observable until an admin explicitly flips a tier or employee
-- to PARALLEL. Idempotent.
-- ============================================================

-- 1. New column on users (per-employee override).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS approval_flow VARCHAR(20) DEFAULT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_approval_flow_chk') THEN
    ALTER TABLE users DROP CONSTRAINT users_approval_flow_chk;
  END IF;
END $$;

ALTER TABLE users ADD CONSTRAINT users_approval_flow_chk
  CHECK (approval_flow IS NULL OR approval_flow IN ('SEQUENTIAL', 'PARALLEL'));

-- 2. New column on tiers (default flow for any employee bound to that tier).
ALTER TABLE tiers
  ADD COLUMN IF NOT EXISTS approval_flow VARCHAR(20) NOT NULL DEFAULT 'SEQUENTIAL';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tiers_approval_flow_chk') THEN
    ALTER TABLE tiers DROP CONSTRAINT tiers_approval_flow_chk;
  END IF;
END $$;

ALTER TABLE tiers ADD CONSTRAINT tiers_approval_flow_chk
  CHECK (approval_flow IN ('SEQUENTIAL', 'PARALLEL'));

-- 3. Backfill — every existing row gets explicit SEQUENTIAL so the engine
--    has a deterministic value to read regardless of where it looks.
--    Only rewrites NULL/missing values; deliberate UI edits made later
--    will not be clobbered if this migration is re-run.
UPDATE tiers       SET approval_flow = 'SEQUENTIAL' WHERE approval_flow IS NULL;
-- users.approval_flow stays NULL by default — NULL means "fall through to
-- the tier's value" (matches existing semantics for approver_roles /
-- approval_type override columns).
