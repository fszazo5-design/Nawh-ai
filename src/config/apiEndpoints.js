/**
 * API Endpoints Configuration
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
 * روابط API الثابتة لنظام ERP
 * يتم استخدامها مع CapacitorHttp في التطبيقات والواجهات المختلفة
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

  /** Mشتريات */
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
// 🔥 Inventory Engine - محرك وعمليات المخزن المضافة
// ============================================
export const INVENTORY_ENDPOINTS = {
  /** جلب كامل حالة المخزن الحالية (الكميات والأسعار) */
  STOCK_STATUS: `${API_BASE}/data?table=products`,

  /** جلب المنتجات النشطة فقط في المخزن */
  ACTIVE_STOCK: `${API_BASE}/data?table=products&is_active=true`,

  /** جلب سجل حركات وجرد المخزن المتصل بـ الـ Audit Log */
  INVENTORY_LOG: `${API_BASE}/data?table=audit_log&limit=100`,

  /** جلب حركة المزامنة الخاصة بالمخزن والفواتير أوفلاين */
  SYNC_QUEUE: `${API_BASE}/data?table=sync_queue`,
};

// ============================================
// Helper Functions - دوال مساعدة
// ============================================

/**
 * إضافة مُعامل ID للرابط
 */
export function addId(endpoint, id) {
  if (!id) return endpoint;
  return `${endpoint}&id=${id}`;
}

/**
 * إضافة مُعامل البحث للرابط
 */
export function addSearch(endpoint, search) {
  if (!search) return endpoint;
  return `${endpoint}&search=${encodeURIComponent(search)}`;
}

/**
 * إضافة مُعامل الفلتر للرابط
 */
export function addParam(endpoint, key, value) {
  if (value === undefined || value === null || value === '') return endpoint;
  return `${endpoint}&${key}=${encodeURIComponent(value)}`;
}

/**
 * إضافة عدة معاملات للرابط
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

/**
 * 🔥 دالة مساعدة خاصة بالمخزن: جلب رابط منتج محدد بـ "الباركود"
 * @param {string} barcode - باركود المنتج والمراد جلب كميته ومخزونه
 * @returns {string} رابط جلب المنتج بواسطة الباركود
 */
export function getProductByBarcode(barcode) {
  if (!barcode) return DATA_ENDPOINTS.PRODUCTS;
  return `${DATA_ENDPOINTS.PRODUCTS}&barcode=${encodeURIComponent(barcode)}`;
}

/**
 * 🔥 دالة مساعدة خاصة بالمخزن: فلترة مخزون المنتجات حسب القسم (Category)
 * @param {string} category - اسم القسم (مثل: إلكترونيات، مجمدات)
 * @returns {string} رابط جلب مخزون القسم
 */
export function getStockByCategory(category) {
  if (!category) return DATA_ENDPOINTS.PRODUCTS;
  return `${DATA_ENDPOINTS.PRODUCTS}&category=${encodeURIComponent(category)}`;
}

// ============================================
// Default Export
// ============================================
export default {
  API_BASE,
  AUTH_ENDPOINTS,
  DATA_ENDPOINTS,
  INVENTORY_ENDPOINTS, // تم تصديرها هنا لتكون جاهزة للاستخدام المباشر
  addId,
  addSearch,
  addParam,
  addParams,
  getProductByBarcode,
  getStockByCategory,
};
