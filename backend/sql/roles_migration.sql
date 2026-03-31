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
  ('Employee',      'Standard employee — submit requests, track wallet',           '#0A84FF', TRUE),
  ('Tech Lead',     'Team lead — approve team requests',                           '#BF5AF2', TRUE),
  ('Manager',       'Manager — higher-level approvals, view all requests',         '#FF9F0A', TRUE),
  ('Finance',       'Finance team — final budget approval, set amounts',           '#40C8E0', TRUE),
  ('Booking Admin', 'Booking admin — book travel & hotels for employees',          '#FF6B6B', TRUE),
  ('Super Admin',   'Full access — manage employees, roles, tiers, all features',  '#30D158', TRUE)
ON CONFLICT (name) DO NOTHING;

-- ── Seed page access for existing roles ──────────────────────
-- Employee
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Employee', 'dashboard',    'Dashboard',    '▦', 1),
  ('Employee', 'my-requests',  'My Requests',  '◈', 2),
  ('Employee', 'new-request',  'New Request',  '+', 3),
  ('Employee', 'my-wallet',    'My Wallet',    '◉', 4),
  ('Employee', 'book',         'Book Travel',  '🎫', 5),
  ('Employee', 'my-tickets',   'My Tickets',   '🎟', 6)
ON CONFLICT (role_name, page_id) DO NOTHING;

-- Tech Lead
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Tech Lead', 'dashboard',    'Dashboard',    '▦', 1),
  ('Tech Lead', 'my-requests',  'My Requests',  '◈', 2),
  ('Tech Lead', 'approvals',    'Approvals',    '◎', 3),
  ('Tech Lead', 'new-request',  'New Request',  '+', 4),
  ('Tech Lead', 'my-wallet',    'My Wallet',    '◉', 5),
  ('Tech Lead', 'book',         'Book Travel',  '🎫', 6),
  ('Tech Lead', 'my-tickets',   'My Tickets',   '🎟', 7)
ON CONFLICT (role_name, page_id) DO NOTHING;

-- Manager
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Manager', 'dashboard',    'Dashboard',     '▦', 1),
  ('Manager', 'requests',     'All Requests',  '◈', 2),
  ('Manager', 'approvals',    'Approvals',     '◎', 3),
  ('Manager', 'new-request',  'New Request',   '+', 4),
  ('Manager', 'my-wallet',    'My Wallet',     '◉', 5),
  ('Manager', 'book',         'Book Travel',   '🎫', 6),
  ('Manager', 'my-tickets',   'My Tickets',    '🎟', 7)
ON CONFLICT (role_name, page_id) DO NOTHING;

-- Finance
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Finance', 'dashboard',    'Dashboard',      '▦', 1),
  ('Finance', 'requests',     'All Requests',   '◈', 2),
  ('Finance', 'approvals',    'Finance Queue',  '◎', 3),
  ('Finance', 'new-request',  'New Request',    '+', 4),
  ('Finance', 'my-wallet',    'My Wallet',      '◉', 5),
  ('Finance', 'book',         'Book Travel',    '🎫', 6),
  ('Finance', 'my-tickets',   'My Tickets',     '🎟', 7)
ON CONFLICT (role_name, page_id) DO NOTHING;

-- Booking Admin
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Booking Admin', 'dashboard',          'Dashboard',      '▦', 1),
  ('Booking Admin', 'booking-panel',      'Booking Panel',  '◈', 2),
  ('Booking Admin', 'booking-history',    'History',        '◎', 3),
  ('Booking Admin', 'ad-hoc-booking',     'Ad-Hoc Booking', '✈', 4),
  ('Booking Admin', 'admin-bookings-view','Admin Bookings', '📋', 5)
ON CONFLICT (role_name, page_id) DO NOTHING;

-- Super Admin
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order) VALUES
  ('Super Admin', 'dashboard',          'Dashboard',      '▦',  1),
  ('Super Admin', 'requests',           'All Requests',   '◈',  2),
  ('Super Admin', 'approvals',          'Approvals',      '◎',  3),
  ('Super Admin', 'new-request',        'New Request',    '+',  4),
  ('Super Admin', 'my-wallet',          'My Wallet',      '◉',  5),
  ('Super Admin', 'my-tickets',         'My Tickets',     '🎟', 6),
  ('Super Admin', 'employees',          'Employees',      '◆',  7),
  ('Super Admin', 'roles',              'Role Manager',   '⚙',  8),
  ('Super Admin', 'tiers',              'Tier Config',    '◐',  9),
  ('Super Admin', 'ad-hoc-booking',     'Ad-Hoc Booking', '✈', 10),
  ('Super Admin', 'admin-bookings-view','Admin Bookings', '📋', 11)
ON CONFLICT (role_name, page_id) DO NOTHING;
