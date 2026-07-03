/**
 * Neon Database Service
 * Centralized service for all database operations via API
 * Supports offline persistence for Android WebView compatibility
 */

// API Base URL
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Local Storage Keys
const STORAGE_KEYS = {
  USER: 'nawh_user',
  TOKEN: 'nawh_token',
  OFFLINE_QUEUE: 'nawh_offline_queue',
  CACHE: 'nawh_cache'
};

// ============================================
// Response Helper - Unified JSON Payload
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
async function request(endpoint, options = {}) {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    }
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const result = await response.json();

    if (!response.ok) {
      return createResponse(false, null, result.error || 'HTTP_ERROR', result.message || 'حدث خطأ في الاتصال');
    }

    return createResponse(true, result.data, null, result.message);
  } catch (err) {
    // Network error - queue for offline sync
    if (!navigator.onLine && options.method !== 'GET') {
      await queueOfflineOperation(endpoint, options);
      return createResponse(false, null, 'OFFLINE', 'تم حفظ العمل للتنفيذ لاحقاً');
    }

    console.error('API Error:', err);
    return createResponse(false, null, 'NETWORK_ERROR', 'خطأ في الاتصال بالخادم');
  }
}

// ============================================
// Offline Support - Local Persistence
// ============================================
async function queueOfflineOperation(endpoint, options) {
  const queue = JSON.parse(localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE) || '[]');
  queue.push({
    endpoint,
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
      const response = await fetch(`${API_BASE}${item.endpoint}`, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem(STORAGE_KEYS.TOKEN)}`
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
// Authentication API
// ============================================
export const auth = {
  async register({ email, password, full_name }) {
    const result = await request('/auth?action=register', {
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
    const result = await request('/auth?action=login', {
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
    const result = await request('/auth?action=me');

    if (result.success) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(result.data));
    }

    return result;
  },

  async updateProfile(data) {
    return request('/auth?action=profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async changePassword(current_password, new_password) {
    return request('/auth?action=password', {
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
// Products API
// ============================================
export const products = {
  async getAll(filters = {}) {
    const params = new URLSearchParams();
    params.set('table', 'products');

    if (filters.category) params.set('category', filters.category);
    if (filters.search) params.set('search', filters.search);
    if (filters.is_active !== undefined) params.set('is_active', filters.is_active);
    if (filters.barcode) params.set('barcode', filters.barcode);

    const result = await request(`/data?${params.toString()}`);

    // Cache for offline access
    if (result.success) {
      cacheData('products', result.data);
    }

    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`/data?table=products&id=${id}`);
    return result.success ? result.data : null;
  },

  async getByBarcode(barcode) {
    const result = await request(`/data?table=products&barcode=${barcode}`);
    return result.success ? result.data?.[0] || null : null;
  },

  async create(data) {
    const result = await request('/data?table=products', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(`/data?table=products&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`/data?table=products&id=${id}`, {
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
    const params = new URLSearchParams();
    params.set('table', 'customers');
    if (search) params.set('search', search);

    const result = await request(`/data?${params.toString()}`);

    if (result.success) {
      cacheData('customers', result.data);
    }

    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`/data?table=customers&id=${id}`);
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request('/data?table=customers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(`/data?table=customers&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`/data?table=customers&id=${id}`, {
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
    const params = new URLSearchParams();
    params.set('table', 'suppliers');
    if (search) params.set('search', search);

    const result = await request(`/data?${params.toString()}`);

    if (result.success) {
      cacheData('suppliers', result.data);
    }

    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`/data?table=suppliers&id=${id}`);
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request('/data?table=suppliers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(`/data?table=suppliers&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`/data?table=suppliers&id=${id}`, {
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
    const params = new URLSearchParams();
    params.set('table', 'invoices');

    if (filters.status) params.set('status', filters.status);

    const result = await request(`/data?${params.toString()}`);
    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`/data?table=invoices&id=${id}`);
    return result.success ? result.data : null;
  },

  async getItems(invoiceId) {
    const result = await request(`/data?table=invoice_items&invoice_id=${invoiceId}`);
    return result.success ? result.data : [];
  },

  async create(data) {
    const result = await request('/data?table=invoices', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async updateStatus(id, status) {
    const result = await request(`/data?table=invoices&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`/data?table=invoices&id=${id}`, {
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
    const params = new URLSearchParams();
    params.set('table', 'purchases');

    if (filters.status) params.set('status', filters.status);

    const result = await request(`/data?${params.toString()}`);
    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`/data?table=purchases&id=${id}`);
    return result.success ? result.data : null;
  },

  async getItems(purchaseId) {
    const result = await request(`/data?table=purchase_items&purchase_id=${purchaseId}`);
    return result.success ? result.data : [];
  },

  async create(data) {
    const result = await request('/data?table=purchases', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`/data?table=purchases&id=${id}`, {
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
    const params = new URLSearchParams();
    params.set('table', 'expenses');

    const result = await request(`/data?${params.toString()}`);
    return result.success ? result.data : [];
  },

  async getById(id) {
    const result = await request(`/data?table=expenses&id=${id}`);
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request('/data?table=expenses', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(`/data?table=expenses&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`/data?table=expenses&id=${id}`, {
      method: 'DELETE'
    });
    return result.success;
  },

  async getTotalAmount() {
    const all = await this.getAll();
    return all.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  },

  async getCategories() {
    const result = await request('/data?table=expense_categories');
    return result.success ? result.data : [];
  }
};

// ============================================
// WhatsApp Queue API
// ============================================
export const whatsapp = {
  async queueMessage(recipient, message, template = null, params = null) {
    const result = await request('/data?table=whatsapp_queue', {
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
    const result = await request('/data?table=whatsapp_queue&status=pending');
    return result.success ? result.data : [];
  },

  async markSent(id) {
    const result = await request(`/data?table=whatsapp_queue&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'sent' })
    });
    return result.success;
  },

  async markFailed(id, errorMessage) {
    const result = await request(`/data?table=whatsapp_queue&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'failed', error_message: errorMessage })
    });
    return result.success;
  },

  async getQueue(filters = {}) {
    const params = new URLSearchParams();
    params.set('table', 'whatsapp_queue');

    if (filters.status) params.set('status', filters.status);
    if (filters.limit) params.set('limit', filters.limit);

    const result = await request(`/data?${params.toString()}`);
    return result.success ? result.data : [];
  }
};

// ============================================
// Audit Log API
// ============================================
export const audit = {
  async log(table, recordId, action, oldValues = null, newValues = null) {
    await request('/data?table=audit_log', {
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
    const params = new URLSearchParams();
    params.set('table', 'audit_log');

    if (filters.table) params.set('table_name', filters.table);
    if (filters.limit) params.set('limit', filters.limit);

    const result = await request(`/data?${params.toString()}`);
    return result.success ? result.data : [];
  }
};

// ============================================
// Dashboard Stats API
// ============================================
export const dashboard = {
  async getStats() {
    const result = await request('/data?action=dashboard');

    if (result.success) {
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
    const result = await request('/data?action=dashboard');

    if (result.success) {
      return result.data.recentInvoices.slice(0, limit);
    }

    return [];
  }
};

// ============================================
// Database Initialization
// ============================================
export async function initializeDatabase() {
  return request('/data?action=init-db');
}

// ============================================
// Sync Support (for mobile WebView)
// ============================================
export const sync = {
  async getPending() {
    const result = await request('/data?table=sync_queue&pending=true');
    return result.success ? result.data : [];
  },

  async markSynced(id) {
    await request(`/data?table=sync_queue&id=${id}`, {
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
