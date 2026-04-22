-- ================================================================
--  MIGRATION: Tier System — extended policy fields
--  Adds per-night hotel cap, meal/cab daily limits, advance-booking
--  window, domestic/international budget split, and is_active flag.
-- ================================================================

ALTER TABLE tiers ADD COLUMN IF NOT EXISTS max_hotel_per_night  NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tiers ADD COLUMN IF NOT EXISTS meal_daily_limit     NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE tiers ADD COLUMN IF NOT EXISTS cab_daily_limit      NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE tiers ADD COLUMN IF NOT EXISTS advance_booking_days INTEGER       NOT NULL DEFAULT 0;
ALTER TABLE tiers ADD COLUMN IF NOT EXISTS intl_budget_limit    NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tiers ADD COLUMN IF NOT EXISTS is_active            BOOLEAN       NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tiers_advance_booking_chk') THEN
    ALTER TABLE tiers ADD CONSTRAINT tiers_advance_booking_chk CHECK (advance_booking_days >= 0);
  END IF;
END $$;

-- Seed sensible defaults on the built-in tier rows only (leaves custom tiers untouched).
UPDATE tiers SET max_hotel_per_night = 15000, meal_daily_limit = 3500, cab_daily_limit = 3000, advance_booking_days = 0,  intl_budget_limit = 300000 WHERE name = 'Tier 1' AND max_hotel_per_night = 0;
UPDATE tiers SET max_hotel_per_night = 10000, meal_daily_limit = 2500, cab_daily_limit = 2000, advance_booking_days = 2,  intl_budget_limit = 180000 WHERE name = 'Tier 2' AND max_hotel_per_night = 0;
UPDATE tiers SET max_hotel_per_night = 8000,  meal_daily_limit = 2000, cab_daily_limit = 1500, advance_booking_days = 3,  intl_budget_limit = 120000 WHERE name = 'Tier 3' AND max_hotel_per_night = 0;
UPDATE tiers SET max_hotel_per_night = 5500,  meal_daily_limit = 1500, cab_daily_limit = 1000, advance_booking_days = 5,  intl_budget_limit = 80000  WHERE name = 'Tier 4' AND max_hotel_per_night = 0;
UPDATE tiers SET max_hotel_per_night = 3500,  meal_daily_limit = 1000, cab_daily_limit = 750,  advance_booking_days = 7,  intl_budget_limit = 50000  WHERE name = 'Tier 5' AND max_hotel_per_night = 0;
