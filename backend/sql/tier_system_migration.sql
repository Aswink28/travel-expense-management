-- ================================================================
--  MIGRATION: Tier System
--  Tiers, designation→tier mappings, and per-user tier/designation.
-- ================================================================

CREATE TABLE IF NOT EXISTS tiers (
  id                         SERIAL        PRIMARY KEY,
  name                       VARCHAR(50)   NOT NULL UNIQUE,
  rank                       INTEGER       NOT NULL UNIQUE,   -- 1 = highest
  description                VARCHAR(255),
  flight_classes             TEXT[]        NOT NULL DEFAULT '{}',
  train_classes              TEXT[]        NOT NULL DEFAULT '{}',
  bus_types                  TEXT[]        NOT NULL DEFAULT '{}',
  hotel_types                TEXT[]        NOT NULL DEFAULT '{}',
  budget_limit               NUMERIC(12,2) NOT NULL DEFAULT 0,
  budget_period              VARCHAR(10)   NOT NULL DEFAULT 'trip',
  approver_roles             TEXT[]        NOT NULL DEFAULT '{}',
  approval_type              VARCHAR(20)   NOT NULL DEFAULT 'ALL',
  intl_flight_class_upgrade  BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tiers_budget_period_chk') THEN
    ALTER TABLE tiers ADD CONSTRAINT tiers_budget_period_chk CHECK (budget_period IN ('trip','day'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tiers_approval_type_chk') THEN
    ALTER TABLE tiers ADD CONSTRAINT tiers_approval_type_chk CHECK (approval_type IN ('ANY_ONE','ALL'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS designation_tiers (
  id          SERIAL       PRIMARY KEY,
  designation VARCHAR(100) NOT NULL UNIQUE,
  tier_id     INTEGER      NOT NULL REFERENCES tiers(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_designation_tiers_tier ON designation_tiers(tier_id);

-- Per-user designation + tier
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_id     INTEGER REFERENCES tiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_tier_id ON users(tier_id);

-- Seed default tiers — hierarchy: Tier 1 highest authority, Tier 5 lowest.
-- Approver lists run sequentially (lowest authority first). Super Admin and Booking
-- Admin are intentionally NOT approvers — Super Admin manages users/sites, Booking
-- Admin handles post-approval bookings.
--
-- Per-tier approver counts follow standard corporate practice (1 or max 2):
--   Tier 1 (CEO)                  : 2 approvers — peer executive review
--   Tier 2 (Super Admin / Booking): 2 approvers — strict control for sensitive roles
--   Tier 3 (Manager / Finance)    : 1 approver  — peer budget control
--   Tier 4 (Tech Lead)            : 1 approver  — direct reporting line
--   Tier 5 (Software Engineer)    : 2 approvers — junior flow with TL + Manager
INSERT INTO tiers (name, rank, description, flight_classes, train_classes, bus_types, hotel_types, budget_limit, budget_period, approver_roles, approval_type)
VALUES
  ('Tier 1', 1, 'Super Admin',                ARRAY['First Class','Business'],     ARRAY['1AC','2AC','Executive'], ARRAY['Volvo','Luxury','Sleeper'],    ARRAY['5-Star','Luxury'], 100000, 'trip', ARRAY['Manager','Finance']::TEXT[],       'ALL'),
  ('Tier 2', 2, 'Booking Admin',              ARRAY['Business','Premium Economy'], ARRAY['1AC','2AC'],             ARRAY['Volvo','Sleeper','AC Seater'], ARRAY['4-Star','5-Star'],  60000, 'trip', ARRAY['Manager','Finance']::TEXT[],       'ALL'),
  ('Tier 3', 3, 'Manager',                    ARRAY['Business','Premium Economy'], ARRAY['2AC','3AC'],             ARRAY['AC Sleeper','AC Seater'],      ARRAY['4-Star'],           40000, 'trip', ARRAY['Finance']::TEXT[],                 'ALL'),
  ('Tier 4', 4, 'Tech Lead',                  ARRAY['Premium Economy','Economy'],  ARRAY['2AC','3AC'],             ARRAY['AC Sleeper','AC Seater'],      ARRAY['3-Star'],           25000, 'trip', ARRAY['Manager']::TEXT[],                 'ALL'),
  ('Tier 5', 5, 'Software Engineer',          ARRAY['Economy'],                    ARRAY['3AC','Sleeper'],         ARRAY['AC Seater','Non-AC Seater'],   ARRAY['Budget','3-Star'],  15000, 'trip', ARRAY['Tech Lead','Manager']::TEXT[],     'ALL')
ON CONFLICT (name) DO NOTHING;

-- Default designation → tier mapping (only inserts if not already present).
-- Finance shares Tier 3 with Manager (both handle budget-tier approvals).
INSERT INTO designation_tiers (designation, tier_id)
SELECT v.designation, t.id
  FROM (VALUES
    ('Super Admin',   'Tier 1'),
    ('Booking Admin', 'Tier 2'),
    ('Manager',       'Tier 3'),
    ('Finance',       'Tier 3'),
    ('Tech Lead',     'Tier 4'),
    ('Software Engineer', 'Tier 5')
  ) AS v(designation, tier_name)
  JOIN tiers t ON t.name = v.tier_name
ON CONFLICT (designation) DO NOTHING;

-- One-time realignment: refresh approver_roles on the default tier rows so sequential
-- approval reflects the hierarchy (1 or max 2 approvers per standard practice).
-- Super Admin and Booking Admin never approve, so they don't appear as approver roles.
UPDATE tiers SET approver_roles = ARRAY['Manager','Finance']::TEXT[]   WHERE name = 'Tier 1';
UPDATE tiers SET approver_roles = ARRAY['Manager','Finance']::TEXT[]   WHERE name = 'Tier 2';
UPDATE tiers SET approver_roles = ARRAY['Finance']::TEXT[]             WHERE name = 'Tier 3';
UPDATE tiers SET approver_roles = ARRAY['Manager']::TEXT[]             WHERE name = 'Tier 4';
UPDATE tiers SET approver_roles = ARRAY['Tech Lead','Manager']::TEXT[] WHERE name = 'Tier 5';

-- Remove Booking Admin and Super Admin from ALL tiers (including custom ones).
UPDATE tiers SET approver_roles = array_remove(approver_roles, 'Booking Admin')
WHERE 'Booking Admin' = ANY(approver_roles);
UPDATE tiers SET approver_roles = array_remove(approver_roles, 'Super Admin')
WHERE 'Super Admin' = ANY(approver_roles);

-- Rename designation "Employee" → "Software Engineer" across existing installs.
-- Idempotent: only fires when a row still uses the old name.
UPDATE designation_tiers SET designation = 'Software Engineer'
WHERE designation = 'Employee'
  AND NOT EXISTS (SELECT 1 FROM designation_tiers WHERE designation = 'Software Engineer');

-- If both rows happen to exist (fresh seed ran after a stale 'Employee' row), drop the old one.
DELETE FROM designation_tiers WHERE designation = 'Employee';

-- Refresh any users currently tagged with the old designation.
UPDATE users SET designation = 'Software Engineer' WHERE designation = 'Employee';

-- Refresh the built-in Tier 5 description if it still reads 'Employee'.
UPDATE tiers SET description = 'Software Engineer'
WHERE name = 'Tier 5' AND description = 'Employee';

-- ── Designation → Role mapping ─────────────────────────────────
-- Each designation declares the role it belongs to. When an employee picks a
-- designation during onboarding, the role + tier + approver chain are all resolved
-- from this table.
ALTER TABLE designation_tiers ADD COLUMN IF NOT EXISTS role user_role_enum;

-- Backfill role for the seeded designations (case-insensitive match on the name).
UPDATE designation_tiers SET role = 'Software Engineer'::user_role_enum WHERE LOWER(designation) = 'software engineer' AND role IS NULL;
UPDATE designation_tiers SET role = 'Tech Lead'::user_role_enum         WHERE LOWER(designation) = 'tech lead'         AND role IS NULL;
UPDATE designation_tiers SET role = 'Manager'::user_role_enum           WHERE LOWER(designation) = 'manager'           AND role IS NULL;
UPDATE designation_tiers SET role = 'Finance'::user_role_enum           WHERE LOWER(designation) = 'finance'           AND role IS NULL;
UPDATE designation_tiers SET role = 'Booking Admin'::user_role_enum     WHERE LOWER(designation) = 'booking admin'     AND role IS NULL;
UPDATE designation_tiers SET role = 'Super Admin'::user_role_enum       WHERE LOWER(designation) = 'super admin'       AND role IS NULL;
