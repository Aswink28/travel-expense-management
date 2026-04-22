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
-- Approver lists are applied sequentially (lowest authority first) by the approval engine.
-- Booking Admin is intentionally NOT an approver — they handle post-approval bookings.
INSERT INTO tiers (name, rank, description, flight_classes, train_classes, bus_types, hotel_types, budget_limit, budget_period, approver_roles, approval_type)
VALUES
  ('Tier 1', 1, 'Super Admin',                ARRAY['First Class','Business'],     ARRAY['1AC','2AC','Executive'], ARRAY['Volvo','Luxury','Sleeper'],    ARRAY['5-Star','Luxury'], 100000, 'trip', ARRAY[]::TEXT[],                          'ALL'),
  ('Tier 2', 2, 'Booking Admin',              ARRAY['Business','Premium Economy'], ARRAY['1AC','2AC'],             ARRAY['Volvo','Sleeper','AC Seater'], ARRAY['4-Star','5-Star'],  60000, 'trip', ARRAY['Super Admin']::TEXT[],             'ALL'),
  ('Tier 3', 3, 'Manager',                    ARRAY['Business','Premium Economy'], ARRAY['2AC','3AC'],             ARRAY['AC Sleeper','AC Seater'],      ARRAY['4-Star'],           40000, 'trip', ARRAY['Super Admin']::TEXT[],             'ALL'),
  ('Tier 4', 4, 'Tech Lead',                  ARRAY['Premium Economy','Economy'],  ARRAY['2AC','3AC'],             ARRAY['AC Sleeper','AC Seater'],      ARRAY['3-Star'],           25000, 'trip', ARRAY['Manager','Super Admin']::TEXT[],   'ALL'),
  ('Tier 5', 5, 'Employee',                   ARRAY['Economy'],                    ARRAY['3AC','Sleeper'],         ARRAY['AC Seater','Non-AC Seater'],   ARRAY['Budget','3-Star'],  15000, 'trip', ARRAY['Tech Lead','Manager']::TEXT[],     'ALL')
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
    ('Employee',      'Tier 5')
  ) AS v(designation, tier_name)
  JOIN tiers t ON t.name = v.tier_name
ON CONFLICT (designation) DO NOTHING;

-- One-time realignment: refresh approver_roles on the default tier rows so sequential
-- approval reflects the hierarchy. Booking Admin is intentionally omitted — they handle
-- post-approval bookings, not the approval flow itself. Idempotent; five default names only.
UPDATE tiers SET approver_roles = ARRAY[]::TEXT[]                         WHERE name = 'Tier 1';
UPDATE tiers SET approver_roles = ARRAY['Super Admin']::TEXT[]            WHERE name = 'Tier 2';
UPDATE tiers SET approver_roles = ARRAY['Super Admin']::TEXT[]            WHERE name = 'Tier 3';
UPDATE tiers SET approver_roles = ARRAY['Manager','Super Admin']::TEXT[]  WHERE name = 'Tier 4';
UPDATE tiers SET approver_roles = ARRAY['Tech Lead','Manager']::TEXT[]    WHERE name = 'Tier 5';

-- Remove Booking Admin from ALL tiers (including any custom tiers admins may have added).
UPDATE tiers SET approver_roles = array_remove(approver_roles, 'Booking Admin')
WHERE 'Booking Admin' = ANY(approver_roles);
