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
-- "New Request" is reachable via the My Requests page's primary button, so
-- it doesn't need its own sidebar slot — that keeps the rail tighter and
-- avoids two distinct entry points for the same flow.
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Finance', 'dashboard',    'Dashboard',      '▦', 1),
  ('Finance', 'approvals',    'Finance Queue',  '◎', 3),
  ('Finance', 'my-wallet',    'My Wallet',      '◉', 5),
  ('Finance', 'transactions', 'Transactions',   '📊', 6),
  ('Finance', 'my-tickets',   'My Tickets',     '🎟', 7)
ON CONFLICT (role_name, page_id) DO NOTHING;

-- Booking Admin
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Booking Admin', 'dashboard',           'Dashboard',       '▦', 1),
  ('Booking Admin', 'booking-panel',       'Booking Panel',   '◈', 2),
  ('Booking Admin', 'admin-bookings-view', 'Booking History', '📋', 3)
ON CONFLICT (role_name, page_id) DO NOTHING;

-- Super Admin — manages users/sites, does not approve travel requests.
-- New Request is reachable from the My Requests page's primary button.
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Super Admin', 'dashboard',          'Dashboard',      '▦',  1),
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

-- Retire the duplicate "History" sidebar entry — Booking Panel already owns the
-- recent-bookings panel, and the dedicated history surface is "Booking History"
-- (admin-bookings-view). The booking-history page-id is removed so no role,
-- including custom ones seeded earlier, keeps the duplicate row.
DELETE FROM role_pages WHERE page_id = 'booking-history';

-- "Book Travel" (page_id 'book') is the self-booking panel and is not used by
-- TL / Manager users. Those designations now hold the Request Approver role,
-- and Request Approver was the only system role still seeded with the page
-- (legacy carry-over from the pre-consolidation Tech Lead / Manager seeds).
-- Drop it so the sidebar matches the policy. Custom roles can still grant it
-- via Role Manager — it remains in ALL_PAGES.
DELETE FROM role_pages WHERE role_name = 'Request Approver' AND page_id = 'book';

-- "New Request" sidebar entry is retired for every role — the My Requests page
-- has a primary "+ New Request" button that's the canonical entry point. Two
-- entry points to the same form was redundant. The page itself stays wired
-- in App.jsx so the button still navigates correctly.
DELETE FROM role_pages WHERE page_id = 'new-request';

-- Admin Users management is Super-Admin-only. Earlier permission-matrix saves
-- (or partial seeds) granted view rights to other roles like Request Approver;
-- this strips those grants so the matrix matches the policy. Rerunning this
-- migration will undo any future grant via the matrix UI to other roles —
-- that's intentional for this surface.
DELETE FROM role_pages WHERE page_id = 'admin-users' AND role_name <> 'Super Admin';

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
