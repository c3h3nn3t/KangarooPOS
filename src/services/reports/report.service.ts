import type { Order, Payment, Shift, OrderItem, Refund } from '../../types/database';
import { BaseService } from '../base.service';

export interface DateRangeInput {
  account_id: string;
  store_id?: string;
  start_date: string;
  end_date: string;
}

export interface SalesSummary {
  total_orders: number;
  total_sales_cents: number;
  total_refunds_cents: number;
  net_sales_cents: number;
  total_tax_cents: number;
  total_tips_cents: number;
  total_discounts_cents: number;
  average_order_cents: number;
  orders_by_status: Record<string, number>;
  orders_by_type: Record<string, number>;
}

export interface SalesByPeriod {
  period: string;
  orders: number;
  sales_cents: number;
  refunds_cents: number;
  net_cents: number;
}

export interface PaymentSummary {
  payment_type: string;
  count: number;
  amount_cents: number;
  tips_cents: number;
}

export interface ProductSalesSummary {
  product_id: string;
  product_name: string;
  quantity_sold: number;
  total_sales_cents: number;
  average_price_cents: number;
}

export interface CategorySalesSummary {
  category_id: string | null;
  category_name: string;
  quantity_sold: number;
  total_sales_cents: number;
}

export interface EmployeeSalesSummary {
  employee_id: string;
  employee_name: string;
  orders_count: number;
  total_sales_cents: number;
  total_tips_cents: number;
  average_order_cents: number;
}

export interface ReportShiftSummary {
  shift_id: string;
  employee_name: string;
  opened_at: string;
  closed_at: string | null;
  total_sales_cents: number;
  total_refunds_cents: number;
  total_tips_cents: number;
  cash_discrepancy_cents: number | null;
  transaction_count: number;
}

export interface HourlySales {
  hour: number;
  orders: number;
  sales_cents: number;
}

export interface DailySnapshot {
  date: string;
  orders: number;
  sales_cents: number;
  refunds_cents: number;
  net_cents: number;
  customers: number;
}

export class ReportService extends BaseService {
  /**
   * Get sales summary for a date range
   */
  async getSalesSummary(input: DateRangeInput): Promise<SalesSummary> {
    const where: Array<{
      column: string;
      operator: '=' | '>=' | '<=';
      value: unknown;
    }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id },
      { column: 'created_at', operator: '>=' as const, value: input.start_date },
      { column: 'created_at', operator: '<=' as const, value: input.end_date }
    ];

    if (input.store_id) {
      where.push({ column: 'store_id', operator: '=' as const, value: input.store_id });
    }

    const ordersResult = await this.db.select<Order>('orders', { where });
    const orders = ordersResult.data || [];

    // Get refunds for the period
    const refundsResult = await this.db.select<Refund>('refunds', {
      where: [
        { column: 'account_id', operator: '=' as const, value: input.account_id },
        { column: 'created_at', operator: '>=' as const, value: input.start_date },
        { column: 'created_at', operator: '<=' as const, value: input.end_date },
        { column: 'status', operator: '=' as const, value: 'processed' }
      ]
    });
    const refunds = refundsResult.data || [];

    const completedOrders = orders.filter(
      (o) => o.status === 'completed' || o.status === 'refunded'
    );

    const totalSalesCents = completedOrders.reduce((sum, o) => sum + o.total_cents, 0);
    const totalRefundsCents = refunds.reduce((sum, r) => sum + r.amount_cents, 0);
    const totalTaxCents = completedOrders.reduce((sum, o) => sum + o.tax_cents, 0);
    const totalTipsCents = completedOrders.reduce((sum, o) => sum + o.tip_cents, 0);
    const totalDiscountsCents = completedOrders.reduce((sum, o) => sum + o.discount_cents, 0);

    const ordersByStatus: Record<string, number> = {};
    const ordersByType: Record<string, number> = {};

    for (const order of orders) {
      ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
      ordersByType[order.order_type] = (ordersByType[order.order_type] || 0) + 1;
    }

    return {
      total_orders: orders.length,
      total_sales_cents: totalSalesCents,
      total_refunds_cents: totalRefundsCents,
      net_sales_cents: totalSalesCents - totalRefundsCents,
      total_tax_cents: totalTaxCents,
      total_tips_cents: totalTipsCents,
      total_discounts_cents: totalDiscountsCents,
      average_order_cents:
        completedOrders.length > 0 ? Math.round(totalSalesCents / completedOrders.length) : 0,
      orders_by_status: ordersByStatus,
      orders_by_type: ordersByType
    };
  }

  /**
   * Get sales by period (day/week/month)
   */
  async getSalesByPeriod(
    input: DateRangeInput,
    groupBy: 'day' | 'week' | 'month' = 'day'
  ): Promise<SalesByPeriod[]> {
    const where: Array<{
      column: string;
      operator: '=' | '>=' | '<=';
      value: unknown;
    }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id },
      { column: 'created_at', operator: '>=' as const, value: input.start_date },
      { column: 'created_at', operator: '<=' as const, value: input.end_date }
    ];

    if (input.store_id) {
      where.push({ column: 'store_id', operator: '=' as const, value: input.store_id });
    }

    const ordersResult = await this.db.select<Order>('orders', { where });
    const orders = ordersResult.data || [];

    const refundsResult = await this.db.select<Refund>('refunds', {
      where: [
        { column: 'account_id', operator: '=' as const, value: input.account_id },
        { column: 'created_at', operator: '>=' as const, value: input.start_date },
        { column: 'created_at', operator: '<=' as const, value: input.end_date },
        { column: 'status', operator: '=' as const, value: 'processed' }
      ]
    });
    const refunds = refundsResult.data || [];

    // Group data by period
    const periodData: Record<
      string,
      { orders: number; sales_cents: number; refunds_cents: number }
    > = {};

    for (const order of orders) {
      if (order.status !== 'completed' && order.status !== 'refunded') continue;

      const period = this.getPeriodKey(order.created_at, groupBy);
      if (!periodData[period]) {
        periodData[period] = { orders: 0, sales_cents: 0, refunds_cents: 0 };
      }
      periodData[period].orders++;
      periodData[period].sales_cents += order.total_cents;
    }

    for (const refund of refunds) {
      const period = this.getPeriodKey(refund.created_at, groupBy);
      if (!periodData[period]) {
        periodData[period] = { orders: 0, sales_cents: 0, refunds_cents: 0 };
      }
      periodData[period].refunds_cents += refund.amount_cents;
    }

    // Convert to array and sort
    return Object.entries(periodData)
      .map(([period, data]) => ({
        period,
        orders: data.orders,
        sales_cents: data.sales_cents,
        refunds_cents: data.refunds_cents,
        net_cents: data.sales_cents - data.refunds_cents
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Get period key for grouping
   */
  private getPeriodKey(dateStr: string, groupBy: 'day' | 'week' | 'month'): string {
    const date = new Date(dateStr);

    switch (groupBy) {
      case 'day':
        return date.toISOString().split('T')[0];
      case 'week': {
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        return startOfWeek.toISOString().split('T')[0];
      }
      case 'month':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  /**
   * Get payment summary by type
   */
  async getPaymentSummary(input: DateRangeInput): Promise<PaymentSummary[]> {
    const where: Array<{
      column: string;
      operator: '=' | '>=' | '<=';
      value: unknown;
    }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id },
      { column: 'created_at', operator: '>=' as const, value: input.start_date },
      { column: 'created_at', operator: '<=' as const, value: input.end_date },
      { column: 'status', operator: '=' as const, value: 'captured' }
    ];

    if (input.store_id) {
      // Would need to join with orders table for store_id filter
      // For now, get all payments and filter
    }

    const paymentsResult = await this.db.select<Payment>('payments', { where });
    const payments = paymentsResult.data || [];

    // Get payment type configs
    const typeMap: Record<string, string> = {};

    // Group by payment type
    const byType: Record<string, { count: number; amount_cents: number; tips_cents: number }> = {};

    for (const payment of payments) {
      const paymentType = payment.payment_type_id
        ? typeMap[payment.payment_type_id] || 'other'
        : 'other';

      if (!byType[paymentType]) {
        byType[paymentType] = { count: 0, amount_cents: 0, tips_cents: 0 };
      }
      byType[paymentType].count++;
      byType[paymentType].amount_cents += payment.amount_cents;
      byType[paymentType].tips_cents += payment.tip_cents;
    }

    return Object.entries(byType).map(([type, data]) => ({
      payment_type: type,
      count: data.count,
      amount_cents: data.amount_cents,
      tips_cents: data.tips_cents
    }));
  }

  /**
   * Get top selling products
   */
  async getTopProducts(
    input: DateRangeInput,
    limit = 10
  ): Promise<ProductSalesSummary[]> {
    // Get completed orders in date range
    const ordersResult = await this.db.select<Order>('orders', {
      where: [
        { column: 'account_id', operator: '=' as const, value: input.account_id },
        { column: 'created_at', operator: '>=' as const, value: input.start_date },
        { column: 'created_at', operator: '<=' as const, value: input.end_date },
        { column: 'status', operator: '=' as const, value: 'completed' }
      ]
    });

    const orders = ordersResult.data || [];
    const orderIds = orders.map((o) => o.id);

    if (orderIds.length === 0) {
      return [];
    }

    // Get order items for these orders
    const productSales: Record<
      string,
      { name: string; quantity: number; sales_cents: number }
    > = {};

    for (const orderId of orderIds) {
      const itemsResult = await this.db.select<OrderItem>('order_items', {
        where: [{ column: 'order_id', operator: '=' as const, value: orderId }]
      });

      for (const item of itemsResult.data || []) {
        if (!productSales[item.product_id]) {
          productSales[item.product_id] = { name: item.name, quantity: 0, sales_cents: 0 };
        }
        productSales[item.product_id].quantity += item.quantity;
        productSales[item.product_id].sales_cents += item.total_cents;
      }
    }

    // Sort and limit
    return Object.entries(productSales)
      .map(([productId, data]) => ({
        product_id: productId,
        product_name: data.name,
        quantity_sold: data.quantity,
        total_sales_cents: data.sales_cents,
        average_price_cents:
          data.quantity > 0 ? Math.round(data.sales_cents / data.quantity) : 0
      }))
      .sort((a, b) => b.total_sales_cents - a.total_sales_cents)
      .slice(0, limit);
  }

  /**
   * Get sales by employee
   */
  async getEmployeeSales(input: DateRangeInput): Promise<EmployeeSalesSummary[]> {
    const ordersResult = await this.db.select<Order>('orders', {
      where: [
        { column: 'account_id', operator: '=' as const, value: input.account_id },
        { column: 'created_at', operator: '>=' as const, value: input.start_date },
        { column: 'created_at', operator: '<=' as const, value: input.end_date },
        { column: 'status', operator: '=' as const, value: 'completed' }
      ]
    });

    const orders = ordersResult.data || [];

    // Group by employee
    const byEmployee: Record<
      string,
      { count: number; sales_cents: number; tips_cents: number }
    > = {};

    for (const order of orders) {
      if (!order.employee_id) continue;

      if (!byEmployee[order.employee_id]) {
        byEmployee[order.employee_id] = { count: 0, sales_cents: 0, tips_cents: 0 };
      }
      byEmployee[order.employee_id].count++;
      byEmployee[order.employee_id].sales_cents += order.total_cents;
      byEmployee[order.employee_id].tips_cents += order.tip_cents;
    }

    // Get employee names
    const results: EmployeeSalesSummary[] = [];

    for (const [employeeId, data] of Object.entries(byEmployee)) {
      const employeeResult = await this.db.selectOne<{ id: string; name: string }>(
        'employees',
        employeeId
      );
      const employeeName = employeeResult.data?.name || 'Unknown';

      results.push({
        employee_id: employeeId,
        employee_name: employeeName,
        orders_count: data.count,
        total_sales_cents: data.sales_cents,
        total_tips_cents: data.tips_cents,
        average_order_cents: data.count > 0 ? Math.round(data.sales_cents / data.count) : 0
      });
    }

    return results.sort((a, b) => b.total_sales_cents - a.total_sales_cents);
  }

  /**
   * Get shift summaries
   */
  async getShiftSummaries(input: DateRangeInput): Promise<ReportShiftSummary[]> {
    const where: Array<{
      column: string;
      operator: '=' | '>=' | '<=';
      value: unknown;
    }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id },
      { column: 'opened_at', operator: '>=' as const, value: input.start_date },
      { column: 'opened_at', operator: '<=' as const, value: input.end_date }
    ];

    if (input.store_id) {
      where.push({ column: 'store_id', operator: '=' as const, value: input.store_id });
    }

    const shiftsResult = await this.db.select<Shift>('shifts', { where });
    const shifts = shiftsResult.data || [];

    const results: ReportShiftSummary[] = [];

    for (const shift of shifts) {
      const employeeResult = await this.db.selectOne<{ id: string; name: string }>(
        'employees',
        shift.employee_id
      );
      const employeeName = employeeResult.data?.name || 'Unknown';

      results.push({
        shift_id: shift.id,
        employee_name: employeeName,
        opened_at: shift.opened_at,
        closed_at: shift.closed_at,
        total_sales_cents: shift.total_sales_cents,
        total_refunds_cents: shift.total_refunds_cents,
        total_tips_cents: shift.total_tips_cents,
        cash_discrepancy_cents: shift.discrepancy_cents,
        transaction_count: shift.transaction_count
      });
    }

    return results.sort((a, b) => b.opened_at.localeCompare(a.opened_at));
  }

  /**
   * Get hourly sales breakdown
   */
  async getHourlySales(input: DateRangeInput): Promise<HourlySales[]> {
    const ordersResult = await this.db.select<Order>('orders', {
      where: [
        { column: 'account_id', operator: '=' as const, value: input.account_id },
        { column: 'created_at', operator: '>=' as const, value: input.start_date },
        { column: 'created_at', operator: '<=' as const, value: input.end_date },
        { column: 'status', operator: '=' as const, value: 'completed' }
      ]
    });

    const orders = ordersResult.data || [];

    // Initialize all hours
    const byHour: Record<number, { orders: number; sales_cents: number }> = {};
    for (let h = 0; h < 24; h++) {
      byHour[h] = { orders: 0, sales_cents: 0 };
    }

    // Group by hour
    for (const order of orders) {
      const hour = new Date(order.created_at).getHours();
      byHour[hour].orders++;
      byHour[hour].sales_cents += order.total_cents;
    }

    return Object.entries(byHour)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        orders: data.orders,
        sales_cents: data.sales_cents
      }))
      .sort((a, b) => a.hour - b.hour);
  }

  /**
   * Get daily snapshots for dashboard
   */
  async getDailySnapshots(input: DateRangeInput): Promise<DailySnapshot[]> {
    const salesByDay = await this.getSalesByPeriod(input, 'day');

    // Get customer counts per day
    const ordersResult = await this.db.select<Order>('orders', {
      where: [
        { column: 'account_id', operator: '=' as const, value: input.account_id },
        { column: 'created_at', operator: '>=' as const, value: input.start_date },
        { column: 'created_at', operator: '<=' as const, value: input.end_date }
      ]
    });

    const orders = ordersResult.data || [];
    const customersByDay: Record<string, Set<string>> = {};

    for (const order of orders) {
      const day = order.created_at.split('T')[0];
      if (!customersByDay[day]) {
        customersByDay[day] = new Set();
      }
      if (order.customer_id) {
        customersByDay[day].add(order.customer_id);
      }
    }

    return salesByDay.map((day) => ({
      date: day.period,
      orders: day.orders,
      sales_cents: day.sales_cents,
      refunds_cents: day.refunds_cents,
      net_cents: day.net_cents,
      customers: customersByDay[day.period]?.size || 0
    }));
  }

  /**
   * Get inventory value report
   */
  async getInventoryReport(
    accountId: string,
    storeId?: string
  ): Promise<{
    total_items: number;
    total_quantity: number;
    low_stock_count: number;
    out_of_stock_count: number;
    categories: Array<{
      category_name: string;
      items: number;
      quantity: number;
    }>;
  }> {
    const where: Array<{ column: string; operator: '='; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: accountId }
    ];

    if (storeId) {
      where.push({ column: 'store_id', operator: '=' as const, value: storeId });
    }

    const inventoryResult = await this.db.select<{
      id: string;
      product_id: string;
      quantity_on_hand: number;
      reorder_point: number | null;
    }>('inventory', { where });

    const inventory = inventoryResult.data || [];

    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalQuantity = 0;

    for (const item of inventory) {
      totalQuantity += item.quantity_on_hand;

      if (item.quantity_on_hand === 0) {
        outOfStockCount++;
      } else if (item.reorder_point && item.quantity_on_hand <= item.reorder_point) {
        lowStockCount++;
      }
    }

    return {
      total_items: inventory.length,
      total_quantity: totalQuantity,
      low_stock_count: lowStockCount,
      out_of_stock_count: outOfStockCount,
      categories: [] // Would need to join with products table
    };
  }

  /**
   * Get tax report for a date range
   */
  async getTaxReport(input: DateRangeInput): Promise<{
    total_tax_cents: number;
    tax_breakdown: Array<{
      tax_name: string;
      rate_percent: number;
      amount_cents: number;
    }>;
  }> {
    const ordersResult = await this.db.select<Order>('orders', {
      where: [
        { column: 'account_id', operator: '=' as const, value: input.account_id },
        { column: 'created_at', operator: '>=' as const, value: input.start_date },
        { column: 'created_at', operator: '<=' as const, value: input.end_date },
        { column: 'status', operator: '=' as const, value: 'completed' }
      ]
    });

    const orders = ordersResult.data || [];

    let totalTaxCents = 0;
    const taxBreakdown: Record<string, { name: string; rate: number; amount: number }> = {};

    for (const order of orders) {
      totalTaxCents += order.tax_cents;

      // Aggregate from tax_breakdown
      if (order.tax_breakdown) {
        for (const tax of order.tax_breakdown) {
          const key = tax.tax_rule_id;
          if (!taxBreakdown[key]) {
            taxBreakdown[key] = {
              name: tax.name,
              rate: tax.rate_percent,
              amount: 0
            };
          }
          taxBreakdown[key].amount += tax.amount_cents;
        }
      }
    }

    return {
      total_tax_cents: totalTaxCents,
      tax_breakdown: Object.values(taxBreakdown).map((t) => ({
        tax_name: t.name,
        rate_percent: t.rate,
        amount_cents: t.amount
      }))
    };
  }

  /**
   * Get discount usage report
   */
  async getDiscountReport(input: DateRangeInput): Promise<{
    total_discount_cents: number;
    discount_count: number;
    discounts: Array<{
      discount_name: string;
      type: string;
      usage_count: number;
      amount_cents: number;
    }>;
  }> {
    const ordersResult = await this.db.select<Order>('orders', {
      where: [
        { column: 'account_id', operator: '=' as const, value: input.account_id },
        { column: 'created_at', operator: '>=' as const, value: input.start_date },
        { column: 'created_at', operator: '<=' as const, value: input.end_date }
      ]
    });

    const orders = ordersResult.data || [];

    let totalDiscountCents = 0;
    let discountCount = 0;
    const discountBreakdown: Record<
      string,
      { name: string; type: string; count: number; amount: number }
    > = {};

    for (const order of orders) {
      if (order.discount_cents > 0) {
        totalDiscountCents += order.discount_cents;
        discountCount++;

        if (order.discount_breakdown) {
          for (const discount of order.discount_breakdown) {
            const key = discount.name;
            if (!discountBreakdown[key]) {
              discountBreakdown[key] = {
                name: discount.name,
                type: discount.type,
                count: 0,
                amount: 0
              };
            }
            discountBreakdown[key].count++;
            discountBreakdown[key].amount += discount.amount_cents;
          }
        }
      }
    }

    return {
      total_discount_cents: totalDiscountCents,
      discount_count: discountCount,
      discounts: Object.values(discountBreakdown).map((d) => ({
        discount_name: d.name,
        type: d.type,
        usage_count: d.count,
        amount_cents: d.amount
      }))
    };
  }
}
