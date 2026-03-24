-- ============================================================
-- SaaS Billing Migration
-- Creates plans, subscriptions, usage, logs, onboarding_progress
-- with indexes and RLS policies for per-user access.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) plans
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price_monthly INTEGER NOT NULL,
  message_limit INTEGER NOT NULL,
  bot_limit INTEGER NOT NULL,
  storage_limit INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) usage
CREATE TABLE IF NOT EXISTS "usage" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages_used INTEGER NOT NULL DEFAULT 0,
  bots_created INTEGER NOT NULL DEFAULT 0,
  storage_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT usage_non_negative CHECK (
    messages_used >= 0
    AND bots_created >= 0
    AND storage_used >= 0
  )
);

-- 4) logs
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('error', 'info')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) onboarding_progress
CREATE TABLE IF NOT EXISTS onboarding_progress (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  step INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS usage_user_id_idx ON "usage"(user_id);
CREATE INDEX IF NOT EXISTS logs_user_id_idx ON logs(user_id);

-- Enable RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- plans: authenticated users can read plan catalog
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plans' AND policyname = 'Authenticated users can read plans'
  ) THEN
    CREATE POLICY "Authenticated users can read plans"
      ON plans
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;

  -- subscriptions: users can only access own rows
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'Users can manage own subscriptions'
  ) THEN
    CREATE POLICY "Users can manage own subscriptions"
      ON subscriptions
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- usage: users can only access own rows
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usage' AND policyname = 'Users can manage own usage'
  ) THEN
    CREATE POLICY "Users can manage own usage"
      ON "usage"
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- logs: users can only access own rows
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'logs' AND policyname = 'Users can manage own logs'
  ) THEN
    CREATE POLICY "Users can manage own logs"
      ON logs
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- onboarding_progress: users can only access own row
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'onboarding_progress' AND policyname = 'Users can manage own onboarding progress'
  ) THEN
    CREATE POLICY "Users can manage own onboarding progress"
      ON onboarding_progress
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;
