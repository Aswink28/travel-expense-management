-- Role consolidation — phase 1: ensure the new enum values exist.
-- Postgres requires ADD VALUE to be committed before the value can be referenced,
-- so this file runs in its own transaction ahead of role_consolidation_migration.sql.
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'Employee';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'Request Approver';
