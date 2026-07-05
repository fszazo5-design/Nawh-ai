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

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const sql = getDb();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const search = url.searchParams.get('search');

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const user = verifyToken(authHeader);
  if (!user && req.method !== 'GET') return jsonResponse({ success: false, error: 'UNAUTHORIZED' }, 401);

  try {
    if (req.method === 'GET') {
      if (id) {
        const data = await sql`SELECT * FROM suppliers WHERE id = ${id} LIMIT 1`;
        return jsonResponse(data[0] || null);
      }
      if (search) {
        return jsonResponse(await sql`SELECT * FROM suppliers WHERE name ILIKE ${'%' + search + '%'} OR phone ILIKE ${'%' + search + '%'} ORDER BY created_at DESC`);
      }
      return jsonResponse(await sql`SELECT * FROM suppliers ORDER BY created_at DESC`);
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const result = await sql`
        INSERT INTO suppliers (name, phone, email, address, tax_id, credit_limit, notes)
        VALUES (${body.name}, ${body.phone || null}, ${body.email || null}, ${body.address || null}, ${body.tax_id || null}, ${body.credit_limit || 0}, ${body.notes || null})
        RETURNING *
      `;
      return jsonResponse(result[0], 201);
    }

    if (req.method === 'PUT' && id) {
      const body = await req.json();
      const result = await sql`
        UPDATE suppliers SET
          name = COALESCE(${body.name}, name), phone = COALESCE(${body.phone}, phone), email = COALESCE(${body.email}, email),
          address = COALESCE(${body.address}, address), tax_id = COALESCE(${body.tax_id}, tax_id), credit_limit = COALESCE(${body.credit_limit}, credit_limit),
          notes = COALESCE(${body.notes}, notes), is_active = COALESCE(${body.is_active}, is_active), updated_at = now()
        WHERE id = ${id} RETURNING *
      `;
      return jsonResponse(result[0]);
    }

    if (req.method === 'DELETE' && id) {
      await sql`DELETE FROM suppliers WHERE id = ${id}`;
      return jsonResponse({ message: 'تم الحذف بنجاح' });
    }
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  } catch (error) { return jsonResponse({ error: 'SERVER_ERROR', message: error.message }, 500); }
}
