// Shared types for API client

export interface ApiConfig {
  baseUrl: string;
  token?: string;
  storeId?: string;
  accountId?: string;
  onTokenRefresh?: () => Promise<string>;
  onError?: (error: ApiError) => void;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

// Product types
export interface Product {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  price: number; // cents
  costPrice?: number;
  categoryId?: string;
  imageUrl?: string;
  isActive: boolean;
  trackInventory: boolean;
  taxGroupId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  sortOrder: number;
  imageUrl?: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku?: string;
  barcode?: string;
  price: number;
  costPrice?: number;
  options: Record<string, string>;
}

// Order types
export interface Order {
  id: string;
  orderNumber: string;
  status: 'draft' | 'pending' | 'paid' | 'completed' | 'cancelled' | 'refunded';
  customerId?: string;
  employeeId: string;
  storeId: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  notes?: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxAmount: number;
  discountAmount: number;
  modifiers?: OrderItemModifier[];
  notes?: string;
}

export interface OrderItemModifier {
  id: string;
  name: string;
  price: number;
}

export interface CreateOrderRequest {
  customerId?: string;
  items: {
    productId: string;
    variantId?: string;
    quantity: number;
    modifiers?: { modifierId: string }[];
    notes?: string;
  }[];
  discountId?: string;
  notes?: string;
}

// Payment types
export interface Payment {
  id: string;
  orderId: string;
  method: 'cash' | 'card' | 'bank_transfer' | 'other';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  amount: number;
  tipAmount: number;
  changeGiven?: number;
  transactionId?: string;
  cardLast4?: string;
  createdAt: string;
}

export interface ProcessPaymentRequest {
  orderId: string;
  method: 'cash' | 'card';
  amount: number;
  tipAmount?: number;
  cashReceived?: number;
  cardToken?: string;
}

// Customer types
export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  loyaltyPoints: number;
  loyaltyTier?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Employee types
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier';
  isActive: boolean;
  stores: string[];
  createdAt: string;
}

// Inventory types
export interface InventoryItem {
  id: string;
  productId: string;
  variantId?: string;
  storeId: string;
  quantity: number;
  lowStockThreshold?: number;
  updatedAt: string;
}

export interface InventoryTransaction {
  id: string;
  productId: string;
  storeId: string;
  type: 'sale' | 'purchase' | 'adjustment' | 'transfer' | 'return';
  quantity: number;
  referenceId?: string;
  notes?: string;
  createdAt: string;
}

// Kitchen types
export interface KitchenTicket {
  id: string;
  orderId: string;
  orderNumber: string;
  status: 'new' | 'in_progress' | 'ready' | 'served';
  priority: 'normal' | 'rush';
  station?: string;
  items: KitchenTicketItem[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface KitchenTicketItem {
  id: string;
  name: string;
  quantity: number;
  modifiers?: string[];
  notes?: string;
  status: 'pending' | 'preparing' | 'ready';
}

// Shift types
export interface Shift {
  id: string;
  employeeId: string;
  storeId: string;
  startedAt: string;
  endedAt?: string;
  openingCash: number;
  closingCash?: number;
  expectedCash?: number;
  cashDifference?: number;
  status: 'open' | 'closed';
  notes?: string;
}

// Report types
export interface SalesReport {
  date: string;
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
  paymentBreakdown: {
    cash: number;
    card: number;
    other: number;
  };
  topProducts: {
    productId: string;
    name: string;
    quantity: number;
    revenue: number;
  }[];
}

// Sync types
export interface SyncStatus {
  lastSyncedAt: string;
  pendingChanges: number;
  status: 'synced' | 'syncing' | 'offline' | 'error';
}
