import { neon } from '@neondatabase/serverless';

/**
 * Database connection helper for Vercel Serverless Functions
 * Uses Neon serverless PostgreSQL with dynamic schema routing
 */

// لتخزين الاتصالات المختلفة بناءً على اسم السكيما لمنع تكرار الاتصال
const dbConnections = {};

export function getDb(schemaName = 'public') {
  // إذا كان هناك اتصال نشط مسبقاً لهذه السكيما، قم بإعادته مباشرة
  if (dbConnections[schemaName]) {
    return dbConnections[schemaName];
  }

  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // تنظيف الرابط وإزالة أي خيارات search_path قديمة إن وجدت
  const url = new URL(connectionString);
  url.searchParams.set('options', `-c search_path=${schemaName}`);

  // إنشاء اتصال مخصص وموجه بالكامل لهذه السكيما
  dbConnections[schemaName] = neon(url.toString());
  
  return dbConnections[schemaName];
}

/**
 * Initialize database tables inside a specific schema
 */
export async function initializeDatabase(schemaName = 'public') {
  // جلب كائن الاتصال الموجه للسكيما المستهدفة
  const sql = getDb(schemaName);

  // 1. إنشاء السكيما أولاً إذا لم تكن موجودة
  await sql(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // 2. بناء الجداول داخل السكيما المحددة
  await sql(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
      is_active BOOLEAN DEFAULT true,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // قيد فريد للإيميل داخل السكيما
  await sql(`ALTER TABLE "${schemaName}".users DROP CONSTRAINT IF EXISTS users_email_key`);
  await sql(`ALTER TABLE "${schemaName}".users ADD CONSTRAINT users_email_key UNIQUE (email)`);

  await sql(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      barcode TEXT,
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
  
  await sql(`ALTER TABLE "${schemaName}".products DROP CONSTRAINT IF EXISTS products_barcode_key`);
  await sql(`ALTER TABLE "${schemaName}".products ADD CONSTRAINT products_barcode_key UNIQUE (barcode)`);

  await sql(`
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
    CREATE TABLE IF NOT EXISTS "${schemaName}".expense_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  
  await sql(`ALTER TABLE "${schemaName}".expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_key`);
  await sql(`ALTER TABLE "${schemaName}".expense_categories ADD CONSTRAINT expense_categories_name_key UNIQUE (name)`);

  await sql(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number TEXT NOT NULL,
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
  
  await sql(`ALTER TABLE "${schemaName}".invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key`);
  await sql(`ALTER TABLE "${schemaName}".invoices ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number)`);

  await sql(`
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
    CREATE TABLE IF NOT EXISTS "${schemaName}".purchases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_number TEXT NOT NULL,
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
  
  await sql(`ALTER TABLE "${schemaName}".purchases DROP CONSTRAINT IF EXISTS purchases_purchase_number_key`);
  await sql(`ALTER TABLE "${schemaName}".purchases ADD CONSTRAINT purchases_purchase_number_key UNIQUE (purchase_number)`);

  await sql(`
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

  // 3. إنشاء الفهارس (Indexes)
  await sql(`CREATE INDEX IF NOT EXISTS "idx_prod_bar_${schemaName}" ON "${schemaName}".products(barcode)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_prod_cat_${schemaName}" ON "${schemaName}".products(category)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_cust_${schemaName}" ON "${schemaName}".invoices(customer_id)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_stat_${schemaName}" ON "${schemaName}".invoices(status)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_created_${schemaName}" ON "${schemaName}".invoices(created_at DESC)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_users_email_${schemaName}" ON "${schemaName}".users(email)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_wa_status_${schemaName}" ON "${schemaName}".whatsapp_queue(status)`);

  // ========================================================
  // المحركات والترابط الاحترافي الديناميكي لكل سكيما على حدة
  // ========================================================

  // أ. دالة ومُشغّل مبيعات الفواتير لخصم المخزن (تم تعديل إرجاع الصف لضمان تنفيذ العملية)
  await sql(`
    CREATE OR REPLACE FUNCTION "${schemaName}".fn_update_stock_on_sales()
    RETURNS TRIGGER AS $$
    DECLARE
      current_schema TEXT := TG_TABLE_SCHEMA;
    BEGIN
      IF (TG_OP = 'INSERT') THEN
        EXECUTE format('UPDATE %I.products SET stock_qty = stock_qty - $1, updated_at = now() WHERE id = $2', current_schema)
        USING NEW.qty, NEW.product_id;
        RETURN NEW;
      ELSIF (TG_OP = 'UPDATE') THEN
        EXECUTE format('UPDATE %I.products SET stock_qty = stock_qty + $1 - $2, updated_at = now() WHERE id = $3', current_schema)
        USING OLD.qty, NEW.qty, NEW.product_id;
        RETURN NEW;
      ELSIF (TG_OP = 'DELETE') THEN
        EXECUTE format('UPDATE %I.products SET stock_qty = stock_qty + $1, updated_at = now() WHERE id = $2', current_schema)
        USING OLD.qty, OLD.product_id;
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await sql(`DROP TRIGGER IF EXISTS trg_update_stock_sales ON "${schemaName}".invoice_items`);
  await sql(`
    CREATE TRIGGER trg_update_stock_sales
    AFTER INSERT OR UPDATE OR DELETE ON "${schemaName}".invoice_items
    FOR EACH ROW EXECUTE FUNCTION "${schemaName}".fn_update_stock_on_sales();
  `);

  // ب. دالة ومُشغّل المشتريات لزيادة المخزن وتحديث سعر التكلفة (تم تعديل إرجاع الصف لضمان تنفيذ العملية)
  await sql(`
    CREATE OR REPLACE FUNCTION "${schemaName}".fn_update_stock_on_purchases()
    RETURNS TRIGGER AS $$
    DECLARE
      current_schema TEXT := TG_TABLE_SCHEMA;
    BEGIN
      IF (TG_OP = 'INSERT') THEN
        EXECUTE format('
          UPDATE %I.products 
          SET stock_qty = stock_qty + $1,
              cost_price = CASE WHEN (stock_qty + $1) > 0 THEN ((cost_price * stock_qty) + ($2 * $1)) / (stock_qty + $1) ELSE $2 END,
              updated_at = now()
          WHERE id = $3', current_schema)
        USING NEW.qty, NEW.unit_cost, NEW.product_id;
        RETURN NEW;
      ELSIF (TG_OP = 'UPDATE') THEN
        EXECUTE format('UPDATE %I.products SET stock_qty = stock_qty - $1 + $2, updated_at = now() WHERE id = $3', current_schema)
        USING OLD.qty, NEW.qty, NEW.product_id;
        RETURN NEW;
      ELSIF (TG_OP = 'DELETE') THEN
        EXECUTE format('UPDATE %I.products SET stock_qty = stock_qty - $1, updated_at = now() WHERE id = $2', current_schema)
        USING OLD.qty, OLD.product_id;
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await sql(`DROP TRIGGER IF EXISTS trg_update_stock_purchases ON "${schemaName}".purchase_items`);
  await sql(`
    CREATE TRIGGER trg_update_stock_purchases
    AFTER INSERT OR UPDATE OR DELETE ON "${schemaName}".purchase_items
    FOR EACH ROW EXECUTE FUNCTION "${schemaName}".fn_update_stock_on_purchases();
  `);

  // 4. إدخال التصنيفات الافتراضية للمصاريف الخاصة بهذه السكيما
  await sql(`
    INSERT INTO "${schemaName}".expense_categories (name)
    VALUES
      ('رواتب'), ('إيجار'), ('مرافق'), ('مواصلات'), ('صيانة'), ('مشتريات مكتبية'), ('تسويق'), ('أخرى')
    ON CONFLICT (name) DO NOTHING
  `);

  return { success: true, message: `Database schema '${schemaName}' initialized and isolated ERP Triggers applied successfully.` };
}

export default { getDb, initializeDatabase };
