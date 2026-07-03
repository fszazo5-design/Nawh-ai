/*
# ERP System Extensions - Auth, WhatsApp, and Offline Sync

1. Overview
This migration extends the POS system to a full ERP with:
- User authentication and role-based access
- WhatsApp notification queue
- Offline sync tracking
- Extended customer/supplier fields

2. New Tables
- `profiles`: User profile data linked to Supabase Auth
- `whatsapp_queue`: Queue for WhatsApp message automation
- `sync_queue`: Track offline operations for mobile sync
- `audit_log`: Track all system changes

3. Modified Tables
- `customers`: Added email, tax_id, credit_limit, notes
- `suppliers`: Added email, tax_id, credit_limit, notes

4. Security
- RLS enabled on all tables
- Owner-scoped policies for user data
- Admin role can access all data

5. Important Notes
1. profiles.user_id references auth.users (Supabase managed)
2. WhatsApp queue uses status: pending/sent/failed
3. Sync queue tracks pending offline operations
*/

-- Profiles table (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
  is_active boolean DEFAULT true,
  last_login timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;
CREATE POLICY "users_read_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins_read_all_profiles" ON profiles;
CREATE POLICY "admins_read_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "admins_manage_profiles" ON profiles;
CREATE POLICY "admins_manage_profiles" ON profiles FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- WhatsApp Queue table
CREATE TABLE IF NOT EXISTS whatsapp_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  message text NOT NULL,
  template_name text,
  template_params jsonb,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE whatsapp_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_whatsapp" ON whatsapp_queue;
CREATE POLICY "authenticated_manage_whatsapp" ON whatsapp_queue FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Sync Queue table (for offline mobile sync)
CREATE TABLE IF NOT EXISTS sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  data jsonb,
  synced boolean DEFAULT false,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_sync" ON sync_queue;
CREATE POLICY "users_manage_own_sync" ON sync_queue FOR ALL
  TO authenticated USING (auth.uid() = user_id);

-- Audit Log table
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_audit" ON audit_log;
CREATE POLICY "authenticated_read_audit" ON audit_log FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "authenticated_insert_audit" ON audit_log;
CREATE POLICY "authenticated_insert_audit" ON audit_log FOR INSERT
  TO authenticated WITH CHECK (true);

-- Extend customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Extend suppliers table
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_whatsapp_status ON whatsapp_queue(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_created ON whatsapp_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_user ON sync_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_synced ON sync_queue(synced);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_suppliers_email ON suppliers(email);

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-creating profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();