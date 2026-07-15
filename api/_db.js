import { neon } from '@neondatabase/serverless';

/**
 * Database connection helper for Vercel Serverless Functions
 * Uses Neon serverless PostgreSQL with dynamic schema routing
 * Default schema is set to 'pos' as requested
 */

const dbConnections = {};

/**
 * جلب اتصال قاعدة البيانات مع توجيه السكيما ديناميكياً
 */
export function getDb(schemaName = 'pos') {
  const safeSchema = schemaName.replace(/[^a-zA-Z0-9_]/g, '');
  
  if (dbConnections[safeSchema]) {
    return dbConnections[safeSchema];
  }

  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const url = new URL(connectionString);
  // توجيه الاستعلامات تلقائياً إلى الـ Schema المحددة في قاعدة البيانات
  url.searchParams.set('options', `-c search_path=${safeSchema}`);

  dbConnections[safeSchema] = neon(url.toString());
  return dbConnections[safeSchema];
}

/**
 * دالة تهيئة السكيما، إنشاء كافة جداول النظام، وحقن تريجرز تحديث المخزن تلقائياً
 */
export async function initializeDatabase(schemaName = 'pos') {
  const safeSchema = schemaName.replace(/[^a-zA-Z0-9_]/g, '');
  const sql = getDb(safeSchema);

  try {
    // 1. إنشاء السكيما (إن لم تكن موجودة) لضمان حظر أخطاء الفقدان
    await sql(`CREATE SCHEMA IF NOT EXISTS "${safeSchema}"`);

    // 2. إنشاء الجداول الأساسية داخل السكيما المحددة بالتتابع
    
    // أ. جدول المستخدمين
    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".users (
        id UUID PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT now()
      )
    `);

    // ب. جدول العملاء
    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".customers (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        tax_id VARCHAR(100),
        credit_limit NUMERIC(15, 2) DEFAULT 0.00,
        current_balance NUMERIC(15, 2) DEFAULT 0.00,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);

    // ج. جدول الموردين
    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".suppliers (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        tax_id VARCHAR(100),
        credit_limit NUMERIC(15, 2) DEFAULT 0.00,
        current_balance NUMERIC(15, 2) DEFAULT 0.00,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);

    // د. جدول المنتجات
    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".products (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        barcode VARCHAR(100) UNIQUE,
        category VARCHAR(100) DEFAULT 'عام',
        unit VARCHAR(50) DEFAULT 'قطعة',
        cost_price NUMERIC(15, 2) DEFAULT 0.00,
        sell_price NUMERIC(15, 2) DEFAULT 0.00,
        stock_qty INT DEFAULT 0,
        min_stock_qty INT DEFAULT 5,
        is_active BOOLEAN DEFAULT true,
        image_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `);

    // هـ. جدول فواتير المبيعات (رأس الفاتورة)
    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number VARCHAR(100) UNIQUE NOT NULL,
        customer_id UUID REFERENCES "${safeSchema}".customers(id) ON DELETE SET NULL,
        status VARCHAR(50) DEFAULT 'paid',
        subtotal NUMERIC(15, 2) DEFAULT 0.00,
        discount_amt NUMERIC(15, 2) DEFAULT 0.00,
        tax_rate NUMERIC(5, 2) DEFAULT 0.00,
        tax_amt NUMERIC(15, 2) DEFAULT 0.00,
        total_amount NUMERIC(15, 2) DEFAULT 0.00,
        paid_amount NUMERIC(15, 2) DEFAULT 0.00,
        remaining_amount NUMERIC(15, 2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
        payment_method VARCHAR(50) DEFAULT 'cash',
        notes TEXT,
        created_at TIMESTAMP DEFAULT now()
      )
    `);

    // و. تفاصيل بنود الفاتورة
    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".invoice_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id UUID REFERENCES "${safeSchema}".invoices(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${safeSchema}".products(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        qty INT NOT NULL,
        unit_price NUMERIC(15, 2) NOT NULL,
        discount NUMERIC(15, 2) DEFAULT 0.00,
        total NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT now()
      )
    `);

    // ز. جدول فواتير المشتريات (رأس الفاتورة)
    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".purchases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        purchase_number VARCHAR(100) UNIQUE NOT NULL,
        supplier_id UUID REFERENCES "${safeSchema}".suppliers(id) ON DELETE SET NULL,
        status VARCHAR(50) DEFAULT 'received',
        subtotal NUMERIC(15, 2) DEFAULT 0.00,
        discount_amt NUMERIC(15, 2) DEFAULT 0.00,
        tax_amt NUMERIC(15, 2) DEFAULT 0.00,
        total_amount NUMERIC(15, 2) DEFAULT 0.00,
        paid_amount NUMERIC(15, 2) DEFAULT 0.00,
        remaining_amount NUMERIC(15, 2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
        payment_method VARCHAR(50) DEFAULT 'cash',
        notes TEXT,
        created_at TIMESTAMP DEFAULT now()
      )
    `);

    // ح. تفاصيل بند المشتريات
    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".purchase_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        purchase_id UUID REFERENCES "${safeSchema}".purchases(id) ON DELETE CASCADE,
        product_id UUID REFERENCES "${safeSchema}".products(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        qty INT NOT NULL,
        unit_cost NUMERIC(15, 2) NOT NULL,
        total NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT now()
      )
    `);

    // ط. فئات المصاريف والمصاريف
    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".expense_categories (
        id UUID PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT now()
      )
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".expenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID REFERENCES "${safeSchema}".expense_categories(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        paid_by VARCHAR(100),
        receipt_url TEXT,
        expense_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT now()
      )
    `);

    // ي. حركات الصندوق وحركات المخزن والتنبيهات
    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".cash_flow (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(10) CHECK (type IN ('IN', 'OUT')),
        amount NUMERIC(15, 2) NOT NULL,
        source_type VARCHAR(100),
        reference_id UUID,
        description TEXT,
        created_at TIMESTAMP DEFAULT now()
      )
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".inventory_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES "${safeSchema}".products(id) ON DELETE CASCADE,
        tx_type VARCHAR(20) CHECK (tx_type IN ('IN', 'OUT', 'UPDATE_IN', 'UPDATE_OUT')),
        qty INT NOT NULL,
        reference_id UUID,
        notes TEXT,
        created_at TIMESTAMP DEFAULT now()
      )
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS "${safeSchema}".whatsapp_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        template_name VARCHAR(100),
        template_params JSONB,
        status VARCHAR(20) DEFAULT 'pending',
        error_message TEXT,
        sent_at TIMESTAMP,
        created_by UUID,
        created_at TIMESTAMP DEFAULT now()
      )
    `);

    // -----------------------------------------------------------------
    // 3. حقن التريجرز والـ Functions في السكيما تلقائياً لحسابات المخزن
    // -----------------------------------------------------------------

    // أ. دالة وتريجر تحديث المخزن بمبيعات الفواتير
    await sql(`
      CREATE OR REPLACE FUNCTION "${safeSchema}".update_stock_on_invoice_item()
      RETURNS TRIGGER AS $$
      BEGIN
          IF (TG_OP = 'INSERT') THEN
              UPDATE "${safeSchema}".products SET stock_qty = stock_qty - NEW.qty WHERE id = NEW.product_id;
              INSERT INTO "${safeSchema}".inventory_transactions (id, product_id, tx_type, qty, reference_id, notes)
              VALUES (gen_random_uuid(), NEW.product_id, 'OUT', NEW.qty, NEW.invoice_id, 'مبيعات - فاتورة رقم: ' || NEW.invoice_id);
          ELSIF (TG_OP = 'UPDATE') THEN
              UPDATE "${safeSchema}".products SET stock_qty = stock_qty + OLD.qty - NEW.qty WHERE id = NEW.product_id;
              INSERT INTO "${safeSchema}".inventory_transactions (id, product_id, tx_type, qty, reference_id, notes)
              VALUES (gen_random_uuid(), NEW.product_id, 'UPDATE_OUT', NEW.qty, NEW.invoice_id, 'تعديل كمية فاتورة');
          ELSIF (TG_OP = 'DELETE') THEN
              UPDATE "${safeSchema}".products SET stock_qty = stock_qty + OLD.qty WHERE id = OLD.product_id;
              INSERT INTO "${safeSchema}".inventory_transactions (id, product_id, tx_type, qty, reference_id, notes)
              VALUES (gen_random_uuid(), OLD.product_id, 'IN', OLD.qty, OLD.invoice_id, 'إلغاء بند أو حذف الفاتورة');
          END IF;
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sql(`
      DROP TRIGGER IF EXISTS trg_update_stock_on_invoice_item ON "${safeSchema}".invoice_items;
      CREATE TRIGGER trg_update_stock_on_invoice_item
      AFTER INSERT OR UPDATE OR DELETE ON "${safeSchema}".invoice_items
      FOR EACH ROW EXECUTE FUNCTION "${safeSchema}".update_stock_on_invoice_item();
    `);

    // ب. دالة وتريجر تحديث المخزن بمشتريات الفواتير الموردة
    await sql(`
      CREATE OR REPLACE FUNCTION "${safeSchema}".update_stock_on_purchase_item()
      RETURNS TRIGGER AS $$
      BEGIN
          IF (TG_OP = 'INSERT') THEN
              UPDATE "${safeSchema}".products SET stock_qty = stock_qty + NEW.qty WHERE id = NEW.product_id;
              INSERT INTO "${safeSchema}".inventory_transactions (id, product_id, tx_type, qty, reference_id, notes)
              VALUES (gen_random_uuid(), NEW.product_id, 'IN', NEW.qty, NEW.purchase_id, 'مشتريات واردة - فاتورة رقم: ' || NEW.purchase_id);
          ELSIF (TG_OP = 'UPDATE') THEN
              UPDATE "${safeSchema}".products SET stock_qty = stock_qty - OLD.qty + NEW.qty WHERE id = NEW.product_id;
              INSERT INTO "${safeSchema}".inventory_transactions (id, product_id, tx_type, qty, reference_id, notes)
              VALUES (gen_random_uuid(), NEW.product_id, 'UPDATE_IN', NEW.qty, NEW.purchase_id, 'تعديل فاتورة مشتريات');
          ELSIF (TG_OP = 'DELETE') THEN
              UPDATE "${safeSchema}".products SET stock_qty = stock_qty - OLD.qty WHERE id = OLD.product_id;
              INSERT INTO "${safeSchema}".inventory_transactions (id, product_id, tx_type, qty, reference_id, notes)
              VALUES (gen_random_uuid(), OLD.product_id, 'OUT', OLD.qty, OLD.purchase_id, 'إلغاء بند أو حذف مشتريات');
          END IF;
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sql(`
      DROP TRIGGER IF EXISTS trg_update_stock_on_purchase_item ON "${safeSchema}".purchase_items;
      CREATE TRIGGER trg_update_stock_on_purchase_item
      AFTER INSERT OR UPDATE OR DELETE ON "${safeSchema}".purchase_items
      FOR EACH ROW EXECUTE FUNCTION "${safeSchema}".update_stock_on_purchase_item();
    `);

    return { success: true, message: `Schema ${safeSchema} initialized with tables and triggers successfully.` };
  } catch (error) {
    console.error(`Error initializing schema ${safeSchema}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * 1. إضافة منتج جديد
 */
export async function createProduct(schemaName = 'pos', productData) {
  const sql = getDb(schemaName);
  const { name, barcode, category, unit, sell_price, cost_price, min_stock_qty, notes, image_url } = productData;
  const pId = crypto.randomUUID();

  const results = await sql(`
    INSERT INTO "${schemaName}".products 
      (id, name, barcode, category, unit, cost_price, sell_price, stock_qty, min_stock_qty, notes, image_url)
    VALUES 
      ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10)
    RETURNING *
  `, [
    pId,
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
 * 2. إضافة ومعالجة فاتورة شراء (مع بنودها)
 */
export async function processPurchaseInvoice(schemaName = 'pos', purchaseData, items) {
  const sql = getDb(schemaName);
  
  try {
    const { purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes } = purchaseData;
    const purId = crypto.randomUUID();

    // 1. حفظ رأس الفاتورة
    const purchaseResult = await sql(`
      INSERT INTO "${schemaName}".purchases 
        (id, purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [purId, purchase_number, supplier_id, status || 'received', subtotal, discount_amt || 0, tax_amt || 0, total_amount, paid_amount || 0, payment_method || 'cash', notes]);

    const invoice = purchaseResult[0];

    // 2. حفظ البنود التفصيلية (سيتولى التريجر تحديث المخزن تلقائياً)
    for (const item of items) {
      const itemId = crypto.randomUUID();
      await sql(`
        INSERT INTO "${schemaName}".purchase_items 
          (id, purchase_id, product_id, name, qty, unit_cost, total)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7)
      `, [itemId, invoice.id, item.product_id, item.name, item.qty, item.unit_cost, item.total]);
    }

    return invoice;
  } catch (error) {
    throw error;
  }
}

/**
 * 3. إضافة ومعالجة فاتورة بيع (مع بنودها)
 */
export async function processSaleInvoice(schemaName = 'pos', saleData, items) {
  const sql = getDb(schemaName);

  try {
    const { invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes } = saleData;
    const invId = crypto.randomUUID();

    // 1. حفظ رأس فاتورة المبيعات
    const invoiceResult = await sql(`
      INSERT INTO "${schemaName}".invoices 
        (id, invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [invId, invoice_number, customer_id, status || 'paid', subtotal, discount_amt || 0, tax_rate || 0, tax_amt || 0, total_amount, paid_amount || 0, payment_method || 'cash', notes]);

    const invoice = invoiceResult[0];

    // 2. حفظ البنود (سيتولى التريجر خصم المخزن تلقائياً وبأمان تام)
    for (const item of items) {
      const itemId = crypto.randomUUID();
      await sql(`
        INSERT INTO "${schemaName}".invoice_items 
          (id, invoice_id, product_id, name, qty, unit_price, discount, total)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [itemId, invoice.id, item.product_id, item.name, item.qty, item.unit_price, item.discount || 0, item.total]);
    }

    return invoice;
  } catch (error) {
    throw error;
  }
}

/**
 * 4. استعلام التقارير المجمع للـ Dashboard
 */
export async function getUnifiedDashboardReport(schemaName = 'pos') {
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
