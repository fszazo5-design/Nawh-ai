import { neon } from '@neondatabase/serverless';

/**
 * Database connection helper for Vercel Serverless Functions
 * Uses Neon serverless PostgreSQL with dynamic schema routing
 */

const dbConnections = {};

export function getDb(schemaName = 'public') {
  if (dbConnections[schemaName]) {
    return dbConnections[schemaName];
  }

  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const url = new URL(connectionString);
  url.searchParams.set('options', `-c search_path=${schemaName}`);

  dbConnections[schemaName] = neon(url.toString());
  return dbConnections[schemaName];
}

/**
 * Initialize database tables, functions, and triggers inside a specific schema
 */
export async function initializeDatabase(schemaName = 'public') {
  const sql = getDb(schemaName);

  // 1. إنشاء السكيما
  await sql(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // 2. بناء الجداول الأساسية
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
      min_stock_qty NUMERIC(12,3) DEFAULT 5,
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
      current_balance NUMERIC(12,2) DEFAULT 0.00, -- ديون العميل لنا
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
      current_balance NUMERIC(12,2) DEFAULT 0.00, -- مستحقات المورد علينا
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await sql(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".cash_flow (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
      amount NUMERIC(12,2) NOT NULL,
      source_type TEXT NOT NULL, -- 'invoice', 'purchase', 'expense', 'manual_adjustment'
      reference_id UUID,
      description TEXT,
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

  // جدول فواتير المبيعات
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
      remaining_amount NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
      payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer', 'credit')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  
  await sql(`ALTER TABLE "${schemaName}".invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key`);
  await sql(`ALTER TABLE "${schemaName}".invoices ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number)`);

  // تفاصيل فواتير المبيعات
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

  // جدول فواتير المشتريات
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
      remaining_amount NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
      payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'transfer', 'credit')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  
  await sql(`ALTER TABLE "${schemaName}".purchases DROP CONSTRAINT IF EXISTS purchases_purchase_number_key`);
  await sql(`ALTER TABLE "${schemaName}".purchases ADD CONSTRAINT purchases_purchase_number_key UNIQUE (purchase_number)`);

  // تفاصيل فواتير المشتريات
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

  // جدول المصروفات وجداول المزامنة المتبقية
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

  // إنشاء الفهارس
  await sql(`CREATE INDEX IF NOT EXISTS "idx_prod_bar_${schemaName}" ON "${schemaName}".products(barcode)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_prod_cat_${schemaName}" ON "${schemaName}".products(category)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_cust_${schemaName}" ON "${schemaName}".invoices(customer_id)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_stat_${schemaName}" ON "${schemaName}".invoices(status)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_created_${schemaName}" ON "${schemaName}".invoices(created_at DESC)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_users_email_${schemaName}" ON "${schemaName}".users(email)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_wa_status_${schemaName}" ON "${schemaName}".whatsapp_queue(status)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_cash_flow_ref_${schemaName}" ON "${schemaName}".cash_flow(reference_id)`);

  // =========================================================================
  // بناء محرك العمليات الحسابية والترابط الذكي اللحظي (PL/pgSQL Trigger Functions)
  // =========================================================================

  // أ. إنشاء لغة البرمجة الإجرائية PL/pgSQL إذا لم تكن مفعلة
  await sql(`CREATE EXTENSION IF NOT EXISTS plpgsql`);

  // ب. دالة ترجر فواتير المشتريات (تحديث مخزن، ميزان موردين، وصندوق الخزينة تلقائياً)
  await sql(`
    CREATE OR REPLACE FUNCTION "${schemaName}".fn_trg_process_purchase_items()
    RETURNS TRIGGER AS $$
    DECLARE
      p_total_amount NUMERIC(12,2);
      p_paid_amount NUMERIC(12,2);
      p_remaining_amount NUMERIC(12,2);
      p_supplier_id UUID;
      p_purchase_number TEXT;
    BEGIN
      -- جلب معلومات رأس فاتورة المشتريات الحالية للتحقق من المبالغ المدفوعة والمتبقية
      SELECT total_amount, paid_amount, remaining_amount, supplier_id, purchase_number
      INTO p_total_amount, p_paid_amount, p_remaining_amount, p_supplier_id, p_purchase_number
      FROM "${schemaName}".purchases WHERE id = NEW.purchase_id;

      -- 1. زيادة كمية المنتج تلقائياً في المخازن وتحديث "آخر سعر شراء" للمنتج
      UPDATE "${schemaName}".products
      SET 
        stock_qty = stock_qty + NEW.qty,
        cost_price = NEW.unit_cost,
        updated_at = now()
      WHERE id = NEW.product_id;

      -- 2. في حال إدخال أول عنصر بالعملية (الترجر يعمل لكل بند)
      -- نتحقق من عدم تكرار تسجيل كاش الصندوق أو الموردين لنفس الفاتورة
      IF NOT EXISTS (SELECT 1 FROM "${schemaName}".cash_flow WHERE reference_id = NEW.purchase_id) THEN
        
        -- تسجيل حركة الخزينة الخارجة (OUT) بالمبلغ الكاش المدفوع
        IF p_paid_amount > 0 THEN
          INSERT INTO "${schemaName}".cash_flow (type, amount, source_type, reference_id, description)
          VALUES ('OUT', p_paid_amount, 'purchase', NEW.purchase_id, 'دفع نقدي لفاتورة شراء رقم: ' || p_purchase_number);
        END IF;

        -- زيادة مستحقات المورد الحالية في حسابه إذا كانت الفاتورة تحتوي متبقي (آجل)
        IF p_remaining_amount > 0 AND p_supplier_id IS NOT NULL THEN
          UPDATE "${schemaName}".suppliers
          SET current_balance = current_balance + p_remaining_amount
          WHERE id = p_supplier_id;
        END IF;

      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ربط الدالة بجدول بنود المشتريات
  await sql(`DROP TRIGGER IF EXISTS trg_after_purchase_item_insert ON "${schemaName}".purchase_items`);
  await sql(`
    CREATE TRIGGER trg_after_purchase_item_insert
    AFTER INSERT ON "${schemaName}".purchase_items
    FOR EACH ROW
    EXECUTE FUNCTION "${schemaName}".fn_trg_process_purchase_items();
  `);


  // ج. دالة ترجر فواتير المبيعات (خصم المخزن، ميزان عملاء، ووارد الخزينة تلقائياً)
  await sql(`
    CREATE OR REPLACE FUNCTION "${schemaName}".fn_trg_process_sale_items()
    RETURNS TRIGGER AS $$
    DECLARE
      s_total_amount NUMERIC(12,2);
      s_paid_amount NUMERIC(12,2);
      s_remaining_amount NUMERIC(12,2);
      s_customer_id UUID;
      s_invoice_number TEXT;
    BEGIN
      -- جلب معلومات رأس فاتورة المبيعات للتعامل المالي التلقائي
      SELECT total_amount, paid_amount, remaining_amount, customer_id, invoice_number
      INTO s_total_amount, s_paid_amount, s_remaining_amount, s_customer_id, s_invoice_number
      FROM "${schemaName}".invoices WHERE id = NEW.invoice_id;

      -- 1. خصم كمية المنتج تلقائياً من المخزون
      UPDATE "${schemaName}".products
      SET 
        stock_qty = stock_qty - NEW.qty,
        updated_at = now()
      WHERE id = NEW.product_id;

      -- 2. في حال إدخال أول بند، نسجل الحسابات والتدفق المالي لمنع تكرار الحركة مع باقي بنود نفس الفاتورة
      IF NOT EXISTS (SELECT 1 FROM "${schemaName}".cash_flow WHERE reference_id = NEW.invoice_id) THEN
        
        -- تسجيل حركة الخزينة الداخلة (IN) بالمبلغ المقبوض
        IF s_paid_amount > 0 THEN
          INSERT INTO "${schemaName}".cash_flow (type, amount, source_type, reference_id, description)
          VALUES ('IN', s_paid_amount, 'invoice', NEW.invoice_id, 'تحصيل نقدي لفاتورة مبيعات رقم: ' || s_invoice_number);
        END IF;

        -- زيادة مديونية العميل الحالية في حسابه إذا كان هناك مبلغ متبقي (آجل)
        IF s_remaining_amount > 0 AND s_customer_id IS NOT NULL THEN
          UPDATE "${schemaName}".customers
          SET current_balance = current_balance + s_remaining_amount
          WHERE id = s_customer_id;
        END IF;

      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ربط الدالة بجدول بنود المبيعات
  await sql(`DROP TRIGGER IF EXISTS trg_after_sale_item_insert ON "${schemaName}".invoice_items`);
  await sql(`
    CREATE TRIGGER trg_after_sale_item_insert
    AFTER INSERT ON "${schemaName}".invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION "${schemaName}".fn_trg_process_sale_items();
  `);

  // د. إدخال تصنيفات المصاريف الافتراضية
  await sql(`
    INSERT INTO "${schemaName}".expense_categories (name)
    VALUES
      ('رواتب'), ('إيجار'), ('مرافق'), ('مواصلات'), ('صيانة'), ('مشتريات مكتبية'), ('تسويق'), ('أخرى')
    ON CONFLICT (name) DO NOTHING
  `);

  return { success: true, message: `Database schema '${schemaName}' initialized with Global Autopilot Database Triggers.` };
}

// ========================================================
// واجهة الـ API للتعامل الآمن مع العمليات عبر Node.js
// ========================================================

/**
 * 1. إضافة منتج جديد
 */
export async function createProduct(schemaName, productData) {
  const sql = getDb(schemaName);
  const { name, barcode, category, unit, sell_price, cost_price, min_stock_qty, notes, image_url } = productData;

  const results = await sql(`
    INSERT INTO "${schemaName}".products 
      (name, barcode, category, unit, cost_price, sell_price, stock_qty, min_stock_qty, notes, image_url)
    VALUES 
      ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9)
    RETURNING *
  `, [
    name, 
    barcode || null, 
    category || 'عام', 
    unit || 'قطعة', 
    cost_price || 0, 
    sell_price || 0, 
    min_stock_qty || 5, 
    notes || '', 
    image_url || null
  ]);

  return results[0];
}

/**
 * 2. إضافة فاتورة شراء
 * بمجرد إدراج الرأس والبنود بداخل ترانزاكشن واحد، ستقوم قاعدة البيانات (Trigger) بتحديث المخازن، حساب المورد، والصندوق تلقائياً.
 */
export async function processPurchaseInvoice(schemaName, purchaseData, items) {
  const sql = getDb(schemaName);
  
  try {
    await sql('BEGIN');

    const { purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes } = purchaseData;

    // أ) إدخال رأس الفاتورة
    const purchaseResult = await sql(`
      INSERT INTO "${schemaName}".purchases 
        (purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [purchase_number, supplier_id, status || 'received', subtotal, discount_amt || 0, tax_amt || 0, total_amount, paid_amount || 0, payment_method || 'cash', notes]);

    const invoice = purchaseResult[0];

    // ب) إدخال تفاصيل الأصناف (وسيقوم الـ Trigger في الخلفية بكافة الحسابات المخزنية والمالية)
    for (const item of items) {
      await sql(`
        INSERT INTO "${schemaName}".purchase_items 
          (purchase_id, product_id, name, qty, unit_cost, total)
        VALUES 
          ($1, $2, $3, $4, $5, $6)
      `, [invoice.id, item.product_id, item.name, item.qty, item.unit_cost, item.total]);
    }

    await sql('COMMIT');
    return invoice;
  } catch (error) {
    await sql('ROLLBACK');
    throw error;
  }
}

/**
 * 3. إضافة فاتورة بيع
 * بمجرد إدراج الرأس والبنود، سيتولى الـ Trigger خصم المخزون، وتحديث ديون العميل، وتسجيل الوارد بالخزينة تلقائياً.
 */
export async function processSaleInvoice(schemaName, saleData, items) {
  const sql = getDb(schemaName);

  try {
    await sql('BEGIN');

    const { invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes } = saleData;

    // أ) إدخال رأس الفاتورة
    const invoiceResult = await sql(`
      INSERT INTO "${schemaName}".invoices 
        (invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [invoice_number, customer_id, status || 'paid', subtotal, discount_amt || 0, tax_rate || 0, tax_amt || 0, total_amount, paid_amount || 0, payment_method || 'cash', notes]);

    const invoice = invoiceResult[0];

    // ب) إدخال تفاصيل الأصناف (وسيقوم الـ Trigger بالخصم والتسجيل التلقائي في الخزينة والعملاء)
    for (const item of items) {
      await sql(`
        INSERT INTO "${schemaName}".invoice_items 
          (invoice_id, product_id, name, qty, unit_price, discount, total)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7)
      `, [invoice.id, item.product_id, item.name, item.qty, item.unit_price, item.discount || 0, item.total]);
    }

    await sql('COMMIT');
    return invoice;
  } catch (error) {
    await sql('ROLLBACK');
    throw error;
  }
}

/**
 * 4. استعلام التقارير المجمع الذكي والمثالي لسرعة الأداء
 */
export async function getUnifiedDashboardReport(schemaName) {
  const sql = getDb(schemaName);

  const reportResult = await sql(`
    SELECT 
      COALESCE(SUM(i.total_amount), 0) AS total_sales,
      COALESCE(SUM(i.paid_amount), 0) AS total_sales_collected,
      COALESCE(SUM(i.remaining_amount), 0) AS total_customer_debts,
      
      (SELECT COALESCE(SUM(total_amount), 0) FROM "${schemaName}".purchases) AS total_purchases,
      (SELECT COALESCE(SUM(paid_amount), 0) FROM "${schemaName}".purchases) AS total_purchases_paid,
      (SELECT COALESCE(SUM(remaining_amount), 0) FROM "${schemaName}".purchases) AS total_supplier_credits,

      (SELECT COALESCE(SUM(amount), 0) FROM "${schemaName}".expenses) AS total_expenses,

      (
        SELECT COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE -amount END), 0)
        FROM "${schemaName}".cash_flow
      ) AS net_cash_on_hand

    FROM "${schemaName}".invoices i
  `);

  return reportResult[0];
}

export default { 
  getDb, 
  initializeDatabase, 
  createProduct, 
  processPurchaseInvoice, 
  processSaleInvoice, 
  getUnifiedDashboardReport 
};
