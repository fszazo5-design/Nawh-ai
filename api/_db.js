import { neon } from '@neondatabase/serverless';

/**
 * Database connection helper for Vercel Serverless Functions
 * Uses Neon serverless PostgreSQL
 */

let sql = null;

export function getDb() {
  if (!sql) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    sql = neon(connectionString);
  }
  return sql;
}

/**
 * Initialize database tables if they don't exist inside a specific schema
 */
export async function initializeDatabase(schemaName = 'public') {
  const sql = getDb();

  // 1. إنشاء السكيما أولاً إذا لم تكن موجودة
  await sql(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // 2. بناء الجداول داخل السكيما المحددة
  await sql(`
    -- Users table
    CREATE TABLE IF NOT EXISTS "${schemaName}".users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
      is_active BOOLEAN DEFAULT true,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- Products table
    CREATE TABLE IF NOT EXISTS "${schemaName}".products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      barcode TEXT UNIQUE,
      category TEXT,
      unit TEXT DEFAULT 'قطعة',
      cost_price NUMERIC(12,2) DEFAULT 0,
      sell_price NUMERIC(12,2) DEFAULT 0,
      stock_qty NUMERIC(12,3) DEFAULT 0,
      min_stock_qty NUMERIC(12,3) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      image_url TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- Customers table
    CREATE TABLE IF NOT EXISTS "${schemaName}".customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      tax_id TEXT,
      credit_limit NUMERIC(12,2) DEFAULT 0,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- Suppliers table
    CREATE TABLE IF NOT EXISTS "${schemaName}".suppliers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      tax_id TEXT,
      credit_limit NUMERIC(12,2) DEFAULT 0,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- Expense categories table
    CREATE TABLE IF NOT EXISTS "${schemaName}".expense_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- Invoices table
    CREATE TABLE IF NOT EXISTS "${schemaName}".invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number TEXT NOT NULL UNIQUE,
      customer_id UUID REFERENCES "${schemaName}".customers(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'cancelled')),
      subtotal NUMERIC(12,2) DEFAULT 0,
      discount_amt NUMERIC(12,2) DEFAULT 0,
      tax_rate NUMERIC(5,2) DEFAULT 0,
      tax_amt NUMERIC(12,2) DEFAULT 0,
      total_amount NUMERIC(12,2) DEFAULT 0,
      paid_amount NUMERIC(12,2) DEFAULT 0,
      payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer', 'credit')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- Invoice items table
    CREATE TABLE IF NOT EXISTS "${schemaName}".invoice_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id UUID NOT NULL REFERENCES "${schemaName}".invoices(id) ON DELETE CASCADE,
      product_id UUID REFERENCES "${schemaName}".products(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      qty NUMERIC(12,3) NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL,
      discount NUMERIC(5,2) DEFAULT 0,
      total NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- Purchases table
    CREATE TABLE IF NOT EXISTS "${schemaName}".purchases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_number TEXT NOT NULL UNIQUE,
      supplier_id UUID REFERENCES "${schemaName}".suppliers(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'received' CHECK (status IN ('received', 'pending', 'cancelled')),
      subtotal NUMERIC(12,2) DEFAULT 0,
      discount_amt NUMERIC(12,2) DEFAULT 0,
      tax_amt NUMERIC(12,2) DEFAULT 0,
      total_amount NUMERIC(12,2) DEFAULT 0,
      paid_amount NUMERIC(12,2) DEFAULT 0,
      payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer', 'credit')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- Purchase items table
    CREATE TABLE IF NOT EXISTS "${schemaName}".purchase_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_id UUID NOT NULL REFERENCES "${schemaName}".purchases(id) ON DELETE CASCADE,
      product_id UUID REFERENCES "${schemaName}".products(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      qty NUMERIC(12,3) NOT NULL,
      unit_cost NUMERIC(12,2) NOT NULL,
      total NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- Expenses table
    CREATE TABLE IF NOT EXISTS "${schemaName}".expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID REFERENCES "${schemaName}".expense_categories(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      paid_by TEXT,
      receipt_url TEXT,
      expense_date DATE,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- WhatsApp queue table
    CREATE TABLE IF NOT EXISTS "${schemaName}".whatsapp_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient TEXT NOT NULL,
      message TEXT NOT NULL,
      template_name TEXT,
      template_params JSONB,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
      error_message TEXT,
      sent_at TIMESTAMPTZ,
      created_by UUID REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- Audit log table
    CREATE TABLE IF NOT EXISTS "${schemaName}".audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES "${schemaName}".users(id) ON DELETE SET NULL,
      table_name TEXT NOT NULL,
      record_id UUID,
      action TEXT NOT NULL,
      old_values JSONB,
      new_values JSONB,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    -- Sync queue table for offline mobile sync
    CREATE TABLE IF NOT EXISTS "${schemaName}".sync_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES "${schemaName}".users(id) ON DELETE CASCADE,
      table_name TEXT NOT NULL,
      record_id UUID NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
      data JSONB,
      synced BOOLEAN DEFAULT false,
      synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // 3. إنشاء الفهارس (Indexes) الفريدة لكل سكيما لتفادي تعارض الأسماء في قاعدة البيانات
  await sql(`CREATE INDEX IF NOT EXISTS "idx_prod_bar_${schemaName}" ON "${schemaName}".products(barcode)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_prod_cat_${schemaName}" ON "${schemaName}".products(category)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_cust_${schemaName}" ON "${schemaName}".invoices(customer_id)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_stat_${schemaName}" ON "${schemaName}".invoices(status)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_created_${schemaName}" ON "${schemaName}".invoices(created_at DESC)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_users_email_${schemaName}" ON "${schemaName}".users(email)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_wa_status_${schemaName}" ON "${schemaName}".whatsapp_queue(status)`);

  // 4. إدخال التصنيفات الافتراضية للمصاريف الخاصة بهذه السكيما
  await sql(`
    INSERT INTO "${schemaName}".expense_categories (name)
    VALUES
      ('رواتب'),
      ('إيجار'),
      ('مرافق'),
      ('مواصلات'),
      ('صيانة'),
      ('مشتريات مكتبية'),
      ('تسويق'),
      ('أخرى')
    ON CONFLICT (name) DO NOTHING
  `);

  return { success: true, message: `Database schema '${schemaName}' initialized successfully` };
}

export default { getDb, initializeDatabase };
