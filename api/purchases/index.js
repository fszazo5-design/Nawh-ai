import { getDb } from '../_db.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

function verifyToken(authHeader) {
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token));
    return payload.exp < Date.now() ? null : payload;
  } catch { return null; }
}

function generatePurchaseNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PO-${date}-${random}`;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const sql = getDb();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const user = verifyToken(authHeader);
  if (!user && req.method !== 'GET') return jsonResponse({ success: false, error: 'UNAUTHORIZED' }, 401);

  try {
    if (req.method === 'GET') {
      if (id) {
        const purchases = await sql`
          SELECT p.*, s.name as supplier_name FROM purchases p
          LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.id = ${id}
        `;
        if (purchases.length === 0) return jsonResponse({ error: 'NOT_FOUND' }, 404);
        return jsonResponse(purchases[0]);
      }
      return jsonResponse(await sql`
        SELECT p.*, s.name as supplier_name FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.created_at DESC
      `);
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
            VALUES (${purchase.id}, ${item.product_id || null}, ${item.name}, ${item.qty}, ${item.unit_cost}, ${item.total})
          `;
          if (item.product_id) {
            await sql`UPDATE products SET stock_qty = stock_qty + ${item.qty}, updated_at = now() WHERE id = ${item.product_id}`;
          }
        }
      }
      return jsonResponse(purchase, 201);
    }

    if (req.method === 'DELETE' && id) {
      await sql`DELETE FROM purchases WHERE id = ${id}`;
      return jsonResponse({ message: 'تم الحذف بنجاح' });
    }
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  } catch (error) { return jsonResponse({ error: 'SERVER_ERROR', message: error.message }, 500); }
}
