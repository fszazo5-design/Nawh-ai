import { getDb, initializeDatabase } from './_db.js';

/**
 * Auth API Endpoint (Vercel Web Fetch API Style)
 * متوافق تماماً مع مشاريع Vite و منصات الأندرويد وقواعد بيانات Neon
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

// دالة لتنظيف وتحويل الاسم لاسم سكيما مستقل وصالح وآمن لـ Postgres
function generateSchemaName(fullName) {
  if (!fullName) return 'tenant_' + crypto.randomUUID().split('-')[0];
  
  let safeName = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\u0600-\u06FF]/g, '_') // يدعم الحروف العربية والإنجليزية والأرقام
    .replace(/^[^a-z_\u0600-\u06FF]/, '_');    // يجب أن تبدأ السكيما بحرف وليس رقم
    
  return safeName || 'tenant_' + crypto.randomUUID().split('-')[0];
}

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

// توليد التوكن مع تضمين اسم السكيما للتوجيه اللاحق
function generateToken(userId, email, role, schemaName) {
  const payload = { userId, email, role, schemaName, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
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

// الدالة الرئيسية الموحدة لمعالجة العمليات
async function handleRequest(req) {
  const sql = getDb();
  
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
    // === [ POST Requests: Login & Register ] ===
    if (req.method === 'POST') {
      const body = await req.json();

      // إرسال بيانات التسجيل
      if (action === 'register') {
        const { email, password } = body;
        
        // استخراج الحقول بمرونة تامة لتفادي خطأ تسمية الحقول في الواجهات
        const full_name = body.full_name || body.fullName || body.name || '';
        const company_name = body.company_name || body.companyName || body.company || '';

        if (!email || !password) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
        }
        if (password.length < 6) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400);
        }

        // 1. الفحص المركزي في جدول الحسابات الموحد
        const existingUsers = await sql`SELECT id FROM public.app_users WHERE email = ${email}`;
        if (existingUsers.length > 0) {
          return jsonResponse({ success: false, error: 'USER_EXISTS', message: 'المستخدم موجود بالفعل على المنصة' }, 400);
        }

        const userId = crypto.randomUUID(); 
        const passwordHash = await hashPassword(password);
        
        // 2. تجهيز اسم السكيما المستقل بناءً على الاسم الكامل
        const schemaName = generateSchemaName(full_name || email.split('@')[0]);

        // 3. إنشاء السجل الأساسي في الجدول المركزي (app_users)
        await sql`
          INSERT INTO public.app_users (id, email, password_hash, schema_name)
          VALUES (${userId}, ${email}, ${passwordHash}, ${schemaName})
        `;

        // 4. استدعاء دالة التهيئة لإنشاء السكيما الجديدة
        await initializeDatabase(schemaName);

        // 5. تم تعديل طريقة كتابة اسم الجدول هنا لمنع خطأ الـ syntax error ($1)
        const result = await sql`
          INSERT INTO ${sql(schemaName + '.users')} (id, email, password_hash, full_name, company_name, role, is_active)
          VALUES (${userId}, ${email}, ${passwordHash}, ${full_name}, ${company_name}, 'user', true)
          RETURNING id, email, full_name, company_name, role, is_active, created_at
        `;
        
        const user = result[0];
        const token = generateToken(user.id, user.email, user.role, schemaName);
        
        return jsonResponse({ 
          success: true, 
          data: { 
            user: { ...user, schema_name: schemaName }, 
            token 
          }, 
          message: 'تم إنشاء الحساب وتخصيص السكيما بنجاح' 
        }, 201);
      }

      // تسجيل الدخول
      if (action === 'login') {
        const { email, password } = body;
        if (!email || !password) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
        }

        const centralUsers = await sql`SELECT * FROM public.app_users WHERE email = ${email}`;
        const centralUser = centralUsers[0];

        if (!centralUser || !await verifyPassword(password, centralUser.password_hash)) {
          return jsonResponse({ success: false, error: 'INVALID_CREDENTIALS', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, 401);
        }

        const activeSchema = centralUser.schema_name;

        // تم التعديل هنا أيضاً لقراءة السكيما بشكل صحيح
        const tenantUsers = await sql`SELECT * FROM ${sql(activeSchema + '.users')} WHERE id = ${centralUser.id}`;
        const user = tenantUsers[0];

        if (!user) {
          return jsonResponse({ success: false, error: 'TENANT_NOT_FOUND', message: 'فشل الوصول إلى بيانات السكيما الخاصة بك' }, 404);
        }

        if (!user.is_active) {
          return jsonResponse({ success: false, error: 'ACCOUNT_DISABLED', message: 'الحساب معطل' }, 403);
        }

        await sql`UPDATE ${sql(activeSchema + '.users')} SET last_login = now() WHERE id = ${user.id}`;
        const token = generateToken(user.id, user.email, user.role, activeSchema);

        return jsonResponse({
          success: true,
          data: {
            user: { id: user.id, email: user.email, full_name: user.full_name, company_name: user.company_name, role: user.role, schema_name: activeSchema },
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

      const userSchema = payload.schemaName;

      if (action === 'me') {
        const users = await sql`
          SELECT id, email, full_name, company_name, role, is_active, last_login, created_at
          FROM ${sql(userSchema + '.users')} WHERE id = ${payload.userId}
        `;
        if (users.length === 0) {
          return jsonResponse({ success: false, error: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' }, 404);
        }
        return jsonResponse({ success: true, data: { ...users[0], schema_name: userSchema } });
      }

      if (action === 'users') {
        if (payload.role !== 'admin') {
          return jsonResponse({ success: false, error: 'FORBIDDEN', message: 'غير مصرح لك بالوصول' }, 403);
        }
        const users = await sql`
          SELECT id, email, full_name, company_name, role, is_active, last_login, created_at
          FROM ${sql(userSchema + '.users')} ORDER BY created_at DESC
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

      const userSchema = payload.schemaName;
      const body = await req.json();
      const targetUserId = id || payload.userId;

      if (action === 'profile') {
        const full_name = body.full_name || body.fullName || body.name || '';
        const company_name = body.company_name || body.companyName || body.company || '';

        await sql`
          UPDATE ${sql(userSchema + '.users')} SET full_name = ${full_name}, company_name = ${company_name}, updated_at = now()
          WHERE id = ${targetUserId}
        `;
        return jsonResponse({ success: true, message: 'تم تحديث الملف الشخصي' });
      }

      if (action === 'password') {
        const { current_password, new_password } = body;
        if (!current_password || !new_password) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'كلمة المرور الحالية والجديدة مطلوبتان' }, 400);
        }

        const users = await sql`SELECT password_hash FROM ${sql(userSchema + '.users')} WHERE id = ${targetUserId}`;
        const user = users[0];

        if (!await verifyPassword(current_password, user.password_hash)) {
          return jsonResponse({ success: false, error: 'INVALID_PASSWORD', message: 'كلمة المرور الحالية غير صحيحة' }, 400);
        }

        const newPasswordHash = await hashPassword(new_password);
        
        await sql`UPDATE public.app_users SET password_hash = ${newPasswordHash} WHERE id = ${targetUserId}`;
        await sql`UPDATE ${sql(userSchema + '.users')} SET password_hash = ${newPasswordHash}, updated_at = now() WHERE id = ${targetUserId}`;
        
        return jsonResponse({ success: true, message: 'تم تحديث كلمة المرور بنجاح' });
      }
    }

    return jsonResponse({ success: false, error: 'NOT_FOUND', message: 'الإجراء غير موجود' }, 404);

  } catch (error) {
    console.error('Auth API Error:', error);
    return jsonResponse({ success: false, error: 'SERVER_ERROR', message: error.message }, 500);
  }
}

// === [ التصدير المتوافق مع معايير Vercel المحدثة ] ===
export async function GET(request) { return await handleRequest(request); }
export async function POST(request) { return await handleRequest(request); }
export async function PUT(request) { return await handleRequest(request); }
export async function OPTIONS() { 
  return new Response(null, { status: 200, headers: corsHeaders }); 
}
