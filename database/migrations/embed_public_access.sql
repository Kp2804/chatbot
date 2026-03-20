-- Secure embedded read access: only explicitly public chatbots are readable by anon/authenticated widget users.

ALTER TABLE public.chatbots
  ADD COLUMN IF NOT EXISTS is_embed_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS embed_allowed_origins TEXT[] NOT NULL DEFAULT '{}'::text[];

DROP POLICY IF EXISTS "Public can read chatbots for embed" ON public.chatbots;
CREATE POLICY "Public can read chatbots for embed"
ON public.chatbots
FOR SELECT
USING (is_embed_public = TRUE);

DROP POLICY IF EXISTS "Public can read published faqs for embed" ON public.faqs;
CREATE POLICY "Public can read published faqs for embed"
ON public.faqs
FOR SELECT
USING (
  status = 'published'
  AND EXISTS (
    SELECT 1
    FROM public.chatbots
    WHERE public.chatbots.id = public.faqs.chatbot_id
      AND public.chatbots.user_id = public.faqs.user_id
      AND public.chatbots.is_embed_public = TRUE
  )
);

DROP POLICY IF EXISTS "Public can read workflows for embed" ON public.workflows;
CREATE POLICY "Public can read workflows for embed"
ON public.workflows
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.chatbots
    WHERE public.chatbots.id = public.workflows.chatbot_id
      AND public.chatbots.user_id = public.workflows.user_id
      AND public.chatbots.is_embed_public = TRUE
  )
);

DROP POLICY IF EXISTS "Public can read chatbot settings for embed" ON public.chatbot_settings;
CREATE POLICY "Public can read chatbot settings for embed"
ON public.chatbot_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.chatbots
    WHERE public.chatbots.id = public.chatbot_settings.chatbot_id
      AND public.chatbots.is_embed_public = TRUE
  )
);
