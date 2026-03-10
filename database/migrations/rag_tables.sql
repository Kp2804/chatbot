-- ============================================================
-- RAG (Retrieval-Augmented Generation) Migration
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Extend chatbot_knowledge_sources to support PDF uploads
ALTER TABLE chatbot_knowledge_sources
  DROP CONSTRAINT IF EXISTS chatbot_knowledge_sources_source_type_check;

ALTER TABLE chatbot_knowledge_sources
  ADD CONSTRAINT chatbot_knowledge_sources_source_type_check
  CHECK (source_type IN ('url', 'text', 'pdf'));

ALTER TABLE chatbot_knowledge_sources
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0;

-- 3. Create document_chunks table (stores chunked text + embeddings)
CREATE TABLE IF NOT EXISTS document_chunks (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  chatbot_id       UUID        NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
  source_id        UUID        REFERENCES chatbot_knowledge_sources(id) ON DELETE CASCADE,
  conversation_id  UUID        REFERENCES conversations(id) ON DELETE SET NULL,
  is_session_only  BOOLEAN     DEFAULT FALSE,
  content          TEXT        NOT NULL,
  chunk_index      INTEGER     DEFAULT 0,
  embedding        vector(384),
  metadata         JSONB       DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  expires_at       TIMESTAMPTZ
);

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS document_chunks_chatbot_id_idx
  ON document_chunks(chatbot_id);

CREATE INDEX IF NOT EXISTS document_chunks_source_id_idx
  ON document_chunks(source_id);

CREATE INDEX IF NOT EXISTS document_chunks_conversation_id_idx
  ON document_chunks(conversation_id);

-- Vector similarity index (cosine) - skip if not enough rows yet, Postgres will use seq scan
-- This can be created later when you have 1000+ chunks for better performance:
-- CREATE INDEX document_chunks_embedding_idx ON document_chunks
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 5. Enable RLS
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
DO $$
BEGIN
  -- Chatbot owners can do anything with their chunks
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'document_chunks'
      AND policyname = 'Chatbot owners can manage their chunks'
  ) THEN
    CREATE POLICY "Chatbot owners can manage their chunks" ON document_chunks
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM chatbots
          WHERE chatbots.id = document_chunks.chatbot_id
            AND chatbots.user_id = auth.uid()
        )
      );
  END IF;

  -- Anyone (including anonymous) can read persistent (non-session) chunks
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'document_chunks'
      AND policyname = 'Public can read persistent chunks'
  ) THEN
    CREATE POLICY "Public can read persistent chunks" ON document_chunks
      FOR SELECT
      USING (is_session_only = FALSE);
  END IF;

  -- Authenticated users (including anonymous auth) can insert session chunks
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'document_chunks'
      AND policyname = 'Authenticated users can insert session chunks'
  ) THEN
    CREATE POLICY "Authenticated users can insert session chunks" ON document_chunks
      FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL AND is_session_only = TRUE);
  END IF;

  -- Users can read their own session chunks (via conversation ownership)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'document_chunks'
      AND policyname = 'Users can read own session chunks'
  ) THEN
    CREATE POLICY "Users can read own session chunks" ON document_chunks
      FOR SELECT
      USING (
        is_session_only = TRUE AND
        EXISTS (
          SELECT 1 FROM conversations
          WHERE conversations.id = document_chunks.conversation_id
            AND conversations.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

-- 7. Semantic similarity search function
--    Returns chunks for a chatbot ordered by cosine similarity.
--    Includes: persistent KB chunks + session chunks for the given conversation.
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding      float8[],
  match_chatbot_id     UUID,
  match_conversation_id UUID DEFAULT NULL,
  match_count          INT  DEFAULT 5,
  match_threshold      FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  chunk_index INT,
  similarity  FLOAT,
  source_id   UUID,
  metadata    JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    dc.chunk_index,
    (1 - (dc.embedding <=> query_embedding::vector))::FLOAT AS similarity,
    dc.source_id,
    dc.metadata
  FROM document_chunks dc
  WHERE
    dc.chatbot_id = match_chatbot_id
    AND dc.embedding IS NOT NULL
    AND (
      dc.is_session_only = FALSE
      OR (
        dc.is_session_only = TRUE
        AND dc.conversation_id = match_conversation_id
      )
    )
    AND (dc.expires_at IS NULL OR dc.expires_at > NOW())
    AND (1 - (dc.embedding <=> query_embedding::vector)) >= match_threshold
  ORDER BY dc.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$$;

-- 8. Cleanup function for expired session chunks (call periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_chunks()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM document_chunks
  WHERE is_session_only = TRUE
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
