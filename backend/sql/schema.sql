-- ================================================================
--  TRAVELDESK v3 — Complete PostgreSQL Schema
--  Features: Wallet, Bookings, Ticket Uploads, Documents
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Drop all tables ───────────────────────────────────────────
DROP TABLE IF EXISTS documents           CASCADE;
DROP TABLE IF EXISTS bookings            CASCADE;
DROP TABLE IF EXISTS wallet_transactions CASCADE;
DROP TABLE IF EXISTS wallets             CASCADE;
DROP TABLE IF EXISTS approvals           CASCADE;
DROP TABLE IF EXISTS travel_requests     CASCADE;
DROP TABLE IF EXISTS expense_limits      CASCADE;
DROP TABLE IF EXISTS tier_config         CASCADE;
DROP TABLE IF EXISTS users               CASCADE;

-- ── Drop all enums ────────────────────────────────────────────
DROP TYPE IF EXISTS user_role_enum        CASCADE;
DROP TYPE IF EXISTS travel_mode_enum      CASCADE;
DROP TYPE IF EXISTS distance_type_enum    CASCADE;
DROP TYPE IF EXISTS booking_type_enum     CASCADE;
DROP TYPE IF EXISTS request_status_enum   CASCADE;
DROP TYPE IF EXISTS approval_action_enum  CASCADE;
DROP TYPE IF EXISTS txn_type_enum         CASCADE;
DROP TYPE IF EXISTS txn_category_enum     CASCADE;
DROP TYPE IF EXISTS booking_status_enum   CASCADE;
DROP TYPE IF EXISTS document_type_enum    CASCADE;

-- ── ENUMs ─────────────────────────────────────────────────────
CREATE TYPE user_role_enum       AS ENUM ('Employee','Tech Lead','Manager','Finance','Booking Admin','Super Admin');
CREATE TYPE travel_mode_enum     AS ENUM ('Train','Bus','Flight','Hotel','Metro','Cab','Rapido','Auto');
CREATE TYPE distance_type_enum   AS ENUM ('short','long','international');
CREATE TYPE booking_type_enum    AS ENUM ('self','company');
CREATE TYPE request_status_enum  AS ENUM ('draft','pending','pending_finance','approved','rejected','cancelled');
CREATE TYPE approval_action_enum AS ENUM ('approved','rejected');
CREATE TYPE txn_type_enum        AS ENUM ('credit','debit');
CREATE TYPE txn_category_enum    AS ENUM ('travel','hotel','allowance','credit','other');
CREATE TYPE booking_status_enum  AS ENUM ('pending','booked','cancelled','completed');
CREATE TYPE document_type_enum   AS ENUM ('ticket','hotel_voucher','invoice','other');

-- ================================================================
--  TABLE: tier_config — entitlements per role
-- ================================================================
CREATE TABLE tier_config (
  id                   SERIAL           PRIMARY KEY,
  role                 user_role_enum   NOT NULL UNIQUE,
  allowed_modes        TEXT[]           NOT NULL DEFAULT '{}',
  max_trip_budget      NUMERIC(12,2)    NOT NULL DEFAULT 0,
  daily_allowance      NUMERIC(10,2)    NOT NULL DEFAULT 0,
  max_hotel_per_night  NUMERIC(10,2)    NOT NULL DEFAULT 0,
  cab_daily_limit      NUMERIC(10,2)    NOT NULL DEFAULT 0,
  food_daily_limit     NUMERIC(10,2)    NOT NULL DEFAULT 0,
  color                VARCHAR(10)      NOT NULL DEFAULT '#888',
  created_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ================================================================
--  TABLE: users
-- ================================================================
CREATE TABLE users (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  emp_id          VARCHAR(20)    NOT NULL UNIQUE,
  name            VARCHAR(150)   NOT NULL,
  email           VARCHAR(255)   NOT NULL UNIQUE,
  password_hash   VARCHAR(255)   NOT NULL,
  role            user_role_enum NOT NULL,
  department      VARCHAR(100)   NOT NULL DEFAULT 'Engineering',
  avatar          VARCHAR(4)     NOT NULL DEFAULT 'XX',
  color           VARCHAR(10)    NOT NULL DEFAULT '#888',
  reporting_to    VARCHAR(150),
  is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ================================================================
--  TABLE: expense_limits — category spending caps per role
-- ================================================================
CREATE TABLE expense_limits (
  id          SERIAL         PRIMARY KEY,
  role        user_role_enum NOT NULL,
  category    VARCHAR(50)    NOT NULL,
  daily_limit NUMERIC(10,2)  NOT NULL DEFAULT 0,
  trip_limit  NUMERIC(10,2)  NOT NULL DEFAULT 0,
  UNIQUE (role, category)
);

-- ================================================================
--  TABLE: travel_requests — core request entity
-- ================================================================
CREATE TABLE travel_requests (
  id                   VARCHAR(20)          PRIMARY KEY,
  user_id              UUID                 NOT NULL REFERENCES users(id),
  user_name            VARCHAR(150)         NOT NULL,
  user_role            user_role_enum       NOT NULL,
  department           VARCHAR(100)         NOT NULL,

  -- Trip details
  from_location        VARCHAR(200)         NOT NULL,
  to_location          VARCHAR(200)         NOT NULL,
  distance_type        distance_type_enum   NOT NULL DEFAULT 'short',
  required_mode        travel_mode_enum,             -- system-determined required mode
  travel_mode          travel_mode_enum     NOT NULL,
  booking_type         booking_type_enum    NOT NULL,
  start_date           DATE                 NOT NULL,
  end_date             DATE                 NOT NULL,
  total_days           INTEGER              GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
  purpose              VARCHAR(500)         NOT NULL,
  notes                TEXT,

  -- Budget breakdown
  estimated_travel_cost  NUMERIC(12,2)      NOT NULL DEFAULT 0,
  estimated_hotel_cost   NUMERIC(12,2)      NOT NULL DEFAULT 0,
  estimated_allowance    NUMERIC(12,2)      GENERATED ALWAYS AS (0) STORED, -- computed dynamically
  estimated_total        NUMERIC(12,2)      NOT NULL DEFAULT 0,
  approved_travel_cost   NUMERIC(12,2),
  approved_hotel_cost    NUMERIC(12,2),
  approved_allowance     NUMERIC(12,2),
  approved_total         NUMERIC(12,2),

  -- Status
  status               request_status_enum  NOT NULL DEFAULT 'pending',

  -- Approval tracking
  hierarchy_approved    BOOLEAN             NOT NULL DEFAULT FALSE,
  hierarchy_approved_by VARCHAR(150),
  hierarchy_approved_at TIMESTAMPTZ,
  finance_approved      BOOLEAN             NOT NULL DEFAULT FALSE,
  finance_approved_by   VARCHAR(150),
  finance_approved_at   TIMESTAMPTZ,
  rejected_by           VARCHAR(150),
  rejection_reason      TEXT,

  -- Wallet
  wallet_credited       BOOLEAN             NOT NULL DEFAULT FALSE,
  wallet_credit_amount  NUMERIC(12,2),
  wallet_credited_at    TIMESTAMPTZ,

  -- Booking
  booking_status        booking_status_enum NOT NULL DEFAULT 'pending',

  submitted_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- ================================================================
--  TABLE: approvals — immutable audit trail
-- ================================================================
CREATE TABLE approvals (
  id            UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id    VARCHAR(20)      NOT NULL REFERENCES travel_requests(id) ON DELETE CASCADE,
  approver_id   UUID             NOT NULL REFERENCES users(id),
  approver_name VARCHAR(150)     NOT NULL,
  approver_role user_role_enum   NOT NULL,
  action        approval_action_enum NOT NULL,
  note          TEXT,
  -- Finance can set approved amounts
  approved_travel_cost NUMERIC(12,2),
  approved_hotel_cost  NUMERIC(12,2),
  approved_allowance   NUMERIC(12,2),
  acted_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, approver_id)
);

-- ================================================================
--  TABLE: wallets — one per user
-- ================================================================
CREATE TABLE wallets (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_credited NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_debited  NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Breakdown of available budget per category
  travel_balance    NUMERIC(12,2) NOT NULL DEFAULT 0,
  hotel_balance     NUMERIC(12,2) NOT NULL DEFAULT 0,
  allowance_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ================================================================
--  TABLE: wallet_transactions — every credit/debit
-- ================================================================
CREATE TABLE wallet_transactions (
  id           UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id    UUID             NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  user_id      UUID             NOT NULL REFERENCES users(id),
  request_id   VARCHAR(20)      REFERENCES travel_requests(id),
  booking_id   UUID,
  txn_type     txn_type_enum    NOT NULL,
  category     txn_category_enum NOT NULL,
  amount       NUMERIC(12,2)    NOT NULL CHECK (amount > 0),
  description  TEXT             NOT NULL,
  performed_by UUID             REFERENCES users(id),  -- who performed (admin or self)
  balance_after NUMERIC(12,2)   NOT NULL,
  reference    VARCHAR(200),    -- PNR, booking ID etc.
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ================================================================
--  TABLE: bookings — admin or self bookings
-- ================================================================
CREATE TABLE bookings (
  id              UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id      VARCHAR(20)      NOT NULL REFERENCES travel_requests(id),
  wallet_id       UUID             NOT NULL REFERENCES wallets(id),
  booked_by_id    UUID             NOT NULL REFERENCES users(id),
  booked_for_id   UUID             NOT NULL REFERENCES users(id),
  booking_type    booking_type_enum NOT NULL,
  category        txn_category_enum NOT NULL,  -- travel / hotel / allowance
  travel_mode     travel_mode_enum,            -- for travel bookings
  vendor          VARCHAR(200),
  from_location   VARCHAR(200),
  to_location     VARCHAR(200),
  travel_date     DATE,
  check_in_date   DATE,
  check_out_date  DATE,
  amount          NUMERIC(12,2)    NOT NULL CHECK (amount > 0),
  pnr_number      VARCHAR(100),
  booking_ref     VARCHAR(100),
  status          booking_status_enum NOT NULL DEFAULT 'booked',
  notes           TEXT,
  txn_id          UUID             REFERENCES wallet_transactions(id),
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ================================================================
--  TABLE: documents — ticket uploads linked to bookings
-- ================================================================
CREATE TABLE documents (
  id           UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id   UUID             REFERENCES bookings(id) ON DELETE CASCADE,
  request_id   VARCHAR(20)      NOT NULL REFERENCES travel_requests(id),
  uploaded_by  UUID             NOT NULL REFERENCES users(id),
  for_user_id  UUID             NOT NULL REFERENCES users(id),
  doc_type     document_type_enum NOT NULL DEFAULT 'ticket',
  file_name    VARCHAR(255)     NOT NULL,
  original_name VARCHAR(255)    NOT NULL,
  file_path    VARCHAR(500)     NOT NULL,
  file_size    INTEGER          NOT NULL,
  mime_type    VARCHAR(100)     NOT NULL,
  description  TEXT,
  is_visible   BOOLEAN          NOT NULL DEFAULT TRUE, -- visible to employee
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ================================================================
--  INDEXES
-- ================================================================
CREATE INDEX idx_req_user       ON travel_requests(user_id);
CREATE INDEX idx_req_status     ON travel_requests(status);
CREATE INDEX idx_req_submitted  ON travel_requests(submitted_at DESC);
CREATE INDEX idx_approvals_req  ON approvals(request_id);
CREATE INDEX idx_wallet_user    ON wallets(user_id);
CREATE INDEX idx_txn_wallet     ON wallet_transactions(wallet_id);
CREATE INDEX idx_txn_user       ON wallet_transactions(user_id);
CREATE INDEX idx_txn_request    ON wallet_transactions(request_id);
CREATE INDEX idx_bookings_req   ON bookings(request_id);
CREATE INDEX idx_bookings_for   ON bookings(booked_for_id);
CREATE INDEX idx_docs_request   ON documents(request_id);
CREATE INDEX idx_docs_user      ON documents(for_user_id);
CREATE INDEX idx_docs_booking   ON documents(booking_id);

-- ================================================================
--  TRIGGERS: auto updated_at
-- ================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_upd     BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_req_upd       BEFORE UPDATE ON travel_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bookings_upd  BEFORE UPDATE ON bookings        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_wallet_upd    BEFORE UPDATE ON wallets         FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ================================================================
--  TRIGGER: auto update wallet balance on transaction insert
-- ================================================================
CREATE OR REPLACE FUNCTION update_wallet_on_txn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.txn_type = 'credit' THEN
    UPDATE wallets
    SET balance = balance + NEW.amount,
        total_credited = total_credited + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.wallet_id;
    -- Credit to category balances
    IF NEW.category = 'travel' THEN
      UPDATE wallets SET travel_balance = travel_balance + NEW.amount WHERE id = NEW.wallet_id;
    ELSIF NEW.category = 'hotel' THEN
      UPDATE wallets SET hotel_balance = hotel_balance + NEW.amount WHERE id = NEW.wallet_id;
    ELSIF NEW.category = 'allowance' THEN
      UPDATE wallets SET allowance_balance = allowance_balance + NEW.amount WHERE id = NEW.wallet_id;
    ELSIF NEW.category = 'credit' THEN
      -- General credit: split proportionally (stored in balance only)
      NULL;
    END IF;
  ELSIF NEW.txn_type = 'debit' THEN
    UPDATE wallets
    SET balance = balance - NEW.amount,
        total_debited = total_debited + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.wallet_id;
    -- Debit from category balances
    IF NEW.category = 'travel' THEN
      UPDATE wallets SET travel_balance = GREATEST(travel_balance - NEW.amount, 0) WHERE id = NEW.wallet_id;
    ELSIF NEW.category = 'hotel' THEN
      UPDATE wallets SET hotel_balance = GREATEST(hotel_balance - NEW.amount, 0) WHERE id = NEW.wallet_id;
    ELSIF NEW.category = 'allowance' THEN
      UPDATE wallets SET allowance_balance = GREATEST(allowance_balance - NEW.amount, 0) WHERE id = NEW.wallet_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wallet_balance
  AFTER INSERT ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION update_wallet_on_txn();

-- ================================================================
--  SEED: tier_config
-- ================================================================
INSERT INTO tier_config (role, allowed_modes, max_trip_budget, daily_allowance, max_hotel_per_night, cab_daily_limit, food_daily_limit, color) VALUES
('Employee',      ARRAY['Train','Bus','Hotel','Metro','Cab','Rapido','Auto'],          15000,  500,  1500, 300, 200, '#0A84FF'),
('Tech Lead',     ARRAY['Train','Bus','Flight','Hotel','Metro','Cab','Rapido'],      30000,  800,  3000, 500, 300, '#BF5AF2'),
('Manager',       ARRAY['Train','Bus','Flight','Hotel','Metro','Cab','Rapido','Auto'],100000,1500, 6000, 800, 500, '#FF9F0A'),
('Finance',       ARRAY['Train','Bus','Flight','Hotel','Metro','Cab','Rapido'],      40000, 1000,  4000, 600, 400, '#40C8E0'),
('Booking Admin', ARRAY[]::TEXT[],                                                   0,     0,    0,    0,   0,   '#FF6B6B'),
('Super Admin',   ARRAY['Train','Bus','Flight','Hotel','Metro','Cab','Rapido','Auto'],999999,3000,12000,1500,1000,'#30D158');

-- ================================================================
--  SEED: expense_limits
-- ================================================================
INSERT INTO expense_limits (role, category, daily_limit, trip_limit) VALUES
('Employee',  'cab',     300, 1500),  ('Employee',  'food',  200, 1000), ('Employee',  'metro', 150, 600),
('Employee',  'hotel',  1500, 9000),  ('Employee',  'travel',2000,15000),
('Tech Lead', 'cab',     500, 2500),  ('Tech Lead', 'food',  300, 1500), ('Tech Lead', 'metro', 200, 800),
('Tech Lead', 'hotel',  3000,18000),  ('Tech Lead', 'travel',5000,30000),
('Manager',  'cab',      800, 4000),  ('Manager',  'food',   500, 2500), ('Manager',  'metro', 300, 1200),
('Manager',  'hotel',   6000,36000),  ('Manager',  'travel',15000,100000),
('Finance',  'cab',      600, 3000),  ('Finance',  'food',   400, 2000), ('Finance',  'metro', 200, 800),
('Finance',  'hotel',   4000,24000),  ('Finance',  'travel',10000,40000),
('Super Admin','cab',   1500, 9999),  ('Super Admin','food',1000, 5000), ('Super Admin','metro',500, 2000),
('Super Admin','hotel',12000,99999),  ('Super Admin','travel',25000,999999);

-- ================================================================
--  SEED: users  (passwords set by setup.js)
-- ================================================================
INSERT INTO users (emp_id, name, email, password_hash, role, department, avatar, color, reporting_to) VALUES
('EMP-001', 'Arjun Sharma',   'arjun@company.in',  'PLACEHOLDER', 'Employee',      'Engineering', 'AS', '#0A84FF', 'Deepa (TL)'),
('EMP-002', 'Priya Nair',     'priya@company.in',  'PLACEHOLDER', 'Employee',      'QA',          'PN', '#0A84FF', 'Deepa (TL)'),
('EMP-003', 'Deepa Krishnan', 'deepa@company.in',  'PLACEHOLDER', 'Tech Lead',     'Engineering', 'DK', '#BF5AF2', 'Ravi (Mgr)'),
('EMP-004', 'Ravi Kumar',     'ravi@company.in',   'PLACEHOLDER', 'Manager',       'Operations',  'RK', '#FF9F0A', 'CFO'),
('EMP-005', 'Anil Menon',     'anil@company.in',   'PLACEHOLDER', 'Finance',       'Finance',     'AM', '#40C8E0', 'CFO'),
('EMP-006', 'Meena Iyer',     'meena@company.in',  'PLACEHOLDER', 'Booking Admin', 'Admin',       'MI', '#FF6B6B', 'Manager'),
('EMP-007', 'Super Admin',    'admin@company.in',  'PLACEHOLDER', 'Super Admin',   'IT',          'SA', '#30D158', 'CEO');

-- ================================================================
--  DISTANCE RULES VIEW — determines required travel mode
-- ================================================================
CREATE OR REPLACE VIEW v_distance_rules AS
SELECT
  from_l, to_l,
  CASE
    WHEN dist_type = 'international' THEN 'Flight'::travel_mode_enum
    WHEN dist_type = 'long'          THEN 'Flight'::travel_mode_enum
    ELSE NULL  -- short: any allowed mode
  END AS required_mode,
  dist_type
FROM (VALUES
  ('Chennai',   'Bangalore', 'short'::distance_type_enum),
  ('Chennai',   'Coimbatore','short'::distance_type_enum),
  ('Chennai',   'Madurai',   'short'::distance_type_enum),
  ('Chennai',   'Mumbai',    'long'::distance_type_enum),
  ('Chennai',   'Delhi',     'long'::distance_type_enum),
  ('Chennai',   'Kolkata',   'long'::distance_type_enum),
  ('Chennai',   'Hyderabad', 'short'::distance_type_enum),
  ('Chennai',   'Pune',      'long'::distance_type_enum),
  ('Chennai',   'Singapore', 'international'::distance_type_enum),
  ('Chennai',   'London',    'international'::distance_type_enum),
  ('Chennai',   'Dubai',     'international'::distance_type_enum),
  ('Mumbai',    'Delhi',     'long'::distance_type_enum),
  ('Mumbai',    'Bangalore', 'long'::distance_type_enum),
  ('Delhi',     'Bangalore', 'long'::distance_type_enum),
  ('Bangalore', 'Mumbai',    'long'::distance_type_enum),
  ('Bangalore', 'Delhi',     'long'::distance_type_enum)
) AS t(from_l, to_l, dist_type);

-- ================================================================
--  EXTENSION: tickets table (self-booking ticket generation)
-- ================================================================
DROP TABLE IF EXISTS tickets CASCADE;

CREATE TABLE tickets (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID          NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id         UUID          NOT NULL REFERENCES users(id),
  request_id      VARCHAR(20)   NOT NULL REFERENCES travel_requests(id),
  pnr_number      VARCHAR(50)   NOT NULL UNIQUE,
  booking_ref     VARCHAR(50)   NOT NULL,
  ticket_type     VARCHAR(30)   NOT NULL,   -- 'transport' | 'hotel'
  travel_mode     VARCHAR(30),              -- Train/Flight/Bus etc.
  passenger_name  VARCHAR(150)  NOT NULL,
  from_location   VARCHAR(200),
  to_location     VARCHAR(200),
  travel_date     DATE,
  travel_time     VARCHAR(20),
  seat_class      VARCHAR(50),
  seat_number     VARCHAR(20),
  vendor          VARCHAR(200),
  hotel_name      VARCHAR(200),
  check_in_date   DATE,
  check_out_date  DATE,
  room_type       VARCHAR(100),
  amount          NUMERIC(12,2) NOT NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'confirmed',
  ticket_data     JSONB         NOT NULL DEFAULT '{}',
  file_path       VARCHAR(500),
  file_name       VARCHAR(255),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_booking  ON tickets(booking_id);
CREATE INDEX idx_tickets_user     ON tickets(user_id);
CREATE INDEX idx_tickets_request  ON tickets(request_id);
CREATE INDEX idx_tickets_pnr      ON tickets(pnr_number);
