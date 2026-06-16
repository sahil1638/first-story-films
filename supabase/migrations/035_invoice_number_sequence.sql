-- Create invoice_number_sequences table to hold daily increment values per invoice type
CREATE TABLE IF NOT EXISTS public.invoice_number_sequences (
  invoice_date date not null,
  invoice_type text not null,
  last_value integer not null,
  primary key (invoice_date, invoice_type)
);

-- Enable Row Level Security to prevent direct client access
ALTER TABLE public.invoice_number_sequences ENABLE ROW LEVEL SECURITY;

-- Create function to generate sequential, transaction-safe invoice number
CREATE OR REPLACE FUNCTION public.next_invoice_number(
  p_invoice_date date,
  p_invoice_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_val integer;
  v_date_str text;
  v_prefix text;
BEGIN
  -- Validate p_invoice_type against allowed types ('gst' and 'non_gst')
  IF p_invoice_type NOT IN ('gst', 'non_gst') THEN
    RAISE EXCEPTION 'Invalid invoice type: %. Must be either gst or non_gst', p_invoice_type;
  END IF;

  -- Insert or update last_value atomically
  INSERT INTO public.invoice_number_sequences (invoice_date, invoice_type, last_value)
  VALUES (p_invoice_date, p_invoice_type, 1)
  ON CONFLICT (invoice_date, invoice_type)
  DO UPDATE SET last_value = invoice_number_sequences.last_value + 1
  RETURNING last_value INTO v_next_val;

  -- Format prefix based on invoice type
  IF p_invoice_type = 'gst' THEN
    v_prefix := 'INV-GST';
  ELSE
    v_prefix := 'INV';
  END IF;

  v_date_str := to_char(p_invoice_date, 'YYYYMMDD');
  RETURN v_prefix || '-' || v_date_str || '-' || lpad(v_next_val::text, 6, '0');
END;
$$;

-- Revoke execute on the function from public, anon, and grant it to authenticated
REVOKE ALL ON FUNCTION public.next_invoice_number(date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_invoice_number(date, text) FROM anon;
REVOKE ALL ON FUNCTION public.next_invoice_number(date, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(date, text) TO authenticated;
