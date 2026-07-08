import { getDb } from './_db.js';

/**
 * Auth API Endpoint (Vercel Node.js Serverless Compliant)
 * متوافق تماماً مع مشاريع Vite و منصات الأندرويد (Capacitor)
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

// Simple hash function (Web Crypto API)
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

// Response helper المتوافق مع معايير الويب
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

// الدالة الرئيسية الموحدة التي تصدر كـ default لتستقبل الطلب من Vercel
export default async function handler(req) {
  // 1. معالجة طلبات OPTIONS الخاصة بـ CORS (مهم جداً للأندرويد و Vite)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // التأكد من وجود رابط قاعدة البيانات في البيئة، أو تمريره كحماية افتراضية
  const dbUrl = process.env.DATABASE_URL;
  const sql = getDb();
  
  // 2. قراءة الهيدرز والروابط باستخدام معالج آمن لكائنات Node العادية والـ Web APIs
  const host = typeof req.headers.get === 'function' 
    ? req.headers.get('host') 
    : (req.headers?.host || 'localhost');
    
  const authHeader = typeof req.headers.get === 'function' 
    ? req.headers.get('authorization') 
    : (req.headers?.authorization || req.headers?.['authorization']);

  const url = new URL(req.url, `https://${host}`);
  const action = url.searchParams.get('action') || 'me';
  const id = url.searchParams.get('id'); 

  try {
    // 3. الحل البديل والآمن لقراءة الـ Body وتفادي خطأ (req.json is not a function)
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      if (typeof req.json === 'function') {
        body = await req.json();
      } else {
        // إذا كان كائن طلب Node.js تقليدي (IncomingMessage)، نقوم بتجميع الـ Chunks
        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        const data = Buffer.concat(buffers).toString();
        body = data ? JSON.parse(data) : {};
      }
    }

    // === [ POST Requests: Login & Register ] ===
    if (req.method === 'POST') {

      // إرسال بيانات التسجيل
      if (action === 'register') {
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
        return jsonResponse({ success: true, data: { user, token }, message: 'تم إنشاء الحساب بنجاح' }, 201);
      }

      // تسجيل الدخول
      if (action === 'login') {
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
            user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
            token
          },
          message: 'تم تسجيل الدخول بنجاح'
        });
      }
    }

    // === [ GET Requests: Me & Users ] ===
    if (req.method === 'GET') {
      const token = authHeader?.replace('Bearer ', '');
      if (!token) {
        return jsonResponse({ success: false, error: 'NO_TOKEN', message: 'لم يتم تقديم رمز المصادقة' }, 401);
      }

      const payload = verifyToken(token);
      if (!payload) {
        return jsonResponse({ success: false, error: 'INVALID_TOKEN', message: 'رمز المصادقة غير صالح أو منتهي الصلاحية' }, 401);
      }

      if (action === 'me') {
        const users = await sql`
          SELECT id, email, full_name, role, is_active, last_login, created_at
          FROM users WHERE id = ${payload.userId}
        `;
        if (users.length === 0) {
          return jsonResponse({ success: false, error: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' }, 404);
        }
        return jsonResponse({ success: true, data: users[0] });
      }

      if (action === 'users') {
        if (payload.role !== 'admin') {
          return jsonResponse({ success: false, error: 'FORBIDDEN', message: 'غير مصرح لك بالوصول' }, 403);
        }
        const users = await sql`
          SELECT id, email, full_name, role, is_active, last_login, created_at
          FROM users ORDER BY created_at DESC
        `;
        return jsonResponse({ success: true, data: users });
      }
    }

    // === [ PUT Requests: Profile & Password ] ===
    if (req.method === 'PUT') {
      const token = authHeader?.replace('Bearer ', '');
      const payload = verifyToken(token);
      if (!payload) {
        return jsonResponse({ success: false, error: 'INVALID_TOKEN', message: 'رمز المصادقة غير صالح' }, 401);
      }

      const targetUserId = id || payload.userId;

      if (action === 'profile') {
        const { full_name } = body;
        await sql`
          UPDATE users SET full_name = ${full_name}, updated_at = now()
          WHERE id = ${targetUserId}
        `;
        return jsonResponse({ success: true, message: 'تم تحديث الملف الشخصي' });
      }

      if (action === 'password') {
        const { current_password, new_password } = body;
        if (!current_password || !new_password) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'كلمة المرور الحالية والجديدة مطلوبتان' }, 400);
        }

        const users = await sql`SELECT password_hash FROM users WHERE id = ${targetUserId}`;
        const user = users[0];

        if (!await verifyPassword(current_password, user.password_hash)) {
          return jsonResponse({ success: false, error: 'INVALID_PASSWORD', message: 'كلمة المرور الحالية غير صحيحة' }, 400);
        }

        const newPasswordHash = await hashPassword(new_password);
        await sql`
          UPDATE users SET password_hash = ${newPasswordHash}, updated_at = now()
          WHERE id = ${targetUserId}
        `;
        return jsonResponse({ success: true, message: 'تم تحديث كلمة المرور بنجاح' });
      }
    }

    return jsonResponse({ success: false, error: 'NOT_FOUND', message: 'الإجراء غير موجود' }, 404);

  } catch (error) {
    console.error('Auth API Error:', error);
    return jsonResponse({ success: false, error: 'SERVER_ERROR', message: error.message }, 500);
  }
}
