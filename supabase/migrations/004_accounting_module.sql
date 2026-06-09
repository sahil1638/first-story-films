-- Accounting Module Tables
-- Add support for Entries, Accounts, and Categories

-- Accounting Categories
CREATE TABLE accounting_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  status record_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Accounting Accounts
CREATE TABLE accounting_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  opening_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status record_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Accounting Entries (Income + Expense)
CREATE TABLE accounting_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  account_id UUID NOT NULL REFERENCES accounting_accounts(id),
  category_id UUID NOT NULL REFERENCES accounting_categories(id),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  remarks TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE accounting_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated full access" ON accounting_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON accounting_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON accounting_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_accounting_entries_account_id ON accounting_entries(account_id);
CREATE INDEX idx_accounting_entries_category_id ON accounting_entries(category_id);
CREATE INDEX idx_accounting_entries_entry_date ON accounting_entries(entry_date);
CREATE INDEX idx_accounting_entries_type ON accounting_entries(type);
CREATE INDEX idx_accounting_categories_type ON accounting_categories(type);

-- Updated_at triggers
CREATE TRIGGER accounting_categories_updated_at BEFORE UPDATE ON accounting_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER accounting_accounts_updated_at BEFORE UPDATE ON accounting_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER accounting_entries_updated_at BEFORE UPDATE ON accounting_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
