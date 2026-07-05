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

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const user = verifyToken(authHeader);
  if (!user && req.method !== 'GET') return jsonResponse({ success: false, error: 'UNAUTHORIZED' }, 401);

  try {
    if (req.method === 'GET') {
      if (id) {
        const expenses = await sql`
          SELECT e.*, ec.name as category_name FROM expenses e
          LEFT JOIN expense_categories ec ON e.category_id = ec.id WHERE e.id = ${id}
        `;
        if (expenses.length === 0) return jsonResponse({ error: 'NOT_FOUND' }, 404);
        return jsonResponse(expenses[0]);
      }
      return jsonResponse(await sql`
        SELECT e.*, ec.name as category_name FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id ORDER BY e.expense_date DESC
      `);
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const result = await sql`
        INSERT INTO expenses (category_id, description, amount, paid_by, receipt_url, expense_date)
        VALUES (${body.category_id || null}, ${body.description}, ${body.amount},
                ${body.paid_by || null}, ${body.receipt_url || null}, ${body.expense_date || null})
        RETURNING *
      `;
      return jsonResponse(result[0], 201);
    }
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  } catch (error) { return jsonResponse({ error: 'SERVER_ERROR', message: error.message }, 500); }
}
