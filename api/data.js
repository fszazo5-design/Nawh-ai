import pg from 'pg';
import { initializeDatabase } from './_db.js'; // إذا كانت دالة التهيئة تعتمد على pg داخلياً، اترك الاستيراد كما هو

/**
 * Data API Endpoint (Vercel Node.js Signature using 'pg' library)
 * Unified API for all database operations: products, customers, suppliers, invoices, etc.
 */

// دالة مساعدة لضبط الـ CORS وإرسال الاستجابة
function sendJsonResponse(res, data, status = 200) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Info');
  return res.status(status).json(data);
}

// دالة إعداد نص الاتصال بقاعدة البيانات لـ Neon
function createDbClient() {
  const baseConnectionString = process.env.DATABASE_URL;
  if (!baseConnectionString) {
    throw new Error('DATABASE_URL is missing in environment variables');
  }
  const separator = baseConnectionString.includes('?') ? '&' : '?';
  const finalConnectionString = `${baseConnectionString}${separator}sslmode=verify-full`;

  return new pg.Client({
    connectionString: finalConnectionString,
    ssl: { 
      rejectUnauthorized: false 
    }
  });
}

// Verify auth token
function verifyToken(authHeader) {
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token));
    if (payload.exp < Date.now()) return null;
    return payload;
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

export default async function handler(req, res) {
  // 1. معالجة طلبات OPTIONS الخاصة بـ CORS (مهم جداً للأندرويد)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Info');
    return res.status(200).end();
  }

  const client = createDbClient();

  // قراءة المعاملات والهيدرز
  const host = req.headers?.host || 'localhost';
  const authHeader = req.headers?.authorization || req.headers?.['authorization'];
  const url = new URL(req.url, `https://${host}`);
  
  const table = url.searchParams.get('table');
  const id = url.searchParams.get('id');
  const action = url.searchParams.get('action');

  try {
    // 2. Initialize database endpoint
    if (action === 'init-db' || table === 'init-db') {
      try {
        const result = await initializeDatabase();
        return sendJsonResponse(res, result);
      } catch (error) {
        return sendJsonResponse(res, { success: false, error: error.message }, 500);
      }
    }

    // Auth check for protected routes
    const user = verifyToken(authHeader);
    if (!user && req.method !== 'GET') {
      return sendJsonResponse(res, { success: false, error: 'UNAUTHORIZED', message: 'غير مصرح' }, 401);
    }

    // الاتصال بقاعدة البيانات
    await client.connect();

    // قراءة الـ body بأمان تامة
    let body = req.body || {};
    if ((req.method === 'POST' || req.method === 'PUT') && typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else if ((req.method === 'POST' || req.method === 'PUT') && !req.body) {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const data = Buffer.concat(buffers).toString();
      body = data ? JSON.parse(data) : {};
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

        let queryText = 'SELECT * FROM products WHERE 1=1';
        let queryParams = [];

        if (category) {
          queryParams.push(category);
          queryText = `SELECT * FROM products WHERE category = $${queryParams.length}`;
        } else if (barcode) {
          queryParams.push(barcode);
          queryText = `SELECT * FROM products WHERE barcode = $${queryParams.length} LIMIT 1`;
        } else if (search) {
          queryParams.push('%' + search + '%');
          queryText = `SELECT * FROM products WHERE name ILIKE $${queryParams.length} OR barcode ILIKE $${queryParams.length} ORDER BY created_at DESC`;
        } else if (is_active !== null && is_active !== undefined) {
          queryParams.push(is_active === 'true');
          queryText = `SELECT * FROM products WHERE is_active = $${queryParams.length} ORDER BY created_at DESC`;
        } else {
          queryText = 'SELECT * FROM products ORDER BY created_at DESC';
        }

        const queryResult = await client.query(queryText, queryParams);
        return sendJsonResponse(res, { success: true, data: queryResult.rows });
      }

      if (req.method === 'POST') {
        const insertText = `
          INSERT INTO products (name, barcode, category, unit, cost_price, sell_price, stock_qty, min_stock_qty, is_active, image_url, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
        `;
        const result = await client.query(insertText, [
          body.name, body.barcode || null, body.category || null, body.unit || 'قطعة',
          body.cost_price || 0, body.sell_price || 0, body.stock_qty || 0, body.min_stock_qty || 0,
          body.is_active ?? true, body.image_url || null, body.notes || null
        ]);
        return sendJsonResponse(res, { success: true, data: result.rows[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const updateText = `
          UPDATE products SET
            name = COALESCE($1, name), barcode = COALESCE($2, barcode), category = COALESCE($3, category),
            unit = COALESCE($4, unit), cost_price = COALESCE($5, cost_price), sell_price = COALESCE($6, sell_price),
            stock_qty = COALESCE($7, stock_qty), min_stock_qty = COALESCE($8, min_stock_qty), is_active = COALESCE($9, is_active),
            image_url = COALESCE($10, image_url), notes = COALESCE($11, notes), updated_at = now()
          WHERE id = $12 RETURNING *
        `;
        const result = await client.query(updateText, [
          body.name ?? null, body.barcode ?? null, body.category ?? null, body.unit ?? null,
          body.cost_price ?? null, body.sell_price ?? null, body.stock_qty ?? null, body.min_stock_qty ?? null,
          body.is_active ?? null, body.image_url ?? null, body.notes ?? null, id
        ]);
        return sendJsonResponse(res, { success: true, data: result.rows[0] });
      }

      if (req.method === 'DELETE' && id) {
        await client.query('DELETE FROM products WHERE id = $1', [id]);
        return sendJsonResponse(res, { success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // ==========================================
    // === [ CUSTOMERS ] ===
    // ==========================================
    if (table === 'customers') {
      if (req.method === 'GET') {
        const search = url.searchParams.get('search');
        if (search) {
          const result = await client.query(
            'SELECT * FROM customers WHERE name ILIKE $1 OR phone ILIKE $1 ORDER BY created_at DESC',
            ['%' + search + '%']
          );
          return sendJsonResponse(res, { success: true, data: result.rows });
        }
        const result = await client.query('SELECT * FROM customers ORDER BY created_at DESC');
        return sendJsonResponse(res, { success: true, data: result.rows });
      }

      if (req.method === 'POST') {
        const insertText = `
          INSERT INTO customers (name, phone, email, address, tax_id, credit_limit, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `;
        const result = await client.query(insertText, [
          body.name, body.phone || null, body.email || null, body.address || null,
          body.tax_id || null, body.credit_limit || 0, body.notes || null
        ]);
        return sendJsonResponse(res, { success: true, data: result.rows[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const updateText = `
          UPDATE customers SET
            name = COALESCE($1, name), phone = COALESCE($2, phone), email = COALESCE($3, email),
            address = COALESCE($4, address), tax_id = COALESCE($5, tax_id), credit_limit = COALESCE($6, credit_limit),
            notes = COALESCE($7, notes), is_active = COALESCE($8, is_active)
          WHERE id = $9 RETURNING *
        `;
        const result = await client.query(updateText, [
          body.name ?? null, body.phone ?? null, body.email ?? null, body.address ?? null,
          body.tax_id ?? null, body.credit_limit ?? null, body.notes ?? null, body.is_active ?? null, id
        ]);
        return sendJsonResponse(res, { success: true, data: result.rows[0] });
      }

      if (req.method === 'DELETE' && id) {
        await client.query('DELETE FROM customers WHERE id = $1', [id]);
        return sendJsonResponse(res, { success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // ==========================================
    // === [ SUPPLIERS ] ===
    // ==========================================
    if (table === 'suppliers') {
      if (req.method === 'GET') {
        const search = url.searchParams.get('search');
        if (search) {
          const result = await client.query(
            'SELECT * FROM suppliers WHERE name ILIKE $1 OR phone ILIKE $1 ORDER BY created_at DESC',
            ['%' + search + '%']
          );
          return sendJsonResponse(res, { success: true, data: result.rows });
        }
        const result = await client.query('SELECT * FROM suppliers ORDER BY created_at DESC');
        return sendJsonResponse(res, { success: true, data: result.rows });
      }

      if (req.method === 'POST') {
        const insertText = `
          INSERT INTO suppliers (name, phone, email, address, tax_id, credit_limit, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `;
        const result = await client.query(insertText, [
          body.name, body.phone || null, body.email || null, body.address || null,
          body.tax_id || null, body.credit_limit || 0, body.notes || null
        ]);
        return sendJsonResponse(res, { success: true, data: result.rows[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const updateText = `
          UPDATE suppliers SET
            name = COALESCE($1, name), phone = COALESCE($2, phone), email = COALESCE($3, email),
            address = COALESCE($4, address), tax_id = COALESCE($5, tax_id), credit_limit = COALESCE($6, credit_limit),
            notes = COALESCE($7, notes), is_active = COALESCE($8, is_active)
          WHERE id = $9 RETURNING *
        `;
        const result = await client.query(updateText, [
          body.name ?? null, body.phone ?? null, body.email ?? null, body.address ?? null,
          body.tax_id ?? null, body.credit_limit ?? null, body.notes ?? null, body.is_active ?? null, id
        ]);
        return sendJsonResponse(res, { success: true, data: result.rows[0] });
      }

      if (req.method === 'DELETE' && id) {
        await client.query('DELETE FROM suppliers WHERE id = $1', [id]);
        return sendJsonResponse(res, { success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // ==========================================
    // === [ INVOICES ] ===
    // ==========================================
    if (table === 'invoices') {
      if (req.method === 'GET') {
        if (id) {
          const result = await client.query(
            'SELECT i.*, c.name as customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = $1',
            [id]
          );
          if (result.rows.length === 0) {
            return sendJsonResponse(res, { success: false, error: 'NOT_FOUND' }, 404);
          }
          return sendJsonResponse(res, { success: true, data: result.rows[0] });
        }
        const result = await client.query(
          'SELECT i.*, c.name as customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id ORDER BY i.created_at DESC'
        );
        return sendJsonResponse(res, { success: true, data: result.rows });
      }

      if (req.method === 'POST') {
        const invoice_number = generateInvoiceNumber();
        const insertInvoiceText = `
          INSERT INTO invoices (invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
        `;
        const invoiceResult = await client.query(insertInvoiceText, [
          invoice_number, body.customer_id || null, body.status || 'paid',
          body.subtotal || 0, body.discount_amt || 0, body.tax_rate || 0, body.tax_amt || 0,
          body.total_amount || 0, body.paid_amount || 0, body.payment_method || 'cash', body.notes || null
        ]);

        const invoice = invoiceResult.rows[0];

        if (body.items && body.items.length > 0) {
          for (const item of body.items) {
            await client.query(
              'INSERT INTO invoice_items (invoice_id, product_id, name, qty, unit_price, discount, total) VALUES ($1, $2, $3, $4, $5, $6, $7)',
              [invoice.id, item.product_id || null, item.name, item.qty, item.unit_price, item.discount || 0, item.total]
            );
          }
        }
        return sendJsonResponse(res, { success: true, data: invoice }, 201);
      }

      if (req.method === 'DELETE' && id) {
        await client.query('DELETE FROM invoices WHERE id = $1', [id]);
        return sendJsonResponse(res, { success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // === INVOICE ITEMS ===
    if (table === 'invoice-items' || table === 'invoice_items') {
      if (req.method === 'GET') {
        const invoiceId = url.searchParams.get('invoice_id');
        if (invoiceId) {
          const result = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at', [invoiceId]);
          return sendJsonResponse(res, { success: true, data: result.rows });
        }
        const result = await client.query('SELECT * FROM invoice_items ORDER BY created_at');
        return sendJsonResponse(res, { success: true, data: result.rows });
      }
    }

    // ==========================================
    // === [ PURCHASES ] ===
    // ==========================================
    if (table === 'purchases') {
      if (req.method === 'GET') {
        if (id) {
          const result = await client.query(
            'SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.id = $1',
            [id]
          );
          if (result.rows.length === 0) {
            return sendJsonResponse(res, { success: false, error: 'NOT_FOUND' }, 404);
          }
          return sendJsonResponse(res, { success: true, data: result.rows[0] });
        }
        const result = await client.query(
          'SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.created_at DESC'
        );
        return sendJsonResponse(res, { success: true, data: result.rows });
      }

      if (req.method === 'POST') {
        const purchase_number = generatePurchaseNumber();
        const insertPurchaseText = `
          INSERT INTO purchases (purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
        `;
        const purchaseResult = await client.query(insertPurchaseText, [
          purchase_number, body.supplier_id || null, body.status || 'received',
          body.subtotal || 0, body.discount_amt || 0, body.tax_amt || 0,
          body.total_amount || 0, body.paid_amount || 0, body.payment_method || 'cash', body.notes || null
        ]);

        const purchase = purchaseResult.rows[0];

        if (body.items && body.items.length > 0) {
          for (const item of body.items) {
            await client.query(
              'INSERT INTO purchase_items (purchase_id, product_id, name, qty, unit_cost, total) VALUES ($1, $2, $3, $4, $5, $6)',
              [purchase.id, item.product_id || null, item.name, item.qty, item.unit_cost, item.total]
            );

            if (item.product_id) {
              await client.query('UPDATE products SET stock_qty = stock_qty + $1, updated_at = now() WHERE id = $2', [item.qty, item.product_id]);
            }
          }
        }
        return sendJsonResponse(res, { success: true, data: purchase }, 201);
      }

      if (req.method === 'DELETE' && id) {
        await client.query('DELETE FROM purchases WHERE id = $1', [id]);
        return sendJsonResponse(res, { success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // === PURCHASE ITEMS ===
    if (table === 'purchase_items') {
      if (req.method === 'GET') {
        const purchaseId = url.searchParams.get('purchase_id');
        if (purchaseId) {
          const result = await client.query('SELECT * FROM purchase_items WHERE purchase_id = $1 ORDER BY created_at', [purchaseId]);
          return sendJsonResponse(res, { success: true, data: result.rows });
        }
        const result = await client.query('SELECT * FROM purchase_items ORDER BY created_at');
        return sendJsonResponse(res, { success: true, data: result.rows });
      }
    }

    // ==========================================
    // === [ EXPENSES ] ===
    // ==========================================
    if (table === 'expenses') {
      if (req.method === 'GET') {
        if (id) {
          const result = await client.query(
            'SELECT e.*, ec.name as category_name FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id WHERE e.id = $1',
            [id]
          );
          if (result.rows.length === 0) {
            return sendJsonResponse(res, { success: false, error: 'NOT_FOUND' }, 404);
          }
          return sendJsonResponse(res, { success: true, data: result.rows[0] });
        }
        const result = await client.query(
          'SELECT e.*, ec.name as category_name FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id ORDER BY e.expense_date DESC'
        );
        return sendJsonResponse(res, { success: true, data: result.rows });
      }

      if (req.method === 'POST') {
        const insertText = `
          INSERT INTO expenses (category_id, description, amount, paid_by, receipt_url, expense_date)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `;
        const result = await client.query(insertText, [
          body.category_id || null, body.description, body.amount,
          body.paid_by || null, body.receipt_url || null, body.expense_date || null
        ]);
        return sendJsonResponse(res, { success: true, data: result.rows[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const updateText = `
          UPDATE expenses SET
            category_id = COALESCE($1, category_id), description = COALESCE($2, description), amount = COALESCE($3, amount),
            paid_by = COALESCE($4, paid_by), receipt_url = COALESCE($5, receipt_url), expense_date = COALESCE($6, expense_date)
          WHERE id = $7 RETURNING *
        `;
        const result = await client.query(updateText, [
          body.category_id ?? null, body.description ?? null, body.amount ?? null,
          body.paid_by ?? null, body.receipt_url ?? null, body.expense_date ?? null, id
        ]);
        return sendJsonResponse(res, { success: true, data: result.rows[0] });
      }

      if (req.method === 'DELETE' && id) {
        await client.query('DELETE FROM expenses WHERE id = $1', [id]);
        return sendJsonResponse(res, { success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // === EXPENSE CATEGORIES ===
    if (table === 'expense-categories' || table === 'expense_categories') {
      if (req.method === 'GET') {
        const result = await client.query('SELECT * FROM expense_categories ORDER BY name');
        return sendJsonResponse(res, { success: true, data: result.rows });
      }
    }

    // ==========================================
    // === [ WHATSAPP QUEUE ] ===
    // ==========================================
    if (table === 'whatsapp' || table === 'whatsapp_queue') {
      if (req.method === 'GET') {
        const status = url.searchParams.get('status');
        if (status === 'pending') {
          const result = await client.query("SELECT * FROM whatsapp_queue WHERE status = 'pending' ORDER BY created_at");
          return sendJsonResponse(res, { success: true, data: result.rows });
        }
        const result = await client.query('SELECT * FROM whatsapp_queue ORDER BY created_at DESC');
        return sendJsonResponse(res, { success: true, data: result.rows });
      }

      if (req.method === 'POST') {
        const insertText = `
          INSERT INTO whatsapp_queue (recipient, message, template_name, template_params, created_by)
          VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        const result = await client.query(insertText, [
          body.recipient, body.message, body.template_name || null,
          body.template_params || null, user?.userId || null
        ]);
        return sendJsonResponse(res, { success: true, data: result.rows[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const updateText = `
          UPDATE whatsapp_queue SET
            status = COALESCE($1, status), error_message = COALESCE($2, error_message),
            sent_at = CASE WHEN $1 = 'sent' THEN now() ELSE sent_at END
          WHERE id = $3 RETURNING *
        `;
        const result = await client.query(updateText, [body.status ?? null, body.error_message ?? null, id]);
        return sendJsonResponse(res, { success: true, data: result.rows[0] });
      }
    }

    // ==========================================
    // === [ DASHBOARD STATS ] ===
    // ==========================================
    if (action === 'dashboard' || table === 'dashboard') {
      const today = new Date().toISOString().slice(0, 10);

      const todayStats = await client.query(
        "SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count FROM invoices WHERE created_at >= $1 AND status != 'cancelled'",
        [today + 'T00:00:00']
      );

      const totalStats = await client.query("SELECT COALESCE(SUM(total_amount), 0) as total_revenue, COUNT(*) as total_count FROM invoices WHERE status != 'cancelled'");
      const purchaseTotal = await client.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM purchases WHERE status != 'cancelled'");
      const expenseTotal = await client.query("SELECT COALESCE(SUM(amount), 0) as total FROM expenses");
      const productCount = await client.query("SELECT COUNT(*) as count FROM products WHERE is_active = true");
      
      const recentInvoices = await client.query(
        'SELECT i.*, c.name as customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id ORDER BY i.created_at DESC LIMIT 5'
      );

      const stats = {
        todaySales: Number(todayStats.rows[0]?.today_sales || 0),
        todayCount: Number(todayStats.rows[0]?.today_count || 0),
        totalRevenue: Number(totalStats.rows[0]?.total_revenue || 0),
        netProfit: Number(totalStats.rows[0]?.total_revenue || 0) - Number(purchaseTotal.rows[0]?.total || 0) - Number(expenseTotal.rows[0]?.total || 0),
        productCount: Number(productCount.rows[0]?.count || 0),
        totalExpenses: Number(expenseTotal.rows[0]?.total || 0)
      };

      return sendJsonResponse(res, {
        success: true,
        data: { stats, recentInvoices: recentInvoices.rows }
      });
    }

    // ==========================================
    // === [ AUDIT LOG ] ===
    // ==========================================
    if (table === 'audit_log') {
      if (req.method === 'GET') {
        const limit = url.searchParams.get('limit') || 100;
        const result = await client.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1', [parseInt(limit)]);
        return sendJsonResponse(res, { success: true, data: result.rows });
      }

      if (req.method === 'POST') {
        await client.query(
          'INSERT INTO audit_log (user_id, table_name, record_id, action, old_values, new_values, ip_address) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [user?.userId || null, body.table_name, body.record_id || null, body.action, body.old_values || null, body.new_values || null, body.ip_address || null]
        );
        return sendJsonResponse(res, { success: true });
      }
    }

    // ==========================================
    // === [ SYNC QUEUE ] ===
    // ==========================================
    if (table === 'sync_queue') {
      if (req.method === 'GET') {
        const pendingOnly = url.searchParams.get('pending') === 'true';
        if (pendingOnly) {
          const result = await client.query('SELECT * FROM sync_queue WHERE synced = false ORDER BY created_at');
          return sendJsonResponse(res, { success: true, data: result.rows });
        }
        const result = await client.query('SELECT * FROM sync_queue ORDER BY created_at DESC');
        return sendJsonResponse(res, { success: true, data: result.rows });
      }

      if (req.method === 'POST') {
        const insertText = `
          INSERT INTO sync_queue (user_id, table_name, record_id, operation, data)
          VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        const result = await client.query(insertText, [
          user?.userId || null, body.table_name, body.record_id, body.operation, body.data || null
        ]);
        return sendJsonResponse(res, { success: true, data: result.rows[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        await client.query('UPDATE sync_queue SET synced = true, synced_at = now() WHERE id = $1', [id]);
        return sendJsonResponse(res, { success: true });
      }
    }

    return sendJsonResponse(res, { success: false, error: 'UNKNOWN_TABLE', message: 'الجدول غير معروف' }, 400);

  } catch (error) {
    console.error('Data API Error:', error);
    return sendJsonResponse(res, {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message
    }, 500);
  } finaly {
    // إغلاق العميل بأمان لإعادة الـ connections لـ Neon pool
    await client.end().catch(err => console.error('Error closing client:', err));
  }
}
