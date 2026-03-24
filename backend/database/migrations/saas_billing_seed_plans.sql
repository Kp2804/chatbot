-- ============================================================
-- SaaS Billing Seed: plans
-- Keeps Starter and Growth aligned to the current 2-plan catalog.
-- Idempotent: re-running will not duplicate rows.
-- ============================================================

-- NOTE:
-- price_monthly is stored as integer INR (e.g. 699 = ₹699)
-- storage_limit values are in MB (project default assumption)

INSERT INTO plans (name, price_monthly, message_limit, bot_limit, storage_limit)
SELECT 'Starter', 1000, 3000, 1, 1024
WHERE NOT EXISTS (
  SELECT 1 FROM plans WHERE name = 'Starter'
);

UPDATE plans
SET price_monthly = 1000,
    message_limit = 3000,
    bot_limit = 1,
    storage_limit = 1024
WHERE name = 'Starter';

INSERT INTO plans (name, price_monthly, message_limit, bot_limit, storage_limit)
SELECT 'Growth', 5000, 50000, 3, 5120
WHERE NOT EXISTS (
  SELECT 1 FROM plans WHERE name = 'Growth'
);

UPDATE plans
SET price_monthly = 5000,
    message_limit = 50000,
    bot_limit = 3,
    storage_limit = 5120
WHERE name = 'Growth';

-- Legacy plans can remain in DB for historical subscriptions, but the app
-- now surfaces only Starter and Growth in the plan picker UI.
