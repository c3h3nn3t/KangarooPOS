import type { SelectOptions } from '../../db/types';
import type {
  KitchenStatus,
  KitchenTicket,
  KitchenTicketItem,
  KitchenTicketStatus,
  Order,
  OrderItem
} from '../../types/database';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { nowISO } from '../../utils/datetime';
import { BaseService } from '../base.service';

export interface CreateTicketInput {
  account_id: string;
  store_id: string;
  order_id: string;
  station?: string | null;
  priority?: number;
}

export interface UpdateTicketStatusInput {
  ticket_id: string;
  account_id: string;
  status: KitchenTicketStatus;
  assigned_to?: string | null;
}

export interface UpdateItemStatusInput {
  ticket_id: string;
  order_item_id: string;
  account_id: string;
  status: KitchenStatus;
}

export interface GetTicketsInput {
  account_id: string;
  store_id?: string;
  station?: string;
  status?: KitchenTicketStatus;
  assigned_to?: string;
}

export interface BumpTicketInput {
  ticket_id: string;
  account_id: string;
}

export interface TicketStats {
  total_tickets: number;
  pending: number;
  in_progress: number;
  done: number;
  average_time_minutes: number | null;
}

export class KdsService extends BaseService {
  /**
   * Generate a ticket number (sequential within the day)
   */
  private async generateTicketNumber(storeId: string): Promise<string> {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

    const result = await this.db.select<KitchenTicket>('kitchen_tickets', {
      where: [
        { column: 'store_id', operator: '=' as const, value: storeId },
        {
          column: 'received_at',
          operator: '>=' as const,
          value: new Date().toISOString().split('T')[0]
        }
      ]
    });

    const count = result.data?.length || 0;
    const ticketNum = (count + 1).toString().padStart(3, '0');

    return `${today}-${ticketNum}`;
  }

  /**
   * Create kitchen ticket from order
   */
  async createTicketFromOrder(input: CreateTicketInput): Promise<KitchenTicket> {
    // Get the order with items
    const orderResult = await this.db.selectOne<Order>('orders', input.order_id);
    if (orderResult.error || !orderResult.data) {
      throw new NotFoundError('Order not found');
    }

    const order = orderResult.data;
    if (order.account_id !== input.account_id) {
      throw new NotFoundError('Order not found');
    }

    // Check if ticket already exists for this order
    const existingResult = await this.db.select<KitchenTicket>('kitchen_tickets', {
      where: [{ column: 'order_id', operator: '=' as const, value: input.order_id }]
    });

    if (existingResult.data && existingResult.data.length > 0) {
      throw new ValidationError('Kitchen ticket already exists for this order');
    }

    // Get order items
    const itemsResult = await this.db.select<OrderItem>('order_items', {
      where: [{ column: 'order_id', operator: '=' as const, value: input.order_id }],
      orderBy: [{ column: 'sort_order', direction: 'asc' as const }]
    });

    if (itemsResult.error || !itemsResult.data || itemsResult.data.length === 0) {
      throw new ValidationError('Order has no items');
    }

    // Build ticket items
    const ticketItems: KitchenTicketItem[] = itemsResult.data.map((item) => ({
      order_item_id: item.id,
      name: item.name,
      quantity: item.quantity,
      modifiers: item.modifiers?.map((m) => m.name) || [],
      notes: item.notes,
      status: 'pending' as KitchenStatus
    }));

    // Generate ticket number
    const ticketNumber = await this.generateTicketNumber(input.store_id);

    // Create the ticket
    const ticket: Partial<KitchenTicket> = {
      account_id: input.account_id,
      store_id: input.store_id,
      order_id: input.order_id,
      ticket_number: ticketNumber,
      station: input.station || null,
      status: 'new',
      priority: input.priority || 0,
      items: ticketItems,
      estimated_time_minutes: null,
      actual_time_minutes: null,
      assigned_to: null,
      received_at: nowISO(),
      started_at: null,
      completed_at: null,
      bumped_at: null
    };

    const result = await this.db.insert<KitchenTicket>('kitchen_tickets', ticket);

    if (result.error || !result.data) {
      throw new Error(`Failed to create kitchen ticket: ${result.error || 'Unknown error'}`);
    }

    // Update order items with kitchen_sent_at
    for (const item of itemsResult.data) {
      await this.db.update<OrderItem>('order_items', item.id, {
        kitchen_sent_at: nowISO()
      });
    }

    return result.data;
  }

  /**
   * Get kitchen tickets
   */
  async getTickets(input: GetTicketsInput, options?: SelectOptions): Promise<KitchenTicket[]> {
    const where: Array<{ column: string; operator: '='; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: input.account_id }
    ];

    if (input.store_id) {
      where.push({ column: 'store_id', operator: '=' as const, value: input.store_id });
    }

    if (input.station) {
      where.push({ column: 'station', operator: '=' as const, value: input.station });
    }

    if (input.status) {
      where.push({ column: 'status', operator: '=' as const, value: input.status });
    }

    if (input.assigned_to) {
      where.push({ column: 'assigned_to', operator: '=' as const, value: input.assigned_to });
    }

    const result = await this.db.select<KitchenTicket>('kitchen_tickets', {
      ...options,
      where: [...where, ...(options?.where || [])],
      orderBy: [
        { column: 'priority', direction: 'desc' as const },
        { column: 'received_at', direction: 'asc' as const }
      ]
    });

    if (result.error) {
      throw new Error(`Failed to fetch tickets: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Get active tickets (new or in progress)
   */
  async getActiveTickets(accountId: string, storeId?: string): Promise<KitchenTicket[]> {
    const allTickets = await this.getTickets({
      account_id: accountId,
      store_id: storeId
    });

    return allTickets.filter((t) => t.status === 'new' || t.status === 'in_progress');
  }

  /**
   * Get ticket by ID
   */
  async getTicketById(ticketId: string, accountId: string): Promise<KitchenTicket> {
    const result = await this.db.selectOne<KitchenTicket>('kitchen_tickets', ticketId);

    if (result.error || !result.data) {
      throw new NotFoundError('Kitchen ticket not found');
    }

    if (result.data.account_id !== accountId) {
      throw new NotFoundError('Kitchen ticket not found');
    }

    return result.data;
  }

  /**
   * Get ticket for an order
   */
  async getTicketByOrderId(orderId: string, accountId: string): Promise<KitchenTicket | null> {
    const result = await this.db.select<KitchenTicket>('kitchen_tickets', {
      where: [
        { column: 'account_id', operator: '=' as const, value: accountId },
        { column: 'order_id', operator: '=' as const, value: orderId }
      ]
    });

    if (result.error || !result.data || result.data.length === 0) {
      return null;
    }

    return result.data[0];
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(input: UpdateTicketStatusInput): Promise<KitchenTicket> {
    const ticket = await this.getTicketById(input.ticket_id, input.account_id);

    // Validate status transitions
    this.validateStatusTransition(ticket.status, input.status);

    const updates: Partial<KitchenTicket> = {
      status: input.status
    };

    if (input.assigned_to !== undefined) {
      updates.assigned_to = input.assigned_to;
    }

    // Set timestamps based on status
    if (input.status === 'in_progress' && !ticket.started_at) {
      updates.started_at = nowISO();
    } else if (input.status === 'done' && !ticket.completed_at) {
      updates.completed_at = nowISO();

      // Calculate actual time
      if (ticket.received_at) {
        const received = new Date(ticket.received_at).getTime();
        const completed = Date.now();
        updates.actual_time_minutes = Math.round((completed - received) / 60000);
      }
    }

    const result = await this.db.update<KitchenTicket>('kitchen_tickets', input.ticket_id, updates);

    if (result.error || !result.data) {
      throw new Error(`Failed to update ticket: ${result.error || 'Unknown error'}`);
    }

    // If ticket is done, update order items status
    if (input.status === 'done') {
      await this.updateOrderItemsStatus(ticket.order_id, 'ready');
    }

    return result.data;
  }

  /**
   * Validate status transition
   */
  private validateStatusTransition(current: KitchenTicketStatus, next: KitchenTicketStatus): void {
    const validTransitions: Record<KitchenTicketStatus, KitchenTicketStatus[]> = {
      new: ['in_progress', 'cancelled'],
      in_progress: ['done', 'cancelled'],
      done: [],
      cancelled: []
    };

    if (!validTransitions[current].includes(next)) {
      throw new ValidationError(`Cannot transition from ${current} to ${next}`);
    }
  }

  /**
   * Update a specific item status on a ticket
   */
  async updateItemStatus(input: UpdateItemStatusInput): Promise<KitchenTicket> {
    const ticket = await this.getTicketById(input.ticket_id, input.account_id);

    // Find and update the item
    const itemIndex = ticket.items.findIndex((i) => i.order_item_id === input.order_item_id);
    if (itemIndex === -1) {
      throw new NotFoundError('Item not found on ticket');
    }

    const updatedItems = [...ticket.items];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      status: input.status
    };

    // Check if all items are ready
    const allReady = updatedItems.every((i) => i.status === 'ready' || i.status === 'served');

    const updates: Partial<KitchenTicket> = {
      items: updatedItems
    };

    // Auto-complete ticket if all items are ready
    if (allReady && ticket.status !== 'done') {
      updates.status = 'done';
      updates.completed_at = nowISO();

      if (ticket.received_at) {
        const received = new Date(ticket.received_at).getTime();
        const completed = Date.now();
        updates.actual_time_minutes = Math.round((completed - received) / 60000);
      }
    }

    const result = await this.db.update<KitchenTicket>('kitchen_tickets', input.ticket_id, updates);

    if (result.error || !result.data) {
      throw new Error(`Failed to update item status: ${result.error || 'Unknown error'}`);
    }

    // Update the order item kitchen status
    await this.db.update<OrderItem>('order_items', input.order_item_id, {
      kitchen_status: input.status
    });

    return result.data;
  }

  /**
   * Bump (complete) a ticket
   */
  async bumpTicket(input: BumpTicketInput): Promise<KitchenTicket> {
    const ticket = await this.getTicketById(input.ticket_id, input.account_id);

    if (ticket.status === 'done') {
      throw new ValidationError('Ticket is already complete');
    }

    if (ticket.status === 'cancelled') {
      throw new ValidationError('Cannot bump a cancelled ticket');
    }

    // Mark all items as ready
    const updatedItems = ticket.items.map((item) => ({
      ...item,
      status: 'ready' as KitchenStatus
    }));

    const updates: Partial<KitchenTicket> = {
      status: 'done',
      items: updatedItems,
      completed_at: nowISO(),
      bumped_at: nowISO()
    };

    if (ticket.received_at) {
      const received = new Date(ticket.received_at).getTime();
      const completed = Date.now();
      updates.actual_time_minutes = Math.round((completed - received) / 60000);
    }

    const result = await this.db.update<KitchenTicket>('kitchen_tickets', input.ticket_id, updates);

    if (result.error || !result.data) {
      throw new Error(`Failed to bump ticket: ${result.error || 'Unknown error'}`);
    }

    // Update order items status
    await this.updateOrderItemsStatus(ticket.order_id, 'ready');

    return result.data;
  }

  /**
   * Update all order items kitchen status
   */
  private async updateOrderItemsStatus(orderId: string, status: KitchenStatus): Promise<void> {
    const itemsResult = await this.db.select<OrderItem>('order_items', {
      where: [{ column: 'order_id', operator: '=' as const, value: orderId }]
    });

    if (itemsResult.data) {
      for (const item of itemsResult.data) {
        await this.db.update<OrderItem>('order_items', item.id, {
          kitchen_status: status
        });
      }
    }
  }

  /**
   * Cancel a ticket
   */
  async cancelTicket(ticketId: string, accountId: string): Promise<KitchenTicket> {
    return this.updateTicketStatus({
      ticket_id: ticketId,
      account_id: accountId,
      status: 'cancelled'
    });
  }

  /**
   * Start working on a ticket
   */
  async startTicket(ticketId: string, accountId: string, assignedTo?: string): Promise<KitchenTicket> {
    return this.updateTicketStatus({
      ticket_id: ticketId,
      account_id: accountId,
      status: 'in_progress',
      assigned_to: assignedTo
    });
  }

  /**
   * Update ticket priority (for rush orders)
   */
  async updatePriority(ticketId: string, accountId: string, priority: number): Promise<KitchenTicket> {
    await this.getTicketById(ticketId, accountId);

    const result = await this.db.update<KitchenTicket>('kitchen_tickets', ticketId, {
      priority
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to update priority: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Get ticket statistics for a store
   */
  async getTicketStats(accountId: string, storeId?: string, date?: string): Promise<TicketStats> {
    const where: Array<{ column: string; operator: '=' | '>='; value: unknown }> = [
      { column: 'account_id', operator: '=' as const, value: accountId }
    ];

    if (storeId) {
      where.push({ column: 'store_id', operator: '=' as const, value: storeId });
    }

    if (date) {
      where.push({ column: 'received_at', operator: '>=' as const, value: date });
    }

    const result = await this.db.select<KitchenTicket>('kitchen_tickets', { where });

    if (result.error) {
      throw new Error(`Failed to fetch ticket stats: ${result.error}`);
    }

    const tickets = result.data;
    const pending = tickets.filter((t) => t.status === 'new').length;
    const inProgress = tickets.filter((t) => t.status === 'in_progress').length;
    const done = tickets.filter((t) => t.status === 'done').length;

    // Calculate average time
    const completedTickets = tickets.filter((t) => t.actual_time_minutes !== null);
    const totalTime = completedTickets.reduce((sum, t) => sum + (t.actual_time_minutes || 0), 0);
    const avgTime = completedTickets.length > 0 ? totalTime / completedTickets.length : null;

    return {
      total_tickets: tickets.length,
      pending,
      in_progress: inProgress,
      done,
      average_time_minutes: avgTime ? Math.round(avgTime) : null
    };
  }

  /**
   * Get tickets by station
   */
  async getTicketsByStation(
    accountId: string,
    storeId: string
  ): Promise<Record<string, KitchenTicket[]>> {
    const tickets = await this.getActiveTickets(accountId, storeId);

    const byStation: Record<string, KitchenTicket[]> = {
      unassigned: []
    };

    for (const ticket of tickets) {
      const station = ticket.station || 'unassigned';
      if (!byStation[station]) {
        byStation[station] = [];
      }
      byStation[station].push(ticket);
    }

    return byStation;
  }

  /**
   * Set estimated time for a ticket
   */
  async setEstimatedTime(
    ticketId: string,
    accountId: string,
    minutes: number
  ): Promise<KitchenTicket> {
    await this.getTicketById(ticketId, accountId);

    const result = await this.db.update<KitchenTicket>('kitchen_tickets', ticketId, {
      estimated_time_minutes: minutes
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to set estimated time: ${result.error || 'Unknown error'}`);
    }

    return result.data;
  }

  /**
   * Recall a bumped ticket (un-bump)
   */
  async recallTicket(ticketId: string, accountId: string): Promise<KitchenTicket> {
    const ticket = await this.getTicketById(ticketId, accountId);

    if (ticket.status !== 'done') {
      throw new ValidationError('Can only recall completed tickets');
    }

    // Reset items to pending
    const updatedItems = ticket.items.map((item) => ({
      ...item,
      status: 'pending' as KitchenStatus
    }));

    const result = await this.db.update<KitchenTicket>('kitchen_tickets', ticketId, {
      status: 'in_progress',
      items: updatedItems,
      completed_at: null,
      bumped_at: null,
      actual_time_minutes: null
    });

    if (result.error || !result.data) {
      throw new Error(`Failed to recall ticket: ${result.error || 'Unknown error'}`);
    }

    // Update order items status
    await this.updateOrderItemsStatus(ticket.order_id, 'preparing');

    return result.data;
  }
}
