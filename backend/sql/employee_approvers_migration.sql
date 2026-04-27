-- ================================================================
--  MIGRATION: Per-employee primary + backup approvers
--  Replaces designation-based "anyone with this role can approve" routing
--  with user-specific "this exact user (or their backup) approves".
-- ================================================================

CREATE TABLE IF NOT EXISTS employee_approvers (
  id                SERIAL       PRIMARY KEY,
  user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_designation  VARCHAR(100) NOT NULL,
  step_order        INTEGER      NOT NULL DEFAULT 1,
  primary_user_id   UUID         REFERENCES users(id) ON DELETE SET NULL,
  backup_user_id    UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, step_designation)
);

CREATE INDEX IF NOT EXISTS idx_employee_approvers_user      ON employee_approvers(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_approvers_primary   ON employee_approvers(primary_user_id);
CREATE INDEX IF NOT EXISTS idx_employee_approvers_backup    ON employee_approvers(backup_user_id);

-- ── Audit log for approver-chain changes ─────────────────────────
CREATE TABLE IF NOT EXISTS approver_audit_log (
  id                  SERIAL       PRIMARY KEY,
  acted_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  action_type         VARCHAR(40)  NOT NULL,    -- 'reassign_pending', 'swap_primary', 'swap_backup', 'manual_edit'
  affected_user_id    UUID         REFERENCES users(id) ON DELETE SET NULL,
  step_designation    VARCHAR(100),
  old_user_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
  new_user_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
  reason              TEXT,
  acted_by            UUID         REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_affected ON approver_audit_log(affected_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_acted_at ON approver_audit_log(acted_at DESC);
