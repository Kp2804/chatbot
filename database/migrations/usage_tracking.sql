-- Usage tracking helpers
-- Provides atomic increments for usage counters and auto-tracks chatbot creation.

CREATE OR REPLACE FUNCTION public.increment_messages_used(
  target_user_id UUID,
  increment_by INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required';
  END IF;

  IF increment_by IS NULL OR increment_by <= 0 THEN
    RAISE EXCEPTION 'increment_by must be a positive integer';
  END IF;

  INSERT INTO public."usage" (user_id, messages_used, bots_created, storage_used, updated_at)
  VALUES (target_user_id, increment_by, 0, 0, now())
  ON CONFLICT (user_id)
  DO UPDATE
    SET messages_used = public."usage".messages_used + EXCLUDED.messages_used,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_bots_created(
  target_user_id UUID,
  increment_by INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required';
  END IF;

  IF increment_by IS NULL OR increment_by <= 0 THEN
    RAISE EXCEPTION 'increment_by must be a positive integer';
  END IF;

  INSERT INTO public."usage" (user_id, messages_used, bots_created, storage_used, updated_at)
  VALUES (target_user_id, 0, increment_by, 0, now())
  ON CONFLICT (user_id)
  DO UPDATE
    SET bots_created = public."usage".bots_created + EXCLUDED.bots_created,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_chatbot_created_increment_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.increment_bots_created(NEW.user_id, 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_chatbot_creation_usage ON public.chatbots;

CREATE TRIGGER track_chatbot_creation_usage
AFTER INSERT ON public.chatbots
FOR EACH ROW
EXECUTE FUNCTION public.handle_chatbot_created_increment_usage();
