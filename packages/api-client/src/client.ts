import type {
  ApiConfig,
  ApiError,
  PaginatedResponse,
  PaginationParams,
  Product,
  ProductCategory,
  Order,
  CreateOrderRequest,
  Payment,
  ProcessPaymentRequest,
  Customer,
  Employee,
  InventoryItem,
  KitchenTicket,
  Shift,
  SalesReport,
  SyncStatus,
} from './types';

export class ApiClient {
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

    if (this.config.accountId) {
      headers['X-Account-Id'] = this.config.accountId;
    }

    try {
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

        // Handle 401 - try to refresh token
        if (response.status === 401 && this.config.onTokenRefresh) {
          try {
            const newToken = await this.config.onTokenRefresh();
            this.setToken(newToken);
            return this.request<T>(endpoint, options);
          } catch {
            // Token refresh failed
          }
        }

        if (this.config.onError) {
          this.config.onError(apiError);
        }

        throw apiError;
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return response.json();
    } catch (error) {
      if ((error as ApiError).code) {
        throw error;
      }

      const networkError: ApiError = {
        code: 'NETWORK_ERROR',
        message: 'Network request failed',
        status: 0,
      };

      if (this.config.onError) {
        this.config.onError(networkError);
      }

      throw networkError;
    }
  }

  private buildQueryString(params: Record<string, unknown>): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const query = searchParams.toString();
    return query ? `?${query}` : '';
  }

  // ============ Products ============

  async getProducts(
    params: PaginationParams & { categoryId?: string; search?: string } = {}
  ): Promise<PaginatedResponse<Product>> {
    const query = this.buildQueryString(params);
    return this.request(`/products${query}`);
  }

  async getProduct(id: string): Promise<Product> {
    return this.request(`/products/${id}`);
  }

  async createProduct(data: Partial<Product>): Promise<Product> {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    return this.request(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteProduct(id: string): Promise<void> {
    return this.request(`/products/${id}`, { method: 'DELETE' });
  }

  // ============ Categories ============

  async getCategories(): Promise<ProductCategory[]> {
    return this.request('/products/categories');
  }

  async createCategory(data: Partial<ProductCategory>): Promise<ProductCategory> {
    return this.request('/products/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============ Orders ============

  async getOrders(
    params: PaginationParams & { status?: string; date?: string } = {}
  ): Promise<PaginatedResponse<Order>> {
    const query = this.buildQueryString(params);
    return this.request(`/orders${query}`);
  }

  async getOrder(id: string): Promise<Order> {
    return this.request(`/orders/${id}`);
  }

  async createOrder(data: CreateOrderRequest): Promise<Order> {
    return this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateOrderStatus(
    id: string,
    status: Order['status']
  ): Promise<Order> {
    return this.request(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async cancelOrder(id: string, reason?: string): Promise<Order> {
    return this.request(`/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // ============ Payments ============

  async processPayment(data: ProcessPaymentRequest): Promise<Payment> {
    return this.request('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPayment(id: string): Promise<Payment> {
    return this.request(`/payments/${id}`);
  }

  async refundPayment(
    id: string,
    amount?: number,
    reason?: string
  ): Promise<Payment> {
    return this.request(`/payments/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    });
  }

  // ============ Customers ============

  async getCustomers(
    params: PaginationParams & { search?: string } = {}
  ): Promise<PaginatedResponse<Customer>> {
    const query = this.buildQueryString(params);
    return this.request(`/customers${query}`);
  }

  async getCustomer(id: string): Promise<Customer> {
    return this.request(`/customers/${id}`);
  }

  async createCustomer(data: Partial<Customer>): Promise<Customer> {
    return this.request('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    return this.request(`/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async searchCustomers(query: string): Promise<Customer[]> {
    return this.request(`/customers/search?q=${encodeURIComponent(query)}`);
  }

  // ============ Employees ============

  async getEmployees(): Promise<Employee[]> {
    return this.request('/employees');
  }

  async getEmployee(id: string): Promise<Employee> {
    return this.request(`/employees/${id}`);
  }

  async verifyPin(pin: string): Promise<{ employee: Employee; token: string }> {
    return this.request('/employees/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  }

  // ============ Inventory ============

  async getInventory(
    params: PaginationParams & { lowStock?: boolean } = {}
  ): Promise<PaginatedResponse<InventoryItem>> {
    const query = this.buildQueryString(params);
    return this.request(`/inventory${query}`);
  }

  async adjustInventory(
    productId: string,
    adjustment: number,
    reason?: string
  ): Promise<InventoryItem> {
    return this.request(`/inventory/${productId}/adjust`, {
      method: 'POST',
      body: JSON.stringify({ adjustment, reason }),
    });
  }

  // ============ Kitchen (KDS) ============

  async getKitchenTickets(
    params: { status?: string; station?: string } = {}
  ): Promise<KitchenTicket[]> {
    const query = this.buildQueryString(params);
    return this.request(`/kds/tickets${query}`);
  }

  async updateTicketStatus(
    id: string,
    status: KitchenTicket['status']
  ): Promise<KitchenTicket> {
    return this.request(`/kds/tickets/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async bumpTicket(id: string): Promise<KitchenTicket> {
    return this.request(`/kds/tickets/${id}/bump`, { method: 'POST' });
  }

  // ============ Shifts ============

  async getCurrentShift(): Promise<Shift | null> {
    return this.request('/shifts/current');
  }

  async openShift(openingCash: number): Promise<Shift> {
    return this.request('/shifts/open', {
      method: 'POST',
      body: JSON.stringify({ openingCash }),
    });
  }

  async closeShift(closingCash: number, notes?: string): Promise<Shift> {
    return this.request('/shifts/close', {
      method: 'POST',
      body: JSON.stringify({ closingCash, notes }),
    });
  }

  // ============ Reports ============

  async getSalesReport(
    params: { startDate: string; endDate: string; storeId?: string } = {
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    }
  ): Promise<SalesReport> {
    const query = this.buildQueryString(params);
    return this.request(`/reports/sales${query}`);
  }

  // ============ Sync ============

  async getSyncStatus(): Promise<SyncStatus> {
    return this.request('/sync/status');
  }

  async pushChanges(changes: unknown[]): Promise<{ synced: number }> {
    return this.request('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    });
  }

  async pullChanges(since: string): Promise<{ changes: unknown[] }> {
    return this.request(`/sync/pull?since=${encodeURIComponent(since)}`);
  }

  // ============ Health ============

  async checkHealth(): Promise<{ status: string; timestamp: string }> {
    return this.request('/health');
  }
}
