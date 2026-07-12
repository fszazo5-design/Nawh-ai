import { getDb, initializeDatabase } from './_db.js';

/**
 * Auth API Endpoint
 * يعتمد على جدول مركزي وحيد في السكيما العامة باسم app_users
 * ويقوم بإنشاء سكيمات ديناميكية مستقلة لكل عميل بناءً على الاسم القادم من التطبيق مرن للغاية
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

// دالة لتنظيف وتحويل الاسم لاسم سكيما متوافق مع Postgres
function generateSchemaName(fullName) {
  if (!fullName) return 'tenant_' + crypto.randomUUID().split('-')[0];
  
  let safeName = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_') // تحويل المسافات والرموز لشرطة سفلية
    .replace(/^[^a-z_]/, '_');    // التأكد أنها تبدأ بحرف وليس رقم
    
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
  const url = new URL(req.url, `https://${host}`);
  const action = url.searchParams.get('action') || 'me';
  const id = url.searchParams.get('id'); 

  try {
    // === [ POST Requests: Register & Login ] ===
    if (req.method === 'POST') {
      const body = await req.json();

      // --- التسجيل (Register) ---
      if (action === 'register') {
        const { email, password } = body;
        
        // 🔄 مرونة المدخلات: استخراج الاسم بأي صيغة يرسلها كود التطبيق
        const full_name = body.full_name || body.fullName || body.name;
        const company_name = body.company_name || body.companyName || body.company;

        if (!email || !password || !full_name) {
          return jsonResponse({ 
            success: false, 
            error: 'VALIDATION_ERROR', 
            message: 'البريد الإلكتروني، كلمة المرور والاسم الكامل مطلوبين' 
          }, 400);
        }

        // 1. الفحص المركزي في جدول public.app_users
        const existingUsers = await sql`SELECT id FROM public.app_users WHERE email = ${email}`;
        if (existingUsers.length > 0) {
          return jsonResponse({ success: false, error: 'USER_EXISTS', message: 'المستخدم موجود بالفعل على المنصة' }, 400);
        }

        const userId = crypto.randomUUID(); 
        const passwordHash = await hashPassword(password);
        
        // توليد اسم السكيما من الـ full_name المرن المستخرج
        const schemaName = generateSchemaName(full_name);

        // 2. حفظ السجل المركزي الأساسي
        await sql`
          INSERT INTO public.app_users (id, email, password_hash, schema_name)
          VALUES (${userId}, ${email}, ${passwordHash}, ${schemaName})
        `;

        // 3. إنشاء السكيما المستقلة والخاصة بهذا الحساب بناءً على الاسم المولد
        await initializeDatabase(schemaName);

        // 4. إدراج كافة البيانات التفصيلية داخل جدول الـ users التابع للسكيما الجديدة
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

        // 1. البحث في الجدول المركزي لمعرفة اسم السكيما
        const centralUsers = await sql`SELECT * FROM public.app_users WHERE email = ${email}`;
        const centralUser = centralUsers[0];

        if (!centralUser || !await verifyPassword(password, centralUser.password_hash)) {
          return jsonResponse({ success: false, error: 'INVALID_CREDENTIALS', message: 'بيانات الدخول غير صحيحة' }, 401);
        }

        const activeSchema = centralUser.schema_name;

        // 2. جلب البيانات من السكيما الخاصة بالمستخدم
        const tenantUsers = await sql`SELECT * FROM ${sql([activeSchema, 'users'])} WHERE id = ${centralUser.id}`;
        const user = tenantUsers[0];

        if (!user) {
          return jsonResponse({ success: false, error: 'TENANT_NOT_FOUND', message: 'فشل الوصول إلى بيانات السكيما الخاصة بك' }, 404);
        }

        if (!user.is_active) {
          return jsonResponse({ success: false, error: 'ACCOUNT_DISABLED', message: 'الحساب معطل' }, 403);
        }

        // تحديث وقت تسجيل الدخول داخل السكيما المخصصة
        await sql`UPDATE ${sql([activeSchema, 'users'])} SET last_login = now() WHERE id = ${user.id}`;
        
        const token = generateToken(user.id, user.email, user.role, activeSchema);

        return jsonResponse({
          success: true,
          data: {
            user: { id: user.id, email: user.email, full_name: user.full_name, company_name: user.company_name, role: user.role, schema_name: activeSchema },
            token
          },
          message: 'تم تسجيل الدخول بنجاح وتوجيهك للسكيما الخاصة بك'
        });
      }
    }

    // === [ GET Requests: Me & Users ] ===
    if (req.method === 'GET') {
      const token = authHeader?.replace('Bearer ', '');
      const payload = verifyToken(token);
      if (!payload) return jsonResponse({ success: false, error: 'INVALID_TOKEN', message: 'رمز غير صالح' }, 401);

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

    // === [ PUT Requests: Profile & Password ] ===
    if (req.method === 'PUT') {
      const token = authHeader?.replace('Bearer ', '');
      const payload = verifyToken(token);
      if (!payload) return jsonResponse({ success: false, error: 'INVALID_TOKEN' }, 401);

      const userSchema = payload.schemaName;
      const body = await req.json();
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
        
        // المزامنة بين الجدول المركزي والجدول الفرعي للسكيمات
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
