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

  // جدول المنتجات المطور مع ميزة تتبع الحد الأدنى ومؤشرات الكميات المخزنية
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

  // جدول العملاء مع ميزان الحساب التلقائي والمديونيات
  await sql(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      tax_id TEXT,
      credit_limit NUMERIC(12,2) DEFAULT 0,
      current_balance NUMERIC(12,2) DEFAULT 0.00, -- لمعرفة ديونهم الحالية لصالحنا (+)
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // جدول الموردين مع ميزان الحساب التلقائي ومستحقاتهم المالية
  await sql(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".suppliers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      tax_id TEXT,
      credit_limit NUMERIC(12,2) DEFAULT 0,
      current_balance NUMERIC(12,2) DEFAULT 0.00, -- لمعرفة مستحقاتهم المالية المترتبة علينا (+)
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // جدول تدفقات الصندوق وحركة الخزينة (الصادر والوارد)
  await sql(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".cash_flow (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')), -- IN: وارد مالي (مبيعات)، OUT: صادر مالي (مشتريات ومصاريف)
      amount NUMERIC(12,2) NOT NULL,
      source_type TEXT NOT NULL, -- 'invoice', 'purchase', 'expense', 'manual_adjustment'
      reference_id UUID, -- معرف الفاتورة أو عملية الشراء المرتبطة بالحركة المالي
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

  // جدول فواتير المشتريات المطور
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

  // جدول المصروفات المطور مع ميزة تتبع الصندوق المالية
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

  // 3. إنشاء الفهارس لضمان سرعة معالجة البيانات الفائقة (Indexes Optimization)
  await sql(`CREATE INDEX IF NOT EXISTS "idx_prod_bar_${schemaName}" ON "${schemaName}".products(barcode)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_prod_cat_${schemaName}" ON "${schemaName}".products(category)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_cust_${schemaName}" ON "${schemaName}".invoices(customer_id)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_stat_${schemaName}" ON "${schemaName}".invoices(status)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_inv_created_${schemaName}" ON "${schemaName}".invoices(created_at DESC)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_users_email_${schemaName}" ON "${schemaName}".users(email)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_wa_status_${schemaName}" ON "${schemaName}".whatsapp_queue(status)`);
  await sql(`CREATE INDEX IF NOT EXISTS "idx_cash_flow_ref_${schemaName}" ON "${schemaName}".cash_flow(reference_id)`);

  // 4. إدخال التصنيفات الافتراضية للمصاريف الخاصة بهذه السكيما
  await sql(`
    INSERT INTO "${schemaName}".expense_categories (name)
    VALUES
      ('رواتب'), ('إيجار'), ('مرافق'), ('مواصلات'), ('صيانة'), ('مشتريات مكتبية'), ('تسويق'), ('أخرى')
    ON CONFLICT (name) DO NOTHING
  `);

  return { success: true, message: `Database schema '${schemaName}' initialized and standardized successfully.` };
}

// ========================================================
// محرك العمليات الحسابية المتكامل للـ ERP والحركات المترابطة
// ========================================================

/**
 * 1. إضافة منتج جديد
 * ينشأ تلقائياً في المخزن بقيمة صفر، ويكون متاحاً فوراً
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
 * 2. تسجيل "فاتورة شراء جديدة" كعملية حسابية متكاملة (Transactional Process)
 * - تسجيل الفاتورة في purchases وتفاصيلها في purchase_items.
 * - زيادة كمية المنتج في products تلقائياً وتحديث "سعر الشراء الأخير".
 * - إذا كانت الفاتورة آجل (وجود متبقي)، يتم زيادة حساب المورد في suppliers تلقائياً.
 * - إذا تم دفع مبلغ كاش، يتم تسجيل حركة مالية خارجة (OUT) في جدول cash_flow فوراً.
 */
export async function processPurchaseInvoice(schemaName, purchaseData, items) {
  const sql = getDb(schemaName);
  
  // نستخدم المعاملات لضمان عدم تجزئة العملية الحسابية أو حدوث خلل في الميزان في حال الفشل
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
    const remaining = Number(invoice.remaining_amount);

    // ب) معالجة تفاصيل بنود الفاتورة وتأثيرها على المخزن
    for (const item of items) {
      // إدخال تفاصيل الصنف بالكامل
      await sql(`
        INSERT INTO "${schemaName}".purchase_items 
          (purchase_id, product_id, name, qty, unit_cost, total)
        VALUES 
          ($1, $2, $3, $4, $5, $6)
      `, [invoice.id, item.product_id, item.name, item.qty, item.unit_cost, item.total]);

      // زيادة كمية المنتج وتحديث سعر التكلفة فورياً بأحدث سعر شراء
      await sql(`
        UPDATE "${schemaName}".products
        SET 
          stock_qty = stock_qty + $1,
          cost_price = $2,
          updated_at = now()
        WHERE id = $3
      `, [item.qty, item.unit_cost, item.product_id]);
    }

    // ج) إذا كانت الفاتورة آجل (وجود متبقي)، يتم زيادة رصيد المورد المالي دائنًا لنا
    if (remaining > 0 && supplier_id) {
      await sql(`
        UPDATE "${schemaName}".suppliers
        SET current_balance = current_balance + $1
        WHERE id = $2
      `, [remaining, supplier_id]);
    }

    // د) تسجيل حركة الخزينة (الصندوق) إذا تم دفع مبلغ كاش فوراً
    if (paid_amount > 0) {
      await sql(`
        INSERT INTO "${schemaName}".cash_flow 
          (type, amount, source_type, reference_id, description)
        VALUES 
          ('OUT', $1, 'purchase', $2, $3)
      `, [paid_amount, invoice.id, `فاتورة شراء رقم ${purchase_number}`]);
    }

    await sql('COMMIT');
    return invoice;
  } catch (error) {
    await sql('ROLLBACK');
    throw error;
  }
}

/**
 * 3. تسجيل "فاتورة بيع جديدة" كعملية حسابية متكاملة (Transactional Process)
 * - تسجيل الفاتورة في sales (invoices) وتفاصيلها في sale_items (invoice_items).
 * - خفض كمية المنتج في products تلقائياً (المخزن).
 * - إذا كانت الفاتورة آجل (متبقي)، يتم زيادة ديون العميل في customers تلقائياً.
 * - إذا تم دفع كاش، يتم تسجيل حركة مالية داخلة (IN) في جدول cash_flow فوراً.
 */
export async function processSaleInvoice(schemaName, saleData, items) {
  const sql = getDb(schemaName);

  try {
    await sql('BEGIN');

    const { invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes } = saleData;

    // أ) إدخال رأس فاتورة المبيعات
    const invoiceResult = await sql(`
      INSERT INTO "${schemaName}".invoices 
        (invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [invoice_number, customer_id, status || 'paid', subtotal, discount_amt || 0, tax_rate || 0, tax_amt || 0, total_amount, paid_amount || 0, payment_method || 'cash', notes]);

    const invoice = invoiceResult[0];
    const remaining = Number(invoice.remaining_amount);

    // ب) معالجة تفاصيل بنود الفاتورة وتأثيرها على المخزن
    for (const item of items) {
      // إدخال تفاصيل بنود البيع
      await sql(`
        INSERT INTO "${schemaName}".invoice_items 
          (invoice_id, product_id, name, qty, unit_price, discount, total)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7)
      `, [invoice.id, item.product_id, item.name, item.qty, item.unit_price, item.discount || 0, item.total]);

      // خصم الكمية المباعة من المخزون فوراً
      await sql(`
        UPDATE "${schemaName}".products
        SET 
          stock_qty = stock_qty - $1,
          updated_at = now()
        WHERE id = $2
      `, [item.qty, item.product_id]);
    }

    // ج) إذا كانت الفاتورة آجل (وجود متبقي)، يتم زيادة ديون العميل المستحقة لنا مدينًا (+)
    if (remaining > 0 && customer_id) {
      await sql(`
        UPDATE "${schemaName}".customers
        SET current_balance = current_balance + $1
        WHERE id = $2
      `, [remaining, customer_id]);
    }

    // د) تسجيل حركة خزينة الصندوق الفورية للوارد المالي المدفوع
    if (paid_amount > 0) {
      await sql(`
        INSERT INTO "${schemaName}".cash_flow 
          (type, amount, source_type, reference_id, description)
        VALUES 
          ('IN', $1, 'invoice', $2, $3)
      `, [paid_amount, invoice.id, `فاتورة مبيعات رقم ${invoice_number}`]);
    }

    await sql('COMMIT');
    return invoice;
  } catch (error) {
    await sql('ROLLBACK');
    throw error;
  }
}

/**
 * 4. استعلام التقارير الموحد والذكي (Aggregations)
 * استدعاء مجمع وسريع يقرأ إجمالي المبيعات، المشتريات، الخزينة الحالية، والمصروفات المسجلة في استعلام واحد متقن.
 */
export async function getUnifiedDashboardReport(schemaName) {
  const sql = getDb(schemaName);

  const reportResult = await sql(`
    SELECT 
      -- إجمالي المبيعات المحققة
      COALESCE(SUM(i.total_amount), 0) AS total_sales,
      COALESCE(SUM(i.paid_amount), 0) AS total_sales_collected,
      COALESCE(SUM(i.remaining_amount), 0) AS total_customer_debts,
      
      -- إجمالي المشتريات
      (SELECT COALESCE(SUM(total_amount), 0) FROM "${schemaName}".purchases) AS total_purchases,
      (SELECT COALESCE(SUM(paid_amount), 0) FROM "${schemaName}".purchases) AS total_purchases_paid,
      (SELECT COALESCE(SUM(remaining_amount), 0) FROM "${schemaName}".purchases) AS total_supplier_credits,

      -- إجمالي المصاريف العامة
      (SELECT COALESCE(SUM(amount), 0) FROM "${schemaName}".expenses) AS total_expenses,

      -- الميزان الحالي المتوفر بالخزينة (جميع المدخولات ناقص جميع المدفوعات)
      (
        SELECT COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE -amount END), 0)
        FROM "${schemaName}".cash_flow
      ) AS net_cash_on_hand

    FROM "${schemaName}".invoices i
  `);

  return reportResult[0];
}

// تصدير كافة الوظائف البرمجية والنظامية بشكل موحد
export default { 
  getDb, 
  initializeDatabase, 
  createProduct, 
  processPurchaseInvoice, 
  processSaleInvoice, 
  getUnifiedDashboardReport 
};
