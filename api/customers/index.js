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
    return payload.exp < Date.now() ? null : payload;
  } catch { return null; }
}

// دالة التحقق من الصلاحيات الموحدة
function checkAuth(req) {
  const authHeader = req.headers.get('authorization');
  return verifyToken(authHeader);
}

// معالجة طلبات الجلب (GET)
export async function GET(req) {
  const sql = getDb();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const search = url.searchParams.get('search');

  try {
    if (id) {
      const data = await sql`SELECT * FROM customers WHERE id = ${id} LIMIT 1`;
      return jsonResponse(data[0] || null);
    }
    if (search) {
      const data = await sql`SELECT * FROM customers WHERE name ILIKE ${'%' + search + '%'} OR phone ILIKE ${'%' + search + '%'} ORDER BY created_at DESC`;
      return jsonResponse(data);
    }
    const data = await sql`SELECT * FROM customers ORDER BY created_at DESC`;
    return jsonResponse(data);
  } catch (error) { 
    return jsonResponse({ error: 'SERVER_ERROR', message: error.message }, 500); 
  }
}

// معالجة طلبات الإضافة (POST)
export async function POST(req) {
  if (!checkAuth(req)) return jsonResponse({ success: false, error: 'UNAUTHORIZED' }, 401);
  const sql = getDb();

  try {
    const body = await req.json();
    if (!body.name) return jsonResponse({ error: 'VALIDATION_ERROR', message: 'الاسم مطلوب' }, 400);

    const result = await sql`
      INSERT INTO customers (name, phone, email, address, tax_id, credit_limit, notes)
      VALUES (${body.name}, ${body.phone || null}, ${body.email || null}, ${body.address || null}, ${body.tax_id || null}, ${body.credit_limit || 0}, ${body.notes || null})
      RETURNING *
    `;
    return jsonResponse(result[0], 201);
  } catch (error) { 
    return jsonResponse({ error: 'SERVER_ERROR', message: error.message }, 500); 
  }
}

// معالجة طلبات التعديل (PUT)
export async function PUT(req) {
  if (!checkAuth(req)) return jsonResponse({ success: false, error: 'UNAUTHORIZED' }, 401);
  const sql = getDb();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) return jsonResponse({ error: 'BAD_REQUEST', message: 'معرف العميل (id) مطلوب' }, 400);

  try {
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
        is_active = COALESCE(${body.is_active}, is_active), 
        updated_at = now()
      WHERE id = ${id} RETURNING *
    `;
    return jsonResponse(result[0]);
  } catch (error) { 
    return jsonResponse({ error: 'SERVER_ERROR', message: error.message }, 500); 
  }
}

// معالجة طلبات الحذف (DELETE)
export async function DELETE(req) {
  if (!checkAuth(req)) return jsonResponse({ success: false, error: 'UNAUTHORIZED' }, 401);
  const sql = getDb();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) return jsonResponse({ error: 'BAD_REQUEST', message: 'معرف العميل (id) مطلوب' }, 400);

  try {
    await sql`DELETE FROM customers WHERE id = ${id}`;
    return jsonResponse({ message: 'تم الحذف بنجاح' });
  } catch (error) { 
    return jsonResponse({ error: 'SERVER_ERROR', message: error.message }, 500); 
  }
}

// معالجة طلبات الـ CORS Preflight (OPTIONS)
export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
