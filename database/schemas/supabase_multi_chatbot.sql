-- Multi-chatbot migration for existing projects

-- 1) Create chatbots table
CREATE TABLE IF NOT EXISTS chatbots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chatbots'
      AND policyname = 'Users can manage own chatbots'
  ) THEN
    CREATE POLICY "Users can manage own chatbots"
      ON chatbots
      FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- 2) Add chatbot_id to conversations (nullable first for migration)
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS chatbot_id UUID REFERENCES chatbots ON DELETE CASCADE;

-- 3) Create one default chatbot per user (if missing)
INSERT INTO chatbots (user_id, name, description)
SELECT DISTINCT c.user_id, 'My Chatbot', 'Default chatbot'
FROM conversations c
WHERE NOT EXISTS (
  SELECT 1
  FROM chatbots b
  WHERE b.user_id = c.user_id
);

-- 4) Backfill existing conversations with user's first chatbot
UPDATE conversations c
SET chatbot_id = b.id
FROM (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM chatbots
  ORDER BY user_id, created_at ASC
) b
WHERE c.user_id = b.user_id
  AND c.chatbot_id IS NULL;

-- 5) Enforce NOT NULL after backfill
ALTER TABLE conversations
ALTER COLUMN chatbot_id SET NOT NULL;

-- 6) Add chatbot_id to workflows and faqs (nullable first)
ALTER TABLE workflows
ADD COLUMN IF NOT EXISTS chatbot_id UUID REFERENCES chatbots ON DELETE CASCADE;

ALTER TABLE faqs
ADD COLUMN IF NOT EXISTS chatbot_id UUID REFERENCES chatbots ON DELETE CASCADE;

-- 7) Backfill workflows and FAQs with user's first chatbot
UPDATE workflows w
SET chatbot_id = b.id
FROM (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM chatbots
  ORDER BY user_id, created_at ASC
) b
WHERE w.user_id = b.user_id
  AND w.chatbot_id IS NULL;

UPDATE faqs f
SET chatbot_id = b.id
FROM (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM chatbots
  ORDER BY user_id, created_at ASC
) b
WHERE f.user_id = b.user_id
  AND f.chatbot_id IS NULL;

-- 8) Enforce NOT NULL
ALTER TABLE workflows
ALTER COLUMN chatbot_id SET NOT NULL;

ALTER TABLE faqs
ALTER COLUMN chatbot_id SET NOT NULL;
