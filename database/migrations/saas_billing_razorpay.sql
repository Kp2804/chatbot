-- ============================================================
-- SaaS Billing Razorpay Support Migration
-- Adds provider-specific columns required for subscription sync.
-- ============================================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS razorpay_plan_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS plans_razorpay_plan_id_unique_idx
  ON plans (razorpay_plan_id)
  WHERE razorpay_plan_id IS NOT NULL;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_razorpay_subscription_id_unique_idx
  ON subscriptions (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_provider_idx
  ON subscriptions (provider);

CREATE UNIQUE INDEX IF NOT EXISTS usage_user_id_unique_idx
  ON "usage" (user_id);
