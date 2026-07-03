const DATABASE_URL = process.env.DATABASE_URL;

import { getDb } from './_db.js';

/**
 * Auth API Endpoint
 * Handles: login, register, logout, get-current-user
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

// Simple hash function (for production use bcrypt)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + process.env.AUTH_SECRET || 'nawh-secret-key');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, hash) {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

// Generate JWT-like token (simple version)
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

// Response helper
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const sql = getDb();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'me';

  try {
    // Register
    if (req.method === 'POST' && action === 'register') {
      const body = await req.json();
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

      return jsonResponse({
        success: true,
        data: { user, token },
        message: 'تم إنشاء الحساب بنجاح'
      }, 201);
    }

    // Login
    if (req.method === 'POST' && action === 'login') {
      const body = await req.json();
      const { email, password } = body;

      if (!email || !password) {
        return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
      }

      // Find user
      const users = await sql`SELECT * FROM users WHERE email = ${email}`;
      const user = users[0];

      if (!user || !await verifyPassword(password, user.password_hash)) {
        return jsonResponse({ success: false, error: 'INVALID_CREDENTIALS', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, 401);
      }

      if (!user.is_active) {
        return jsonResponse({ success: false, error: 'ACCOUNT_DISABLED', message: 'الحساب معطل' }, 403);
      }

      // Update last login
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
          token
        },
        message: 'تم تسجيل الدخول بنجاح'
      });
    }

    // Get current user
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
        data: users[0]
      });
    }

    // Update profile
    if (req.method === 'PUT' && action === 'profile') {
      const authHeader = req.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '');

      const payload = verifyToken(token);
      if (!payload) {
        return jsonResponse({ success: false, error: 'INVALID_TOKEN', message: 'رمز المصادقة غير صالح' }, 401);
      }

      const body = await req.json();
      const { full_name } = body;

      await sql`
        UPDATE users SET full_name = ${full_name}, updated_at = now()
        WHERE id = ${payload.userId}
      `;

      return jsonResponse({ success: true, message: 'تم تحديث الملف الشخصي' });
    }

    // Change password
    if (req.method === 'PUT' && action === 'password') {
      const authHeader = req.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '');

      const payload = verifyToken(token);
      if (!payload) {
        return jsonResponse({ success: false, error: 'INVALID_TOKEN', message: 'رمز المصادقة غير صالح' }, 401);
      }

      const body = await req.json();
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

    // List users (admin only)
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

      return jsonResponse({ success: true, data: users });
    }

    return jsonResponse({ success: false, error: 'NOT_FOUND', message: 'الإجراء غير موجود' }, 404);

  } catch (error) {
    console.error('Auth API Error:', error);
    return jsonResponse({ success: false, error: 'SERVER_ERROR', message: 'حدث خطأ في الخادم' }, 500);
  }
}
