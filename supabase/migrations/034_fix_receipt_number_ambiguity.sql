-- Drop previous next_receipt_number signature
DROP FUNCTION IF EXISTS public.next_receipt_number(date);

-- Create next_receipt_number with clear, non-ambiguous parameter naming
CREATE OR REPLACE FUNCTION public.next_receipt_number(p_receipt_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_val integer;
  v_date_str text;
BEGIN
  -- Insert or update last_value atomically
  INSERT INTO public.receipt_number_sequences (receipt_date, last_value)
  VALUES (p_receipt_date, 1)
  ON CONFLICT (receipt_date)
  DO UPDATE SET last_value = receipt_number_sequences.last_value + 1
  RETURNING last_value INTO v_next_val;

  v_date_str := to_char(p_receipt_date, 'YYYYMMDD');
  RETURN 'RCP-' || v_date_str || '-' || lpad(v_next_val::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_receipt_number(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_receipt_number(date) FROM anon;
REVOKE ALL ON FUNCTION public.next_receipt_number(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_receipt_number(date) TO authenticated;
