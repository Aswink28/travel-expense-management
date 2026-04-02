-- ================================================================
--  MIGRATION: Bulk Employee Onboarding
-- ================================================================

-- Sequence for concurrent emp_id generation
CREATE SEQUENCE IF NOT EXISTS emp_id_seq START WITH 100;
-- Initialize from current max
DO $$
DECLARE max_num INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(emp_id FROM '\d+$') AS INT)), 0) + 1 INTO max_num
  FROM users WHERE emp_id LIKE 'EMP-%';
  EXECUTE format('ALTER SEQUENCE emp_id_seq RESTART WITH %s', max_num);
END $$;

-- ── Table: bulk_jobs — tracks each upload job ────────────────
CREATE TABLE IF NOT EXISTS bulk_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by      UUID NOT NULL REFERENCES users(id),
  file_name       VARCHAR(255) NOT NULL,
  total_rows      INT NOT NULL DEFAULT 0,
  processed       INT NOT NULL DEFAULT 0,
  succeeded       INT NOT NULL DEFAULT 0,
  failed          INT NOT NULL DEFAULT 0,
  skipped         INT NOT NULL DEFAULT 0,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','completed','completed_with_errors','cancelled')),
  error_summary   JSONB,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Table: bulk_job_rows — tracks each employee row ──────────
CREATE TABLE IF NOT EXISTS bulk_job_rows (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID NOT NULL REFERENCES bulk_jobs(id) ON DELETE CASCADE,
  row_number      INT NOT NULL,
  raw_data        JSONB NOT NULL,
  idempotency_key VARCHAR(255),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','success','failed','skipped')),
  error_message   TEXT,
  employee_id     UUID REFERENCES users(id),
  ppi_wallet_id   VARCHAR(100),
  retry_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_job_rows_job ON bulk_job_rows(job_id);
CREATE INDEX IF NOT EXISTS idx_bulk_job_rows_status ON bulk_job_rows(job_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bulk_row_idempotency ON bulk_job_rows(idempotency_key) WHERE status NOT IN ('skipped','failed');
