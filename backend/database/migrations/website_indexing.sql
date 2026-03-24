-- Website indexing support for chatbot-scoped knowledge base

ALTER TABLE chatbot_knowledge_sources
  DROP CONSTRAINT IF EXISTS chatbot_knowledge_sources_source_type_check;

ALTER TABLE chatbot_knowledge_sources
  ADD CONSTRAINT chatbot_knowledge_sources_source_type_check
  CHECK (source_type IN ('url', 'text', 'pdf', 'website'));

ALTER TABLE chatbot_knowledge_sources
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS chatbot_knowledge_sources_chatbot_source_type_idx
  ON chatbot_knowledge_sources (chatbot_id, source_type);
