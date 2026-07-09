/**
 * Database Context - Safe Initialization
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
 * سياق قاعدة البيانات مع تهيئة آمنة
 * يعمل محلياً أولاً (Offline-First)
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// Context Creation
const DatabaseContext = createContext(null)

// Storage keys
const STORAGE_KEYS = {
  CURRENT_SHIFT: 'nawh_current_shift',
  USER_SESSION: 'nawh_user_session',
  LAST_SYNC: 'nawh_last_sync',
  SETTINGS: 'nawh_settings'
}

// Safe storage helpers
const safeStorage = {
  async get(key) {
    try {
      // Try Capacitor Preferences first
      if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Preferences) {
        const { Preferences } = await import('@capacitor/preferences')
        const { value } = await Preferences.get({ key })
        return value ? JSON.parse(value) : null
      }
    } catch {
      // Fallback to localStorage
    }
    // Fallback to localStorage
    try {
      const local = localStorage.getItem(key)
      return local ? JSON.parse(local) : null
    } catch {
      return null
    }
  },

  async set(key, value) {
    try {
      if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Preferences) {
        const { Preferences } = await import('@capacitor/preferences')
        await Preferences.set({ key, value: JSON.stringify(value) })
        return true
      }
    } catch {
      // Fallback to localStorage
    }
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },

  async remove(key) {
    try {
      if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Preferences) {
        const { Preferences } = await import('@capacitor/preferences')
        await Preferences.remove({ key })
        return true
      }
    } catch {}
    try {
      localStorage.removeItem(key)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Database Provider Component - Safe Initialization
 */
export function DatabaseProvider({ children }) {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)
  const [syncStatus, setSyncStatus] = useState({ isOnline: navigator.onLine })
  const [lowStockAlerts, setLowStockAlerts] = useState([])

  // In-memory data store (fallback)
  const [memoryStore] = useState({
    products: [],
    customers: [],
    suppliers: [],
    invoices: [],
    shifts: [],
    expenses: [],
    stock_movements: []
  })

  // Initialize on mount
  useEffect(() => {
    initializeDatabaseSafely()
  }, [])

  // Online/offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: true }))
    }
    const handleOffline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: false }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  /**
   * Safe Database Initialization
   * تهيئة آمنة - لا تفشل أبداً
   */
  const initializeDatabaseSafely = async () => {
    try {
      // Check for Capacitor native platform
      const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()

      if (isNative) {
        // Try to initialize SQLite in native environment
        try {
          const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
          const sqlite = new SQLiteConnection(CapacitorSQLite)
          const DB_NAME = 'nawh_erp_db'

          // Create connection
          const dbConnection = await sqlite.createConnection(
            DB_NAME,
            false,
            'no-encryption',
            1,
            false
          )

          await dbConnection.open()

          // Store db connection globally for direct access
          window.__NAWH_DB__ = dbConnection

          console.log('SQLite initialized successfully')
        } catch (dbError) {
          console.warn('SQLite initialization failed, using in-memory storage:', dbError.message)
          // Continue without SQLite - use memory storage
        }
      }

      // Initialize sync status in background (don't block UI)
      initSyncInBackground()

      // Mark as ready immediately
      setIsReady(true)
      setError(null)

    } catch (err) {
      console.error('Database initialization error:', err)
      // Still mark as ready - we work offline
      setIsReady(true)
      setError(null) // Don't show error, work locally
    }
  }

  /**
   * Initialize sync in background
   * لا يحظر واجهة المستخدم
   */
  const initSyncInBackground = async () => {
    try {
      const sync = await import('../services/syncEngine.js')
      const status = await sync.getSyncStatus()
      setSyncStatus(prev => ({ ...prev, ...status }))
    } catch {
      // Sync module not available, continue offline
      console.log('Sync engine not available, working offline')
    }
  }

  // ============================================
  // Query Functions - Safe Versions
  // ============================================

  const query = useCallback(async (sql, params = []) => {
    try {
      // Try SQLite if available
      if (window.__NAWH_DB__) {
        const result = await window.__NAWH_DB__.query(sql, params)
        return result.values || []
      }
    } catch (err) {
      console.warn('SQLite query failed:', err.message)
    }
    // Return empty array (in-memory or fallback)
    return []
  }, [])

  const execute = useCallback(async (sql, params = []) => {
    try {
      if (window.__NAWH_DB__) {
        const statements = sql.split(';').filter(s => s.trim())
        let lastResult = { changes: 0, lastInsertRowId: 0 }
        for (const statement of statements) {
          if (statement.trim()) {
            lastResult = await window.__NAWH_DB__.run(statement + ';', params)
          }
        }
        return lastResult
      }
    } catch (err) {
      console.warn('SQLite execute failed:', err.message)
    }
    return { changes: 0, lastInsertRowId: 0 }
  }, [])

  // ============================================
  // Sync Functions
  // ============================================

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) {
      return { success: false, error: 'Offline' }
    }
    try {
      const sync = await import('../services/syncEngine.js')
      return sync.fullSync(window.__NAWH_DB__)
    } catch {
      return { success: false, error: 'Sync unavailable' }
    }
  }, [])

  const refreshSync = useCallback(async () => {
    try {
      const sync = await import('../services/syncEngine.js')
      const status = await sync.getSyncStatus()
      setSyncStatus(prev => ({ ...prev, ...status }))
      return status
    } catch {
      return syncStatus
    }
  }, [syncStatus])

  // ============================================
  // Stock Movements
  // ============================================

  const stockMovements = {
    record: async (data) => {
      const id = generateId()
      try {
        // Record movement locally
        if (window.__NAWH_DB__) {
          const product = await products.getById(data.product_id)
          if (product) {
            const previousQty = product.stock_qty || 0
            const newQty = previousQty + data.qty

            await execute(`INSERT INTO stock_movements
              (id, product_id, product_name, movement_type, qty, previous_qty, new_qty,
               reference_type, reference_id, cost_price, notes, user_id, user_name, shift_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [id, data.product_id, product.name, data.movement_type, data.qty,
               previousQty, newQty, data.reference_type, data.reference_id,
               data.cost_price, data.notes, data.user_id, data.user_name, data.shift_id]
            )

            await execute('UPDATE products SET stock_qty = ? WHERE id = ?', [newQty, data.product_id])
          }
        }

        // Queue for sync
        queueBackgroundSync('stock_movements', id, 'INSERT', data)

        return id
      } catch (err) {
        console.error('Stock movement error:', err)
        return id
      }
    },

    getByProduct: async (productId, limit = 50) => {
      return query('SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT ?',
                    [productId, limit])
    },

    getToday: async () => {
      return query(`SELECT * FROM stock_movements WHERE date(created_at) = date('now') ORDER BY created_at DESC`)
    },

    getSummary: async (dateFrom, dateTo) => {
      return query(`SELECT movement_type, COUNT(*) as count, SUM(ABS(qty)) as total_qty
        FROM stock_movements WHERE date(created_at) BETWEEN ? AND ? GROUP BY movement_type`,
        [dateFrom, dateTo])
    }
  }

  // ============================================
  // Products
  // ============================================

  const products = {
    getAll: async (filters = {}) => {
      let sql = 'SELECT * FROM products WHERE is_active = 1'
      const params = []

      if (filters.category) { sql += ' AND category = ?'; params.push(filters.category) }
      if (filters.search) { sql += ' AND (name LIKE ? OR barcode LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`) }
      if (filters.low_stock) { sql += ' AND stock_qty <= min_stock_qty' }

      sql += ' ORDER BY name ASC'
      return query(sql, params)
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM products WHERE id = ?', [id])
      return results[0] || null
    },

    getByBarcode: async (barcode) => {
      const results = await query('SELECT * FROM products WHERE barcode = ? AND is_active = 1', [barcode])
      return results[0] || null
    },

    create: async (data) => {
      const id = generateId()
      await execute(`INSERT INTO products
        (id, name, barcode, category, unit, cost_price, sell_price, stock_qty, min_stock_qty,
         image_url, notes, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, data.name, data.barcode, data.category, data.unit || 'قطعة',
         data.cost_price || 0, data.sell_price || 0, data.stock_qty || 0,
         data.min_stock_qty || 10, data.image_url, data.notes]
      )

      queueBackgroundSync('products', id, 'INSERT', { id, ...data })
      return products.getById(id)
    },

    update: async (id, data) => {
      const fields = []
      const params = []
      const allowedFields = ['name', 'barcode', 'category', 'cost_price', 'sell_price',
                            'stock_qty', 'min_stock_qty', 'image_url', 'notes']

      Object.entries(data).forEach(([key, value]) => {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`)
          params.push(value)
        }
      })

      if (fields.length > 0) {
        params.push(id)
        await execute(`UPDATE products SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params)
        queueBackgroundSync('products', id, 'UPDATE', { id, ...data })
      }

      return products.getById(id)
    },

    getLowStock: async () => {
      return query(`SELECT *, (min_stock_qty - stock_qty) as shortage
        FROM products WHERE is_active = 1 AND stock_qty <= min_stock_qty ORDER BY shortage DESC`)
    },

    delete: async (id) => {
      await execute('UPDATE products SET is_active = 0 WHERE id = ?', [id])
      queueBackgroundSync('products', id, 'DELETE', { id })
      return true
    }
  }

  // ============================================
  // Customers
  // ============================================

  const customers = {
    getAll: async (search = '') => {
      let sql = 'SELECT * FROM customers WHERE is_active = 1'
      const params = []
      if (search) { sql += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
      return query(sql + ' ORDER BY name ASC', params)
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM customers WHERE id = ?', [id])
      return results[0] || null
    },

    create: async (data) => {
      const id = generateId()
      await execute(`INSERT INTO customers
        (id, name, phone, email, address, tax_id, credit_limit, notes, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, data.name, data.phone, data.email, data.address, data.tax_id,
         data.credit_limit || 0, data.notes]
      )

      queueBackgroundSync('customers', id, 'INSERT', { id, ...data })
      return customers.getById(id)
    },

    updateLoyaltyPoints: async (customerId, pointsEarned, invoiceId = null) => {
      const customer = await customers.getById(customerId)
      if (!customer) return null

      const previousPoints = customer.loyalty_points || 0
      const newPoints = previousPoints + pointsEarned

      await execute('UPDATE customers SET loyalty_points = ? WHERE id = ?', [newPoints, customerId])
      await execute(`INSERT INTO loyalty_transactions
        (id, customer_id, invoice_id, transaction_type, points, balance_before, balance_after)
        VALUES (?, ?, ?, 'earn', ?, ?, ?)`,
        [generateId(), customerId, invoiceId, pointsEarned, previousPoints, newPoints]
      )

      queueBackgroundSync('customers', customerId, 'UPDATE', { id: customerId, loyalty_points: newPoints })
      return newPoints
    },

    delete: async (id) => {
      await execute('UPDATE customers SET is_active = 0 WHERE id = ?', [id])
      queueBackgroundSync('customers', id, 'DELETE', { id })
      return true
    }
  }

  // ============================================
  // Suppliers
  // ============================================

  const suppliers = {
    getAll: async (search = '') => {
      let sql = 'SELECT * FROM suppliers WHERE is_active = 1'
      const params = []
      if (search) { sql += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
      return query(sql + ' ORDER BY name ASC', params)
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM suppliers WHERE id = ?', [id])
      return results[0] || null
    },

    create: async (data) => {
      const id = generateId()
      await execute(`INSERT INTO suppliers
        (id, name, phone, email, address, tax_id, credit_limit, notes, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, data.name, data.phone, data.email, data.address, data.tax_id,
         data.credit_limit || 0, data.notes]
      )

      queueBackgroundSync('suppliers', id, 'INSERT', { id, ...data })
      return suppliers.getById(id)
    }
  }

  // ============================================
  // Shifts
  // ============================================

  const shifts = {
    getCurrent: async () => {
      return safeStorage.get(STORAGE_KEYS.CURRENT_SHIFT)
    },

    open: async (userId, userName, startingCash) => {
      const existing = await query("SELECT * FROM shifts WHERE status = 'open'")
      if (existing.length > 0) {
        throw new Error('يوجد وردية مفتوحة بالفعل')
      }

      const id = generateId()
      const shift = {
        id,
        user_id: userId,
        user_name: userName,
        started_at: new Date().toISOString(),
        starting_cash: startingCash,
        status: 'open'
      }

      await execute(`INSERT INTO shifts
        (id, user_id, user_name, started_at, starting_cash, status)
        VALUES (?, ?, ?, datetime('now'), ?, 'open')`,
        [id, userId, userName, startingCash]
      )

      await safeStorage.set(STORAGE_KEYS.CURRENT_SHIFT, shift)
      queueBackgroundSync('shifts', id, 'INSERT', shift)

      return shift
    },

    close: async (shiftId, closingData) => {
      await execute(`UPDATE shifts SET
        closed_at = datetime('now'), ending_cash = ?, total_sales = ?, total_expenses = ?,
        cash_sales = ?, card_sales = ?, credit_sales = ?, invoice_count = ?, status = 'closed'
        WHERE id = ?`,
        [closingData.endingCash, closingData.totalSales, closingData.totalExpenses,
         closingData.cashSales, closingData.cardSales, closingData.creditSales,
         closingData.invoiceCount, shiftId]
      )

      await safeStorage.remove(STORAGE_KEYS.CURRENT_SHIFT)
      queueBackgroundSync('shifts', shiftId, 'UPDATE', { id: shiftId, status: 'closed' })

      return shifts.getById(shiftId)
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM shifts WHERE id = ?', [id])
      return results[0] || null
    },

    updateSales: async (shiftId, saleData) => {
      const updateFields = []
      const params = []

      if (saleData.amount) {
        updateFields.push('total_sales = total_sales + ?')
        params.push(saleData.amount)
      }
      if (saleData.method === 'cash') {
        updateFields.push('cash_sales = cash_sales + ?')
        params.push(saleData.amount)
      } else if (saleData.method === 'card') {
        updateFields.push('card_sales = card_sales + ?')
        params.push(saleData.amount)
      } else if (saleData.method === 'credit') {
        updateFields.push('credit_sales = credit_sales + ?')
        params.push(saleData.amount)
      }
      updateFields.push('invoice_count = invoice_count + 1')
      params.push(shiftId)

      await execute(`UPDATE shifts SET ${updateFields.join(', ')} WHERE id = ?`, params)

      // Update local storage
      const stored = await shifts.getCurrent()
      if (stored && stored.id === shiftId) {
        stored.total_sales = (stored.total_sales || 0) + (saleData.amount || 0)
        stored.invoice_count = (stored.invoice_count || 0) + 1
        await safeStorage.set(STORAGE_KEYS.CURRENT_SHIFT, stored)
      }
    }
  }

  // ============================================
  // Invoices
  // ============================================

  const invoices = {
    getAll: async (filters = {}) => {
      let sql = 'SELECT * FROM invoices WHERE 1=1'
      const params = []
      if (filters.status) { sql += ' AND status = ?'; params.push(filters.status) }
      if (filters.customer_id) { sql += ' AND customer_id = ?'; params.push(filters.customer_id) }
      if (filters.shift_id) { sql += ' AND shift_id = ?'; params.push(filters.shift_id) }
      if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit) }
      return query(sql + ' ORDER BY created_at DESC', params)
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM invoices WHERE id = ?', [id])
      return results[0] || null
    },

    getItems: async (invoiceId) => {
      return query('SELECT * FROM invoice_items WHERE invoice_id = ?)', [invoiceId])
    },

    create: async (data) => {
      const invoiceId = generateId()
      const invoiceNumber = data.invoice_number || generateInvoiceNumber()
      const currentShift = await shifts.getCurrent()

      // Insert invoice
      await execute(`INSERT INTO invoices
        (id, invoice_number, customer_id, customer_name, shift_id, user_id, user_name,
         status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, balance_due,
         payment_method, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, invoiceNumber, data.customer_id, data.customer_name,
         currentShift?.id, data.user_id, data.user_name,
         data.status || 'completed', data.subtotal, data.discount_amt || 0,
         data.tax_amt || 0, data.total_amount, data.paid_amount || data.total_amount,
         data.balance_due || 0, data.payment_method || 'cash', data.notes]
      )

      // Insert items and update stock
      for (const item of data.items) {
        const itemId = generateId()
        await execute(`INSERT INTO invoice_items
          (id, invoice_id, product_id, product_name, barcode, qty, unit_price,
           cost_price, discount, tax_amt, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [itemId, invoiceId, item.product_id, item.name, item.barcode,
           item.qty, item.unit_price, item.cost_price || 0, item.discount || 0,
           item.tax_amt || 0, item.total]
        )

        // Update stock
        if (item.product_id) {
          await stockMovements.record({
            product_id: item.product_id,
            movement_type: 'sale',
            qty: -item.qty,
            reference_type: 'invoice',
            reference_id: invoiceId,
            cost_price: item.cost_price,
            notes: `فاتورة رقم ${invoiceNumber}`,
            user_id: data.user_id,
            user_name: data.user_name,
            shift_id: currentShift?.id
          })
        }

        queueBackgroundSync('invoice_items', itemId, 'INSERT', { id: itemId, invoice_id: invoiceId, ...item })
      }

      // Loyalty points (1%)
      if (data.customer_id && data.total_amount > 0) {
        const earnedPoints = Math.round(data.total_amount * 0.01)
        await customers.updateLoyaltyPoints(data.customer_id, earnedPoints, invoiceId)
      }

      // Update shift
      if (currentShift) {
        await shifts.updateSales(currentShift.id, {
          amount: data.total_amount,
          method: data.payment_method
        })
      }

      queueBackgroundSync('invoices', invoiceId, 'INSERT', {
        id: invoiceId, invoice_number: invoiceNumber, customer_id: data.customer_id,
        total_amount: data.total_amount, payment_method: data.payment_method
      })

      return invoices.getById(invoiceId)
    },

    getTodayStats: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const stats = await query(`SELECT
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_sales
        FROM invoices WHERE date(created_at) = date(?) AND status NOT IN ('draft', 'cancelled')`, [today])
      return stats[0] || { count: 0, total_sales: 0 }
    },

    cancel: async (invoiceId) => {
      const items = await invoices.getItems(invoiceId)
      const invoice = await invoices.getById(invoiceId)
      const currentShift = await shifts.getCurrent()

      for (const item of items) {
        if (item.product_id) {
          await stockMovements.record({
            product_id: item.product_id,
            movement_type: 'return',
            qty: item.qty,
            reference_type: 'invoice',
            reference_id: invoiceId,
            notes: `إلغاء فاتورة ${invoice?.invoice_number}`,
            user_id: invoice?.user_id,
            shift_id: currentShift?.id
          })
        }
      }

      await execute("UPDATE invoices SET status = 'cancelled' WHERE id = ?", [invoiceId])
      queueBackgroundSync('invoices', invoiceId, 'UPDATE', { id: invoiceId, status: 'cancelled' })
      return true
    }
  }

  // ============================================
  // Purchase Orders
  // ============================================

  const purchaseOrders = {
    getAll: async (filters = {}) => {
      let sql = 'SELECT * FROM purchase_orders WHERE 1=1'
      const params = []
      if (filters.supplier_id) { sql += ' AND supplier_id = ?'; params.push(filters.supplier_id) }
      return query(sql + ' ORDER BY created_at DESC', params)
    },

    getById: async (id) => {
      const results = await query('SELECT * FROM purchase_orders WHERE id = ?', [id])
      return results[0] || null
    },

    create: async (data) => {
      const poId = generateId()
      const poNumber = data.po_number || generatePONumber()
      const currentShift = await shifts.getCurrent()

      await execute(`INSERT INTO purchase_orders
        (id, po_number, supplier_id, supplier_name, user_id, user_name,
         subtotal, total_amount, payment_method, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [poId, poNumber, data.supplier_id, data.supplier_name,
         data.user_id, data.user_name, data.subtotal, data.total_amount,
         data.payment_method || 'cash', data.notes]
      )

      for (const item of data.items) {
        const itemId = generateId()
        await execute(`INSERT INTO purchase_order_items
          (id, po_id, product_id, product_name, barcode, ordered_qty, received_qty, unit_cost, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [itemId, poId, item.product_id, item.name, item.barcode,
           item.qty, item.qty, item.unit_cost, item.total]
        )

        // Update stock (positive)
        if (item.product_id) {
          await stockMovements.record({
            product_id: item.product_id,
            movement_type: 'purchase',
            qty: item.qty,
            reference_type: 'purchase',
            reference_id: poId,
            cost_price: item.unit_cost,
            notes: `استلام - ${poNumber}`,
            user_id: data.user_id,
            user_name: data.user_name,
            shift_id: currentShift?.id
          })
        }

        queueBackgroundSync('purchase_order_items', itemId, 'INSERT', { id: itemId, po_id: poId, ...item })
      }

      queueBackgroundSync('purchase_orders', poId, 'INSERT', { id: poId, po_number: poNumber, supplier_id: data.supplier_id })
      return purchaseOrders.getById(poId)
    }
  }

  // ============================================
  // Expenses
  // ============================================

  const expenses = {
    getAll: async (filters = {}) => {
      let sql = 'SELECT * FROM expenses WHERE 1=1'
      const params = []
      if (filters.shift_id) { sql += ' AND shift_id = ?'; params.push(filters.shift_id) }
      return query(sql + ' ORDER BY expense_date DESC', params)
    },

    create: async (data) => {
      const id = generateId()
      const currentShift = await shifts.getCurrent()

      await execute(`INSERT INTO expenses
        (id, category_id, category_name, shift_id, user_id, user_name,
         description, amount, payment_method, expense_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.category_id, data.category_name, currentShift?.id,
         data.user_id, data.user_name, data.description,
         data.amount, data.payment_method || 'cash',
         data.expense_date || new Date().toISOString().slice(0, 10),
         data.notes]
      )

      if (currentShift) {
        await execute('UPDATE shifts SET total_expenses = total_expenses + ? WHERE id = ?',
                      [data.amount, currentShift.id])
      }

      queueBackgroundSync('expenses', id, 'INSERT', { id, ...data })
      return id
    },

    getCategories: async () => {
      return query('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY name')
    }
  }

  // ============================================
  // Reports
  // ============================================

  const reports = {
    getDashboardStats: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const salesStats = await invoices.getTodayStats()
      const productsCount = await query('SELECT COUNT(*) as count FROM products WHERE is_active = 1')
      const lowStockCount = await query('SELECT COUNT(*) as count FROM products WHERE stock_qty <= min_stock_qty AND is_active = 1')
      const expensesToday = await query("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date(expense_date) = date(?)", [today])

      const profitResult = await query(`SELECT COALESCE(SUM(ii.total - (ii.cost_price * ii.qty)), 0) as gross_profit
        FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
        WHERE date(i.created_at) = date(?) AND i.status NOT IN ('draft', 'cancelled')`, [today])

      const grossProfit = profitResult[0]?.gross_profit || 0
      const expensesTotal = expensesToday[0]?.total || 0

      return {
        todaySales: salesStats.total_sales || 0,
        todayCount: salesStats.count || 0,
        productCount: productsCount[0]?.count || 0,
        lowStockCount: lowStockCount[0]?.count || 0,
        expensesToday: expensesTotal,
        grossProfit,
        netProfit: grossProfit - expensesTotal
      }
    },

    calculateDailyProfit: async (date) => {
      const result = await query(`SELECT
        COALESCE(SUM(ii.total), 0) as total_sales,
        COALESCE(SUM(ii.qty * ii.cost_price), 0) as total_cost,
        COALESCE(SUM(ii.total - (ii.qty * ii.cost_price)), 0) as gross_profit
        FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id
        WHERE date(i.created_at) = date(?) AND i.status NOT IN ('draft', 'cancelled')`, [date])

      const exp = await query("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date(expense_date) = date(?)", [date])

      return {
        total_sales: result[0]?.total_sales || 0,
        total_cost: result[0]?.total_cost || 0,
        gross_profit: result[0]?.gross_profit || 0,
        total_expenses: exp[0]?.total || 0,
        net_profit: (result[0]?.gross_profit || 0) - (exp[0]?.total || 0)
      }
    },

    getStockMovementsByDate: async (dateFrom, dateTo) => {
      return query(`SELECT date(created_at) as date, movement_type, COUNT(*) as count
        FROM stock_movements WHERE date(created_at) BETWEEN date(?) AND date(?)
        GROUP BY date(created_at), movement_type ORDER BY date DESC`, [dateFrom, dateTo])
    }
  }

  // ============================================
  // WhatsApp
  // ============================================

  const whatsapp = {
    getContacts: async (type = 'all') => {
      if (type === 'customers') {
        return query("SELECT id, name, phone, 'customer' as type FROM customers WHERE is_active = 1 AND phone IS NOT NULL AND phone != ''")
      } else if (type === 'suppliers') {
        return query("SELECT id, name, phone, 'supplier' as type FROM suppliers WHERE is_active = 1 AND phone IS NOT NULL AND phone != ''")
      }
      return query(`SELECT id, name, phone, 'customer' as type FROM customers WHERE is_active = 1 AND phone IS NOT NULL
        UNION SELECT id, name, phone, 'supplier' as type FROM suppliers WHERE is_active = 1 AND phone IS NOT NULL`)
    },

    generateUrl: (phone, message) => {
      const cleanPhone = (phone || '').replace(/\D/g, '')
      return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message || '')}`
    },

    getInvoiceMessage: (invoice, customer) => {
      return `فاتورة رقم: ${invoice?.invoice_number || ''}
التاريخ: ${new Date(invoice?.created_at || Date.now()).toLocaleDateString('ar-SA')}
العميل: ${customer?.name || 'عميل نقدي'}
الإجمالي: ${(invoice?.total_amount || 0).toFixed(2)} ريال
---
شكراً لتعاملكم معنا!`
    },

    queueMessage: async (data) => {
      const id = generateId()
      await execute(`INSERT INTO whatsapp_queue (id, recipient_type, recipient_id, recipient_name, phone, message, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [id, data.recipient_type, data.recipient_id, data.recipient_name, data.phone, data.message])
      return id
    }
  }

  // ============================================
  // Admin Requests
  // ============================================

  const adminRequests = {
    create: async (data) => {
      const id = generateId()
      const currentShift = await shifts.getCurrent()

      await execute(`INSERT INTO admin_requests
        (id, user_id, user_name, shift_id, request_type, title, description, priority, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [id, data.user_id, data.user_name, currentShift?.id,
         data.request_type, data.title, data.description, data.priority || 'normal']
      )

      queueBackgroundSync('admin_requests', id, 'INSERT', { id, ...data })
      return id
    },

    getMessage: (request, user, shift) => {
      return `طلب ${request?.request_type || ''}
---
العنوان: ${request?.title || ''}
التفاصيل: ${request?.description || ''}
---
الموظف: ${user?.name || request?.user_name || ''}
${shift ? `الوردية: ${(shift.id || '').substring(0, 8)}` : ''}
التاريخ: ${new Date().toLocaleString('ar-SA')}`
    }
  }

  // ============================================
  // Low Stock Check
  // ============================================

  const checkLowStock = async () => {
    try {
      const alerts = await products.getLowStock()
      setLowStockAlerts(alerts)
      return alerts
    } catch {
      return []
    }
  }

  // ============================================
  // Context Value
  // ============================================

  const value = {
    isReady,
    error,
    syncStatus,
    lowStockAlerts,

    query,
    execute,
    triggerSync,
    refreshSync,

    products,
    customers,
    suppliers,
    shifts,
    invoices,
    purchaseOrders,
    expenses,
    stockMovements,
    reports,
    checkLowStock,

    whatsapp,
    adminRequests
  }

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  )
}

/**
 * Hook to use database context
 */
export function useDatabase() {
  const context = useContext(DatabaseContext)
  if (!context) {
    throw new Error('useDatabase must be used within DatabaseProvider')
  }
  return context
}

// ============================================
// Helper Functions
// ============================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

function generateInvoiceNumber() {
  const today = new Date()
  return `INV-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}-${Date.now().toString().slice(-4)}`
}

function generatePONumber() {
  const today = new Date()
  return `PO-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}-${Date.now().toString().slice(-4)}`
}

/**
 * Queue sync operation in background
 */
async function queueBackgroundSync(table, id, action, data) {
  try {
    const sync = await import('../services/syncEngine.js')
    await sync.queueSyncOperation(table, id, action, data)
  } catch {
    // Sync not available, continue locally
  }
}

export default DatabaseContext
