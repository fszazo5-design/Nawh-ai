import { getDb } from './_db.js';

/**
 * Auth API Endpoint (Vercel Web Fetch API Style)
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
};

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

function generateToken(userId, email, role, schemaName = 'pos') {
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

// الدالة الرئيسية
async function handleRequest(req) {
  const sqlCentral = getDb('public');
  
  const host = typeof req.headers.get === 'function' ? req.headers.get('host') : (req.headers?.host || 'localhost');
  const authHeader = typeof req.headers.get === 'function' ? req.headers.get('authorization') : (req.headers?.authorization);

  const url = new URL(req.url, `https://${host}`);
  const action = url.searchParams.get('action') || 'me';

  try {
    if (req.method === 'POST') {
      const body = await req.json();

      // === الاشتراك وإنشاء الحساب الموحد ===
      if (action === 'register') {
        const { email, password } = body;
        const full_name = body.full_name || body.fullName || body.name || '';
        const company_name = body.company_name || body.companyName || body.company || '';

        if (!email || !password) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
        }

        // 1. الفحص المركزي في جدول المنصة الرئيسي
        const existingUsers = await sqlCentral`SELECT id FROM public.app_users WHERE email = ${email}`;
        if (existingUsers.length > 0) {
          return jsonResponse({ success: false, error: 'USER_EXISTS', message: 'المستخدم موجود بالفعل على المنصة' }, 400);
        }

        const userId = crypto.randomUUID(); 
        const passwordHash = await hashPassword(password);
        
        // السكيما الموحدة دائماً هي pos
        const schemaName = 'pos';

        // 2. إنشاء السجل في الجدول المركزي للمنصة (التحكم بالولوج)
        await sqlCentral`
          INSERT INTO public.app_users (id, email, password_hash, schema_name)
          VALUES (${userId}, ${email}, ${passwordHash}, ${schemaName})
        `;

        // 3. مزامنة وإنشاء حساب المستخدم مباشرة داخل جدول المستخدمين بسكيما pos لتفعيل العلاقات
        await sqlCentral`
          INSERT INTO "pos".users (id, email, password_hash, full_name, role, is_active)
          VALUES (${userId}, ${email}, ${passwordHash}, ${full_name}, 'admin', true)
        `;

        // 4. توليد التوكن وإعادة البيانات للواجهة
        const token = generateToken(userId, email, 'admin', schemaName);
        
        return jsonResponse({ 
          success: true, 
          data: { 
            user: { 
              id: userId, 
              email, 
              full_name, 
              company_name, 
              role: 'admin', 
              is_active: true, 
              schema_name: schemaName 
            }, 
            token 
          }, 
          message: 'تم إنشاء الحساب بنجاح وتهيئته ضمن بيئة النظام الموحدة' 
        }, 201);
      }

      // === تسجيل الدخول ===
      if (action === 'login') {
        const { email, password } = body;
        if (!email || !password) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
        }

        const centralUsers = await sqlCentral`SELECT * FROM public.app_users WHERE email = ${email}`;
        const centralUser = centralUsers[0];

        if (!centralUser || !await verifyPassword(password, centralUser.password_hash)) {
          return jsonResponse({ success: false, error: 'INVALID_CREDENTIALS', message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, 401);
        }

        // السكيما النشطة دائماً هي pos
        const activeSchema = 'pos';

        try {
          await sqlCentral`UPDATE public.app_users SET last_login = now() WHERE id = ${centralUser.id}`;
          await sqlCentral`UPDATE "pos".users SET last_login = now() WHERE id = ${centralUser.id}`;
        } catch (e) { 
          console.warn('Update last login warning:', e.message); 
        }
        
        const token = generateToken(centralUser.id, centralUser.email, 'admin', activeSchema);

        return jsonResponse({
          success: true,
          data: { 
            user: { 
              id: centralUser.id, 
              email: centralUser.email, 
              role: 'admin', 
              schema_name: activeSchema 
            }, 
            token 
          },
          message: 'تم تسجيل الدخول بنجاح'
        });
      }
    }

    // === الحصول على بيانات الجلسة الحالية (GET Me) ===
    if (req.method === 'GET' && action === 'me') {
      const token = authHeader?.replace('Bearer ', '');
      if (!token) return jsonResponse({ success: false, error: 'NO_TOKEN', message: 'لم يتم تقديم رمز المصادقة' }, 401);

      const payload = verifyToken(token);
      if (!payload) return jsonResponse({ success: false, error: 'INVALID_TOKEN', message: 'الرمز غير صالح' }, 401);

      const centralUsers = await sqlCentral`SELECT id, email FROM public.app_users WHERE id = ${payload.userId}`;
      if (centralUsers.length === 0) return jsonResponse({ success: false, error: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' }, 404);

      return jsonResponse({ 
        success: true, 
        data: { 
          id: centralUsers[0].id, 
          email: centralUsers[0].email, 
          schema_name: 'pos' 
        } 
      });
    }

    return jsonResponse({ success: false, error: 'NOT_FOUND', message: 'الإجراء غير موجود' }, 404);

  } catch (error) {
    console.error('Auth API Error:', error);
    return jsonResponse({ success: false, error: 'SERVER_ERROR', message: error.message }, 500);
  }
}

export async function GET(request) { return await handleRequest(request); }
export async function POST(request) { return await handleRequest(request); }
export async function OPTIONS() { return new Response(null, { status: 200, headers: corsHeaders }); }
