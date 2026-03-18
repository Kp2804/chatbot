-- ============================================================
-- SaaS Billing Seed: plans
-- Seeds Starter, Growth, Pro plans for the existing plans table.
-- Idempotent: re-running will not duplicate rows.
-- ============================================================

-- NOTE:
-- price_monthly is stored as integer INR (e.g. 699 = ₹699)
-- storage_limit values are in MB (project default assumption)

INSERT INTO plans (name, price_monthly, message_limit, bot_limit, storage_limit)
SELECT 'Starter', 699, 5000, 1, 1024
WHERE NOT EXISTS (
  SELECT 1 FROM plans WHERE name = 'Starter'
);

INSERT INTO plans (name, price_monthly, message_limit, bot_limit, storage_limit)
SELECT 'Growth', 1499, 20000, 3, 5120
WHERE NOT EXISTS (
  SELECT 1 FROM plans WHERE name = 'Growth'
);

INSERT INTO plans (name, price_monthly, message_limit, bot_limit, storage_limit)
SELECT 'Pro', 7499, 150000, 10, 20480
WHERE NOT EXISTS (
  SELECT 1 FROM plans WHERE name = 'Pro'
);
