import { registerAuthRoutes } from '../../auth/routes';
import type { Router } from '../router';
import { registerCustomerRoutes } from './customers';
import { registerHealthRoutes } from './health';
import { registerOrderRoutes } from './orders';
import { registerPaymentRoutes } from './payments';
import { registerProductRoutes } from './products';
import { registerShiftRoutes } from './shifts';
import { registerV1Routes } from './v1';

export function registerRoutes(router: Router): void {
  // Root level routes (health, status)
  registerHealthRoutes(router);

  // Authentication routes
  registerAuthRoutes(router);

  // API v1 routes - all routes under /api/v1 prefix
  registerV1Routes(router);

  // Core POS routes
  registerProductRoutes(router);
  registerOrderRoutes(router);
  registerPaymentRoutes(router);
  registerCustomerRoutes(router);
  registerShiftRoutes(router);

  // Future route registrations:
  // registerInventoryRoutes(router);
  // registerEmployeeRoutes(router);
  // registerSyncRoutes(router);
  // registerKdsRoutes(router);
}
