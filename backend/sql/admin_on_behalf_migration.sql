-- ================================================================
--  MIGRATION: Admin "Create On Behalf" support
--  1. Adds created_by / created_by_name to travel_requests
--  2. Adds admin-create-request page to role_pages
-- ================================================================

-- Track which admin created a request on behalf of an employee.
-- NULL = employee created the request themselves (backward-compatible).
ALTER TABLE travel_requests ADD COLUMN IF NOT EXISTS created_by      UUID REFERENCES users(id);
ALTER TABLE travel_requests ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(150);

-- Sidebar / permission entry for the new admin page.
INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order, can_view, can_create, can_edit, can_delete)
VALUES
  ('Super Admin',   'admin-create-request', 'Create On Behalf', '', 25, true, true, true, true),
  ('Booking Admin', 'admin-create-request', 'Create On Behalf', '', 25, true, true, false, false)
ON CONFLICT DO NOTHING;
