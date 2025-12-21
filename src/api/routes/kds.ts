import { z } from 'zod';
import { authenticate, requireRole } from '../../auth/middleware';
import { KdsService } from '../../services/kds/kds.service';
import type { ApiRequest, ApiResponse } from '../../types/api';
import type { KitchenStatus, KitchenTicketStatus } from '../../types/database';
import { validateBody, validateParams, validateQuery } from '../middleware/validation';
import { paginatedResponse, successResponse } from '../response';
import type { Router } from '../router';

const kdsService = new KdsService();

const ticketStatusEnum = z.enum(['new', 'in_progress', 'done', 'cancelled']);
const itemStatusEnum = z.enum(['pending', 'preparing', 'ready', 'served', 'cancelled']);

const getTicketsQuerySchema = z.object({
  store_id: z.string().uuid().optional(),
  station: z.string().optional(),
  status: ticketStatusEnum.optional(),
  assigned_to: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50)
});

const createTicketSchema = z.object({
  order_id: z.string().uuid(),
  store_id: z.string().uuid(),
  station: z.string().nullable().optional(),
  priority: z.number().int().nonnegative().default(0)
});

const updateStatusSchema = z.object({
  status: ticketStatusEnum,
  assigned_to: z.string().uuid().nullable().optional()
});

const updateItemStatusSchema = z.object({
  status: itemStatusEnum
});

const updatePrioritySchema = z.object({
  priority: z.number().int().nonnegative()
});

const setEstimatedTimeSchema = z.object({
  minutes: z.number().int().positive()
});

/**
 * Register KDS (Kitchen Display System) routes
 */
export function registerKdsRoutes(router: Router): void {
  /**
   * GET /api/v1/kds/tickets
   * Get kitchen tickets
   */
  router.get(
    '/api/v1/kds/tickets',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const query = getTicketsQuerySchema.parse(req.query || {});

      // Get all matching tickets for accurate total count
      const allTickets = await kdsService.getTickets({
        account_id: accountId,
        store_id: query.store_id,
        station: query.station,
        status: query.status as KitchenTicketStatus | undefined,
        assigned_to: query.assigned_to
      });

      const start = (query.page - 1) * query.limit;
      const paginatedTickets = allTickets.slice(start, start + query.limit);

      paginatedResponse(res, paginatedTickets, allTickets.length, query.page, query.limit, {
        requestId: req.requestId
      });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'kitchen'),
      validateQuery(getTicketsQuerySchema)
    ]
  );

  /**
   * GET /api/v1/kds/tickets/active
   * Get active tickets (new or in progress)
   */
  router.get(
    '/api/v1/kds/tickets/active',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const { store_id } = z
        .object({ store_id: z.string().uuid().optional() })
        .parse(req.query || {});

      const tickets = await kdsService.getActiveTickets(accountId, store_id);

      successResponse(res, tickets, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'kitchen'),
      validateQuery(z.object({ store_id: z.string().uuid().optional() }))
    ]
  );

  /**
   * GET /api/v1/kds/tickets/:id
   * Get a specific ticket
   */
  router.get(
    '/api/v1/kds/tickets/:id',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const ticketId = req.params.id;

      const ticket = await kdsService.getTicketById(ticketId, accountId);

      successResponse(res, ticket, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'kitchen'),
      validateParams(z.object({ id: z.string().uuid() }))
    ]
  );

  /**
   * POST /api/v1/kds/tickets
   * Create a kitchen ticket from an order
   */
  router.post(
    '/api/v1/kds/tickets',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const input = createTicketSchema.parse(req.body);

      const ticket = await kdsService.createTicketFromOrder({
        account_id: accountId,
        store_id: input.store_id,
        order_id: input.order_id,
        station: input.station,
        priority: input.priority
      });

      successResponse(res, ticket, 201, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'cashier'),
      validateBody(createTicketSchema)
    ]
  );

  /**
   * PUT /api/v1/kds/tickets/:id/status
   * Update ticket status
   */
  router.put(
    '/api/v1/kds/tickets/:id/status',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const ticketId = req.params.id;
      const input = updateStatusSchema.parse(req.body);

      const ticket = await kdsService.updateTicketStatus({
        ticket_id: ticketId,
        account_id: accountId,
        status: input.status as KitchenTicketStatus,
        assigned_to: input.assigned_to
      });

      successResponse(res, ticket, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'kitchen'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(updateStatusSchema)
    ]
  );

  /**
   * POST /api/v1/kds/tickets/:id/start
   * Start working on a ticket
   */
  router.post(
    '/api/v1/kds/tickets/:id/start',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const ticketId = req.params.id;
      const employeeId = req.employeeId || req.userId;

      const ticket = await kdsService.startTicket(ticketId, accountId, employeeId);

      successResponse(res, ticket, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'kitchen'),
      validateParams(z.object({ id: z.string().uuid() }))
    ]
  );

  /**
   * POST /api/v1/kds/tickets/:id/bump
   * Bump (complete) a ticket
   */
  router.post(
    '/api/v1/kds/tickets/:id/bump',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const ticketId = req.params.id;

      const ticket = await kdsService.bumpTicket({
        ticket_id: ticketId,
        account_id: accountId
      });

      successResponse(res, ticket, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'kitchen'),
      validateParams(z.object({ id: z.string().uuid() }))
    ]
  );

  /**
   * POST /api/v1/kds/tickets/:id/recall
   * Recall a bumped ticket
   */
  router.post(
    '/api/v1/kds/tickets/:id/recall',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const ticketId = req.params.id;

      const ticket = await kdsService.recallTicket(ticketId, accountId);

      successResponse(res, ticket, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'kitchen'),
      validateParams(z.object({ id: z.string().uuid() }))
    ]
  );

  /**
   * POST /api/v1/kds/tickets/:id/cancel
   * Cancel a ticket
   */
  router.post(
    '/api/v1/kds/tickets/:id/cancel',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const ticketId = req.params.id;

      const ticket = await kdsService.cancelTicket(ticketId, accountId);

      successResponse(res, ticket, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ id: z.string().uuid() }))
    ]
  );

  /**
   * PUT /api/v1/kds/tickets/:id/items/:itemId/status
   * Update a specific item's status on a ticket
   */
  router.put(
    '/api/v1/kds/tickets/:id/items/:itemId/status',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const ticketId = req.params.id;
      const itemId = req.params.itemId;
      const input = updateItemStatusSchema.parse(req.body);

      const ticket = await kdsService.updateItemStatus({
        ticket_id: ticketId,
        order_item_id: itemId,
        account_id: accountId,
        status: input.status as KitchenStatus
      });

      successResponse(res, ticket, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'kitchen'),
      validateParams(z.object({ id: z.string().uuid(), itemId: z.string().uuid() })),
      validateBody(updateItemStatusSchema)
    ]
  );

  /**
   * PUT /api/v1/kds/tickets/:id/priority
   * Update ticket priority
   */
  router.put(
    '/api/v1/kds/tickets/:id/priority',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const ticketId = req.params.id;
      const input = updatePrioritySchema.parse(req.body);

      const ticket = await kdsService.updatePriority(ticketId, accountId, input.priority);

      successResponse(res, ticket, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(updatePrioritySchema)
    ]
  );

  /**
   * PUT /api/v1/kds/tickets/:id/estimated-time
   * Set estimated completion time
   */
  router.put(
    '/api/v1/kds/tickets/:id/estimated-time',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const ticketId = req.params.id;
      const input = setEstimatedTimeSchema.parse(req.body);

      const ticket = await kdsService.setEstimatedTime(ticketId, accountId, input.minutes);

      successResponse(res, ticket, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'kitchen'),
      validateParams(z.object({ id: z.string().uuid() })),
      validateBody(setEstimatedTimeSchema)
    ]
  );

  /**
   * GET /api/v1/kds/stats
   * Get kitchen ticket statistics
   */
  router.get(
    '/api/v1/kds/stats',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const { store_id, date } = z
        .object({
          store_id: z.string().uuid().optional(),
          date: z.string().optional()
        })
        .parse(req.query || {});

      const stats = await kdsService.getTicketStats(accountId, store_id, date);

      successResponse(res, stats, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager'),
      validateQuery(z.object({ store_id: z.string().uuid().optional(), date: z.string().optional() }))
    ]
  );

  /**
   * GET /api/v1/kds/stations
   * Get tickets grouped by station
   */
  router.get(
    '/api/v1/kds/stations',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const { store_id } = z
        .object({ store_id: z.string().uuid() })
        .parse(req.query || {});

      const ticketsByStation = await kdsService.getTicketsByStation(accountId, store_id);

      successResponse(res, ticketsByStation, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'kitchen'),
      validateQuery(z.object({ store_id: z.string().uuid() }))
    ]
  );

  /**
   * GET /api/v1/orders/:orderId/kds-ticket
   * Get kitchen ticket for an order
   */
  router.get(
    '/api/v1/orders/:orderId/kds-ticket',
    async (req: ApiRequest, res: ApiResponse) => {
      const accountId = req.accountId!;
      const orderId = req.params.orderId;

      const ticket = await kdsService.getTicketByOrderId(orderId, accountId);

      if (!ticket) {
        successResponse(res, null, 404, { requestId: req.requestId });
        return;
      }

      successResponse(res, ticket, 200, { requestId: req.requestId });
    },
    [
      authenticate(),
      requireRole('owner', 'admin', 'manager', 'cashier', 'kitchen'),
      validateParams(z.object({ orderId: z.string().uuid() }))
    ]
  );
}
