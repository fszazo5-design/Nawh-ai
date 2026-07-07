/**
 * API Endpoints Configuration
 * Centralized API routes for ERP System
 * All endpoints are relative to API_BASE URL
 */

// API Base URL - يتم读取 من متغيرات البيئة
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ============================================
// Auth Endpoints
// ============================================
export const AUTH_ENDPOINTS = {
  // تسجيل مستخدم جديد
  REGISTER: '/auth?action=register',
  // تسجيل الدخول
  LOGIN: '/auth?action=login',
  // جلب بيانات المستخدم الحالي
  ME: '/auth?action=me',
  // تحديث الملف الشخصي
  UPDATE_PROFILE: '/auth?action=profile',
  // تغيير كلمة المرور
  CHANGE_PASSWORD: '/auth?action=password',
  // جلب جميع المستخدمين (للمدير فقط)
  LIST_USERS: '/auth?action=users',
};

// ============================================
// Data Table Endpoints
// ============================================
export const DATA_ENDPOINTS = {
  // المنتجات
  PRODUCTS: '/data?table=products',
  PRODUCT_BY_ID: (id) => `/data?table=products&id=${id}`,
  PRODUCT_BY_BARCODE: (barcode) => `/data?table=products&barcode=${barcode}`,

  // العملاء
  CUSTOMERS: '/data?table=customers',
  CUSTOMER_BY_ID: (id) => `/data?table=customers&id=${id}`,

  // الموردين
  SUPPLIERS: '/data?table=suppliers',
  SUPPLIER_BY_ID: (id) => `/data?table=suppliers&id=${id}`,

  // الفواتير
  INVOICES: '/data?table=invoices',
  INVOICE_BY_ID: (id) => `/data?table=invoices&id=${id}`,
  INVOICE_ITEMS: (invoiceId) => `/data?table=invoice_items&invoice_id=${invoiceId}`,

  // المشتريات
  PURCHASES: '/data?table=purchases',
  PURCHASE_BY_ID: (id) => `/data?table=purchases&id=${id}`,
  PURCHASE_ITEMS: (purchaseId) => `/data?table=purchase_items&purchase_id=${purchaseId}`,

  // المصروفات
  EXPENSES: '/data?table=expenses',
  EXPENSE_BY_ID: (id) => `/data?table=expenses&id=${id}`,
  EXPENSE_CATEGORIES: '/data?table=expense_categories',

  // قائمة WhatsApp
  WHATSAPP_QUEUE: '/data?table=whatsapp_queue',
  WHATSAPP_PENDING: '/data?table=whatsapp_queue&status=pending',
  WHATSAPP_BY_ID: (id) => `/data?table=whatsapp_queue&id=${id}`,

  // سجل المراجعة
  AUDIT_LOG: '/data?table=audit_log',

  // قائمة المزامنة
  SYNC_QUEUE: '/data?table=sync_queue',
  SYNC_PENDING: '/data?table=sync_queue&pending=true',
};

// ============================================
// Action Endpoints
// ============================================
export const ACTION_ENDPOINTS = {
  // تهيئة قاعدة البيانات
  INIT_DB: '/data?action=init-db',
  // لوحة التحكم والإحصائيات
  DASHBOARD: '/data?action=dashboard',
};

// ============================================
// Helper Functions
// ============================================

/**
 * بناء رابط كامل مع فلتر
 * @param {string} endpoint - نقطة النهاية
 * @param {object} filters - معاملات الفلتر
 * @returns {string} الرابط الكامل
 */
export function buildUrl(endpoint, filters = {}) {
  const params = new URLSearchParams();

  // استخراج الـ table و action من الـ endpoint إذا موجودين
  const url = new URL(endpoint, 'http://dummy.com');
  for (const [key, value] of url.searchParams.entries()) {
    params.set(key, value);
  }

  // إضافة الفلاتر الإضافية
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });

  const basePath = endpoint.split('?')[0];
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * بناء رابط البحث
 * @param {string} table - اسم الجدول
 * @param {string} search - نص البحث
 * @returns {string} الرابط مع معامل البحث
 */
export function buildSearchUrl(table, search = '') {
  const params = new URLSearchParams();
  params.set('table', table);
  if (search) params.set('search', search);
  return `/data?${params.toString()}`;
}

// ============================================
// Default Export
// ============================================
export default {
  API_BASE,
  AUTH_ENDPOINTS,
  DATA_ENDPOINTS,
  ACTION_ENDPOINTS,
  buildUrl,
  buildSearchUrl,
};
