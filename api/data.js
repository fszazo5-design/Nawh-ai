import { getDb, initializeDatabase } from './_db.js';

/**
 * Data API Endpoint
 * Unified API for all database operations: products, customers, suppliers, invoices, etc.
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

// Response helper
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
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

// Parse query filters
function parseFilters(url) {
  const params = new URL(url).searchParams;
  const filters = {};
  for (const [key, value] of params.entries()) {
    if (value) filters[key] = value;
  }
  return filters;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const sql = getDb();
  const url = new URL(req.url);
  const table = url.searchParams.get('table');
  const id = url.searchParams.get('id');
  const action = url.searchParams.get('action');

  // Initialize database endpoint (ضبط استلام تهيئة قاعدة البيانات عبر الـ table والـ action)
  if (action === 'init-db' || table === 'init-db') {
    try {
      const result = await initializeDatabase();
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // Auth check for protected routes
  const authHeader = req.headers.get('authorization');
  const user = verifyToken(authHeader);
  if (!user && req.method !== 'GET') {
    return jsonResponse({ success: false, error: 'UNAUTHORIZED', message: 'غير مصرح' }, 401);
  }

  try {
    // === PRODUCTS ===
    if (table === 'products') {
      if (req.method === 'GET') {
        const filters = parseFilters(url);
        let query = sql`SELECT * FROM products WHERE 1=1`;

        if (filters.category) {
          query = sql`SELECT * FROM products WHERE category = ${filters.category}`;
        }
        if (filters.barcode) {
          query = sql`SELECT * FROM products WHERE barcode = ${filters.barcode} LIMIT 1`;
        }
        if (filters.search) {
          query = sql`
            SELECT * FROM products
            WHERE name ILIKE ${'%' + filters.search + '%'}
               OR barcode ILIKE ${'%' + filters.search + '%'}
            ORDER BY created_at DESC
          `;
        }
        if (filters.is_active !== undefined) {
          query = sql`SELECT * FROM products WHERE is_active = ${filters.is_active === 'true'} ORDER BY created_at DESC`;
        }
        if (!filters.category && !filters.barcode && !filters.search && !filters.is_active) {
          query = sql`SELECT * FROM products ORDER BY created_at DESC`;
        }

        return jsonResponse({ success: true, data: query });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        const result = await sql`
          INSERT INTO products (name, barcode, category, unit, cost_price, sell_price, stock_qty, min_stock_qty, is_active, image_url, notes)
          VALUES (${body.name}, ${body.barcode || null}, ${body.category || null}, ${body.unit || 'قطعة'},
                  ${body.cost_price || 0}, ${body.sell_price || 0}, ${body.stock_qty || 0}, ${body.min_stock_qty || 0},
                  ${body.is_active ?? true}, ${body.image_url || null}, ${body.notes || null})
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const body = await req.json();
        const result = await sql`
          UPDATE products SET
            name = COALESCE(${body.name}, name),
            barcode = COALESCE(${body.barcode}, barcode),
            category = COALESCE(${body.category}, category),
            unit = COALESCE(${body.unit}, unit),
            cost_price = COALESCE(${body.cost_price}, cost_price),
            sell_price = COALESCE(${body.sell_price}, sell_price),
            stock_qty = COALESCE(${body.stock_qty}, stock_qty),
            min_stock_qty = COALESCE(${body.min_stock_qty}, min_stock_qty),
            is_active = COALESCE(${body.is_active}, is_active),
            image_url = COALESCE(${body.image_url}, image_url),
            notes = COALESCE(${body.notes}, notes),
            updated_at = now()
          WHERE id = ${id}
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await sql`DELETE FROM products WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // === CUSTOMERS ===
    if (table === 'customers') {
      if (req.method === 'GET') {
        const search = url.searchParams.get('search');
        if (search) {
          const data = await sql`
            SELECT * FROM customers
            WHERE name ILIKE ${'%' + search + '%'}
               OR phone ILIKE ${'%' + search + '%'}
            ORDER BY created_at DESC
          `;
          return jsonResponse({ success: true, data });
        }
        const data = await sql`SELECT * FROM customers ORDER BY created_at DESC`;
        return jsonResponse({ success: true, data });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        const result = await sql`
          INSERT INTO customers (name, phone, email, address, tax_id, credit_limit, notes)
          VALUES (${body.name}, ${body.phone || null}, ${body.email || null}, ${body.address || null},
                  ${body.tax_id || null}, ${body.credit_limit || 0}, ${body.notes || null})
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const body = await req.json();
        const result = await sql`
          UPDATE customers SET
            name = COALESCE(${body.name}, name),
            phone = COALESCE(${body.phone}, phone),
            email = COALESCE(${body.email}, email),
            address = COALESCE(${body.address}, address),
            tax_id = COALESCE(${body.tax_id}, tax_id),
            credit_limit = COALESCE(${body.credit_limit}, credit_limit),
            notes = COALESCE(${body.notes}, notes),
            is_active = COALESCE(${body.is_active}, is_active)
          WHERE id = ${id}
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await sql`DELETE FROM customers WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // === SUPPLIERS ===
    if (table === 'suppliers') {
      if (req.method === 'GET') {
        const search = url.searchParams.get('search');
        if (search) {
          const data = await sql`
            SELECT * FROM suppliers
            WHERE name ILIKE ${'%' + search + '%'}
               OR phone ILIKE ${'%' + search + '%'}
            ORDER BY created_at DESC
          `;
          return jsonResponse({ success: true, data });
        }
        const data = await sql`SELECT * FROM suppliers ORDER BY created_at DESC`;
        return jsonResponse({ success: true, data });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        const result = await sql`
          INSERT INTO suppliers (name, phone, email, address, tax_id, credit_limit, notes)
          VALUES (${body.name}, ${body.phone || null}, ${body.email || null}, ${body.address || null},
                  ${body.tax_id || null}, ${body.credit_limit || 0}, ${body.notes || null})
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const body = await req.json();
        const result = await sql`
          UPDATE suppliers SET
            name = COALESCE(${body.name}, name),
            phone = COALESCE(${body.phone}, phone),
            email = COALESCE(${body.email}, email),
            address = COALESCE(${body.address}, address),
            tax_id = COALESCE(${body.tax_id}, tax_id),
            credit_limit = COALESCE(${body.credit_limit}, credit_limit),
            notes = COALESCE(${body.notes}, notes),
            is_active = COALESCE(${body.is_active}, is_active)
          WHERE id = ${id}
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await sql`DELETE FROM suppliers WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // === INVOICES ===
    if (table === 'invoices') {
      if (req.method === 'GET') {
        if (id) {
          const invoices = await sql`
            SELECT i.*, c.name as customer_name
            FROM invoices i
            LEFT JOIN customers c ON i.customer_id = c.id
            WHERE i.id = ${id}
          `;
          if (invoices.length === 0) {
            return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          }
          return jsonResponse({ success: true, data: invoices[0] });
        }

        const data = await sql`
          SELECT i.*, c.name as customer_name
          FROM invoices i
          LEFT JOIN customers c ON i.customer_id = c.id
          ORDER BY i.created_at DESC
        `;
        return jsonResponse({ success: true, data });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        const invoice_number = generateInvoiceNumber();

        const result = await sql`
          INSERT INTO invoices (invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes)
          VALUES (${invoice_number}, ${body.customer_id || null}, ${body.status || 'paid'},
                  ${body.subtotal || 0}, ${body.discount_amt || 0}, ${body.tax_rate || 0}, ${body.tax_amt || 0},
                  ${body.total_amount || 0}, ${body.paid_amount || 0}, ${body.payment_method || 'cash'}, ${body.notes || null})
          RETURNING *
        `;

        const invoice = result[0];

        // Insert invoice items
        if (body.items && body.items.length > 0) {
          for (const item of body.items) {
            await sql`
              INSERT INTO invoice_items (invoice_id, product_id, name, qty, unit_price, discount, total)
              VALUES (${invoice.id}, ${item.product_id || null}, ${item.name}, ${item.qty},
                      ${item.unit_price}, ${item.discount || 0}, ${item.total})
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
        if (invoiceId) {
          const data = await sql`
            SELECT * FROM invoice_items WHERE invoice_id = ${invoiceId} ORDER BY created_at
          `;
          return jsonResponse({ success: true, data });
        }
        const data = await sql`SELECT * FROM invoice_items ORDER BY created_at`;
        return jsonResponse({ success: true, data });
      }
    }

    // === PURCHASES ===
    if (table === 'purchases') {
      if (req.method === 'GET') {
        if (id) {
          const purchases = await sql`
            SELECT p.*, s.name as supplier_name
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.id = ${id}
          `;
          if (purchases.length === 0) {
            return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          }
          return jsonResponse({ success: true, data: purchases[0] });
        }

        const data = await sql`
          SELECT p.*, s.name as supplier_name
          FROM purchases p
          LEFT JOIN suppliers s ON p.supplier_id = s.id
          ORDER BY p.created_at DESC
        `;
        return jsonResponse({ success: true, data });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        const purchase_number = generatePurchaseNumber();

        const result = await sql`
          INSERT INTO purchases (purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes)
          VALUES (${purchase_number}, ${body.supplier_id || null}, ${body.status || 'received'},
                  ${body.subtotal || 0}, ${body.discount_amt || 0}, ${body.tax_amt || 0},
                  ${body.total_amount || 0}, ${body.paid_amount || 0}, ${body.payment_method || 'cash'}, ${body.notes || null})
          RETURNING *
        `;

        const purchase = result[0];

        // Insert purchase items and update stock
        if (body.items && body.items.length > 0) {
          for (const item of body.items) {
            await sql`
              INSERT INTO purchase_items (purchase_id, product_id, name, qty, unit_cost, total)
              VALUES (${purchase.id}, ${item.product_id || null}, ${item.name}, ${item.qty},
                      ${item.unit_cost}, ${item.total})
            `;

            // Update product stock
            if (item.product_id) {
              await sql`
                UPDATE products SET stock_qty = stock_qty + ${item.qty}, updated_at = now()
                WHERE id = ${item.product_id}
              `;
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
        if (purchaseId) {
          const data = await sql`
            SELECT * FROM purchase_items WHERE purchase_id = ${purchaseId} ORDER BY created_at
          `;
          return jsonResponse({ success: true, data });
        }
        const data = await sql`SELECT * FROM purchase_items ORDER BY created_at`;
        return jsonResponse({ success: true, data });
      }
    }

    // === EXPENSES ===
    if (table === 'expenses') {
      if (req.method === 'GET') {
        if (id) {
          const expenses = await sql`
            SELECT e.*, ec.name as category_name
            FROM expenses e
            LEFT JOIN expense_categories ec ON e.category_id = ec.id
            WHERE e.id = ${id}
          `;
          if (expenses.length === 0) {
            return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          }
          return jsonResponse({ success: true, data: expenses[0] });
        }

        const data = await sql`
          SELECT e.*, ec.name as category_name
          FROM expenses e
          LEFT JOIN expense_categories ec ON e.category_id = ec.id
          ORDER BY e.expense_date DESC
        `;
        return jsonResponse({ success: true, data });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        const result = await sql`
          INSERT INTO expenses (category_id, description, amount, paid_by, receipt_url, expense_date)
          VALUES (${body.category_id || null}, ${body.description}, ${body.amount},
                  ${body.paid_by || null}, ${body.receipt_url || null}, ${body.expense_date || null})
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const body = await req.json();
        const result = await sql`
          UPDATE expenses SET
            category_id = COALESCE(${body.category_id}, category_id),
            description = COALESCE(${body.description}, description),
            amount = COALESCE(${body.amount}, amount),
            paid_by = COALESCE(${body.paid_by}, paid_by),
            receipt_url = COALESCE(${body.receipt_url}, receipt_url),
            expense_date = COALESCE(${body.expense_date}, expense_date)
          WHERE id = ${id}
          RETURNING *
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
        const data = await sql`SELECT * FROM expense_categories ORDER BY name`;
        return jsonResponse({ success: true, data });
      }
    }

    // === WHATSAPP QUEUE (تم ضبطه لاستلام معامل whatsapp المتوافق مع الـ Frontend) ===
    if (table === 'whatsapp' || table === 'whatsapp_queue') {
      if (req.method === 'GET') {
        const status = url.searchParams.get('status');
        if (status === 'pending') {
          const data = await sql`
            SELECT * FROM whatsapp_queue WHERE status = 'pending' ORDER BY created_at
          `;
          return jsonResponse({ success: true, data });
        }
        const data = await sql`SELECT * FROM whatsapp_queue ORDER BY created_at DESC`;
        return jsonResponse({ success: true, data });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        const result = await sql`
          INSERT INTO whatsapp_queue (recipient, message, template_name, template_params, created_by)
          VALUES (${body.recipient}, ${body.message}, ${body.template_name || null},
                  ${body.template_params || null}, ${user?.userId || null})
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const body = await req.json();
        const result = await sql`
          UPDATE whatsapp_queue SET
            status = COALESCE(${body.status}, status),
            error_message = COALESCE(${body.error_message}, error_message),
            sent_at = CASE WHEN ${body.status} = 'sent' THEN now() ELSE sent_at END
          WHERE id = ${id}
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }
    }

    // === DASHBOARD STATS (ضبط معالجة لوحة البيانات سواء أرسلت كـ table أو action) ===
    if (action === 'dashboard' || table === 'dashboard') {
      const today = new Date().toISOString().slice(0, 10);

      const todayStats = await sql`
        SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count
        FROM invoices WHERE created_at >= ${today + 'T00:00:00'} AND status != 'cancelled'
      `;

      const totalStats = await sql`
        SELECT COALESCE(SUM(total_amount), 0) as total_revenue, COUNT(*) as total_count
        FROM invoices WHERE status != 'cancelled'
      `;

      const purchaseTotal = await sql`
        SELECT COALESCE(SUM(total_amount), 0) as total FROM purchases WHERE status != 'cancelled'
      `;

      const expenseTotal = await sql`
        SELECT COALESCE(SUM(amount), 0) as total FROM expenses
      `;

      const productCount = await sql`
        SELECT COUNT(*) as count FROM products WHERE is_active = true
      `;

      const recentInvoices = await sql`
        SELECT i.*, c.name as customer_name
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        ORDER BY i.created_at DESC LIMIT 5
      `;

      const stats = {
        todaySales: Number(todayStats[0]?.today_sales || 0),
        todayCount: Number(todayStats[0]?.today_count || 0),
        totalRevenue: Number(totalStats[0]?.total_revenue || 0),
        netProfit: Number(totalStats[0]?.total_revenue || 0) - Number(purchaseTotal[0]?.total || 0) - Number(expenseTotal[0]?.total || 0),
        productCount: Number(productCount[0]?.count || 0),
        totalExpenses: Number(expenseTotal[0]?.total || 0)
      };

      return jsonResponse({
        success: true,
        data: { stats, recentInvoices: recentInvoices }
      });
    }

    // === AUDIT LOG ===
    if (table === 'audit_log') {
      if (req.method === 'GET') {
        const limit = url.searchParams.get('limit') || 100;
        const data = await sql`
          SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ${parseInt(limit)}
        `;
        return jsonResponse({ success: true, data });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        await sql`
          INSERT INTO audit_log (user_id, table_name, record_id, action, old_values, new_values, ip_address)
          VALUES (${user?.userId || null}, ${body.table_name}, ${body.record_id || null},
                  ${body.action}, ${body.old_values || null}, ${body.new_values || null},
                  ${body.ip_address || null})
        `;
        return jsonResponse({ success: true });
      }
    }

    // === SYNC QUEUE (for offline support) ===
    if (table === 'sync_queue') {
      if (req.method === 'GET') {
        const pendingOnly = url.searchParams.get('pending') === 'true';
        if (pendingOnly) {
          const data = await sql`
            SELECT * FROM sync_queue WHERE synced = false ORDER BY created_at
          `;
          return jsonResponse({ success: true, data });
        }
        const data = await sql`SELECT * FROM sync_queue ORDER BY created_at DESC`;
        return jsonResponse({ success: true, data });
      }

      if (req.method === 'POST') {
        const body = await req.json();
        const result = await sql`
          INSERT INTO sync_queue (user_id, table_name, record_id, operation, data)
          VALUES (${user?.userId || null}, ${body.table_name}, ${body.record_id},
                  ${body.operation}, ${body.data || null})
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        await sql`
          UPDATE sync_queue SET synced = true, synced_at = now() WHERE id = ${id}
        `;
        return jsonResponse({ success: true });
      }
    }

    return jsonResponse({ success: false, error: 'UNKNOWN_TABLE', message: 'الجدول غير معروف' }, 400);

  } catch (error) {
    console.error('Data API Error:', error);
    return jsonResponse({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message
    }, 500);
  }
}
