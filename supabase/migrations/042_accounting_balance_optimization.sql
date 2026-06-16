-- Migration: 042_accounting_balance_optimization.sql
-- Optimize account balance calculations by moving aggregation logic from Node.js to a database view.
-- Add performance-enhancing indexes for account/type and source/source_id on accounting_entries.

-- 1. Create the security-invoking view for accounting accounts with balances
CREATE OR REPLACE VIEW public.accounting_accounts_with_balances
WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.name,
  a.opening_balance,
  a.status,
  a.created_by,
  a.created_at,
  a.updated_at,
  COALESCE(SUM(CASE WHEN e.type = 'income' THEN e.amount ELSE 0 END), 0)::numeric AS total_in,
  COALESCE(SUM(CASE WHEN e.type = 'expense' THEN e.amount ELSE 0 END), 0)::numeric AS total_out,
  (a.opening_balance + COALESCE(SUM(CASE WHEN e.type = 'income' THEN e.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN e.type = 'expense' THEN e.amount ELSE 0 END), 0))::numeric AS current_balance,
  COUNT(e.id)::bigint AS entry_count
FROM public.accounting_accounts a
LEFT JOIN public.accounting_entries e ON a.id = e.account_id
GROUP BY a.id, a.name, a.opening_balance, a.status, a.created_by, a.created_at, a.updated_at;

-- 2. Create optimized index on account_id and type for fast grouping/summing
CREATE INDEX idx_accounting_entries_account_id_type
  ON public.accounting_entries (account_id, type);

-- 3. Create index on source and source_id columns used by payment/job synchronization and route details
CREATE INDEX idx_accounting_entries_source_source_id
  ON public.accounting_entries (source, source_id);
