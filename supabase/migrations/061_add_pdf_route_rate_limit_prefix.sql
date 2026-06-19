-- Migration: 061_add_pdf_route_rate_limit_prefix.sql
-- Update check_rate_limit to allow 'pdf-route' prefix.

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
  -- Validate key prefix and length to prevent key bloat attacks
  IF limit_key IS NULL OR length(limit_key) > 100 THEN
    RAISE EXCEPTION 'Invalid rate limit key: key cannot be null or exceed 100 characters';
  END IF;

  -- Allowed prefixes: login, public-lead, pdf, pdf-route
  IF split_part(limit_key, ':', 1) NOT IN ('login', 'public-lead', 'pdf', 'pdf-route') THEN
    RAISE EXCEPTION 'Invalid rate limit key prefix';
  END IF;

  -- Acquire exclusive transaction-level advisory lock on the rate limit key hash
  PERFORM pg_advisory_xact_lock(hashtext(limit_key));

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

-- Restrict check_rate_limit to service_role only (consistent with 045 migration)
REVOKE ALL ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) TO service_role;
