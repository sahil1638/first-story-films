ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS agreement_content TEXT;
