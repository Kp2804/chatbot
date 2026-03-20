-- Read-only policies for embedded chatbot users (anon/authenticated)
-- Purpose: allow embedded widget to display FAQ chips and workflow trigger buttons
-- while keeping all write/config actions restricted to chatbot owners.

ALTER TABLE chatbots
  ADD COLUMN IF NOT EXISTS is_embed_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS embed_allowed_origins TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Chatbots: allow read access only for bots explicitly marked as embeddable
DROP POLICY IF EXISTS "Public can read chatbots for embed" ON chatbots;
CREATE POLICY "Public can read chatbots for embed"
ON chatbots
FOR SELECT
USING (is_embed_public = true);

-- FAQs: allow read access for published entries only
DROP POLICY IF EXISTS "Public can read published faqs for embed" ON faqs;
CREATE POLICY "Public can read published faqs for embed"
ON faqs
FOR SELECT
USING (
  status = 'published'
  AND EXISTS (
    SELECT 1
    FROM chatbots
    WHERE chatbots.id = faqs.chatbot_id
      AND chatbots.user_id = faqs.user_id
      AND chatbots.is_embed_public = true
  )
);

-- Workflows: allow read access so trigger nodes can be shown in embedded chat
DROP POLICY IF EXISTS "Public can read workflows for embed" ON workflows;
CREATE POLICY "Public can read workflows for embed"
ON workflows
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM chatbots
    WHERE chatbots.id = workflows.chatbot_id
      AND chatbots.user_id = workflows.user_id
      AND chatbots.is_embed_public = true
  )
);

-- Optional: chatbot settings can be read in embedded mode (future-safe)
DROP POLICY IF EXISTS "Public can read chatbot settings for embed" ON chatbot_settings;
CREATE POLICY "Public can read chatbot settings for embed"
ON chatbot_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM chatbots
    WHERE chatbots.id = chatbot_settings.chatbot_id
      AND chatbots.is_embed_public = true
  )
);

-- NOTE:
-- Existing owner-only FOR ALL policies remain in place for insert/update/delete,
-- so embedded users still cannot configure bots.
