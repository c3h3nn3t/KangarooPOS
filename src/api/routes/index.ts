import { registerAuthRoutes } from '../../auth/routes';
import type { Router } from '../router';
import { registerCustomerRoutes } from './customers';
import { registerHealthRoutes } from './health';
// import { registerPaymentRoutes } from './payments'; // TODO: Add payments routes
import { registerV1Routes } from './v1';

export function registerRoutes(router: Router): void {
  // Root level routes (health, status)
  registerHealthRoutes(router);

  // Authentication routes
  registerAuthRoutes(router);

  // API v1 routes - all routes under /api/v1 prefix
  registerV1Routes(router);

  // Payment routes
  // registerPaymentRoutes(router); // TODO: Add payments routes

  // Customer routes
  registerCustomerRoutes(router);

  // Future route registrations:
  // registerProductRoutes(router);
  // registerOrderRoutes(router);
  // registerEmployeeRoutes(router);
  // registerShiftRoutes(router);
  // registerSyncRoutes(router);
  // registerKdsRoutes(router);
}
