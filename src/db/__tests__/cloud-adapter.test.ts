import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CloudAdapter } from '../cloud-adapter';

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(),
  rpc: vi.fn()
};

// Mock the database config module
vi.mock('../../config/database', () => ({
  supabase: mockSupabaseClient,
  supabaseAdmin: mockSupabaseClient
}));

describe('CloudAdapter', () => {
  let adapter: CloudAdapter;
  const accountId = 'test-account-123';

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new CloudAdapter();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('executeTransaction', () => {
    it('should execute multiple operations atomically via RPC', async () => {
      const operations = [
        { type: 'insert' as const, table: 'orders', data: { id: 'order-1', status: 'draft' } },
        { type: 'insert' as const, table: 'order_items', data: { id: 'item-1', order_id: 'order-1' } }
      ];

      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          success: true,
          results: [
            { operation: 'insert', table: 'orders', data: { id: 'order-1' } },
            { operation: 'insert', table: 'order_items', data: { id: 'item-1' } }
          ]
        },
        error: null
      });

      const result = await adapter.executeTransaction(operations, accountId);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('execute_transaction', {
        p_operations: operations,
        p_account_id: accountId
      });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('should throw error and rollback on RPC failure', async () => {
      const operations = [
        { type: 'insert' as const, table: 'orders', data: { id: 'order-1', status: 'draft' } },
        { type: 'update' as const, table: 'inventory', id: 'inv-1', data: { quantity: -1 } } // Will fail
      ];

      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Transaction failed: constraint violation' }
      });

      await expect(adapter.executeTransaction(operations, accountId)).rejects.toThrow(
        'Transaction failed: constraint violation'
      );
    });

    it('should validate table is allowed for transactions', async () => {
      const operations = [
        { type: 'insert' as const, table: 'users', data: { id: 'user-1' } } // users not in allowed tables
      ];

      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Table users is not allowed for transactions' }
      });

      await expect(adapter.executeTransaction(operations, accountId)).rejects.toThrow(
        'Table users is not allowed for transactions'
      );
    });

    it('should handle empty operations array', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: { success: true, results: [] },
        error: null
      });

      const result = await adapter.executeTransaction([], accountId);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('completeOrderWithPayment', () => {
    it('should complete order and process payment atomically', async () => {
      const orderId = 'order-123';
      const paymentData = {
        amount_cents: 1500,
        payment_type_id: 'pt-cash',
        tip_cents: 200
      };

      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          success: true,
          order_id: orderId,
          payment_id: 'pay-123',
          receipt_number: 'R-20250101-000001',
          order_status: 'completed',
          payment_status: 'captured'
        },
        error: null
      });

      const result = await adapter.completeOrderWithPayment(orderId, paymentData, accountId);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('complete_order_with_payment', {
        p_order_id: orderId,
        p_payment_data: paymentData,
        p_account_id: accountId,
        p_deduct_inventory: true
      });
      expect(result.success).toBe(true);
      expect(result.receipt_number).toBe('R-20250101-000001');
    });

    it('should rollback if order not found', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Order not found: order-missing' }
      });

      await expect(
        adapter.completeOrderWithPayment('order-missing', { amount_cents: 1000 }, accountId)
      ).rejects.toThrow('Order not found');
    });

    it('should rollback if payment amount insufficient', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Payment amount insufficient for remaining balance' }
      });

      await expect(
        adapter.completeOrderWithPayment('order-123', { amount_cents: 500 }, accountId)
      ).rejects.toThrow('Payment amount insufficient');
    });

    it('should skip inventory deduction when requested', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: { success: true, order_id: 'order-123', payment_id: 'pay-123' },
        error: null
      });

      await adapter.completeOrderWithPayment('order-123', { amount_cents: 1000 }, accountId, false);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('complete_order_with_payment', {
        p_order_id: 'order-123',
        p_payment_data: { amount_cents: 1000 },
        p_account_id: accountId,
        p_deduct_inventory: false
      });
    });
  });

  describe('transferInventory', () => {
    it('should transfer inventory between stores atomically', async () => {
      const items = [
        { product_id: 'prod-1', quantity: 10 },
        { product_id: 'prod-2', variant_id: 'var-1', quantity: 5 }
      ];

      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          success: true,
          transfer_id: 'transfer-123',
          from_store_id: 'store-1',
          to_store_id: 'store-2',
          items_transferred: 2,
          transfers: [
            {
              product_id: 'prod-1',
              variant_id: null,
              quantity: 10,
              from_quantity_before: 100,
              from_quantity_after: 90,
              to_quantity_before: 0,
              to_quantity_after: 10
            }
          ]
        },
        error: null
      });

      const result = await adapter.transferInventory(
        'store-1',
        'store-2',
        items,
        accountId,
        'emp-1',
        'Monthly transfer'
      );

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('transfer_inventory', {
        p_from_store_id: 'store-1',
        p_to_store_id: 'store-2',
        p_items: items,
        p_account_id: accountId,
        p_employee_id: 'emp-1',
        p_notes: 'Monthly transfer'
      });
      expect(result.success).toBe(true);
      expect(result.items_transferred).toBe(2);
    });

    it('should rollback if insufficient stock in source store', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Insufficient stock in source store for product: prod-1' }
      });

      await expect(
        adapter.transferInventory('store-1', 'store-2', [{ product_id: 'prod-1', quantity: 1000 }], accountId)
      ).rejects.toThrow('Insufficient stock');
    });

    it('should rollback if store not found', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Source store not found or access denied' }
      });

      await expect(
        adapter.transferInventory('store-missing', 'store-2', [{ product_id: 'prod-1', quantity: 5 }], accountId)
      ).rejects.toThrow('not found');
    });
  });

  describe('syncBatchOperations', () => {
    it('should sync multiple entries from edge node', async () => {
      const entries = [
        {
          id: 'sync-1',
          operation: 'insert' as const,
          table: 'orders',
          recordId: 'order-1',
          data: { id: 'order-1', status: 'draft' },
          timestamp: '2025-01-01T00:00:00Z',
          edgeNodeId: 'edge-1',
          status: 'pending' as const,
          checksum: 'abc123',
          attempts: 0
        }
      ];

      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          success: true,
          synced: 1,
          failed: 0,
          conflicts: 0,
          results: [{ id: 'sync-1', status: 'synced' }]
        },
        error: null
      });

      const result = await adapter.syncBatchOperations(entries, accountId, 'edge-1');

      expect(result.success).toBe(true);
      expect(result.synced).toBe(1);
    });

    it('should report conflicts without failing entire batch', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          success: true,
          synced: 1,
          failed: 0,
          conflicts: 1,
          results: [
            { id: 'sync-1', status: 'synced' },
            { id: 'sync-2', status: 'conflict', message: 'Record already exists' }
          ]
        },
        error: null
      });

      const result = await adapter.syncBatchOperations([], accountId, 'edge-1');

      expect(result.conflicts).toBe(1);
      expect(result.results.find((r) => r.status === 'conflict')).toBeDefined();
    });
  });

  describe('basic operations', () => {
    it('should insert record', async () => {
      const mockQuery = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'new-1', name: 'Test' },
          error: null
        })
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await adapter.insert('products', { name: 'Test' });

      expect(result.data).toEqual({ id: 'new-1', name: 'Test' });
      expect(result.error).toBeUndefined();
    });

    it('should update record', async () => {
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'prod-1', name: 'Updated' },
          error: null
        })
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await adapter.update('products', 'prod-1', { name: 'Updated' });

      expect(result.data).toEqual({ id: 'prod-1', name: 'Updated' });
    });

    it('should delete record', async () => {
      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      };

      mockSupabaseClient.from.mockReturnValue(mockQuery);

      const result = await adapter.delete('products', 'prod-1');

      expect(result.data).toEqual({ id: 'prod-1' });
    });
  });
});
