-- Read-only policies for embedded chatbot users (anon/authenticated)
-- Purpose: allow embedded widget to display FAQ chips and workflow trigger buttons
-- while keeping all write/config actions restricted to chatbot owners.

-- Chatbots: allow read access so chatbot name can be displayed in embedded widget
DROP POLICY IF EXISTS "Public can read chatbots for embed" ON chatbots;
CREATE POLICY "Public can read chatbots for embed"
ON chatbots
FOR SELECT
USING (true);

-- FAQs: allow read access for published entries only
DROP POLICY IF EXISTS "Public can read published faqs for embed" ON faqs;
CREATE POLICY "Public can read published faqs for embed"
ON faqs
FOR SELECT
USING (status = 'published');

-- Workflows: allow read access so trigger nodes can be shown in embedded chat
DROP POLICY IF EXISTS "Public can read workflows for embed" ON workflows;
CREATE POLICY "Public can read workflows for embed"
ON workflows
FOR SELECT
USING (true);

-- Optional: chatbot settings can be read in embedded mode (future-safe)
DROP POLICY IF EXISTS "Public can read chatbot settings for embed" ON chatbot_settings;
CREATE POLICY "Public can read chatbot settings for embed"
ON chatbot_settings
FOR SELECT
USING (true);

-- NOTE:
-- Existing owner-only FOR ALL policies remain in place for insert/update/delete,
-- so embedded users still cannot configure bots.
