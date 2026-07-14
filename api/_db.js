import { getDb } from './_db.js';

/**
 * Data API Endpoint for Vercel Serverless Functions
 * Handles all core operations smoothly with a compliant default function export.
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

/**
 * التصدير الافتراضي الرئيسي لـ Vercel (يجب أن يكون دالة مستقلة تستقبل طلب الـ Request)
 */
export default async function handleRequest(req) {
  // معالجة طلبات الـ CORS Preflight المبدئية تلقائياً
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const host = typeof req.headers.get === 'function' ? req.headers.get('host') : (req.headers?.host || 'localhost');
  const authHeader = typeof req.headers.get === 'function' ? req.headers.get('authorization') : (req.headers?.authorization);
  const clientSchemaHeader = typeof req.headers.get === 'function' ? req.headers.get('x-schema-name') : (req.headers?.['x-schema-name']);

  const url = new URL(req.url, `https://${host}`);
  const table = url.searchParams.get('table');
  const id = url.searchParams.get('id');
  const action = url.searchParams.get('action');

  const user = verifyToken(authHeader);

  try {
    // تحديد اسم السكيما المستهدفة ديناميكياً
    const targetSchema = user?.schemaName || clientSchemaHeader || url.searchParams.get('schema') || 'pos';
    const safeSchemaName = targetSchema.replace(/[^a-zA-Z0-9_]/g, '');
    const sql = getDb(safeSchemaName);

    // محرك تحويل وتوجيه السكيما الديناميكي لتجنب مشاكل الاستعلامات بدون سكيما صريحة
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
        if (id) {
          const result = await schema`SELECT * FROM products WHERE id = ${id}`;
          if (result.length === 0) return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          return jsonResponse({ success: true, data: result[0] });
        }
        const category = url.searchParams.get('category');
        const barcode = url.searchParams.get('barcode');
        const search = url.searchParams.get('search');
        
        let rows = [];
        if (category) {
          rows = await schema`SELECT * FROM products WHERE category = ${category} ORDER BY name ASC`;
        } else if (barcode) {
          rows = await schema`SELECT * FROM products WHERE barcode = ${barcode} LIMIT 1`;
        } else if (search) {
          const searchParam = `%${search}%`;
          rows = await schema`SELECT * FROM products WHERE name ILIKE ${searchParam} OR barcode ILIKE ${searchParam} ORDER BY name ASC`;
        } else {
          rows = await schema`SELECT * FROM products ORDER BY created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }

      if (req.method === 'POST') {
        const pId = crypto.randomUUID();
        const result = await schema`
          INSERT INTO products (id, name, barcode, category, unit, cost_price, sell_price, stock_qty, min_stock_qty, is_active, image_url, notes)
          VALUES (${pId}, ${body.name}, ${body.barcode || null}, ${body.category || null}, ${body.unit || 'قطعة'}, ${body.cost_price || 0}, ${body.sell_price || 0}, ${body.stock_qty || 0}, ${body.min_stock_qty || 5}, ${body.is_active ?? true}, ${body.image_url || null}, ${body.notes || null})
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const result = await schema`
          UPDATE products SET
            name = COALESCE(${body.name ?? null}, name), 
            barcode = COALESCE(${body.barcode ?? null}, barcode), 
            category = COALESCE(${body.category ?? null}, category),
            unit = COALESCE(${body.unit ?? null}, unit), 
            cost_price = COALESCE(${body.cost_price ?? null}, cost_price), 
            sell_price = COALESCE(${body.sell_price ?? null}, sell_price),
            stock_qty = COALESCE(${body.stock_qty ?? null}, stock_qty), 
            min_stock_qty = COALESCE(${body.min_stock_qty ?? null}, min_stock_qty), 
            is_active = COALESCE(${body.is_active ?? null}, is_active),
            image_url = COALESCE(${body.image_url ?? null}, image_url), 
            notes = COALESCE(${body.notes ?? null}, notes), 
            updated_at = now()
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await schema`DELETE FROM products WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم حذف المنتج بنجاح' });
      }
    }

    // ==========================================
    // === [ CUSTOMERS ] ===
    // ==========================================
    if (table === 'customers') {
      if (req.method === 'GET') {
        if (id) {
          const result = await schema`SELECT * FROM customers WHERE id = ${id}`;
          if (result.length === 0) return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          return jsonResponse({ success: true, data: result[0] });
        }
        const search = url.searchParams.get('search');
        let rows = [];
        if (search) {
          const searchParam = `%${search}%`;
          rows = await schema`SELECT * FROM customers WHERE name ILIKE ${searchParam} OR phone ILIKE ${searchParam} ORDER BY name ASC`;
        } else {
          rows = await schema`SELECT * FROM customers ORDER BY created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }

      if (req.method === 'POST') {
        const cId = crypto.randomUUID();
        const result = await schema`
          INSERT INTO customers (id, name, phone, email, address, tax_id, credit_limit, current_balance, notes, is_active)
          VALUES (${cId}, ${body.name}, ${body.phone || null}, ${body.email || null}, ${body.address || null}, ${body.tax_id || null}, ${body.credit_limit || 0}, ${body.current_balance || 0.00}, ${body.notes || null}, ${body.is_active ?? true}) 
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const result = await schema`
          UPDATE customers SET
            name = COALESCE(${body.name ?? null}, name), 
            phone = COALESCE(${body.phone ?? null}, phone), 
            email = COALESCE(${body.email ?? null}, email),
            address = COALESCE(${body.address ?? null}, address), 
            tax_id = COALESCE(${body.tax_id ?? null}, tax_id), 
            credit_limit = COALESCE(${body.credit_limit ?? null}, credit_limit),
            current_balance = COALESCE(${body.current_balance ?? null}, current_balance),
            notes = COALESCE(${body.notes ?? null}, notes), 
            is_active = COALESCE(${body.is_active ?? null}, is_active)
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await schema`DELETE FROM customers WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم حذف العميل بنجاح' });
      }
    }

    // ==========================================
    // === [ SUPPLIERS ] ===
    // ==========================================
    if (table === 'suppliers') {
      if (req.method === 'GET') {
        if (id) {
          const result = await schema`SELECT * FROM suppliers WHERE id = ${id}`;
          if (result.length === 0) return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          return jsonResponse({ success: true, data: result[0] });
        }
        const search = url.searchParams.get('search');
        let rows = [];
        if (search) {
          const searchParam = `%${search}%`;
          rows = await schema`SELECT * FROM suppliers WHERE name ILIKE ${searchParam} OR phone ILIKE ${searchParam} ORDER BY name ASC`;
        } else {
          rows = await schema`SELECT * FROM suppliers ORDER BY created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }

      if (req.method === 'POST') {
        const sId = crypto.randomUUID();
        const result = await schema`
          INSERT INTO suppliers (id, name, phone, email, address, tax_id, credit_limit, current_balance, notes, is_active)
          VALUES (${sId}, ${body.name}, ${body.phone || null}, ${body.email || null}, ${body.address || null}, ${body.tax_id || null}, ${body.credit_limit || 0}, ${body.current_balance || 0.00}, ${body.notes || null}, ${body.is_active ?? true}) 
          RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }

      if (req.method === 'PUT' && id) {
        const result = await schema`
          UPDATE suppliers SET
            name = COALESCE(${body.name ?? null}, name), 
            phone = COALESCE(${body.phone ?? null}, phone), 
            email = COALESCE(${body.email ?? null}, email),
            address = COALESCE(${body.address ?? null}, address), 
            tax_id = COALESCE(${body.tax_id ?? null}, tax_id), 
            credit_limit = COALESCE(${body.credit_limit ?? null}, credit_limit),
            current_balance = COALESCE(${body.current_balance ?? null}, current_balance),
            notes = COALESCE(${body.notes ?? null}, notes), 
            is_active = COALESCE(${body.is_active ?? null}, is_active)
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }

      if (req.method === 'DELETE' && id) {
        await schema`DELETE FROM suppliers WHERE id = ${id}`;
        return jsonResponse({ success: true, message: 'تم حذف المورد بنجاح' });
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
          
          const items = await schema`SELECT * FROM invoice_items WHERE invoice_id = ${id} ORDER BY created_at ASC`;
          const invoiceDetails = { ...result[0], items };
          
          return jsonResponse({ success: true, data: invoiceDetails });
        }
        const result = await schema`SELECT i.*, c.name as customer_name FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id ORDER BY i.created_at DESC`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        try {
          const invoice_number = body.invoice_number || generateInvoiceNumber();
          const invId = crypto.randomUUID();
          
          const invoiceResult = await schema`
            INSERT INTO invoices (id, invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes)
            VALUES (${invId}, ${invoice_number}, ${body.customer_id || null}, ${body.status || 'paid'}, ${body.subtotal || 0}, ${body.discount_amt || 0}, ${body.tax_rate || 0}, ${body.tax_amt || 0}, ${body.total_amount || 0}, ${body.paid_amount || 0}, ${body.payment_method || 'cash'}, ${body.notes || null}) 
            RETURNING *
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
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
      }

      if (req.method === 'DELETE' && id) {
        try {
          await schema`DELETE FROM invoices WHERE id = ${id}`;
          return jsonResponse({ success: true, message: 'تم حذف الفاتورة وعكس كافة التأثيرات المالية والمخزنية بنجاح' });
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
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
          
          const items = await schema`SELECT * FROM purchase_items WHERE purchase_id = ${id} ORDER BY created_at ASC`;
          const purchaseDetails = { ...result[0], items };
          
          return jsonResponse({ success: true, data: purchaseDetails });
        }
        const result = await schema`SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.created_at DESC`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        try {
          const purchase_number = body.purchase_number || generatePurchaseNumber();
          const purId = crypto.randomUUID();
          
          const purchaseResult = await schema`
            INSERT INTO purchases (id, purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes)
            VALUES (${purId}, ${purchase_number}, ${body.supplier_id || null}, ${body.status || 'received'}, ${body.subtotal || 0}, ${body.discount_amt || 0}, ${body.tax_amt || 0}, ${body.total_amount || 0}, ${body.paid_amount || 0}, ${body.payment_method || 'cash'}, ${body.notes || null}) 
            RETURNING *
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
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
      }
    }

    return jsonResponse({ success: false, error: 'BAD_REQUEST', message: 'الجدول أو الإجراء المطلوب غير مدعوم في النظام حالياً' }, 400);

  } catch (globalError) {
    return jsonResponse({ success: false, error: 'SERVER_CRASH', message: globalError.message }, 500);
  }
}
