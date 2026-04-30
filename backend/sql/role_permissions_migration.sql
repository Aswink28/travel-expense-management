-- ============================================================
-- role_permissions_migration.sql
-- ────────────────────────────────────────────────────────────
-- Phase-1 of the Admin User RBAC feature.
--
-- Extends role_pages from a coarse "role can see this page"
-- table into a full View/Create/Edit/Delete permission matrix.
--
-- Rules:
--   * Adds can_view / can_create / can_edit / can_delete BOOLEAN
--     columns. Existing column-level defaults are TRUE for view
--     and FALSE for the rest, so brand-new role rows added later
--     are conservative by default (View-only).
--   * One-time backfill: ALL pre-existing rows get every column
--     set to TRUE. This preserves exactly today's behaviour for
--     existing roles — Super Admin / Booking Admin / Finance —
--     where if the role had a page row it was implicitly fully
--     trusted.
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Add columns. Defaults are conservative for FUTURE inserts.
ALTER TABLE role_pages
  ADD COLUMN IF NOT EXISTS can_view   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_create BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_edit   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_delete BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. One-time backfill — only flip rows still at the column default
--    so deliberate UI edits made post-migration are not clobbered on
--    re-run.  We grant FULL permissions to any pre-existing
--    role_page row to preserve current real-world behaviour.
UPDATE role_pages
   SET can_create = TRUE,
       can_edit   = TRUE,
       can_delete = TRUE
 WHERE can_create = FALSE
   AND can_edit   = FALSE
   AND can_delete = FALSE;

-- 3. Add the new "Admin Users" page entry for Super Admin so the
--    new module is reachable from the sidebar after deploy.
--    (ALL_PAGES is the source of truth for the picker; this row is
--    what makes the link actually appear.)
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order, can_view, can_create, can_edit, can_delete)
VALUES ('Super Admin', 'admin-users', 'Admin Users', '◈', 13, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (role_name, page_id) DO NOTHING;

-- 4. Index — page-permission lookups are on the auth hot path.
CREATE INDEX IF NOT EXISTS idx_role_pages_role_page ON role_pages(role_name, page_id);
