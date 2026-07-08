import { CapacitorHttp } from '@capacitor/core';

/**
 * API Endpoints & Request Service
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
 * إعداد الروابط الثابتة وإدارة الاتصال عبر CapacitorHttp للأندرويد
 */

// ============================================
// Auth Endpoints - روابط المصادقة (مباشرة بالكامل)
// ============================================
export const AUTH_ENDPOINTS = {
  /** تسجيل الدخول */
  LOGIN: 'https://nawh.vercel.app/api/auth?action=login',

  /** إنشاء حساب جديد */
  REGISTER: 'https://nawh.vercel.app/api/auth?action=register',

  /** جلب بيانات المستخدم الحالي */
  ME: 'https://nawh.vercel.app/api/auth?action=me',

  /** تعديل الملف الشخصي */
  PROFILE: 'https://nawh.vercel.app/api/auth?action=profile',

  /** تغيير كلمة المرور */
  PASSWORD: 'https://nawh.vercel.app/api/auth?action=password',

  /** جلب المستخدمين (للمدير) */
  USERS: 'https://nawh.vercel.app/api/auth?action=users',
};

// ============================================
// Data Endpoints - روابط البيانات (مباشرة بالكامل)
// ============================================
export const DATA_ENDPOINTS = {
  /** لوحة التحكم والإحصائيات */
  DASHBOARD: 'https://nawh.vercel.app/api/data?table=dashboard',

  /** المنتجات */
  PRODUCTS: 'https://nawh.vercel.app/api/data?table=products',

  /** العملاء */
  CUSTOMERS: 'https://nawh.vercel.app/api/data?table=customers',

  /** الموردين */
  SUPPLIERS: 'https://nawh.vercel.app/api/data?table=suppliers',

  /** الفواتير */
  INVOICES: 'https://nawh.vercel.app/api/data?table=invoices',

  /** عناصر الفواتير */
  INVOICE_ITEMS: 'https://nawh.vercel.app/api/data?table=invoice-items',

  /** المشتريات */
  PURCHASES: 'https://nawh.vercel.app/api/data?table=purchases',

  /** المصاريف */
  EXPENSES: 'https://nawh.vercel.app/api/data?table=expenses',

  /** تصنيفات المصاريف */
  EXPENSE_CATEGORIES: 'https://nawh.vercel.app/api/data?table=expense-categories',

  /** رسائل الواتساب */
  WHATSAPP: 'https://nawh.vercel.app/api/data?table=whatsapp',

  /** تهيئة قاعدة البيانات */
  INIT_DB: 'https://nawh.vercel.app/api/data?table=init-db',
};

// ============================================
// Helper Functions - دوال بناء الروابط
// ============================================

export function addId(endpoint, id) {
  if (!id) return endpoint;
  return `${endpoint}&id=${id}`;
}

export function addSearch(endpoint, search) {
  if (!search) return endpoint;
  return `${endpoint}&search=${encodeURIComponent(search)}`;
}

export function addParam(endpoint, key, value) {
  if (value === undefined || value === null || value === '') return endpoint;
  return `${endpoint}&${key}=${encodeURIComponent(value)}`;
}

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
// CapacitorHttp Request Service - خدمة الاتصال
// ============================================

/**
 * دالة مساعدة موحدة لجلب الـ Headers الافتراضية
 * يمكنك تعديلها لجلب التوكن تلقائياً من التخزين المحلي (Preferences)
 */
const getAuthHeaders = (customHeaders = {}) => {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...customHeaders
  };
};

export const HttpService = {
  /**
   * طلب من نوع GET
   */
  get: async (url, headers = {}) => {
    const options = {
      url: url,
      headers: getAuthHeaders(headers),
    };
    const response = await CapacitorHttp.get(options);
    return response.data;
  },

  /**
   * طلب من نوع POST
   */
  post: async (url, data = {}, headers = {}) => {
    const options = {
      url: url,
      data: data, // CapacitorHttp يتعامل مع الـ Serialization داخلياً للأندرويد
      headers: getAuthHeaders(headers),
    };
    const response = await CapacitorHttp.post(options);
    return response.data;
  },

  /**
   * طلب من نوع PUT
   */
  put: async (url, data = {}, headers = {}) => {
    const options = {
      url: url,
      data: data,
      headers: getAuthHeaders(headers),
    };
    const response = await CapacitorHttp.put(options);
    return response.data;
  },

  /**
   * طلب من نوع DELETE
   */
  delete: async (url, headers = {}) => {
    const options = {
      url: url,
      headers: getAuthHeaders(headers),
    };
    const response = await CapacitorHttp.delete(options);
    return response.data;
  }
};

// ============================================
// Default Export
// ============================================
export default {
  AUTH_ENDPOINTS,
  DATA_ENDPOINTS,
  addId,
  addSearch,
  addParam,
  addParams,
  HttpService
};
