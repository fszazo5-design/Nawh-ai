const DATABASE_URL = process.env.DATABASE_URL;

import { getDb } from './_db.js';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, X-Action',
};

// Simple hash function
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + (process.env.AUTH_SECRET || 'nawh-secret-key'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, hash) {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

function generateToken(userId, email, role) {
  const payload = { userId, email, role, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  return btoa(JSON.stringify(payload));
}

function verifyToken(token) {
  try {
    const payload = JSON.parse(atob(token));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

function convertEmailToSchemaName(email) {
  const cleanEmail = email.toLowerCase().trim()
    .replace(/[^a-z0-9]/g, '_');
  return `schema_${cleanEmail}`;
}

// دالة المعالجة الرئيسية
async function handleAllRequests(req) {
  const sql = getDb();
  const url = new URL(req.url);
  
  // 💡 استخراج الـ action بذكاء شديد لتفادي أي خطأ في التوجيه:
  // 1. من الـ searchParams كخيار أول (?action=login)
  // 2. من هيدر مخصص X-Action (اختياري)
  // 3. من نهاية الرابط إذا كان ممرراً كـ Path
  const customAction = req.headers.get('x-action');
  const pathParts = url.pathname.split('/');
  const lastPathPart = pathParts[pathParts.length - 1];
  
  let action = url.searchParams.get('action') || customAction;
  
  // إذا كان الرابط ينتهي بـ auth وكان هناك جزء بعده أو تم تمريره مباشرة
  if (!action && lastPathPart !== 'auth') {
    action = lastPathPart;
  }
  
  // القيمة الافتراضية إذا لم يتوفر أي شيء
  if (!action) action = 'me';

  try {
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      } catch (e) {
        console.error("Error parsing request body:", e);
      }
    }

    // ============================================
    // Register - إنشاء الحساب والسكيمّا
    // ============================================
    if (req.method === 'POST' && action === 'register') {
      const { email, password, full_name } = body;

      if (!email || !password) {
        return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
      }

      if (password.length < 6) {
        return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400);
      }

      const existingUsers = await sql`SELECT id FROM users WHERE email = ${email}`;
      if (existingUsers.length > 0) {
        return jsonResponse({ success: false, error: 'USER_EXISTS', message: 'المستخدم موجود بالفعل' }, 400);
      }

      const passwordHash = await hashPassword(password);
      const result = await sql`
        INSERT INTO users (email, password_hash, full_name, role, is_active)
        VALUES (${email}, ${passwordHash}, ${full_name || ''}, 'user', true)
        RETURNING id, email, full_name, role, is_active, created_at
      `;

      const user = result[0];
      const token = generateToken(user.id, user.email, user.role);
      const schemaName = convertEmailToSchemaName(email);

      try {
        await sql.unsafe(`
          CREATE SCHEMA IF NOT EXISTS ${schemaName};
          CREATE TABLE IF NOT EXISTS ${schemaName}.products (
            id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, barcode VARCHAR(100),
            category VARCHAR(100), unit VARCHAR(50) DEFAULT 'قطعة', cost_price NUMERIC(10,2) DEFAULT 0,
            sell_price NUMERIC(10,2) DEFAULT 0, stock_qty INT DEFAULT 0, min_stock_qty INT DEFAULT 0,
            is_active BOOLEAN DEFAULT true, image_url TEXT, notes TEXT, created_at TIMESTAMP DEFAULT now(), updated_at TIMESTAMP DEFAULT now()
          );
          CREATE TABLE IF NOT EXISTS ${schemaName}.customers (
            id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(100),
            address TEXT, tax_id VARCHAR(50), credit_limit NUMERIC(10,2) DEFAULT 0, notes TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT now()
          );
          CREATE TABLE IF NOT EXISTS ${schemaName}.suppliers (
            id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(100),
            address TEXT, tax_id VARCHAR(50), credit_limit NUMERIC(10,2) DEFAULT 0, notes TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT now()
          );
          CREATE TABLE IF NOT EXISTS ${schemaName}.invoices (
            id SERIAL PRIMARY KEY, invoice_number VARCHAR(100) NOT NULL, customer_id INT, status VARCHAR(50) DEFAULT 'paid',
            subtotal NUMERIC(10,2) DEFAULT 0, discount_amt NUMERIC(10,2) DEFAULT 0, tax_rate NUMERIC(5,2) DEFAULT 0,
            tax_amt NUMERIC(10,2) DEFAULT 0, total_amount NUMERIC(10,2) DEFAULT 0, paid_amount NUMERIC(10,2) DEFAULT 0, payment_method VARCHAR(50) DEFAULT 'cash', notes TEXT, created_at TIMESTAMP DEFAULT now()
          );
          CREATE TABLE IF NOT EXISTS ${schemaName}.invoice_items (
            id SERIAL PRIMARY KEY, invoice_id INT, product_id INT, name VARCHAR(255), qty INT DEFAULT 1,
            unit_price NUMERIC(10,2) DEFAULT 0, discount NUMERIC(10,2) DEFAULT 0, total NUMERIC(10,2) DEFAULT 0, created_at TIMESTAMP DEFAULT now()
          );
        `);
