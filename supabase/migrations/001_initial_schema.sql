-- First Story Films – Initial Schema
-- Run in Supabase SQL Editor or via Supabase CLI

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'sales');
CREATE TYPE record_status AS ENUM ('active', 'inactive');
CREATE TYPE lead_source AS ENUM ('public_form', 'admin_manual', 'user_management');
CREATE TYPE lead_status AS ENUM ('pending', 'convert_to_quotation', 'cancelled');
CREATE TYPE quotation_status AS ENUM ('pending', 'convert_to_order', 'cancelled');
CREATE TYPE order_status AS ENUM ('pending', 'convert_to_production', 'cancelled', 'complete');
CREATE TYPE production_job_status AS ENUM ('pending', 'in_progress', 'done');
CREATE TYPE payment_status AS ENUM ('paid', 'partial_paid', 'unpaid');
CREATE TYPE invoice_type AS ENUM ('gst', 'non_gst');
CREATE TYPE expense_source AS ENUM ('production_job', 'manual');

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'sales',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Masters
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  status record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  status record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  status record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  person_name TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  address TEXT,
  status record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agency_services (
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (agency_id, service_id)
);

CREATE TABLE crew_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  address TEXT,
  status record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE crew_member_services (
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (crew_member_id, service_id)
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('terms_and_conditions', ''),
  ('agreement_content', ''),
  ('whatsapp_lead_client', ''),
  ('whatsapp_lead_admin', ''),
  ('whatsapp_assignment', ''),
  ('whatsapp_invoice', ''),
  ('whatsapp_receipt', ''),
  ('public_form_slug', 'inquiry');

-- Leads
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source lead_source NOT NULL DEFAULT 'public_form',
  status lead_status NOT NULL DEFAULT 'pending',
  your_name TEXT NOT NULL,
  couple_name TEXT NOT NULL,
  referral_source TEXT,
  contact_number TEXT NOT NULL,
  email TEXT,
  event_location TEXT NOT NULL,
  wedding_date DATE NOT NULL,
  wedding_venue TEXT,
  album_requirement TEXT NOT NULL,
  drone_requirement TEXT NOT NULL,
  shooting_side TEXT NOT NULL,
  pre_wedding_shoot TEXT NOT NULL,
  functions_count INT NOT NULL DEFAULT 1 CHECK (functions_count >= 1 AND functions_count <= 30),
  has_additional_info BOOLEAN NOT NULL DEFAULT FALSE,
  additional_details TEXT,
  agreement_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  budget_range TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lead_function_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  day_index INT NOT NULL,
  day_date DATE NOT NULL,
  first_event_id UUID REFERENCES events(id),
  second_event_id UUID REFERENCES events(id),
  UNIQUE (lead_id, day_index)
);

CREATE TABLE lead_function_day_services (
  lead_function_day_id UUID NOT NULL REFERENCES lead_function_days(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_function_day_id, service_id)
);

-- Quotations (created from leads only)
CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status quotation_status NOT NULL DEFAULT 'pending',
  your_name TEXT NOT NULL,
  couple_name TEXT NOT NULL,
  referral_source TEXT,
  contact_number TEXT NOT NULL,
  email TEXT,
  event_location TEXT NOT NULL,
  wedding_date DATE NOT NULL,
  wedding_venue TEXT,
  album_requirement TEXT NOT NULL,
  drone_requirement TEXT NOT NULL,
  shooting_side TEXT NOT NULL,
  pre_wedding_shoot TEXT NOT NULL,
  functions_count INT NOT NULL,
  has_additional_info BOOLEAN NOT NULL DEFAULT FALSE,
  additional_details TEXT,
  budget_range TEXT NOT NULL,
  original_lead_id UUID,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quotation_function_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  day_index INT NOT NULL,
  day_date DATE NOT NULL,
  first_event_id UUID REFERENCES events(id),
  second_event_id UUID REFERENCES events(id),
  UNIQUE (quotation_id, day_index)
);

CREATE TABLE quotation_function_day_services (
  quotation_function_day_id UUID NOT NULL REFERENCES quotation_function_days(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (quotation_function_day_id, service_id)
);

CREATE TABLE quotation_service_persons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  person_count INT NOT NULL DEFAULT 1 CHECK (person_count >= 1),
  UNIQUE (quotation_id, service_id)
);

CREATE TABLE quotation_deliverables (
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  deliverable_id UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  PRIMARY KEY (quotation_id, deliverable_id)
);

-- Orders (from quotations only)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID NOT NULL UNIQUE,
  status order_status NOT NULL DEFAULT 'pending',
  your_name TEXT NOT NULL,
  couple_name TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  email TEXT,
  event_location TEXT NOT NULL,
  wedding_date DATE NOT NULL,
  wedding_venue TEXT,
  budget_range TEXT,
  total_amount DECIMAL(12, 2) DEFAULT 0,
  paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  person_count INT NOT NULL DEFAULT 1,
  UNIQUE (order_id, service_id)
);

CREATE TABLE order_service_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_service_id UUID NOT NULL REFERENCES order_services(id) ON DELETE CASCADE,
  crew_member_id UUID NOT NULL REFERENCES crew_members(id),
  UNIQUE (order_service_id, crew_member_id)
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  couple_name TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'orders'
      AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN customer_id UUID REFERENCES customers(id);
  END IF;
END
$$;

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

-- Invoices & Payments
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_type invoice_type NOT NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  amount DECIMAL(12, 2) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_number TEXT NOT NULL UNIQUE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Production jobs
CREATE TABLE production_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  service_id UUID NOT NULL REFERENCES services(id),
  payable_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status production_job_status NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Accounting expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source expense_source NOT NULL DEFAULT 'manual',
  production_job_id UUID REFERENCES production_jobs(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup (see 002_fix_auth_user_trigger.sql if user creation fails)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_role public.user_role := 'sales';
  meta_role text;
BEGIN
  meta_role := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  IF meta_role IN ('admin', 'manager', 'sales') THEN
    selected_role := meta_role::public.user_role;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    selected_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER deliverables_updated_at BEFORE UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER agencies_updated_at BEFORE UPDATE ON agencies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER crew_members_updated_at BEFORE UPDATE ON crew_members FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER quotations_updated_at BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER production_jobs_updated_at BEFORE UPDATE ON production_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Expense from production job
CREATE OR REPLACE FUNCTION create_expense_from_production_job()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO expenses (source, production_job_id, order_id, description, amount, created_by)
  VALUES (
    'production_job',
    NEW.id,
    NEW.order_id,
    'Production job – agency assignment',
    NEW.payable_amount,
    NEW.created_by
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER production_job_expense
  AFTER INSERT ON production_jobs
  FOR EACH ROW EXECUTE FUNCTION create_expense_from_production_job();

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_member_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_function_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_function_day_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_function_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_function_day_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_service_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_service_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write (app enforces role checks)
CREATE POLICY "Authenticated full access" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON deliverables FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON agencies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON agency_services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON crew_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON crew_member_services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON lead_function_days FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON lead_function_day_services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON quotations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON quotation_function_days FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON quotation_function_day_services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON quotation_service_persons FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON quotation_deliverables FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON order_services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON order_service_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON production_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public can insert leads (anon)
CREATE POLICY "Public insert leads" ON leads FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public insert lead days" ON lead_function_days FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public insert lead day services" ON lead_function_day_services FOR INSERT TO anon WITH CHECK (true);

-- Public read masters for form dropdowns
CREATE POLICY "Public read active services" ON services FOR SELECT TO anon USING (status = 'active');
CREATE POLICY "Public read active events" ON events FOR SELECT TO anon USING (status = 'active');
CREATE POLICY "Public read settings slug" ON settings FOR SELECT TO anon USING (key = 'public_form_slug');

-- Service role bypass (use in server actions with care)
