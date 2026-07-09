/**
 * Database Context with Sync
 * =-=-=-=-=-=-=-=-=-=-=-=-=
 * سياق قاعدة البيانات مع دعم المزامنة الثنائية
 * يدير SQLite المحلي + Neon السحابي
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { Preferences } from '@capacitor/preferences';
import { SQLITE_SCHEMA, DEFAULT_DATA } from '../lib/databaseSchema.js';
import {
  getSyncStatus,
  queueSyncOperation,
  processSyncQueue,
  fullSync,
  startAutoSync
} from '../services/syncEngine.js';

// Database configuration
const DB_NAME = 'nawh_erp_db';
const DB_VERSION = 2;

// Context Creation
const DatabaseContext = createContext(null);

// Storage keys
const STORAGE_KEYS = {
  CURRENT_SHIFT: 'nawh_current_shift',
  USER_SESSION: 'nawh_user_session',
  LAST_SYNC: 'nawh_last_sync',
  SETTINGS: 'nawh_settings'
};

/**
 * Database Provider Component
 */
export function DatabaseProvider({ children }) {
  const [isReady, setIsReady] = useState(false);
  const [db, setDb] = useState(null);
  const [error, setError] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const cleanupRef = useRef(null);

  // Initialize database on mount
  useEffect(() => {
    initializeDatabase();

    return () => {
      // Cleanup auto sync on unmount
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  /**
   * Initialize SQLite Database
   * تدفق: UI -> SQLite محلي -> Sync Engine -> Neon
   */
  const initializeDatabase = async () => {
    try {
      const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

      if (isNative) {
        const sqlite = new SQLiteConnection(CapacitorSQLite);

        const dbConnection = await sqlite.createConnection(
          DB_NAME,
          false,
          'no-encryption',
          DB_VERSION,
          false
        );

        await dbConnection.open();

        // Create tables from schema
        await dbConnection.execute(SQLITE_SCHEMA);

        // Insert default data
        await dbConnection.execute(DEFAULT_DATA);

        setDb(dbConnection);
        console.log('SQLite database initialized successfully');

        // Start auto sync
        cleanupRef.current = startAutoSync(dbConnection, 60000);
      }

      // Load sync status
      const status = await getSyncStatus();
      setSyncStatus(status);

      // Check for low stock alerts
      await checkLowStock();

      await Preferences.set({
        key: STORAGE_KEYS.LAST_SYNC,
        value: new Date().toISOString()
      });

      setIsReady(true);
    } catch (err) {
      console.error('Database initialization error:', err);
      setError(err.message);
      setIsReady(true);
    }
  };

  // ============================================
  // Core Query Functions
  // ============================================

  const query = useCallback(async (sql, params = []) => {
    if (!db) {
      console.warn('Database not initialized');
      return [];
    }

    try {
      const result = await db.query(sql, params);
      return result.values || [];
    } catch (err) {
      console.error('Query error:', err, sql);
      throw err;
    }
  }, [db]);

  const execute = useCallback(async (sql, params = []) => {
    if (!db) {
      throw new Error('Database not initialized');
    }

    try {
      const statements = sql.split(';').filter(s => s.trim());
      let lastResult = { changes: 0, lastInsertRowId: 0 };

      for (const statement of statements) {
        if (statement.trim()) {
          lastResult = await db.run(statement + ';', params);
        }
      }

      return lastResult;
    } catch (err) {
      console.error('Execute error:', err, sql);
      throw err;
    }
  }, [db]);

  // ============================================
  // Sync Functions
  // ============================================

  /**
   * تشغيل المزامنة اليدوية
   */
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) {
      return { success: false, error: 'Offline' };
    }
    return fullSync(db);
  }, [db]);

  /**
   * تحديث حالة المزامنة
   */
  const refreshSyncStatus = useCallback(async () => {
    const status = await getSyncStatus();
    setSyncStatus(status);
    return status;
  }, []);

  // ============================================
  // Stock Movements - حركات المخزون
  // ============================================

  const stockMovements = {
    /**
     * تسجيل حركة مخزون
     * @param {object} data - بيانات الحركة
     * تدفق: تسجل محلياً -> تحديث الكمية -> إضافة للطابور
     */
    record: async (data) => {
      const id = generateId();

      // جلب الكمية الحالية
      const product = await products.getById(data.product_id);
      if (!product) throw new Error('المنتج غير موجود');

      const previousQty = product.stock_qty || 0;
      const newQty = previousQty + data.qty;

      // إدراج الحركة
      await execute(`INSERT INTO stock_movements
        (id, product_id, product_name, movement_type, qty, previous_qty, new_qty,
         reference_type, reference_id, reference_number, cost_price, total_cost,
         notes, user_id, user_name, shift_id, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [id, data.product_id, product.name, data.movement_type, data.qty,
         previousQty, newQty, data.reference_type, data.reference_id,
         data.reference_number, data.cost_price, data.cost_price * Math.abs(data.qty),
         data.notes, data.user_id, data.user_name, data.shift_id]
      );

      // تحديث كمية المنتج
      await execute('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                     [newQty, data.product_id]);

      // إضافة لطابور المزامنة
      const movementData = {
        id,
        product_id: data.product_id,
        product_name: product.name,
        movement_type: data.movement_type,
        qty: data.qty,
        previous_qty: previousQty,
        new_qty: newQty,
        reference_type: data.reference_type,
        reference_id: data.reference_id,
        cost_price: data.cost_price
      };

      await queueSyncOperation('stock_movements', id, 'INSERT', movementData);

      // فحص التنبيهات
      await checkLowStock();

      return id;
    },

    /**
     * جلب حركات مخزون لمنتج
     */
    getByProduct: async (productId, limit = 50) => {
      return query(
        'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT ?',
        [productId, limit]
      );
    },

    /**
     * جلب حركات اليوم
     */
    getToday: async () => {
      return query(
        `SELECT * FROM stock_movements
         WHERE date(created_at) = date('now')
         ORDER BY created_at DESC`
      );
    },

    /**
     * ملخص حركات المخزون
     */
    getSummary: async (dateFrom, dateTo) => {
      return query(
        `SELECT
          movement_type,
          COUNT(*) as count,
          SUM(ABS(qty)) as total_qty,
          SUM(ABS(total_cost)) as total_value
         FROM stock_movements
         WHERE date(created_at) BETWEEN ? AND ?
         GROUP BY movement_type`,
        [dateFrom, dateTo]
      );
    }
  };

  // ============================================
  // Products Operations
  // ============================================

  const products = {
    getAll: async (filters = {}) => {
      let sql = 'SELECT * FROM products WHERE is_active = 1';
      const params = [];

      if (filters.category) {
        sql += ' AND category = ?';
        params.push(filters.category);
      }
      if (filters.search) {
        sql += ' AND (name LIKE ? OR barcode LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`);
      }
      if (filters.low_stock) {
        sql += ' AND stock_qty <= min_stock_qty';
      }

      sql += ' ORDER BY name ASC';
      return query(sql, params);
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM products WHERE id = ?', [id]);
      return results[0] || null;
    },

    getByBarcode: async (barcode) => {
      const results = await query('SELECT * FROM products WHERE barcode = ? AND is_active = 1', [barcode]);
      return results[0] || null;
    },

    create: async (data) => {
      const id = generateId();
      await execute(`INSERT INTO products
        (id, name, name_en, barcode, sku, category, brand, unit, cost_price,
         sell_price, wholesale_price, stock_qty, min_stock_qty, max_stock_qty,
         image_url, notes, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [id, data.name, data.name_en, data.barcode, data.sku, data.category,
         data.brand, data.unit || 'قطعة', data.cost_price || 0,
         data.sell_price || 0, data.wholesale_price || 0, data.stock_qty || 0,
         data.min_stock_qty || 10, data.max_stock_qty || 1000,
         data.image_url, data.notes]
      );

      await queueSyncOperation('products', id, 'INSERT', { id, ...data });

      return products.getById(id);
    },

    update: async (id, data) => {
      const fields = [];
      const params = [];

      Object.entries(data).forEach(([key, value]) => {
        if (['name', 'name_en', 'barcode', 'sku', 'category', 'brand',
             'cost_price', 'sell_price', 'wholesale_price', 'stock_qty',
             'min_stock_qty', 'max_stock_qty', 'image_url', 'notes'].includes(key)) {
          fields.push(`${key} = ?`);
          params.push(value);
        }
      });

      if (fields.length === 0) return null;

      params.push(id);
      await execute(`UPDATE products SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
      await queueSyncOperation('products', id, 'UPDATE', { id, ...data });

      return products.getById(id);
    },

    getLowStock: async () => {
      return query(
        `SELECT *, (min_stock_qty - stock_qty) as shortage
         FROM products WHERE is_active = 1
         AND stock_qty <= min_stock_qty
         ORDER BY shortage DESC`
      );
    },

    delete: async (id) => {
      await execute('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
      await queueSyncOperation('products', id, 'DELETE', { id });
      return true;
    }
  };

  // ============================================
  // Customers Operations
  // ============================================

  const customers = {
    getAll: async (search = '') => {
      let sql = 'SELECT * FROM customers WHERE is_active = 1';
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR phone LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      sql += ' ORDER BY name ASC';
      return query(sql, params);
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM customers WHERE id = ?', [id]);
      return results[0] || null;
    },

    create: async (data) => {
      const id = generateId();
      await execute(`INSERT INTO customers
        (id, name, name_en, phone, phone2, email, address, city,
         tax_id, credit_limit, whatsapp_opt_in, notes, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending')`,
        [id, data.name, data.name_en, data.phone, data.phone2,
         data.email, data.address, data.city, data.tax_id,
         data.credit_limit || 0, data.notes]
      );

      await queueSyncOperation('customers', id, 'INSERT', { id, ...data });
      return customers.getById(id);
    },

    update: async (id, data) => {
      const fields = Object.keys(data)
        .filter(k => ['name', 'name_en', 'phone', 'phone2', 'email',
                      'address', 'city', 'tax_id', 'credit_limit', 'notes'].includes(k))
        .map(k => `${k} = ?`);
      const params = Object.entries(data)
        .filter(([k]) => ['name', 'name_en', 'phone', 'phone2', 'email',
                          'address', 'city', 'tax_id', 'credit_limit', 'notes'].includes(k))
        .map(([, v]) => v);

      if (fields.length === 0) return null;

      params.push(id);
      await execute(`UPDATE customers SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
      await queueSyncOperation('customers', id, 'UPDATE', { id, ...data });

      return customers.getById(id);
    },

    updateLoyaltyPoints: async (customerId, pointsEarned, invoiceId = null) => {
      const customer = await customers.getById(customerId);
      if (!customer) return null;

      const previousPoints = customer.loyalty_points || 0;
      const newPoints = previousPoints + pointsEarned;

      // تحديث نقاط العميل
      await execute(
        'UPDATE customers SET loyalty_points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newPoints, customerId]
      );

      // تسجيل حركة النقاط
      const transId = generateId();
      await execute(`INSERT INTO loyalty_transactions
        (id, customer_id, invoice_id, transaction_type, points, balance_before, balance_after, description, sync_status)
        VALUES (?, ?, ?, 'earn', ?, ?, ?, ?, 'pending')`,
        [transId, customerId, invoiceId, pointsEarned, previousPoints, newPoints,
         `نقاط من فاتورة`]
      );

      await queueSyncOperation('loyalty_transactions', transId, 'INSERT', {
        id: transId, customer_id: customerId, invoice_id: invoiceId,
        points: pointsEarned, balance_after: newPoints
      });

      await queueSyncOperation('customers', customerId, 'UPDATE', {
        id: customerId, loyalty_points: newPoints
      });

      return newPoints;
    },

    delete: async (id) => {
      await execute('UPDATE customers SET is_active = 0 WHERE id = ?', [id]);
      await queueSyncOperation('customers', id, 'DELETE', { id });
      return true;
    }
  };

  // ============================================
  // Suppliers Operations
  // ============================================

  const suppliers = {
    getAll: async (search = '') => {
      let sql = 'SELECT * FROM suppliers WHERE is_active = 1';
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR phone LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      return query(sql + ' ORDER BY name ASC', params);
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM suppliers WHERE id = ?', [id]);
      return results[0] || null;
    },

    create: async (data) => {
      const id = generateId();
      await execute(`INSERT INTO suppliers
        (id, name, name_en, phone, phone2, email, address, city,
         tax_id, contact_person, credit_limit, notes, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [id, data.name, data.name_en, data.phone, data.phone2,
         data.email, data.address, data.city, data.tax_id,
         data.contact_person, data.credit_limit || 0, data.notes]
      );

      await queueSyncOperation('suppliers', id, 'INSERT', { id, ...data });
      return suppliers.getById(id);
    }
  };

  // ============================================
  // Invoices Operations - مع تحديث المخزون التلقائي
  // ============================================

  const invoices = {
    getAll: async (filters = {}) => {
      let sql = 'SELECT * FROM invoices WHERE 1=1';
      const params = [];

      if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }
      if (filters.customer_id) {
        sql += ' AND customer_id = ?';
        params.push(filters.customer_id);
      }
      if (filters.shift_id) {
        sql += ' AND shift_id = ?';
        params.push(filters.shift_id);
      }
      if (filters.date) {
        sql += " AND date(created_at) = date(?)";
        params.push(filters.date);
      }

      sql += ' ORDER BY created_at DESC';
      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      return query(sql, params);
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM invoices WHERE id = ?', [id]);
      return results[0] || null;
    },

    getItems: async (invoiceId) => {
      return query('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at', [invoiceId]);
    },

    /**
     * إنشاء فاتورة جديدة
     * تدفق: حفظ الفاتورة -> إنشاء عناصر -> حركات مخزون -> نقاط ولاء
     */
    create: async (data) => {
      const invoiceId = generateId();
      const invoiceNumber = await generateInvoiceNumber();

      // جلب الوردية الحالية
      const currentShift = await shifts.getCurrent();

      // إدراج الفاتورة الرئيسية
      await execute(`INSERT INTO invoices
        (id, invoice_number, invoice_type, customer_id, customer_name, customer_phone,
         shift_id, user_id, user_name, status, subtotal, discount_amt, discount_percent,
         tax_rate, tax_amt, total_amount, paid_amount, balance_due,
         payment_method, payment_methods, notes, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [invoiceId, invoiceNumber, 'sale', data.customer_id, data.customer_name,
         data.customer_phone, currentShift?.id, data.user_id, data.user_name,
         data.status || 'completed', data.subtotal, data.discount_amt || 0,
         data.discount_percent || 0, data.tax_rate || 15, data.tax_amt || 0,
         data.total_amount, data.paid_amount || data.total_amount,
         data.balance_due || 0, data.payment_method || 'cash',
         JSON.stringify(data.payment_methods || {}), data.notes]
      );

      // معالجة العناصر
      for (const item of data.items) {
        const itemId = generateId();
        const profit = (item.unit_price - (item.cost_price || 0)) * item.qty;

        await execute(`INSERT INTO invoice_items
          (id, invoice_id, product_id, product_name, barcode, qty,
           unit_price, cost_price, discount, tax_amt, total, profit, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [itemId, invoiceId, item.product_id, item.name, item.barcode,
           item.qty, item.unit_price, item.cost_price || 0,
           item.discount || 0, item.tax_amt || 0, item.total, profit]
        );

        // إنشاء حركة مخزون (سالب)
        if (item.product_id) {
          await stockMovements.record({
            product_id: item.product_id,
            movement_type: 'sale',
            qty: -item.qty,
            reference_type: 'invoice',
            reference_id: invoiceId,
            reference_number: invoiceNumber,
            cost_price: item.cost_price,
            notes: `فاتورة رقم ${invoiceNumber}`,
            user_id: data.user_id,
            user_name: data.user_name,
            shift_id: currentShift?.id
          });
        }

        // إضافة عنصر للطابور
        await queueSyncOperation('invoice_items', itemId, 'INSERT', {
          id: itemId, invoice_id: invoiceId, product_id: item.product_id,
          product_name: item.name, qty: item.qty, unit_price: item.unit_price,
          cost_price: item.cost_price, total: item.total
        });
      }

      // تحديث نقاط الولاء (1%)
      if (data.customer_id && data.total_amount > 0) {
        const earnedPoints = Math.round(data.total_amount * 0.01);
        await customers.updateLoyaltyPoints(data.customer_id, earnedPoints, invoiceId);
      }

      // تحديث إحصائيات الوردية
      if (currentShift) {
        await shifts.updateSales(currentShift.id, {
          amount: data.total_amount,
          method: data.payment_method,
          invoiceId
        });
      }

      // إضافة الفاتورة للطابور
      await queueSyncOperation('invoices', invoiceId, 'INSERT', {
        id: invoiceId, invoice_number: invoiceNumber, customer_id: data.customer_id,
        total_amount: data.total_amount, payment_method: data.payment_method
      });

      return invoices.getById(invoiceId);
    },

    getTodayStats: async () => {
      const today = new Date().toISOString().slice(0, 10);
      return query(`SELECT
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END), 0) as credit_sales
        FROM invoices WHERE date(created_at) = date(?) AND status NOT IN ('draft', 'cancelled')`, [today]);
    },

    cancel: async (invoiceId) => {
      // إرجاع الكمية للمخزون
      const items = await invoices.getItems(invoiceId);
      const invoice = await invoices.getById(invoiceId);
      const currentShift = await shifts.getCurrent();

      for (const item of items) {
        if (item.product_id) {
          await stockMovements.record({
            product_id: item.product_id,
            movement_type: 'return',
            qty: item.qty,
            reference_type: 'invoice',
            reference_id: invoiceId,
            reference_number: invoice.invoice_number,
            cost_price: item.cost_price,
            notes: `إلغاء فاتورة ${invoice.invoice_number}`,
            user_id: invoice.user_id,
            user_name: invoice.user_name,
            shift_id: currentShift?.id
          });
        }
      }

      await execute("UPDATE invoices SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [invoiceId]);
      await queueSyncOperation('invoices', invoiceId, 'UPDATE', { id: invoiceId, status: 'cancelled' });

      return true;
    }
  };

  // ============================================
  // Purchase Orders - مع تحديث المخزون
  // ============================================

  const purchaseOrders = {
    getAll: async (filters = {}) => {
      let sql = 'SELECT * FROM purchase_orders WHERE 1=1';
      const params = [];

      if (filters.supplier_id) {
        sql += ' AND supplier_id = ?';
        params.push(filters.supplier_id);
      }

      sql += ' ORDER BY created_at DESC';
      return query(sql, params);
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM purchase_orders WHERE id = ?', [id]);
      return results[0] || null;
    },

    getItems: async (poId) => {
      return query('SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY created_at', [poId]);
    },

    /**
     * إنشاء أمر شراء
     * تدفق: حفظ الأمر -> عناصر -> حركات مخزون موجبة
     */
    create: async (data) => {
      const poId = generateId();
      const poNumber = await generatePONumber();
      const currentShift = await shifts.getCurrent();

      await execute(`INSERT INTO purchase_orders
        (id, po_number, supplier_id, supplier_name, user_id, user_name, shift_id,
         status, subtotal, discount_amt, tax_amt, total_amount, paid_amount,
         payment_method, notes, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [poId, poNumber, data.supplier_id, data.supplier_name,
         data.user_id, data.user_name, currentShift?.id,
         data.subtotal, data.discount_amt || 0, data.tax_amt || 0,
         data.total_amount, data.paid_amount || 0, data.payment_method || 'cash',
         data.notes]
      );

      // معالجة العناصر
      for (const item of data.items) {
        const itemId = generateId();

        await execute(`INSERT INTO purchase_order_items
          (id, po_id, product_id, product_name, barcode, ordered_qty,
           received_qty, unit_cost, total, sync_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [itemId, poId, item.product_id, item.name, item.barcode,
           item.qty, item.qty, item.unit_cost, item.total]
        );

        // إنشاء حركة مخزون (موجب)
        if (item.product_id) {
          await stockMovements.record({
            product_id: item.product_id,
            movement_type: 'purchase',
            qty: item.qty,
            reference_type: 'purchase',
            reference_id: poId,
            reference_number: poNumber,
            cost_price: item.unit_cost,
            notes: `استلام - ${poNumber}`,
            user_id: data.user_id,
            user_name: data.user_name,
            shift_id: currentShift?.id
          });
        }

        await queueSyncOperation('purchase_order_items', itemId, 'INSERT', {
          id: itemId, po_id: poId, product_id: item.product_id,
          received_qty: item.qty, unit_cost: item.unit_cost
        });
      }

      // تحديث إحصائيات المورد
      if (data.supplier_id) {
        await execute(`UPDATE suppliers SET
          total_purchases = total_purchases + ?,
          last_purchase_date = CURRENT_TIMESTAMP
          WHERE id = ?`, [data.total_amount, data.supplier_id]);
      }

      await queueSyncOperation('purchase_orders', poId, 'INSERT', {
        id: poId, po_number: poNumber, supplier_id: data.supplier_id,
        total_amount: data.total_amount
      });

      return purchaseOrders.getById(poId);
    }
  };

  // ============================================
  // Shifts Operations
  // ============================================

  const shifts = {
    getCurrent: async () => {
      try {
        const { value } = await Preferences.get({ key: STORAGE_KEYS.CURRENT_SHIFT });
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    },

    open: async (userId, userName, startingCash) => {
      const existing = await query("SELECT * FROM shifts WHERE status = 'open'");
      if (existing.length > 0) {
        throw new Error('يوجد وردية مفتوحة بالفعل');
      }

      const id = generateId();
      await execute(`INSERT INTO shifts
        (id, user_id, user_name, started_at, starting_cash, status, sync_status)
        VALUES (?, ?, ?, datetime('now'), ?, 'open', 'pending')`,
        [id, userId, userName, startingCash]
      );

      const shift = {
        id, user_id: userId, user_name: userName,
        started_at: new Date().toISOString(),
        starting_cash: startingCash, status: 'open'
      };

      await Preferences.set({ key: STORAGE_KEYS.CURRENT_SHIFT, value: JSON.stringify(shift) });
      await queueSyncOperation('shifts', id, 'INSERT', shift);

      return shift;
    },

    close: async (shiftId, closingData) => {
      await execute(`UPDATE shifts SET
        closed_at = datetime('now'), ending_cash = ?, expected_cash = ?,
        cash_variance = ?, total_sales = ?, total_refunds = ?, total_expenses = ?,
        cash_sales = ?, card_sales = ?, credit_sales = ?, invoice_count = ?,
        status = 'closed', notes = ?
        WHERE id = ?`,
        [closingData.endingCash, closingData.expectedCash,
         closingData.endingCash - closingData.expectedCash,
         closingData.totalSales, closingData.totalRefunds,
         closingData.totalExpenses, closingData.cashSales,
         closingData.cardSales, closingData.creditSales,
         closingData.invoiceCount, closingData.notes, shiftId]
      );

      await Preferences.remove({ key: STORAGE_KEYS.CURRENT_SHIFT });
      await queueSyncOperation('shifts', shiftId, 'UPDATE', { id: shiftId, status: 'closed' });

      return shifts.getById(shiftId);
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM shifts WHERE id = ?', [id]);
      return results[0] || null;
    },

    updateSales: async (shiftId, saleData) => {
      const updateFields = [];
      const params = [];

      if (saleData.amount) {
        updateFields.push('total_sales = total_sales + ?');
        params.push(saleData.amount);
      }
      if (saleData.method === 'cash') {
        updateFields.push('cash_sales = cash_sales + ?');
        params.push(saleData.amount);
      } else if (saleData.method === 'card') {
        updateFields.push('card_sales = card_sales + ?');
        params.push(saleData.amount);
      } else if (saleData.method === 'credit') {
        updateFields.push('credit_sales = credit_sales + ?');
        params.push(saleData.amount);
      }
      updateFields.push('invoice_count = invoice_count + 1');
      params.push(shiftId);

      await execute(`UPDATE shifts SET ${updateFields.join(', ')} WHERE id = ?`, params);

      // تحديث التخزين المؤقت
      const stored = await shifts.getCurrent();
      if (stored) {
        stored.total_sales = (stored.total_sales || 0) + (saleData.amount || 0);
        stored.invoice_count = (stored.invoice_count || 0) + 1;
        await Preferences.set({ key: STORAGE_KEYS.CURRENT_SHIFT, value: JSON.stringify(stored) });
      }
    }
  };

  // ============================================
  // Expenses Operations
  // ============================================

  const expenses = {
    getAll: async (filters = {}) => {
      let sql = 'SELECT * FROM expenses WHERE 1=1';
      const params = [];

      if (filters.shift_id) {
        sql += ' AND shift_id = ?';
        params.push(filters.shift_id);
      }
      if (filters.date_from) {
        sql += " AND date(expense_date) >= date(?)";
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        sql += " AND date(expense_date) <= date(?)";
        params.push(filters.date_to);
      }

      sql += ' ORDER BY expense_date DESC';
      return query(sql, params);
    },

    create: async (data) => {
      const id = generateId();
      const currentShift = await shifts.getCurrent();

      await execute(`INSERT INTO expenses
        (id, category_id, category_name, shift_id, user_id, user_name,
         description, amount, payment_method, receipt_url, expense_date, notes, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [id, data.category_id, data.category_name, currentShift?.id,
         data.user_id, data.user_name, data.description,
         data.amount, data.payment_method || 'cash',
         data.receipt_url, data.expense_date || new Date().toISOString().slice(0, 10),
         data.notes]
      );

      // تحديث مصروفات الوردية
      if (currentShift) {
        await execute('UPDATE shifts SET expense_count = expense_count + 1, total_expenses = total_expenses + ? WHERE id = ?',
                       [data.amount, currentShift.id]);
      }

      await queueSyncOperation('expenses', id, 'INSERT', { id, ...data, shift_id: currentShift?.id });
      return id;
    },

    getCategories: async () => {
      return query('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY name');
    }
  };

  // ============================================
  // Reports & Analytics
  // ============================================

  const reports = {
    getDashboardStats: async () => {
      const today = new Date().toISOString().slice(0, 10);

      // مبيعات اليوم
      const salesStats = await invoices.getTodayStats();

      // عدد المنتجات
      const productsCount = await query('SELECT COUNT(*) as count FROM products WHERE is_active = 1');
      const lowStockCount = await query('SELECT COUNT(*) as count FROM products WHERE stock_qty <= min_stock_qty AND is_active = 1');

      // مصروفات اليوم
      const expensesToday = await query("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date(expense_date) = date(?)", [today]);

      // الربح
      const profitResult = await query(`SELECT
        COALESCE(SUM(ii.total - (ii.cost_price * ii.qty)), 0) as gross_profit
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE date(i.created_at) = date(?)
        AND i.status NOT IN ('draft', 'cancelled')`, [today]);

      const grossProfit = profitResult[0]?.gross_profit || 0;
      const expensesTotal = expensesToday[0]?.total || 0;
      const netProfit = grossProfit - expensesTotal;

      // المنتجات الأكثر مبيعاً
      const topProducts = await query(`SELECT
        p.name, p.barcode,
        SUM(ii.qty) as total_qty,
        SUM(ii.total) as total_sales
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE date(i.created_at) = date(?)
        AND i.status NOT IN ('draft', 'cancelled')
        GROUP BY ii.product_id
        ORDER BY total_qty DESC
        LIMIT 5`, [today]);

      return {
        todaySales: salesStats[0]?.total_sales || 0,
        todayCount: salesStats[0]?.count || 0,
        cashSales: salesStats[0]?.cash_sales || 0,
        cardSales: salesStats[0]?.card_sales || 0,
        productCount: productsCount[0]?.count || 0,
        lowStockCount: lowStockCount[0]?.count || 0,
        expensesToday: expensesTotal,
        grossProfit,
        netProfit,
        topProducts
      };
    },

    getStockMovementsByDate: async (dateFrom, dateTo) => {
      return query(`SELECT
        date(created_at) as date,
        movement_type,
        COUNT(*) as count,
        SUM(ABS(qty)) as total_qty,
        SUM(ABS(total_cost)) as total_value
        FROM stock_movements
        WHERE date(created_at) BETWEEN date(?) AND date(?)
        GROUP BY date(created_at), movement_type
        ORDER BY date DESC`, [dateFrom, dateTo]);
    },

    calculateDailyProfit: async (date) => {
      const result = await query(`SELECT
        COALESCE(SUM(ii.total), 0) as total_sales,
        COALESCE(SUM(ii.qty * ii.cost_price), 0) as total_cost,
        COALESCE(SUM(ii.total - (ii.qty * ii.cost_price)), 0) as gross_profit
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE date(i.created_at) = date(?)
        AND i.status NOT IN ('draft', 'cancelled')`, [date]);

      const expenses = await query("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date(expense_date) = date(?)", [date]);

      return {
        total_sales: result[0]?.total_sales || 0,
        total_cost: result[0]?.total_cost || 0,
        gross_profit: result[0]?.gross_profit || 0,
        total_expenses: expenses[0]?.total || 0,
        net_profit: (result[0]?.gross_profit || 0) - (expenses[0]?.total || 0)
      };
    }
  };

  // ============================================
  // WhatsApp Operations
  // ============================================

  const whatsapp = {
    getContacts: async (type = 'all') => {
      let sql = '';

      if (type === 'customers') {
        sql = `SELECT id, name, phone, 'customer' as type FROM customers WHERE is_active = 1 AND phone IS NOT NULL AND phone != ''`;
      } else if (type === 'suppliers') {
        sql = `SELECT id, name, phone, 'supplier' as type FROM suppliers WHERE is_active = 1 AND phone IS NOT NULL AND phone != ''`;
      } else {
        sql = `SELECT id, name, phone, 'customer' as type FROM customers WHERE is_active = 1 AND phone IS NOT NULL
               UNION
               SELECT id, name, phone, 'supplier' as type FROM suppliers WHERE is_active = 1 AND phone IS NOT NULL AND phone != ''`;
      }

      return query(sql);
    },

    generateUrl: (phone, message) => {
      const cleanPhone = phone.replace(/\D/g, '');
      return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    },

    queueMessage: async (data) => {
      const id = generateId();
      await execute(`INSERT INTO whatsapp_queue
        (id, recipient_type, recipient_id, recipient_name, phone, message,
         template_type, template_data, status, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
        [id, data.recipient_type, data.recipient_id, data.recipient_name,
         data.phone, data.message, data.template_type,
         JSON.stringify(data.template_data || {})]
      );

      return id;
    },

    getInvoiceMessage: (invoice, customer) => {
      return `فاتورة رقم: ${invoice.invoice_number}
التاريخ: ${new Date(invoice.created_at).toLocaleDateString('ar-SA')}
العميل: ${customer?.name || 'عميل نقدي'}
المجموع: ${invoice.subtotal?.toFixed(2)} ريال
الضريبة (15%): ${invoice.tax_amt?.toFixed(2)} ريال
الإجمالي: ${invoice.total_amount?.toFixed(2)} ريال
طريقة الدفع: ${invoice.payment_method}
---
شكراً لتعاملكم معنا!`;
    },

    getOrderRequestMessage: (items, supplierName) => {
      return `مرحباً ${supplierName}،
نود طلب المنتجات التالية:

${items.map((item, i) => `${i + 1}. ${item.name} - الكمية: ${item.qty}`).join('\n')}

يرجى التواصل للتأكيد.
---
تم إرسال هذا الطلب من نظام نواة AI`;
    }
  };

  // ============================================
  // Admin Requests
  // ============================================

  const adminRequests = {
    create: async (data) => {
      const id = generateId();
      const currentShift = await shifts.getCurrent();

      await execute(`INSERT INTO admin_requests
        (id, user_id, user_name, shift_id, request_type, title,
         description, priority, status, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
        [id, data.user_id, data.user_name, currentShift?.id,
         data.request_type, data.title, data.description,
         data.priority || 'normal']
      );

      await queueSyncOperation('admin_requests', id, 'INSERT', {
        id, user_id: data.user_id, request_type: data.request_type,
        title: data.title, shift_id: currentShift?.id
      });

      return id;
    },

    getMessage: (request, user, shift) => {
      return `طلب ${request.request_type}
---
العنوان: ${request.title}
التفاصيل: ${request.description}
الأولوية: ${request.priority === 'urgent' ? 'عاجل' : request.priority === 'high' ? 'مهم' : 'عادي'}
---
الموظف: ${user?.name || request.user_name}
${shift ? `الوردية: ${shift.id?.substring(0, 8)}` : ''}
التاريخ: ${new Date().toLocaleString('ar-SA')}`;
    }
  };

  // ============================================
  // Low Stock Checker
  // ============================================

  const checkLowStock = async () => {
    try {
      const alerts = await products.getLowStock();
      setLowStockAlerts(alerts);
      return alerts;
    } catch (err) {
      console.error('Error checking low stock:', err);
      return [];
    }
  };

  // ============================================
  // Context Value
  // ============================================

  const value = {
    // State
    isReady,
    error,
    syncStatus,
    lowStockAlerts,

    // Core operations
    query,
    execute,

    // Sync
    triggerSync,
    refreshSync,

    // Entities
    products,
    customers,
    suppliers,
    shifts,
    invoices,
    purchaseOrders,
    expenses,

    // Stock
    stockMovements,
    checkLowStock,

    // Reports
    reports,

    // Communication
    whatsapp,
    adminRequests
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within DatabaseProvider');
  }
  return context;
}

// ============================================
// Helper Functions
// ============================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

async function generateInvoiceNumber() {
  const today = new Date();
  const prefix = `INV-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;

  try {
    const result = await query(`SELECT COUNT(*) as count FROM invoices WHERE date(created_at) = date('now')`);
    const count = (result[0]?.count || 0) + 1;
    return `${prefix}-${count.toString().padStart(4, '0')}`;
  } catch {
    return `${prefix}-0001`;
  }
}

async function generatePONumber() {
  const today = new Date();
  const prefix = `PO-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;

  try {
    const result = await query(`SELECT COUNT(*) as count FROM purchase_orders WHERE date(created_at) = date('now')`);
    const count = (result[0]?.count || 0) + 1;
    return `${prefix}-${count.toString().padStart(4, '0')}`;
  } catch {
    return `${prefix}-0001`;
  }
}

// Workaround for query/execute outside context
let dbInstance = null;

export default DatabaseContext;
