-- Persistent daily API rate limiting (replaces in-memory limiter)

CREATE TABLE IF NOT EXISTS public.api_daily_message_usage (
  usage_date DATE NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usage_date, user_id)
);

ALTER TABLE public.api_daily_message_usage ENABLE ROW LEVEL SECURITY;

-- Service-role writes through RPC; users do not read this table directly.
DROP POLICY IF EXISTS "No direct access to api_daily_message_usage" ON public.api_daily_message_usage;
CREATE POLICY "No direct access to api_daily_message_usage"
ON public.api_daily_message_usage
FOR ALL
USING (FALSE)
WITH CHECK (FALSE);

CREATE OR REPLACE FUNCTION public.increment_daily_message_count(
  target_user_id UUID,
  max_per_day INTEGER DEFAULT 50
)
RETURNS TABLE (
  allowed BOOLEAN,
  used_count INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_count INTEGER;
BEGIN
  INSERT INTO public.api_daily_message_usage (usage_date, user_id, count, updated_at)
  VALUES (v_today, target_user_id, 1, NOW())
  ON CONFLICT (usage_date, user_id)
  DO UPDATE
    SET count = public.api_daily_message_usage.count + 1,
        updated_at = NOW()
  RETURNING count INTO v_count;

  RETURN QUERY
  SELECT
    (v_count <= GREATEST(max_per_day, 1)) AS allowed,
    v_count AS used_count,
    ((v_today + INTERVAL '1 day')::timestamptz) AS reset_at;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_daily_message_count(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_daily_message_count(UUID, INTEGER) TO service_role;
