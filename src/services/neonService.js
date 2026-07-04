/**
 * Neon Database Service
 * Centralized service for all database operations via API
 * Supports offline persistence with Capacitor Preferences & SQLite
 */

// API Base URL - لا يتم تغيير الروابط
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Storage Keys
const STORAGE_KEYS = {
  USER: 'nawh_user',
  TOKEN: 'nawh_token',
  OFFLINE_QUEUE: 'nawh_offline_queue',
  CACHE: 'nawh_cache',
  SCHEMA: 'nawh_schema',
  SESSION: 'nawh_session'
};

// Capacitor Plugins (will be undefined in web, available in native)
let Preferences = null;
let CapacitorSQLite = null;
let sqliteConnection = null;
let isNative = false;

// Initialize Capacitor plugins
async function initCapacitor() {
  try {
    // Dynamic import for Capacitor
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
      isNative = true;

      // Import Preferences
      const preferencesModule = await import('@capacitor/preferences');
      Preferences = preferencesModule.Preferences;

      // Import SQLite
      const sqliteModule = await import('@capacitor-community/sqlite');
      CapacitorSQLite = sqliteModule.CapacitorSQLite;

      // Initialize SQLite connection
      const ret = await CapacitorSQLite.echoValue({ value: 'test' });
      console.log('SQLite available:', ret);

      // Open database
      await CapacitorSQLite.open({ database: 'nawh_pos.db' });

      // Create local tables
      await createLocalTables();
    }
  } catch (err) {
    console.log('Capacitor not available, using localStorage fallback:', err.message);
    isNative = false;
  }
}

// Create local SQLite tables for offline storage
async function createLocalTables() {
  if (!CapacitorSQLite) return;

  const createTablesSQL = `
    CREATE TABLE IF NOT EXISTS local_products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      barcode TEXT,
      category TEXT,
      unit TEXT DEFAULT 'قطعة',
      cost_price REAL DEFAULT 0,
      sell_price REAL DEFAULT 0,
      stock_qty REAL DEFAULT 0,
      min_stock_qty REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      image_url TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT,
      sync_status TEXT DEFAULT 'synced'
    );

    CREATE TABLE IF NOT EXISTS local_customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      tax_id TEXT,
      credit_limit REAL DEFAULT 0,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT,
      sync_status TEXT DEFAULT 'synced'
    );

    CREATE TABLE IF NOT EXISTS local_suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      tax_id TEXT,
      credit_limit REAL DEFAULT 0,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT,
      sync_status TEXT DEFAULT 'synced'
    );

    CREATE TABLE IF NOT EXISTS local_invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL,
      customer_id TEXT,
      status TEXT DEFAULT 'paid',
      subtotal REAL DEFAULT 0,
      discount_amt REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      tax_amt REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      notes TEXT,
      created_at TEXT,
      customer_name TEXT,
      sync_status TEXT DEFAULT 'synced'
    );

    CREATE TABLE IF NOT EXISTS local_invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      product_id TEXT,
      name TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      discount REAL DEFAULT 0,
      total REAL NOT NULL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS local_purchases (
      id TEXT PRIMARY KEY,
      purchase_number TEXT NOT NULL,
      supplier_id TEXT,
      status TEXT DEFAULT 'received',
      subtotal REAL DEFAULT 0,
      discount_amt REAL DEFAULT 0,
      tax_amt REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      notes TEXT,
      created_at TEXT,
      supplier_name TEXT,
      sync_status TEXT DEFAULT 'synced'
    );

    CREATE TABLE IF NOT EXISTS local_expenses (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_by TEXT,
      receipt_url TEXT,
      expense_date TEXT,
      created_at TEXT,
      category_name TEXT,
      sync_status TEXT DEFAULT 'synced'
    );

    CREATE TABLE IF NOT EXISTS local_expense_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT
    );
  `;

  try {
    await CapacitorSQLite.execute({ statements: createTablesSQL });
  } catch (err) {
    console.error('Error creating local tables:', err);
  }
}

// Initialize on module load
initCapacitor();

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
// Storage Helpers (Capacitor Preferences + localStorage fallback)
// ============================================
async function saveToStorage(key, value) {
  try {
    if (isNative && Preferences) {
      await Preferences.set({ key, value: JSON.stringify(value) });
    }
    // Always save to localStorage as backup
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Storage save error:', err);
    localStorage.setItem(key, JSON.stringify(value));
  }
}

async function getFromStorage(key) {
  try {
    if (isNative && Preferences) {
      const { value } = await Preferences.get({ key });
      return value ? JSON.parse(value) : null;
    }
    const localValue = localStorage.getItem(key);
    return localValue ? JSON.parse(localValue) : null;
  } catch (err) {
    const localValue = localStorage.getItem(key);
    return localValue ? JSON.parse(localValue) : null;
  }
}

async function removeFromStorage(key) {
  try {
    if (isNative && Preferences) {
      await Preferences.remove({ key });
    }
    localStorage.removeItem(key);
  } catch (err) {
    localStorage.removeItem(key);
  }
}

// ============================================
// SQLite Helpers for Local Data
// ============================================
async function queryLocalDB(sql, values = []) {
  if (!isNative || !CapacitorSQLite) return [];

  try {
    const result = await CapacitorSQLite.query({ database: 'nawh_pos.db', statement: sql, values });
    return result.values || [];
  } catch (err) {
    console.error('SQLite query error:', err);
    return [];
  }
}

async function runLocalDB(sql, values = []) {
  if (!isNative || !CapacitorSQLite) return false;

  try {
    await CapacitorSQLite.run({ database: 'nawh_pos.db', statement: sql, values });
    return true;
  } catch (err) {
    console.error('SQLite run error:', err);
    return false;
  }
}

// ============================================
// Token Management
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
// HTTP Request Helper
// ============================================
async function request(endpoint, options = {}) {
  const token = await getToken();

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
    // Network error - try to use local data for GET requests
    if (options.method === undefined || options.method === 'GET') {
      return createResponse(false, null, 'NETWORK_ERROR', 'خطأ في الاتصال - جاري استخدام البيانات المحلية');
    }

    // Queue non-GET operations for later sync
    if (!navigator.onLine && options.method !== 'GET') {
      await queueOfflineOperation(endpoint, options);
      return createResponse(false, null, 'OFFLINE', 'تم حفظ العمل للتنفيذ لاحقاً');
    }

    console.error('API Error:', err);
    return createResponse(false, null, 'NETWORK_ERROR', 'خطأ في الاتصال بالخادم');
  }
}

// ============================================
// Offline Queue Management
// ============================================
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

export async function processOfflineQueue() {
  if (!navigator.onLine) return;

  const queue = await getFromStorage(STORAGE_KEYS.OFFLINE_QUEUE) || [];
  if (queue.length === 0) return;

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

  await saveToStorage(STORAGE_KEYS.OFFLINE_QUEUE, failed);
  return { processed: queue.length - failed.length, failed: failed.length };
}

// ============================================
// Cache Management
// ============================================
async function cacheData(key, data) {
  // Save to localStorage cache
  const cache = await getFromStorage(STORAGE_KEYS.CACHE) || {};
  cache[key] = { data, timestamp: Date.now() };
  await saveToStorage(STORAGE_KEYS.CACHE, cache);
}

async function getCachedData(key) {
  const cache = await getFromStorage(STORAGE_KEYS.CACHE) || {};
  const item = cache[key];

  if (!item) return null;

  // Cache expires after 30 minutes
  if (Date.now() - item.timestamp > 30 * 60 * 1000) return null;

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
      await setToken(result.data.token);
      await saveToStorage(STORAGE_KEYS.USER, result.data.user);
    }

    return result;
  },

  async login({ email, password }) {
    const result = await request('/auth?action=login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (result.success && result.data?.token) {
      await setToken(result.data.token);
      await saveToStorage(STORAGE_KEYS.USER, result.data.user);
    }

    return result;
  },

  async logout() {
    await clearToken();
    await removeFromStorage(STORAGE_KEYS.USER);
    return createResponse(true, null, null, 'تم تسجيل الخروج');
  },

  async getCurrentUser() {
    const result = await request('/auth?action=me');

    if (result.success) {
      await saveToStorage(STORAGE_KEYS.USER, result.data);
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

  async getToken() {
    return getToken();
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
// Products API - Local First with Sync
// ============================================
export const products = {
  async getAll(filters = {}) {
    // 1. First try to get from local SQLite cache
    let localData = [];
    if (isNative && CapacitorSQLite) {
      try {
        let sql = 'SELECT * FROM local_products WHERE is_active = 1';
        const values = [];

        if (filters.search) {
          sql += ' AND (name LIKE ? OR barcode LIKE ?)';
          values.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        sql += ' ORDER BY created_at DESC';
        localData = await queryLocalDB(sql, values);

        // If we have local data, return it immediately
        if (localData.length > 0) {
          // Trigger background sync without blocking
          this.syncFromServer(filters);
          return localData.map(row => ({
            ...row,
            is_active: row.is_active === 1
          }));
        }
      } catch (err) {
        console.error('Local DB read error:', err);
      }
    }

    // 2. Try localStorage cache
    const cachedProducts = await getCachedData('products');
    if (cachedProducts && cachedProducts.length > 0) {
      // Trigger background sync
      this.syncFromServer(filters);
      return cachedProducts;
    }

    // 3. Fetch from server
    const params = new URLSearchParams();
    params.set('table', 'products');

    if (filters.category) params.set('category', filters.category);
    if (filters.search) params.set('search', filters.search);
    if (filters.is_active !== undefined) params.set('is_active', filters.is_active);
    if (filters.barcode) params.set('barcode', filters.barcode);

    const result = await request(`/data?${params.toString()}`);

    if (result.success) {
      // Cache for offline access
      await cacheData('products', result.data);

      // Save to SQLite
      await this.saveToLocalDB(result.data);

      return result.data;
    }

    return localData.length > 0 ? localData : [];
  },

  async saveToLocalDB(data) {
    if (!isNative || !CapacitorSQLite || !Array.isArray(data)) return;

    for (const product of data) {
      const sql = `
        INSERT OR REPLACE INTO local_products
        (id, name, barcode, category, unit, cost_price, sell_price, stock_qty, min_stock_qty, is_active, image_url, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await runLocalDB(sql, [
        product.id,
        product.name,
        product.barcode || null,
        product.category || null,
        product.unit || 'قطعة',
        product.cost_price || 0,
        product.sell_price || 0,
        product.stock_qty || 0,
        product.min_stock_qty || 0,
        product.is_active ? 1 : 0,
        product.image_url || null,
        product.notes || null,
        product.created_at || new Date().toISOString(),
        product.updated_at || new Date().toISOString()
      ]);
    }
  },

  async syncFromServer(filters = {}) {
    try {
      const params = new URLSearchParams();
      params.set('table', 'products');
      if (filters.is_active !== undefined) params.set('is_active', filters.is_active);

      const result = await request(`/data?${params.toString()}`);

      if (result.success) {
        await cacheData('products', result.data);
        await this.saveToLocalDB(result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    // Try local first
    if (isNative && CapacitorSQLite) {
      const localData = await queryLocalDB('SELECT * FROM local_products WHERE id = ?', [id]);
      if (localData.length > 0) {
        return { ...localData[0], is_active: localData[0].is_active === 1 };
      }
    }

    const result = await request(`/data?table=products&id=${id}`);
    return result.success ? result.data : null;
  },

  async getByBarcode(barcode) {
    // Try local first
    if (isNative && CapacitorSQLite) {
      const localData = await queryLocalDB('SELECT * FROM local_products WHERE barcode = ?', [barcode]);
      if (localData.length > 0) {
        return { ...localData[0], is_active: localData[0].is_active === 1 };
      }
    }

    const result = await request(`/data?table=products&barcode=${barcode}`);
    return result.success ? result.data?.[0] || null : null;
  },

  async create(data) {
    const result = await request('/data?table=products', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (result.success && result.data) {
      // Save to local DB
      if (isNative && CapacitorSQLite) {
        await this.saveToLocalDB([result.data]);
      }
      return result.data;
    }
    return null;
  },

  async update(id, data) {
    const result = await request(`/data?table=products&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });

    if (result.success && result.data) {
      // Update local DB
      if (isNative && CapacitorSQLite) {
        await this.saveToLocalDB([result.data]);
      }
      return result.data;
    }
    return null;
  },

  async delete(id) {
    const result = await request(`/data?table=products&id=${id}`, {
      method: 'DELETE'
    });

    if (result.success) {
      // Delete from local DB
      if (isNative && CapacitorSQLite) {
        await runLocalDB('DELETE FROM local_products WHERE id = ?', [id]);
      }
    }
    return result.success;
  },

  async getCount() {
    if (isNative && CapacitorSQLite) {
      const result = await queryLocalDB('SELECT COUNT(*) as count FROM local_products WHERE is_active = 1');
      if (result.length > 0) return result[0].count;
    }
    const products = await this.getAll();
    return products.length;
  }
};

// ============================================
// Customers API - Local First
// ============================================
export const customers = {
  async getAll(search = '') {
    // Try local first
    let localData = [];
    if (isNative && CapacitorSQLite) {
      try {
        let sql = 'SELECT * FROM local_customers WHERE is_active = 1';
        const values = [];

        if (search) {
          sql += ' AND (name LIKE ? OR phone LIKE ?)';
          values.push(`%${search}%`, `%${search}%`);
        }

        sql += ' ORDER BY created_at DESC';
        localData = await queryLocalDB(sql, values);

        if (localData.length > 0) {
          // Background sync
          this.syncFromServer(search);
          return localData.map(row => ({ ...row, is_active: row.is_active === 1 }));
        }
      } catch (err) {
        console.error('Local DB read error:', err);
      }
    }

    // Try cache
    const cached = await getCachedData('customers');
    if (cached && cached.length > 0) {
      this.syncFromServer(search);
      return cached;
    }

    // Fetch from server
    const params = new URLSearchParams();
    params.set('table', 'customers');
    if (search) params.set('search', search);

    const result = await request(`/data?${params.toString()}`);

    if (result.success) {
      await cacheData('customers', result.data);
      await this.saveToLocalDB(result.data);
      return result.data;
    }

    return localData.length > 0 ? localData : [];
  },

  async saveToLocalDB(data) {
    if (!isNative || !CapacitorSQLite || !Array.isArray(data)) return;

    for (const customer of data) {
      const sql = `
        INSERT OR REPLACE INTO local_customers
        (id, name, phone, email, address, tax_id, credit_limit, notes, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await runLocalDB(sql, [
        customer.id,
        customer.name,
        customer.phone || null,
        customer.email || null,
        customer.address || null,
        customer.tax_id || null,
        customer.credit_limit || 0,
        customer.notes || null,
        customer.is_active !== false ? 1 : 0,
        customer.created_at || new Date().toISOString()
      ]);
    }
  },

  async syncFromServer(search = '') {
    try {
      const params = new URLSearchParams();
      params.set('table', 'customers');
      if (search) params.set('search', search);

      const result = await request(`/data?${params.toString()}`);
      if (result.success) {
        await cacheData('customers', result.data);
        await this.saveToLocalDB(result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    if (isNative && CapacitorSQLite) {
      const localData = await queryLocalDB('SELECT * FROM local_customers WHERE id = ?', [id]);
      if (localData.length > 0) {
        return { ...localData[0], is_active: localData[0].is_active === 1 };
      }
    }

    const result = await request(`/data?table=customers&id=${id}`);
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request('/data?table=customers', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (result.success && result.data) {
      if (isNative && CapacitorSQLite) {
        await this.saveToLocalDB([result.data]);
      }
      return result.data;
    }
    return null;
  },

  async update(id, data) {
    const result = await request(`/data?table=customers&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });

    if (result.success && result.data) {
      if (isNative && CapacitorSQLite) {
        await this.saveToLocalDB([result.data]);
      }
      return result.data;
    }
    return null;
  },

  async delete(id) {
    const result = await request(`/data?table=customers&id=${id}`, {
      method: 'DELETE'
    });

    if (result.success && isNative && CapacitorSQLite) {
      await runLocalDB('DELETE FROM local_customers WHERE id = ?', [id]);
    }
    return result.success;
  }
};

// ============================================
// Suppliers API - Local First
// ============================================
export const suppliers = {
  async getAll(search = '') {
    let localData = [];
    if (isNative && CapacitorSQLite) {
      try {
        let sql = 'SELECT * FROM local_suppliers WHERE is_active = 1';
        const values = [];

        if (search) {
          sql += ' AND (name LIKE ? OR phone LIKE ?)';
          values.push(`%${search}%`, `%${search}%`);
        }

        sql += ' ORDER BY created_at DESC';
        localData = await queryLocalDB(sql, values);

        if (localData.length > 0) {
          this.syncFromServer(search);
          return localData.map(row => ({ ...row, is_active: row.is_active === 1 }));
        }
      } catch (err) {
        console.error('Local DB read error:', err);
      }
    }

    const cached = await getCachedData('suppliers');
    if (cached && cached.length > 0) {
      this.syncFromServer(search);
      return cached;
    }

    const params = new URLSearchParams();
    params.set('table', 'suppliers');
    if (search) params.set('search', search);

    const result = await request(`/data?${params.toString()}`);

    if (result.success) {
      await cacheData('suppliers', result.data);
      await this.saveToLocalDB(result.data);
      return result.data;
    }

    return localData.length > 0 ? localData : [];
  },

  async saveToLocalDB(data) {
    if (!isNative || !CapacitorSQLite || !Array.isArray(data)) return;

    for (const supplier of data) {
      const sql = `
        INSERT OR REPLACE INTO local_suppliers
        (id, name, phone, email, address, tax_id, credit_limit, notes, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await runLocalDB(sql, [
        supplier.id,
        supplier.name,
        supplier.phone || null,
        supplier.email || null,
        supplier.address || null,
        supplier.tax_id || null,
        supplier.credit_limit || 0,
        supplier.notes || null,
        supplier.is_active !== false ? 1 : 0,
        supplier.created_at || new Date().toISOString()
      ]);
    }
  },

  async syncFromServer(search = '') {
    try {
      const params = new URLSearchParams();
      params.set('table', 'suppliers');
      if (search) params.set('search', search);

      const result = await request(`/data?${params.toString()}`);
      if (result.success) {
        await cacheData('suppliers', result.data);
        await this.saveToLocalDB(result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    if (isNative && CapacitorSQLite) {
      const localData = await queryLocalDB('SELECT * FROM local_suppliers WHERE id = ?', [id]);
      if (localData.length > 0) {
        return { ...localData[0], is_active: localData[0].is_active === 1 };
      }
    }

    const result = await request(`/data?table=suppliers&id=${id}`);
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request('/data?table=suppliers', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (result.success && result.data) {
      if (isNative && CapacitorSQLite) {
        await this.saveToLocalDB([result.data]);
      }
      return result.data;
    }
    return null;
  },

  async update(id, data) {
    const result = await request(`/data?table=suppliers&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });

    if (result.success && result.data) {
      if (isNative && CapacitorSQLite) {
        await this.saveToLocalDB([result.data]);
      }
      return result.data;
    }
    return null;
  },

  async delete(id) {
    const result = await request(`/data?table=suppliers&id=${id}`, {
      method: 'DELETE'
    });

    if (result.success && isNative && CapacitorSQLite) {
      await runLocalDB('DELETE FROM local_suppliers WHERE id = ?', [id]);
    }
    return result.success;
  }
};

// ============================================
// Invoices API - Local First
// ============================================
export const invoices = {
  async getAll(filters = {}) {
    let localData = [];
    if (isNative && CapacitorSQLite) {
      try {
        let sql = 'SELECT * FROM local_invoices WHERE 1=1';
        const values = [];

        if (filters.status) {
          sql += ' AND status = ?';
          values.push(filters.status);
        }

        sql += ' ORDER BY created_at DESC';
        localData = await queryLocalDB(sql, values);

        if (localData.length > 0) {
          this.syncFromServer(filters);
          return localData;
        }
      } catch (err) {
        console.error('Local DB read error:', err);
      }
    }

    const cached = await getCachedData('invoices');
    if (cached && cached.length > 0) {
      this.syncFromServer(filters);
      return cached;
    }

    const params = new URLSearchParams();
    params.set('table', 'invoices');
    if (filters.status) params.set('status', filters.status);

    const result = await request(`/data?${params.toString()}`);

    if (result.success) {
      await cacheData('invoices', result.data);
      await this.saveToLocalDB(result.data);
      return result.data;
    }

    return localData.length > 0 ? localData : [];
  },

  async saveToLocalDB(data) {
    if (!isNative || !CapacitorSQLite || !Array.isArray(data)) return;

    for (const invoice of data) {
      const sql = `
        INSERT OR REPLACE INTO local_invoices
        (id, invoice_number, customer_id, status, subtotal, discount_amt, tax_rate, tax_amt, total_amount, paid_amount, payment_method, notes, created_at, customer_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await runLocalDB(sql, [
        invoice.id,
        invoice.invoice_number,
        invoice.customer_id || null,
        invoice.status || 'paid',
        invoice.subtotal || 0,
        invoice.discount_amt || 0,
        invoice.tax_rate || 0,
        invoice.tax_amt || 0,
        invoice.total_amount || 0,
        invoice.paid_amount || 0,
        invoice.payment_method || 'cash',
        invoice.notes || null,
        invoice.created_at || new Date().toISOString(),
        invoice.customer_name || null
      ]);
    }
  },

  async syncFromServer(filters = {}) {
    try {
      const params = new URLSearchParams();
      params.set('table', 'invoices');
      if (filters.status) params.set('status', filters.status);

      const result = await request(`/data?${params.toString()}`);
      if (result.success) {
        await cacheData('invoices', result.data);
        await this.saveToLocalDB(result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    if (isNative && CapacitorSQLite) {
      const localData = await queryLocalDB('SELECT * FROM local_invoices WHERE id = ?', [id]);
      if (localData.length > 0) return localData[0];
    }

    const result = await request(`/data?table=invoices&id=${id}`);
    return result.success ? result.data : null;
  },

  async getItems(invoiceId) {
    if (isNative && CapacitorSQLite) {
      const localData = await queryLocalDB('SELECT * FROM local_invoice_items WHERE invoice_id = ? ORDER BY created_at', [invoiceId]);
      if (localData.length > 0) return localData;
    }

    const result = await request(`/data?table=invoice_items&invoice_id=${invoiceId}`);
    return result.success ? result.data : [];
  },

  async create(data) {
    const result = await request('/data?table=invoices', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (result.success && result.data) {
      if (isNative && CapacitorSQLite) {
        await this.saveToLocalDB([result.data]);

        // Save invoice items
        if (data.items && data.items.length > 0) {
          for (const item of data.items) {
            const sql = `
              INSERT INTO local_invoice_items
              (id, invoice_id, product_id, name, qty, unit_price, discount, total, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await runLocalDB(sql, [
              crypto.randomUUID(),
              result.data.id,
              item.product_id || null,
              item.name,
              item.qty,
              item.unit_price,
              item.discount || 0,
              item.total,
              new Date().toISOString()
            ]);
          }
        }
      }
      return result.data;
    }
    return null;
  },

  async updateStatus(id, status) {
    const result = await request(`/data?table=invoices&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });

    if (result.success && isNative && CapacitorSQLite) {
      await runLocalDB('UPDATE local_invoices SET status = ? WHERE id = ?', [status, id]);
    }
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`/data?table=invoices&id=${id}`, {
      method: 'DELETE'
    });

    if (result.success && isNative && CapacitorSQLite) {
      await runLocalDB('DELETE FROM local_invoices WHERE id = ?', [id]);
      await runLocalDB('DELETE FROM local_invoice_items WHERE invoice_id = ?', [id]);
    }
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
// Purchases API - Local First
// ============================================
export const purchases = {
  async getAll(filters = {}) {
    let localData = [];
    if (isNative && CapacitorSQLite) {
      try {
        let sql = 'SELECT * FROM local_purchases WHERE 1=1';
        const values = [];

        if (filters.status) {
          sql += ' AND status = ?';
          values.push(filters.status);
        }

        sql += ' ORDER BY created_at DESC';
        localData = await queryLocalDB(sql, values);

        if (localData.length > 0) {
          this.syncFromServer(filters);
          return localData;
        }
      } catch (err) {
        console.error('Local DB read error:', err);
      }
    }

    const params = new URLSearchParams();
    params.set('table', 'purchases');
    if (filters.status) params.set('status', filters.status);

    const result = await request(`/data?${params.toString()}`);

    if (result.success) {
      await cacheData('purchases', result.data);
      await this.saveToLocalDB(result.data);
      return result.data;
    }

    return localData.length > 0 ? localData : [];
  },

  async saveToLocalDB(data) {
    if (!isNative || !CapacitorSQLite || !Array.isArray(data)) return;

    for (const purchase of data) {
      const sql = `
        INSERT OR REPLACE INTO local_purchases
        (id, purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes, created_at, supplier_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await runLocalDB(sql, [
        purchase.id,
        purchase.purchase_number,
        purchase.supplier_id || null,
        purchase.status || 'received',
        purchase.subtotal || 0,
        purchase.discount_amt || 0,
        purchase.tax_amt || 0,
        purchase.total_amount || 0,
        purchase.paid_amount || 0,
        purchase.payment_method || 'cash',
        purchase.notes || null,
        purchase.created_at || new Date().toISOString(),
        purchase.supplier_name || null
      ]);
    }
  },

  async syncFromServer(filters = {}) {
    try {
      const params = new URLSearchParams();
      params.set('table', 'purchases');
      if (filters.status) params.set('status', filters.status);

      const result = await request(`/data?${params.toString()}`);
      if (result.success) {
        await cacheData('purchases', result.data);
        await this.saveToLocalDB(result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    if (isNative && CapacitorSQLite) {
      const localData = await queryLocalDB('SELECT * FROM local_purchases WHERE id = ?', [id]);
      if (localData.length > 0) return localData[0];
    }

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

    if (result.success && result.data && isNative && CapacitorSQLite) {
      await this.saveToLocalDB([result.data]);
    }
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`/data?table=purchases&id=${id}`, {
      method: 'DELETE'
    });

    if (result.success && isNative && CapacitorSQLite) {
      await runLocalDB('DELETE FROM local_purchases WHERE id = ?', [id]);
    }
    return result.success;
  },

  async getTotalAmount() {
    const all = await this.getAll();
    return all.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
  }
};

// ============================================
// Expenses API - Local First
// ============================================
export const expenses = {
  async getAll(filters = {}) {
    let localData = [];
    if (isNative && CapacitorSQLite) {
      try {
        const sql = 'SELECT * FROM local_expenses ORDER BY expense_date DESC';
        localData = await queryLocalDB(sql);

        if (localData.length > 0) {
          this.syncFromServer();
          return localData;
        }
      } catch (err) {
        console.error('Local DB read error:', err);
      }
    }

    const cached = await getCachedData('expenses');
    if (cached && cached.length > 0) {
      this.syncFromServer();
      return cached;
    }

    const params = new URLSearchParams();
    params.set('table', 'expenses');

    const result = await request(`/data?${params.toString()}`);

    if (result.success) {
      await cacheData('expenses', result.data);
      await this.saveToLocalDB(result.data);
      return result.data;
    }

    return localData.length > 0 ? localData : [];
  },

  async saveToLocalDB(data) {
    if (!isNative || !CapacitorSQLite || !Array.isArray(data)) return;

    for (const expense of data) {
      const sql = `
        INSERT OR REPLACE INTO local_expenses
        (id, category_id, description, amount, paid_by, receipt_url, expense_date, created_at, category_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await runLocalDB(sql, [
        expense.id,
        expense.category_id || null,
        expense.description,
        expense.amount,
        expense.paid_by || null,
        expense.receipt_url || null,
        expense.expense_date || null,
        expense.created_at || new Date().toISOString(),
        expense.category_name || null
      ]);
    }
  },

  async syncFromServer() {
    try {
      const result = await request('/data?table=expenses');
      if (result.success) {
        await cacheData('expenses', result.data);
        await this.saveToLocalDB(result.data);
      }
    } catch (err) {
      console.error('Background sync error:', err);
    }
  },

  async getById(id) {
    if (isNative && CapacitorSQLite) {
      const localData = await queryLocalDB('SELECT * FROM local_expenses WHERE id = ?', [id]);
      if (localData.length > 0) return localData[0];
    }

    const result = await request(`/data?table=expenses&id=${id}`);
    return result.success ? result.data : null;
  },

  async create(data) {
    const result = await request('/data?table=expenses', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (result.success && result.data && isNative && CapacitorSQLite) {
      await this.saveToLocalDB([result.data]);
    }
    return result.success ? result.data : null;
  },

  async update(id, data) {
    const result = await request(`/data?table=expenses&id=${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });

    if (result.success && result.data && isNative && CapacitorSQLite) {
      await this.saveToLocalDB([result.data]);
    }
    return result.success ? result.data : null;
  },

  async delete(id) {
    const result = await request(`/data?table=expenses&id=${id}`, {
      method: 'DELETE'
    });

    if (result.success && isNative && CapacitorSQLite) {
      await runLocalDB('DELETE FROM local_expenses WHERE id = ?', [id]);
    }
    return result.success;
  },

  async getTotalAmount() {
    const all = await this.getAll();
    return all.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  },

  async getCategories() {
    if (isNative && CapacitorSQLite) {
      const localData = await queryLocalDB('SELECT * FROM local_expense_categories ORDER BY name');
      if (localData.length > 0) return localData;
    }

    const result = await request('/data?table=expense_categories');

    if (result.success && isNative && CapacitorSQLite) {
      for (const cat of result.data) {
        await runLocalDB(
          'INSERT OR REPLACE INTO local_expense_categories (id, name, created_at) VALUES (?, ?, ?)',
          [cat.id, cat.name, cat.created_at]
        );
      }
    }

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
// Sync Support
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
    return getFromStorage(STORAGE_KEYS.OFFLINE_QUEUE) || [];
  },

  async clearLocalChanges() {
    await saveToStorage(STORAGE_KEYS.OFFLINE_QUEUE, []);
  }
};

// ============================================
// Export checkNative utility
// ============================================
export function isNativePlatform() {
  return isNative;
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
  isNativePlatform
};
