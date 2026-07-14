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

// توليد التوكن مع تضمين اسم السكيما للتوجيه اللاحق للواجهة
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
  // الاتصال الافتراضي المركزي بالسكيما العامة public
  const sqlCentral = getDb('public');
  
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
        
        const full_name = body.full_name || body.fullName || body.name || '';
        const company_name = body.company_name || body.companyName || body.company || '';

        if (!email || !password) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
        }
        if (password.length < 6) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }, 400);
        }

        // 1. الفحص المركزي في جدول الحسابات الموحد (السكيما الافتراضية)
        const existingUsers = await sqlCentral`SELECT id FROM public.app_users WHERE email = ${email}`;
        if (existingUsers.length > 0) {
          return jsonResponse({ success: false, error: 'USER_EXISTS', message: 'المستخدم موجود بالفعل على المنصة' }, 400);
        }

        const userId = crypto.randomUUID(); 
        const passwordHash = await hashPassword(password);
        
        // 2. تجهيز اسم السكيما المستقل بناءً على الاسم القادم من الواجهة
        const schemaName = generateSchemaName(full_name || email.split('@')[0]);

        // 3. إنشاء السجل الأساسي في الجدول المركزي (app_users)
        await sqlCentral`
          INSERT INTO public.app_users (id, email, password_hash, schema_name)
          VALUES (${userId}, ${email}, ${passwordHash}, ${schemaName})
        `;

        // 4. استدعاء دالة التهيئة لإنشاء السكيما الجديدة وبناء الجداول بالداخل
        await initializeDatabase(schemaName);

        // 5. توليد التوكن وإعادة البيانات مباشرة للواجهة ليتم حفظ السكيما هناك
        const token = generateToken(userId, email, 'user', schemaName);
        
        return jsonResponse({ 
          success: true, 
          data: { 
            user: { 
              id: userId, 
              email, 
              full_name, 
              company_name, 
              role: 'user', 
              is_active: true, 
              schema_name: schemaName 
            }, 
            token 
          }, 
          message: 'تم إنشاء الحساب وتهيئة السكيما بنجاح' 
        }, 201);
      }

      // تسجيل الدخول
      if (action === 'login') {
        const { email, password } = body;
        if (!email || !password) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
        }

        // البحث والتحقق يتم بالكامل في الجدول المركزي فقط
        const centralUsers = await sqlCentral`SELECT * FROM public.app_users WHERE email = ${email}`;
        const centralUser = centralUsers[0];

        if (!centralUser || !await verifyPassword(password, centralUser.password_hash)) {
          return jsonResponse({ success: false, error: 'INVALID_CREDENTIALS', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, 401);
        }

        const activeSchema = centralUser.schema_name;

        // تصحيح الخطأ: تم استبدال الحقل غير الموجود updated_at بالحقل القياسي last_login لتجنب انهيار الاتصال
        try {
          await sqlCentral`UPDATE public.app_users SET last_login = now() WHERE id = ${centralUser.id}`;
        } catch (updateError) {
          // خطة بديلة (Fallback) في حال عدم توفر حقل last_login أيضاً في السكيما لتفادي توقف الدخول كلياً
          console.warn('Warning: Could not update login timestamp', updateError.message);
        }
        
        const token = generateToken(centralUser.id, centralUser.email, 'user', activeSchema);

        // إرجاع اسم السكيما للواجهة مباشرة لتحفظه وتوجه عملياتها إليه
        return jsonResponse({
          success: true,
          data: {
            user: { 
              id: centralUser.id, 
              email: centralUser.email, 
              role: 'user', 
              schema_name: activeSchema 
            },
            token
          },
          message: 'تم تسجيل الدخول بنجاح'
        });
      }
    }

    // === [ GET Requests: Me ] ===
    if (req.method === 'GET' && action === 'me') {
      const token = authHeader?.replace('Bearer ', '');
      if (!token) {
        return jsonResponse({ success: false, error: 'NO_TOKEN', message: 'لم يتم تقديم رمز المصادقة' }, 401);
      }

      const payload = verifyToken(token);
      if (!payload) {
        return jsonResponse({ success: false, error: 'INVALID_TOKEN', message: 'رمز المصادقة غير صالح أو منتهي الصلاحية' }, 401);
      }

      const centralUsers = await sqlCentral`SELECT id, email, schema_name FROM public.app_users WHERE id = ${payload.userId}`;
      if (centralUsers.length === 0) {
        return jsonResponse({ success: false, error: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' }, 404);
      }

      return jsonResponse({ 
        success: true, 
        data: { 
          id: centralUsers[0].id, 
          email: centralUsers[0].email, 
          schema_name: centralUsers[0].schema_name 
        } 
      });
    }

    return jsonResponse({ success: false, error: 'NOT_FOUND', message: 'الإجراء غير موجود' }, 404);

  } catch (error) {
    console.error('Auth API Error:', error);
    return jsonResponse({ success: false, error: 'SERVER_ERROR', message: error.message }, 500);
  }
}

// === [ التصدير المتوافق مع معايير Vercel ] ===
export async function GET(request) { return await handleRequest(request); }
export async function POST(request) { return await handleRequest(request); }
export async function OPTIONS() { 
  return new Response(null, { status: 200, headers: corsHeaders }); 
}
