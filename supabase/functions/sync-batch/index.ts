// Sync Batch Edge Function
// Processes multiple sync journal entries atomically from edge nodes

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, createResponse, createErrorResponse } from '../_shared/cors.ts';
import { getAuthContext, requireAuth } from '../_shared/auth.ts';
import { getSupabaseAdmin, callRpc, isValidUUID, parseBody } from '../_shared/db.ts';

interface SyncJournalEntry {
  id: string;
  operation: 'insert' | 'update' | 'delete';
  table: string;
  recordId: string;
  data: Record<string, unknown>;
  timestamp: string;
  checksum: string;
}

interface SyncBatchRequest {
  entries: SyncJournalEntry[];
  edge_node_id: string;
}

interface SyncEntryResult {
  id: string;
  status: 'synced' | 'failed' | 'conflict';
  error?: string;
  message?: string;
}

interface SyncBatchResponse {
  success: boolean;
  synced: number;
  failed: number;
  conflicts: number;
  results: SyncEntryResult[];
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

    // Parse and validate request body
    const body = await parseBody<SyncBatchRequest>(req, [
      'entries',
      'edge_node_id'
    ]);

    // Validate edge_node_id
    if (!isValidUUID(body.edge_node_id)) {
      return createErrorResponse('Invalid edge_node_id format');
    }

    // Validate entries array
    if (!Array.isArray(body.entries)) {
      return createErrorResponse('Entries must be an array');
    }

    // Allow empty array (no-op sync)
    if (body.entries.length === 0) {
      return createResponse({
        success: true,
        synced: 0,
        failed: 0,
        conflicts: 0,
        results: []
      });
    }

    // Validate each entry
    const allowedTables = [
      'orders', 'order_items', 'payments', 'refunds',
      'customers', 'shifts'
    ];

    for (const entry of body.entries) {
      if (!isValidUUID(entry.id)) {
        return createErrorResponse(`Invalid entry id format: ${entry.id}`);
      }
      if (!['insert', 'update', 'delete'].includes(entry.operation)) {
        return createErrorResponse(`Invalid operation: ${entry.operation}`);
      }
      if (!allowedTables.includes(entry.table)) {
        return createErrorResponse(`Table not allowed for sync: ${entry.table}`);
      }
      if (!isValidUUID(entry.recordId)) {
        return createErrorResponse(`Invalid recordId format: ${entry.recordId}`);
      }
    }

    // Get admin client to call RPC (bypasses RLS for sync operations)
    const supabase = getSupabaseAdmin();

    // Verify edge node belongs to account
    const { data: edgeNode, error: edgeError } = await supabase
      .from('edge_nodes')
      .select('id, store_id')
      .eq('id', body.edge_node_id)
      .eq('account_id', auth.accountId)
      .single();

    if (edgeError || !edgeNode) {
      return createErrorResponse('Edge node not found or access denied', 404);
    }

    // Call the RPC function to sync batch
    const result = await callRpc<SyncBatchResponse>(
      supabase,
      'sync_batch_operations',
      {
        p_entries: body.entries,
        p_account_id: auth.accountId,
        p_edge_node_id: body.edge_node_id
      }
    );

    // Log the sync
    console.log({
      event: 'sync_batch_processed',
      edge_node_id: body.edge_node_id,
      entries_count: body.entries.length,
      synced: result.synced,
      failed: result.failed,
      conflicts: result.conflicts,
      account_id: auth.accountId,
      user_id: auth.userId
    });

    return createResponse(result);
  } catch (error) {
    console.error('Sync batch error:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    return createErrorResponse(message, 500);
  }
});
