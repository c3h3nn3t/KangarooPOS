import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockRouter,
  createAuthenticatedRequest,
  createMockResponse,
  createJsonRequest,
  findRoute,
  TEST_IDS
} from '../../__tests__/helpers/mock-router';
import { registerKdsRoutes } from '../kds';

// Mock KdsService - use vi.hoisted() to define before vi.mock() hoisting
const { mockKdsService } = vi.hoisted(() => {
  const mock = {
    getTickets: vi.fn(),
    getActiveTickets: vi.fn(),
    getTicketById: vi.fn(),
    getTicketByOrderId: vi.fn(),
    createTicketFromOrder: vi.fn(),
    updateTicketStatus: vi.fn(),
    startTicket: vi.fn(),
    bumpTicket: vi.fn(),
    recallTicket: vi.fn(),
    cancelTicket: vi.fn(),
    updateItemStatus: vi.fn(),
    updatePriority: vi.fn(),
    setEstimatedTime: vi.fn(),
    getTicketStats: vi.fn(),
    getTicketsByStation: vi.fn()
  };
  return { mockKdsService: mock };
});

vi.mock('../../../services/kds/kds.service', () => ({
  KdsService: vi.fn(() => mockKdsService)
}));

vi.mock('../../../auth/middleware', () => ({
  authenticate: () => vi.fn((_req, _res, next) => next()),
  requireRole: () => vi.fn((_req, _res, next) => next())
}));

describe('KDS Routes', () => {
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    router = createMockRouter();
    registerKdsRoutes(router);
  });

  describe('Route Registration', () => {
    it('should register all KDS routes', () => {
      const paths = router.routes.map((r) => `${r.method} ${r.path}`);

      expect(paths).toContain('GET /api/v1/kds/tickets');
      expect(paths).toContain('GET /api/v1/kds/tickets/active');
      expect(paths).toContain('GET /api/v1/kds/tickets/:id');
      expect(paths).toContain('POST /api/v1/kds/tickets');
      expect(paths).toContain('PUT /api/v1/kds/tickets/:id/status');
      expect(paths).toContain('POST /api/v1/kds/tickets/:id/start');
      expect(paths).toContain('POST /api/v1/kds/tickets/:id/bump');
      expect(paths).toContain('POST /api/v1/kds/tickets/:id/recall');
      expect(paths).toContain('POST /api/v1/kds/tickets/:id/cancel');
      expect(paths).toContain('PUT /api/v1/kds/tickets/:id/items/:itemId/status');
      expect(paths).toContain('PUT /api/v1/kds/tickets/:id/priority');
      expect(paths).toContain('PUT /api/v1/kds/tickets/:id/estimated-time');
      expect(paths).toContain('GET /api/v1/kds/stats');
      expect(paths).toContain('GET /api/v1/kds/stations');
      expect(paths).toContain('GET /api/v1/orders/:orderId/kds-ticket');
    });
  });

  describe('GET /api/v1/kds/tickets', () => {
    it('should list kitchen tickets with pagination', async () => {
      const mockTickets = [{ id: 'ticket-1', order_id: TEST_IDS.ORDER_ID, status: 'new' }];
      mockKdsService.getTickets.mockResolvedValue(mockTickets);

      const route = findRoute(router.routes, 'GET', '/api/v1/kds/tickets')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: {}
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockKdsService.getTickets).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        store_id: undefined,
        station: undefined,
        status: undefined,
        assigned_to: undefined
      });
    });
  });

  describe('GET /api/v1/kds/tickets/active', () => {
    it('should return active tickets', async () => {
      const activeTickets = [
        { id: 'ticket-1', status: 'new' },
        { id: 'ticket-2', status: 'in_progress' }
      ];
      mockKdsService.getActiveTickets.mockResolvedValue(activeTickets);

      const route = findRoute(router.routes, 'GET', '/api/v1/kds/tickets/active')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: { store_id: TEST_IDS.STORE_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockKdsService.getActiveTickets).toHaveBeenCalledWith(
        TEST_IDS.ACCOUNT_ID,
        TEST_IDS.STORE_ID
      );
    });
  });

  describe('POST /api/v1/kds/tickets', () => {
    it('should create ticket from order', async () => {
      const newTicket = { id: 'ticket-1', order_id: TEST_IDS.ORDER_ID, status: 'new' };
      mockKdsService.createTicketFromOrder.mockResolvedValue(newTicket);

      const route = findRoute(router.routes, 'POST', '/api/v1/kds/tickets')!;
      const req = createJsonRequest('POST', {
        order_id: TEST_IDS.ORDER_ID,
        store_id: TEST_IDS.STORE_ID,
        station: 'grill'
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockKdsService.createTicketFromOrder).toHaveBeenCalledWith({
        account_id: TEST_IDS.ACCOUNT_ID,
        store_id: TEST_IDS.STORE_ID,
        order_id: TEST_IDS.ORDER_ID,
        station: 'grill',
        priority: 0
      });
    });
  });

  describe('Ticket Actions', () => {
    describe('POST /api/v1/kds/tickets/:id/start', () => {
      it('should start working on a ticket', async () => {
        const ticket = { id: 'ticket-1', status: 'in_progress' };
        mockKdsService.startTicket.mockResolvedValue(ticket);

        const route = findRoute(router.routes, 'POST', '/api/v1/kds/tickets/:id/start')!;
        const req = createAuthenticatedRequest({
          method: 'POST',
          params: { id: 'ticket-1' }
        });
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockKdsService.startTicket).toHaveBeenCalledWith(
          'ticket-1',
          TEST_IDS.ACCOUNT_ID,
          TEST_IDS.EMPLOYEE_ID
        );
      });
    });

    describe('POST /api/v1/kds/tickets/:id/bump', () => {
      it('should bump (complete) a ticket', async () => {
        const ticket = { id: 'ticket-1', status: 'done' };
        mockKdsService.bumpTicket.mockResolvedValue(ticket);

        const route = findRoute(router.routes, 'POST', '/api/v1/kds/tickets/:id/bump')!;
        const req = createAuthenticatedRequest({
          method: 'POST',
          params: { id: 'ticket-1' }
        });
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockKdsService.bumpTicket).toHaveBeenCalledWith({
          ticket_id: 'ticket-1',
          account_id: TEST_IDS.ACCOUNT_ID
        });
      });
    });

    describe('POST /api/v1/kds/tickets/:id/recall', () => {
      it('should recall a bumped ticket', async () => {
        const ticket = { id: 'ticket-1', status: 'in_progress' };
        mockKdsService.recallTicket.mockResolvedValue(ticket);

        const route = findRoute(router.routes, 'POST', '/api/v1/kds/tickets/:id/recall')!;
        const req = createAuthenticatedRequest({
          method: 'POST',
          params: { id: 'ticket-1' }
        });
        const res = createMockResponse();

        await route.handler(req as any, res as any);

        expect(mockKdsService.recallTicket).toHaveBeenCalledWith(
          'ticket-1',
          TEST_IDS.ACCOUNT_ID
        );
      });
    });
  });

  describe('PUT /api/v1/kds/tickets/:id/items/:itemId/status', () => {
    it('should update item status on ticket', async () => {
      const ticket = { id: 'ticket-1', items: [{ id: 'item-1', status: 'ready' }] };
      mockKdsService.updateItemStatus.mockResolvedValue(ticket);

      const route = findRoute(router.routes, 'PUT', '/api/v1/kds/tickets/:id/items/:itemId/status')!;
      const req = createJsonRequest(
        'PUT',
        { status: 'ready' },
        { params: { id: 'ticket-1', itemId: 'item-1' } }
      );
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockKdsService.updateItemStatus).toHaveBeenCalledWith({
        ticket_id: 'ticket-1',
        order_item_id: 'item-1',
        account_id: TEST_IDS.ACCOUNT_ID,
        status: 'ready'
      });
    });
  });

  describe('GET /api/v1/kds/stats', () => {
    it('should return kitchen statistics', async () => {
      const stats = {
        total_tickets: 50,
        avg_completion_time_minutes: 12,
        tickets_by_status: { new: 5, in_progress: 10, done: 35 }
      };
      mockKdsService.getTicketStats.mockResolvedValue(stats);

      const route = findRoute(router.routes, 'GET', '/api/v1/kds/stats')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: { store_id: TEST_IDS.STORE_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockKdsService.getTicketStats).toHaveBeenCalledWith(
        TEST_IDS.ACCOUNT_ID,
        TEST_IDS.STORE_ID,
        undefined
      );
    });
  });

  describe('GET /api/v1/kds/stations', () => {
    it('should return tickets grouped by station', async () => {
      const ticketsByStation = {
        grill: [{ id: 'ticket-1' }],
        fryer: [{ id: 'ticket-2' }]
      };
      mockKdsService.getTicketsByStation.mockResolvedValue(ticketsByStation);

      const route = findRoute(router.routes, 'GET', '/api/v1/kds/stations')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        query: { store_id: TEST_IDS.STORE_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockKdsService.getTicketsByStation).toHaveBeenCalledWith(
        TEST_IDS.ACCOUNT_ID,
        TEST_IDS.STORE_ID
      );
    });
  });

  describe('GET /api/v1/orders/:orderId/kds-ticket', () => {
    it('should return ticket for order', async () => {
      const ticket = { id: 'ticket-1', order_id: TEST_IDS.ORDER_ID };
      mockKdsService.getTicketByOrderId.mockResolvedValue(ticket);

      const route = findRoute(router.routes, 'GET', '/api/v1/orders/:orderId/kds-ticket')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { orderId: TEST_IDS.ORDER_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(mockKdsService.getTicketByOrderId).toHaveBeenCalledWith(
        TEST_IDS.ORDER_ID,
        TEST_IDS.ACCOUNT_ID
      );
    });

    it('should return 404 if no ticket found', async () => {
      mockKdsService.getTicketByOrderId.mockResolvedValue(null);

      const route = findRoute(router.routes, 'GET', '/api/v1/orders/:orderId/kds-ticket')!;
      const req = createAuthenticatedRequest({
        method: 'GET',
        params: { orderId: TEST_IDS.ORDER_ID }
      });
      const res = createMockResponse();

      await route.handler(req as any, res as any);

      expect(res.body).toEqual({
        success: true,
        data: null,
        meta: expect.any(Object)
      });
    });
  });
});
