/**
 * Database Context
 * =-=-=-=-=-=-=-=-=-=
 * سياق قاعدة البيانات لإدارة SQLite
 * يوفر اتصال موحد وجميع العمليات الأساسية
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Preferences } from '@capacitor/preferences';
import { DATABASE_SCHEMA, INSERT_DEFAULT_CATEGORIES } from '../lib/databaseSchema.js';

// Database configuration
const DB_NAME = 'nawh_erp_db';
const DB_VERSION = 1;

// Context Creation
const DatabaseContext = createContext(null);

// Storage keys for Preferences
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

  // Initialize database on mount
  useEffect(() => {
    initializeDatabase();
  }, []);

  /**
   * Initialize SQLite Database
   * يتم تهيئة قاعدة البيانات عند بدء التطبيق
   */
  const initializeDatabase = async () => {
    try {
      // Check if running in native platform
      const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

      if (isNative) {
        // Initialize SQLite connection
        const sqlite = new SQLiteConnection(CapacitorSQLite);

        // Check if database exists
        const isDBExists = await sqlite.isDatabase(DB_NAME);

        // Create/Open database
        const dbConnection = await sqlite.createConnection(
          DB_NAME,
          false,  // encrypted
          'no-encryption',
          DB_VERSION,
          false   // readonly
        );

        await dbConnection.open();

        // Create tables if not exists
        await dbConnection.execute(DATABASE_SCHEMA);

        // Insert default categories
        await dbConnection.execute(INSERT_DEFAULT_CATEGORIES);

        setDb(dbConnection);
        console.log('SQLite database initialized successfully');
      }

      // Save initialization timestamp to Preferences
      await Preferences.set({
        key: STORAGE_KEYS.LAST_SYNC,
        value: new Date().toISOString()
      });

      setIsReady(true);
    } catch (err) {
      console.error('Database initialization error:', err);
      setError(err.message);

      // Fallback: Mark as ready anyway (will use mock/localStorage)
      setIsReady(true);
    }
  };

  // ============================================
  // Query Functions - دوال الاستعلام
  // ============================================

  /**
   * Execute SQL query
   * @param {string} sql - SQL statement
   * @param {array} params - Query parameters
   * @returns {array} Query results
   */
  const query = useCallback(async (sql, params = []) => {
    if (!db) {
      console.warn('Database not initialized, returning empty result');
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

  /**
   * Execute SQL statement (INSERT, UPDATE, DELETE)
   * @param {string} sql - SQL statement
   * @param {array} params - Statement parameters
   * @returns {object} { changes, lastInsertRowId }
   */
  const execute = useCallback(async (sql, params = []) => {
    if (!db) {
      throw new Error('Database not initialized');
    }

    try {
      // Split multiple statements
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
  // Products Operations - عمليات المنتجات
  // ============================================

  const products = {
    async getAll(filters = {}) {
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

    async getById(id) {
      const results = await query('SELECT * FROM products WHERE id = ?', [id]);
      return results[0] || null;
    },

    async getByBarcode(barcode) {
      const results = await query('SELECT * FROM products WHERE barcode = ? AND is_active = 1', [barcode]);
      return results[0] || null;
    },

    async create(data) {
      const id = generateId();
      const sql = `INSERT INTO products (id, name, barcode, category, unit, cost_price, sell_price, stock_qty, min_stock_qty, is_active, image_url, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      await execute(sql, [id, data.name, data.barcode, data.category, data.unit || 'قطعة',
                          data.cost_price || 0, data.sell_price || 0, data.stock_qty || 0,
                          data.min_stock_qty || 10, 1, data.image_url, data.notes]);
      return this.getById(id);
    },

    async update(id, data) {
      const fields = [];
      const params = [];

      Object.entries(data).forEach(([key, value]) => {
        if (['name', 'barcode', 'category', 'unit', 'cost_price', 'sell_price', 'stock_qty', 'min_stock_qty', 'image_url', 'notes'].includes(key)) {
          fields.push(`${key} = ?`);
          params.push(value);
        }
      });

      if (fields.length === 0) return null;

      params.push(id);
      await execute(`UPDATE products SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
      return this.getById(id);
    },

    async updateStock(id, qtyChange, reason = '') {
      const product = await this.getById(id);
      if (!product) throw new Error('Product not found');

      const newQty = Math.max(0, product.stock_qty + qtyChange);
      await execute('UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newQty, id]);

      // Log adjustment
      const currentShift = await getFromPreferences(STORAGE_KEYS.CURRENT_SHIFT);
      await execute(`INSERT INTO inventory_adjustments (id, product_id, product_name, previous_qty, new_qty, adjustment_qty, reason, shift_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [generateId(), id, product.name, product.stock_qty, newQty, qtyChange, reason, currentShift?.id]);

      return newQty;
    },

    async getLowStock() {
      return query('SELECT * FROM products WHERE stock_qty <= min_stock_qty AND is_active = 1 ORDER BY stock_qty ASC');
    },

    async delete(id) {
      return execute('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
    }
  };

  // ============================================
  // Customers Operations - عمليات العملاء
  // ============================================

  const customers = {
    async getAll(search = '') {
      let sql = 'SELECT * FROM customers WHERE is_active = 1';
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR phone LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      sql += ' ORDER BY name ASC';
      return query(sql, params);
    },

    async getById(id) {
      const results = await query('SELECT * FROM customers WHERE id = ?', [id]);
      return results[0] || null;
    },

    async getByPhone(phone) {
      const results = await query('SELECT * FROM customers WHERE phone = ? AND is_active = 1', [phone]);
      return results[0] || null;
    },

    async create(data) {
      const id = generateId();
      const sql = `INSERT INTO customers (id, name, phone, email, address, tax_id, credit_limit, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      await execute(sql, [id, data.name, data.phone, data.email, data.address, data.tax_id, data.credit_limit || 0, data.notes]);
      return this.getById(id);
    },

    async updateLoyaltyPoints(customerId, pointsEarned) {
      const customer = await this.getById(customerId);
      if (!customer) return null;

      const newPoints = (customer.loyalty_points || 0) + pointsEarned;
      await execute('UPDATE customers SET loyalty_points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newPoints, customerId]);
      return newPoints;
    },

    async delete(id) {
      return execute('UPDATE customers SET is_active = 0 WHERE id = ?', [id]);
    }
  };

  // ============================================
  // Suppliers Operations - عمليات الموردين
  // ============================================

  const suppliers = {
    async getAll(search = '') {
      let sql = 'SELECT * FROM suppliers WHERE is_active = 1';
      const params = [];

      if (search) {
        sql += ' AND (name LIKE ? OR phone LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      sql += ' ORDER BY name ASC';
      return query(sql, params);
    },

    async getById(id) {
      const results = await query('SELECT * FROM suppliers WHERE id = ?', [id]);
      return results[0] || null;
    },

    async create(data) {
      const id = generateId();
      const sql = `INSERT INTO suppliers (id, name, phone, email, address, tax_id, credit_limit, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      await execute(sql, [id, data.name, data.phone, data.email, data.address, data.tax_id, data.credit_limit || 0, data.notes]);
      return this.getById(id);
    }
  };

  // ============================================
  // Shifts Operations - عمليات الورديات
  // ============================================

  const shifts = {
    async getCurrent() {
      // First check Preferences for active shift
      const stored = await getFromPreferences(STORAGE_KEYS.CURRENT_SHIFT);
      if (stored) return stored;
      return null;
    },

    async open(userId, userName, startingCash) {
      // Check if there's an open shift
      const existing = await query("SELECT * FROM shifts WHERE status = 'open'");
      if (existing.length > 0) {
        throw new Error('يوجد وردية مفتوحة بالفعل');
      }

      const id = generateId();
      const sql = `INSERT INTO shifts (id, user_id, user_name, started_at, starting_cash, status)
                   VALUES (?, ?, ?, datetime('now'), ?, 'open')`;
      await execute(sql, [id, userId, userName, startingCash]);

      const shift = {
        id,
        user_id: userId,
        user_name: userName,
        started_at: new Date().toISOString(),
        starting_cash: startingCash,
        status: 'open'
      };

      // Save to Preferences for quick access
      await saveToPreferences(STORAGE_KEYS.CURRENT_SHIFT, shift);

      return shift;
    },

    async close(shiftId, closingData) {
      const sql = `UPDATE shifts SET
                   closed_at = datetime('now'),
                   ending_cash = ?,
                   total_sales = ?,
                   total_refunds = ?,
                   total_expenses = ?,
                   cash_sales = ?,
                   card_sales = ?,
                   credit_sales = ?,
                   invoice_count = ?,
                   status = 'closed',
                   notes = ?
                   WHERE id = ?`;

      await execute(sql, [
        closingData.endingCash,
        closingData.totalSales,
        closingData.totalRefunds,
        closingData.totalExpenses,
        closingData.cashSales,
        closingData.cardSales,
        closingData.creditSales,
        closingData.invoiceCount,
        closingData.notes,
        shiftId
      ]);

      // Clear from Preferences
      await removeFromPreferences(STORAGE_KEYS.CURRENT_SHIFT);

      return await this.getById(shiftId);
    },

    async getById(id) {
      const results = await query('SELECT * FROM shifts WHERE id = ?', [id]);
      return results[0] || null;
    },

    async getByUser(userId, limit = 10) {
      return query('SELECT * FROM shifts WHERE user_id = ? ORDER BY started_at DESC LIMIT ?', [userId, limit]);
    },

    async updateSales(shiftId, saleData) {
      // Called after each invoice to update shift stats
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

      // Update stored shift in Preferences
      const stored = await getFromPreferences(STORAGE_KEYS.CURRENT_SHIFT);
      if (stored) {
        stored.total_sales = (stored.total_sales || 0) + (saleData.amount || 0);
        stored.invoice_count = (stored.invoice_count || 0) + 1;
        await saveToPreferences(STORAGE_KEYS.CURRENT_SHIFT, stored);
      }
    }
  };

  // ============================================
  // Invoices Operations - عمليات الفواتير
  // ============================================

  const invoices = {
    async getAll(filters = {}) {
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
      if (filters.date_from) {
        sql += " AND date(created_at) >= date(?)";
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        sql += " AND date(created_at) <= date(?)";
        params.push(filters.date_to);
      }

      sql += ' ORDER BY created_at DESC';

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      return query(sql, params);
    },

    async getById(id) {
      const results = await query('SELECT * FROM invoices WHERE id = ?', [id]);
      return results[0] || null;
    },

    async getItems(invoiceId) {
      return query('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at', [invoiceId]);
    },

    async create(data) {
      const invoiceId = generateId();
      const invoiceNumber = await generateInvoiceNumber();

      // Get current shift
      const currentShift = await shifts.getCurrent();

      // Insert invoice
      const sql = `INSERT INTO invoices (id, invoice_number, customer_id, customer_name, shift_id, user_id, user_name, status, subtotal, discount_amt, discount_percent, tax_rate, tax_amt, total_amount, paid_amount, balance_due, payment_method, payment_details, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      await execute(sql, [invoiceId, invoiceNumber, data.customer_id, data.customer_name,
                          currentShift?.id, data.user_id, data.user_name,
                          data.status || 'completed', data.subtotal, data.discount_amt || 0,
                          data.discount_percent || 0, data.tax_rate || 15, data.tax_amt || 0,
                          data.total_amount, data.paid_amount || data.total_amount,
                          data.balance_due || 0, data.payment_method || 'cash',
                          JSON.stringify(data.payment_details || {}),
                          data.notes]);

      // Insert invoice items and update stock
      for (const item of data.items) {
        const itemId = generateId();
        await execute(`INSERT INTO invoice_items (id, invoice_id, product_id, product_name, barcode, qty, unit_price, cost_price, discount, tax_amt, total)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                      [itemId, invoiceId, item.product_id, item.name, item.barcode,
                       item.qty, item.unit_price, item.cost_price || 0, item.discount || 0,
                       item.tax_amt || 0, item.total]);

        // Reduce stock
        if (item.product_id) {
          await products.updateStock(item.product_id, -item.qty, `فاتورة ${invoiceNumber}`);
        }
      }

      // Update shift stats
      if (currentShift) {
        await shifts.updateSales(currentShift.id, {
          amount: data.total_amount,
          method: data.payment_method
        });
      }

      // Update customer loyalty points (1% of total)
      if (data.customer_id && data.total_amount > 0) {
        const earnedPoints = Math.round(data.total_amount * 0.01);
        await customers.updateLoyaltyPoints(data.customer_id, earnedPoints);

        // Log loyalty transaction
        await execute(`INSERT INTO loyalty_transactions (id, customer_id, invoice_id, points, description)
                       VALUES (?, ?, ?, ?, ?)`, [generateId(), data.customer_id, invoiceId, earnedPoints, `نقاط من فاتورة ${invoiceNumber}`]);
      }

      return this.getById(invoiceId);
    },

    async getTodayStats() {
      const today = new Date().toISOString().slice(0, 10);
      const results = await query(`SELECT
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END), 0) as credit_sales
        FROM invoices WHERE date(created_at) = date(?) AND status != 'cancelled'`, [today]);
      return results[0] || { count: 0, total_sales: 0, cash_sales: 0, card_sales: 0, credit_sales: 0 };
    },

    async cancel(invoiceId) {
      // Restore stock for cancelled invoice
      const items = await this.getItems(invoiceId);
      for (const item of items) {
        if (item.product_id) {
          await products.updateStock(item.product_id, item.qty, 'إلغاء فاتورة');
        }
      }

      return execute("UPDATE invoices SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [invoiceId]);
    }
  };

  // ============================================
  // Purchase Orders Operations - أوامر الشراء
  // ============================================

  const purchaseOrders = {
    async getAll(filters = {}) {
      let sql = 'SELECT * FROM purchase_orders WHERE 1=1';
      const params = [];

      if (filters.supplier_id) {
        sql += ' AND supplier_id = ?';
        params.push(filters.supplier_id);
      }
      if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }

      sql += ' ORDER BY created_at DESC';
      return query(sql, params);
    },

    async getById(id) {
      const results = await query('SELECT * FROM purchase_orders WHERE id = ?', [id]);
      return results[0] || null;
    },

    async getItems(poId) {
      return query('SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY created_at', [poId]);
    },

    async create(data) {
      const poId = generateId();
      const poNumber = await generatePONumber();

      // Insert purchase order
      const sql = `INSERT INTO purchase_orders (id, po_number, supplier_id, supplier_name, user_id, user_name, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      await execute(sql, [poId, poNumber, data.supplier_id, data.supplier_name,
                          data.user_id, data.user_name, 'received',
                          data.subtotal, data.discount_amt || 0, data.tax_amt || 0,
                          data.total_amount, data.paid_amount || 0, data.payment_method || 'cash',
                          data.notes]);

      // Insert items and update stock
      for (const item of data.items) {
        const itemId = generateId();
        await execute(`INSERT INTO purchase_order_items (id, po_id, product_id, product_name, barcode, qty, unit_cost, total)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                      [itemId, poId, item.product_id, item.name, item.barcode,
                       item.qty, item.unit_cost, item.total]);

        // Increase stock
        if (item.product_id) {
          await products.updateStock(item.product_id, item.qty, `استلام - ${poNumber}`);
        }
      }

      return this.getById(poId);
    }
  };

  // ============================================
  // Expenses Operations - المصروفات
  // ============================================

  const expenses = {
    async getAll(filters = {}) {
      let sql = 'SELECT * FROM expenses WHERE 1=1';
      const params = [];

      if (filters.category_id) {
        sql += ' AND category_id = ?';
        params.push(filters.category_id);
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

    async create(data) {
      const id = generateId();
      const currentShift = await shifts.getCurrent();

      const sql = `INSERT INTO expenses (id, category_id, category_name, shift_id, user_id, user_name, description, amount, payment_method, receipt_url, expense_date, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      await execute(sql, [id, data.category_id, data.category_name, currentShift?.id,
                          data.user_id, data.user_name, data.description,
                          data.amount, data.payment_method || 'cash',
                          data.receipt_url, data.expense_date || new Date().toISOString(),
                          data.notes]);

      // Update shift expenses
      if (currentShift) {
        await execute('UPDATE shifts SET total_expenses = total_expenses + ? WHERE id = ?', [data.amount, currentShift.id]);
      }

      return id;
    },

    async getTotalByDate(date) {
      const results = await query("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date(expense_date) = date(?)", [date]);
      return results[0]?.total || 0;
    },

    async getCategories() {
      return query('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY name');
    }
  };

  // ============================================
  // Reports & Analytics - التقارير والتحليلات
  // ============================================

  const reports = {
    async getDashboardStats() {
      const today = new Date().toISOString().slice(0, 10);

      // Sales stats
      const salesStats = await invoices.getTodayStats();

      // Products count
      const productsCount = await query('SELECT COUNT(*) as count FROM products WHERE is_active = 1');
      const lowStockCount = await query('SELECT COUNT(*) as count FROM products WHERE stock_qty <= min_stock_qty AND is_active = 1');

      // Expenses today
      const expensesToday = await expenses.getTotalByDate(today);

      // Top selling products
      const topProducts = await query(`SELECT
        p.name, p.barcode,
        SUM(ii.qty) as total_qty,
        SUM(ii.total) as total_sales
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE date(i.created_at) = date(?)
        AND i.status != 'cancelled'
        GROUP BY ii.product_id
        ORDER BY total_qty DESC
        LIMIT 5`, [today]);

      // Net profit calculation
      const result = await query(`SELECT
        COALESCE(SUM(ii.total - (ii.cost_price * ii.qty)), 0) as gross_profit
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE date(i.created_at) = date(?)
        AND i.status != 'cancelled'`, [today]);

      const grossProfit = result[0]?.gross_profit || 0;
      const netProfit = grossProfit - expensesToday;

      return {
        todaySales: salesStats.total_sales,
        todayCount: salesStats.count,
        cashSales: salesStats.cash_sales,
        cardSales: salesStats.card_sales,
        creditSales: salesStats.credit_sales,
        productCount: productsCount[0]?.count || 0,
        lowStockCount: lowStockCount[0]?.count || 0,
        expensesToday,
        grossProfit,
        netProfit,
        topProducts
      };
    },

    async getSalesReport(dateFrom, dateTo) {
      return query(`SELECT
        date(created_at) as date,
        COUNT(*) as invoice_count,
        SUM(total_amount) as total_sales,
        SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END) as cash_sales,
        SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END) as card_sales,
        SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END) as credit_sales
        FROM invoices
        WHERE date(created_at) BETWEEN date(?) AND date(?)
        AND status != 'cancelled'
        GROUP BY date(created_at)
        ORDER BY date DESC`, [dateFrom, dateTo]);
    },

    async getProductPerformance(dateFrom, dateTo) {
      return query(`SELECT
        p.id, p.name, p.barcode, p.category,
        SUM(ii.qty) as total_qty,
        SUM(ii.total) as total_sales,
        SUM(ii.total - (ii.cost_price * ii.qty)) as profit
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE date(i.created_at) BETWEEN date(?) AND date(?)
        AND i.status != 'cancelled'
        GROUP BY ii.product_id
        ORDER BY total_qty DESC`, [dateFrom, dateTo]);
    },

    async getUserPerformance(userId, dateFrom, dateTo) {
      return query(`SELECT
        user_id, user_name,
        COUNT(*) as invoice_count,
        SUM(total_amount) as total_sales,
        AVG(total_amount) as avg_invoice
        FROM invoices
        WHERE user_id = ?
        AND date(created_at) BETWEEN date(?) AND date(?)
        AND status != 'cancelled'
        GROUP BY user_id`, [userId, dateFrom, dateTo]);
    }
  };

  // ============================================
  // WhatsApp Operations
  // ============================================

  const whatsapp = {
    async getRecipientsFromContacts(type = 'all') {
      let sql = '';
      if (type === 'customers') {
        sql = "SELECT id, name, phone, 'customer' as type FROM customers WHERE is_active = 1 AND phone IS NOT NULL AND phone != ''";
      } else if (type === 'suppliers') {
        sql = "SELECT id, name, phone, 'supplier' as type FROM suppliers WHERE is_active = 1 AND phone IS NOT NULL AND phone != ''";
      } else {
        sql = `SELECT id, name, phone, 'customer' as type FROM customers WHERE is_active = 1 AND phone IS NOT NULL AND phone != ''
               UNION
               SELECT id, name, phone, 'supplier' as type FROM suppliers WHERE is_active = 1 AND phone IS NOT NULL AND phone != ''`;
      }
      return query(sql);
    },

    async queueMessage(data) {
      const id = generateId();
      await execute(`INSERT INTO whatsapp_queue (id, recipient_type, recipient_id, recipient_name, phone, message, template_type, template_data, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                     [id, data.recipient_type, data.recipient_id, data.recipient_name,
                      data.phone, data.message, data.template_type, JSON.stringify(data.template_data || {})]);
      return id;
    },

    async getPendingMessages() {
      return query("SELECT * FROM whatsapp_queue WHERE status = 'pending' ORDER BY created_at");
    },

    generateWhatsAppUrl(phone, message) {
      const cleanPhone = phone.replace(/\D/g, '');
      return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    },

    generateInvoiceMessage(invoice, customer) {
      return `فاتورة رقم: ${invoice.invoice_number}
التاريخ: ${new Date(invoice.created_at).toLocaleDateString('ar-SA')}
العميل: ${customer?.name || 'عميل نقدي'}
الإجمالي: ${invoice.total_amount?.toFixed(2)} ريال
طريقة الدفع: ${invoice.payment_method}
---
شكراً لتعاملكم معنا!`;
    }
  };

  // ============================================
  // Admin Requests - طلبات الإدارة
  // ============================================

  const adminRequests = {
    async create(data) {
      const id = generateId();
      const currentShift = await shifts.getCurrent();

      await execute(`INSERT INTO admin_requests (id, user_id, user_name, shift_id, request_type, title, description, priority)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                     [id, data.user_id, data.user_name, currentShift?.id,
                      data.request_type, data.title, data.description, data.priority || 'normal']);
      return id;
    },

    async getAll(filters = {}) {
      let sql = 'SELECT * FROM admin_requests WHERE 1=1';
      const params = [];

      if (filters.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }
      if (filters.user_id) {
        sql += ' AND user_id = ?';
        params.push(filters.user_id);
      }

      sql += ' ORDER BY created_at DESC';
      return query(sql, params);
    },

    generateRequestMessage(request, user, shift) {
      return `طلب ${request.request_type}
---
العنوان: ${request.title}
التفاصيل: ${request.description}
---
الموظف: ${user?.name || request.user_name}
${shift ? `الوردية: ${shift.id.substring(0, 8)}` : ''}
التاريخ: ${new Date().toLocaleString('ar-SA')}`;
    }
  };

  // Export context value
  const value = {
    isReady,
    error,
    // Core operations
    query,
    execute,
    // Entity operations
    products,
    customers,
    suppliers,
    shifts,
    invoices,
    purchaseOrders,
    expenses,
    // Reports
    reports,
    // WhatsApp
    whatsapp,
    // Admin
    adminRequests
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

// ============================================
// Hook to use database context
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

  // Get count of today's invoices
  const result = await query(`SELECT COUNT(*) as count FROM invoices WHERE date(created_at) = date('now')`);
  const count = (result[0]?.count || 0) + 1;

  return `${prefix}-${count.toString().padStart(4, '0')}`;
}

async function generatePONumber() {
  const today = new Date();
  const prefix = `PO-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;

  const result = await query(`SELECT COUNT(*) as count FROM purchase_orders WHERE date(created_at) = date('now')`);
  const count = (result[0]?.count || 0) + 1;

  return `${prefix}-${count.toString().padStart(4, '0')}`;
}

// Preferences helpers
async function saveToPreferences(key, value) {
  try {
    await Preferences.set({ key, value: JSON.stringify(value) });
  } catch (err) {
    console.error('Preferences save error:', err);
    localStorage.setItem(key, JSON.stringify(value));
  }
}

async function getFromPreferences(key) {
  try {
    const { value } = await Preferences.get({ key });
    return value ? JSON.parse(value) : null;
  } catch (err) {
    const local = localStorage.getItem(key);
    return local ? JSON.parse(local) : null;
  }
}

async function removeFromPreferences(key) {
  try {
    await Preferences.remove({ key });
  } catch (err) {
    localStorage.removeItem(key);
  }
}

export default DatabaseContext;
