// Process Order Payment Edge Function
// Atomically completes an order with payment using the RPC function

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, createResponse, createErrorResponse } from '../_shared/cors.ts';
import { getAuthContext, requireAuth, requireRole } from '../_shared/auth.ts';
import { getSupabaseAdmin, callRpc, isValidUUID, parseBody } from '../_shared/db.ts';

interface ProcessOrderPaymentRequest {
  order_id: string;
  payment_data: {
    payment_type_id?: string;
    amount_cents: number;
    tip_cents?: number;
    currency?: string;
    card_brand?: string;
    card_last_four?: string;
    reference?: string;
    notes?: string;
  };
  deduct_inventory?: boolean;
}

interface ProcessOrderPaymentResponse {
  success: boolean;
  order_id: string;
  payment_id: string;
  receipt_number: string;
  order_status: string;
  payment_status: string;
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

    // Check role (cashier or higher)
    if (!requireRole(auth, ['cashier', 'manager', 'admin', 'owner'])) {
      return createErrorResponse('Insufficient permissions', 403);
    }

    // Parse and validate request body
    const body = await parseBody<ProcessOrderPaymentRequest>(req, [
      'order_id',
      'payment_data'
    ]);

    // Validate order_id
    if (!isValidUUID(body.order_id)) {
      return createErrorResponse('Invalid order_id format');
    }

    // Validate payment amount
    if (!body.payment_data.amount_cents || body.payment_data.amount_cents <= 0) {
      return createErrorResponse('Payment amount must be positive');
    }

    // Get admin client to call RPC
    const supabase = getSupabaseAdmin();

    // Call the RPC function to complete order with payment
    const result = await callRpc<ProcessOrderPaymentResponse>(
      supabase,
      'complete_order_with_payment',
      {
        p_order_id: body.order_id,
        p_payment_data: body.payment_data,
        p_account_id: auth.accountId,
        p_deduct_inventory: body.deduct_inventory ?? true
      }
    );

    // Log the transaction
    console.log({
      event: 'order_payment_processed',
      order_id: body.order_id,
      payment_id: result.payment_id,
      receipt_number: result.receipt_number,
      account_id: auth.accountId,
      user_id: auth.userId
    });

    return createResponse(result);
  } catch (error) {
    console.error('Process order payment error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check for specific error types
    if (message.includes('not found')) {
      return createErrorResponse(message, 404);
    }
    if (message.includes('cannot be completed')) {
      return createErrorResponse(message, 409);
    }
    if (message.includes('insufficient')) {
      return createErrorResponse(message, 400);
    }

    return createErrorResponse(message, 500);
  }
});
