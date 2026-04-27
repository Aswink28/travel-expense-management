-- ================================================================
--  MIGRATION: Role consolidation
--  Reduce roles to 5 permission classes:
--    Employee, Request Approver, Finance, Booking Admin, Super Admin
--  Designation continues to carry granular job titles. Approval engine
--  matches by designation (entries in tier.approver_roles are now treated
--  as designation names — they already are in the seed data).
-- ================================================================

-- NOTE: Postgres won't let a newly-added enum value be used in the same transaction
-- it was created in. The ADD VALUE statements live in role_consolidation_enum.sql
-- and must be applied separately first. This file assumes both 'Employee' and
-- 'Request Approver' are already present in user_role_enum.

-- 2. Migrate users.role and designation_tiers.role to the new permission classes.
--    Software Engineer → Employee
--    Tech Lead, Manager → Request Approver
--    Finance, Booking Admin, Super Admin → unchanged
UPDATE users SET role = 'Employee'::user_role_enum
 WHERE role::text IN ('Software Engineer','Employee') AND role::text <> 'Employee';
UPDATE users SET role = 'Request Approver'::user_role_enum
 WHERE role::text IN ('Tech Lead','Manager');

UPDATE designation_tiers SET role = 'Employee'::user_role_enum
 WHERE role::text = 'Software Engineer';
UPDATE designation_tiers SET role = 'Request Approver'::user_role_enum
 WHERE role::text IN ('Tech Lead','Manager');

-- 3. Roles table: ensure the 5 canonical rows exist with correct metadata.
INSERT INTO roles (name, description, color, is_system) VALUES
  ('Employee',         'Submit requests, track wallet balance, see own data',  '#0A84FF', TRUE),
  ('Request Approver', 'Approve travel requests at their tier in the chain',   '#BF5AF2', TRUE),
  ('Finance',          'Final budget approval, set approved amounts',          '#40C8E0', TRUE),
  ('Booking Admin',    'Book travel and hotels for approved requests',         '#FF6B6B', TRUE),
  ('Super Admin',      'Full access — manage users, roles, tiers, sites',      '#30D158', TRUE)
ON CONFLICT (name) DO NOTHING;

-- 4. role_pages: consolidate Tech Lead + Manager pages under Request Approver,
--    and Software Engineer pages under Employee. Idempotent.
DO $$
BEGIN
  -- Software Engineer pages → Employee
  IF EXISTS (SELECT 1 FROM role_pages WHERE role_name = 'Software Engineer') THEN
    INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order)
    SELECT 'Employee', page_id, page_label, page_icon, sort_order
    FROM role_pages WHERE role_name = 'Software Engineer'
    ON CONFLICT (role_name, page_id) DO NOTHING;
    DELETE FROM role_pages WHERE role_name = 'Software Engineer';
  END IF;

  -- Tech Lead + Manager pages → Request Approver (UNION; first writer wins on dup page_id)
  IF EXISTS (SELECT 1 FROM role_pages WHERE role_name IN ('Tech Lead','Manager')) THEN
    INSERT INTO role_pages (role_name, page_id, page_label, page_icon, sort_order)
    SELECT 'Request Approver', page_id, page_label, page_icon, sort_order
    FROM role_pages
    WHERE role_name IN ('Tech Lead','Manager')
    ON CONFLICT (role_name, page_id) DO NOTHING;
    DELETE FROM role_pages WHERE role_name IN ('Tech Lead','Manager');
  END IF;
END $$;

-- 5. roles table: drop the now-empty job-title rows. is_system=true rows can be deleted
--    here since they're being migrated, not preserved.
DELETE FROM roles WHERE name IN ('Software Engineer','Tech Lead','Manager');

-- 6. Re-pin Dashboard at sort_order=1 for every role.
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

-- 7. Add approver_designation column to approvals so the sequential engine can
--    match against designation directly (cheaper than joining users every action).
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS approver_designation VARCHAR(100);

-- 8. Backfill approver_designation for existing approval rows from users.designation.
UPDATE approvals a
   SET approver_designation = u.designation
  FROM users u
 WHERE a.approver_id = u.id AND a.approver_designation IS NULL;
