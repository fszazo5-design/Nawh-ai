import { neon } from '@neondatabase/serverless';

/**
 * Database connection helper for Vercel Serverless Functions
 * Uses Neon serverless PostgreSQL pointing directly to the standard 'public' schema
 */

let dbConnection = null;

/**
 * جلب اتصال قاعدة البيانات الافتراضي للمنصة (سكيما public)
 */
export function getDb() {
  if (dbConnection) {
    return dbConnection;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const url = new URL(connectionString);
  // تثبيت مسار البحث على public دائماً لضمان عمل التريجرز والـ Extensions بسلاسة
  url.searchParams.set('options', '-c search_path=public');

  dbConnection = neon(url.toString());
  return dbConnection;
}

/**
 * دالة تهيئة قاعدة البيانات، بناء كافة جداول ومكونات النظام مباشرة داخل public
 */
export async function initializeDatabase() {
  const sql = getDb();

  try {
    // 1. تفعيل الإضافات الأساسية داخل public
    await sql(`CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA public`);

    // 2. بناء الجداول الأساسية داخل public بالتتابع لضمان سلامة العلاقات (Foreign Keys)
    
    // أ. جدول المستخدمين (متوافق مع كود تسجيل الدخول والمنصة)
    await sql(`
      CREATE TABLE IF NOT EXISTS public.users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // ب. جدول المنتجات
    await sql(`
      CREATE TABLE IF NOT EXISTS public.products (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        barcode TEXT UNIQUE,
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

    // ج. جدول العملاء
    await sql(`
      CREATE TABLE IF NOT EXISTS public.customers (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        tax_id TEXT,
        credit_limit NUMERIC(12,2) DEFAULT 0,
        current_balance NUMERIC(12,2) DEFAULT 0.00,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // د. جدول الموردين
    await sql(`
      CREATE TABLE IF NOT EXISTS public.suppliers (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        tax_id TEXT,
        credit_limit NUMERIC(12,2) DEFAULT 0,
        current_balance NUMERIC(12,2) DEFAULT 0.00,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // هـ. جدول فواتير المبيعات
    await sql(`
      CREATE TABLE IF NOT EXISTS public.invoices (
        id UUID PRIMARY KEY,
        invoice_number TEXT UNIQUE NOT NULL,
        customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
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

    // و. تفاصيل بنود فواتير المبيعات
    await sql(`
      CREATE TABLE IF NOT EXISTS public.invoice_items (
        id UUID PRIMARY KEY,
        invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
        product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        qty NUMERIC(12,3) NOT NULL,
        unit_price NUMERIC(12,2) NOT NULL,
        discount NUMERIC(5,2) DEFAULT 0,
        total NUMERIC(12,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // ز. جدول فواتير المشتريات
    await sql(`
      CREATE TABLE IF NOT EXISTS public.purchases (
        id UUID PRIMARY KEY,
        purchase_number TEXT UNIQUE NOT NULL,
        supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
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

    // ح. تفاصيل بنود فواتير المشتريات
    await sql(`
      CREATE TABLE IF NOT EXISTS public.purchase_items (
        id UUID PRIMARY KEY,
        purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
        product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        qty NUMERIC(12,3) NOT NULL,
        unit_cost NUMERIC(12,2) NOT NULL,
        total NUMERIC(12,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // ط. تصنيفات المصاريف والمصاريف
    await sql(`
      CREATE TABLE IF NOT EXISTS public.expense_categories (
        id UUID PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS public.expenses (
        id UUID PRIMARY KEY,
        category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        paid_by TEXT,
        receipt_url TEXT,
        expense_date DATE,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // ي. حركات الصندوق وحركات المخزن
    await sql(`
      CREATE TABLE IF NOT EXISTS public.cash_flow (
        id UUID PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
        amount NUMERIC(12,2) NOT NULL,
        source_type TEXT NOT NULL,
        reference_id UUID,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS public.inventory_transactions (
        id UUID PRIMARY KEY,
        product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
        qty NUMERIC(12,3) NOT NULL,
        source_type TEXT NOT NULL,
        reference_id UUID,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // ك. طابور رسائل الواتساب
    await sql(`
      CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
        id UUID PRIMARY KEY,
        recipient TEXT NOT NULL,
        message TEXT NOT NULL,
        template_name TEXT,
        template_params JSONB,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
        error_message TEXT,
        sent_at TIMESTAMPTZ,
        created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // -----------------------------------------------------------------
    // 3. حقن وتحديث التريجرز والـ Functions والربط المباشر داخل سكيما public
    // -----------------------------------------------------------------

    // تريجر المخزون لبنود المشتريات
    await sql(`
      CREATE OR REPLACE FUNCTION public.fn_trg_inventory_purchase_items()
      RETURNS TRIGGER AS $$
      DECLARE v_diff_qty NUMERIC(12,3);
      BEGIN
          IF (TG_OP = 'INSERT') THEN
              UPDATE public.products SET stock_qty = stock_qty + NEW.qty, cost_price = NEW.unit_cost, updated_at = now() WHERE id = NEW.product_id;
              INSERT INTO public.inventory_transactions (id, product_id, type, qty, source_type, reference_id, description)
              VALUES (gen_random_uuid(), NEW.product_id, 'IN', NEW.qty, 'purchase', NEW.purchase_id, 'إضافة كمية بموجب فاتورة شراء بند: ' || NEW.name);
          ELSIF (TG_OP = 'UPDATE') THEN
              v_diff_qty := NEW.qty - OLD.qty;
              UPDATE public.products SET stock_qty = stock_qty + v_diff_qty, cost_price = NEW.unit_cost, updated_at = now() WHERE id = NEW.product_id;
              INSERT INTO public.inventory_transactions (id, product_id, type, qty, source_type, reference_id, description)
              VALUES (gen_random_uuid(), NEW.product_id, CASE WHEN v_diff_qty >= 0 THEN 'IN' ELSE 'OUT' END, ABS(v_diff_qty), 'purchase', NEW.purchase_id, 'تعديل كمية البند في المشتريات إلى: ' || NEW.qty);
          ELSIF (TG_OP = 'DELETE') THEN
              UPDATE public.products SET stock_qty = stock_qty - OLD.qty, updated_at = now() WHERE id = OLD.product_id;
              INSERT INTO public.inventory_transactions (id, product_id, type, qty, source_type, reference_id, description)
              VALUES (gen_random_uuid(), OLD.product_id, 'OUT', OLD.qty, 'purchase', OLD.purchase_id, 'حذف بند من فاتورة المشتريات: ' || OLD.name);
          END IF;
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sql(`
      DROP TRIGGER IF EXISTS trg_inventory_purchase_item_all ON public.purchase_items;
      CREATE TRIGGER trg_inventory_purchase_item_all
      AFTER INSERT OR UPDATE OR DELETE ON public.purchase_items
      FOR EACH ROW EXECUTE FUNCTION public.fn_trg_inventory_purchase_items();
    `);

    // تريجر المخزون لبنود المبيعات
    await sql(`
      CREATE OR REPLACE FUNCTION public.fn_trg_inventory_sale_items()
      RETURNS TRIGGER AS $$
      DECLARE v_diff_qty NUMERIC(12,3);
      BEGIN
          IF (TG_OP = 'INSERT') THEN
              UPDATE public.products SET stock_qty = stock_qty - NEW.qty, updated_at = now() WHERE id = NEW.product_id;
              INSERT INTO public.inventory_transactions (id, product_id, type, qty, source_type, reference_id, description)
              VALUES (gen_random_uuid(), NEW.product_id, 'OUT', NEW.qty, 'invoice', NEW.invoice_id, 'صرف كمية بموجب فاتورة مبيعات بند: ' || NEW.name);
          ELSIF (TG_OP = 'UPDATE') THEN
              v_diff_qty := NEW.qty - OLD.qty;
              UPDATE public.products SET stock_qty = stock_qty - v_diff_qty, updated_at = now() WHERE id = NEW.product_id;
              INSERT INTO public.inventory_transactions (id, product_id, type, qty, source_type, reference_id, description)
              VALUES (gen_random_uuid(), NEW.product_id, CASE WHEN v_diff_qty >= 0 THEN 'OUT' ELSE 'IN' END, ABS(v_diff_qty), 'invoice', NEW.invoice_id, 'تعديل كمية البند المباعة إلى: ' || NEW.qty);
          ELSIF (TG_OP = 'DELETE') THEN
              UPDATE public.products SET stock_qty = stock_qty + OLD.qty, updated_at = now() WHERE id = OLD.product_id;
              INSERT INTO public.inventory_transactions (id, product_id, type, qty, source_type, reference_id, description)
              VALUES (gen_random_uuid(), OLD.product_id, 'IN', OLD.qty, 'invoice', OLD.invoice_id, 'حذف بند من فاتورة المبيعات وإعادة الكمية للمخزن: ' || OLD.name);
          END IF;
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sql(`
      DROP TRIGGER IF EXISTS trg_inventory_sale_item_all ON public.invoice_items;
      CREATE TRIGGER trg_inventory_sale_item_all
      AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
      FOR EACH ROW EXECUTE FUNCTION public.fn_trg_inventory_sale_items();
    `);

    // تريجر التسويات المالية للمبيعات والخزينة وحسابات العملاء
    await sql(`
      CREATE OR REPLACE FUNCTION public.fn_trg_financial_sale_head()
      RETURNS TRIGGER AS $$
      DECLARE v_diff_paid NUMERIC(12,2) := 0; v_diff_remain NUMERIC(12,2) := 0;
      BEGIN
          IF (TG_OP = 'INSERT') THEN
              IF NEW.paid_amount > 0 THEN
                  INSERT INTO public.cash_flow (id, type, amount, source_type, reference_id, description)
                  VALUES (gen_random_uuid(), 'IN', NEW.paid_amount, 'invoice', NEW.id, 'تحصيل نقدي لفاتورة مبيعات رقم: ' || NEW.invoice_number);
              END IF;
              IF NEW.remaining_amount > 0 AND NEW.customer_id IS NOT NULL THEN
                  UPDATE public.customers SET current_balance = current_balance + NEW.remaining_amount WHERE id = NEW.customer_id;
              END IF;
          ELSIF (TG_OP = 'UPDATE') THEN
              v_diff_paid := NEW.paid_amount - OLD.paid_amount;
              IF v_diff_paid <> 0 THEN
                  INSERT INTO public.cash_flow (id, type, amount, source_type, reference_id, description)
                  VALUES (gen_random_uuid(), CASE WHEN v_diff_paid > 0 THEN 'IN' ELSE 'OUT' END, ABS(v_diff_paid), 'invoice', NEW.id, 'تعديل المبلغ المحصل لفاتورة رقم: ' || NEW.invoice_number);
              END IF;
              v_diff_remain := NEW.remaining_amount - OLD.remaining_amount;
              IF v_diff_remain <> 0 AND NEW.customer_id IS NOT NULL THEN
                  UPDATE public.customers SET current_balance = current_balance + v_diff_remain WHERE id = NEW.customer_id;
              END IF;
          ELSIF (TG_OP = 'DELETE') THEN
              IF OLD.paid_amount > 0 THEN
                  INSERT INTO public.cash_flow (id, type, amount, source_type, reference_id, description)
                  VALUES (gen_random_uuid(), 'OUT', OLD.paid_amount, 'invoice', OLD.id, 'إلغاء واسترداد دفع الفاتورة المحذوفة رقم: ' || OLD.invoice_number);
              END IF;
              IF OLD.remaining_amount > 0 AND OLD.customer_id IS NOT NULL THEN
                  UPDATE public.customers SET current_balance = current_balance - OLD.remaining_amount WHERE id = OLD.customer_id;
              END IF;
          END IF;
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sql(`
      DROP TRIGGER IF EXISTS trg_financial_sale_head_all ON public.invoices;
      CREATE TRIGGER trg_financial_sale_head_all
      AFTER INSERT OR UPDATE OR DELETE ON public.invoices
      FOR EACH ROW EXECUTE FUNCTION public.fn_trg_financial_sale_head();
    `);

    // تريجر التسويات المالية للمشتريات وحسابات الموردين والخزينة
    await sql(`
      CREATE OR REPLACE FUNCTION public.fn_trg_financial_purchase_head()
      RETURNS TRIGGER AS $$
      DECLARE v_diff_paid NUMERIC(12,2) := 0; v_diff_remain NUMERIC(12,2) := 0;
      BEGIN
          IF (TG_OP = 'INSERT') THEN
              IF NEW.paid_amount > 0 THEN
                  INSERT INTO public.cash_flow (id, type, amount, source_type, reference_id, description)
                  VALUES (gen_random_uuid(), 'OUT', NEW.paid_amount, 'purchase', NEW.id, 'دفع نقدي لفاتورة شراء رقم: ' || NEW.purchase_number);
              END IF;
              IF NEW.remaining_amount > 0 AND NEW.supplier_id IS NOT NULL THEN
                  UPDATE public.suppliers SET current_balance = current_balance + NEW.remaining_amount WHERE id = NEW.supplier_id;
              END IF;
          ELSIF (TG_OP = 'UPDATE') THEN
              v_diff_paid := NEW.paid_amount - OLD.paid_amount;
              IF v_diff_paid <> 0 THEN
                  INSERT INTO public.cash_flow (id, type, amount, source_type, reference_id, description)
                  VALUES (gen_random_uuid(), CASE WHEN v_diff_paid > 0 THEN 'OUT' ELSE 'IN' END, ABS(v_diff_paid), 'purchase', NEW.id, 'تعديل المبلغ المدفوع لفاتورة شراء رقم: ' || NEW.purchase_number);
              END IF;
              v_diff_remain := NEW.remaining_amount - OLD.remaining_amount;
              IF v_diff_remain <> 0 AND NEW.supplier_id IS NOT NULL THEN
                  UPDATE public.suppliers SET current_balance = current_balance + v_diff_remain WHERE id = NEW.supplier_id;
              END IF;
          ELSIF (TG_OP = 'DELETE') THEN
              IF OLD.paid_amount > 0 THEN
                  INSERT INTO public.cash_flow (id, type, amount, source_type, reference_id, description)
                  VALUES (gen_random_uuid(), 'IN', OLD.paid_amount, 'purchase', OLD.id, 'إلغاء واسترداد مالي لمشتريات محذوفة رقم: ' || OLD.purchase_number);
              END IF;
              IF OLD.remaining_amount > 0 AND OLD.supplier_id IS NOT NULL THEN
                  UPDATE public.suppliers SET current_balance = current_balance - OLD.remaining_amount WHERE id = OLD.supplier_id;
              END IF;
          END IF;
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sql(`
      DROP TRIGGER IF EXISTS trg_financial_purchase_head_all ON public.purchases;
      CREATE TRIGGER trg_financial_purchase_head_all
      AFTER INSERT OR UPDATE OR DELETE ON public.purchases
      FOR EACH ROW EXECUTE FUNCTION public.fn_trg_financial_purchase_head();
    `);

    // حقن فئات المصاريف الافتراضية
    await sql(`
      INSERT INTO public.expense_categories (id, name)
      VALUES
        ('${crypto.randomUUID()}', 'رواتب'), 
        ('${crypto.randomUUID()}', 'إيجار'), 
        ('${crypto.randomUUID()}', 'مرافق'), 
        ('${crypto.randomUUID()}', 'مواصلات'), 
        ('${crypto.randomUUID()}', 'صيانة'), 
        ('${crypto.randomUUID()}', 'مشتريات مكتبية'), 
        ('${crypto.randomUUID()}', 'تسويق'), 
        ('${crypto.randomUUID()}', 'أخرى')
      ON CONFLICT (name) DO NOTHING
    `);

    return { success: true, message: "Database tables and triggers successfully initialized inside 'public' schema." };
  } catch (error) {
    console.error("Error initializing database components in public schema:", error);
    return { success: false, error: error.message };
  }
}

/**
 * 1. إضافة منتج جديد مباشرة في public
 */
export async function createProduct(schemaName = 'public', productData) {
  const sql = getDb();
  const { name, barcode, category, unit, sell_price, cost_price, min_stock_qty, notes, image_url } = productData;
  const pId = crypto.randomUUID();

  const results = await sql(`
    INSERT INTO public.products 
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
 * 2. معالجة وحفظ فاتورة مشتريات بالكامل داخل public
 */
export async function processPurchaseInvoice(schemaName = 'public', purchaseData, items) {
  const sql = getDb();
  
  try {
    const { purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes } = purchaseData;
    const purId = crypto.randomUUID();

    // 1. حفظ رأس الفاتورة في المشتريات
    const purchaseResult = await sql(`
      INSERT INTO public.purchases 
        (id, purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [purId, purchase_number, supplier_id, status || 'received', subtotal, discount_amt || 0, tax_amt || 0, total_amount, paid_amount || 0, payment_method || 'cash', notes]);

    const invoice = purchaseResult[0];

    // 2. حفظ البنود التفصيلية (سيتولى التريجر تحديث المخزن وتدفق الخزينة تلقائياً وبأمان تام)
    for (const item of items) {
      const itemId = crypto.randomUUID();
      await sql(`
        INSERT INTO public.purchase_items 
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
 * 3. معالجة وحفظ فاتورة مبيعات تفصيلية داخل public
 */
export async function processSaleInvoice(schemaName = 'public', saleData, items) {
  const sql = getDb();

  try {
    const { invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes } = saleData;
    const invId = crypto.randomUUID();

    // 1. حفظ رأس فاتورة المبيعات
    const invoiceResult = await sql(`
      INSERT INTO public.invoices 
        (id, invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [invId, invoice_number, customer_id, status || 'paid', subtotal, discount_amt || 0, tax_rate || 0, tax_amt || 0, total_amount, paid_amount || 0, payment_method || 'cash', notes]);

    const invoice = invoiceResult[0];

    // 2. حفظ كافة البنود
    for (const item of items) {
      const itemId = crypto.randomUUID();
      await sql(`
        INSERT INTO public.invoice_items 
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
 * 4. استعلام التقارير المجمع والتدفق المالي اللحظي للـ Dashboard من public
 */
export async function getUnifiedDashboardReport(schemaName = 'public') {
  const sql = getDb();

  const reportResult = await sql(`
    SELECT 
      COALESCE(SUM(i.total_amount), 0) AS total_sales,
      COALESCE(SUM(i.paid_amount), 0) AS total_sales_collected,
      COALESCE(SUM(i.remaining_amount), 0) AS total_customer_debts,
      
      (SELECT COALESCE(SUM(total_amount), 0) FROM public.purchases) AS total_purchases,
      (SELECT COALESCE(SUM(paid_amount), 0) FROM public.purchases) AS total_purchases_paid,
      (SELECT COALESCE(SUM(remaining_amount), 0) FROM public.purchases) AS total_supplier_credits,

      (SELECT COALESCE(SUM(amount), 0) FROM public.expenses) AS total_expenses,

      (
        SELECT COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE -amount END), 0)
        FROM public.cash_flow
      ) AS net_cash_on_hand

    FROM public.invoices i
  `);

  return reportResult[0];
}
