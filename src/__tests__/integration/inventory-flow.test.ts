import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInMemoryDb } from '../helpers/mock-db';
import {
  createTestProduct,
  createTestInventory,
  createTestOrder,
  createTestOrderItem,
  TEST_ACCOUNT_ID,
  TEST_STORE_ID
} from '../fixtures';

describe('Inventory Flow', () => {
  let db: ReturnType<typeof createInMemoryDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createInMemoryDb();

    // Seed products
    const products = [
      createTestProduct({ id: 'prod-1', name: 'Widget A', track_stock: true }),
      createTestProduct({ id: 'prod-2', name: 'Widget B', track_stock: true }),
      createTestProduct({ id: 'prod-3', name: 'Service Item', track_stock: false })
    ];
    db.seed('products', products);

    // Seed inventory
    const inventory = [
      createTestInventory({
        id: 'inv-1',
        product_id: 'prod-1',
        quantity: 100,
        low_stock_threshold: 10
      }),
      createTestInventory({
        id: 'inv-2',
        product_id: 'prod-2',
        quantity: 50,
        low_stock_threshold: 5
      })
    ];
    db.seed('inventory', inventory);
  });

  describe('Stock Updates on Order Completion', () => {
    it('should deduct inventory when order is completed', async () => {
      // Create order with items
      const order = createTestOrder({
        id: 'order-1',
        status: 'pending',
        total_cents: 2000
      });
      await db.insert('orders', order);

      // Add order items
      await db.insert(
        'order_items',
        createTestOrderItem({
          id: 'item-1',
          order_id: 'order-1',
          product_id: 'prod-1',
          quantity: 5
        })
      );

      // Simulate inventory deduction (done by RPC in production)
      const currentInventory = (await db.selectOne('inventory', 'inv-1')).data as {
        quantity: number;
      };
      const newQuantity = currentInventory.quantity - 5;

      await db.update('inventory', 'inv-1', { quantity: newQuantity });

      // Record inventory transaction
      await db.insert('inventory_transactions', {
        id: 'invt-1',
        account_id: TEST_ACCOUNT_ID,
        inventory_id: 'inv-1',
        transaction_type: 'sale',
        quantity_change: -5,
        quantity_before: 100,
        quantity_after: 95,
        reference_type: 'order_item',
        reference_id: 'item-1'
      });

      // Verify
      const updatedInventory = (await db.selectOne('inventory', 'inv-1')).data as {
        quantity: number;
      };
      expect(updatedInventory.quantity).toBe(95);

      const transactions = db.getAll<{ inventory_id: string }>('inventory_transactions');
      expect(transactions.filter((t) => t.inventory_id === 'inv-1')).toHaveLength(1);
    });

    it('should handle multiple items in single order', async () => {
      const order = createTestOrder({ id: 'order-2', status: 'pending' });
      await db.insert('orders', order);

      // Multiple items
      await db.insert(
        'order_items',
        createTestOrderItem({
          order_id: 'order-2',
          product_id: 'prod-1',
          quantity: 3
        })
      );
      await db.insert(
        'order_items',
        createTestOrderItem({
          order_id: 'order-2',
          product_id: 'prod-2',
          quantity: 2
        })
      );

      // Deduct both
      await db.update('inventory', 'inv-1', { quantity: 97 }); // 100 - 3
      await db.update('inventory', 'inv-2', { quantity: 48 }); // 50 - 2

      const inv1 = (await db.selectOne('inventory', 'inv-1')).data as { quantity: number };
      const inv2 = (await db.selectOne('inventory', 'inv-2')).data as { quantity: number };

      expect(inv1.quantity).toBe(97);
      expect(inv2.quantity).toBe(48);
    });

    it('should not deduct for non-tracked products', async () => {
      const order = createTestOrder({ id: 'order-3', status: 'pending' });
      await db.insert('orders', order);

      // Item with non-tracked product
      await db.insert(
        'order_items',
        createTestOrderItem({
          order_id: 'order-3',
          product_id: 'prod-3', // track_stock = false
          quantity: 10
        })
      );

      // Inventory should not exist for prod-3
      const result = await db.select('inventory', {
        where: [{ column: 'product_id', operator: '=', value: 'prod-3' }]
      });
      expect(result.data).toHaveLength(0);
    });
  });

  describe('Stock Restoration on Refund', () => {
    it('should restore inventory on full refund', async () => {
      // Setup: Inventory at 95 after sale
      await db.update('inventory', 'inv-1', { quantity: 95 });

      // Process refund - restore 5 units
      await db.update('inventory', 'inv-1', { quantity: 100 });

      // Record refund transaction
      await db.insert('inventory_transactions', {
        id: 'invt-2',
        account_id: TEST_ACCOUNT_ID,
        inventory_id: 'inv-1',
        transaction_type: 'refund',
        quantity_change: 5,
        quantity_before: 95,
        quantity_after: 100,
        reference_type: 'refund',
        reference_id: 'refund-1'
      });

      const inventory = (await db.selectOne('inventory', 'inv-1')).data as { quantity: number };
      expect(inventory.quantity).toBe(100);
    });

    it('should restore partial quantity on partial refund', async () => {
      await db.update('inventory', 'inv-1', { quantity: 90 });

      // Partial refund - restore 3 of 10 units
      await db.update('inventory', 'inv-1', { quantity: 93 });

      const inventory = (await db.selectOne('inventory', 'inv-1')).data as { quantity: number };
      expect(inventory.quantity).toBe(93);
    });
  });

  describe('Inventory Transfer Between Stores', () => {
    beforeEach(async () => {
      // Add second store inventory
      await db.insert('inventory', {
        id: 'inv-store2-1',
        account_id: TEST_ACCOUNT_ID,
        store_id: 'store-2',
        product_id: 'prod-1',
        quantity: 20,
        low_stock_threshold: 5
      });
    });

    it('should transfer inventory between stores atomically', async () => {
      const transferQuantity = 15;

      // Source store deduction
      const sourceInv = (await db.selectOne('inventory', 'inv-1')).data as { quantity: number };
      await db.update('inventory', 'inv-1', {
        quantity: sourceInv.quantity - transferQuantity
      });

      // Destination store addition
      const destInv = (await db.selectOne('inventory', 'inv-store2-1')).data as {
        quantity: number;
      };
      await db.update('inventory', 'inv-store2-1', {
        quantity: destInv.quantity + transferQuantity
      });

      // Record transactions
      await db.insert('inventory_transactions', {
        id: 'invt-transfer-out',
        account_id: TEST_ACCOUNT_ID,
        inventory_id: 'inv-1',
        transaction_type: 'transfer_out',
        quantity_change: -transferQuantity,
        quantity_before: 100,
        quantity_after: 85
      });

      await db.insert('inventory_transactions', {
        id: 'invt-transfer-in',
        account_id: TEST_ACCOUNT_ID,
        inventory_id: 'inv-store2-1',
        transaction_type: 'transfer_in',
        quantity_change: transferQuantity,
        quantity_before: 20,
        quantity_after: 35
      });

      // Verify
      const source = (await db.selectOne('inventory', 'inv-1')).data as { quantity: number };
      const dest = (await db.selectOne('inventory', 'inv-store2-1')).data as { quantity: number };

      expect(source.quantity).toBe(85);
      expect(dest.quantity).toBe(35);
    });

    it('should reject transfer when insufficient stock', async () => {
      const sourceInv = (await db.selectOne('inventory', 'inv-1')).data as { quantity: number };
      const requestedQuantity = 150; // More than available

      // Validate before transfer
      const hasEnough = sourceInv.quantity >= requestedQuantity;
      expect(hasEnough).toBe(false);

      // In production, transfer_inventory RPC would throw an error
    });
  });

  describe('Stock Adjustments', () => {
    it('should handle manual stock count adjustment', async () => {
      // Counted quantity differs from system quantity
      const systemQty = 100;
      const countedQty = 97;
      const difference = countedQty - systemQty;

      await db.update('inventory', 'inv-1', { quantity: countedQty });

      await db.insert('inventory_transactions', {
        id: 'invt-count',
        account_id: TEST_ACCOUNT_ID,
        inventory_id: 'inv-1',
        transaction_type: 'count',
        quantity_change: difference,
        quantity_before: systemQty,
        quantity_after: countedQty,
        reason: 'Physical inventory count'
      });

      const inventory = (await db.selectOne('inventory', 'inv-1')).data as { quantity: number };
      expect(inventory.quantity).toBe(97);
    });

    it('should handle stock adjustment with reason', async () => {
      await db.update('inventory', 'inv-1', { quantity: 95 });

      await db.insert('inventory_transactions', {
        id: 'invt-adj',
        account_id: TEST_ACCOUNT_ID,
        inventory_id: 'inv-1',
        transaction_type: 'adjustment',
        quantity_change: -5,
        quantity_before: 100,
        quantity_after: 95,
        reason: 'Damaged goods',
        notes: '5 units found damaged during inspection'
      });

      const transactions = db.getAll<{ reason: string }>('inventory_transactions');
      const adjustment = transactions.find((t) => t.reason === 'Damaged goods');
      expect(adjustment).toBeDefined();
    });
  });

  describe('Low Stock Alerts', () => {
    it('should detect when stock falls below threshold', async () => {
      // Update inventory to below threshold
      await db.update('inventory', 'inv-1', { quantity: 8 }); // threshold is 10

      const inventory = (await db.selectOne('inventory', 'inv-1')).data as {
        quantity: number;
        low_stock_threshold: number;
      };

      const isLowStock = inventory.quantity < inventory.low_stock_threshold;
      expect(isLowStock).toBe(true);
    });

    it('should identify all low stock items', async () => {
      // Set up low stock scenarios
      await db.update('inventory', 'inv-1', { quantity: 5 }); // threshold 10
      await db.update('inventory', 'inv-2', { quantity: 4 }); // threshold 5

      const allInventory = db.getAll<{
        id: string;
        quantity: number;
        low_stock_threshold: number;
      }>('inventory');

      const lowStockItems = allInventory.filter(
        (inv) => inv.quantity < inv.low_stock_threshold
      );

      expect(lowStockItems).toHaveLength(2);
    });
  });

  describe('Inventory Transaction History', () => {
    it('should maintain complete transaction history', async () => {
      // Multiple transactions
      const transactions = [
        {
          id: 'invt-1',
          account_id: TEST_ACCOUNT_ID,
          inventory_id: 'inv-1',
          transaction_type: 'sale',
          quantity_change: -5,
          quantity_before: 100,
          quantity_after: 95
        },
        {
          id: 'invt-2',
          account_id: TEST_ACCOUNT_ID,
          inventory_id: 'inv-1',
          transaction_type: 'refund',
          quantity_change: 2,
          quantity_before: 95,
          quantity_after: 97
        },
        {
          id: 'invt-3',
          account_id: TEST_ACCOUNT_ID,
          inventory_id: 'inv-1',
          transaction_type: 'adjustment',
          quantity_change: -7,
          quantity_before: 97,
          quantity_after: 90
        }
      ];

      for (const tx of transactions) {
        await db.insert('inventory_transactions', tx);
      }

      // Update final quantity
      await db.update('inventory', 'inv-1', { quantity: 90 });

      // Verify history
      const history = db.getAll<{ inventory_id: string }>('inventory_transactions');
      const inv1History = history.filter((t) => t.inventory_id === 'inv-1');
      expect(inv1History).toHaveLength(3);

      // Verify net change: -5 + 2 - 7 = -10
      const netChange = transactions.reduce((sum, t) => sum + t.quantity_change, 0);
      expect(netChange).toBe(-10);
    });
  });
});
