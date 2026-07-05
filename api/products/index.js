import { getDb } from '../_db.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
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
  } catch { return null; }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const sql = getDb();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const barcodeParam = url.searchParams.get('barcode');
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const isActive = url.searchParams.get('is_active');

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const user = verifyToken(authHeader);
  if (!user && req.method !== 'GET') {
    return jsonResponse({ success: false, error: 'UNAUTHORIZED', message: 'غير مصرح' }, 401);
  }

  try {
    if (req.method === 'GET') {
      if (id) {
        const product = await sql`SELECT * FROM products WHERE id = ${id} LIMIT 1`;
        return jsonResponse(product[0] || null);
      }
      if (barcodeParam) {
        const product = await sql`SELECT * FROM products WHERE barcode = ${barcodeParam} LIMIT 1`;
        return jsonResponse(product[0] || null);
      }
      if (category) {
        return jsonResponse(await sql`SELECT * FROM products WHERE category = ${category} ORDER BY created_at DESC`);
      }
      if (search) {
        return jsonResponse(await sql`
          SELECT * FROM products 
          WHERE name ILIKE ${'%' + search + '%'} OR barcode ILIKE ${'%' + search + '%'} 
          ORDER BY created_at DESC
        `);
      }
      if (isActive !== null) {
        return jsonResponse(await sql`SELECT * FROM products WHERE is_active = ${isActive === 'true'} ORDER BY created_at DESC`);
      }
      return jsonResponse(await sql`SELECT * FROM products ORDER BY created_at DESC`);
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
      return jsonResponse(result[0], 201);
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
      return jsonResponse(result[0]);
    }

    if (req.method === 'DELETE' && id) {
      await sql`DELETE FROM products WHERE id = ${id}`;
      return jsonResponse({ message: 'تم الحذف بنجاح' });
    }

    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  } catch (error) {
    return jsonResponse({ error: 'SERVER_ERROR', message: error.message }, 500);
  }
}
