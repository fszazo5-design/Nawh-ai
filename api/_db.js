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
 * دالة فارغة مضافة لمنع حدوث خطأ الاستيراد في ملف الـ API القديم أو الجديد
 * حيث يتكفل النظام التلقائي بإنشاء السكيما والجداول عند تسجيل حساب العميل
 */
export async function initializeDatabase(schemaName = 'pos') {
  return { success: true, message: `Schema ${schemaName} is managed at registration.` };
}

/**
 * 1. إضافة منتج جديد
 */
export async function createProduct(schemaName = 'pos', productData) {
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
 * 2. إضافة ومعالجة فاتورة شراء (مع بنودها)
 */
export async function processPurchaseInvoice(schemaName = 'pos', purchaseData, items) {
  const sql = getDb(schemaName);
  
  try {
    await sql('BEGIN');

    const { purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes } = purchaseData;

    // 1. حفظ رأس الفاتورة
    const purchaseResult = await sql(`
      INSERT INTO "${schemaName}".purchases 
        (purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [purchase_number, supplier_id, status || 'received', subtotal, discount_amt || 0, tax_amt || 0, total_amount, paid_amount || 0, payment_method || 'cash', notes]);

    const invoice = purchaseResult[0];

    // 2. حفظ البنود التفصيلية
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
 * 3. إضافة ومعالجة فاتورة بيع (مع بنودها)
 */
export async function processSaleInvoice(schemaName = 'pos', saleData, items) {
  const sql = getDb(schemaName);

  try {
    await sql('BEGIN');

    const { invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes } = saleData;

    // 1. حفظ رأس فاتورة المبيعات
    const invoiceResult = await sql(`
      INSERT INTO "${schemaName}".invoices 
        (invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [invoice_number, customer_id, status || 'paid', subtotal, discount_amt || 0, tax_rate || 0, tax_amt || 0, total_amount, paid_amount || 0, payment_method || 'cash', notes]);

    const invoice = invoiceResult[0];

    // 2. حفظ البنود
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

// التصدير الافتراضي المتكامل ليتناسب مع كافة أنواع الاستدعاءات
export default { 
  getDb, 
  initializeDatabase,
  createProduct, 
  processPurchaseInvoice, 
  processSaleInvoice, 
  getUnifiedDashboardReport 
};
