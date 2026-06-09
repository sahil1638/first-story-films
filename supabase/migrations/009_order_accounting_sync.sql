ALTER TABLE accounting_entries
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS accounting_entries_source_source_id_idx
  ON accounting_entries(source, source_id)
  WHERE source IS NOT NULL AND source_id IS NOT NULL;

WITH default_account AS (
  INSERT INTO accounting_accounts (name, opening_balance, status)
  SELECT 'Order Transactions', 0, 'active'
  WHERE NOT EXISTS (
    SELECT 1 FROM accounting_accounts WHERE name = 'Order Transactions'
  )
  RETURNING id
),
account_row AS (
  SELECT id FROM default_account
  UNION ALL
  SELECT id FROM accounting_accounts WHERE name = 'Order Transactions'
  LIMIT 1
),
income_category AS (
  INSERT INTO accounting_categories (name, type, status)
  SELECT 'Order Payments', 'income', 'active'
  WHERE NOT EXISTS (
    SELECT 1 FROM accounting_categories WHERE name = 'Order Payments' AND type = 'income'
  )
  RETURNING id
),
income_category_row AS (
  SELECT id FROM income_category
  UNION ALL
  SELECT id FROM accounting_categories WHERE name = 'Order Payments' AND type = 'income'
  LIMIT 1
)
INSERT INTO accounting_entries (type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by)
SELECT
  'income',
  account_row.id,
  income_category_row.id,
  p.amount,
  p.payment_date,
  'Order payment',
  'order_payment',
  p.id,
  p.created_by
FROM payments p
CROSS JOIN account_row
CROSS JOIN income_category_row
WHERE NOT EXISTS (
  SELECT 1 FROM accounting_entries ae
  WHERE ae.source = 'order_payment' AND ae.source_id = p.id
);

WITH default_account AS (
  INSERT INTO accounting_accounts (name, opening_balance, status)
  SELECT 'Order Transactions', 0, 'active'
  WHERE NOT EXISTS (
    SELECT 1 FROM accounting_accounts WHERE name = 'Order Transactions'
  )
  RETURNING id
),
account_row AS (
  SELECT id FROM default_account
  UNION ALL
  SELECT id FROM accounting_accounts WHERE name = 'Order Transactions'
  LIMIT 1
),
expense_category AS (
  INSERT INTO accounting_categories (name, type, status)
  SELECT 'Production Expenses', 'expense', 'active'
  WHERE NOT EXISTS (
    SELECT 1 FROM accounting_categories WHERE name = 'Production Expenses' AND type = 'expense'
  )
  RETURNING id
),
expense_category_row AS (
  SELECT id FROM expense_category
  UNION ALL
  SELECT id FROM accounting_categories WHERE name = 'Production Expenses' AND type = 'expense'
  LIMIT 1
)
INSERT INTO accounting_entries (type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by)
SELECT
  'expense',
  account_row.id,
  expense_category_row.id,
  pj.payable_amount,
  pj.created_at::date,
  'Production expense',
  'production_job',
  pj.id,
  pj.created_by
FROM production_jobs pj
CROSS JOIN account_row
CROSS JOIN expense_category_row
WHERE NOT EXISTS (
  SELECT 1 FROM accounting_entries ae
  WHERE ae.source = 'production_job' AND ae.source_id = pj.id
);
