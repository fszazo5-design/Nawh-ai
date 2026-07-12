import { getDb, initializeDatabase } from './_db.js';

/**
 * Auth API Endpoint (Super Flexible Version)
 * يعتمد على جدول مركزي app_users ويدعم استقبال البيانات بجميع الصيغ (JSON & Form Data)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

function generateSchemaName(fullName) {
  if (!fullName) return 'tenant_' + crypto.randomUUID().split('-')[0];
  let safeName = fullName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z_]/, '_');
  return safeName || 'tenant_' + crypto.randomUUID().split('-')[0];
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + (process.env.AUTH_SECRET || 'nawh-secret-key'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, hash) {
  return (await hashPassword(password)) === hash;
}

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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

async function handleRequest(req) {
  const sql = getDb();
  
  const host = typeof req.headers.get === 'function' ? req.headers.get('host') : (req.headers?.host || 'localhost');
  const authHeader = typeof req.headers.get === 'function' ? req.headers.get('authorization') : (req.headers?.authorization);
  const contentType = typeof req.headers.get === 'function' ? req.headers.get('content-type') : (req.headers?.['content-type'] || '');
  
  const url = new URL(req.url, `https://${host}`);
  const action = url.searchParams.get('action') || 'me';
  const id = url.searchParams.get('id'); 

  try {
    // === [ POST Requests: Register & Login ] ===
    if (req.method === 'POST') {
      
      // 🛠️ استخراج البيانات بمرونة فائقة حسب نوع الـ Content-Type القادم من التطبيق
      let body = {};
      try {
        if (contentType.includes('application/json')) {
          body = await req.json();
        } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
          const formData = await req.formData();
          for (const [key, value] of formData.entries()) {
            body[key] = value;
          }
        } else {
          // محاولة احتياطية لقراءة النص كـ JSON في حال نسيان الهيدر تماماً
          const text = await req.text();
          body = JSON.parse(text);
        }
      } catch (e) {
        console.error("فشل قراءة البودي، محاولة قراءة النص مباشرة:", e);
      }

      // --- التسجيل (Register) ---
      if (action === 'register') {
        const email = body.email;
        const password = body.password;
        
        // جلب الاسم والشركة بأي مسمى ممكن يرسله التطبيق
        const full_name = body.full_name || body.fullName || body.name;
        const company_name = body.company_name || body.companyName || body.company;

        // طباعة البيانات في سجلات الفيرسيل للتأكد من وصولها
        console.log("البيانات المستلمة في السيرفر بنجاح:", { email, password, full_name, company_name });

        if (!email || !password || !full_name) {
          return jsonResponse({ 
            success: false, 
            error: 'VALIDATION_ERROR', 
            message: 'البريد الإلكتروني، كلمة المرور والاسم الكامل مطلوبين',
            debug_received: { email: !!email, password: !!password, full_name: !!full_name } // يوضح لك من المتغير الناقص بدقة
          }, 400);
        }

        // 1. الفحص المركزي في جدول public.app_users
        const existingUsers = await sql`SELECT id FROM public.app_users WHERE email = ${email}`;
        if (existingUsers.length > 0) {
          return jsonResponse({ success: false, error: 'USER_EXISTS', message: 'المستخدم موجود بالفعل على المنصة' }, 400);
        }

        const userId = crypto.randomUUID(); 
        const passwordHash = await hashPassword(password);
        const schemaName = generateSchemaName(full_name);

        // 2. حفظ السجل المركزي الأساسي
        await sql`
          INSERT INTO public.app_users (id, email, password_hash, schema_name)
          VALUES (${userId}, ${email}, ${passwordHash}, ${schemaName})
        `;

        // 3. إنشاء السكيما المستقلة
        await initializeDatabase(schemaName);

        // 4. إدراج البيانات داخل جدول الـ users التابع للسكيما الجديدة
        const result = await sql`
          INSERT INTO ${sql([schemaName, 'users'])} (id, email, password_hash, full_name, company_name, role, is_active)
          VALUES (${userId}, ${email}, ${passwordHash}, ${full_name}, ${company_name || ''}, 'user', true)
          RETURNING id, email, full_name, company_name, role, is_active, created_at
        `;
        
        const user = result[0];
        const token = generateToken(user.id, user.email, user.role, schemaName);
        
        return jsonResponse({ 
          success: true, 
          data: { user: { ...user, schema_name: schemaName }, token }, 
          message: 'تم إنشاء الحساب وتخصيص السكيما بنجاح' 
        }, 201);
      }

      // --- تسجيل الدخول (Login) ---
      if (action === 'login') {
        const { email, password } = body;
        if (!email || !password) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
        }

        const centralUsers = await sql`SELECT * FROM public.app_users WHERE email = ${email}`;
        const centralUser = centralUsers[0];

        if (!centralUser || !await verifyPassword(password, centralUser.password_hash)) {
          return jsonResponse({ success: false, error: 'INVALID_CREDENTIALS', message: 'بيانات الدخول غير صحيحة' }, 401);
        }

        const activeSchema = centralUser.schema_name;
        const tenantUsers = await sql`SELECT * FROM ${sql([activeSchema, 'users'])} WHERE id = ${centralUser.id}`;
        const user = tenantUsers[0];

        if (!user) {
          return jsonResponse({ success: false, error: 'TENANT_NOT_FOUND', message: 'فشل الوصول إلى بيانات السكيما الخاصة بك' }, 404);
        }

        if (!user.is_active) {
          return jsonResponse({ success: false, error: 'ACCOUNT_DISABLED', message: 'الحساب معطل' }, 403);
        }

        await sql`UPDATE ${sql([activeSchema, 'users'])} SET last_login = now() WHERE id = ${user.id}`;
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

    // === [ GET Requests ] ===
    if (req.method === 'GET') {
      const token = authHeader?.replace('Bearer ', '');
      const payload = verifyToken(token);
      if (!payload) return jsonResponse({ success: false, error: 'INVALID_TOKEN' }, 401);

      const userSchema = payload.schemaName;

      if (action === 'me') {
        const users = await sql`
          SELECT id, email, full_name, company_name, role, is_active, last_login, created_at
          FROM ${sql([userSchema, 'users'])} WHERE id = ${payload.userId}
        `;
        return jsonResponse({ success: true, data: { ...users[0], schema_name: userSchema } });
      }

      if (action === 'users') {
        if (payload.role !== 'admin') return jsonResponse({ success: false, error: 'FORBIDDEN' }, 403);
        const users = await sql`
          SELECT id, email, full_name, company_name, role, is_active, last_login, created_at
          FROM ${sql([userSchema, 'users'])} ORDER BY created_at DESC
        `;
        return jsonResponse({ success: true, data: users });
      }
    }

    // === [ PUT Requests ] ===
    if (req.method === 'PUT') {
      const token = authHeader?.replace('Bearer ', '');
      const payload = verifyToken(token);
      if (!payload) return jsonResponse({ success: false, error: 'INVALID_TOKEN' }, 401);

      const userSchema = payload.schemaName;
      const body = await req.json().catch(() => ({}));
      const targetUserId = id || payload.userId;

      if (action === 'profile') {
        const full_name = body.full_name || body.fullName || body.name;
        const company_name = body.company_name || body.companyName || body.company;

        await sql`
          UPDATE ${sql([userSchema, 'users'])} SET full_name = ${full_name}, company_name = ${company_name}, updated_at = now()
          WHERE id = ${targetUserId}
        `;
        return jsonResponse({ success: true, message: 'تم تحديث الملف الشخصي' });
      }

      if (action === 'password') {
        const { current_password, new_password } = body;
        const users = await sql`SELECT password_hash FROM ${sql([userSchema, 'users'])} WHERE id = ${targetUserId}`;
        if (!users[0] || !await verifyPassword(current_password, users[0].password_hash)) {
          return jsonResponse({ success: false, message: 'كلمة المرور الحالية خاطئة' }, 400);
        }

        const newPasswordHash = await hashPassword(new_password);
        await sql`UPDATE public.app_users SET password_hash = ${newPasswordHash} WHERE id = ${targetUserId}`;
        await sql`UPDATE ${sql([userSchema, 'users'])} SET password_hash = ${newPasswordHash}, updated_at = now() WHERE id = ${targetUserId}`;
        return jsonResponse({ success: true, message: 'تم تحديث كلمة المرور' });
      }
    }

    return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);

  } catch (error) {
    console.error('Auth API Error:', error);
    return jsonResponse({ success: false, error: 'SERVER_ERROR', message: error.message }, 500);
  }
}

export async function GET(request) { return await handleRequest(request); }
export async function POST(request) { return await handleRequest(request); }
export async function PUT(request) { return await handleRequest(request); }
export async function OPTIONS() { return new Response(null, { status: 200, headers: corsHeaders }); }
