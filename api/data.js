import { getDb, initializeDatabase } from './_db.js';

// CORS Configuration headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

// Response structured helper
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

// دالة فحص وفك التوكن واستخراج البيانات (تأكد من مطابقتها لنظام التوكن لديك)
function verifyToken(authHeader) {
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
}

// دالة تنظيف الإيميل وتحويله لاسم السكيمّا المطابق لكود الـ Auth
function convertEmailToSchemaName(email) {
  if (!email) return 'public';
  const cleanEmail = email.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
  return `schema_${cleanEmail}`;
}

// Generate invoice serial numbers securely
function generateInvoiceNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${date}-${random}`;
}

function generatePurchaseNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PO-${date}-${random}`;
}

// Safe multi-platform filter parser
function parseFilters(urlText) {
  const queryString = urlText.includes('?') ? urlText.split('?')[1] : urlText;
  const params = new URLSearchParams(queryString);
  const filters = {};
  for (const [key, value] of params.entries()) {
    if (value) filters[key] = value;
  }
  return filters;
}

// Master Handler managing unified data router
async function dataRouter(req) {
  const sql = getDb();
  const urlText = req.url;
  const filters = parseFilters(urlText);
  
  const table = filters.table;
  const id = filters.id;
  const action = filters.action;

  // Initialize database endpoint
  if (action === 'init-db') {
    try {
      const result = await initializeDatabase();
      return jsonResponse(result);
    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // 1. التحقق من التوكن واستخراج بيانات المستخدم (الإيميل ضروري للسكيمّا)
  const authHeader = req.headers.get('authorization');
  const user = verifyToken(authHeader);
  
  if (!user && req.method !== 'GET') {
    return jsonResponse({ success: false, error: 'UNAUTHORIZED', message: 'غير مصرح للقيام بهذا الإجراء' }, 401);
  }

  try {
    // 2. 💡 الحل السحري: توجيه قاعدة البيانات للسكيمّا الخاصة بالمستخدم الحالي فوراً 💡
    if (user && user.email) {
      const userSchema = convertEmailToSchemaName(user.email);
      // إجبار هذا الاتصال الحالي على القراءة والكتابة داخل سكيمّا المستخدم
      await sql.unsafe(`SET search_path TO ${userSchema}, public`);
    }

    // === PRODUCTS ===
    if (table === 'products') {
      if (req.method === 'GET') {
        let query;
        if (filters.category) {
          query = await sql`SELECT * FROM products WHERE category = ${filters.category}`;
        } else if (filters.barcode) {
          query = await sql`SELECT * FROM products WHERE barcode = ${filters.barcode} LIMIT 1`;
        } else if (filters.search) {
          query = await sql`
            SELECT * FROM products
            WHERE name ILIKE ${'%' + filters.search + '%'}
               OR barcode ILIKE ${'%' + filters.search + '%'}
            ORDER BY created_at DESC
          `;
        } else if (filters.is_active !== undefined) {
          query = await sql`SELECT * FROM products WHERE is_active = ${filters.is_active === 'true'} ORDER BY created_at DESC`;
        } else {
          query = await sql`SELECT * FROM products ORDER BY created_at DESC`;
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
        if (filters.search) {
          const data = await sql`
            SELECT * FROM customers
            WHERE name ILIKE ${'%' + filters.search + '%'}
               OR phone ILIKE ${'%' + filters.search + '%'}
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
        if (filters.search) {
          const data = await sql`
            SELECT * FROM suppliers
            WHERE name ILIKE ${'%' + filters.search + '%'}
               OR phone ILIKE ${'%' + filters.search + '%'}
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

        if (body.items && body.items.length > 0) {
          for (const item of body.items) {
            await sql`
              INSERT INTO invoice_items (invoice_id, product_id, name, qty, unit_price, discount, total)
              VALUES (${invoice.id}, ${item.product_id || null}, ${item.name}, ${item.qty},
                      ${item.unit_price}, ${item.discount || 0}, ${item.total})
            `;
            if (item.product_id) {
              await sql`
                UPDATE products SET stock_qty = stock_qty - ${item.qty}, updated_at = now()
                WHERE id = ${item.product_id}
              `;
            }
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
    if (table === 'invoice_items') {
      if (req.method === 'GET') {
        const invoiceId = filters.invoice_id;
        if (invoiceId) {
          const data = await sql`SELECT * FROM invoice_items WHERE invoice_id = ${invoiceId} ORDER BY created_at`;
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

        if (body.items && body.items.length > 0) {
          for (const item of body.items) {
            await sql`
              INSERT INTO purchase_items (purchase_id, product_id, name, qty, unit_cost, total)
              VALUES (${purchase.id}, ${item.product_id || null}, ${item.name}, ${item.qty},
                      ${item.unit_cost}, ${item.total})
            `;
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
        const purchaseId = filters.purchase_id;
        if (purchaseId) {
          const data = await sql`SELECT * FROM purchase_items WHERE purchase_id = ${purchaseId} ORDER BY created_at`;
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
    if (table === 'expense_categories') {
      if (req.method === 'GET') {
        const data = await sql`SELECT * FROM expense_categories ORDER BY name`;
        return jsonResponse({ success: true, data });
      }
    }

    // === DASHBOARD STATS ===
    if (action === 'dashboard') {
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
        data: { stats, recentInvoices }
      });
    }

    return jsonResponse({ success: false, error: 'UNKNOWN_TABLE', message: 'الجدول المطلوب غير موجود' }, 400);

  } catch (error) {
    console.error('Data API Error:', error);
    return jsonResponse({
      success: false,
      error: 'SERVER_ERROR',
      message: error.message
    }, 500);
  }
}

// RESTful Web Fetch Exports for modern Vercel Serverless Architecture
export async function GET(req) { return await dataRouter(req); }
export async function POST(req) { return await dataRouter(req); }
export async function PUT(req) { return await dataRouter(req); }
export async function DELETE(req) { return await dataRouter(req); }
export async function OPTIONS() { return new Response(null, { status: 200, headers: corsHeaders }); }
