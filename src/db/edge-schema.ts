// SQLite schema for edge database (subset of cloud schema for offline operations)

export const EDGE_SCHEMA = `
-- Sync Journal (tracks offline operations to sync later)
CREATE TABLE IF NOT EXISTS sync_journal (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL CHECK(operation IN ('insert', 'update', 'delete')),
  "table" TEXT NOT NULL,
  record_id TEXT NOT NULL,
  data TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  edge_node_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'syncing', 'synced', 'conflict', 'failed')),
  checksum TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_journal_status ON sync_journal(status);
CREATE INDEX IF NOT EXISTS idx_sync_journal_timestamp ON sync_journal(timestamp);

-- Local metadata
CREATE TABLE IF NOT EXISTS edge_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Products (synced from cloud, read-only locally)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  barcode TEXT,
  category_id TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_group_id TEXT,
  track_stock INTEGER NOT NULL DEFAULT 0,
  sold_by_weight INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  kitchen_routing TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- Product Variants
CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  price_cents INTEGER,
  cost_cents INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- Product Categories
CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES product_categories(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

-- Modifiers
CREATE TABLE IF NOT EXISTS modifiers (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

-- Modifier Groups
CREATE TABLE IF NOT EXISTS modifier_groups (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  min_selections INTEGER NOT NULL DEFAULT 0,
  max_selections INTEGER,
  is_required INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

-- Tax Rules (synced from cloud)
CREATE TABLE IF NOT EXISTS tax_rules (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  rate_percent REAL NOT NULL,
  is_inclusive INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

-- Payment Types (synced from cloud)
CREATE TABLE IF NOT EXISTS payment_types (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

-- Employees (synced from cloud for PIN auth)
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  store_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  pin_hash TEXT,
  role TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_employees_pin ON employees(pin_hash);

-- Customers (cached for offline lookup)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  tags TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- Store Settings (synced from cloud)
CREATE TABLE IF NOT EXISTS store_settings (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT,
  UNIQUE(store_id, key)
);

-- Orders (created locally, synced to cloud)
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  employee_id TEXT,
  customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  receipt_number TEXT,
  notes TEXT,
  is_offline INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_receipt ON orders(receipt_number);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL,
  variant_id TEXT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  modifiers TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  payment_type_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- Refunds (can be created offline if enabled)
CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  payment_id TEXT REFERENCES payments(id),
  amount_cents INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  refund_type TEXT NOT NULL DEFAULT 'full',
  is_offline INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);

-- Shifts
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  device_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  opening_cash_cents INTEGER NOT NULL DEFAULT 0,
  closing_cash_cents INTEGER,
  expected_cash_cents INTEGER,
  discrepancy_cents INTEGER,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  notes TEXT,
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts(employee_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
`;

export function initializeEdgeSchema(db: { exec: (sql: string) => void }): void {
  db.exec(EDGE_SCHEMA);
}
