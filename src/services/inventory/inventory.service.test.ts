import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryService } from './inventory.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import type { Inventory, InventoryTransaction } from '../../types/database';
import type { DatabaseAdapter } from '../../db/types';

// Mock database adapter
const mockDb: DatabaseAdapter = {
  select: vi.fn(),
  selectOne: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  isOnline: true,
  setOnlineStatus: vi.fn()
} as unknown as DatabaseAdapter;

describe('InventoryService', () => {
  let service: InventoryService;
  const accountId = 'account-123';
  const storeId = 'store-123';
  const productId = 'product-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new InventoryService();
    // Inject mock db
    (service as unknown as { db: typeof mockDb }).db = mockDb;
  });

  describe('getInventory', () => {
    it('should fetch inventory for an account', async () => {
      const mockInventory: Inventory[] = [
        {
          id: 'inv-1',
          account_id: accountId,
          store_id: storeId,
          product_id: productId,
          variant_id: null,
          quantity_on_hand: 100,
          quantity_reserved: 0,
          reorder_point: 20,
          reorder_quantity: 50,
          last_counted_at: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockDb.select.mockResolvedValue({ data: mockInventory, error: null });

      const result = await service.getInventory({ account_id: accountId });

      expect(result).toEqual(mockInventory);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter low stock items when requested', async () => {
      const mockInventory: Inventory[] = [
        {
          id: 'inv-1',
          account_id: accountId,
          store_id: storeId,
          product_id: productId,
          variant_id: null,
          quantity_on_hand: 10,
          quantity_reserved: 0,
          reorder_point: 20,
          reorder_quantity: 50,
          last_counted_at: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        },
        {
          id: 'inv-2',
          account_id: accountId,
          store_id: storeId,
          product_id: 'product-456',
          variant_id: null,
          quantity_on_hand: 100,
          quantity_reserved: 0,
          reorder_point: 20,
          reorder_quantity: 50,
          last_counted_at: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockDb.select.mockResolvedValue({ data: mockInventory, error: null });

      const result = await service.getInventory({
        account_id: accountId,
        low_stock_only: true
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('inv-1');
    });

    it('should throw error on database failure', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: 'Database error' });

      await expect(service.getInventory({ account_id: accountId })).rejects.toThrow(
        'Failed to fetch inventory'
      );
    });
  });

  describe('getInventoryById', () => {
    it('should return inventory when found', async () => {
      const mockInventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: mockInventory, error: null });

      const result = await service.getInventoryById('inv-1', accountId);

      expect(result).toEqual(mockInventory);
    });

    it('should throw NotFoundError when inventory not found', async () => {
      mockDb.selectOne.mockResolvedValue({ data: null, error: 'Not found' });

      await expect(service.getInventoryById('inv-1', accountId)).rejects.toThrow();
      try {
        await service.getInventoryById('inv-1', accountId);
      } catch (error) {
        expect(error).toHaveProperty('code', 'NOT_FOUND');
      }
    });
  });

  describe('createInventory', () => {
    it('should create inventory record', async () => {
      const mockInventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      // Mock getProductInventory to return null (no existing inventory)
      mockDb.select.mockResolvedValue({ data: [], error: null });
      mockDb.insert.mockResolvedValue({ data: mockInventory, error: null });

      const result = await service.createInventory({
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        quantity_on_hand: 100,
        reorder_point: 20,
        reorder_quantity: 50
      });

      expect(result).toEqual(mockInventory);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw ValidationError when inventory already exists', async () => {
      const existingInventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.select.mockResolvedValue({ data: [existingInventory], error: null });

      await expect(
        service.createInventory({
          account_id: accountId,
          store_id: storeId,
          product_id: productId
        })
      ).rejects.toThrow();
      try {
        await service.createInventory({
          account_id: accountId,
          store_id: storeId,
          product_id: productId
        });
      } catch (error) {
        expect(error).toHaveProperty('code', 'VALIDATION_ERROR');
      }
    });
  });

  describe('adjustStock', () => {
    it('should increase stock quantity', async () => {
      const inventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const transaction: InventoryTransaction = {
        id: 'trans-1',
        account_id: accountId,
        inventory_id: 'inv-1',
        transaction_type: 'purchase',
        quantity_change: 50,
        quantity_before: 100,
        quantity_after: 150,
        reference_type: null,
        reference_id: null,
        reason: null,
        notes: null,
        employee_id: null,
        created_at: '2025-01-01T00:00:00Z'
      };

      const updatedInventory = { ...inventory, quantity_on_hand: 150 };

      mockDb.selectOne.mockResolvedValue({ data: inventory, error: null });
      mockDb.insert.mockResolvedValue({ data: transaction, error: null });
      mockDb.update.mockResolvedValue({ data: updatedInventory, error: null });

      const result = await service.adjustStock({
        account_id: accountId,
        inventory_id: 'inv-1',
        transaction_type: 'purchase',
        quantity_change: 50
      });

      expect(result.inventory.quantity_on_hand).toBe(150);
      expect(result.transaction.quantity_change).toBe(50);
    });

    it('should decrease stock quantity', async () => {
      const inventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const transaction: InventoryTransaction = {
        id: 'trans-1',
        account_id: accountId,
        inventory_id: 'inv-1',
        transaction_type: 'sale',
        quantity_change: -30,
        quantity_before: 100,
        quantity_after: 70,
        reference_type: 'order',
        reference_id: 'order-1',
        reason: null,
        notes: null,
        employee_id: null,
        created_at: '2025-01-01T00:00:00Z'
      };

      const updatedInventory = { ...inventory, quantity_on_hand: 70 };

      mockDb.selectOne.mockResolvedValue({ data: inventory, error: null });
      mockDb.insert.mockResolvedValue({ data: transaction, error: null });
      mockDb.update.mockResolvedValue({ data: updatedInventory, error: null });

      const result = await service.adjustStock({
        account_id: accountId,
        inventory_id: 'inv-1',
        transaction_type: 'sale',
        quantity_change: -30,
        reference_type: 'order',
        reference_id: 'order-1'
      });

      expect(result.inventory.quantity_on_hand).toBe(70);
      expect(result.transaction.quantity_change).toBe(-30);
    });

    it('should throw ValidationError when quantity change is zero', async () => {
      const inventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: inventory, error: null });

      await expect(
        service.adjustStock({
          account_id: accountId,
          inventory_id: 'inv-1',
          transaction_type: 'adjustment',
          quantity_change: 0
        })
      ).rejects.toThrow();
      try {
        await service.adjustStock({
          account_id: accountId,
          inventory_id: 'inv-1',
          transaction_type: 'adjustment',
          quantity_change: 0
        });
      } catch (error) {
        expect(error).toHaveProperty('code', 'VALIDATION_ERROR');
      }
    });

    it('should throw ValidationError when insufficient stock', async () => {
      const inventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 10,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: inventory, error: null });

      await expect(
        service.adjustStock({
          account_id: accountId,
          inventory_id: 'inv-1',
          transaction_type: 'sale',
          quantity_change: -50 // Trying to sell 50 when only 10 available
        })
      ).rejects.toThrow();
      try {
        await service.adjustStock({
          account_id: accountId,
          inventory_id: 'inv-1',
          transaction_type: 'sale',
          quantity_change: -50
        });
      } catch (error) {
        expect(error).toHaveProperty('code', 'VALIDATION_ERROR');
      }
    });
  });

  describe('reserveStock', () => {
    it('should reserve stock for an order', async () => {
      const inventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const updatedInventory = { ...inventory, quantity_reserved: 30 };

      mockDb.selectOne.mockResolvedValue({ data: inventory, error: null });
      mockDb.update.mockResolvedValue({ data: updatedInventory, error: null });

      const result = await service.reserveStock('inv-1', accountId, 30);

      expect(result.quantity_reserved).toBe(30);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw ValidationError when insufficient available stock', async () => {
      const inventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 80, // Already reserved 80
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      mockDb.selectOne.mockResolvedValue({ data: inventory, error: null });

      await expect(service.reserveStock('inv-1', accountId, 30)).rejects.toThrow();
      try {
        await service.reserveStock('inv-1', accountId, 30); // Only 20 available (100 - 80)
      } catch (error) {
        expect(error).toHaveProperty('code', 'VALIDATION_ERROR');
      }
    });
  });

  describe('releaseReservedStock', () => {
    it('should release reserved stock', async () => {
      const inventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 50,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const updatedInventory = { ...inventory, quantity_reserved: 20 };

      mockDb.selectOne.mockResolvedValue({ data: inventory, error: null });
      mockDb.update.mockResolvedValue({ data: updatedInventory, error: null });

      const result = await service.releaseReservedStock('inv-1', accountId, 30);

      expect(result.quantity_reserved).toBe(20);
    });
  });

  describe('transferStock', () => {
    it('should transfer stock between stores', async () => {
      const fromInventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: 'store-from',
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const toInventory: Inventory = {
        id: 'inv-2',
        account_id: accountId,
        store_id: 'store-to',
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 50,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      // Mock getProductInventory for source
      mockDb.select.mockResolvedValueOnce({ data: [fromInventory], error: null });
      // Mock getProductInventory for destination
      mockDb.select.mockResolvedValueOnce({ data: [toInventory], error: null });
      // Mock adjustStock calls (from and to)
      mockDb.selectOne
        .mockResolvedValueOnce({ data: fromInventory, error: null })
        .mockResolvedValueOnce({ data: toInventory, error: null });
      mockDb.insert.mockResolvedValue({ data: {} as InventoryTransaction, error: null });
      mockDb.update.mockResolvedValue({ data: {} as Inventory, error: null });

      const result = await service.transferStock({
        account_id: accountId,
        from_store_id: 'store-from',
        to_store_id: 'store-to',
        product_id: productId,
        quantity: 30
      });

      expect(result).toHaveProperty('from_inventory');
      expect(result).toHaveProperty('to_inventory');
    });

    it('should throw ValidationError when transferring to same store', async () => {
      await expect(
        service.transferStock({
          account_id: accountId,
          from_store_id: storeId,
          to_store_id: storeId,
          product_id: productId,
          quantity: 30
        })
      ).rejects.toThrow();
      try {
        await service.transferStock({
          account_id: accountId,
          from_store_id: storeId,
          to_store_id: storeId,
          product_id: productId,
          quantity: 30
        });
      } catch (error) {
        expect(error).toHaveProperty('code', 'VALIDATION_ERROR');
      }
    });

    it('should throw NotFoundError when source inventory not found', async () => {
      mockDb.select.mockResolvedValue({ data: [], error: null });

      await expect(
        service.transferStock({
          account_id: accountId,
          from_store_id: 'store-from',
          to_store_id: 'store-to',
          product_id: productId,
          quantity: 30
        })
      ).rejects.toThrow();
      try {
        await service.transferStock({
          account_id: accountId,
          from_store_id: 'store-from',
          to_store_id: 'store-to',
          product_id: productId,
          quantity: 30
        });
      } catch (error) {
        expect(error).toHaveProperty('code', 'NOT_FOUND');
      }
    });
  });

  describe('performStockCount', () => {
    it('should perform stock count and create adjustments', async () => {
      const inventory: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      // Mock getProductInventory
      mockDb.select.mockResolvedValue({ data: [inventory], error: null });
      // Mock adjustStock calls
      mockDb.selectOne.mockResolvedValue({ data: inventory, error: null });
      mockDb.insert.mockResolvedValue({ data: {} as InventoryTransaction, error: null });
      mockDb.update.mockResolvedValue({ data: inventory, error: null });

      const result = await service.performStockCount({
        account_id: accountId,
        store_id: storeId,
        counts: [
          {
            product_id: productId,
            counted_quantity: 95 // Variance of -5
          }
        ]
      });

      expect(result.adjustments).toHaveLength(1);
      expect(result.summary.items_with_variance).toBe(1);
      expect(result.summary.total_negative_variance).toBe(5);
    });

    it('should handle multiple items with variances', async () => {
      const inventory1: Inventory = {
        id: 'inv-1',
        account_id: accountId,
        store_id: storeId,
        product_id: productId,
        variant_id: null,
        quantity_on_hand: 100,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const inventory2: Inventory = {
        id: 'inv-2',
        account_id: accountId,
        store_id: storeId,
        product_id: 'product-456',
        variant_id: null,
        quantity_on_hand: 50,
        quantity_reserved: 0,
        reorder_point: 20,
        reorder_quantity: 50,
        last_counted_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      // Mock getProductInventory for each product
      mockDb.select
        .mockResolvedValueOnce({ data: [inventory1], error: null })
        .mockResolvedValueOnce({ data: [inventory2], error: null });
      // Mock adjustStock calls
      mockDb.selectOne
        .mockResolvedValueOnce({ data: inventory1, error: null })
        .mockResolvedValueOnce({ data: inventory2, error: null });
      mockDb.insert.mockResolvedValue({ data: {} as InventoryTransaction, error: null });
      mockDb.update.mockResolvedValue({ data: inventory1, error: null });

      const result = await service.performStockCount({
        account_id: accountId,
        store_id: storeId,
        counts: [
          {
            product_id: productId,
            counted_quantity: 95 // Variance of -5
          },
          {
            product_id: 'product-456',
            counted_quantity: 50 // No variance
          }
        ]
      });

      expect(result.adjustments).toHaveLength(1); // Only one with variance
      expect(result.summary.total_items).toBe(2);
      expect(result.summary.items_with_variance).toBe(1);
    });
  });

  describe('getLowStockItems', () => {
    it('should return items below reorder point', async () => {
      const lowStockInventory: Inventory[] = [
        {
          id: 'inv-1',
          account_id: accountId,
          store_id: storeId,
          product_id: productId,
          variant_id: null,
          quantity_on_hand: 10,
          quantity_reserved: 0,
          reorder_point: 20,
          reorder_quantity: 50,
          last_counted_at: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      mockDb.select.mockResolvedValue({ data: lowStockInventory, error: null });

      const result = await service.getLowStockItems(accountId, storeId);

      expect(result).toHaveLength(1);
      expect(result[0].stock_shortage).toBe(10); // 20 - 10
    });
  });
});

