/**
 * Neon Database Service
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
 * خدمة مركزية لجميع عمليات قاعدة البيانات
 * تستخدم CapacitorHttp للاتصال في الأندرويد
 * وتدعم التخزين المحلي عبر Capacitor Preferences
 */

import { Preferences } from '@capacitor/preferences';
import { CapacitorHttp } from '@capacitor/core';
import {
  API_BASE,
  AUTH_ENDPOINTS,
  DATA_ENDPOINTS,
  addId,
  addSearch,
  addParams
} from '../config/apiEndpoints.js';

// ============================================
// Configuration
// ============================================

// التحقق من بيئة التشغيل
const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

// مفاتيح التخزين
const STORAGE_KEYS = {
  USER: 'nawh_user',
  TOKEN: 'nawh_token',
  OFFLINE_QUEUE: 'nawh_offline_queue',
  CACHE: 'nawh_cache',
  LAST_SYNC: 'nawh_last_sync',
};

// ============================================
// Storage Helpers - دوال التخزين
// ============================================

/**
 * حفظ البيانات محلياً
 */
async function saveToStorage(key, value) {
  try {
    await Preferences.set({ key, value: JSON.stringify(value) });
  } catch (err) {
    console.error('Storage save error:', err);
    localStorage.setItem(key, JSON.stringify(value));
  }
}

/**
 * جلب البيانات المحلية
 */
async function getFromStorage(key) {
  try {
    const { value } = await Preferences.get({ key });
    return value ? JSON.parse(value) : null;
  } catch (err) {
    const local = localStorage.getItem(key);
    return local ? JSON.parse(local) : null;
  }
}

/**
 * حذف البيانات المحلية
 */
async function removeFromStorage(key) {
  try {
    await Preferences.remove({ key });
  } catch (err) {
    localStorage.removeItem(key);
  }
}

// ============================================
// Token Management - إدارة الرمز
// ============================================

async function getToken() {
  return getFromStorage(STORAGE_KEYS.TOKEN);
}

async function setToken(token) {
  await saveToStorage(STORAGE_KEYS.TOKEN, token);
}

async function clearToken() {
  await removeFromStorage(STORAGE_KEYS.TOKEN);
}

// ============================================
// Response Helper
// ============================================
const createResponse = (success, data = null, error = null, message = '') => ({
  success,
  data,
  error,
  message,
  timestamp: new Date().toISOString()
});

// ============================================
// HTTP Request - CapacitorHttp
// ============================================

/**
 * إجراء طلب HTTP باستخدام CapacitorHttp
 * @param {object} options - { url, method, data, headers }
 * @returns {object} النتيجة الموحدة
 */
async function httpRequest(options) {
  const { url, method = 'GET', data = null, extraHeaders = {} } = options;

  // جلب التوكن
  const token = await getToken();

  // إعداد الهيدرز - CapacitorHttp format
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...extraHeaders
  };

  const requestOptions = {
    url,
    method,
    headers,
    responseType: 'json',
    readTimeout: 30000,
    connectTimeout: 30000,
  };

  // إضافة الـ data للـ POST/PUT في CapacitorHttp
  if (data && (method === 'POST' || method === 'PUT')) {
    requestOptions.data = data;
  }

  try {
    let response;

    if (isNative) {
      // استخدام CapacitorHttp في الأندرويد
      response = await CapacitorHttp.request(requestOptions);

      // CapacitorHttp response format
      const result = response.data || {};
      const isSuccess = response.status >= 200 && response.status < 300;

      if (!isSuccess) {
        return createResponse(false, null, result.error || 'HTTP_ERROR', result.message || 'خطأ في الاتصال');
      }

      return createResponse(true, result.data || result, null, result.message || '');
    } else {
      // استخدام fetch في الويب
      const fetchOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
          ...extraHeaders
        },
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        fetchOptions.body = JSON.stringify(data);
      }

      const fetchResponse = await fetch(url, fetchOptions);
      const result = await fetchResponse.json();

      if (!fetchResponse.ok) {
        return createResponse(false, null, result.error || 'HTTP_ERROR', result.message || 'خطأ في الاتصال');
      }

      return createResponse(true, result.data || result, null, result.message || '');
    }
  } catch (err) {
    console.error('HTTP Error:', err);

    // خطأ شبكة - إضافة للطابور المؤجل
    if (!navigator.onLine && method !== 'GET') {
      await queueOfflineOperation(url, method, data);
      return createResponse(false, null, 'OFFLINE', 'تم حفظ العمل للتنفيذ لاحقاً');
    }

    return createResponse(false, null, 'NETWORK_ERROR', 'خطأ في الاتصال بالخادم');
  }
}

// ============================================
// Offline Queue - طابور العمليات المؤجلة
// ============================================

async function queueOfflineOperation(url, method, data) {
  const queue = await getFromStorage(STORAGE_KEYS.OFFLINE_QUEUE) || [];
  queue.push({
    url,
    method,
    data,
    timestamp: Date.now()
  });
  await saveToStorage(STORAGE_KEYS.OFFLINE_QUEUE, queue);
}

/**
 * معالجة الطابور المؤجل
 */
export async function processOfflineQueue() {
  if (!navigator.onLine) return { processed: 0, failed: 0 };

  const queue = await getFromStorage(STORAGE_KEYS.OFFLINE_QUEUE) || [];
  if (queue.length === 0) return { processed: 0, failed: 0 };

  const failed = [];
  const token = await getToken();

  for (const item of queue) {
    try {
      const options = {
        url: item.url,
        method: item.method,
        data: item.data,
        extraHeaders: token ? { 'Authorization': `Bearer ${token}` } : {}
      };

      const result = await httpRequest(options);
      if (!result.success) {
        failed.push(item);
      }
    } catch {
      failed.push(item);
    }
  }

  await saveToStorage(STORAGE_KEYS.OFFLINE_QUEUE, failed);
  await saveToStorage(STORAGE_KEYS.LAST_SYNC, Date.now());

  return { processed: queue.length - failed.length, failed: failed.length };
}

// ============================================
// Cache Management - إدارة الكاش
// ============================================

async function cacheData(key, data, maxAge = 1800) {
  const cache = await getFromStorage(STORAGE_KEYS.CACHE) || {};
  cache[key] = {
    data,
    timestamp: Date.now(),
    maxAge
  };
  await saveToStorage(STORAGE_KEYS.CACHE, cache);
}

async function getCachedData(key) {
  const cache = await getFromStorage(STORAGE_KEYS.CACHE) || {};
  const item = cache[key];

  if (!item) return null;

  const maxAge = item.maxAge || 1800;
  if (Date.now() - item.timestamp > maxAge * 1000) {
    return null;
  }

  return item.data;
}

// ============================================
// Authentication API - واجهة المصادقة
// ============================================
export const auth = {
  /**
   * تسجيل الدخول
   */
  async login({ email, password }) {
    const result = await httpRequest({
      url: AUTH_ENDPOINTS.LOGIN,
      method: 'POST',
      data: { email, password }
    });

    if (result.success && result.data?.token) {
      await setToken(result.data.token);
      await saveToStorage(STORAGE_KEYS.USER, result.data.user || result.data);
    }

    return result;
  },

  /**
   * إنشاء حساب جديد
   */
  async register({ email, password, name }) {
    const result = await httpRequest({
      url: AUTH_ENDPOINTS.REGISTER,
      method: 'POST',
      data: { email, password, name }
    });

    if (result.success && result.data?.token) {
      await setToken(result.data.token);
      await saveToStorage(STORAGE_KEYS.USER, result.data.user || result.data);
    }

    return result;
  },

  /**
   * جلب بيانات المستخدم الحالي
   */
  async getCurrentUser() {
    const result = await httpRequest({
      url: AUTH_ENDPOINTS.ME,
      method: 'GET'
    });

    if (result.success) {
      await saveToStorage(STORAGE_KEYS.USER, result.data);
    }

    return result;
  },

  /**
   * تحديث الملف الشخصي
   */
  async updateProfile(data) {
    return httpRequest({
      url: AUTH_ENDPOINTS.PROFILE,
      method: 'PUT',
      data
    });
  },

  /**
   * تغيير كلمة المرور
   */
  async changePassword(current_password, new_password) {
    return httpRequest({
      url: AUTH_ENDPOINTS.PASSWORD,
      method: 'PUT',
      data: { current_password, new_password }
    });
  },

  /**
   * جلب جميع المستخدمين
   */
  async getUsers() {
    return httpRequest({
      url: AUTH_ENDPOINTS.USERS,
      method: 'GET'
    });
  },

  /**
   * تسجيل الخروج
   */
  async logout() {
    await clearToken();
    await removeFromStorage(STORAGE_KEYS.USER);
    return createResponse(true, null, null, 'تم تسجيل الخروج');
  },

  /**
   * جلب المستخدم من التخزين المحلي
   */
  async getUser() {
    return getFromStorage(STORAGE_KEYS.USER);
  },

  /**
   * جلب الرمز
   */
  async getToken() {
    return getToken();
  },

  /**
   * التحقق من المصادقة
   */
  async isAuthenticated() {
    const token = await getToken();
    return !!token;
  },

  /**
   * التحقق من الصلاحيات
   */
  async hasRole(requiredRole) {
    const user = await this.getUser();
    if (!user) return false;

    const hierarchy = { admin: 3, manager: 2, user: 1 };
    return (hierarchy[user.role] || 0) >= (hierarchy[requiredRole] || 0);
  }
};

// ============================================
// Products API - واجهة المنتجات
// ============================================
export const products = {
  async getAll(filters = {}) {
    const cacheKey = `products_${JSON.stringify(filters)}`;
    const cached = await getCachedData(cacheKey);

    // جلب الكاش أولاً
    if (cached) {
      this._syncBackground(filters);
      return cached;
    }

    let url = DATA_ENDPOINTS.PRODUCTS;
    url = addParams(url, filters);

    const result = await httpRequest({ url, method: 'GET' });

    if (result.success) {
      await cacheData(cacheKey, result.data);
      await cacheData('products_all', result.data, 3600);
      return result.data;
    }

    const fallback = await getCachedData('products_all');
    return fallback || [];
  },

  async _syncBackground(filters) {
    try {
      let url = DATA_ENDPOINTS.PRODUCTS;
      url = addParams(url, filters);
      const result = await httpRequest({ url, method: 'GET' });
      if (result.success) {
        const cacheKey = `products_${JSON.stringify(filters)}`;
        await cacheData(cacheKey, result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    const url = addId(DATA_ENDPOINTS.PRODUCTS, id);
    const result = await httpRequest({ url, method: 'GET' });
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await httpRequest({
      url: DATA_ENDPOINTS.PRODUCTS,
      method: 'POST',
      data
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const url = addId(DATA_ENDPOINTS.PRODUCTS, id);
    const result = await httpRequest({ url, method: 'PUT', data });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const url = addId(DATA_ENDPOINTS.PRODUCTS, id);
    const result = await httpRequest({ url, method: 'DELETE' });
    return result.success;
  },

  async getCount() {
    const products = await this.getAll({ is_active: true });
    return products.length;
  }
};

// ============================================
// Customers API - واجهة العملاء
// ============================================
export const customers = {
  async getAll(search = '') {
    const cacheKey = `customers_${search || 'all'}`;
    const cached = await getCachedData(cacheKey);

    if (cached) {
      this._syncBackground(search);
      return cached;
    }

    let url = DATA_ENDPOINTS.CUSTOMERS;
    if (search) url = addSearch(url, search);

    const result = await httpRequest({ url, method: 'GET' });

    if (result.success) {
      await cacheData(cacheKey, result.data);
      await cacheData('customers_all', result.data, 3600);
      return result.data;
    }

    const fallback = await getCachedData('customers_all');
    return fallback || [];
  },

  async _syncBackground(search) {
    try {
      let url = DATA_ENDPOINTS.CUSTOMERS;
      if (search) url = addSearch(url, search);
      const result = await httpRequest({ url, method: 'GET' });
      if (result.success) {
        await cacheData(`customers_${search || 'all'}`, result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    const url = addId(DATA_ENDPOINTS.CUSTOMERS, id);
    const result = await httpRequest({ url, method: 'GET' });
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await httpRequest({
      url: DATA_ENDPOINTS.CUSTOMERS,
      method: 'POST',
      data
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const url = addId(DATA_ENDPOINTS.CUSTOMERS, id);
    const result = await httpRequest({ url, method: 'PUT', data });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const url = addId(DATA_ENDPOINTS.CUSTOMERS, id);
    const result = await httpRequest({ url, method: 'DELETE' });
    return result.success;
  }
};

// ============================================
// Suppliers API - واجهة الموردين
// ============================================
export const suppliers = {
  async getAll(search = '') {
    const cacheKey = `suppliers_${search || 'all'}`;
    const cached = await getCachedData(cacheKey);

    if (cached) {
      this._syncBackground(search);
      return cached;
    }

    let url = DATA_ENDPOINTS.SUPPLIERS;
    if (search) url = addSearch(url, search);

    const result = await httpRequest({ url, method: 'GET' });

    if (result.success) {
      await cacheData(cacheKey, result.data);
      return result.data;
    }

    return [];
  },

  async _syncBackground(search) {
    try {
      let url = DATA_ENDPOINTS.SUPPLIERS;
      if (search) url = addSearch(url, search);
      const result = await httpRequest({ url, method: 'GET' });
      if (result.success) {
        await cacheData(`suppliers_${search || 'all'}`, result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    const url = addId(DATA_ENDPOINTS.SUPPLIERS, id);
    const result = await httpRequest({ url, method: 'GET' });
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await httpRequest({
      url: DATA_ENDPOINTS.SUPPLIERS,
      method: 'POST',
      data
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const url = addId(DATA_ENDPOINTS.SUPPLIERS, id);
    const result = await httpRequest({ url, method: 'PUT', data });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const url = addId(DATA_ENDPOINTS.SUPPLIERS, id);
    const result = await httpRequest({ url, method: 'DELETE' });
    return result.success;
  }
};

// ============================================
// Invoices API - واجهة الفواتير
// ============================================
export const invoices = {
  async getAll(filters = {}) {
    const cacheKey = `invoices_${JSON.stringify(filters)}`;
    const cached = await getCachedData(cacheKey);

    if (cached) {
      this._syncBackground(filters);
      return cached;
    }

    let url = DATA_ENDPOINTS.INVOICES;
    url = addParams(url, filters);

    const result = await httpRequest({ url, method: 'GET' });

    if (result.success) {
      await cacheData(cacheKey, result.data);
      await cacheData('invoices_all', result.data, 600);
      return result.data;
    }

    const fallback = await getCachedData('invoices_all');
    return fallback || [];
  },

  async _syncBackground(filters) {
    try {
      let url = DATA_ENDPOINTS.INVOICES;
      url = addParams(url, filters);
      const result = await httpRequest({ url, method: 'GET' });
      if (result.success) {
        await cacheData(`invoices_${JSON.stringify(filters)}`, result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    const url = addId(DATA_ENDPOINTS.INVOICES, id);
    const result = await httpRequest({ url, method: 'GET' });
    return result.success ? result.data : null;
  },

  async getItems(invoiceId) {
    const url = addParam(DATA_ENDPOINTS.INVOICE_ITEMS, 'invoice_id', invoiceId);
    const result = await httpRequest({ url, method: 'GET' });
    return result.success ? result.data : [];
  },

  /**
   * إنشاء فاتورة جديدة
   * هيكل JSON متوافق مع Backend
   */
  async create(data) {
    const invoiceData = {
      customer_id: data.customer_id || null,
      customer_name: data.customer_name || null,
      status: data.status || 'paid',
      subtotal: Number(data.subtotal) || 0,
      discount_amt: Number(data.discount_amt) || 0,
      tax_rate: Number(data.tax_rate) || 0,
      tax_amt: Number(data.tax_amt) || 0,
      total_amount: Number(data.total_amount) || 0,
      paid_amount: Number(data.paid_amount) || 0,
      payment_method: data.payment_method || 'cash',
      notes: data.notes || null,
      items: (data.items || []).map(item => ({
        product_id: item.product_id || null,
        name: item.name || '',
        qty: Number(item.qty) || 0,
        unit_price: Number(item.unit_price) || 0,
        discount: Number(item.discount) || 0,
        total: Number(item.total) || 0
      }))
    };

    const result = await httpRequest({
      url: DATA_ENDPOINTS.INVOICES,
      method: 'POST',
      data: invoiceData
    });

    return result.success ? result.data : null;
  },

  async updateStatus(id, status) {
    const url = addId(DATA_ENDPOINTS.INVOICES, id);
    const result = await httpRequest({
      url,
      method: 'PUT',
      data: { status }
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const url = addId(DATA_ENDPOINTS.INVOICES, id);
    const result = await httpRequest({ url, method: 'DELETE' });
    return result.success;
  },

  async getStats() {
    const all = await this.getAll();
    return {
      total_revenue: all.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0),
      total_count: all.length
    };
  },

  async getTodayStats() {
    const today = new Date().toISOString().slice(0, 10);
    const all = await this.getAll();
    const todayInvoices = all.filter(inv =>
      inv.created_at?.startsWith(today) && inv.status !== 'cancelled'
    );
    return {
      today_sales: todayInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0),
      today_count: todayInvoices.length
    };
  }
};

// ============================================
// Purchases API - واجهة المشتريات
// ============================================
export const purchases = {
  async getAll(filters = {}) {
    const cacheKey = `purchases_${JSON.stringify(filters)}`;
    const cached = await getCachedData(cacheKey);

    if (cached) return cached;

    let url = DATA_ENDPOINTS.PURCHASES;
    url = addParams(url, filters);

    const result = await httpRequest({ url, method: 'GET' });

    if (result.success) {
      await cacheData(cacheKey, result.data);
      return result.data;
    }

    return [];
  },

  async getById(id) {
    const url = addId(DATA_ENDPOINTS.PURCHASES, id);
    const result = await httpRequest({ url, method: 'GET' });
    return result.success ? result.data : null;
  },

  async create(data) {
    const purchaseData = {
      supplier_id: data.supplier_id || null,
      supplier_name: data.supplier_name || null,
      status: data.status || 'received',
      subtotal: Number(data.subtotal) || 0,
      discount_amt: Number(data.discount_amt) || 0,
      tax_amt: Number(data.tax_amt) || 0,
      total_amount: Number(data.total_amount) || 0,
      paid_amount: Number(data.paid_amount) || 0,
      payment_method: data.payment_method || 'cash',
      notes: data.notes || null,
      items: (data.items || []).map(item => ({
        product_id: item.product_id || null,
        name: item.name || '',
        qty: Number(item.qty) || 0,
        unit_cost: Number(item.unit_cost) || 0,
        total: Number(item.total) || 0
      }))
    };

    const result = await httpRequest({
      url: DATA_ENDPOINTS.PURCHASES,
      method: 'POST',
      data: purchaseData
    });

    return result.success ? result.data : null;
  },

  async delete(id) {
    const url = addId(DATA_ENDPOINTS.PURCHASES, id);
    const result = await httpRequest({ url, method: 'DELETE' });
    return result.success;
  },

  async getTotalAmount() {
    const all = await this.getAll();
    return all.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
  }
};

// ============================================
// Expenses API - واجهة المصاريف
// ============================================
export const expenses = {
  async getAll(filters = {}) {
    const cacheKey = `expenses_${JSON.stringify(filters)}`;
    const cached = await getCachedData(cacheKey);

    if (cached) return cached;

    let url = DATA_ENDPOINTS.EXPENSES;
    url = addParams(url, filters);

    const result = await httpRequest({ url, method: 'GET' });

    if (result.success) {
      await cacheData(cacheKey, result.data);
      return result.data;
    }

    return [];
  },

  async getById(id) {
    const url = addId(DATA_ENDPOINTS.EXPENSES, id);
    const result = await httpRequest({ url, method: 'GET' });
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await httpRequest({
      url: DATA_ENDPOINTS.EXPENSES,
      method: 'POST',
      data: {
        category_id: data.category_id || null,
        description: data.description || '',
        amount: Number(data.amount) || 0,
        paid_by: data.paid_by || null,
        receipt_url: data.receipt_url || null,
        expense_date: data.expense_date || null
      }
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const url = addId(DATA_ENDPOINTS.EXPENSES, id);
    const result = await httpRequest({ url, method: 'PUT', data });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const url = addId(DATA_ENDPOINTS.EXPENSES, id);
    const result = await httpRequest({ url, method: 'DELETE' });
    return result.success;
  },

  async getTotalAmount() {
    const all = await this.getAll();
    return all.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  },

  async getCategories() {
    const cached = await getCachedData('expense_categories');
    if (cached) return cached;

    const result = await httpRequest({
      url: DATA_ENDPOINTS.EXPENSE_CATEGORIES,
      method: 'GET'
    });

    if (result.success) {
      await cacheData('expense_categories', result.data, 3600);
    }

    return result.success ? result.data : [];
  }
};

// ============================================
// WhatsApp API
// ============================================
export const whatsapp = {
  async queueMessage(recipient, message, template = null, params = null) {
    const result = await httpRequest({
      url: DATA_ENDPOINTS.WHATSAPP,
      method: 'POST',
      data: {
        recipient,
        message,
        template_name: template,
        template_params: params
      }
    });
    return result.success ? result.data : null;
  },

  async getQueue(filters = {}) {
    let url = DATA_ENDPOINTS.WHATSAPP;
    url = addParams(url, filters);
    const result = await httpRequest({ url, method: 'GET' });
    return result.success ? result.data : [];
  },

  async updateStatus(id, status, errorMessage = null) {
    const url = addId(DATA_ENDPOINTS.WHATSAPP, id);
    const data = { status };
    if (errorMessage) data.error_message = errorMessage;

    const result = await httpRequest({ url, method: 'PUT', data });
    return result.success;
  }
};

// ============================================
// Dashboard API
// ============================================
export const dashboard = {
  async getStats() {
    const cached = await getCachedData('dashboard_stats');
    if (cached) return cached;

    const result = await httpRequest({
      url: DATA_ENDPOINTS.DASHBOARD,
      method: 'GET'
    });

    if (result.success) {
      await cacheData('dashboard_stats', result.data, 300);
      return result.data;
    }

    return {
      todaySales: 0,
      todayCount: 0,
      totalRevenue: 0,
      netProfit: 0,
      productCount: 0,
      totalExpenses: 0
    };
  }
};

// ============================================
// Database Initialization
// ============================================
export async function initializeDatabase() {
  return httpRequest({
    url: DATA_ENDPOINTS.INIT_DB,
    method: 'GET'
  });
}

// ============================================
// Sync Support
// ============================================
export const sync = {
  async getLocalChanges() {
    return getFromStorage(STORAGE_KEYS.OFFLINE_QUEUE) || [];
  },

  async clearLocalChanges() {
    await saveToStorage(STORAGE_KEYS.OFFLINE_QUEUE, []);
  },

  async getLastSyncTime() {
    return getFromStorage(STORAGE_KEYS.LAST_SYNC);
  }
};

// ============================================
// Default Export
// ============================================
export default {
  auth,
  products,
  customers,
  suppliers,
  invoices,
  purchases,
  expenses,
  whatsapp,
  dashboard,
  sync,
  initializeDatabase,
  processOfflineQueue,
  STORAGE_KEYS
};
