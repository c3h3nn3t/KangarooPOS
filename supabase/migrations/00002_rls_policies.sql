-- KangarooPOS Row Level Security Policies
-- Migration: 00002_rls_policies
-- Description: Enable RLS and create policies for multi-tenant isolation

-- =============================================================================
-- ENABLE RLS ON ALL TABLES
-- =============================================================================

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE composite_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Get the current user's account_id
CREATE OR REPLACE FUNCTION auth.user_account_id()
RETURNS UUID AS $$
  SELECT account_id FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user belongs to account
CREATE OR REPLACE FUNCTION auth.belongs_to_account(check_account_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND account_id = check_account_id
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user has role
CREATE OR REPLACE FUNCTION auth.has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = ANY(
      CASE required_role
        WHEN 'owner' THEN ARRAY['owner']
        WHEN 'admin' THEN ARRAY['owner', 'admin']
        WHEN 'manager' THEN ARRAY['owner', 'admin', 'manager']
        WHEN 'cashier' THEN ARRAY['owner', 'admin', 'manager', 'cashier']
        WHEN 'kitchen' THEN ARRAY['owner', 'admin', 'manager', 'kitchen']
        ELSE ARRAY[required_role]
      END
    )
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================================
-- ACCOUNTS POLICIES
-- =============================================================================

CREATE POLICY "Users can view their own account"
  ON accounts FOR SELECT
  USING (id = auth.user_account_id());

CREATE POLICY "Owners can update their account"
  ON accounts FOR UPDATE
  USING (id = auth.user_account_id() AND auth.has_role('owner'))
  WITH CHECK (id = auth.user_account_id());

-- =============================================================================
-- USERS POLICIES
-- =============================================================================

CREATE POLICY "Users can view users in their account"
  ON users FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Admins can insert users in their account"
  ON users FOR INSERT
  WITH CHECK (account_id = auth.user_account_id() AND auth.has_role('admin'));

CREATE POLICY "Admins can update users in their account"
  ON users FOR UPDATE
  USING (account_id = auth.user_account_id() AND auth.has_role('admin'))
  WITH CHECK (account_id = auth.user_account_id());

CREATE POLICY "Admins can delete users in their account"
  ON users FOR DELETE
  USING (account_id = auth.user_account_id() AND auth.has_role('admin'));

-- =============================================================================
-- STORES POLICIES
-- =============================================================================

CREATE POLICY "Users can view stores in their account"
  ON stores FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Admins can manage stores"
  ON stores FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('admin'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- STORE SETTINGS POLICIES
-- =============================================================================

CREATE POLICY "Users can view store settings"
  ON store_settings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM stores s
    WHERE s.id = store_settings.store_id
    AND s.account_id = auth.user_account_id()
  ));

CREATE POLICY "Managers can manage store settings"
  ON store_settings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM stores s
    WHERE s.id = store_settings.store_id
    AND s.account_id = auth.user_account_id()
    AND auth.has_role('manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM stores s
    WHERE s.id = store_settings.store_id
    AND s.account_id = auth.user_account_id()
  ));

-- =============================================================================
-- EMPLOYEES POLICIES
-- =============================================================================

CREATE POLICY "Users can view employees in their account"
  ON employees FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Managers can manage employees"
  ON employees FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('manager'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- PRODUCTS & CATEGORIES POLICIES
-- =============================================================================

CREATE POLICY "Users can view categories in their account"
  ON product_categories FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Managers can manage categories"
  ON product_categories FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('manager'))
  WITH CHECK (account_id = auth.user_account_id());

CREATE POLICY "Users can view products in their account"
  ON products FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Managers can manage products"
  ON products FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('manager'))
  WITH CHECK (account_id = auth.user_account_id());

CREATE POLICY "Users can view variants"
  ON product_variants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_variants.product_id
    AND p.account_id = auth.user_account_id()
  ));

CREATE POLICY "Managers can manage variants"
  ON product_variants FOR ALL
  USING (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_variants.product_id
    AND p.account_id = auth.user_account_id()
    AND auth.has_role('manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_variants.product_id
    AND p.account_id = auth.user_account_id()
  ));

-- =============================================================================
-- MODIFIERS POLICIES
-- =============================================================================

CREATE POLICY "Users can view modifier groups"
  ON modifier_groups FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Managers can manage modifier groups"
  ON modifier_groups FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('manager'))
  WITH CHECK (account_id = auth.user_account_id());

CREATE POLICY "Users can view modifiers"
  ON modifiers FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Managers can manage modifiers"
  ON modifiers FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('manager'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- TAX POLICIES
-- =============================================================================

CREATE POLICY "Users can view tax groups"
  ON tax_groups FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Admins can manage tax groups"
  ON tax_groups FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('admin'))
  WITH CHECK (account_id = auth.user_account_id());

CREATE POLICY "Users can view tax rules"
  ON tax_rules FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Admins can manage tax rules"
  ON tax_rules FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('admin'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- INVENTORY POLICIES
-- =============================================================================

CREATE POLICY "Users can view inventory"
  ON inventory FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Managers can manage inventory"
  ON inventory FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('manager'))
  WITH CHECK (account_id = auth.user_account_id());

CREATE POLICY "Users can view inventory transactions"
  ON inventory_transactions FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "System can insert inventory transactions"
  ON inventory_transactions FOR INSERT
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- CUSTOMERS POLICIES
-- =============================================================================

CREATE POLICY "Users can view customers"
  ON customers FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Cashiers can manage customers"
  ON customers FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('cashier'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- PAYMENT TYPES POLICIES
-- =============================================================================

CREATE POLICY "Users can view payment types"
  ON payment_types FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Admins can manage payment types"
  ON payment_types FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('admin'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- ORDERS POLICIES
-- =============================================================================

CREATE POLICY "Users can view orders in their account"
  ON orders FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Cashiers can create orders"
  ON orders FOR INSERT
  WITH CHECK (account_id = auth.user_account_id() AND auth.has_role('cashier'));

CREATE POLICY "Cashiers can update orders"
  ON orders FOR UPDATE
  USING (account_id = auth.user_account_id() AND auth.has_role('cashier'))
  WITH CHECK (account_id = auth.user_account_id());

CREATE POLICY "Users can view order items"
  ON order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND o.account_id = auth.user_account_id()
  ));

CREATE POLICY "Cashiers can manage order items"
  ON order_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND o.account_id = auth.user_account_id()
    AND auth.has_role('cashier')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND o.account_id = auth.user_account_id()
  ));

-- =============================================================================
-- PAYMENTS POLICIES
-- =============================================================================

CREATE POLICY "Users can view payments"
  ON payments FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Cashiers can create payments"
  ON payments FOR INSERT
  WITH CHECK (account_id = auth.user_account_id() AND auth.has_role('cashier'));

CREATE POLICY "Cashiers can update payments"
  ON payments FOR UPDATE
  USING (account_id = auth.user_account_id() AND auth.has_role('cashier'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- REFUNDS POLICIES
-- =============================================================================

CREATE POLICY "Users can view refunds"
  ON refunds FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Cashiers can create refunds"
  ON refunds FOR INSERT
  WITH CHECK (account_id = auth.user_account_id() AND auth.has_role('cashier'));

CREATE POLICY "Managers can update refunds"
  ON refunds FOR UPDATE
  USING (account_id = auth.user_account_id() AND auth.has_role('manager'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- SHIFTS POLICIES
-- =============================================================================

CREATE POLICY "Users can view shifts"
  ON shifts FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Cashiers can manage shifts"
  ON shifts FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('cashier'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- DEVICES POLICIES
-- =============================================================================

CREATE POLICY "Users can view devices"
  ON devices FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Admins can manage devices"
  ON devices FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('admin'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- SYNC POLICIES
-- =============================================================================

CREATE POLICY "Users can view edge nodes"
  ON edge_nodes FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Admins can manage edge nodes"
  ON edge_nodes FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('admin'))
  WITH CHECK (account_id = auth.user_account_id());

CREATE POLICY "Users can view sync journal"
  ON sync_journal FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "System can manage sync journal"
  ON sync_journal FOR ALL
  USING (account_id = auth.user_account_id())
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- KDS POLICIES
-- =============================================================================

CREATE POLICY "Users can view kitchen tickets"
  ON kitchen_tickets FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Kitchen staff can manage tickets"
  ON kitchen_tickets FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('kitchen'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- RECEIPT TEMPLATES POLICIES
-- =============================================================================

CREATE POLICY "Users can view receipt templates"
  ON receipt_templates FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "Managers can manage receipt templates"
  ON receipt_templates FOR ALL
  USING (account_id = auth.user_account_id() AND auth.has_role('manager'))
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- AUDIT LOG POLICIES
-- =============================================================================

CREATE POLICY "Users can view audit logs"
  ON audit_logs FOR SELECT
  USING (account_id = auth.user_account_id());

CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (account_id = auth.user_account_id());

-- =============================================================================
-- SERVICE ROLE BYPASS
-- Service role key bypasses RLS for backend operations
-- =============================================================================

-- Note: The service role key automatically bypasses RLS
-- This is used for:
-- - Sync operations from edge nodes
-- - Background jobs
-- - Admin operations
