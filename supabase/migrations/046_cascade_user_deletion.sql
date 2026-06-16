-- Migration: 046_cascade_user_deletion.sql
-- Updates all foreign key references to public.profiles(id) to use ON DELETE SET NULL
-- so that users can be deleted without violating foreign key constraints on records they created.

-- 1. leads
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_created_by_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. quotations
ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_created_by_fkey;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_created_by_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. invoices
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 5. payments
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_created_by_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 6. production_jobs
ALTER TABLE public.production_jobs DROP CONSTRAINT IF EXISTS production_jobs_created_by_fkey;
ALTER TABLE public.production_jobs ADD CONSTRAINT production_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 7. expenses
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_created_by_fkey;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 8. accounting_categories
ALTER TABLE public.accounting_categories DROP CONSTRAINT IF EXISTS accounting_categories_created_by_fkey;
ALTER TABLE public.accounting_categories ADD CONSTRAINT accounting_categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 9. accounting_accounts
ALTER TABLE public.accounting_accounts DROP CONSTRAINT IF EXISTS accounting_accounts_created_by_fkey;
ALTER TABLE public.accounting_accounts ADD CONSTRAINT accounting_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 10. accounting_entries
ALTER TABLE public.accounting_entries DROP CONSTRAINT IF EXISTS accounting_entries_created_by_fkey;
ALTER TABLE public.accounting_entries ADD CONSTRAINT accounting_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
