import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KdsService } from './kds.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type {
  KitchenTicket,
  KitchenTicketStatus,
  Order,
  OrderItem
} from '../../types/database';
import type { DatabaseAdapter } from '../../db/types';

const mockDb: DatabaseAdapter = {
  select: vi.fn(),
  selectOne: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  isOnline: true,
  setOnlineStatus: vi.fn()
} as unknown as DatabaseAdapter;

describe('KdsService', () => {
  let service: KdsService;
  const accountId = 'account-123';
  const storeId = 'store-123';
  const orderId = 'order-123';
  const ticketId = 'ticket-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new KdsService();
    (service as unknown as { db: typeof mockDb }).db = mockDb;
  });

  describe('createTicketFromOrder', () => {
    const mockOrder: Order = {
      id: orderId,
      account_id: accountId,
      store_id: storeId,
      status: 'pending',
      order_type: 'dine_in',
      total_cents: 2000,
      subtotal_cents: 1800,
      tax_cents: 200,
      tip_cents: 0,
      discount_cents: 0,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    const mockOrderItems: OrderItem[] = [
      {
        id: 'item-1',
        order_id: orderId,
        product_id: 'product-1',
        name: 'Burger',
        quantity: 2,
        unit_price_cents: 1000,
        total_cents: 2000,
        modifiers: [{ name: 'No onions', price_cents: 0 }],
        notes: 'Extra cheese',
        sort_order: 1,
        kitchen_status: 'pending',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }
    ];

    it('should create a kitchen ticket from an order', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockOrder, error: null });
      mockDb.select
        .mockResolvedValueOnce({ data: [], error: null }) // No existing ticket
        .mockResolvedValueOnce({ data: mockOrderItems, error: null }); // Order items
      mockDb.insert.mockResolvedValue({
        data: {
          id: ticketId,
          account_id: accountId,
          store_id: storeId,
          order_id: orderId,
          ticket_number: '20250101-001',
          status: 'new',
          items: [
            {
              order_item_id: 'item-1',
              name: 'Burger',
              quantity: 2,
              modifiers: ['No onions'],
              notes: 'Extra cheese',
              status: 'pending'
            }
          ],
          received_at: '2025-01-01T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        } as KitchenTicket,
        error: null
      });
      mockDb.update.mockResolvedValue({ data: mockOrderItems[0], error: null });

      const result = await service.createTicketFromOrder({
        account_id: accountId,
        store_id: storeId,
        order_id: orderId
      });

      expect(result).toBeDefined();
      expect(result.order_id).toBe(orderId);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw NotFoundError when order not found', async () => {
      mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

      await expect(
        service.createTicketFromOrder({
          account_id: accountId,
          store_id: storeId,
          order_id: orderId
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when ticket already exists', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockOrder, error: null });
      mockDb.select.mockResolvedValueOnce({
        data: [{ id: ticketId }] as KitchenTicket[],
        error: null
      });

      await expect(
        service.createTicketFromOrder({
          account_id: accountId,
          store_id: storeId,
          order_id: orderId
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when order has no items', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockOrder, error: null });
      mockDb.select
        .mockResolvedValueOnce({ data: [], error: null }) // No existing ticket
        .mockResolvedValueOnce({ data: [], error: null }); // No order items

      await expect(
        service.createTicketFromOrder({
          account_id: accountId,
          store_id: storeId,
          order_id: orderId
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getTickets', () => {
    const mockTickets: KitchenTicket[] = [
      {
        id: ticketId,
        account_id: accountId,
        store_id: storeId,
        order_id: orderId,
        ticket_number: '20250101-001',
        status: 'new',
        items: [],
        received_at: '2025-01-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }
    ];

    it('should fetch tickets for an account', async () => {
      mockDb.select.mockResolvedValue({ data: mockTickets, error: null });

      const result = await service.getTickets({ account_id: accountId });

      expect(result).toEqual(mockTickets);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by store_id when provided', async () => {
      mockDb.select.mockResolvedValue({ data: mockTickets, error: null });

      await service.getTickets({ account_id: accountId, store_id: storeId });

      expect(mockDb.select).toHaveBeenCalledWith(
        'kitchen_tickets',
        expect.objectContaining({
          where: expect.arrayContaining([
            { column: 'account_id', operator: '=', value: accountId },
            { column: 'store_id', operator: '=', value: storeId }
          ])
        })
      );
    });

    it('should filter by status when provided', async () => {
      mockDb.select.mockResolvedValue({ data: mockTickets, error: null });

      await service.getTickets({
        account_id: accountId,
        status: 'in_progress'
      });

      expect(mockDb.select).toHaveBeenCalledWith(
        'kitchen_tickets',
        expect.objectContaining({
          where: expect.arrayContaining([
            { column: 'status', operator: '=', value: 'in_progress' }
          ])
        })
      );
    });
  });

  describe('getTicketById', () => {
    const mockTicket: KitchenTicket = {
      id: ticketId,
      account_id: accountId,
      store_id: storeId,
      order_id: orderId,
      ticket_number: '20250101-001',
      status: 'new',
      items: [],
      received_at: '2025-01-01T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    it('should return ticket when found', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockTicket, error: null });

      const result = await service.getTicketById(ticketId, accountId);

      expect(result).toEqual(mockTicket);
    });

    it('should throw NotFoundError when ticket not found', async () => {
      mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

      await expect(service.getTicketById(ticketId, accountId)).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when ticket belongs to different account', async () => {
      const otherTicket = { ...mockTicket, account_id: 'other-account' };
      mockDb.selectOne.mockResolvedValue({ data: otherTicket, error: null });

      await expect(service.getTicketById(ticketId, accountId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('getTicketByOrderId', () => {
    const mockTicket: KitchenTicket = {
      id: ticketId,
      account_id: accountId,
      store_id: storeId,
      order_id: orderId,
      ticket_number: '20250101-001',
      status: 'new',
      items: [],
      received_at: '2025-01-01T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    it('should return ticket when found for order', async () => {
      mockDb.select.mockResolvedValue({ data: [mockTicket], error: null });

      const result = await service.getTicketByOrderId(orderId, accountId);

      expect(result).toEqual(mockTicket);
      expect(mockDb.select).toHaveBeenCalledWith(
        'kitchen_tickets',
        expect.objectContaining({
          where: expect.arrayContaining([
            { column: 'account_id', operator: '=', value: accountId },
            { column: 'order_id', operator: '=', value: orderId }
          ])
        })
      );
    });

    it('should return null when no ticket found for order', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: null });

      const result = await service.getTicketByOrderId(orderId, accountId);

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: 'Database error' });

      const result = await service.getTicketByOrderId(orderId, accountId);

      expect(result).toBeNull();
    });
  });

  describe('updateTicketStatus', () => {
    const mockTicket: KitchenTicket = {
      id: ticketId,
      account_id: accountId,
      store_id: storeId,
      order_id: orderId,
      ticket_number: '20250101-001',
      status: 'new',
      items: [],
      received_at: '2025-01-01T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    it('should update ticket status to in_progress', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockTicket, error: null });
      mockDb.update.mockResolvedValue({
        data: { ...mockTicket, status: 'in_progress', started_at: '2025-01-01T01:00:00Z' },
        error: null
      });

      const result = await service.updateTicketStatus({
        ticket_id: ticketId,
        account_id: accountId,
        status: 'in_progress'
      });

      expect(result.status).toBe('in_progress');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid status transition', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockTicket, error: null });

      await expect(
        service.updateTicketStatus({
          ticket_id: ticketId,
          account_id: accountId,
          status: 'done' // Cannot go directly from 'new' to 'done'
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should calculate actual_time_minutes when completing ticket', async () => {
      const inProgressTicket = { ...mockTicket, status: 'in_progress' as KitchenTicketStatus };
      mockDb.selectOne.mockResolvedValue({ data: inProgressTicket, error: null });
      mockDb.update.mockResolvedValue({
        data: {
          ...inProgressTicket,
          status: 'done',
          completed_at: '2025-01-01T02:00:00Z',
          actual_time_minutes: 120
        },
        error: null
      });
      mockDb.select.mockResolvedValue({ data: [], error: null }); // Order items

      const result = await service.updateTicketStatus({
        ticket_id: ticketId,
        account_id: accountId,
        status: 'done'
      });

      expect(result.status).toBe('done');
      expect(result.actual_time_minutes).toBeDefined();
    });
  });

  describe('updateItemStatus', () => {
    const mockTicket: KitchenTicket = {
      id: ticketId,
      account_id: accountId,
      store_id: storeId,
      order_id: orderId,
      ticket_number: '20250101-001',
      status: 'in_progress',
      items: [
        {
          order_item_id: 'item-1',
          name: 'Burger',
          quantity: 1,
          modifiers: [],
          status: 'pending'
        }
      ],
      received_at: '2025-01-01T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    it('should update item status', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockTicket, error: null });
      mockDb.update.mockResolvedValue({
        data: {
          ...mockTicket,
          items: [{ ...mockTicket.items[0], status: 'ready' }]
        },
        error: null
      });

      const result = await service.updateItemStatus({
        ticket_id: ticketId,
        order_item_id: 'item-1',
        account_id: accountId,
        status: 'ready'
      });

      expect(result.items[0].status).toBe('ready');
    });

    it('should auto-complete ticket when all items are ready', async () => {
      const ticketWithItems: KitchenTicket = {
        ...mockTicket,
        items: [
          { ...mockTicket.items[0], status: 'ready' },
          {
            order_item_id: 'item-2',
            name: 'Fries',
            quantity: 1,
            modifiers: [],
            status: 'ready'
          }
        ]
      };
      mockDb.selectOne.mockResolvedValue({ data: ticketWithItems, error: null });
      mockDb.update.mockResolvedValue({
        data: {
          ...ticketWithItems,
          status: 'done',
          completed_at: '2025-01-01T02:00:00Z'
        },
        error: null
      });
      mockDb.select.mockResolvedValue({ data: [], error: null }); // Order items

      const result = await service.updateItemStatus({
        ticket_id: ticketId,
        order_item_id: 'item-1',
        account_id: accountId,
        status: 'ready'
      });

      expect(result.status).toBe('done');
    });

    it('should throw NotFoundError when item not found on ticket', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockTicket, error: null });

      await expect(
        service.updateItemStatus({
          ticket_id: ticketId,
          order_item_id: 'non-existent',
          account_id: accountId,
          status: 'ready'
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('bumpTicket', () => {
    const mockTicket: KitchenTicket = {
      id: ticketId,
      account_id: accountId,
      store_id: storeId,
      order_id: orderId,
      ticket_number: '20250101-001',
      status: 'in_progress',
      items: [
        {
          order_item_id: 'item-1',
          name: 'Burger',
          quantity: 1,
          modifiers: [],
          status: 'preparing'
        }
      ],
      received_at: '2025-01-01T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    it('should bump ticket and mark all items as ready', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockTicket, error: null });
      mockDb.update.mockResolvedValue({
        data: {
          ...mockTicket,
          status: 'done',
          items: [{ ...mockTicket.items[0], status: 'ready' }],
          bumped_at: '2025-01-01T02:00:00Z'
        },
        error: null
      });
      mockDb.select.mockResolvedValue({ data: [], error: null }); // Order items

      const result = await service.bumpTicket({
        ticket_id: ticketId,
        account_id: accountId
      });

      expect(result.status).toBe('done');
      expect(result.items.every((i) => i.status === 'ready')).toBe(true);
    });

    it('should throw ValidationError when ticket is already done', async () => {
      const doneTicket = { ...mockTicket, status: 'done' as KitchenTicketStatus };
      mockDb.selectOne.mockResolvedValue({ data: doneTicket, error: null });

      await expect(
        service.bumpTicket({
          ticket_id: ticketId,
          account_id: accountId
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when ticket is cancelled', async () => {
      const cancelledTicket = { ...mockTicket, status: 'cancelled' as KitchenTicketStatus };
      mockDb.selectOne.mockResolvedValue({ data: cancelledTicket, error: null });

      await expect(
        service.bumpTicket({
          ticket_id: ticketId,
          account_id: accountId
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getTicketStats', () => {
    const mockTickets: KitchenTicket[] = [
      {
        id: 'ticket-1',
        account_id: accountId,
        store_id: storeId,
        order_id: orderId,
        ticket_number: '20250101-001',
        status: 'new',
        items: [],
        received_at: '2025-01-01T00:00:00Z',
        actual_time_minutes: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      },
      {
        id: 'ticket-2',
        account_id: accountId,
        store_id: storeId,
        order_id: 'order-2',
        ticket_number: '20250101-002',
        status: 'in_progress',
        items: [],
        received_at: '2025-01-01T00:00:00Z',
        actual_time_minutes: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      },
      {
        id: 'ticket-3',
        account_id: accountId,
        store_id: storeId,
        order_id: 'order-3',
        ticket_number: '20250101-003',
        status: 'done',
        items: [],
        received_at: '2025-01-01T00:00:00Z',
        actual_time_minutes: 30,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }
    ];

    it('should calculate ticket statistics', async () => {
      mockDb.select.mockResolvedValue({ data: mockTickets, error: null });

      const result = await service.getTicketStats(accountId);

      expect(result.total_tickets).toBe(3);
      expect(result.pending).toBe(1);
      expect(result.in_progress).toBe(1);
      expect(result.done).toBe(1);
      expect(result.average_time_minutes).toBe(30);
    });

    it('should return null average time when no completed tickets', async () => {
      const incompleteTickets = mockTickets.filter((t) => t.status !== 'done');
      mockDb.select.mockResolvedValue({ data: incompleteTickets, error: null });

      const result = await service.getTicketStats(accountId);

      expect(result.average_time_minutes).toBeNull();
    });
  });

  describe('recallTicket', () => {
    const mockTicket: KitchenTicket = {
      id: ticketId,
      account_id: accountId,
      store_id: storeId,
      order_id: orderId,
      ticket_number: '20250101-001',
      status: 'done',
      items: [
        {
          order_item_id: 'item-1',
          name: 'Burger',
          quantity: 1,
          modifiers: [],
          status: 'ready'
        }
      ],
      received_at: '2025-01-01T00:00:00Z',
      completed_at: '2025-01-01T02:00:00Z',
      actual_time_minutes: 120,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    };

    it('should recall a completed ticket', async () => {
      mockDb.selectOne.mockResolvedValue({ data: mockTicket, error: null });
      mockDb.update.mockResolvedValue({
        data: {
          ...mockTicket,
          status: 'in_progress',
          items: [{ ...mockTicket.items[0], status: 'pending' }],
          completed_at: null,
          bumped_at: null,
          actual_time_minutes: null
        },
        error: null
      });
      mockDb.select.mockResolvedValue({ data: [], error: null }); // Order items

      const result = await service.recallTicket(ticketId, accountId);

      expect(result.status).toBe('in_progress');
      expect(result.items[0].status).toBe('pending');
    });

    it('should throw ValidationError when ticket is not done', async () => {
      const inProgressTicket = { ...mockTicket, status: 'in_progress' as KitchenTicketStatus };
      mockDb.selectOne.mockResolvedValue({ data: inProgressTicket, error: null });

      await expect(service.recallTicket(ticketId, accountId)).rejects.toThrow(ValidationError);
    });
  });
});

