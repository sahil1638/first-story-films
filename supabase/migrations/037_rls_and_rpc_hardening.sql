-- RLS3 Fix: Update check_rate_limit to enforce key prefix/length validations and clean up expired rows
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

  IF split_part(limit_key, ':', 1) NOT IN ('login', 'public-lead') THEN
    RAISE EXCEPTION 'Invalid rate limit key prefix';
  END IF;

  -- Cleanup old rate limit rows (older than 24 hours) to prevent table bloat
  DELETE FROM public.rate_limits
  WHERE last_refilled_at < now_time - INTERVAL '24 hours';

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

-- RLS2: Revoke EXECUTE grants on SECURITY DEFINER RPCs from PUBLIC/anon/authenticated, and grant only to intended roles.

-- 1. convert_quotation_to_order
REVOKE ALL ON FUNCTION public.convert_quotation_to_order(uuid, numeric, public.invoice_type, jsonb, uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_quotation_to_order(uuid, numeric, public.invoice_type, jsonb, uuid[], uuid) FROM anon;
REVOKE ALL ON FUNCTION public.convert_quotation_to_order(uuid, numeric, public.invoice_type, jsonb, uuid[], uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_order(uuid, numeric, public.invoice_type, jsonb, uuid[], uuid) TO authenticated;

-- 2. delete_order_cascade
REVOKE ALL ON FUNCTION public.delete_order_cascade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_order_cascade(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_order_cascade(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_cascade(uuid) TO authenticated;

-- 3. add_order_payment
REVOKE ALL ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) TO authenticated;

-- 4. delete_order_payment
REVOKE ALL ON FUNCTION public.delete_order_payment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_order_payment(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_order_payment(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_payment(uuid, uuid) TO authenticated;

-- 5. update_order_payment
REVOKE ALL ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) TO authenticated;

-- 6. add_production_job
REVOKE ALL ON FUNCTION public.add_production_job(uuid, uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_production_job(uuid, uuid, uuid, numeric, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.add_production_job(uuid, uuid, uuid, numeric, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_production_job(uuid, uuid, uuid, numeric, uuid) TO authenticated;

-- 7. delete_production_job
REVOKE ALL ON FUNCTION public.delete_production_job(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_production_job(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_production_job(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_production_job(uuid, uuid) TO authenticated;

-- 8. update_production_job
REVOKE ALL ON FUNCTION public.update_production_job(uuid, uuid, uuid, uuid, numeric, public.production_job_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_production_job(uuid, uuid, uuid, uuid, numeric, public.production_job_status) FROM anon;
REVOKE ALL ON FUNCTION public.update_production_job(uuid, uuid, uuid, uuid, numeric, public.production_job_status) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_production_job(uuid, uuid, uuid, uuid, numeric, public.production_job_status) TO authenticated;

-- RLS3: Revoke execute on check_rate_limit from PUBLIC and explicitly grant to anon and authenticated
REVOKE ALL ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) TO anon, authenticated;
