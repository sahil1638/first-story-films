ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_type invoice_type NOT NULL DEFAULT 'non_gst',
  ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0;

UPDATE orders
SET subtotal_amount = COALESCE(subtotal_amount, total_amount, 0)
WHERE subtotal_amount IS NULL;

ALTER TABLE orders
  ALTER COLUMN subtotal_amount SET DEFAULT 0,
  ALTER COLUMN subtotal_amount SET NOT NULL;
