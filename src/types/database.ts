// Database types generated from schema
// These types match the Supabase/PostgreSQL schema

export type UUID = string;
export type Timestamp = string; // ISO 8601 format

// =============================================================================
// ENUMS
// =============================================================================

export type UserRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'kitchen';
export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'refunded';
export type OrderType = 'dine_in' | 'takeout' | 'delivery' | 'online';
export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'cancelled'
  | 'refunded';
export type PaymentType =
  | 'cash'
  | 'card'
  | 'digital_wallet'
  | 'gift_card'
  | 'store_credit'
  | 'other';
export type RefundType = 'full' | 'partial' | 'item';
export type RefundStatus = 'pending' | 'approved' | 'processed' | 'failed' | 'cancelled';
export type ShiftStatus = 'open' | 'closed';
export type DeviceType = 'pos' | 'kds' | 'customer_display' | 'printer';
export type KitchenStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type KitchenTicketStatus = 'new' | 'in_progress' | 'done' | 'cancelled';
export type InventoryTransactionType =
  | 'sale'
  | 'refund'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out'
  | 'count'
  | 'purchase'
  | 'production';
export type LoyaltyTransactionType = 'earn' | 'redeem' | 'adjust' | 'expire';
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed';
export type SyncOperation = 'insert' | 'update' | 'delete';
export type ConflictType = 'version' | 'delete' | 'constraint';
export type ConflictResolution = 'local_wins' | 'remote_wins' | 'merged' | 'manual';
export type WeightUnit = 'kg' | 'lb' | 'oz' | 'g';

// =============================================================================
// ACCOUNTS & USERS
// =============================================================================

export interface Account {
  id: UUID;
  name: string;
  slug: string;
  owner_id: UUID | null;
  timezone: string;
  currency: string;
  locale: string;
  business_type: string | null;
  tax_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  logo_url: string | null;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface User {
  id: UUID;
  account_id: UUID;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// =============================================================================
// STORES
// =============================================================================

export interface Store {
  id: UUID;
  account_id: UUID;
  name: string;
  code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  currency: string | null;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface StoreSetting {
  id: UUID;
  store_id: UUID;
  key: string;
  value: unknown;
  updated_at: Timestamp;
}

// =============================================================================
// EMPLOYEES
// =============================================================================

export interface Employee {
  id: UUID;
  account_id: UUID;
  user_id: UUID | null;
  store_id: UUID | null;
  name: string;
  email: string | null;
  phone: string | null;
  pin_hash: string | null;
  role: UserRole;
  hourly_rate_cents: number | null;
  permissions: Record<string, boolean>;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// =============================================================================
// PRODUCTS & CATEGORIES
// =============================================================================

export interface ProductCategory {
  id: UUID;
  account_id: UUID;
  parent_id: UUID | null;
  name: string;
  description: string | null;
  color: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Product {
  id: UUID;
  account_id: UUID;
  category_id: UUID | null;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  price_cents: number;
  cost_cents: number | null;
  currency: string;
  tax_group_id: UUID | null;
  track_stock: boolean;
  sold_by_weight: boolean;
  weight_unit: WeightUnit | null;
  is_composite: boolean;
  kitchen_routing: string | null;
  color: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProductVariant {
  id: UUID;
  product_id: UUID;
  name: string;
  sku: string | null;
  barcode: string | null;
  price_cents: number | null;
  cost_cents: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProductStore {
  id: UUID;
  product_id: UUID;
  store_id: UUID;
  price_cents: number | null;
  is_available: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// =============================================================================
// MODIFIERS
// =============================================================================

export interface ModifierGroup {
  id: UUID;
  account_id: UUID;
  name: string;
  min_selections: number;
  max_selections: number | null;
  is_required: boolean;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Modifier {
  id: UUID;
  account_id: UUID;
  modifier_group_id: UUID | null;
  name: string;
  price_cents: number;
  sort_order: number;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProductModifierGroup {
  id: UUID;
  product_id: UUID;
  modifier_group_id: UUID;
  sort_order: number;
}

// =============================================================================
// COMPOSITE ITEMS
// =============================================================================

export interface CompositeComponent {
  id: UUID;
  composite_product_id: UUID;
  component_product_id: UUID;
  quantity: number;
  created_at: Timestamp;
}

// =============================================================================
// TAXES
// =============================================================================

export interface TaxGroup {
  id: UUID;
  account_id: UUID;
  name: string;
  is_default: boolean;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TaxRule {
  id: UUID;
  account_id: UUID;
  tax_group_id: UUID | null;
  name: string;
  rate_percent: number;
  is_inclusive: boolean;
  applies_to: 'all' | 'products' | 'services';
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// =============================================================================
// INVENTORY
// =============================================================================

export interface Inventory {
  id: UUID;
  account_id: UUID;
  store_id: UUID;
  product_id: UUID;
  variant_id: UUID | null;
  quantity_on_hand: number;
  quantity_reserved: number;
  reorder_point: number | null;
  reorder_quantity: number | null;
  last_counted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface InventoryTransaction {
  id: UUID;
  account_id: UUID;
  inventory_id: UUID;
  transaction_type: InventoryTransactionType;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reference_type: string | null;
  reference_id: UUID | null;
  reason: string | null;
  notes: string | null;
  employee_id: UUID | null;
  created_at: Timestamp;
}

// =============================================================================
// CUSTOMERS & LOYALTY
// =============================================================================

export interface Customer {
  id: UUID;
  account_id: UUID;
  name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  notes: string | null;
  tags: string[];
  total_spent_cents: number;
  visit_count: number;
  last_visit_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface LoyaltyAccount {
  id: UUID;
  account_id: UUID;
  customer_id: UUID;
  points_balance: number;
  lifetime_points: number;
  tier: string;
  enrolled_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface LoyaltyTransaction {
  id: UUID;
  loyalty_account_id: UUID;
  transaction_type: LoyaltyTransactionType;
  points: number;
  balance_before: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: UUID | null;
  notes: string | null;
  created_at: Timestamp;
}

// =============================================================================
// PAYMENT TYPES
// =============================================================================

export interface PaymentTypeConfig {
  id: UUID;
  account_id: UUID;
  name: string;
  type: PaymentType;
  gateway_id: UUID | null;
  is_active: boolean;
  opens_cash_drawer: boolean;
  sort_order: number;
  settings: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// =============================================================================
// ORDERS
// =============================================================================

export interface TaxBreakdownItem {
  tax_rule_id: UUID;
  name: string;
  rate_percent: number;
  amount_cents: number;
  is_inclusive: boolean;
}

export interface DiscountBreakdownItem {
  type: 'percent' | 'fixed';
  name: string;
  value: number;
  amount_cents: number;
  applied_to: 'order' | 'item';
  item_id?: UUID;
}

export interface OrderItemModifier {
  modifier_id: UUID;
  name: string;
  price_cents: number;
}

export interface Order {
  id: UUID;
  account_id: UUID;
  store_id: UUID;
  employee_id: UUID | null;
  customer_id: UUID | null;
  device_id: UUID | null;
  shift_id: UUID | null;
  receipt_number: string | null;
  status: OrderStatus;
  order_type: OrderType;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  currency: string;
  tax_breakdown: TaxBreakdownItem[];
  discount_breakdown: DiscountBreakdownItem[];
  notes: string | null;
  table_number: string | null;
  guest_count: number | null;
  idempotency_key: string | null;
  is_offline: boolean;
  offline_created_at: Timestamp | null;
  completed_at: Timestamp | null;
  cancelled_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface OrderItem {
  id: UUID;
  order_id: UUID;
  product_id: UUID;
  variant_id: UUID | null;
  name: string;
  sku: string | null;
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  modifiers: OrderItemModifier[];
  tax_breakdown: TaxBreakdownItem[];
  notes: string | null;
  kitchen_status: KitchenStatus;
  kitchen_sent_at: Timestamp | null;
  sort_order: number;
  created_at: Timestamp;
}

// =============================================================================
// PAYMENTS
// =============================================================================

export interface Payment {
  id: UUID;
  account_id: UUID;
  order_id: UUID;
  payment_type_id: UUID | null;
  amount_cents: number;
  tip_cents: number;
  currency: string;
  status: PaymentStatus;
  gateway_transaction_id: string | null;
  gateway_response: Record<string, unknown> | null;
  card_brand: string | null;
  card_last_four: string | null;
  reference: string | null;
  notes: string | null;
  processed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// =============================================================================
// REFUNDS
// =============================================================================

export interface RefundItem {
  order_item_id: UUID;
  quantity: number;
  amount_cents: number;
  reason: string | null;
}

export interface Refund {
  id: UUID;
  account_id: UUID;
  order_id: UUID;
  payment_id: UUID | null;
  employee_id: UUID | null;
  refund_type: RefundType;
  amount_cents: number;
  currency: string;
  status: RefundStatus;
  reason: string | null;
  notes: string | null;
  items: RefundItem[];
  gateway_refund_id: string | null;
  gateway_response: Record<string, unknown> | null;
  is_offline: boolean;
  approved_by: UUID | null;
  approved_at: Timestamp | null;
  processed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// =============================================================================
// SHIFTS
// =============================================================================

export interface Shift {
  id: UUID;
  account_id: UUID;
  store_id: UUID;
  employee_id: UUID;
  device_id: UUID | null;
  status: ShiftStatus;
  opening_cash_cents: number;
  closing_cash_cents: number | null;
  expected_cash_cents: number | null;
  discrepancy_cents: number | null;
  cash_in_cents: number;
  cash_out_cents: number;
  total_sales_cents: number;
  total_refunds_cents: number;
  total_tips_cents: number;
  transaction_count: number;
  notes: string | null;
  opened_at: Timestamp;
  closed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// =============================================================================
// DEVICES
// =============================================================================

export interface Device {
  id: UUID;
  account_id: UUID;
  store_id: UUID;
  name: string;
  device_type: DeviceType;
  identifier: string | null;
  is_active: boolean;
  is_online: boolean;
  last_seen_at: Timestamp | null;
  settings: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// =============================================================================
// SYNC & EDGE NODES
// =============================================================================

export interface EdgeNode {
  id: UUID;
  account_id: UUID;
  store_id: UUID;
  device_id: UUID | null;
  name: string;
  status: 'active' | 'inactive' | 'syncing';
  last_sync_at: Timestamp | null;
  sync_version: number;
  settings: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SyncJournal {
  id: UUID;
  account_id: UUID;
  edge_node_id: UUID;
  operation: SyncOperation;
  table_name: string;
  record_id: UUID;
  data: Record<string, unknown>;
  status: SyncStatus;
  checksum: string;
  attempts: number;
  last_attempt_at: Timestamp | null;
  error: string | null;
  created_at: Timestamp;
  synced_at: Timestamp | null;
}

export interface SyncConflict {
  id: UUID;
  sync_journal_id: UUID;
  conflict_type: ConflictType;
  local_data: Record<string, unknown>;
  remote_data: Record<string, unknown>;
  resolution: ConflictResolution | null;
  resolved_data: Record<string, unknown> | null;
  resolved_by: UUID | null;
  resolved_at: Timestamp | null;
  created_at: Timestamp;
}

// =============================================================================
// KDS
// =============================================================================

export interface KitchenTicketItem {
  order_item_id: UUID;
  name: string;
  quantity: number;
  modifiers: string[];
  notes: string | null;
  status: KitchenStatus;
}

export interface KitchenTicket {
  id: UUID;
  account_id: UUID;
  store_id: UUID;
  order_id: UUID;
  ticket_number: string | null;
  station: string | null;
  status: KitchenTicketStatus;
  priority: number;
  items: KitchenTicketItem[];
  estimated_time_minutes: number | null;
  actual_time_minutes: number | null;
  assigned_to: UUID | null;
  received_at: Timestamp;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  bumped_at: Timestamp | null;
}

// =============================================================================
// RECEIPT TEMPLATES
// =============================================================================

export interface ReceiptTemplate {
  id: UUID;
  account_id: UUID;
  store_id: UUID | null;
  name: string;
  is_default: boolean;
  header_text: string | null;
  footer_text: string | null;
  show_logo: boolean;
  show_tax_breakdown: boolean;
  show_barcode: boolean;
  custom_css: string | null;
  template_data: Record<string, unknown>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// =============================================================================
// AUDIT LOG
// =============================================================================

export interface AuditLog {
  id: UUID;
  account_id: UUID;
  actor_type: 'user' | 'employee' | 'system' | 'api';
  actor_id: UUID | null;
  action: string;
  resource_type: string;
  resource_id: UUID | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Timestamp;
}
