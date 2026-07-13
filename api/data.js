import { getDb, initializeDatabase } from './_db.js';

/**
 * Data API Endpoint (Vercel Web Fetch API Style)
 * Unified API for all database operations with Auto-Trigger Support.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, X-Schema-Name',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

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

async function handleRequest(req) {
  const host = typeof req.headers.get === 'function' ? req.headers.get('host') : (req.headers?.host || 'localhost');
  const authHeader = typeof req.headers.get === 'function' ? req.headers.get('authorization') : (req.headers?.authorization);
  const clientSchemaHeader = typeof req.headers.get === 'function' ? req.headers.get('x-schema-name') : (req.headers?.['x-schema-name']);

  const url = new URL(req.url, `https://${host}`);
  const table = url.searchParams.get('table');
  const id = url.searchParams.get('id');
  const action = url.searchParams.get('action');

  const user = verifyToken(authHeader);

  try {
    // معالجة تهيئة السكيما وزرع جداولها وأنظمتها التلقائية
    if (action === 'init-db' || table === 'init-db') {
      const schemaToInit = user?.schemaName || clientSchemaHeader || url.searchParams.get('schema');
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

    const targetSchema = user?.schemaName || clientSchemaHeader;
    if (!targetSchema) {
      return jsonResponse({ success: false, error: 'UNAUTHORIZED', message: 'جلسة العمل منتهية أو غير صالحة' }, 401);
    }

    const safeSchemaName = targetSchema.replace(/[^a-zA-Z0-9_]/g, '');
    const sql = getDb(safeSchemaName);

    // محرك تحويل السكيما المطور والمحمي بنسبة 100% يمنع أخطاء الـ UPDATE والـ JOIN
    const schema = (strings, ...values) => {
      const newStrings = strings.map(str => {
        return str.replace(
          /(FROM|INSERT INTO|UPDATE|LEFT JOIN|JOIN)\s+(["']?)([a-zA-Z0-9_]+)\2/gi, 
          (match, op, quote, tableName) => {
            const lowerTable = tableName.toLowerCase();
            if (['select', 'where', 'set', 'on', 'and', 'or'].includes(lowerTable)) return match;
            return `${op} "${safeSchemaName}"."${tableName}"`;
          }
        );
      });
      return sql(newStrings, ...values);
    };

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
          rows = await schema`SELECT * FROM products WHERE category = ${category}`;
        } else if (barcode) {
          rows = await schema`SELECT * FROM products WHERE barcode = ${barcode} LIMIT 1`;
        } else if (search) {
          const searchParam = `%${search}%`;
          rows = await schema`SELECT * FROM products WHERE name ILIKE ${searchParam} OR barcode ILIKE ${searchParam} ORDER BY created_at DESC`;
        } else if (is_active !== null && is_active !== undefined) {
          rows = await schema`SELECT * FROM products WHERE is_active = ${is_active === 'true'} ORDER BY created_at DESC`;
        } else {
          rows = await schema`SELECT * FROM products ORDER BY created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }

      if (req.method === 'POST') {
        const pId = crypto.randomUUID();
        const result = await schema`
          INSERT INTO products (id, name, barcode, category, unit, cost_price, sell_price, stock_qty, min_stock_qty, is_active, image_url, notes)
          VALUES (${pId}, ${body.name}, ${body.barcode || null}, ${body.category || null}, ${body.unit || 'قطعة'}, ${body.cost_price || 0}, ${body.sell_price || 0}, ${body.stock_qty || 0}, ${body.min_stock_qty || 0}, ${body.is_active ?? true}, ${body.image_url || null}, ${body.notes || null})
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const result = await schema`
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
        await schema`DELETE FROM products WHERE id = ${id}`;
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
          rows = await schema`SELECT * FROM customers WHERE name ILIKE ${searchParam} OR phone ILIKE ${searchParam} ORDER BY created_at DESC`;
        } else {
          rows = await schema`SELECT * FROM customers ORDER BY created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }

      if (req.method === 'POST') {
        const cId = crypto.randomUUID();
        const result = await schema`
          INSERT INTO customers (id, name, phone, email, address, tax_id, credit_limit, notes)
          VALUES (${cId}, ${body.name}, ${body.phone || null}, ${body.email || null}, ${body.address || null}, ${body.tax_id || null}, ${body.credit_limit || 0}, ${body.notes || null}) RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const result = await schema`
          UPDATE customers SET
            name = COALESCE(${body.name ?? null}, name), phone = COALESCE(${body.phone ?? null}, phone), email = COALESCE(${body.email ?? null}, email),
            address = COALESCE(${body.address ?? null}, address), tax_id = COALESCE(${body.tax_id ?? null}, tax_id), credit_limit = COALESCE(${body.credit_limit ?? null}, credit_limit),
            notes = COALESCE(${body.notes ?? null}, notes), is_active = COALESCE(${body.is_active ?? null}, is_active)
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await schema`DELETE FROM customers WHERE id = ${id}`;
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
          rows = await schema`SELECT * FROM suppliers WHERE name ILIKE ${searchParam} OR phone ILIKE ${searchParam} ORDER BY created_at DESC`;
        } else {
          rows = await schema`SELECT * FROM suppliers ORDER BY created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }

      if (req.method === 'POST') {
        const sId = crypto.randomUUID();
        const result = await schema`
          INSERT INTO suppliers (id, name, phone, email, address, tax_id, credit_limit, notes)
          VALUES (${sId}, ${body.name}, ${body.phone || null}, ${body.email || null}, ${body.address || null}, ${body.tax_id || null}, ${body.credit_limit || 0}, ${body.notes || null}) RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const result = await schema`
          UPDATE suppliers SET
            name = COALESCE(${body.name ?? null}, name), phone = COALESCE(${body.phone ?? null}, phone), email = COALESCE(${body.email ?? null}, email),
            address = COALESCE(${body.address ?? null}, address), tax_id = COALESCE(${body.tax_id ?? null}, tax_id), credit_limit = COALESCE(${body.credit_limit ?? null}, credit_limit),
            notes = COALESCE(${body.notes ?? null}, notes), is_active = COALESCE(${body.is_active ?? null}, is_active)
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await schema`DELETE FROM suppliers WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    // ==========================================
    // === [ INVOICES ] ===
    // ==========================================
    if (table === 'invoices') {
      if (req.method === 'GET') {
        if (id) {
          const result = await schema`SELECT i.*, c.name as customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.id = ${id}`;
          if (result.length === 0) return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          return jsonResponse({ success: true, data: result[0] });
        }
        const result = await schema`SELECT i.*, c.name as customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id ORDER BY i.created_at DESC`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        const invoice_number = generateInvoiceNumber();
        const invId = crypto.randomUUID();
        
        const invoiceResult = await schema`
          INSERT INTO invoices (id, invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes)
          VALUES (${invId}, ${invoice_number}, ${body.customer_id || null}, ${body.status || 'paid'}, ${body.subtotal || 0}, ${body.discount_amt || 0}, ${body.tax_rate || 0}, ${body.tax_amt || 0}, ${body.total_amount || 0}, ${body.paid_amount || 0}, ${body.payment_method || 'cash'}, ${body.notes || null}) RETURNING *
        `;
        const invoice = invoiceResult[0];

        if (body.items && body.items.length > 0) {
          for (const item of body.items) {
            const itemId = crypto.randomUUID();
            await schema`
              INSERT INTO invoice_items (id, invoice_id, product_id, name, qty, unit_price, discount, total) 
              VALUES (${itemId}, ${invoice.id}, ${item.product_id || null}, ${item.name}, ${item.qty}, ${item.unit_price}, ${item.discount || 0}, ${item.total})
            `;
          }
        }
        return jsonResponse({ success: true, data: invoice }, 201);
      }

      if (req.method === 'DELETE' && id) {
        await schema`DELETE FROM invoices WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    if (table === 'invoice-items' || table === 'invoice_items') {
      if (req.method === 'GET') {
        const invoiceId = url.searchParams.get('invoice_id');
        const result = invoiceId 
          ? await schema`SELECT * FROM invoice_items WHERE invoice_id = ${invoiceId} ORDER BY created_at`
          : await schema`SELECT * FROM invoice_items ORDER BY created_at`;
        return jsonResponse({ success: true, data: result });
      }
    }

    // ==========================================
    // === [ PURCHASES ] ===
    // ==========================================
    if (table === 'purchases') {
      if (req.method === 'GET') {
        if (id) {
          const result = await schema`SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.id = ${id}`;
          if (result.length === 0) return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          return jsonResponse({ success: true, data: result[0] });
        }
        const result = await schema`SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.created_at DESC`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        const purchase_number = generatePurchaseNumber();
        const purId = crypto.randomUUID();
        const purchaseResult = await schema`
          INSERT INTO purchases (id, purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes)
          VALUES (${purId}, ${purchase_number}, ${body.supplier_id || null}, ${body.status || 'received'}, ${body.subtotal || 0}, ${body.discount_amt || 0}, ${body.tax_amt || 0}, ${body.total_amount || 0}, ${body.paid_amount || 0}, ${body.payment_method || 'cash'}, ${body.notes || null}) RETURNING *
        `;
        const purchase = purchaseResult[0];

        if (body.items && body.items.length > 0) {
          for (const item of body.items) {
            const itemId = crypto.randomUUID();
            await schema`
              INSERT INTO purchase_items (id, purchase_id, product_id, name, qty, unit_cost, total) 
              VALUES (${itemId}, ${purchase.id}, ${item.product_id || null}, ${item.name}, ${item.qty}, ${item.unit_cost}, ${item.total})
            `;
          }
        }
        return jsonResponse({ success: true, data: purchase }, 201);
      }

      if (req.method === 'DELETE' && id) {
        await schema`DELETE FROM purchases WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم الحذف بنجاح' });
      }
    }

    if (table === 'purchase_items') {
      if (req.method === 'GET') {
        const purchaseId = url.searchParams.get('purchase_id');
        const result = purchaseId 
          ? await schema`SELECT * FROM purchase_items WHERE purchase_id = ${purchaseId} ORDER BY created_at`
          : await schema`SELECT * FROM purchase_items ORDER BY created_at`;
        return jsonResponse({ success: true, data: result });
      }
    }

    // ==========================================
    // === [ EXPENSES & DASHBOARD & OTHERS ] ===
    // ==========================================
    if (table === 'expenses') {
      if (req.method === 'GET') {
        const result = await schema`SELECT e.*, ec.name as category_name FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id ORDER BY e.expense_date DESC`;
        return jsonResponse({ success: true, data: result });
      }
      if (req.method === 'POST') {
        const expId = crypto.randomUUID();
        const result = await schema`INSERT INTO expenses (id, category_id, description, amount, paid_by, expense_date) VALUES (${expId}, ${body.category_id || null}, ${body.description}, ${body.amount}, ${body.paid_by || null}, ${body.expense_date || null}) RETURNING *`;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }
    }

    if (action === 'dashboard' || table === 'dashboard') {
      const today = new Date().toISOString().slice(0, 10) + 'T00:00:00';
      const todayStats = await schema`SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count FROM invoices WHERE created_at >= ${today} AND status != 'cancelled'`;
      const totalStats = await schema`SELECT COALESCE(SUM(total_amount), 0) as total_revenue FROM invoices WHERE status != 'cancelled'`;
      const productCount = await schema`SELECT COUNT(*) as count FROM products WHERE is_active = true`;
      
      return jsonResponse({ 
        success: true, 
        data: { 
          stats: { todaySales: Number(todayStats[0]?.today_sales || 0), todayCount: Number(todayStats[0]?.today_count || 0), totalRevenue: Number(totalStats[0]?.total_revenue || 0), productCount: Number(productCount[0]?.count || 0) },
          recentInvoices: [] 
        } 
      });
    }

    return jsonResponse({ success: false, error: 'UNKNOWN_TABLE' }, 400);
  } catch (error) {
    console.error('Data API Error:', error);
    return jsonResponse({ success: false, error: 'SERVER_ERROR', message: error.message }, 500);
  }
}

export async function GET(request) { return await handleRequest(request); }
export async function POST(request) { return await handleRequest(request); }
export async function PUT(request) { return await handleRequest(request); }
export async function DELETE(request) { return await handleRequest(request); }
export async function OPTIONS() { return new Response(null, { status: 200, headers: corsHeaders }); }
