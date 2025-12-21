// Test data factories for creating test entities

import { generateId } from '../../utils/idempotency';
import { nowISO } from '../../utils/datetime';

export const TEST_ACCOUNT_ID = 'test-account-001';
export const TEST_STORE_ID = 'test-store-001';
export const TEST_EMPLOYEE_ID = 'test-employee-001';

export function createTestAccount(overrides: Partial<TestAccount> = {}): TestAccount {
  return {
    id: generateId(),
    name: 'Test Business',
    slug: 'test-business',
    timezone: 'UTC',
    currency: 'USD',
    locale: 'en-US',
    is_active: true,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...overrides
  };
}

export function createTestStore(overrides: Partial<TestStore> = {}): TestStore {
  return {
    id: generateId(),
    account_id: TEST_ACCOUNT_ID,
    name: 'Test Store',
    code: 'TS001',
    is_active: true,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...overrides
  };
}

export function createTestEmployee(overrides: Partial<TestEmployee> = {}): TestEmployee {
  return {
    id: generateId(),
    account_id: TEST_ACCOUNT_ID,
    store_id: TEST_STORE_ID,
    name: 'Test Employee',
    email: 'test@example.com',
    role: 'cashier',
    is_active: true,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...overrides
  };
}

export function createTestProduct(overrides: Partial<TestProduct> = {}): TestProduct {
  return {
    id: generateId(),
    account_id: TEST_ACCOUNT_ID,
    name: 'Test Product',
    price_cents: 1000,
    currency: 'USD',
    track_stock: true,
    is_active: true,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...overrides
  };
}

export function createTestOrder(overrides: Partial<TestOrder> = {}): TestOrder {
  return {
    id: generateId(),
    account_id: TEST_ACCOUNT_ID,
    store_id: TEST_STORE_ID,
    employee_id: TEST_EMPLOYEE_ID,
    status: 'draft',
    order_type: 'dine_in',
    subtotal_cents: 0,
    discount_cents: 0,
    tax_cents: 0,
    tip_cents: 0,
    total_cents: 0,
    currency: 'USD',
    is_offline: false,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...overrides
  };
}

export function createTestOrderItem(overrides: Partial<TestOrderItem> = {}): TestOrderItem {
  return {
    id: generateId(),
    order_id: '',
    product_id: '',
    name: 'Test Item',
    quantity: 1,
    unit_price_cents: 1000,
    subtotal_cents: 1000,
    discount_cents: 0,
    tax_cents: 100,
    total_cents: 1100,
    created_at: nowISO(),
    ...overrides
  };
}

export function createTestPayment(overrides: Partial<TestPayment> = {}): TestPayment {
  return {
    id: generateId(),
    account_id: TEST_ACCOUNT_ID,
    order_id: '',
    amount_cents: 0,
    tip_cents: 0,
    currency: 'USD',
    status: 'pending',
    created_at: nowISO(),
    updated_at: nowISO(),
    ...overrides
  };
}

export function createTestInventory(overrides: Partial<TestInventory> = {}): TestInventory {
  return {
    id: generateId(),
    account_id: TEST_ACCOUNT_ID,
    store_id: TEST_STORE_ID,
    product_id: '',
    quantity: 100,
    low_stock_threshold: 10,
    reorder_point: 20,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...overrides
  };
}

export function createTestCustomer(overrides: Partial<TestCustomer> = {}): TestCustomer {
  return {
    id: generateId(),
    account_id: TEST_ACCOUNT_ID,
    name: 'Test Customer',
    email: 'customer@example.com',
    phone: '+1234567890',
    total_spent_cents: 0,
    visit_count: 0,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...overrides
  };
}

export function createTestShift(overrides: Partial<TestShift> = {}): TestShift {
  return {
    id: generateId(),
    account_id: TEST_ACCOUNT_ID,
    store_id: TEST_STORE_ID,
    employee_id: TEST_EMPLOYEE_ID,
    status: 'open',
    opening_cash_cents: 10000,
    total_sales_cents: 0,
    total_refunds_cents: 0,
    total_tips_cents: 0,
    transaction_count: 0,
    opened_at: nowISO(),
    created_at: nowISO(),
    updated_at: nowISO(),
    ...overrides
  };
}

export function createTestSyncJournalEntry(
  overrides: Partial<TestSyncJournalEntry> = {}
): TestSyncJournalEntry {
  return {
    id: generateId(),
    operation: 'insert',
    table: 'orders',
    recordId: generateId(),
    data: {},
    timestamp: nowISO(),
    edgeNodeId: 'test-edge-001',
    status: 'pending',
    checksum: 'test-checksum',
    attempts: 0,
    ...overrides
  };
}

// Type definitions for test fixtures
interface TestAccount {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  locale: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TestStore {
  id: string;
  account_id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TestEmployee {
  id: string;
  account_id: string;
  store_id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  pin_hash?: string;
}

interface TestProduct {
  id: string;
  account_id: string;
  name: string;
  price_cents: number;
  currency: string;
  track_stock: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sku?: string;
  barcode?: string;
}

interface TestOrder {
  id: string;
  account_id: string;
  store_id: string;
  employee_id: string;
  status: string;
  order_type: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  currency: string;
  is_offline: boolean;
  created_at: string;
  updated_at: string;
  customer_id?: string;
  shift_id?: string;
  receipt_number?: string;
}

interface TestOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  created_at: string;
  variant_id?: string;
}

interface TestPayment {
  id: string;
  account_id: string;
  order_id: string;
  amount_cents: number;
  tip_cents: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
  payment_type_id?: string;
}

interface TestInventory {
  id: string;
  account_id: string;
  store_id: string;
  product_id: string;
  quantity: number;
  low_stock_threshold: number;
  reorder_point: number;
  created_at: string;
  updated_at: string;
  variant_id?: string;
}

interface TestCustomer {
  id: string;
  account_id: string;
  name: string;
  email: string;
  phone: string;
  total_spent_cents: number;
  visit_count: number;
  created_at: string;
  updated_at: string;
}

interface TestShift {
  id: string;
  account_id: string;
  store_id: string;
  employee_id: string;
  status: string;
  opening_cash_cents: number;
  total_sales_cents: number;
  total_refunds_cents: number;
  total_tips_cents: number;
  transaction_count: number;
  opened_at: string;
  created_at: string;
  updated_at: string;
}

interface TestSyncJournalEntry {
  id: string;
  operation: 'insert' | 'update' | 'delete';
  table: string;
  recordId: string;
  data: Record<string, unknown>;
  timestamp: string;
  edgeNodeId: string;
  status: 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed';
  checksum: string;
  attempts: number;
  lastAttempt?: string;
  error?: string;
}
