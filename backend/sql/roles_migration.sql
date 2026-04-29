-- ================================================================
--  MIGRATION: Dynamic Roles & Page Access
-- ================================================================

-- ── Table: roles — master list of roles ──────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL       PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL UNIQUE,
  description VARCHAR(255),
  color       VARCHAR(10)  NOT NULL DEFAULT '#888',
  is_system   BOOLEAN      NOT NULL DEFAULT FALSE,  -- system roles cannot be deleted
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Table: role_pages — which pages each role can access ─────
CREATE TABLE IF NOT EXISTS role_pages (
  id        SERIAL      PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL REFERENCES roles(name) ON UPDATE CASCADE ON DELETE CASCADE,
  page_id   VARCHAR(50) NOT NULL,
  page_label VARCHAR(80) NOT NULL,
  page_icon  VARCHAR(10) NOT NULL DEFAULT '◈',
  sort_order INTEGER     NOT NULL DEFAULT 0,
  UNIQUE(role_name, page_id)
);

CREATE INDEX IF NOT EXISTS idx_role_pages_role ON role_pages(role_name);

-- ── Seed system roles ────────────────────────────────────────
INSERT INTO roles (name, description, color, is_system) VALUES
  ('Finance',       'Finance team — final budget approval, set amounts',           '#40C8E0', TRUE),
  ('Booking Admin', 'Booking admin — book travel & hotels for employees',          '#FF6B6B', TRUE),
  ('Super Admin',   'Full access — manage employees, roles, tiers, all features',  '#30D158', TRUE)
ON CONFLICT (name) DO NOTHING;

-- ── Seed page access for existing roles ──────────────────────
-- (Software Engineer / Tech Lead / Manager are designations now, not roles —
--  their pages live under "Request Approver" and "Employee" via the consolidation
--  migration. No seed rows for those legacy role names.)

-- Finance
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Finance', 'dashboard',    'Dashboard',      '▦', 1),
  ('Finance', 'approvals',    'Finance Queue',  '◎', 3),
  ('Finance', 'new-request',  'New Request',    '+', 4),
  ('Finance', 'my-wallet',    'My Wallet',      '◉', 5),
  ('Finance', 'transactions', 'Transactions',   '📊', 6),
  ('Finance', 'my-tickets',   'My Tickets',     '🎟', 7)
ON CONFLICT (role_name, page_id) DO NOTHING;

-- Booking Admin
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Booking Admin', 'dashboard',           'Dashboard',       '▦', 1),
  ('Booking Admin', 'booking-panel',       'Booking Panel',   '◈', 2),
  ('Booking Admin', 'booking-history',     'History',         '◎', 3),
  ('Booking Admin', 'admin-bookings-view', 'Booking History', '📋', 4)
ON CONFLICT (role_name, page_id) DO NOTHING;

-- Super Admin — manages users/sites, does not approve travel requests.
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Super Admin', 'dashboard',          'Dashboard',      '▦',  1),
  ('Super Admin', 'new-request',        'New Request',    '+',  4),
  ('Super Admin', 'my-wallet',          'My Wallet',      '◉',  5),
  ('Super Admin', 'transactions',       'Transactions',   '⊟',  6),
  ('Super Admin', 'my-tickets',         'My Tickets',     '◰',  7),
  ('Super Admin', 'employees',          'Employees',      '◆',  8),
  ('Super Admin', 'roles',              'Role Manager',   '⚙',  9),
  ('Super Admin', 'tiers',              'Tier Config',    '◐', 10),
  ('Super Admin', 'designations',       'Designations',   '◇', 11),
  ('Super Admin', 'audit-log',          'Approver Audit', '▤', 12)
ON CONFLICT (role_name, page_id) DO NOTHING;

-- Backfill icons for existing installs — INSERT above is idempotent
-- (ON CONFLICT DO NOTHING) so we explicitly UPDATE the rows that need
-- the new geometric icons. Keeps the sidebar visually consistent
-- (no leftover emoji icons from earlier seeds).
UPDATE role_pages SET page_icon = '▤' WHERE page_id = 'audit-log'    AND page_icon = '📋';
UPDATE role_pages SET page_icon = '⊟' WHERE page_id = 'transactions' AND page_icon = '📊';
UPDATE role_pages SET page_icon = '◰' WHERE page_id = 'my-tickets'   AND page_icon = '🎟';

-- (The legacy "Employee → Software Engineer" rename block has been retired.
--  Software Engineer is now a designation, not a role. The role consolidation
--  migration handles introducing the "Employee" permission-class role.)

-- Retire the legacy "All Requests" (requests) page — it's been removed.
-- This cleans it up from any existing install on next startup.
DELETE FROM role_pages WHERE page_id = 'requests';

-- Retire the legacy "Ad-Hoc Booking" page (folded back into Booking History / Panel).
DELETE FROM role_pages WHERE page_id = 'ad-hoc-booking';

-- Super Admin is no longer an approver — drop the Approvals sidebar entry.
DELETE FROM role_pages WHERE role_name = 'Super Admin' AND page_id = 'approvals';

-- Ensure Dashboard is the first menu item for every role.
-- Step 1: if a role doesn't have a dashboard page, insert it.
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order)
SELECT r.name, 'dashboard', 'Dashboard', '▦', 0
FROM roles r
WHERE NOT EXISTS (
  SELECT 1 FROM role_pages p WHERE p.role_name = r.name AND p.page_id = 'dashboard'
);

-- Step 2: renumber every role's pages so Dashboard sits at sort_order=1 and the rest
-- stay in their original relative order (no ties).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY role_name
           ORDER BY (page_id = 'dashboard') DESC, sort_order ASC, page_id ASC
         ) AS new_order
  FROM role_pages
)
UPDATE role_pages rp SET sort_order = ranked.new_order
FROM ranked WHERE ranked.id = rp.id;

-- Rename "Admin Bookings" → "Booking History" across any existing installs.
UPDATE role_pages SET page_label = 'Booking History'
WHERE page_id = 'admin-bookings-view' AND page_label <> 'Booking History';
