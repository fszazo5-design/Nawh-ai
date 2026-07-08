import pg from 'pg';

/**
 * Auth API Endpoint (Vercel Node.js Signature using 'pg' library)
 * يعتمد على معيار الاتصال بـ Neon وتوافق الأندرويد و Vite
 */

// دالة مساعدة لضبط الـ CORS وإرسال الاستجابة
function sendJsonResponse(res, data, status = 200) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Info');
  return res.status(status).json(data);
}

// دالة إعداد نص الاتصال بـ Neon وتجهيز الـ Client
function createDbClient() {
  const baseConnectionString = process.env.DATABASE_URL;
  if (!baseConnectionString) {
    throw new Error('DATABASE_URL is missing in environment variables');
  }
  const separator = baseConnectionString.includes('?') ? '&' : '?';
  const finalConnectionString = `${baseConnectionString}${separator}sslmode=verify-full`;

  return new pg.Client({
    connectionString: finalConnectionString,
    ssl: { 
      rejectUnauthorized: false 
    }
  });
}

// دالة تشفير بسيطة (Web Crypto API)
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

// توليد التوكن وفحصه
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

export default async function handler(req, res) {
  // 1. معالجة طلبات OPTIONS الخاصة بـ CORS (مهم جداً للأندرويد)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Info');
    return res.status(200).end();
  }

  const client = createDbClient();

  // قراءة المعاملات والهيدرز
  const host = req.headers?.host || 'localhost';
  const authHeader = req.headers?.authorization || req.headers?.['authorization'];
  const url = new URL(req.url, `https://${host}`);
  const action = url.searchParams.get('action') || 'me';
  const id = url.searchParams.get('id');

  try {
    await client.connect();
    
    // قراءة الـ body القادم من واجهة المستخدم
    const body = req.body || {};

    // ==========================================
    // === [ 1. تسجيل حساب جديد - REGISTER ] ===
    // ==========================================
    if (req.method === 'POST' && action === 'register') {
      const { email, password, full_name, company_name, phone } = body;

      if (!email || !password) {
        return sendJsonResponse(res, { success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
      }
      if (password.length < 6) {
        return sendJsonResponse(res, { success: false, error: 'VALIDATION_ERROR', message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400);
      }

      const cleanEmail = email.toLowerCase().trim();

      // التحقق من وجود المستخدم مسبقاً
      const checkResult = await client.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [cleanEmail]);
      if (checkResult.rows.length > 0) {
        return sendJsonResponse(res, { success: false, error: 'USER_EXISTS', message: 'المستخدم موجود بالفعل' }, 400);
      }

      const passwordHash = await hashPassword(password);
      const userId = 'usr_' + Math.random().toString(36).substring(2, 11);
      const role = cleanEmail === 'admin@debts.dz' ? 'admin' : 'user';
      const createdAt = new Date().toISOString();

      const insertQuery = `
        INSERT INTO users (id, email, password_hash, full_name, company_name, phone, role, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, email, full_name, role, is_active, created_at
      `;
      
      const result = await client.query(insertQuery, [
        userId, cleanEmail, passwordHash, full_name || '', company_name || '', phone || '', role, true, createdAt
      ]);

      const user = result.rows[0];
      const token = generateToken(user.id, user.email, user.role);

      return sendJsonResponse(res, {
        success: true,
        data: { user, token },
        message: 'تم إنشاء الحساب بنجاح'
      }, 201);
    }

    // ==========================================
    // === [ 2. تسجيل الدخول - LOGIN ] ===
    // ==========================================
    if (req.method === 'POST' && action === 'login') {
      const { email, password } = body;

      if (!email || !password) {
        return sendJsonResponse(res, { success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
      }

      const cleanEmail = email.toLowerCase().trim();
      const userResult = await client.query('SELECT * FROM users WHERE lower(email) = $1 LIMIT 1', [cleanEmail]);
      const user = userResult.rows[0];

      if (!user || !await verifyPassword(password, user.password_hash)) {
        return sendJsonResponse(res, { success: false, error: 'INVALID_CREDENTIALS', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, 401);
      }

      if (!user.is_active) {
        return sendJsonResponse(res, { success: false, error: 'ACCOUNT_DISABLED', message: 'الحساب معطل' }, 403);
      }

      // تحديث آخر تسجيل دخول
      await client.query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);

      const token = generateToken(user.id, user.email, user.role);

      return sendJsonResponse(res, {
        success: true,
        data: {
          user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
          token
        },
        message: 'تم تسجيل الدخول بنجاح'
      });
    }

    // ==========================================
    // === [ 3. جلب بيانات المستخدم الحالية - ME / USERS ] ===
    // ==========================================
    if (req.method === 'GET') {
      const token = authHeader?.replace('Bearer ', '');
      if (!token) {
        return sendJsonResponse(res, { success: false, error: 'NO_TOKEN', message: 'لم يتم تقديم رمز المصادقة' }, 401);
      }

      const payload = verifyToken(token);
      if (!payload) {
        return sendJsonResponse(res, { success: false, error: 'INVALID_TOKEN', message: 'رمز المصادقة غير صالح أو منتهي الصلاحية' }, 401);
      }

      // جلب الحساب الحالي
      if (action === 'me') {
        const profileResult = await client.query(
          'SELECT id, email, full_name, company_name, role, is_active, last_login, created_at FROM users WHERE id = $1 LIMIT 1',
          [payload.userId]
        );
        
        if (profileResult.rows.length === 0) {
          return sendJsonResponse(res, { success: false, error: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' }, 404);
        }
        return sendJsonResponse(res, { success: true, data: profileResult.rows[0] });
      }

      // قائمة المستخدمين (للأدمن فقط)
      if (action === 'users') {
        if (payload.role !== 'admin') {
          return sendJsonResponse(res, { success: false, error: 'FORBIDDEN', message: 'غير مصرح لك بالوصول' }, 403);
        }
        const usersListResult = await client.query(
          'SELECT id, email, full_name, company_name, role, is_active, last_login, created_at FROM users ORDER BY created_at DESC'
        );
        return sendJsonResponse(res, { success: true, data: usersListResult.rows });
      }
    }

    // ==========================================
    // === [ 4. تحديث البيانات وكلمة المرور - PUT ] ===
    // ==========================================
    if (req.method === 'PUT') {
      const token = authHeader?.replace('Bearer ', '');
      const payload = verifyToken(token);
      if (!payload) {
        return sendJsonResponse(res, { success: false, error: 'INVALID_TOKEN', message: 'رمز المصادقة غير صالح' }, 401);
      }

      const targetUserId = id || payload.userId;

      // تحديث الاسم أو الشركة
      if (action === 'profile') {
        const { full_name, company_name } = body;
        await client.query(
          'UPDATE users SET full_name = $1, company_name = $2, updated_at = now() WHERE id = $3',
          [full_name || '', company_name || '', targetUserId]
        );
        return sendJsonResponse(res, { success: true, message: 'تم تحديث الملف الشخصي' });
      }

      // تغيير كلمة المرور
      if (action === 'password') {
        const { current_password, new_password } = body;
        if (!current_password || !new_password) {
          return sendJsonResponse(res, { success: false, error: 'VALIDATION_ERROR', message: 'كلمة المرور الحالية والجديدة مطلوبتان' }, 400);
        }

        const passResult = await client.query('SELECT password_hash FROM users WHERE id = $1 LIMIT 1', [targetUserId]);
        const user = passResult.rows[0];

        if (!user || !await verifyPassword(current_password, user.password_hash)) {
          return sendJsonResponse(res, { success: false, error: 'INVALID_PASSWORD', message: 'كلمة المرور الحالية غير صحيحة' }, 400);
        }

        const newPasswordHash = await hashPassword(new_password);
        await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [newPasswordHash, targetUserId]);
        return sendJsonResponse(res, { success: true, message: 'تم تحديث كلمة المرور بنجاح' });
      }
    }

    return sendJsonResponse(res, { success: false, error: 'NOT_FOUND', message: 'الإجراء غير موجود' }, 404);

  } catch (error) {
    console.error('Auth API Error:', error);
    return sendJsonResponse(res, { success: false, error: 'SERVER_ERROR', message: error.message }, 500);
  } finally {
    // إغلاق الاتصال بقاعدة البيانات بشكل آمن لمنع تسريب الـ Connections
    await client.end().catch(err => console.error('Error closing client:', err));
  }
}
