/**
 * API Endpoints Configuration
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
 * روابط API الثابتة لنظام ERP
 * يتم استخدامها مع CapacitorHttp في الأندرويد
 */

// ============================================
// Base URL - الرابط الأساسي
// ============================================
export const API_BASE = 'https://nawh.vercel.app/api';

// ============================================
// Auth Endpoints - روابط المصادقة
// ============================================
export const AUTH_ENDPOINTS = {
  /** تسجيل الدخول */
  LOGIN: `${API_BASE}/auth?action=login`,

  /** إنشاء حساب جديد */
  REGISTER: `${API_BASE}/auth?action=register`,

  /** جلب بيانات المستخدم الحالي */
  ME: `${API_BASE}/auth?action=me`,

  /** تعديل الملف الشخصي */
  PROFILE: `${API_BASE}/auth?action=profile`,

  /** تغيير كلمة المرور */
  PASSWORD: `${API_BASE}/auth?action=password`,

  /** جلب المستخدمين (للمدير) */
  USERS: `${API_BASE}/auth?action=users`,
};

// ============================================
// Data Endpoints - روابط البيانات
// ============================================
export const DATA_ENDPOINTS = {
  /** لوحة التحكم والإحصائيات */
  DASHBOARD: `${API_BASE}/data?table=dashboard`,

  /** المنتجات */
  PRODUCTS: `${API_BASE}/data?table=products`,

  /** العملاء */
  CUSTOMERS: `${API_BASE}/data?table=customers`,

  /** الموردين */
  SUPPLIERS: `${API_BASE}/data?table=suppliers`,

  /** الفواتير */
  INVOICES: `${API_BASE}/data?table=invoices`,

  /** عناصر الفواتير */
  INVOICE_ITEMS: `${API_BASE}/data?table=invoice-items`,

  /** المشتريات */
  PURCHASES: `${API_BASE}/data?table=purchases`,

  /** المصاريف */
  EXPENSES: `${API_BASE}/data?table=expenses`,

  /** تصنيفات المصاريف */
  EXPENSE_CATEGORIES: `${API_BASE}/data?table=expense-categories`,

  /** رسائل الواتساب */
  WHATSAPP: `${API_BASE}/data?table=whatsapp`,

  /** تهيئة قاعدة البيانات */
  INIT_DB: `${API_BASE}/data?table=init-db`,
};

// ============================================
// Helper Functions - دوال مساعدة
// ============================================

/**
 * إضافة مُعامل ID للرابط
 * @param {string} endpoint - الرابط الأساسي
 * @param {string} id - المعرف
 * @returns {string} الرابط مع ID
 *
 * مثال: addId(DATA_ENDPOINTS.PRODUCTS, '123')
 * النتيجة: 'https://nawh.vercel.app/api/data?table=products&id=123'
 */
export function addId(endpoint, id) {
  if (!id) return endpoint;
  return `${endpoint}&id=${id}`;
}

/**
 * إضافة مُعامل البحث للرابط
 * @param {string} endpoint - الرابط الأساسي
 * @param {string} search - نص البحث
 * @returns {string} الرابط مع البحث
 */
export function addSearch(endpoint, search) {
  if (!search) return endpoint;
  return `${endpoint}&search=${encodeURIComponent(search)}`;
}

/**
 * إضافة مُعامل الفلتر للرابط
 * @param {string} endpoint - الرابط الأساسي
 * @param {string} key - اسم المعامل
 * @param {string|number|boolean} value - القيمة
 * @returns {string} الرابط مع الفلتر
 */
export function addParam(endpoint, key, value) {
  if (value === undefined || value === null || value === '') return endpoint;
  return `${endpoint}&${key}=${encodeURIComponent(value)}`;
}

/**
 * إضافة عدة معاملات للرابط
 * @param {string} endpoint - الرابط الأساسي
 * @param {object} params - المعاملات
 * @returns {string} الرابط مع المعاملات
 */
export function addParams(endpoint, params = {}) {
  let url = endpoint;
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url += `&${key}=${encodeURIComponent(value)}`;
    }
  }
  return url;
}

// ============================================
// Default Export
// ============================================
export default {
  API_BASE,
  AUTH_ENDPOINTS,
  DATA_ENDPOINTS,
  addId,
  addSearch,
  addParam,
  addParams,
};
