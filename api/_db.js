import postgres from 'postgres';

/**
 * Database connection helper for Vercel Serverless Functions
 * Uses Native PostgreSQL client via postgres.js
 */

let sql = null;

export function getDb() {
  if (!sql) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    // إنشاء الاتصال متوافق مع بيئة السيرفرليس
    sql = postgres(connectionString, {
      ssl: 'require', // ضروري للاتصال بقواعد البيانات السحابية مثل Neon
      max: 1,         // مثالي لبيئة Vercel Serverless لمنع استهلاك الاتصالات
      idle_timeout: 20
    });
  }
  return sql;
}

/**
 * Initialize database tables if they don't exist
 */
export async function initializeDatabase() {
  const sql = getDb();

  await sql`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
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
  `;

  await sql`
    -- Products table
    CREATE TABLE IF NOT EXISTS products (
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
  `;

  await sql`
    -- Customers table
    CREATE TABLE IF NOT EXISTS customers (
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
  `;

  await sql`
    -- Suppliers table
    CREATE TABLE IF NOT EXISTS suppliers (
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
  `;

  await sql`
    -- Expense categories table
    CREATE TABLE IF NOT EXISTS expense_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    -- Invoices table
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number TEXT NOT NULL UNIQUE,
      customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
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
  `;

  await sql`
    -- Invoice items table
    CREATE TABLE IF NOT EXISTS invoice_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      qty NUMERIC(12,3) NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL,
      discount NUMERIC(5,2) DEFAULT 0,
      total NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    -- Purchases table
    CREATE TABLE IF NOT EXISTS purchases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_number TEXT NOT NULL UNIQUE,
      supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
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
  `;

  await sql`
    -- Purchase items table
    CREATE TABLE IF NOT EXISTS purchase_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      qty NUMERIC(12,3) NOT NULL,
      unit_cost NUMERIC(12,2) NOT NULL,
      total NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    -- Expenses table
    CREATE TABLE IF NOT EXISTS expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      paid_by TEXT,
      receipt_url TEXT,
      expense_date DATE,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    -- WhatsApp queue table
    CREATE TABLE IF NOT EXISTS whatsapp_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient TEXT NOT NULL,
      message TEXT NOT NULL,
      template_name TEXT,
      template_params JSONB,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
      error_message TEXT,
      sent_at TIMESTAMPTZ,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    -- Audit log table
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      table_name TEXT NOT NULL,
      record_id UUID,
      action TEXT NOT NULL,
      old_values JSONB,
      new_values JSONB,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  await sql`
    -- Sync queue table for offline mobile sync
    CREATE TABLE IF NOT EXISTS sync_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      table_name TEXT NOT NULL,
      record_id UUID NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
      data JSONB,
      synced BOOLEAN DEFAULT false,
      synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_whatsapp_status ON whatsapp_queue(status)`;

  // Insert default expense categories if not exist
  await sql`
    INSERT INTO expense_categories (name)
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
  `;

  return { success: true, message: 'Database initialized successfully' };
}

export default { getDb, initializeDatabase };
