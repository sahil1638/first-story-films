-- Phase 1 follow-up hardening.
-- DB1: keep sequence helpers callable only from trusted database code.
-- DB2: prevent duplicate system accounting accounts/categories.
-- P2/AU1: move accounting summaries and role checks to database-backed sources of truth.

-- AU1: profiles.role is the source of truth. Stale JWT app_metadata must not
-- continue to authorize downgraded or deleted users.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  db_role public.user_role;
BEGIN
  SELECT role INTO db_role
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN db_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_role public.user_role := public.current_user_role();
  jwt_role text := auth.role();
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF jwt_role = 'service_role' OR caller_role = 'admin' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Only administrators can change user roles.';
  END IF;

  IF caller_id = OLD.id OR caller_role = 'admin' OR jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Unauthorized profile update.';
END;
$$;

DROP POLICY IF EXISTS "Profiles update admin only" ON public.profiles;
CREATE POLICY "Profiles update admin only" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- DB2: collapse duplicate system rows before enforcing canonical uniqueness.
WITH canonical AS (
  SELECT min(id::text)::uuid AS keep_id
  FROM public.accounting_accounts
  WHERE lower(name) = 'order transactions'
),
duplicates AS (
  SELECT id, canonical.keep_id
  FROM public.accounting_accounts
  CROSS JOIN canonical
  WHERE lower(name) = 'order transactions'
    AND id <> canonical.keep_id
)
UPDATE public.accounting_entries
SET account_id = duplicates.keep_id
FROM duplicates
WHERE accounting_entries.account_id = duplicates.id;

WITH canonical AS (
  SELECT min(id::text)::uuid AS keep_id
  FROM public.accounting_accounts
  WHERE lower(name) = 'order transactions'
),
duplicates AS (
  SELECT id
  FROM public.accounting_accounts
  CROSS JOIN canonical
  WHERE lower(name) = 'order transactions'
    AND id <> canonical.keep_id
)
DELETE FROM public.accounting_accounts
USING duplicates
WHERE accounting_accounts.id = duplicates.id;

WITH canonical AS (
  SELECT lower(name) AS category_key, type, min(id::text)::uuid AS keep_id
  FROM public.accounting_categories
  WHERE lower(name) IN ('order payments', 'production expenses')
  GROUP BY lower(name), type
),
duplicates AS (
  SELECT c.id, canonical.keep_id
  FROM public.accounting_categories c
  JOIN canonical ON lower(c.name) = canonical.category_key AND c.type = canonical.type
  WHERE c.id <> canonical.keep_id
)
UPDATE public.accounting_entries
SET category_id = duplicates.keep_id
FROM duplicates
WHERE accounting_entries.category_id = duplicates.id;

WITH canonical AS (
  SELECT lower(name) AS category_key, type, min(id::text)::uuid AS keep_id
  FROM public.accounting_categories
  WHERE lower(name) IN ('order payments', 'production expenses')
  GROUP BY lower(name), type
),
duplicates AS (
  SELECT c.id
  FROM public.accounting_categories c
  JOIN canonical ON lower(c.name) = canonical.category_key AND c.type = canonical.type
  WHERE c.id <> canonical.keep_id
)
DELETE FROM public.accounting_categories
USING duplicates
WHERE accounting_categories.id = duplicates.id;

CREATE UNIQUE INDEX IF NOT EXISTS accounting_accounts_system_order_transactions_uidx
  ON public.accounting_accounts (lower(name))
  WHERE lower(name) = 'order transactions';

CREATE UNIQUE INDEX IF NOT EXISTS accounting_categories_system_uidx
  ON public.accounting_categories (lower(name), type)
  WHERE lower(name) IN ('order payments', 'production expenses');

CREATE OR REPLACE FUNCTION public.ensure_system_account(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  account_id uuid;
BEGIN
  IF lower(p_name) <> 'order transactions' THEN
    RAISE EXCEPTION 'Unsupported system account: %', p_name;
  END IF;

  SELECT id INTO account_id
  FROM public.accounting_accounts
  WHERE lower(name) = 'order transactions'
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF account_id IS NOT NULL THEN
    RETURN account_id;
  END IF;

  BEGIN
    INSERT INTO public.accounting_accounts (name, opening_balance, status)
    VALUES ('Order Transactions', 0, 'active')
    RETURNING id INTO account_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO account_id
    FROM public.accounting_accounts
    WHERE lower(name) = 'order transactions'
    ORDER BY created_at ASC, id ASC
    LIMIT 1;
  END;

  RETURN account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_system_category(p_name text, p_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  category_id uuid;
  canonical_name text;
BEGIN
  IF lower(p_name) = 'order payments' AND p_type = 'income' THEN
    canonical_name := 'Order Payments';
  ELSIF lower(p_name) = 'production expenses' AND p_type = 'expense' THEN
    canonical_name := 'Production Expenses';
  ELSE
    RAISE EXCEPTION 'Unsupported system category: %/%', p_name, p_type;
  END IF;

  SELECT id INTO category_id
  FROM public.accounting_categories
  WHERE lower(name) = lower(canonical_name)
    AND type = p_type
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF category_id IS NOT NULL THEN
    RETURN category_id;
  END IF;

  BEGIN
    INSERT INTO public.accounting_categories (name, type, status)
    VALUES (canonical_name, p_type, 'active')
    RETURNING id INTO category_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO category_id
    FROM public.accounting_categories
    WHERE lower(name) = lower(canonical_name)
      AND type = p_type
    ORDER BY created_at ASC, id ASC
    LIMIT 1;
  END;

  RETURN category_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_system_account(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_system_account(text) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_system_account(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.ensure_system_category(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_system_category(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_system_category(text, text) FROM authenticated;

-- P2: aggregate summaries in SQL rather than returning every matching entry.
CREATE OR REPLACE FUNCTION public.get_accounting_entries_summary(
  p_type text DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  total_income numeric,
  total_expense numeric,
  net numeric,
  count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0) AS total_income,
    COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS total_expense,
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS net,
    COUNT(*) AS count
  FROM public.accounting_entries
  WHERE public.current_user_role() IN ('admin', 'manager')
    AND (p_type IS NULL OR type = p_type)
    AND (p_account_id IS NULL OR account_id = p_account_id)
    AND (p_category_id IS NULL OR category_id = p_category_id)
    AND (p_date_from IS NULL OR entry_date >= p_date_from)
    AND (p_date_to IS NULL OR entry_date <= p_date_to)
    AND (p_search IS NULL OR remarks ILIKE '%' || p_search || '%');
$$;

REVOKE ALL ON FUNCTION public.get_accounting_entries_summary(text, uuid, uuid, date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_accounting_entries_summary(text, uuid, uuid, date, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_accounting_entries_summary(text, uuid, uuid, date, date, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_accounting_entries_summary(text, uuid, uuid, date, date, text) TO authenticated;

-- DB1: invoice creation is the authorized public RPC; raw sequence helpers are
-- internal implementation details.
CREATE OR REPLACE FUNCTION public.create_order_invoice(
  p_order_id uuid,
  p_invoice_type public.invoice_type,
  p_amount numeric,
  p_invoice_date date DEFAULT CURRENT_DATE,
  p_created_by uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  invoice_no text;
  created_by_id uuid := NULL;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invoice amount must be positive';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF p_created_by IS NOT NULL THEN
    SELECT id INTO created_by_id FROM public.profiles WHERE id = p_created_by;
  END IF;

  invoice_no := public.next_invoice_number(p_invoice_date, p_invoice_type::text);

  INSERT INTO public.invoices (order_id, invoice_type, invoice_number, amount, created_by)
  VALUES (p_order_id, p_invoice_type, invoice_no, p_amount, created_by_id);

  RETURN invoice_no;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_invoice(uuid, public.invoice_type, numeric, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_invoice(uuid, public.invoice_type, numeric, date, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_order_invoice(uuid, public.invoice_type, numeric, date, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_invoice(uuid, public.invoice_type, numeric, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_order_payment(
  order_id uuid,
  amount numeric,
  payment_date date,
  notes text,
  created_by_user uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  total_amt numeric;
  paid_amt numeric;
  remaining numeric;
  created_by_id uuid := NULL;
  receipt_no text;
  new_payment_id uuid;
  account_id uuid;
  category_id uuid;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount greater than zero';
  END IF;

  SELECT total_amount INTO total_amt FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF total_amt <= 0 THEN
    RAISE EXCEPTION 'Set the order total first before adding payments';
  END IF;

  SELECT COALESCE(SUM(payments.amount), 0) INTO paid_amt
  FROM public.payments
  WHERE payments.order_id = add_order_payment.order_id;

  remaining := total_amt - paid_amt;

  IF remaining <= 0 THEN
    RAISE EXCEPTION 'This order is already fully paid.';
  END IF;

  IF amount > remaining THEN
    RAISE EXCEPTION 'Payment cannot exceed remaining amount.';
  END IF;

  IF created_by_user IS NOT NULL THEN
    SELECT id INTO created_by_id FROM public.profiles WHERE id = created_by_user;
  END IF;

  receipt_no := public.next_receipt_number(payment_date);

  INSERT INTO public.payments (order_id, amount, payment_date, receipt_number, notes, created_by)
  VALUES (order_id, amount, payment_date, receipt_no, notes, created_by_id)
  RETURNING id INTO new_payment_id;

  account_id := public.ensure_system_account('Order Transactions');
  category_id := public.ensure_system_category('Order Payments', 'income');

  INSERT INTO public.accounting_entries (type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by)
  VALUES ('income', account_id, category_id, amount, payment_date, COALESCE(notes, 'Order payment'), 'order_payment', new_payment_id, created_by_id);

  UPDATE public.orders
  SET
    paid_amount = (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = add_order_payment.order_id),
    payment_status = CASE
      WHEN (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = add_order_payment.order_id) <= 0 THEN 'unpaid'::public.payment_status
      WHEN total_amount > 0 AND (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = add_order_payment.order_id) >= total_amount THEN 'paid'::public.payment_status
      ELSE 'partial_paid'::public.payment_status
    END
  WHERE id = order_id;

  RETURN receipt_no;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_order_payment(
  payment_id uuid,
  order_id uuid,
  amount numeric,
  payment_date date,
  notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  total_amt numeric;
  paid_excluding numeric;
  created_by_user uuid;
  account_id uuid;
  category_id uuid;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount greater than zero';
  END IF;

  SELECT total_amount INTO total_amt FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT created_by INTO created_by_user
  FROM public.payments
  WHERE id = payment_id AND payments.order_id = update_order_payment.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  SELECT COALESCE(SUM(payments.amount), 0) INTO paid_excluding
  FROM public.payments
  WHERE payments.order_id = update_order_payment.order_id AND id <> payment_id;

  IF paid_excluding + amount > total_amt THEN
    RAISE EXCEPTION 'Payment cannot exceed remaining amount.';
  END IF;

  UPDATE public.payments
  SET
    amount = update_order_payment.amount,
    payment_date = update_order_payment.payment_date,
    notes = update_order_payment.notes
  WHERE id = payment_id AND payments.order_id = update_order_payment.order_id;

  account_id := public.ensure_system_account('Order Transactions');
  category_id := public.ensure_system_category('Order Payments', 'income');

  DELETE FROM public.accounting_entries WHERE source = 'order_payment' AND source_id = payment_id;
  INSERT INTO public.accounting_entries (type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by)
  VALUES ('income', account_id, category_id, amount, payment_date, COALESCE(notes, 'Order payment'), 'order_payment', payment_id, created_by_user);

  UPDATE public.orders
  SET
    paid_amount = (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = update_order_payment.order_id),
    payment_status = CASE
      WHEN (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = update_order_payment.order_id) <= 0 THEN 'unpaid'::public.payment_status
      WHEN total_amount > 0 AND (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = update_order_payment.order_id) >= total_amount THEN 'paid'::public.payment_status
      ELSE 'partial_paid'::public.payment_status
    END
  WHERE id = order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_production_job(
  order_id uuid,
  agency_id uuid,
  service_id uuid,
  payable_amount numeric,
  created_by_user uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_job_id uuid;
  job_created_at timestamptz;
  account_id uuid;
  category_id uuid;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF agency_id IS NULL OR service_id IS NULL THEN
    RAISE EXCEPTION 'Select agency and service';
  END IF;

  IF payable_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid payable amount';
  END IF;

  INSERT INTO public.production_jobs (order_id, agency_id, service_id, payable_amount, created_by)
  VALUES (order_id, agency_id, service_id, payable_amount, created_by_user)
  RETURNING id, created_at INTO new_job_id, job_created_at;

  account_id := public.ensure_system_account('Order Transactions');
  category_id := public.ensure_system_category('Production Expenses', 'expense');

  INSERT INTO public.accounting_entries (type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by)
  VALUES ('expense', account_id, category_id, payable_amount, job_created_at::date, 'Production expense', 'production_job', new_job_id, created_by_user);

  RETURN new_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_production_job(
  job_id uuid,
  order_id uuid,
  agency_id uuid,
  service_id uuid,
  payable_amount numeric,
  status public.production_job_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  created_by_user uuid;
  job_created_at timestamptz;
  account_id uuid;
  category_id uuid;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF agency_id IS NULL OR service_id IS NULL THEN
    RAISE EXCEPTION 'Select agency and service';
  END IF;

  IF payable_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid payable amount';
  END IF;

  SELECT created_by, created_at INTO created_by_user, job_created_at
  FROM public.production_jobs
  WHERE id = job_id AND production_jobs.order_id = update_production_job.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production job not found';
  END IF;

  UPDATE public.production_jobs
  SET
    agency_id = update_production_job.agency_id,
    service_id = update_production_job.service_id,
    payable_amount = update_production_job.payable_amount,
    status = update_production_job.status
  WHERE id = job_id AND production_jobs.order_id = update_production_job.order_id;

  account_id := public.ensure_system_account('Order Transactions');
  category_id := public.ensure_system_category('Production Expenses', 'expense');

  DELETE FROM public.accounting_entries WHERE source = 'production_job' AND source_id = job_id;
  INSERT INTO public.accounting_entries (type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by)
  VALUES ('expense', account_id, category_id, payable_amount, job_created_at::date, 'Production expense', 'production_job', job_id, created_by_user);
END;
$$;

REVOKE ALL ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.add_production_job(uuid, uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_production_job(uuid, uuid, uuid, numeric, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.add_production_job(uuid, uuid, uuid, numeric, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_production_job(uuid, uuid, uuid, numeric, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_production_job(uuid, uuid, uuid, uuid, numeric, public.production_job_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_production_job(uuid, uuid, uuid, uuid, numeric, public.production_job_status) FROM anon;
REVOKE ALL ON FUNCTION public.update_production_job(uuid, uuid, uuid, uuid, numeric, public.production_job_status) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_production_job(uuid, uuid, uuid, uuid, numeric, public.production_job_status) TO authenticated;

REVOKE ALL ON FUNCTION public.next_receipt_number(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_receipt_number(date) FROM anon;
REVOKE ALL ON FUNCTION public.next_receipt_number(date) FROM authenticated;

REVOKE ALL ON FUNCTION public.next_invoice_number(date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_invoice_number(date, text) FROM anon;
REVOKE ALL ON FUNCTION public.next_invoice_number(date, text) FROM authenticated;
