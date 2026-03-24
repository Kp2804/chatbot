-- Additional chatbot feature migration
-- Adds: settings and knowledge sources (url/text)

CREATE TABLE IF NOT EXISTS chatbot_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chatbot_id UUID REFERENCES chatbots ON DELETE CASCADE NOT NULL UNIQUE,
  default_greeting TEXT DEFAULT 'Hello! How can I help you today?',
  persona TEXT DEFAULT 'Helpful assistant',
  language TEXT DEFAULT 'en',
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chatbot_knowledge_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chatbot_id UUID REFERENCES chatbots ON DELETE CASCADE NOT NULL,
  source_type TEXT CHECK (source_type IN ('url', 'text')) NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT CHECK (status IN ('active', 'processing', 'failed')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE chatbot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_knowledge_sources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chatbot_settings' AND policyname = 'Users can manage own chatbot settings'
  ) THEN
    CREATE POLICY "Users can manage own chatbot settings" ON chatbot_settings FOR ALL
      USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_settings.chatbot_id AND chatbots.user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chatbot_knowledge_sources' AND policyname = 'Users can manage own chatbot sources'
  ) THEN
    CREATE POLICY "Users can manage own chatbot sources" ON chatbot_knowledge_sources FOR ALL
      USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_knowledge_sources.chatbot_id AND chatbots.user_id = auth.uid()));
  END IF;
END
$$;
