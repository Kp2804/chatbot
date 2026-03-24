-- Tighten ownership policies to prevent cross-tenant writes by mixing user_id with another tenant's chatbot_id.

DROP POLICY IF EXISTS "Users can manage own conversations" ON public.conversations;
CREATE POLICY "Users can manage own conversations"
ON public.conversations
FOR ALL
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.chatbots
    WHERE public.chatbots.id = public.conversations.chatbot_id
      AND public.chatbots.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.chatbots
    WHERE public.chatbots.id = public.conversations.chatbot_id
      AND public.chatbots.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can manage own workflows" ON public.workflows;
CREATE POLICY "Users can manage own workflows"
ON public.workflows
FOR ALL
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.chatbots
    WHERE public.chatbots.id = public.workflows.chatbot_id
      AND public.chatbots.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.chatbots
    WHERE public.chatbots.id = public.workflows.chatbot_id
      AND public.chatbots.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can manage own faqs" ON public.faqs;
CREATE POLICY "Users can manage own faqs"
ON public.faqs
FOR ALL
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.chatbots
    WHERE public.chatbots.id = public.faqs.chatbot_id
      AND public.chatbots.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.chatbots
    WHERE public.chatbots.id = public.faqs.chatbot_id
      AND public.chatbots.user_id = auth.uid()
  )
);
