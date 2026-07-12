import { getDb, initializeDatabase } from './_db.js';

/**
 * Data API Endpoint (Vercel Web Fetch API Style)
 * Unified API for all database operations: products, customers, suppliers, invoices, etc.
 * متوافق تماماً مع معايير الويب ومعالج الـ Fetch في Vercel وجلب البيانات من الـ Schema الخاصة بها.
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

// Response helper المتوافق مع معايير الويب الحديثة
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

// دالة فحص التوكن المحدثة (تتحقق وتستخرج اسم السكيما بشكل آمن للجميع)
function verifyToken(authHeader) {
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token));
    if (payload.exp < Date.now()) return null;
    return payload; // يحتوي على userId و email و schemaName
  } catch {
    return null;
  }
}

// Generate invoice number
function generateInvoiceNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${date}-${random}`;
}

// Generate purchase number
function generatePurchaseNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PO-${date}-${random}`;
}

// الدالة الرئيسية الموحدة لمعالجة كافة الطلبات والمداول للـ ERP
async function handleRequest(req) {
  const host = typeof req.headers.get === 'function' ? req.headers.get('host') : (req.headers?.host || 'localhost');
  const authHeader = typeof req.headers.get === 'function' ? req.headers.get('authorization') : (req.headers?.authorization);

  const url = new URL(req.url, `https://${host}`);
  const table = url.searchParams.get('table');
  const id = url.searchParams.get('id');
  const action = url.searchParams.get('action');

  // 1. فحص وفك التوكن لاستخراج اسم السكيما (مطلوب لجميع العمليات لمعرفة جدول من سنقرأ)
  const user = verifyToken(authHeader);

  try {
    // 2. معالجة تهيئة السكيما (إن وجدت)
    if (action === 'init-db' || table === 'init-db') {
      const schemaToInit = user?.schemaName || url.searchParams.get('schema');
      if (!schemaToInit) {
        return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'اسم السكيما مطلوب للتهيئة' }, 400);
      }
      try {
        const result = await initializeDatabase(schemaToInit);
        return jsonResponse(result);
      } catch (error) {
        return jsonResponse({ success: false, error: error.message }, 500);
      }
    }

    // 3. منع الدخول في حال غياب التوكن أو عدم صلاحيته (لأن كل العمليات أصبحت مخصصة لسكيما معينة)
    if (!user || !user.schemaName) {
      return jsonResponse({ success: false, error: 'UNAUTHORIZED', message: 'جلسة العمل منتهية أو غير صالحة، يرجى إعادة تسجيل الدخول' }, 401);
    }

    // 4. استدعاء قاعدة البيانات مع تمرير اسم السكيما المستخرجة من التوكن تلقائياً لتوجه الاستعلامات للمكان الصحيح
    const sql = getDb(user.schemaName);

    // قراءة الـ body تلقائياً من الـ Web Request
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      body = await req.json().catch(() => ({}));
    }

    // ==========================================
    // === [ PRODUCTS ] ===
    // ==========================================
    if (table === 'products') {
      if (req.method === 'GET') {
        const category = url.searchParams.get('category');
        const barcode = url.searchParams.get('barcode');
        const search = url.searchParams.get('search');
        const is_active = url.searchParams.get('is_active');

        let rows = [];
        if (category) {
          rows = await sql`SELECT * FROM products WHERE category = ${category}`;
        } else if (barcode) {
          rows = await sql`SELECT * FROM products WHERE barcode = ${barcode} LIMIT 1`;
        } else if (search) {
          const searchParam = `%${search}%`;
          rows = await sql`SELECT * FROM products WHERE name ILIKE ${searchParam} OR barcode ILIKE ${searchParam} ORDER BY created_at DESC`;
        } else if (is_active !== null && is_active !== undefined) {
          const activeBool = is_active === 'true';
          rows = await sql`SELECT * FROM products WHERE is_active = ${activeBool} ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT * FROM products ORDER BY created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }

      if (req.method === 'POST') {
        const pId = crypto.randomUUID();
        const result = await sql`
          INSERT INTO products (id, name, barcode, category, unit, cost_price, sell_price, stock_qty, min_stock_qty, is_active, image_url, notes)
          VALUES (
            ${pId}, ${body.name}, ${body.barcode || null}, ${body.category || null}, ${body.unit || 'قطعة'},
            ${body.cost_price || 0}, ${body.sell_price || 0}, ${body.stock_qty || 0}, ${body.min_stock_qty || 0},
            ${body.is_active ?? true}, ${body.image_url || null}, ${body.notes || null}
          ) RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const result = await sql`
          UPDATE products SET
            name = COALESCE(${body.name ?? null}, name), barcode = COALESCE(${body.barcode ?? null}, barcode), category = COALESCE(${body.category ?? null}, category),
            unit = COALESCE(${body.unit ?? null}, unit), cost_price = COALESCE(${body.cost_price ?? null}, cost_price), sell_price = COALESCE(${body.sell_price ?? null}, sell_price),
            stock_qty = COALESCE(${body.stock_qty ?? null}, stock_qty), min_stock_qty = COALESCE(${body.min_stock_qty ?? null}, min_stock_qty), is_active = COALESCE(${body.is_active ?? null}, is_active),
            image_url = COALESCE(${body.image_url ?? null}, image_url), notes = COALESCE(${body.notes ?? null}, notes), updated_at = now()
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await sql`DELETE FROM products WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // ==========================================
    // === [ CUSTOMERS ] ===
    // ==========================================
    if (table === 'customers') {
      if (req.method === 'GET') {
        const search = url.searchParams.get('search');
        let rows = [];
        if (search) {
          const searchParam = `%${search}%`;
          rows = await sql`SELECT * FROM customers WHERE name ILIKE ${searchParam} OR phone ILIKE ${searchParam} ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT * FROM customers ORDER BY created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }

      if (req.method === 'POST') {
        const cId = crypto.randomUUID();
        const result = await sql`
          INSERT INTO customers (id, name, phone, email, address, tax_id, credit_limit, notes)
          VALUES (${cId}, ${body.name}, ${body.phone || null}, ${body.email || null}, ${body.address || null}, ${body.tax_id || null}, ${body.credit_limit || 0}, ${body.notes || null}) RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const result = await sql`
          UPDATE customers SET
            name = COALESCE(${body.name ?? null}, name), phone = COALESCE(${body.phone ?? null}, phone), email = COALESCE(${body.email ?? null}, email),
            address = COALESCE(${body.address ?? null}, address), tax_id = COALESCE(${body.tax_id ?? null}, tax_id), credit_limit = COALESCE(${body.credit_limit ?? null}, credit_limit),
            notes = COALESCE(${body.notes ?? null}, notes), is_active = COALESCE(${body.is_active ?? null}, is_active)
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await sql`DELETE FROM customers WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // ==========================================
    // === [ SUPPLIERS ] ===
    // ==========================================
    if (table === 'suppliers') {
      if (req.method === 'GET') {
        const search = url.searchParams.get('search');
        let rows = [];
        if (search) {
          const searchParam = `%${search}%`;
          rows = await sql`SELECT * FROM suppliers WHERE name ILIKE ${searchParam} OR phone ILIKE ${searchParam} ORDER BY created_at DESC`;
        } else {
          rows = await sql`SELECT * FROM suppliers ORDER BY created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }

      if (req.method === 'POST') {
        const sId = crypto.randomUUID();
        const result = await sql`
          INSERT INTO suppliers (id, name, phone, email, address, tax_id, credit_limit, notes)
          VALUES (${sId}, ${body.name}, ${body.phone || null}, ${body.email || null}, ${body.address || null}, ${body.tax_id || null}, ${body.credit_limit || 0}, ${body.notes || null}) RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const result = await sql`
          UPDATE suppliers SET
            name = COALESCE(${body.name ?? null}, name), phone = COALESCE(${body.phone ?? null}, phone), email = COALESCE(${body.email ?? null}, email),
            address = COALESCE(${body.address ?? null}, address), tax_id = COALESCE(${body.tax_id ?? null}, tax_id), credit_limit = COALESCE(${body.credit_limit ?? null}, credit_limit),
            notes = COALESCE(${body.notes ?? null}, notes), is_active = COALESCE(${body.is_active ?? null}, is_active)
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await sql`DELETE FROM suppliers WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // ==========================================
    // === [ INVOICES ] ===
    // ==========================================
    if (table === 'invoices') {
      if (req.method === 'GET') {
        if (id) {
          const result = await sql`SELECT i.*, c.name as customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ${id}`;
          if (result.length === 0) return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          return jsonResponse({ success: true, data: result[0] });
        }
        const result = await sql`SELECT i.*, c.name as customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id ORDER BY i.created_at DESC`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        const invoice_number = generateInvoiceNumber();
        const invId = crypto.randomUUID();
        const invoiceResult = await sql`
          INSERT INTO invoices (id, invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes)
          VALUES (${invId}, ${invoice_number}, ${body.customer_id || null}, ${body.status || 'paid'}, ${body.subtotal || 0}, ${body.discount_amt || 0}, ${body.tax_rate || 0}, ${body.tax_amt || 0}, ${body.total_amount || 0}, ${body.paid_amount || 0}, ${body.payment_method || 'cash'}, ${body.notes || null}) RETURNING *
        `;
        const invoice = invoiceResult[0];

        if (body.items && body.items.length > 0) {
          for (const item of body.items) {
            const itemId = crypto.randomUUID();
            await sql`
              INSERT INTO invoice_items (id, invoice_id, product_id, name, qty, unit_price, discount, total) 
              VALUES (${itemId}, ${invoice.id}, ${item.product_id || null}, ${item.name}, ${item.qty}, ${item.unit_price}, ${item.discount || 0}, ${item.total})
            `;
          }
        }
        return jsonResponse({ success: true, data: invoice }, 201);
      }

      if (req.method === 'DELETE' && id) {
        await sql`DELETE FROM invoices WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // === INVOICE ITEMS ===
    if (table === 'invoice-items' || table === 'invoice_items') {
      if (req.method === 'GET') {
        const invoiceId = url.searchParams.get('invoice_id');
        const result = invoiceId 
          ? await sql`SELECT * FROM invoice_items WHERE invoice_id = ${invoiceId} ORDER BY created_at`
          : await sql`SELECT * FROM invoice_items ORDER BY created_at`;
        return jsonResponse({ success: true, data: result });
      }
    }

    // ==========================================
    // === [ PURCHASES ] ===
    // ==========================================
    if (table === 'purchases') {
      if (req.method === 'GET') {
        if (id) {
          const result = await sql`SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.id = ${id}`;
          if (result.length === 0) return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          return jsonResponse({ success: true, data: result[0] });
        }
        const result = await sql`SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.created_at DESC`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        const purchase_number = generatePurchaseNumber();
        const purId = crypto.randomUUID();
        const purchaseResult = await sql`
          INSERT INTO purchases (id, purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes)
          VALUES (${purId}, ${purchase_number}, ${body.supplier_id || null}, ${body.status || 'received'}, ${body.subtotal || 0}, ${body.discount_amt || 0}, ${body.tax_amt || 0}, ${body.total_amount || 0}, ${body.paid_amount || 0}, ${body.payment_method || 'cash'}, ${body.notes || null}) RETURNING *
        `;
        const purchase = purchaseResult[0];

        if (body.items && body.items.length > 0) {
          for (const item of body.items) {
            const itemId = crypto.randomUUID();
            await sql`
              INSERT INTO purchase_items (id, purchase_id, product_id, name, qty, unit_cost, total) 
              VALUES (${itemId}, ${purchase.id}, ${item.product_id || null}, ${item.name}, ${item.qty}, ${item.unit_cost}, ${item.total})
            `;
            if (item.product_id) {
              await sql`UPDATE products SET stock_qty = stock_qty + ${item.qty}, updated_at = now() WHERE id = ${item.product_id}`;
            }
          }
        }
        return jsonResponse({ success: true, data: purchase }, 201);
      }

      if (req.method === 'DELETE' && id) {
        await sql`DELETE FROM purchases WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // === PURCHASE ITEMS ===
    if (table === 'purchase_items') {
      if (req.method === 'GET') {
        const purchaseId = url.searchParams.get('purchase_id');
        const result = purchaseId 
          ? await sql`SELECT * FROM purchase_items WHERE purchase_id = ${purchaseId} ORDER BY created_at`
          : await sql`SELECT * FROM purchase_items ORDER BY created_at`;
        return jsonResponse({ success: true, data: result });
      }
    }

    // ==========================================
    // === [ EXPENSES ] ===
    // ==========================================
    if (table === 'expenses') {
      if (req.method === 'GET') {
        if (id) {
          const result = await sql`SELECT e.*, ec.name as category_name FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id WHERE e.id = ${id}`;
          if (result.length === 0) return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          return jsonResponse({ success: true, data: result[0] });
        }
        const result = await sql`SELECT e.*, ec.name as category_name FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id ORDER BY e.expense_date DESC`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        const expId = crypto.randomUUID();
        const result = await sql`
          INSERT INTO expenses (id, category_id, description, amount, paid_by, receipt_url, expense_date)
          VALUES (${expId}, ${body.category_id || null}, ${body.description}, ${body.amount}, ${body.paid_by || null}, ${body.receipt_url || null}, ${body.expense_date || null}) RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const result = await sql`
          UPDATE expenses SET
            category_id = COALESCE(${body.category_id ?? null}, category_id), description = COALESCE(${body.description ?? null}, description), amount = COALESCE(${body.amount ?? null}, amount),
            paid_by = COALESCE(${body.paid_by ?? null}, paid_by), receipt_url = COALESCE(${body.receipt_url ?? null}, receipt_url), expense_date = COALESCE(${body.expense_date ?? null}, expense_date)
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await sql`DELETE FROM expenses WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // === EXPENSE CATEGORIES ===
    if (table === 'expense-categories' || table === 'expense_categories') {
      if (req.method === 'GET') {
        const result = await sql`SELECT * FROM expense_categories ORDER BY name`;
        return jsonResponse({ success: true, data: result });
      }
    }

    // ==========================================
    // === [ WHATSAPP QUEUE ] ===
    // ==========================================
    if (table === 'whatsapp' || table === 'whatsapp_queue') {
      if (req.method === 'GET') {
        const status = url.searchParams.get('status');
        const result = status === 'pending'
          ? await sql`SELECT * FROM whatsapp_queue WHERE status = 'pending' ORDER BY created_at`
          : await sql`SELECT * FROM whatsapp_queue ORDER BY created_at DESC`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        const wId = crypto.randomUUID();
        const result = await sql`
          INSERT INTO whatsapp_queue (id, recipient, message, template_name, template_params, created_by)
          VALUES (${wId}, ${body.recipient}, ${body.message}, ${body.template_name || null}, ${body.template_params || null}, ${user?.userId || null}) RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const result = await sql`
          UPDATE whatsapp_queue SET
            status = COALESCE(${body.status ?? null}, status), error_message = COALESCE(${body.error_message ?? null}, error_message),
            sent_at = CASE WHEN ${body.status ?? null} = 'sent' THEN now() ELSE sent_at END
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }
    }

    // ==========================================
    // === [ DASHBOARD STATS ] ===
    // ==========================================
    if (action === 'dashboard' || table === 'dashboard') {
      const today = new Date().toISOString().slice(0, 10) + 'T00:00:00';

      const todayStats = await sql`SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count FROM invoices WHERE created_at >= ${today} AND status != 'cancelled'`;
      const totalStats = await sql`SELECT COALESCE(SUM(total_amount), 0) as total_revenue, COUNT(*) as total_count FROM invoices WHERE status != 'cancelled'`;
      const purchaseTotal = await sql`SELECT COALESCE(SUM(total_amount), 0) as total FROM purchases WHERE status != 'cancelled'`;
      const expenseTotal = await sql`SELECT COALESCE(SUM(amount), 0) as total FROM expenses`;
      const productCount = await sql`SELECT COUNT(*) as count FROM products WHERE is_active = true`;
      const recentInvoices = await sql`SELECT i.*, c.name as customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id ORDER BY i.created_at DESC LIMIT 5`;

      const stats = {
        todaySales: Number(todayStats[0]?.today_sales || 0),
        todayCount: Number(todayStats[0]?.today_count || 0),
        totalRevenue: Number(totalStats[0]?.total_revenue || 0),
        netProfit: Number(totalStats[0]?.total_revenue || 0) - Number(purchaseTotal[0]?.total || 0) - Number(expenseTotal[0]?.total || 0),
        productCount: Number(productCount[0]?.count || 0),
        totalExpenses: Number(expenseTotal[0]?.total || 0)
      };

      return jsonResponse({ success: true, data: { stats, recentInvoices } });
    }

    // ==========================================
    // === [ AUDIT LOG ] ===
    // ==========================================
    if (table === 'audit_log') {
      if (req.method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const result = await sql`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ${limit}`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        const alId = crypto.randomUUID();
        await sql`
          INSERT INTO audit_log (id, user_id, table_name, record_id, action, old_values, new_values, ip_address) 
          VALUES (${alId}, ${user?.userId || null}, ${body.table_name}, ${body.record_id || null}, ${body.action}, ${body.old_values || null}, ${body.new_values || null}, ${body.ip_address || null})
        `;
        return jsonResponse({ success: true });
      }
    }

    // ==========================================
    // === [ SYNC QUEUE ] ===
    // ==========================================
    if (table === 'sync_queue') {
      if (req.method === 'GET') {
        const pendingOnly = url.searchParams.get('pending') === 'true';
        const result = pendingOnly 
          ? await sql`SELECT * FROM sync_queue WHERE synced = false ORDER BY created_at`
          : await sql`SELECT * FROM sync_queue ORDER BY created_at DESC`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        const sqId = crypto.randomUUID();
        const result = await sql`
          INSERT INTO sync_queue (id, user_id, table_name, record_id, operation, data)
          VALUES (${sqId}, ${user?.userId || null}, ${body.table_name}, ${body.record_id}, ${body.operation}, ${body.data || null}) RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        await sql`UPDATE sync_queue SET synced = true, synced_at = now() WHERE id = ${id}`;
        return jsonResponse({ success: true });
      }
    }

    return jsonResponse({ success: false, error: 'UNKNOWN_TABLE', message: 'الجدول المطلوب غير معروف' }, 400);

  } catch (error) {
    console.error('Data API Error:', error);
    return jsonResponse({ success: false, error: 'SERVER_ERROR', message: error.message }, 500);
  }
}

// === [ التصدير المتوافق مع معايير Vercel ] ===
export async function GET(request) { return await handleRequest(request); }
export async function POST(request) { return await handleRequest(request); }
export async function PUT(request) { return await handleRequest(request); }
export async function DELETE(request) { return await handleRequest(request); }
export async function OPTIONS() { 
  return new Response(null, { status: 200, headers: corsHeaders }); 
}
