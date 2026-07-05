import { CapacitorHttp } from '@capacitor/core';

/**
 * Neon Database Service
 * Centralized service for all database operations via API
 * Supports offline persistence for Android WebView compatibility
 */

// Local Storage Keys
const STORAGE_KEYS = {
  USER: 'nawh_user',
  TOKEN: 'nawh_token',
  OFFLINE_QUEUE: 'nawh_offline_queue',
  CACHE: 'nawh_cache'
};

// ============================================
// Response Helper - المساعد الموحد لعمليات الـ Auth والأخطاء
// ============================================
const createResponse = (success, data = null, error = null, message = '') => ({
  success,
  data,
  error,
  message,
  timestamp: new Date().toISOString()
});

// ============================================
// HTTP Request Helper
// ============================================
async function request(fullUrl, options = {}) {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers
  };

  try {
    // استخدام CapacitorHttp بالرابط الكامل الثابت لتفادي مشاكل CORS تماماً
    const response = await CapacitorHttp.request({
      url: fullUrl,
      method: options.method || 'GET',
      headers: headers,
      data: options.body ? JSON.parse(options.body) : undefined
    });

    const result = response.data;

    if (response.status < 200 || response.status >= 300) {
      return createResponse(false, null, result?.error || 'HTTP_ERROR', result?.message || 'حدث خطأ في الاتصال');
    }

    // هنا تكمن المرونة: إذا كان الرد قادماً من الـ Auth ومغلفاً بـ success نمرره كما هو، وإلا نعتبر الرد هو الـ JSON الصافي مباشرة
    if (result && result.hasOwnProperty('success')) {
      return result;
    }

    return createResponse(true, result, null, '');
  } catch (err) {
    // Network error - queue for offline sync
    if (!navigator.onLine && options.method !== 'GET') {
      await queueOfflineOperation(fullUrl, options);
      return createResponse(false, null, 'OFFLINE', 'تم حفظ العمل للتنفيذ لاحقاً');
    }

    console.error('API Error:', err);
    return createResponse(false, null, 'NETWORK_ERROR', 'خطأ في الاتصال بالخادم');
  }
}

// ============================================
// Offline Support - Local Persistence
// ============================================
async function queueOfflineOperation(fullUrl, options) {
  const queue = JSON.parse(localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE) || '[]');
  queue.push({
    url: fullUrl,
    method: options.method,
    body: options.body,
    timestamp: Date.now()
  });
  localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
}

export async function processOfflineQueue() {
  if (!navigator.onLine) return;

  const queue = JSON.parse(localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE) || '[]');
  if (queue.length === 0) return;

  const failed = [];

  for (const item of queue) {
    try {
      const response = await CapacitorHttp.request({
        url: item.url,
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem(STORAGE_KEYS.TOKEN)}`
        },
        data: item.body ? JSON.parse(item.body) : undefined
      });

      if (response.status < 200 || response.status >= 300) {
        failed.push(item);
      }
    } catch {
      failed.push(item);
    }
  }

  localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(failed));
  return { processed: queue.length - failed.length, failed: failed.length };
}

// Cache management for offline reads
function cacheData(key, data) {
  const cache = JSON.parse(localStorage.getItem(STORAGE_KEYS.CACHE) || '{}');
  cache[key] = { data, timestamp: Date.now() };
  localStorage.setItem(STORAGE_KEYS.CACHE, JSON.stringify(cache));
}

function getCachedData(key) {
  const cache = JSON.parse(localStorage.getItem(STORAGE_KEYS.CACHE) || '{}');
  const item = cache[key];

  if (!item) return null;

  // Cache expires after 5 minutes
  if (Date.now() - item.timestamp > 5 * 60 * 1000) return null;

  return item.data;
}

// ============================================
// Authentication API (تم الإبقاء على نفس نظام نقل وحفظ البيانات بالكامل)
// ============================================
export const auth = {
  async register({ email, password, full_name }) {
    const result = await request('https://nawh.vercel.app/api/auth?action=register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name })
    });

    if (result.success && result.data?.token) {
      localStorage.setItem(STORAGE_KEYS.TOKEN, result.data.token);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(result.data.user));
    }

    return result;
  },

  async login({ email, password }) {
    const result = await request('https://nawh.vercel.app/api/auth?action=login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (result.success && result.data?.token) {
      localStorage.setItem(STORAGE_KEYS.TOKEN, result.data.token);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(result.data.user));
    }

    return result;
  },

  async logout() {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    return createResponse(true, null, null, 'تم تسجيل الخروج');
  },

  async getCurrentUser() {
    const result = await request('https://nawh.vercel.app/api/auth?action=me');

    if (result.success) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(result.data));
    }

    return result;
  },

  async updateProfile(data) {
    return request('https://nawh.vercel.app/api/auth?action=profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async changePassword(current_password, new_password) {
    return request('https://nawh.vercel.app/api/auth?action=password', {
      method: 'PUT',
      body: JSON.stringify({ current_password, new_password })
    });
  },

  getUser() {
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);
    return userStr ? JSON.parse(userStr) : null;
  },

  getToken() {
    return localStorage.getItem(STORAGE_KEYS.TOKEN);
  },

  isAuthenticated() {
    return !!localStorage.getItem(STORAGE_KEYS.TOKEN);
  },

  hasRole(requiredRole) {
    const user = this.getUser();
    if (!user) return false;

    const roleHierarchy = { admin: 3, manager: 2, user: 1 };
    const userLevel = roleHierarchy[user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return userLevel >= requiredLevel;
  }
};

// ============================================
// Products API (نظام فك وقراءة البيانات المباشر JSON)
// ============================================
export const products = {
  async getAll(filters = {}) {
    let url = 'https://nawh.vercel.app/api/data?table=products';

    if (filters.category) url += `&category=${encodeURIComponent(filters.category)}`;
    if (filters.search) url += `&search=${encodeURIComponent(filters.search)}`;
    if (filters.is_active !== undefined) url += `&is_active=${filters.is_active}`;
    if (filters.barcode) url += `&barcode=${encodeURIComponent(filters.barcode)}`;

    const result = await request(url);

    if (result.success) {
      cacheData('products', result.data);
    }

    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=products&id=${id}`);
    return result.success ? result.data : null;
  },

  async getByBarcode(barcode) {
    const result = await request(`https://nawh.vercel.app/api/data?table=products&barcode=${barcode}`);
    // تعديل للتعامل مع الكائن المباشر الراجع من السيرفر المحدث
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request('https://nawh.vercel.app/api/data?table=products', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(`https://nawh.vercel.app/api/data?table=products&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=products&id=${id}`, {
      method: 'DELETE'
    });
    return result.success;
  },

  async getCount() {
    const products = await this.getAll();
    return products.length;
  }
};

// ============================================
// Customers API
// ============================================
export const customers = {
  async getAll(search = '') {
    let url = 'https://nawh.vercel.app/api/data?table=customers';
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const result = await request(url);

    if (result.success) {
      cacheData('customers', result.data);
    }

    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=customers&id=${id}`);
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request('https://nawh.vercel.app/api/data?table=customers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(`https://nawh.vercel.app/api/data?table=customers&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=customers&id=${id}`, {
      method: 'DELETE'
    });
    return result.success;
  }
};

// ============================================
// Suppliers API
// ============================================
export const suppliers = {
  async getAll(search = '') {
    let url = 'https://nawh.vercel.app/api/data?table=suppliers';
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const result = await request(url);

    if (result.success) {
      cacheData('suppliers', result.data);
    }

    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=suppliers&id=${id}`);
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request('https://nawh.vercel.app/api/data?table=suppliers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(`https://nawh.vercel.app/api/data?table=suppliers&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=suppliers&id=${id}`, {
      method: 'DELETE'
    });
    return result.success;
  }
};

// ============================================
// Invoices API
// ============================================
export const invoices = {
  async getAll(filters = {}) {
    let url = 'https://nawh.vercel.app/api/data?table=invoices';
    if (filters.status) url += `&status=${encodeURIComponent(filters.status)}`;

    const result = await request(url);
    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=invoices&id=${id}`);
    return result.success ? result.data : null;
  },

  async getItems(invoiceId) {
    const result = await request(`https://nawh.vercel.app/api/data?table=invoice_items&invoice_id=${invoiceId}`);
    return result.success ? result.data : [];
  },

  async create(data) {
    const result = await request('https://nawh.vercel.app/api/data?table=invoices', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async updateStatus(id, status) {
    const result = await request(`https://nawh.vercel.app/api/data?table=invoices&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=invoices&id=${id}`, {
      method: 'DELETE'
    });
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
// Purchases API
// ============================================
export const purchases = {
  async getAll(filters = {}) {
    let url = 'https://nawh.vercel.app/api/data?table=purchases';
    if (filters.status) url += `&status=${encodeURIComponent(filters.status)}`;

    const result = await request(url);
    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=purchases&id=${id}`);
    return result.success ? result.data : null;
  },

  async getItems(purchaseId) {
    const result = await request(`https://nawh.vercel.app/api/data?table=purchase_items&purchase_id=${purchaseId}`);
    return result.success ? result.data : [];
  },

  async create(data) {
    const result = await request('https://nawh.vercel.app/api/data?table=purchases', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=purchases&id=${id}`, {
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
// Expenses API
// ============================================
export const expenses = {
  async getAll(filters = {}) {
    const result = await request('https://nawh.vercel.app/api/data?table=expenses');
    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=expenses&id=${id}`);
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request('https://nawh.vercel.app/api/data?table=expenses', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(`https://nawh.vercel.app/api/data?table=expenses&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=expenses&id=${id}`, {
      method: 'DELETE'
    });
    return result.success;
  },

  async getTotalAmount() {
    const all = await this.getAll();
    return all.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  },

  async getCategories() {
    const result = await request('https://nawh.vercel.app/api/data?table=expense_categories');
    return result.success ? result.data : [];
  }
};

// ============================================
// WhatsApp Queue API
// ============================================
export const whatsapp = {
  async queueMessage(recipient, message, template = null, params = null) {
    const result = await request('https://nawh.vercel.app/api/data?table=whatsapp_queue', {
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
    const result = await request('https://nawh.vercel.app/api/data?table=whatsapp_queue&status=pending');
    return result.success ? result.data : [];
  },

  async markSent(id) {
    const result = await request(`https://nawh.vercel.app/api/data?table=whatsapp_queue&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'sent' })
    });
    return result.success;
  },

  async markFailed(id, errorMessage) {
    const result = await request(`https://nawh.vercel.app/api/data?table=whatsapp_queue&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'failed', error_message: errorMessage })
    });
    return result.success;
  },

  async getQueue(filters = {}) {
    let url = 'https://nawh.vercel.app/api/data?table=whatsapp_queue';
    if (filters.status) url += `&status=${encodeURIComponent(filters.status)}`;
    if (filters.limit) url += `&limit=${filters.limit}`;

    const result = await request(url);
    return result.success ? result.data : [];
  }
};

// ============================================
// Audit Log API
// ============================================
export const audit = {
  async log(table, recordId, action, oldValues = null, newValues = null) {
    await request('https://nawh.vercel.app/api/data?table=audit_log', {
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
    let url = 'https://nawh.vercel.app/api/data?table=audit_log';
    if (filters.table) url += `&table_name=${encodeURIComponent(filters.table)}`;
    if (filters.limit) url += `&limit=${filters.limit}`;

    const result = await request(url);
    return result.success ? result.data : [];
  }
};

// ============================================
// Dashboard Stats API
// ============================================
export const dashboard = {
  async getStats() {
    const result = await request('https://nawh.vercel.app/api/data?action=dashboard');

    if (result.success && result.data?.stats) {
      return result.data.stats;
    }

    // fallback للتعامل الذكي مع الكائن المباشر الراجع
    return result.success ? result.data?.stats || result.data : {
      todaySales: 0,
      todayCount: 0,
      totalRevenue: 0,
      netProfit: 0,
      productCount: 0,
      totalExpenses: 0
    };
  },

  async getRecentInvoices(limit = 5) {
    const result = await request('https://nawh.vercel.app/api/data?action=dashboard');

    if (result.success) {
      const recent = result.data?.recentInvoices || result.data;
      return Array.isArray(recent) ? recent.slice(0, limit) : [];
    }

    return [];
  }
};

// ============================================
// Database Initialization
// ============================================
export async function initializeDatabase() {
  return request('https://nawh.vercel.app/api/data?action=init-db');
}

// ============================================
// Sync Support (for mobile WebView)
// ============================================
export const sync = {
  async getPending() {
    const result = await request('https://nawh.vercel.app/api/data?table=sync_queue&pending=true');
    return result.success ? result.data : [];
  },

  async markSynced(id) {
    await request(`https://nawh.vercel.app/api/data?table=sync_queue&id=${id}`, {
      method: 'PUT'
    });
  },

  async getLocalChanges() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE) || '[]');
  },

  async clearLocalChanges() {
    localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, '[]');
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
  audit,
  dashboard,
  sync,
  initializeDatabase,
  processOfflineQueue
};
