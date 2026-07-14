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

// دالة لتنظيف وتحويل الاسم لاسم سكيما مستقل وصالح لـ Postgres
function generateSchemaName(fullName) {
  if (!fullName) return 'tenant_' + crypto.randomUUID().split('-')[0];
  
  let safeName = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_') // لضمان التوافق التام مع أسماء السكيما يفضل الحروف الإنجليزية والأرقام
    .replace(/^[^a-z_]/, '_');   
    
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
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
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

      // === الاشتراك وتوليد سكيما الحساب ===
      if (action === 'register') {
        const { email, password } = body;
        const full_name = body.full_name || body.fullName || body.name || '';
        const company_name = body.company_name || body.companyName || body.company || '';

        if (!email || !password) {
          return jsonResponse({ success: false, error: 'VALIDATION_ERROR', message: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, 400);
        }

        // 1. الفحص المركزي
        const existingUsers = await sqlCentral`SELECT id FROM public.app_users WHERE email = ${email}`;
        if (existingUsers.length > 0) {
          return jsonResponse({ success: false, error: 'USER_EXISTS', message: 'المستخدم موجود بالفعل على المنصة' }, 400);
        }

        const userId = crypto.randomUUID(); 
        const passwordHash = await hashPassword(password);
        
        // 2. توليد اسم السكيما الخاص بالحساب
        const schemaName = generateSchemaName(full_name || email.split('@')[0]);

        // 3. إنشاء السجل في الجدول المركزي
        await sqlCentral`
          INSERT INTO public.app_users (id, email, password_hash, schema_name)
          VALUES (${userId}, ${email}, ${passwordHash}, ${schemaName})
        `;

        // 4. السحر هنا: إنشاء سكيما جديدة واستنساخ الجداول والتريجرات من السكيما "pos" الجاهزة فوراً بـ 3 أسطر فقط وبسرعة خارقة!
        await sqlCentral`CREATE SCHEMA "${sqlCentral(schemaName)}"`;
        
        // أمر Postgres السريع لنسخ هيكل الجداول من السكيما النموذجية pos إلى السكيما الجديدة
        await sqlCentral`
          DO $$ 
          DECLARE 
            r RECORD; 
          BEGIN 
            FOR r IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'pos') LOOP 
              EXECUTE 'CREATE TABLE "' || ${schemaName} || '"."' || r.table_name || '" (LIKE "pos"."' || r.table_name || '" INCLUDING ALL)'; 
            END LOOP; 
          END $$;
        `;

        // دحرجة تصنيفات المصاريف الافتراضية للسكيما الجديدة
        await sqlCentral`
          INSERT INTO "${sqlCentral(schemaName)}".expense_categories (name)
          VALUES ('رواتب'), ('إيجار'), ('مرافق'), ('مواصلات'), ('صيانة'), ('مشتريات مكتبية'), ('تسويق'), ('أخرى')
          ON CONFLICT DO NOTHING
        `;

        // 5. توليد التوكن وإعادة البيانات
        const token = generateToken(userId, email, 'user', schemaName);
        
        return jsonResponse({ 
          success: true, 
          data: { user: { id: userId, email, full_name, company_name, role: 'user', is_active: true, schema_name: schemaName }, token }, 
          message: 'تم إنشاء الحساب وتهيئة السكيما الخاصة بك بنجاح' 
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

        const activeSchema = centralUser.schema_name;

        try {
          await sqlCentral`UPDATE public.app_users SET last_login = now() WHERE id = ${centralUser.id}`;
        } catch (e) { console.warn(e.message); }
        
        const token = generateToken(centralUser.id, centralUser.email, 'user', activeSchema);

        return jsonResponse({
          success: true,
          data: { user: { id: centralUser.id, email: centralUser.email, role: 'user', schema_name: activeSchema }, token },
          message: 'تم تسجيل الدخول بنجاح'
        });
      }
    }

    // === GET Me ===
    if (req.method === 'GET' && action === 'me') {
      const token = authHeader?.replace('Bearer ', '');
      if (!token) return jsonResponse({ success: false, error: 'NO_TOKEN', message: 'لم يتم تقديم رمز المصادقة' }, 401);

      const payload = verifyToken(token);
      if (!payload) return jsonResponse({ success: false, error: 'INVALID_TOKEN', message: 'الرمز غير صالح' }, 401);

      const centralUsers = await sqlCentral`SELECT id, email, schema_name FROM public.app_users WHERE id = ${payload.userId}`;
      if (centralUsers.length === 0) return jsonResponse({ success: false, error: 'USER_NOT_FOUND', message: 'المستخدم غير موجود' }, 404);

      return jsonResponse({ 
        success: true, 
        data: { id: centralUsers[0].id, email: centralUsers[0].email, schema_name: centralUsers[0].schema_name } 
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
