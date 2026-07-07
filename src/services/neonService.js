/**
 * Neon Database Service
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
 * خدمة مركزية لجميع عمليات قاعدة البيانات عبر API
 * تدعم التخزين المحلي عبر Capacitor Preferences
 * وتخزين البيانات المؤقتة عبر SQLite
 */

import { Preferences } from '@capacitor/preferences';
import { API_BASE, AUTH_ENDPOINTS, DATA_ENDPOINTS, ACTION_ENDPOINTS, buildUrl } from '../config/apiEndpoints.js';

// ============================================
// Storage Keys - مفاتيح التخزين
// ============================================
const STORAGE_KEYS = {
  USER: 'nawh_user',           // بيانات المستخدم
  TOKEN: 'nawh_token',          // رمز المصادقة
  OFFLINE_QUEUE: 'nawh_offline_queue',  // طابور العمليات المؤجلة
  CACHE: 'nawh_cache',          // مخزن البيانات المؤقت
  SCHEMA: 'nawh_schema',        // مخطط قاعدة البيانات
  SESSION: 'nawh_session',      // بيانات الجلسة
  LAST_SYNC: 'nawh_last_sync',  // وقت آخر مزامنة
};

// ============================================
// Capacitor SQLite - للتخزين المحلي
// ============================================
let CapacitorSQLite = null;
let isNative = false;

/**
 * تهيئة SQLite للموبايل
 */
async function initSQLite() {
  try {
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
      isNative = true;
      const sqliteModule = await import('@capacitor-community/sqlite');
      CapacitorSQLite = sqliteModule.CapacitorSQLite;
      await CapacitorSQLite.open({ database: 'nawh_pos.db' });
      await createLocalTables();
      console.log('SQLite initialized successfully');
    }
  } catch (err) {
    console.log('SQLite not available, using Preferences only:', err.message);
  }
}

/**
 * إنشاء الجداول المحلية
 */
async function createLocalTables() {
  if (!CapacitorSQLite) return;

  const sql = `
    CREATE TABLE IF NOT EXISTS local_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_products (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_invoices (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
  `;

  try {
    await CapacitorSQLite.execute({ statements: sql });
  } catch (err) {
    console.error('Error creating local tables:', err);
  }
}

// تهيئة SQLite عند تحميل الموديول
initSQLite();

// ============================================
// Preferences Storage Helpers
// دوال التخزين باستخدام Capacitor Preferences
// ============================================

/**
 * حفظ البيانات في التخزين المحلي
 * @param {string} key - المفتاح
 * @param {any} value - القيمة (يتم تحويلها لـ JSON تلقائياً)
 */
async function saveToStorage(key, value) {
  try {
    await Preferences.set({
      key: key,
      value: JSON.stringify(value)
    });
  } catch (err) {
    console.error('Error saving to Preferences:', err);
    // Fallback للـ localStorage عند الضرورة
    localStorage.setItem(key, JSON.stringify(value));
  }
}

/**
 * جلب البيانات من التخزين المحلي
 * @param {string} key - المفتاح
 * @returns {any} القيمة المحفوظة أو null
 */
async function getFromStorage(key) {
  try {
    const { value } = await Preferences.get({ key: key });
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error('Error getting from Preferences:', err);
    // Fallback للـ localStorage
    const localValue = localStorage.getItem(key);
    return localValue ? JSON.parse(localValue) : null;
  }
}

/**
 * حذف عنصر من التخزين المحلي
 * @param {string} key - المفتاح
 */
async function removeFromStorage(key) {
  try {
    await Preferences.remove({ key: key });
  } catch (err) {
    console.error('Error removing from Preferences:', err);
    localStorage.removeItem(key);
  }
}

/**
 * مسح جميع البيانات المحفوظة
 */
async function clearAllStorage() {
  try {
    await Preferences.clear();
  } catch (err) {
    console.error('Error clearing Preferences:', err);
    localStorage.clear();
  }
}

// ============================================
// Token Management - إدارة الرمز
// ============================================

/**
 * جلب الرمز المحفوظ
 * @returns {string|null}
 */
async function getToken() {
  return getFromStorage(STORAGE_KEYS.TOKEN);
}

/**
 * حفظ الرمز
 * @param {string} token
 */
async function setToken(token) {
  await saveToStorage(STORAGE_KEYS.TOKEN, token);
}

/**
 * حذف الرمز
 */
async function clearToken() {
  await removeFromStorage(STORAGE_KEYS.TOKEN);
}

// ============================================
// Response Helper - صيغة JSON موحدة
// ============================================
const createResponse = (success, data = null, error = null, message = '') => ({
  success,
  data,
  error,
  message,
  timestamp: new Date().toISOString()
});

// ============================================
// HTTP Request Helper - دالة الطلب الأساسية
// ============================================

/**
 * إجراء طلب HTTP
 * @param {string} endpoint - نقطة النهاية
 * @param {object} options - خيارات الطلب
 * @returns {object} نتيجة موحدة
 */
async function request(endpoint, options = {}) {
  // جلب الرمز بشكل غير متزامن
  const token = await getToken();

  // إعداد الهيدرز
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    }
  };

  // بناء الرابط الكامل
  const fullUrl = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(fullUrl, config);
    const result = await response.json();

    if (!response.ok) {
      return createResponse(
        false,
        null,
        result.error || 'HTTP_ERROR',
        result.message || 'حدث خطأ في الاتصال'
      );
    }

    return createResponse(true, result.data, null, result.message);
  } catch (err) {
    // خطأ في الشبكة - وضع عدم الاتصال
    if (!navigator.onLine) {
      if (options.method && options.method !== 'GET') {
        // إضافة العملية للطابور المؤجل
        await queueOfflineOperation(endpoint, options);
        return createResponse(false, null, 'OFFLINE', 'تم حفظ العمل للتنفيذ لاحقاً');
      }
    }

    console.error('API Error:', err);
    return createResponse(false, null, 'NETWORK_ERROR', 'خطأ في الاتصال بالخادم');
  }
}

// ============================================
// Offline Queue Management - طابور العمليات المؤجلة
// ============================================

/**
 * إضافة عملية للطابور المؤجل
 * @param {string} endpoint
 * @param {object} options
 */
async function queueOfflineOperation(endpoint, options) {
  const queue = await getFromStorage(STORAGE_KEYS.OFFLINE_QUEUE) || [];
  queue.push({
    endpoint,
    method: options.method,
    body: options.body,
    timestamp: Date.now()
  });
  await saveToStorage(STORAGE_KEYS.OFFLINE_QUEUE, queue);
}

/**
 * معالجة الطابور المؤجل عند عودة الاتصال
 * @returns {object} نتيجة المعالجة
 */
export async function processOfflineQueue() {
  if (!navigator.onLine) return { processed: 0, failed: 0 };

  const queue = await getFromStorage(STORAGE_KEYS.OFFLINE_QUEUE) || [];
  if (queue.length === 0) return { processed: 0, failed: 0 };

  const failed = [];
  const token = await getToken();

  for (const item of queue) {
    try {
      const response = await fetch(`${API_BASE}${item.endpoint}`, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: item.body
      });

      if (!response.ok) {
        failed.push(item);
      }
    } catch {
      failed.push(item);
    }
  }

  // حفظ العمليات الفاشلة للإعادة لاحقاً
  await saveToStorage(STORAGE_KEYS.OFFLINE_QUEUE, failed);

  // تحديث وقت آخر مزامنة
  await saveToStorage(STORAGE_KEYS.LAST_SYNC, Date.now());

  return { processed: queue.length - failed.length, failed: failed.length };
}

// ============================================
// Cache Management - إدارة التخزين المؤقت
// ============================================

/**
 * حفظ البيانات في الكاش
 * @param {string} key
 * @param {any} data
 */
async function cacheData(key, data) {
  const cache = await getFromStorage(STORAGE_KEYS.CACHE) || {};
  cache[key] = {
    data,
    timestamp: Date.now()
  };
  await saveToStorage(STORAGE_KEYS.CACHE, cache);
}

/**
 * جلب البيانات من الكاش
 * @param {string} key
 * @param {number} maxAge - أقصى عمر بالثواني (افتراضي 30 دقيقة)
 * @returns {any|null}
 */
async function getCachedData(key, maxAge = 1800) {
  const cache = await getFromStorage(STORAGE_KEYS.CACHE) || {};
  const item = cache[key];

  if (!item) return null;

  // التحقق من صلاحية الكاش
  if (Date.now() - item.timestamp > maxAge * 1000) {
    return null;
  }

  return item.data;
}

/**
 * مسح الكاش
 */
async function clearCache() {
  await saveToStorage(STORAGE_KEYS.CACHE, {});
}

// ============================================
// Authentication API - واجهة المصادقة
// ============================================
export const auth = {
  /**
   * تسجيل مستخدم جديد
   * @param {object} credentials - { email, password, full_name }
   * @returns {object}
   */
  async register({ email, password, full_name }) {
    const result = await request(AUTH_ENDPOINTS.REGISTER, {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name })
    });

    if (result.success && result.data?.token) {
      await setToken(result.data.token);
      await saveToStorage(STORAGE_KEYS.USER, result.data.user);
    }

    return result;
  },

  /**
   * تسجيل الدخول
   * @param {object} credentials - { email, password }
   * @returns {object}
   */
  async login({ email, password }) {
    const result = await request(AUTH_ENDPOINTS.LOGIN, {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (result.success && result.data?.token) {
      await setToken(result.data.token);
      await saveToStorage(STORAGE_KEYS.USER, result.data.user);
    }

    return result;
  },

  /**
   * تسجيل الخروج
   * @returns {object}
   */
  async logout() {
    await clearToken();
    await removeFromStorage(STORAGE_KEYS.USER);
    await clearCache();
    return createResponse(true, null, null, 'تم تسجيل الخروج');
  },

  /**
   * جلب بيانات المستخدم الحالي من السيرفر
   * @returns {object}
   */
  async getCurrentUser() {
    const result = await request(AUTH_ENDPOINTS.ME);

    if (result.success) {
      await saveToStorage(STORAGE_KEYS.USER, result.data);
    }

    return result;
  },

  /**
   * تحديث الملف الشخصي
   * @param {object} data
   * @returns {object}
   */
  async updateProfile(data) {
    return request(AUTH_ENDPOINTS.UPDATE_PROFILE, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  /**
   * تغيير كلمة المرور
   * @param {string} current_password
   * @param {string} new_password
   * @returns {object}
   */
  async changePassword(current_password, new_password) {
    return request(AUTH_ENDPOINTS.CHANGE_PASSWORD, {
      method: 'PUT',
      body: JSON.stringify({ current_password, new_password })
    });
  },

  /**
   * جلب بيانات المستخدم من التخزين المحلي (غير متزامن)
   * @returns {object|null}
   */
  async getUser() {
    return getFromStorage(STORAGE_KEYS.USER);
  },

  /**
   * جلب الرمز من التخزين المحلي
   * @returns {string|null}
   */
  async getToken() {
    return getToken();
  },

  /**
   * التحقق من حالة المصادقة
   * @returns {boolean}
   */
  async isAuthenticated() {
    const token = await getToken();
    return !!token;
  },

  /**
   * التحقق من الصلاحيات
   * @param {string} requiredRole
   * @returns {boolean}
   */
  async hasRole(requiredRole) {
    const user = await this.getUser();
    if (!user) return false;

    const roleHierarchy = { admin: 3, manager: 2, user: 1 };
    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return userLevel >= requiredLevel;
  }
};

// ============================================
// Products API - واجهة المنتجات
// ============================================
export const products = {
  /**
   * جلب جميع المنتجات - محلياً أولاً ثم من السيرفر
   * @param {object} filters
   * @returns {array}
   */
  async getAll(filters = {}) {
    // 1. جلب من الكاش المحلي أولاً
    const cacheKey = `products_${JSON.stringify(filters)}`;
    const cachedProducts = await getCachedData(cacheKey);

    if (cachedProducts && cachedProducts.length > 0) {
      // تشغيل المزامنة في الخلفية دون انتظار
      this._syncFromServer(filters, cacheKey);
      return cachedProducts;
    }

    // 2. جلب من السيرفر
    const params = new URLSearchParams();
    params.set('table', 'products');

    if (filters.category) params.set('category', filters.category);
    if (filters.search) params.set('search', filters.search);
    if (filters.is_active !== undefined) params.set('is_active', filters.is_active);
    if (filters.barcode) params.set('barcode', filters.barcode);

    const result = await request(`/data?${params.toString()}`);

    if (result.success) {
      // حفظ في الكاش
      await cacheData(cacheKey, result.data);
      await cacheData('products_all', result.data);
      return result.data;
    }

    // 3. محاولة جلب الكاش القديم كحل أخير
    const fallbackCache = await getCachedData('products_all', 86400); // يوم كامل
    return fallbackCache || [];
  },

  /**
   * مزامنة في الخلفية
   */
  async _syncFromServer(filters, cacheKey) {
    try {
      const params = new URLSearchParams();
      params.set('table', 'products');
      if (filters.is_active !== undefined) params.set('is_active', filters.is_active);

      const result = await request(`/data?${params.toString()}`);
      if (result.success) {
        await cacheData(cacheKey, result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  /**
   * جلب منتج بالـ ID
   */
  async getById(id) {
    const result = await request(DATA_ENDPOINTS.PRODUCT_BY_ID(id));
    return result.success ? result.data : null;
  },

  /**
   * جلب منتج بالباركود
   */
  async getByBarcode(barcode) {
    const result = await request(DATA_ENDPOINTS.PRODUCT_BY_BARCODE(barcode));
    return result.success ? result.data?.[0] || null : null;
  },

  /**
   * إنشاء منتج جديد
   */
  async create(data) {
    const result = await request(DATA_ENDPOINTS.PRODUCTS, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (result.success) {
      // تحديث الكاش المحلي
      await cacheData('products_all', null); // إبطال الكاش
    }

    return result.success ? result.data : null;
  },

  /**
   * تحديث منتج
   */
  async update(id, data) {
    const result = await request(DATA_ENDPOINTS.PRODUCT_BY_ID(id), {
      method: 'PUT',
      body: JSON.stringify(data)
    });

    if (result.success) {
      await cacheData('products_all', null);
    }

    return result.success ? result.data : null;
  },

  /**
   * حذف منتج
   */
  async delete(id) {
    const result = await request(DATA_ENDPOINTS.PRODUCT_BY_ID(id), {
      method: 'DELETE'
    });

    if (result.success) {
      await cacheData('products_all', null);
    }

    return result.success;
  },

  /**
   * عدد المنتجات
   */
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
    // جلب من الكاش أولاً
    const cacheKey = `customers_${search || 'all'}`;
    const cached = await getCachedData(cacheKey);

    if (cached && cached.length > 0) {
      this._syncFromServer(search, cacheKey);
      return cached;
    }

    const url = buildUrl(DATA_ENDPOINTS.CUSTOMERS, { search });
    const result = await request(url);

    if (result.success) {
      await cacheData(cacheKey, result.data);
      await cacheData('customers_all', result.data);
      return result.data;
    }

    const fallback = await getCachedData('customers_all', 86400);
    return fallback || [];
  },

  async _syncFromServer(search, cacheKey) {
    try {
      const url = buildUrl(DATA_ENDPOINTS.CUSTOMERS, { search });
      const result = await request(url);
      if (result.success) {
        await cacheData(cacheKey, result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    const result = await request(DATA_ENDPOINTS.CUSTOMER_BY_ID(id));
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request(DATA_ENDPOINTS.CUSTOMERS, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (result.success) await cacheData('customers_all', null);
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(DATA_ENDPOINTS.CUSTOMER_BY_ID(id), {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (result.success) await cacheData('customers_all', null);
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(DATA_ENDPOINTS.CUSTOMER_BY_ID(id), {
      method: 'DELETE'
    });
    if (result.success) await cacheData('customers_all', null);
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

    if (cached && cached.length > 0) {
      this._syncFromServer(search, cacheKey);
      return cached;
    }

    const url = buildUrl(DATA_ENDPOINTS.SUPPLIERS, { search });
    const result = await request(url);

    if (result.success) {
      await cacheData(cacheKey, result.data);
      await cacheData('suppliers_all', result.data);
      return result.data;
    }

    const fallback = await getCachedData('suppliers_all', 86400);
    return fallback || [];
  },

  async _syncFromServer(search, cacheKey) {
    try {
      const url = buildUrl(DATA_ENDPOINTS.SUPPLIERS, { search });
      const result = await request(url);
      if (result.success) await cacheData(cacheKey, result.data);
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    const result = await request(DATA_ENDPOINTS.SUPPLIER_BY_ID(id));
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request(DATA_ENDPOINTS.SUPPLIERS, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (result.success) await cacheData('suppliers_all', null);
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(DATA_ENDPOINTS.SUPPLIER_BY_ID(id), {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (result.success) await cacheData('suppliers_all', null);
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(DATA_ENDPOINTS.SUPPLIER_BY_ID(id), {
      method: 'DELETE'
    });
    if (result.success) await cacheData('suppliers_all', null);
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

    if (cached && cached.length > 0) {
      this._syncFromServer(filters, cacheKey);
      return cached;
    }

    const url = buildUrl(DATA_ENDPOINTS.INVOICES, filters);
    const result = await request(url);

    if (result.success) {
      await cacheData(cacheKey, result.data);
      await cacheData('invoices_all', result.data);
      return result.data;
    }

    const fallback = await getCachedData('invoices_all', 86400);
    return fallback || [];
  },

  async _syncFromServer(filters, cacheKey) {
    try {
      const url = buildUrl(DATA_ENDPOINTS.INVOICES, filters);
      const result = await request(url);
      if (result.success) await cacheData(cacheKey, result.data);
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    const result = await request(DATA_ENDPOINTS.INVOICE_BY_ID(id));
    return result.success ? result.data : null;
  },

  async getItems(invoiceId) {
    const result = await request(DATA_ENDPOINTS.INVOICE_ITEMS(invoiceId));
    return result.success ? result.data : [];
  },

  /**
   * إنشاء فاتورة جديدة - هيكل JSON متوافق مع الـ Backend
   * @param {object} data - { customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes, items: [...] }
   */
  async create(data) {
    // التأكد من أن الـ items مصفوفة صالحة
    const invoiceData = {
      customer_id: data.customer_id || null,
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
        name: item.name,
        qty: Number(item.qty) || 0,
        unit_price: Number(item.unit_price) || 0,
        discount: Number(item.discount) || 0,
        total: Number(item.total) || 0
      }))
    };

    const result = await request(DATA_ENDPOINTS.INVOICES, {
      method: 'POST',
      body: JSON.stringify(invoiceData)
    });

    if (result.success) await cacheData('invoices_all', null);
    return result.success ? result.data : null;
  },

  async updateStatus(id, status) {
    const result = await request(DATA_ENDPOINTS.INVOICE_BY_ID(id), {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    if (result.success) await cacheData('invoices_all', null);
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(DATA_ENDPOINTS.INVOICE_BY_ID(id), {
      method: 'DELETE'
    });
    if (result.success) await cacheData('invoices_all', null);
    return result.success;
  },

  async getStats() {
    const all = await this.getAll();
    const totalRevenue = all.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
    return {
      total_revenue: totalRevenue,
      total_count: all.length
    };
  },

  async getTodayStats() {
    const today = new Date().toISOString().slice(0, 10);
    const all = await this.getAll();
    const todayInvoices = all.filter(inv => inv.created_at?.startsWith(today) && inv.status !== 'cancelled');
    const todaySales = todayInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
    return {
      today_sales: todaySales,
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

    if (cached && cached.length > 0) {
      this._syncFromServer(filters, cacheKey);
      return cached;
    }

    const url = buildUrl(DATA_ENDPOINTS.PURCHASES, filters);
    const result = await request(url);

    if (result.success) {
      await cacheData(cacheKey, result.data);
      return result.data;
    }

    return [];
  },

  async _syncFromServer(filters, cacheKey) {
    try {
      const url = buildUrl(DATA_ENDPOINTS.PURCHASES, filters);
      const result = await request(url);
      if (result.success) await cacheData(cacheKey, result.data);
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    const result = await request(DATA_ENDPOINTS.PURCHASE_BY_ID(id));
    return result.success ? result.data : null;
  },

  async getItems(purchaseId) {
    const result = await request(DATA_ENDPOINTS.PURCHASE_ITEMS(purchaseId));
    return result.success ? result.data : [];
  },

  /**
   * إنشاء طلب شراء - هيكل JSON متوافق
   */
  async create(data) {
    const purchaseData = {
      supplier_id: data.supplier_id || null,
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
        name: item.name,
        qty: Number(item.qty) || 0,
        unit_cost: Number(item.unit_cost) || 0,
        total: Number(item.total) || 0
      }))
    };

    const result = await request(DATA_ENDPOINTS.PURCHASES, {
      method: 'POST',
      body: JSON.stringify(purchaseData)
    });

    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(DATA_ENDPOINTS.PURCHASE_BY_ID(id), {
      method: 'DELETE'
    });
    return result.success;
  },

  async getTotalAmount() {
    const all = await this.getAll();
    return all.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
  }
};

// ============================================
// Expenses API - واجهة المصروفات
// ============================================
export const expenses = {
  async getAll(filters = {}) {
    const cacheKey = `expenses_${JSON.stringify(filters)}`;
    const cached = await getCachedData(cacheKey);

    if (cached && cached.length > 0) {
      this._syncFromServer(filters, cacheKey);
      return cached;
    }

    const url = buildUrl(DATA_ENDPOINTS.EXPENSES, filters);
    const result = await request(url);

    if (result.success) {
      await cacheData(cacheKey, result.data);
      return result.data;
    }

    return [];
  },

  async _syncFromServer(filters, cacheKey) {
    try {
      const url = buildUrl(DATA_ENDPOINTS.EXPENSES, filters);
      const result = await request(url);
      if (result.success) await cacheData(cacheKey, result.data);
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    const result = await request(DATA_ENDPOINTS.EXPENSE_BY_ID(id));
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request(DATA_ENDPOINTS.EXPENSES, {
      method: 'POST',
      body: JSON.stringify({
        category_id: data.category_id || null,
        description: data.description,
        amount: Number(data.amount) || 0,
        paid_by: data.paid_by || null,
        receipt_url: data.receipt_url || null,
        expense_date: data.expense_date || null
      })
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(DATA_ENDPOINTS.EXPENSE_BY_ID(id), {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(DATA_ENDPOINTS.EXPENSE_BY_ID(id), {
      method: 'DELETE'
    });
    return result.success;
  },

  async getTotalAmount() {
    const all = await this.getAll();
    return all.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  },

  async getCategories() {
    const cached = await getCachedData('expense_categories');
    if (cached) return cached;

    const result = await request(DATA_ENDPOINTS.EXPENSE_CATEGORIES);
    if (result.success) {
      await cacheData('expense_categories', result.data);
    }
    return result.success ? result.data : [];
  }
};

// ============================================
// WhatsApp Queue API
// ============================================
export const whatsapp = {
  async queueMessage(recipient, message, template = null, params = null) {
    const result = await request(DATA_ENDPOINTS.WHATSAPP_QUEUE, {
      method: 'POST',
      body: JSON.stringify({
        recipient,
        message,
        template_name: template,
        template_params: params
      })
    });
    return result.success ? result.data : null;
  },

  async getPending() {
    const result = await request(DATA_ENDPOINTS.WHATSAPP_PENDING);
    return result.success ? result.data : [];
  },

  async markSent(id) {
    const result = await request(DATA_ENDPOINTS.WHATSAPP_BY_ID(id), {
      method: 'PUT',
      body: JSON.stringify({ status: 'sent' })
    });
    return result.success;
  },

  async markFailed(id, errorMessage) {
    const result = await request(DATA_ENDPOINTS.WHATSAPP_BY_ID(id), {
      method: 'PUT',
      body: JSON.stringify({ status: 'failed', error_message: errorMessage })
    });
    return result.success;
  },

  async getQueue(filters = {}) {
    const url = buildUrl(DATA_ENDPOINTS.WHATSAPP_QUEUE, filters);
    const result = await request(url);
    return result.success ? result.data : [];
  }
};

// ============================================
// Audit Log API
// ============================================
export const audit = {
  async log(table, recordId, action, oldValues = null, newValues = null) {
    await request(DATA_ENDPOINTS.AUDIT_LOG, {
      method: 'POST',
      body: JSON.stringify({
        table_name: table,
        record_id: recordId,
        action,
        old_values: oldValues,
        new_values: newValues
      })
    });
  },

  async getLogs(filters = {}) {
    const url = buildUrl(DATA_ENDPOINTS.AUDIT_LOG, filters);
    const result = await request(url);
    return result.success ? result.data : [];
  }
};

// ============================================
// Dashboard Stats API
// ============================================
export const dashboard = {
  async getStats() {
    const cached = await getCachedData('dashboard_stats', 300); // 5 دقائق
    if (cached) return cached;

    const result = await request(ACTION_ENDPOINTS.DASHBOARD);

    if (result.success && result.data?.stats) {
      await cacheData('dashboard_stats', result.data.stats);
      return result.data.stats;
    }

    return {
      todaySales: 0,
      todayCount: 0,
      totalRevenue: 0,
      netProfit: 0,
      productCount: 0,
      totalExpenses: 0
    };
  },

  async getRecentInvoices(limit = 5) {
    const result = await request(ACTION_ENDPOINTS.DASHBOARD);

    if (result.success && result.data?.recentInvoices) {
      return result.data.recentInvoices.slice(0, limit);
    }

    return [];
  }
};

// ============================================
// Database Initialization
// ============================================
export async function initializeDatabase() {
  return request(ACTION_ENDPOINTS.INIT_DB);
}

// ============================================
// Sync Support
// ============================================
export const sync = {
  async getPending() {
    const result = await request(ACTION_ENDPOINTS.SYNC_PENDING);
    return result.success ? result.data : [];
  },

  async markSynced(id) {
    await request(`/data?table=sync_queue&id=${id}`, {
      method: 'PUT'
    });
  },

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
// Utility Functions
// ============================================

/**
 * التحقق من كون المنصة موبايل
 */
export function isNativePlatform() {
  return isNative;
}

/**
 * مسح جميع البيانات المحلية
 */
export async function clearAllData() {
  await clearAllStorage();
  await clearCache();
}

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
  audit,
  dashboard,
  sync,
  initializeDatabase,
  processOfflineQueue,
  isNativePlatform,
  clearAllData,
  STORAGE_KEYS
};
