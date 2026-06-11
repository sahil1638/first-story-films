-- Create rate limits table for distributed token bucket rate limiter
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  tokens NUMERIC NOT NULL,
  last_refilled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on rate_limits
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Block all direct public or authenticated access to rate_limits
DROP POLICY IF EXISTS "No access to rate limits" ON public.rate_limits;
CREATE POLICY "No access to rate limits" ON public.rate_limits
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

-- Create transactional rate limit check function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  limit_key text,
  max_tokens numeric,
  refill_rate_per_sec numeric,
  cost numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  now_time timestamptz := now();
  curr_tokens numeric;
  last_refill timestamptz;
  elapsed_sec numeric;
  new_tokens numeric;
BEGIN
  SELECT tokens, last_refilled_at INTO curr_tokens, last_refill
  FROM public.rate_limits
  WHERE key = limit_key;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (key, tokens, last_refilled_at)
    VALUES (limit_key, max_tokens - cost, now_time);
    RETURN TRUE;
  END IF;

  elapsed_sec := extract(epoch from (now_time - last_refill));
  new_tokens := curr_tokens + (elapsed_sec * refill_rate_per_sec);
  IF new_tokens > max_tokens THEN
    new_tokens := max_tokens;
  END IF;

  IF new_tokens < cost THEN
    -- Refill current tokens without consuming
    UPDATE public.rate_limits
    SET tokens = new_tokens, last_refilled_at = now_time
    WHERE key = limit_key;
    RETURN FALSE;
  END IF;

  UPDATE public.rate_limits
  SET tokens = new_tokens - cost, last_refilled_at = now_time
  WHERE key = limit_key;
  RETURN TRUE;
END;
$$;
