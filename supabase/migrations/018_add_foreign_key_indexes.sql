-- Migration: Add indexes on foreign key columns to improve query performance and join efficiency.

-- 1. Core Master associations
CREATE INDEX IF NOT EXISTS idx_agency_services_service_id ON public.agency_services(service_id);
CREATE INDEX IF NOT EXISTS idx_crew_member_services_service_id ON public.crew_member_services(service_id);

-- 2. Leads associations
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON public.leads(created_by);
CREATE INDEX IF NOT EXISTS idx_lead_function_days_first_event_id ON public.lead_function_days(first_event_id);
CREATE INDEX IF NOT EXISTS idx_lead_function_days_second_event_id ON public.lead_function_days(second_event_id);
CREATE INDEX IF NOT EXISTS idx_lead_function_day_services_service_id ON public.lead_function_day_services(service_id);

-- 3. Quotations associations
CREATE INDEX IF NOT EXISTS idx_quotations_created_by ON public.quotations(created_by);
CREATE INDEX IF NOT EXISTS idx_quotation_function_days_first_event_id ON public.quotation_function_days(first_event_id);
CREATE INDEX IF NOT EXISTS idx_quotation_function_days_second_event_id ON public.quotation_function_days(second_event_id);
CREATE INDEX IF NOT EXISTS idx_quotation_function_day_services_service_id ON public.quotation_function_day_services(service_id);
CREATE INDEX IF NOT EXISTS idx_quotation_service_persons_service_id ON public.quotation_service_persons(service_id);
CREATE INDEX IF NOT EXISTS idx_quotation_deliverables_deliverable_id ON public.quotation_deliverables(deliverable_id);

-- 4. Orders associations
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.orders(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_services_service_id ON public.order_services(service_id);
CREATE INDEX IF NOT EXISTS idx_order_service_allocations_crew_member_id ON public.order_service_allocations(crew_member_id);

-- 5. Invoices & Payments
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON public.payments(created_by);

-- 6. Production & Expenses
CREATE INDEX IF NOT EXISTS idx_production_jobs_order_id ON public.production_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_production_jobs_agency_id ON public.production_jobs(agency_id);
CREATE INDEX IF NOT EXISTS idx_production_jobs_service_id ON public.production_jobs(service_id);
CREATE INDEX IF NOT EXISTS idx_production_jobs_created_by ON public.production_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_production_job_id ON public.expenses(production_job_id);
CREATE INDEX IF NOT EXISTS idx_expenses_order_id ON public.expenses(order_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by);

-- 7. Accounting
CREATE INDEX IF NOT EXISTS idx_accounting_categories_created_by ON public.accounting_categories(created_by);
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_created_by ON public.accounting_accounts(created_by);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_created_by ON public.accounting_entries(created_by);
