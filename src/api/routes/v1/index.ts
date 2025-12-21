import type { Router } from '../../router';

/**
 * Register all v1 API routes
 * This is the main entry point for /api/v1/* routes
 * All routes registered here should be prefixed with /api/v1
 *
 * Routes are registered in the main routes/index.ts file:
 * - Product routes: /api/v1/products
 * - Order routes: /api/v1/orders
 * - Payment routes: /api/v1/payments
 * - Customer routes: /api/v1/customers
 * - Employee routes: /api/v1/employees
 * - Shift routes: /api/v1/shifts
 * - Sync routes: /api/v1/sync
 * - KDS routes: /api/v1/kds
 * - Inventory routes: /api/v1/inventory
 * - Report routes: /api/v1/reports
 */
export function registerV1Routes(_router: Router): void {
  // All v1 routes are registered in the main routes/index.ts
  // This function serves as a documentation hub for the v1 API
}
