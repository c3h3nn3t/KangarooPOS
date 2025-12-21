// Inventory Transfer Edge Function
// Atomically transfers inventory between stores using the RPC function

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, createResponse, createErrorResponse } from '../_shared/cors.ts';
import { getAuthContext, requireAuth, requireRole } from '../_shared/auth.ts';
import { getSupabaseAdmin, callRpc, isValidUUID, parseBody } from '../_shared/db.ts';

interface InventoryTransferItem {
  product_id: string;
  variant_id?: string;
  quantity: number;
}

interface InventoryTransferRequest {
  from_store_id: string;
  to_store_id: string;
  items: InventoryTransferItem[];
  employee_id?: string;
  notes?: string;
}

interface TransferResult {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  from_quantity_before: number;
  from_quantity_after: number;
  to_quantity_before: number;
  to_quantity_after: number;
}

interface InventoryTransferResponse {
  success: boolean;
  transfer_id: string;
  from_store_id: string;
  to_store_id: string;
  items_transferred: number;
  transfers: TransferResult[];
}

serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate request
    const auth = await getAuthContext(req);
    if (!requireAuth(auth)) {
      return createErrorResponse('Unauthorized', 401);
    }

    // Check role (manager or higher for inventory transfers)
    if (!requireRole(auth, ['manager', 'admin', 'owner'])) {
      return createErrorResponse('Insufficient permissions. Manager role required.', 403);
    }

    // Parse and validate request body
    const body = await parseBody<InventoryTransferRequest>(req, [
      'from_store_id',
      'to_store_id',
      'items'
    ]);

    // Validate store IDs
    if (!isValidUUID(body.from_store_id)) {
      return createErrorResponse('Invalid from_store_id format');
    }
    if (!isValidUUID(body.to_store_id)) {
      return createErrorResponse('Invalid to_store_id format');
    }

    // Validate stores are different
    if (body.from_store_id === body.to_store_id) {
      return createErrorResponse('Source and destination stores must be different');
    }

    // Validate items array
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return createErrorResponse('Items must be a non-empty array');
    }

    // Validate each item
    for (const item of body.items) {
      if (!isValidUUID(item.product_id)) {
        return createErrorResponse(`Invalid product_id format: ${item.product_id}`);
      }
      if (item.variant_id && !isValidUUID(item.variant_id)) {
        return createErrorResponse(`Invalid variant_id format: ${item.variant_id}`);
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        return createErrorResponse(`Quantity must be a positive number for product: ${item.product_id}`);
      }
    }

    // Get admin client to call RPC
    const supabase = getSupabaseAdmin();

    // Call the RPC function to transfer inventory
    const result = await callRpc<InventoryTransferResponse>(
      supabase,
      'transfer_inventory',
      {
        p_from_store_id: body.from_store_id,
        p_to_store_id: body.to_store_id,
        p_items: body.items,
        p_account_id: auth.accountId,
        p_employee_id: body.employee_id ?? null,
        p_notes: body.notes ?? null
      }
    );

    // Log the transfer
    console.log({
      event: 'inventory_transferred',
      transfer_id: result.transfer_id,
      from_store_id: body.from_store_id,
      to_store_id: body.to_store_id,
      items_count: result.items_transferred,
      account_id: auth.accountId,
      user_id: auth.userId
    });

    return createResponse(result);
  } catch (error) {
    console.error('Inventory transfer error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check for specific error types
    if (message.includes('not found')) {
      return createErrorResponse(message, 404);
    }
    if (message.includes('Insufficient stock')) {
      return createErrorResponse(message, 400);
    }
    if (message.includes('access denied')) {
      return createErrorResponse(message, 403);
    }

    return createErrorResponse(message, 500);
  }
});
