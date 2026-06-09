-- Fix customer/order relationship to enforce one customer per order and split legacy merged customers

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'customers'
      AND column_name = 'order_id'
  ) THEN
    ALTER TABLE customers ADD COLUMN order_id UUID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_order_id_fkey'
  ) THEN
    ALTER TABLE customers ADD CONSTRAINT customers_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'customers_order_id_idx'
  ) THEN
    CREATE UNIQUE INDEX customers_order_id_idx ON customers(order_id);
  END IF;
END
$$;

UPDATE customers c
SET order_id = o.id
FROM orders o
WHERE o.customer_id = c.id
  AND o.id = (
    SELECT MIN(o2.id)
    FROM orders o2
    WHERE o2.customer_id = c.id
  );

INSERT INTO customers (couple_name, contact_number, email, order_id, created_at, updated_at)
SELECT
  o.couple_name,
  o.contact_number,
  o.email,
  o.id,
  o.created_at,
  o.updated_at
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.id <> (
  SELECT MIN(o2.id)
  FROM orders o2
  WHERE o2.customer_id = o.customer_id
);

UPDATE orders o
SET customer_id = c.id
FROM customers c
WHERE o.id = c.order_id;

COMMIT;
