-- KangarooPOS Initial Schema
-- Migration: 00001_initial_schema
-- Description: Core tables for accounts, users, stores, products, inventory, orders, payments

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- ACCOUNTS & USERS
-- =============================================================================

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  currency TEXT NOT NULL DEFAULT 'USD',
  locale TEXT NOT NULL DEFAULT 'en-US',
  business_type TEXT,
  tax_id TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'US',
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner', 'admin', 'manager', 'cashier', 'kitchen')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- STORES & LOCATIONS
-- =============================================================================

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'US',
  phone TEXT,
  email TEXT,
  timezone TEXT,
  currency TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, code)
);

CREATE TABLE store_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, key)
);

-- =============================================================================
-- EMPLOYEES
-- =============================================================================

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  pin_hash TEXT,
  role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner', 'admin', 'manager', 'cashier', 'kitchen')),
  hourly_rate_cents INTEGER,
  permissions JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_account ON employees(account_id);
CREATE INDEX idx_employees_store ON employees(store_id);
CREATE INDEX idx_employees_pin ON employees(pin_hash) WHERE pin_hash IS NOT NULL;

-- =============================================================================
-- PRODUCTS & CATEGORIES
-- =============================================================================

CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_account ON product_categories(account_id);
CREATE INDEX idx_categories_parent ON product_categories(parent_id);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  barcode TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_group_id UUID,
  track_stock BOOLEAN NOT NULL DEFAULT false,
  sold_by_weight BOOLEAN NOT NULL DEFAULT false,
  weight_unit TEXT CHECK (weight_unit IN ('kg', 'lb', 'oz', 'g')),
  is_composite BOOLEAN NOT NULL DEFAULT false,
  kitchen_routing TEXT,
  color TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_account ON products(account_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_sku ON products(sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  price_cents INTEGER,
  cost_cents INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_variants_barcode ON product_variants(barcode) WHERE barcode IS NOT NULL;

-- Product store availability and pricing
CREATE TABLE product_stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price_cents INTEGER,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, store_id)
);

-- =============================================================================
-- MODIFIERS
-- =============================================================================

CREATE TABLE modifier_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_selections INTEGER NOT NULL DEFAULT 0,
  max_selections INTEGER,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE modifiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  modifier_group_id UUID REFERENCES modifier_groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_modifiers_group ON modifiers(modifier_group_id);

-- Link products to modifier groups
CREATE TABLE product_modifier_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id, modifier_group_id)
);

-- =============================================================================
-- COMPOSITE ITEMS (Bundles/Recipes)
-- =============================================================================

CREATE TABLE composite_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  composite_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity DECIMAL(10, 4) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_composite_parent ON composite_components(composite_product_id);
CREATE INDEX idx_composite_component ON composite_components(component_product_id);

-- =============================================================================
-- TAXES
-- =============================================================================

CREATE TABLE tax_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tax_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tax_group_id UUID REFERENCES tax_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate_percent DECIMAL(6, 4) NOT NULL,
  is_inclusive BOOLEAN NOT NULL DEFAULT false,
  applies_to TEXT DEFAULT 'all' CHECK (applies_to IN ('all', 'products', 'services')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tax_rules_group ON tax_rules(tax_group_id);

-- Add foreign key to products
ALTER TABLE products ADD CONSTRAINT fk_products_tax_group
  FOREIGN KEY (tax_group_id) REFERENCES tax_groups(id) ON DELETE SET NULL;

-- =============================================================================
-- INVENTORY
-- =============================================================================

CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity_on_hand DECIMAL(10, 4) NOT NULL DEFAULT 0,
  quantity_reserved DECIMAL(10, 4) NOT NULL DEFAULT 0,
  reorder_point DECIMAL(10, 4),
  reorder_quantity DECIMAL(10, 4),
  last_counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, product_id, variant_id)
);

CREATE INDEX idx_inventory_store ON inventory(store_id);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_low_stock ON inventory(quantity_on_hand) WHERE quantity_on_hand <= 0;

CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale', 'refund', 'adjustment', 'transfer_in', 'transfer_out', 'count', 'purchase', 'production')),
  quantity_change DECIMAL(10, 4) NOT NULL,
  quantity_before DECIMAL(10, 4) NOT NULL,
  quantity_after DECIMAL(10, 4) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  reason TEXT,
  notes TEXT,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inv_transactions_inventory ON inventory_transactions(inventory_id);
CREATE INDEX idx_inv_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX idx_inv_transactions_created ON inventory_transactions(created_at);

-- =============================================================================
-- CUSTOMERS & LOYALTY
-- =============================================================================

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  notes TEXT,
  tags TEXT[],
  total_spent_cents BIGINT NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_account ON customers(account_id);
CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_phone ON customers(phone) WHERE phone IS NOT NULL;

CREATE TABLE loyalty_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points_balance INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  tier TEXT DEFAULT 'standard',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id)
);

CREATE TABLE loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loyalty_account_id UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earn', 'redeem', 'adjust', 'expire')),
  points INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loyalty_trans_account ON loyalty_transactions(loyalty_account_id);

-- =============================================================================
-- PAYMENT TYPES & GATEWAYS
-- =============================================================================

CREATE TABLE payment_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'card', 'digital_wallet', 'gift_card', 'store_credit', 'other')),
  gateway_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  opens_cash_drawer BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_types_account ON payment_types(account_id);

-- =============================================================================
-- ORDERS
-- =============================================================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  device_id UUID,
  shift_id UUID,

  receipt_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'preparing', 'ready', 'completed', 'cancelled', 'refunded')),
  order_type TEXT DEFAULT 'dine_in' CHECK (order_type IN ('dine_in', 'takeout', 'delivery', 'online')),

  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  tip_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',

  tax_breakdown JSONB DEFAULT '[]',
  discount_breakdown JSONB DEFAULT '[]',

  notes TEXT,
  table_number TEXT,
  guest_count INTEGER,

  idempotency_key TEXT,
  is_offline BOOLEAN NOT NULL DEFAULT false,
  offline_created_at TIMESTAMPTZ,

  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_account ON orders(account_id);
CREATE INDEX idx_orders_store ON orders(store_id);
CREATE INDEX idx_orders_employee ON orders(employee_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_receipt ON orders(receipt_number) WHERE receipt_number IS NOT NULL;
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE UNIQUE INDEX idx_orders_idempotency ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id UUID REFERENCES product_variants(id) ON DELETE RESTRICT,

  name TEXT NOT NULL,
  sku TEXT,
  quantity DECIMAL(10, 4) NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,

  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,

  modifiers JSONB DEFAULT '[]',
  tax_breakdown JSONB DEFAULT '[]',

  notes TEXT,
  kitchen_status TEXT DEFAULT 'pending' CHECK (kitchen_status IN ('pending', 'preparing', 'ready', 'served', 'cancelled')),
  kitchen_sent_at TIMESTAMPTZ,

  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- =============================================================================
-- PAYMENTS
-- =============================================================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_type_id UUID REFERENCES payment_types(id) ON DELETE SET NULL,

  amount_cents INTEGER NOT NULL,
  tip_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'captured', 'failed', 'cancelled', 'refunded')),

  gateway_transaction_id TEXT,
  gateway_response JSONB,

  card_brand TEXT,
  card_last_four TEXT,

  reference TEXT,
  notes TEXT,

  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);

-- =============================================================================
-- REFUNDS
-- =============================================================================

CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,

  refund_type TEXT NOT NULL DEFAULT 'full' CHECK (refund_type IN ('full', 'partial', 'item')),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processed', 'failed', 'cancelled')),

  reason TEXT,
  notes TEXT,
  items JSONB DEFAULT '[]',

  gateway_refund_id TEXT,
  gateway_response JSONB,

  is_offline BOOLEAN NOT NULL DEFAULT false,

  approved_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refunds_order ON refunds(order_id);
CREATE INDEX idx_refunds_status ON refunds(status);

-- =============================================================================
-- SHIFTS
-- =============================================================================

CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  device_id UUID,

  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),

  opening_cash_cents INTEGER NOT NULL DEFAULT 0,
  closing_cash_cents INTEGER,
  expected_cash_cents INTEGER,
  discrepancy_cents INTEGER,

  cash_in_cents INTEGER NOT NULL DEFAULT 0,
  cash_out_cents INTEGER NOT NULL DEFAULT 0,

  total_sales_cents INTEGER NOT NULL DEFAULT 0,
  total_refunds_cents INTEGER NOT NULL DEFAULT 0,
  total_tips_cents INTEGER NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,

  notes TEXT,

  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shifts_store ON shifts(store_id);
CREATE INDEX idx_shifts_employee ON shifts(employee_id);
CREATE INDEX idx_shifts_status ON shifts(status);

-- Add foreign key to orders
ALTER TABLE orders ADD CONSTRAINT fk_orders_shift
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL;

-- =============================================================================
-- DEVICES
-- =============================================================================

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  device_type TEXT NOT NULL CHECK (device_type IN ('pos', 'kds', 'customer_display', 'printer')),
  identifier TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,
  is_online BOOLEAN NOT NULL DEFAULT false,

  last_seen_at TIMESTAMPTZ,
  settings JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_store ON devices(store_id);

-- Add foreign key to orders
ALTER TABLE orders ADD CONSTRAINT fk_orders_device
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL;

-- =============================================================================
-- SYNC & EDGE NODES
-- =============================================================================

CREATE TABLE edge_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'syncing')),

  last_sync_at TIMESTAMPTZ,
  sync_version BIGINT NOT NULL DEFAULT 0,

  settings JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sync_journal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  edge_node_id UUID NOT NULL REFERENCES edge_nodes(id) ON DELETE CASCADE,

  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  data JSONB NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'synced', 'conflict', 'failed')),
  checksum TEXT NOT NULL,

  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_journal_edge ON sync_journal(edge_node_id);
CREATE INDEX idx_sync_journal_status ON sync_journal(status);
CREATE INDEX idx_sync_journal_created ON sync_journal(created_at);

CREATE TABLE sync_conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_journal_id UUID NOT NULL REFERENCES sync_journal(id) ON DELETE CASCADE,

  conflict_type TEXT NOT NULL CHECK (conflict_type IN ('version', 'delete', 'constraint')),
  local_data JSONB NOT NULL,
  remote_data JSONB NOT NULL,

  resolution TEXT CHECK (resolution IN ('local_wins', 'remote_wins', 'merged', 'manual')),
  resolved_data JSONB,
  resolved_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- KDS (Kitchen Display System)
-- =============================================================================

CREATE TABLE kitchen_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  ticket_number TEXT,
  station TEXT,

  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,

  items JSONB NOT NULL DEFAULT '[]',

  estimated_time_minutes INTEGER,
  actual_time_minutes INTEGER,

  assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,

  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  bumped_at TIMESTAMPTZ
);

CREATE INDEX idx_kitchen_tickets_store ON kitchen_tickets(store_id);
CREATE INDEX idx_kitchen_tickets_order ON kitchen_tickets(order_id);
CREATE INDEX idx_kitchen_tickets_status ON kitchen_tickets(status);

-- =============================================================================
-- RECEIPT TEMPLATES
-- =============================================================================

CREATE TABLE receipt_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,

  header_text TEXT,
  footer_text TEXT,
  show_logo BOOLEAN NOT NULL DEFAULT true,
  show_tax_breakdown BOOLEAN NOT NULL DEFAULT true,
  show_barcode BOOLEAN NOT NULL DEFAULT false,

  custom_css TEXT,
  template_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- AUDIT LOG
-- =============================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'employee', 'system', 'api')),
  actor_id UUID,

  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,

  old_data JSONB,
  new_data JSONB,
  metadata JSONB DEFAULT '{}',

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_account ON audit_logs(account_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all relevant tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name = 'updated_at'
    AND table_schema = 'public'
  LOOP
    EXECUTE format('
      CREATE TRIGGER update_%I_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
    ', t, t);
  END LOOP;
END;
$$;

-- Generate receipt number
CREATE OR REPLACE FUNCTION generate_receipt_number(store_id UUID)
RETURNS TEXT AS $$
DECLARE
  today_count INTEGER;
  receipt_num TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO today_count
  FROM orders
  WHERE orders.store_id = generate_receipt_number.store_id
  AND DATE(created_at) = CURRENT_DATE
  AND receipt_number IS NOT NULL;

  receipt_num := TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-' || LPAD(today_count::TEXT, 4, '0');
  RETURN receipt_num;
END;
$$ language 'plpgsql';

-- Update customer stats on order completion
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.customer_id IS NOT NULL THEN
    UPDATE customers
    SET
      total_spent_cents = total_spent_cents + NEW.total_cents,
      visit_count = visit_count + 1,
      last_visit_at = NEW.completed_at,
      updated_at = NOW()
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customer_stats_on_order
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_customer_stats();

-- Update inventory on order completion
CREATE OR REPLACE FUNCTION update_inventory_on_order()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Decrease inventory for each order item
    INSERT INTO inventory_transactions (
      account_id, inventory_id, transaction_type,
      quantity_change, quantity_before, quantity_after,
      reference_type, reference_id
    )
    SELECT
      NEW.account_id,
      i.id,
      'sale',
      -oi.quantity,
      i.quantity_on_hand,
      i.quantity_on_hand - oi.quantity,
      'order',
      NEW.id
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id AND p.track_stock = true
    JOIN inventory i ON i.product_id = oi.product_id
      AND i.store_id = NEW.store_id
      AND (i.variant_id = oi.variant_id OR (i.variant_id IS NULL AND oi.variant_id IS NULL));

    -- Update inventory quantities
    UPDATE inventory i
    SET quantity_on_hand = quantity_on_hand - oi.quantity
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id AND p.track_stock = true
    WHERE i.product_id = oi.product_id
    AND i.store_id = NEW.store_id
    AND (i.variant_id = oi.variant_id OR (i.variant_id IS NULL AND oi.variant_id IS NULL))
    AND oi.order_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_inventory_on_order_complete
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_inventory_on_order();
