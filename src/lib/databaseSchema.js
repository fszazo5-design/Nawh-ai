/**
 * Unified Database Schema for ERP System
 * =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
 * مخطط قاعدة بيانات موحد لـ Neon Postgres و Capacitor SQLite
 * يتضمن العلاقات والـ Triggers والـ Constraints
 */

// ============================================
// SQLite Schema (للتشغيل المحلي)
// ============================================
export const SQLITE_SCHEMA = `
-- Products Table (المنتجات)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  barcode TEXT UNIQUE,
  sku TEXT,
  category TEXT,
  brand TEXT,
  unit TEXT DEFAULT 'قطعة',
  cost_price REAL DEFAULT 0,
  sell_price REAL DEFAULT 0,
  wholesale_price REAL DEFAULT 0,
  stock_qty REAL DEFAULT 0,
  min_stock_qty REAL DEFAULT 10,
  max_stock_qty REAL DEFAULT 1000,
  is_active INTEGER DEFAULT 1,
  image_url TEXT,
  notes TEXT,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_sync ON products(sync_status);

-- Stock Movements Table (حركات المخزون)
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('sale', 'purchase', 'adjustment', 'damage', 'return', 'transfer')),
  qty REAL NOT NULL,
  previous_qty REAL NOT NULL,
  new_qty REAL NOT NULL,
  reference_type TEXT CHECK (reference_type IN ('invoice', 'purchase', 'adjustment', 'return')),
  reference_id TEXT,
  reference_number TEXT,
  cost_price REAL,
  total_cost REAL,
  notes TEXT,
  user_id TEXT,
  user_name TEXT,
  shift_id TEXT,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_date ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_reference ON stock_movements(reference_id);

-- Customers Table (العملاء)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  phone TEXT,
  phone2 TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  tax_id TEXT,
  credit_limit REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  loyalty_points INTEGER DEFAULT 0,
  total_purchases REAL DEFAULT 0,
  last_purchase_date TEXT,
  whatsapp_opt_in INTEGER DEFAULT 1,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_sync ON customers(sync_status);

-- Suppliers Table (الموردين)
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  phone TEXT,
  phone2 TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  tax_id TEXT,
  contact_person TEXT,
  credit_limit REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  total_purchases REAL DEFAULT 0,
  last_purchase_date TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(phone);

-- Shifts Table (الورديات)
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  closed_at TEXT,
  starting_cash REAL DEFAULT 0,
  ending_cash REAL,
  expected_cash REAL,
  cash_variance REAL DEFAULT 0,
  total_sales REAL DEFAULT 0,
  total_refunds REAL DEFAULT 0,
  total_expenses REAL DEFAULT 0,
  total_discounts REAL DEFAULT 0,
  cash_sales REAL DEFAULT 0,
  card_sales REAL DEFAULT 0,
  credit_sales REAL DEFAULT 0,
  transfer_sales REAL DEFAULT 0,
  invoice_count INTEGER DEFAULT 0,
  refund_count INTEGER DEFAULT 0,
  expense_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'suspended')),
  notes TEXT,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(started_at);

-- Invoices Table (الفواتير)
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_type TEXT DEFAULT 'sale' CHECK (invoice_type IN ('sale', 'refund', 'quote')),
  customer_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  supplier_id TEXT,
  supplier_name TEXT,
  shift_id TEXT,
  user_id TEXT,
  user_name TEXT,
  status TEXT DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled', 'refunded', 'pending')),
  subtotal REAL DEFAULT 0,
  discount_amt REAL DEFAULT 0,
  discount_percent REAL DEFAULT 0,
  discount_type TEXT DEFAULT 'fixed',
  tax_rate REAL DEFAULT 15,
  tax_amt REAL DEFAULT 0,
  tax_exclusive INTEGER DEFAULT 0,
  total_amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  balance_due REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_methods TEXT,
  card_type TEXT,
  card_last_four TEXT,
  reference_number TEXT,
  qr_code TEXT,
  zatca_number TEXT,
  zatca_status TEXT,
  invoice_datetime TEXT,
  notes TEXT,
  internal_notes TEXT,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_sync ON invoices(sync_status);

-- Invoice Items Table (عناصر الفواتير)
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  barcode TEXT,
  sku TEXT,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  cost_price REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  discount_percent REAL DEFAULT 0,
  tax_rate REAL DEFAULT 15,
  tax_amt REAL DEFAULT 0,
  total REAL NOT NULL,
  profit REAL DEFAULT 0,
  notes TEXT,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id);

-- Purchase Orders Table (أوامر الشراء)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id TEXT,
  supplier_name TEXT,
  user_id TEXT,
  user_name TEXT,
  shift_id TEXT,
  status TEXT DEFAULT 'received' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled', 'partial')),
  order_date TEXT,
  expected_date TEXT,
  received_date TEXT,
  subtotal REAL DEFAULT 0,
  discount_amt REAL DEFAULT 0,
  tax_amt REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  balance_due REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'pending',
  notes TEXT,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

-- Purchase Order Items Table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  barcode TEXT,
  ordered_qty REAL NOT NULL,
  received_qty REAL NOT NULL,
  unit_cost REAL NOT NULL,
  total REAL NOT NULL,
  expiry_date TEXT,
  batch_number TEXT,
  notes TEXT,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);

-- Expenses Table (المصروفات)
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
  is_recurring INTEGER DEFAULT 0,
  recurring_frequency TEXT,
  approved_by TEXT,
  approved_at TEXT,
  notes TEXT,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_shift ON expenses(shift_id);

-- Expense Categories Table
CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  name_en TEXT,
  description TEXT,
  budget REAL DEFAULT 0,
  used REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  parent_id TEXT,
  display_order INTEGER DEFAULT 0,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Users Table (المستخدمون)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'cashier' CHECK (role IN ('admin', 'manager', 'cashier', 'inventory')),
  phone TEXT,
  pin_code TEXT,
  is_active INTEGER DEFAULT 1,
  permissions TEXT,
  last_login TEXT,
  last_shift_id TEXT,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Loyalty Transactions (حركة نقاط الولاء)
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  invoice_id TEXT,
  transaction_type TEXT DEFAULT 'earn' CHECK (transaction_type IN ('earn', 'redeem', 'adjustment', 'expired')),
  points INTEGER NOT NULL,
  points_value REAL,
  balance_before INTEGER,
  balance_after INTEGER,
  description TEXT,
  expiry_date TEXT,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_transactions(customer_id);

-- WhatsApp Messages Queue
CREATE TABLE IF NOT EXISTS whatsapp_queue (
  id TEXT PRIMARY KEY,
  recipient_type TEXT DEFAULT 'customer' CHECK (recipient_type IN ('customer', 'supplier', 'admin', 'other')),
  recipient_id TEXT,
  recipient_name TEXT,
  phone TEXT NOT NULL,
  message TEXT,
  template_type TEXT,
  template_data TEXT,
  media_url TEXT,
  media_type TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'read')),
  sent_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  error_message TEXT,
  whatsapp_message_id TEXT,
  retry_count INTEGER DEFAULT 0,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_status ON whatsapp_queue(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_recipient ON whatsapp_queue(recipient_id);

-- Admin Requests Table (طلبات الإدارة)
CREATE TABLE IF NOT EXISTS admin_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  shift_id TEXT,
  request_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'in_progress', 'completed')),
  admin_notes TEXT,
  approved_by TEXT,
  approved_at TEXT,
  completed_by TEXT,
  completed_at TEXT,
  whatsapp_sent INTEGER DEFAULT 0,
  whatsapp_message_id TEXT,
  cloud_id TEXT,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_requests_status ON admin_requests(status);
CREATE INDEX IF NOT EXISTS idx_admin_requests_user ON admin_requests(user_id);

-- Sync Queue (للمزامنة مع السيرفر)
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  data TEXT,
  sync_attempts INTEGER DEFAULT 0,
  synced INTEGER DEFAULT 0,
  synced_at TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue(synced);
CREATE INDEX IF NOT EXISTS idx_sync_table ON sync_queue(table_name);

-- Sync metadata
CREATE TABLE IF NOT EXISTS sync_metadata (
  id TEXT PRIMARY KEY,
  table_name TEXT UNIQUE NOT NULL,
  last_sync TEXT,
  last_record_id TEXT,
  sync_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Product low stock view (للتحقق السريع)
CREATE VIEW IF NOT EXISTS v_low_stock AS
SELECT
  id, name, barcode, stock_qty, min_stock_qty,
  (min_stock_qty - stock_qty) as shortage,
  (min_stock_qty - stock_qty) * cost_price as shortage_cost
FROM products
WHERE is_active = 1 AND stock_qty <= min_stock_qty
ORDER BY shortage DESC;

-- Daily sales summary view
CREATE VIEW IF NOT EXISTS v_daily_sales AS
SELECT
  date(created_at) as sale_date,
  COUNT(*) as invoice_count,
  SUM(total_amount) as total_sales,
  SUM(paid_amount) as total_paid,
  SUM(balance_due) as total_balance,
  SUM(case when payment_method = 'cash' then total_amount else 0 end) as cash_sales,
  SUM(case when payment_method = 'card' then total_amount else 0 end) as card_sales,
  SUM(case when payment_method = 'credit' then total_amount else 0 end) as credit_sales
FROM invoices
WHERE status NOT IN ('draft', 'cancelled')
GROUP BY date(created_at);
`;

// ============================================
// Neon Postgres Schema (للسحاب)
// ============================================
export const NEON_SCHEMA = `
-- Products Table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  barcode TEXT UNIQUE,
  sku TEXT,
  category TEXT,
  brand TEXT,
  unit TEXT DEFAULT 'قطعة',
  cost_price DECIMAL(15,4) DEFAULT 0,
  sell_price DECIMAL(15,4) DEFAULT 0,
  wholesale_price DECIMAL(15,4) DEFAULT 0,
  stock_qty DECIMAL(15,4) DEFAULT 0,
  min_stock_qty DECIMAL(15,4) DEFAULT 10,
  max_stock_qty DECIMAL(15,4) DEFAULT 1000,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Stock Movements Table
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('sale', 'purchase', 'adjustment', 'damage', 'return', 'transfer')),
  qty DECIMAL(15,4) NOT NULL,
  previous_qty DECIMAL(15,4) NOT NULL,
  new_qty DECIMAL(15,4) NOT NULL,
  reference_type TEXT CHECK (reference_type IN ('invoice', 'purchase', 'adjustment', 'return')),
  reference_id UUID,
  reference_number TEXT,
  cost_price DECIMAL(15,4),
  total_cost DECIMAL(15,4),
  notes TEXT,
  user_id UUID,
  user_name TEXT,
  shift_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_date ON stock_movements(created_at);

-- Trigger to auto-update product stock_qty
CREATE OR REPLACE FUNCTION update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET stock_qty = NEW.new_qty,
      updated_at = NOW()
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_product_stock ON stock_movements;
CREATE TRIGGER trg_update_product_stock
AFTER INSERT ON stock_movements
FOR EACH ROW
EXECUTE FUNCTION update_product_stock();

-- Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  phone TEXT,
  phone2 TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  tax_id TEXT,
  credit_limit DECIMAL(15,4) DEFAULT 0,
  current_balance DECIMAL(15,4) DEFAULT 0,
  loyalty_points INTEGER DEFAULT 0,
  total_purchases DECIMAL(15,4) DEFAULT 0,
  last_purchase_date TIMESTAMPTZ,
  whatsapp_opt_in BOOLEAN DEFAULT true,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT,
  phone TEXT,
  phone2 TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  tax_id TEXT,
  contact_person TEXT,
  credit_limit DECIMAL(15,4) DEFAULT 0,
  current_balance DECIMAL(15,4) DEFAULT 0,
  total_purchases DECIMAL(15,4) DEFAULT 0,
  last_purchase_date TIMESTAMPTZ,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shifts Table
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  starting_cash DECIMAL(15,4) DEFAULT 0,
  ending_cash DECIMAL(15,4),
  expected_cash DECIMAL(15,4),
  cash_variance DECIMAL(15,4) DEFAULT 0,
  total_sales DECIMAL(15,4) DEFAULT 0,
  total_refunds DECIMAL(15,4) DEFAULT 0,
  total_expenses DECIMAL(15,4) DEFAULT 0,
  total_discounts DECIMAL(15,4) DEFAULT 0,
  cash_sales DECIMAL(15,4) DEFAULT 0,
  card_sales DECIMAL(15,4) DEFAULT 0,
  credit_sales DECIMAL(15,4) DEFAULT 0,
  transfer_sales DECIMAL(15,4) DEFAULT 0,
  invoice_count INTEGER DEFAULT 0,
  refund_count INTEGER DEFAULT 0,
  expense_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'suspended')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_type TEXT DEFAULT 'sale' CHECK (invoice_type IN ('sale', 'refund', 'quote')),
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  supplier_id UUID REFERENCES suppliers(id),
  supplier_name TEXT,
  shift_id UUID REFERENCES shifts(id),
  user_id UUID,
  user_name TEXT,
  status TEXT DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled', 'refunded', 'pending')),
  subtotal DECIMAL(15,4) DEFAULT 0,
  discount_amt DECIMAL(15,4) DEFAULT 0,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  discount_type TEXT DEFAULT 'fixed',
  tax_rate DECIMAL(5,2) DEFAULT 15,
  tax_amt DECIMAL(15,4) DEFAULT 0,
  tax_exclusive BOOLEAN DEFAULT false,
  total_amount DECIMAL(15,4) DEFAULT 0,
  paid_amount DECIMAL(15,4) DEFAULT 0,
  balance_due DECIMAL(15,4) DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_methods JSONB,
  card_type TEXT,
  card_last_four TEXT,
  reference_number TEXT,
  qr_code TEXT,
  zatca_number TEXT,
  zatca_status TEXT,
  invoice_datetime TIMESTAMPTZ,
  notes TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  today_prefix TEXT;
  day_count INTEGER;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    today_prefix := 'INV-' || TO_CHAR(NOW(), 'YYYYMMDD');
    SELECT COUNT(*) INTO day_count FROM invoices WHERE invoice_number LIKE today_prefix || '%';
    NEW.invoice_number := today_prefix || '-' || LPAD((day_count + 1)::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_invoice_number ON invoices;
CREATE TRIGGER trg_generate_invoice_number
BEFORE INSERT ON invoices
FOR EACH ROW
EXECUTE FUNCTION generate_invoice_number();

-- Invoice Items Table
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  barcode TEXT,
  sku TEXT,
  qty DECIMAL(15,4) NOT NULL,
  unit_price DECIMAL(15,4) NOT NULL,
  cost_price DECIMAL(15,4) DEFAULT 0,
  discount DECIMAL(15,4) DEFAULT 0,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 15,
  tax_amt DECIMAL(15,4) DEFAULT 0,
  total DECIMAL(15,4) NOT NULL,
  profit DECIMAL(15,4) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to create stock_movement on invoice_item insert
CREATE OR REPLACE FUNCTION create_stock_movement_sale()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    INSERT INTO stock_movements (product_id, product_name, movement_type, qty, previous_qty, new_qty, reference_type, reference_id, cost_price, total_cost)
    SELECT
      NEW.product_id,
      NEW.product_name,
      'sale',
      -NEW.qty,
      p.stock_qty,
      p.stock_qty - NEW.qty,
      'invoice',
      NEW.invoice_id,
      NEW.cost_price,
      NEW.cost_price * NEW.qty
    FROM products p WHERE p.id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_movement_sale ON invoice_items;
CREATE TRIGGER trg_stock_movement_sale
AFTER INSERT ON invoice_items
FOR EACH ROW
EXECUTE FUNCTION create_stock_movement_sale();

-- Purchase Orders Table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT NOT NULL UNIQUE,
  supplier_id UUID REFERENCES suppliers(id),
  supplier_name TEXT,
  user_id UUID,
  user_name TEXT,
  shift_id UUID REFERENCES shifts(id),
  status TEXT DEFAULT 'received' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled', 'partial')),
  order_date DATE,
  expected_date DATE,
  received_date DATE,
  subtotal DECIMAL(15,4) DEFAULT 0,
  discount_amt DECIMAL(15,4) DEFAULT 0,
  tax_amt DECIMAL(15,4) DEFAULT 0,
  total_amount DECIMAL(15,4) DEFAULT 0,
  paid_amount DECIMAL(15,4) DEFAULT 0,
  balance_due DECIMAL(15,4) DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase Order Items Table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  barcode TEXT,
  ordered_qty DECIMAL(15,4) NOT NULL,
  received_qty DECIMAL(15,4) NOT NULL,
  unit_cost DECIMAL(15,4) NOT NULL,
  total DECIMAL(15,4) NOT NULL,
  expiry_date DATE,
  batch_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for purchase stock movement
CREATE OR REPLACE FUNCTION create_stock_movement_purchase()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    INSERT INTO stock_movements (product_id, product_name, movement_type, qty, previous_qty, new_qty, reference_type, reference_id, cost_price, total_cost)
    SELECT
      NEW.product_id,
      NEW.product_name,
      'purchase',
      NEW.received_qty,
      p.stock_qty,
      p.stock_qty + NEW.received_qty,
      'purchase',
      NEW.po_id,
      NEW.unit_cost,
      NEW.unit_cost * NEW.received_qty
    FROM products p WHERE p.id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_movement_purchase ON purchase_order_items;
CREATE TRIGGER trg_stock_movement_purchase
AFTER INSERT ON purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION create_stock_movement_purchase();

-- Expenses Table
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID,
  category_name TEXT,
  shift_id UUID REFERENCES shifts(id),
  user_id UUID,
  user_name TEXT,
  description TEXT NOT NULL,
  amount DECIMAL(15,4) NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  receipt_url TEXT,
  expense_date DATE NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  recurring_frequency TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expense Categories Table
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  name_en TEXT,
  description TEXT,
  budget DECIMAL(15,4) DEFAULT 0,
  used DECIMAL(15,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  parent_id UUID,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'cashier' CHECK (role IN ('admin', 'manager', 'cashier', 'inventory')),
  phone TEXT,
  pin_code TEXT,
  is_active BOOLEAN DEFAULT true,
  permissions JSONB,
  last_login TIMESTAMPTZ,
  last_shift_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loyalty Transactions
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_id UUID REFERENCES invoices(id),
  transaction_type TEXT DEFAULT 'earn' CHECK (transaction_type IN ('earn', 'redeem', 'adjustment', 'expired')),
  points INTEGER NOT NULL,
  points_value DECIMAL(15,4),
  balance_before INTEGER,
  balance_after INTEGER,
  description TEXT,
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsApp Queue
CREATE TABLE IF NOT EXISTS whatsapp_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type TEXT DEFAULT 'customer' CHECK (recipient_type IN ('customer', 'supplier', 'admin', 'other')),
  recipient_id UUID,
  recipient_name TEXT,
  phone TEXT NOT NULL,
  message TEXT,
  template_type TEXT,
  template_data JSONB,
  media_url TEXT,
  media_type TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'read')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT,
  whatsapp_message_id TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin Requests
CREATE TABLE IF NOT EXISTS admin_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_name TEXT,
  shift_id UUID,
  request_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'in_progress', 'completed')),
  admin_notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  completed_by UUID,
  completed_at TIMESTAMPTZ,
  whatsapp_sent BOOLEAN DEFAULT false,
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Low Stock Alert Function
CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TABLE(id UUID, name TEXT, barcode TEXT, stock_qty DECIMAL(15,4), min_stock_qty DECIMAL(15,4)) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.barcode, p.stock_qty, p.min_stock_qty
  FROM products p
  WHERE p.is_active = true AND p.stock_qty <= p.min_stock_qty
  ORDER BY (p.min_stock_qty - p.stock_qty) DESC;
END;
$$ LANGUAGE plpgsql;

-- Daily Profit Calculation Function
CREATE OR REPLACE FUNCTION calculate_daily_profit(p_date DATE)
RETURNS TABLE(
  total_sales DECIMAL(15,4),
  total_cost DECIMAL(15,4),
  gross_profit DECIMAL(15,4),
  total_expenses DECIMAL(15,4),
  net_profit DECIMAL(15,4)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(ii.total), 0) as total_sales,
    COALESCE(SUM(ii.qty * ii.cost_price), 0) as total_cost,
    COALESCE(SUM(ii.total - (ii.qty * ii.cost_price)), 0) as gross_profit,
    COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date = p_date), 0) as total_expenses,
    COALESCE(SUM(ii.total - (ii.qty * ii.cost_price)), 0) -
    COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date = p_date), 0) as net_profit
  FROM invoice_items ii
  JOIN invoices i ON ii.invoice_id = i.id
  WHERE DATE(i.created_at) = p_date
  AND i.status NOT IN ('draft', 'cancelled');
END;
$$ LANGUAGE plpgsql;

-- Insert default expense categories
INSERT INTO expense_categories (name, name_en, description) VALUES
('رواتب وأجور', 'Salaries & Wages', 'رواتب الموظفين'),
('إيجارات', 'Rent', 'إيجار المحل والمستودعات'),
('فواتير كهرباء وماء', 'Utilities', 'فواتير الخدمات'),
('صيانة وقطع غيار', 'Maintenance', 'صيانة المعدات والأجهزة'),
('نثريات', 'Miscellaneous', 'مصاريف نثرية'),
مشتريات مكتبية', 'Office Supplies', 'قرطاسية ومستلزمات مكتبية'),
نقل ومواصلات', 'Transportation', 'مصاريف الشحن والتوصيل'),
أخرى', 'Other', 'مصاريف أخرى')
ON CONFLICT (name) DO NOTHING;
`;

// ============================================
// Default Data Inserts
// ============================================
export const DEFAULT_DATA = `
-- Default expense categories for SQLite
INSERT OR IGNORE INTO expense_categories (id, name, description, is_active, created_at)
VALUES
  ('cat-001', 'رواتب وأجور', 'رواتب الموظفين', 1, datetime('now')),
  ('cat-002', 'إيجارات', 'إيجار المحل والمستودعات', 1, datetime('now')),
  ('cat-003', 'فواتير كهرباء وماء', 'فواتير الخدمات', 1, datetime('now')),
  ('cat-004', 'صيانة وقطع غيار', 'صيانة المعدات والأجهزة', 1, datetime('now')),
  ('cat-005', 'نثريات', 'مصاريف نثرية', 1, datetime('now')),
  ('cat-006', 'مشتريات مكتبية', 'قرطاسية ومستلزمات مكتبية', 1, datetime('now')),
  ('cat-007', 'نقل ومواصلات', 'مصاريف الشحن والتوصيل', 1, datetime('now')),
  ('cat-008', 'أخرى', 'مصاريف أخرى', 1, datetime('now'));
`;

export default {
  SQLITE_SCHEMA,
  NEON_SCHEMA,
  DEFAULT_DATA
};
