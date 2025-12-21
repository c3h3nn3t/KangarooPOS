import { registerAuthRoutes } from '../../auth/routes';
import type { Router } from '../router';
import { registerCustomerRoutes } from './customers';
import { registerEmployeeRoutes } from './employees';
import { registerHealthRoutes } from './health';
import { registerInventoryRoutes } from './inventory';
import { registerKdsRoutes } from './kds';
import { registerOrderRoutes } from './orders';
import { registerPaymentRoutes } from './payments';
import { registerProductRoutes } from './products';
import { registerReportRoutes } from './reports';
import { registerShiftRoutes } from './shifts';
import { registerSyncRoutes } from './sync';
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

  // Employee management
  registerEmployeeRoutes(router);

  // Inventory management
  registerInventoryRoutes(router);

  // Sync management (offline/online)
  registerSyncRoutes(router);

  // Kitchen Display System
  registerKdsRoutes(router);

  // Reports and analytics
  registerReportRoutes(router);
}
