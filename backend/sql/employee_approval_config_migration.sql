-- ================================================================
--  MIGRATION: Per-employee approval configuration
--  Adds per-user approver_roles, approval_type, and required_approval_count
-- ================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS approver_roles TEXT[] DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_type VARCHAR(20) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS required_approval_count INTEGER DEFAULT NULL;

-- Constrain approval_type values (only ANY_ONE or ALL; CUSTOM retired)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_approval_type_chk') THEN
    ALTER TABLE users DROP CONSTRAINT users_approval_type_chk;
  END IF;
END $$;

-- Migrate any legacy CUSTOM rows to ALL so they satisfy the new constraint
UPDATE users SET approval_type = 'ALL' WHERE approval_type = 'CUSTOM';

ALTER TABLE users ADD CONSTRAINT users_approval_type_chk
  CHECK (approval_type IS NULL OR approval_type IN ('ANY_ONE','ALL'));

CREATE INDEX IF NOT EXISTS idx_users_approver_roles ON users USING GIN (approver_roles);

-- Retire the legacy three-level hierarchy fields from travel_requests.
-- Approval is now driven entirely by the per-employee config above.
ALTER TABLE travel_requests DROP COLUMN IF EXISTS approver_1;
ALTER TABLE travel_requests DROP COLUMN IF EXISTS approver_2;
ALTER TABLE travel_requests DROP COLUMN IF EXISTS approver_3;
