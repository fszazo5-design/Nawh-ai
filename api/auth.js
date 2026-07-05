const DATABASE_URL = process.env.DATABASE_URL;

import { getDb } from './_db.js';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
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

// دالة إرجاع الردود بصيغة JSON متوافقة مع إعدادات CORS
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

// دالة لتنظيف الإيميل وتحويله لاسم سكيمّا صالح في PostgreSQL
function convertEmailToSchemaName(email) {
  const cleanEmail = email.toLowerCase().trim()
    .replace(/[^a-z0-9]/g, '_'); // استبدال @ والـ . والرموز بشرطة سفلية
  return `schema_${cleanEmail}`;
}

// دالة المعالجة الرئيسية الموحدة لجميع الطلبات
async function handleAllRequests(req) {
  const sql = getDb();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'me';

  try {
    // قراءة الـ body بأمان ودعم كل الحالات المتوقعة من الفرونت-إند
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

      // Check if user exists
      const existingUsers = await sql`SELECT id FROM users WHERE email = ${email}`;
      if (existingUsers.length > 0) {
        return jsonResponse({ success: false, error: 'USER_EXISTS', message: 'المستخدم موجود بالفعل' }, 400);
      }

      // Create user
      const passwordHash = await hashPassword(password);
      const result = await sql`
        INSERT INTO users (email, password_hash, full_name, role, is_active)
        VALUES (${email}, ${passwordHash}, ${full_name || ''}, 'user', true)
        RETURNING id, email, full_name, role, is_active, created_at
      `;

      const user = result[0];
      const token = generateToken(user.id, user.email, user.role);
      const schemaName = convertEmailToSchemaName(email);

      // === 💡 بدء كود إنشاء السكيمّا والجداول الخاصة بالإيميل تلقائياً ===
      try {
        await sql.unsafe(`
          -- 1. إنشاء السكيمّا الجديدة باسم العميل
          CREATE SCHEMA IF NOT EXISTS ${schemaName};

          -- 2. إنشاء جدول المنتجات داخل السكيمّا الجديدة
          CREATE TABLE IF NOT EXISTS ${schemaName}.products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            barcode VARCHAR(100),
            category VARCHAR(100),
            unit VARCHAR(50) DEFAULT 'قطعة',
            cost_price NUMERIC(10,2) DEFAULT 0,
            sell_price NUMERIC(10,2) DEFAULT 0,
            stock_qty INT DEFAULT 0,
            min_stock_qty INT DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            image_url TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT now(),
            updated_at TIMESTAMP DEFAULT now()
          );

          -- 3. إنشاء جدول العملاء داخل السكيمّا الجديدة
          CREATE TABLE IF NOT EXISTS ${schemaName}.customers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(100),
            address TEXT,
            tax_id VARCHAR(50),
            credit_limit NUMERIC(10,2) DEFAULT 0,
            notes TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT now()
          );

          -- 4. إنشاء جدول الموردين داخل السكيمّا الجديدة
          CREATE TABLE IF NOT EXISTS ${schemaName}.suppliers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(100),
            address TEXT,
            tax_id VARCHAR(50),
            credit_limit NUMERIC(10,2) DEFAULT 0,
            notes TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT now()
          );

          -- 5. إنشاء جدول الفواتير داخل السكيمّا الجديدة
          CREATE TABLE IF NOT EXISTS ${schemaName}.invoices (
            id SERIAL PRIMARY KEY,
            invoice_number VARCHAR(100) NOT NULL,
            customer_id INT,
            status VARCHAR(50) DEFAULT 'paid',
            subtotal NUMERIC(10,2) DEFAULT 0,
            discount_amt NUMERIC(10,2) DEFAULT 0,
            tax_rate NUMERIC(5,2) DEFAULT 0,
            tax_amt NUMERIC(10,2) DEFAULT 0,
            total_amount NUMERIC(10,2) DEFAULT 0,
            paid_amount NUMERIC(10,2) DEFAULT 0,
            payment_method VARCHAR(50) DEFAULT 'cash',
            notes TEXT,
            created_at TIMESTAMP DEFAULT now()
          );

          -- 6. إنشاء تفاصيل الفواتير داخل السكيمّا الجديدة
          CREATE TABLE IF NOT EXISTS ${schemaName}.invoice_items (
            id SERIAL PRIMARY KEY,
            invoice_id INT,
            product_id INT,
            name VARCHAR(255),
            qty INT DEFAULT 1,
            unit_price NUMERIC(10,2) DEFAULT 0,
            discount NUMERIC(10,2) DEFAULT 0,
            total NUMERIC(10,2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT now()
          );
        `);
      } catch (schemaError) {
        console.error(`Failed to create schema for ${email}:`, schemaError);
      }
      // === نهاية كود إنشاء السكيمّا ===

      // إرسال الرد المتكامل والمغلف بنظام success ليتوافق مع الـ Auth الذكي في كود الخدمة
      return jsonResponse({
        success: true,
        data: { user, token, schema: schemaName },
        message: 'تم إنشاء الحساب وتجهيز المساحة الخاصة به بنجاح'
      }, 201);
    }

    // ============================================
    // Login - تسجيل الدخول
    // ============================================
    if (req.method === 'POST' && action === 'login') {
      const { email, password } = body;

      if (!email || !password) {
        return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
      }

      const users = await sql`SELECT * FROM users WHERE email = ${email}`;
      const user = users[0];

      if (!user || !await verifyPassword(password, user.password_hash)) {
        return jsonResponse({ success: false, error: 'INVALID_CREDENTIALS', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, 401);
      }

      if (!user.is_active) {
        return jsonResponse({ success: false, error: 'ACCOUNT_DISABLED', message: 'الحساب معطل' }, 403);
      }

      await sql`UPDATE users SET last_login = now() WHERE id = ${user.id}`;

      const token = generateToken(user.id, user.email, user.role);

      return jsonResponse({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role
          },
          token,
          schema: convertEmailToSchemaName(user.email)
        },
        message: 'تم تسجيل الدخول بنجاح'
      });
    }

    // ============================================
    // Get Current User (Me)
    // ============================================
    if (req.method === 'GET' && action === 'me') {
      const authHeader = req.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        return jsonResponse({ success: false, error: 'NO_TOKEN', message: 'لم يتم تقديم رمز المصادقة' }, 401);
      }

      const payload = verifyToken(token);
      if (!payload) {
        return jsonResponse({ success: false, error: 'INVALID_TOKEN', message: 'رمز المصادقة غير صالح أو منتهي الصلاحية' }, 401);
      }

      const users = await sql`
        SELECT id, email, full_name, role, is_active, last_login, created_at
        FROM users WHERE id = ${payload.userId}
      `;

      if (users.length === 0) {
        return jsonResponse({ success: false, error: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' }, 404);
      }

      return jsonResponse({
        success: true,
        data: {
          ...users[0],
          schema: convertEmailToSchemaName(users[0].email)
        }
      });
    }

    // ============================================
    // Update Profile
    // ============================================
    if (req.method === 'PUT' && action === 'profile') {
      const authHeader = req.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '');

      const payload = verifyToken(token);
      if (!payload) {
        return jsonResponse({ success: false, error: 'INVALID_TOKEN', message: 'رمز المصادقة غير صالح' }, 401);
      }

      const { full_name } = body;

      await sql`
        UPDATE users SET full_name = ${full_name}, updated_at = now()
        WHERE id = ${payload.userId}
      `;

      return jsonResponse({ success: true, message: 'تم تحديث الملف الشخصي' });
    }

    // ============================================
    // Change Password
    // ============================================
    if (req.method === 'PUT' && action === 'password') {
      const authHeader = req.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '');

      const payload = verifyToken(token);
      if (!payload) {
        return jsonResponse({ success: false, error: 'INVALID_TOKEN', message: 'رمز المصادقة غير صالح' }, 401);
      }

      const { current_password, new_password } = body;

      if (!current_password || !new_password) {
        return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'كلمة المرور الحالية والجديدة مطلوبتان' }, 400);
      }

      const users = await sql`SELECT password_hash FROM users WHERE id = ${payload.userId}`;
      const user = users[0];

      if (!await verifyPassword(current_password, user.password_hash)) {
        return jsonResponse({ success: false, error: 'INVALID_PASSWORD', message: 'كلمة المرور الحالية غير صحيحة' }, 400);
      }

      const newPasswordHash = await hashPassword(new_password);
      await sql`
        UPDATE users SET password_hash = ${newPasswordHash}, updated_at = now()
        WHERE id = ${payload.userId}
      `;

      return jsonResponse({ success: true, message: 'تم تحديث كلمة المرور بنجاح' });
    }

    // ============================================
    // List Users (Admin only)
    // ============================================
    if (req.method === 'GET' && action === 'users') {
      const authHeader = req.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '');

      const payload = verifyToken(token);
      if (!payload || payload.role !== 'admin') {
        return jsonResponse({ success: false, error: 'FORBIDDEN', message: 'غير مصرح لك بالوصول' }, 403);
      }

      const users = await sql`
        SELECT id, email, full_name, role, is_active, last_login, created_at
        FROM users ORDER BY created_at DESC
      `;

      // الرد بالـ JSON المباشر للمصفوفة ليتناسب مع دوال الجداول
      return jsonResponse(users);
    }

    return jsonResponse({ success: false, error: 'NOT_FOUND', message: 'الإجراء غير موجود' }, 404);

  } catch (error) {
    console.error('Auth API Error:', error);
    return jsonResponse({ success: false, error: 'SERVER_ERROR', message: 'حدث خطأ في الخادم' }, 500);
  }
}

export async function GET(req) { return await handleAllRequests(req); }
export async function POST(req) { return await handleAllRequests(req); }
export async function PUT(req) { return await handleAllRequests(req); }
export async function OPTIONS() { return new Response(null, { status: 200, headers: corsHeaders }); }
