// API client configuration for web app

interface ApiConfig {
  baseUrl: string;
  token?: string;
  storeId?: string;
  onError?: (error: ApiError) => void;
}

interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
}

class ApiClient {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  setToken(token: string) {
    this.config.token = token;
  }

  setStoreId(storeId: string) {
    this.config.storeId = storeId;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }

    if (this.config.storeId) {
      headers['X-Store-Id'] = this.config.storeId;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const apiError: ApiError = {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'An error occurred',
        status: response.status,
        details: error.details,
      };

      if (this.config.onError) {
        this.config.onError(apiError);
      }

      throw apiError;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Products
  async getProducts(params: { categoryId?: string; search?: string } = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v) as [string, string][]
    ).toString();
    return this.request<{ data: Product[]; pagination: Pagination }>(
      `/products${query ? `?${query}` : ''}`
    );
  }

  async getProduct(id: string) {
    return this.request<Product>(`/products/${id}`);
  }

  // Orders
  async getOrders(params: { status?: string; date?: string } = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([_, v]) => v) as [string, string][]
    ).toString();
    return this.request<{ data: Order[]; pagination: Pagination }>(
      `/orders${query ? `?${query}` : ''}`
    );
  }

  async createOrder(data: CreateOrderRequest) {
    return this.request<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateOrderStatus(id: string, status: string) {
    return this.request<Order>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Payments
  async processPayment(data: ProcessPaymentRequest) {
    return this.request<Payment>('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async refundPayment(id: string, amount?: number, reason?: string) {
    return this.request<Payment>(`/payments/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    });
  }

  // Customers
  async getCustomers(params: { search?: string } = {}) {
    const query = params.search ? `?search=${encodeURIComponent(params.search)}` : '';
    return this.request<{ data: Customer[] }>(`/customers${query}`);
  }

  async createCustomer(data: Partial<Customer>) {
    return this.request<Customer>('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Kitchen
  async getKitchenTickets(params: { status?: string } = {}) {
    const query = params.status ? `?status=${params.status}` : '';
    return this.request<KitchenTicket[]>(`/kds/tickets${query}`);
  }

  async bumpTicket(id: string) {
    return this.request<KitchenTicket>(`/kds/tickets/${id}/bump`, {
      method: 'POST',
    });
  }

  // Shifts
  async getCurrentShift() {
    return this.request<Shift | null>('/shifts/current');
  }

  async openShift(openingCash: number) {
    return this.request<Shift>('/shifts/open', {
      method: 'POST',
      body: JSON.stringify({ openingCash }),
    });
  }

  async closeShift(closingCash: number, notes?: string) {
    return this.request<Shift>('/shifts/close', {
      method: 'POST',
      body: JSON.stringify({ closingCash, notes }),
    });
  }

  // Reports
  async getSalesReport(startDate: string, endDate: string) {
    return this.request<SalesReport>(
      `/reports/sales?startDate=${startDate}&endDate=${endDate}`
    );
  }

  // Health check
  async checkHealth() {
    return this.request<{ status: string }>('/health');
  }
}

// Types
interface Product {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  price: number;
  categoryId?: string;
  imageUrl?: string;
  isActive: boolean;
}

interface Order {
  id: string;
  orderNumber: string;
  status: 'draft' | 'pending' | 'paid' | 'completed' | 'cancelled' | 'refunded';
  customerId?: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  items: OrderItem[];
  createdAt: string;
}

interface OrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface CreateOrderRequest {
  customerId?: string;
  items: {
    productId: string;
    quantity: number;
    modifiers?: { modifierId: string }[];
  }[];
  notes?: string;
}

interface Payment {
  id: string;
  orderId: string;
  method: 'cash' | 'card';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  amount: number;
  tipAmount: number;
  changeGiven?: number;
}

interface ProcessPaymentRequest {
  orderId: string;
  method: 'cash' | 'card';
  amount: number;
  tipAmount?: number;
  cashReceived?: number;
}

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  loyaltyPoints: number;
}

interface KitchenTicket {
  id: string;
  orderId: string;
  orderNumber: string;
  status: 'new' | 'in_progress' | 'ready' | 'served';
  priority: 'normal' | 'rush';
  items: { name: string; quantity: number; modifiers?: string[] }[];
  createdAt: string;
}

interface Shift {
  id: string;
  employeeId: string;
  startedAt: string;
  endedAt?: string;
  openingCash: number;
  closingCash?: number;
  status: 'open' | 'closed';
}

interface SalesReport {
  date: string;
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
  paymentBreakdown: {
    cash: number;
    card: number;
  };
  topProducts: {
    productId: string;
    name: string;
    quantity: number;
    revenue: number;
  }[];
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Export singleton instance
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = new ApiClient({
  baseUrl: API_BASE_URL,
  onError: (error) => {
    console.error('API Error:', error);
  },
});

export type {
  Product,
  Order,
  OrderItem,
  CreateOrderRequest,
  Payment,
  ProcessPaymentRequest,
  Customer,
  KitchenTicket,
  Shift,
  SalesReport,
};
