-- Create tables for Chatbot App

-- 1. Profiles (extends Supabase Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Chatbots
CREATE TABLE chatbots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2b. Chatbot settings
CREATE TABLE chatbot_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chatbot_id UUID REFERENCES chatbots ON DELETE CASCADE NOT NULL UNIQUE,
  default_greeting TEXT DEFAULT 'Hello! How can I help you today?',
  persona TEXT DEFAULT 'Helpful assistant',
  language TEXT DEFAULT 'en',
  avatar_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2d. Chatbot knowledge sources
CREATE TABLE chatbot_knowledge_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chatbot_id UUID REFERENCES chatbots ON DELETE CASCADE NOT NULL,
  source_type TEXT CHECK (source_type IN ('url', 'text')) NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT CHECK (status IN ('active', 'processing', 'failed')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Conversations
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  chatbot_id UUID REFERENCES chatbots ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  preview TEXT,
  starred BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Messages
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('user', 'assistant')) NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Workflows
CREATE TABLE workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  chatbot_id UUID REFERENCES chatbots ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('active', 'paused', 'draft')) DEFAULT 'draft',
  triggers INTEGER DEFAULT 0,
  runs INTEGER DEFAULT 0,
  success_rate FLOAT DEFAULT 0,
  last_run TEXT DEFAULT 'Never',
  steps JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. FAQs
CREATE TABLE faqs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  chatbot_id UUID REFERENCES chatbots ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  tags TEXT[] DEFAULT '{}'::text[],
  status TEXT CHECK (status IN ('published', 'draft', 'archived')) DEFAULT 'draft',
  helpful INTEGER DEFAULT 0,
  not_helpful INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbots ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

-- Create Policies

-- Profiles: Users can see and update their own profile
CREATE POLICY "Users can see own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Chatbots: Users can manage their own chatbots
CREATE POLICY "Users can manage own chatbots" ON chatbots FOR ALL USING (auth.uid() = user_id);

-- Chatbot settings: users can manage settings of their own chatbots
CREATE POLICY "Users can manage own chatbot settings" ON chatbot_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_settings.chatbot_id AND chatbots.user_id = auth.uid()));

-- Knowledge sources: users can manage sources of their own chatbots
CREATE POLICY "Users can manage own chatbot sources" ON chatbot_knowledge_sources FOR ALL
  USING (EXISTS (SELECT 1 FROM chatbots WHERE chatbots.id = chatbot_knowledge_sources.chatbot_id AND chatbots.user_id = auth.uid()));

-- Conversations: Users can manage their own conversations only for chatbots they own
CREATE POLICY "Users can manage own conversations" ON conversations FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM chatbots
      WHERE chatbots.id = conversations.chatbot_id
        AND chatbots.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM chatbots
      WHERE chatbots.id = conversations.chatbot_id
        AND chatbots.user_id = auth.uid()
    )
  );

-- Messages: Users can see messages in their own conversations
CREATE POLICY "Users can manage messages in own conversations" ON messages FOR ALL
  USING (EXISTS (SELECT 1 FROM conversations WHERE id = messages.conversation_id AND user_id = auth.uid()));

-- Workflows: Users can manage their own workflows only for chatbots they own
CREATE POLICY "Users can manage own workflows" ON workflows FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM chatbots
      WHERE chatbots.id = workflows.chatbot_id
        AND chatbots.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM chatbots
      WHERE chatbots.id = workflows.chatbot_id
        AND chatbots.user_id = auth.uid()
    )
  );

-- FAQs: Users can manage their own FAQs only for chatbots they own
CREATE POLICY "Users can manage own faqs" ON faqs FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM chatbots
      WHERE chatbots.id = faqs.chatbot_id
        AND chatbots.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM chatbots
      WHERE chatbots.id = faqs.chatbot_id
        AND chatbots.user_id = auth.uid()
    )
  );

-- Simple trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
