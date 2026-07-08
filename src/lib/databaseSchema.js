/**
 * Database Schema for ERP System
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
 * مخطط قاعدة البيانات الكامل لنظام ERP
 * متوافق مع Capacitor SQLite
 */

// SQL DDL Statements
export const DATABASE_SCHEMA = `
-- ============================================
-- Products Table (المنتجات)
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  category TEXT,
  unit TEXT DEFAULT 'قطعة',
  cost_price REAL DEFAULT 0,
  sell_price REAL DEFAULT 0,
  stock_qty REAL DEFAULT 0,
  min_stock_qty REAL DEFAULT 10,
  is_active INTEGER DEFAULT 1,
  image_url TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- ============================================
-- Customers Table (العملاء)
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_id TEXT,
  credit_limit REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  loyalty_points INTEGER DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ============================================
-- Suppliers Table (الموردين)
-- ============================================
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_id TEXT,
  credit_limit REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Shifts Table (الورديات)
-- ============================================
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  closed_at TEXT,
  starting_cash REAL DEFAULT 0,
  ending_cash REAL,
  total_sales REAL DEFAULT 0,
  total_refunds REAL DEFAULT 0,
  total_expenses REAL DEFAULT 0,
  cash_sales REAL DEFAULT 0,
  card_sales REAL DEFAULT 0,
  credit_sales REAL DEFAULT 0,
  invoice_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);

-- ============================================
-- Invoices Table (الفواتير)
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id TEXT,
  customer_name TEXT,
  shift_id TEXT,
  user_id TEXT,
  user_name TEXT,
  status TEXT DEFAULT 'completed',
  subtotal REAL DEFAULT 0,
  discount_amt REAL DEFAULT 0,
  discount_percent REAL DEFAULT 0,
  tax_rate REAL DEFAULT 15,
  tax_amt REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  balance_due REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_details TEXT,
  qr_code TEXT,
  zatca_number TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ============================================
-- Invoice Items Table (عناصر الفواتير)
-- ============================================
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  barcode TEXT,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  cost_price REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax_amt REAL DEFAULT 0,
  total REAL NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id);

-- ============================================
-- Purchase Orders Table (أوامر الشراء/الاستلام)
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id TEXT,
  supplier_name TEXT,
  user_id TEXT,
  user_name TEXT,
  status TEXT DEFAULT 'received',
  subtotal REAL DEFAULT 0,
  discount_amt REAL DEFAULT 0,
  tax_amt REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);

-- ============================================
-- Purchase Order Items Table
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  barcode TEXT,
  qty REAL NOT NULL,
  unit_cost REAL NOT NULL,
  total REAL NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);

-- ============================================
-- Expenses Table (المصروفات)
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  category_name TEXT,
  shift_id TEXT,
  user_id TEXT,
  user_name TEXT,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  receipt_url TEXT,
  expense_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

-- ============================================
-- Expense Categories Table
-- ============================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Users Table (المستخدمون)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'cashier',
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  last_login TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Inventory Adjustments Table (تسوية المخزون)
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT,
  previous_qty REAL NOT NULL,
  new_qty REAL NOT NULL,
  adjustment_qty REAL NOT NULL,
  reason TEXT,
  user_id TEXT,
  user_name TEXT,
  shift_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_adj_product ON inventory_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_adj_date ON inventory_adjustments(created_at);

-- ============================================
-- WhatsApp Messages Queue
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_queue (
  id TEXT PRIMARY KEY,
  recipient_type TEXT DEFAULT 'customer',
  recipient_id TEXT,
  recipient_name TEXT,
  phone TEXT NOT NULL,
  message TEXT,
  template_type TEXT,
  template_data TEXT,
  status TEXT DEFAULT 'pending',
  sent_at TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_status ON whatsapp_queue(status);

-- ============================================
-- Admin Requests Table (طلبات الإدارة)
-- ============================================
CREATE TABLE IF NOT EXISTS admin_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  shift_id TEXT,
  request_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'pending',
  admin_notes TEXT,
  whatsapp_sent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_requests_status ON admin_requests(status);
CREATE INDEX IF NOT EXISTS idx_admin_requests_user ON admin_requests(user_id);

-- ============================================
-- Loyalty Transactions (حركة نقاط الولاء)
-- ============================================
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  invoice_id TEXT,
  points INTEGER NOT NULL,
  balance_after INTEGER,
  description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_transactions(customer_id);

-- ============================================
-- Sync Queue (للمزامنة مع السيرفر)
-- ============================================
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  data TEXT,
  synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue(synced);
`;

// Default expense categories
export const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'cat-001', name: 'رواتب وأجور', description: 'رواتب الموظفين' },
  { id: 'cat-002', name: 'إيجارات', description: 'إيجار المحل والمستودعات' },
  { id: 'cat-003', name: 'فواتير كهرباء وماء', description: 'فواتير الخدمات' },
  { id: 'cat-004', name: 'صيانة وقطع غيار', description: 'صيانة المعدات والأجهزة' },
  { id: 'cat-005', name: 'نثريات', description: 'مصاريف نثرية' },
  { id: 'cat-006', name: 'مشتريات مكتبية', description: 'قرطاسية ومستلزمات مكتبية' },
  { id: 'cat-007', name: 'نقل ومواصلات', description: 'مصاريف الشحن والتوصيل' },
  { id: 'cat-008', name: 'أخرى', description: 'مصاريف أخرى' }
];

// Insert default expense categories
export const INSERT_DEFAULT_CATEGORIES = DEFAULT_EXPENSE_CATEGORIES.map(cat =>
  `INSERT OR IGNORE INTO expense_categories (id, name, description, is_active, created_at)
   VALUES ('${cat.id}', '${cat.name}', '${cat.description}', 1, datetime('now'));`
).join('\n');

export default {
  DATABASE_SCHEMA,
  DEFAULT_EXPENSE_CATEGORIES,
  INSERT_DEFAULT_CATEGORIES
};
