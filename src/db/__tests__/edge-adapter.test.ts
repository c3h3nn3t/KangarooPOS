import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { EdgeAdapter } from '../edge-adapter';
import { EDGE_SCHEMA } from '../edge-schema';

// Mock the config
vi.mock('../../config/env', () => ({
  config: {
    edge: {
      dbPath: ':memory:'
    }
  }
}));

// Mock the logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('EdgeAdapter', () => {
  let adapter: EdgeAdapter;
  let db: Database.Database;

  beforeEach(() => {
    adapter = new EdgeAdapter();
    db = adapter.getDatabase();
    // Initialize schema
    db.exec(EDGE_SCHEMA);
  });

  afterEach(() => {
    db.close();
  });

  describe('transaction', () => {
    it('should commit all operations when transaction succeeds', async () => {
      // Insert a store first for foreign key
      db.exec(`
        INSERT INTO stores (id, account_id, name, is_active, created_at, updated_at)
        VALUES ('store-1', 'acc-1', 'Test Store', 1, '2025-01-01', '2025-01-01')
      `);

      await adapter.transaction(async (tx) => {
        await tx.insert('orders', {
          id: 'order-1',
          account_id: 'acc-1',
          store_id: 'store-1',
          status: 'draft',
          subtotal_cents: 0,
          tax_cents: 0,
          discount_cents: 0,
          total_cents: 0,
          currency: 'USD',
          is_offline: 1,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        });

        await tx.insert('orders', {
          id: 'order-2',
          account_id: 'acc-1',
          store_id: 'store-1',
          status: 'pending',
          subtotal_cents: 100,
          tax_cents: 10,
          discount_cents: 0,
          total_cents: 110,
          currency: 'USD',
          is_offline: 1,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        });
      });

      // Verify both records exist
      const result = await adapter.select<{ id: string }>('orders');
      expect(result.data).toHaveLength(2);
    });

    it('should update records within transaction', async () => {
      // Setup
      db.exec(`
        INSERT INTO stores (id, account_id, name, is_active, created_at, updated_at)
        VALUES ('store-1', 'acc-1', 'Test Store', 1, '2025-01-01', '2025-01-01')
      `);

      db.exec(`
        INSERT INTO orders (id, account_id, store_id, status, subtotal_cents, tax_cents, discount_cents, total_cents, currency, is_offline, created_at, updated_at)
        VALUES ('order-1', 'acc-1', 'store-1', 'draft', 0, 0, 0, 0, 'USD', 1, '2025-01-01', '2025-01-01')
      `);

      await adapter.transaction(async (tx) => {
        await tx.update('orders', 'order-1', { status: 'completed', total_cents: 500 });
      });

      const result = await adapter.selectOne<{ status: string; total_cents: number }>(
        'orders',
        'order-1'
      );
      expect(result.data?.status).toBe('completed');
      expect(result.data?.total_cents).toBe(500);
    });

    it('should delete records within transaction', async () => {
      // Setup
      db.exec(`
        INSERT INTO stores (id, account_id, name, is_active, created_at, updated_at)
        VALUES ('store-1', 'acc-1', 'Test Store', 1, '2025-01-01', '2025-01-01')
      `);

      db.exec(`
        INSERT INTO orders (id, account_id, store_id, status, subtotal_cents, tax_cents, discount_cents, total_cents, currency, is_offline, created_at, updated_at)
        VALUES ('order-1', 'acc-1', 'store-1', 'draft', 0, 0, 0, 0, 'USD', 1, '2025-01-01', '2025-01-01'),
               ('order-2', 'acc-1', 'store-1', 'cancelled', 0, 0, 0, 0, 'USD', 1, '2025-01-01', '2025-01-01')
      `);

      await adapter.transaction(async (tx) => {
        await tx.delete('orders', 'order-2');
      });

      const result = await adapter.select<{ id: string }>('orders');
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].id).toBe('order-1');
    });

    it('should handle mixed operations in transaction', async () => {
      // Setup
      db.exec(`
        INSERT INTO stores (id, account_id, name, is_active, created_at, updated_at)
        VALUES ('store-1', 'acc-1', 'Test Store', 1, '2025-01-01', '2025-01-01')
      `);

      db.exec(`
        INSERT INTO orders (id, account_id, store_id, status, subtotal_cents, tax_cents, discount_cents, total_cents, currency, is_offline, created_at, updated_at)
        VALUES ('order-1', 'acc-1', 'store-1', 'draft', 0, 0, 0, 0, 'USD', 1, '2025-01-01', '2025-01-01')
      `);

      await adapter.transaction(async (tx) => {
        // Update existing
        await tx.update('orders', 'order-1', { status: 'pending' });

        // Insert new
        await tx.insert('orders', {
          id: 'order-2',
          account_id: 'acc-1',
          store_id: 'store-1',
          status: 'draft',
          subtotal_cents: 200,
          tax_cents: 20,
          discount_cents: 0,
          total_cents: 220,
          currency: 'USD',
          is_offline: 1,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        });
      });

      const result = await adapter.select<{ id: string; status: string }>('orders', {
        orderBy: [{ column: 'id', direction: 'asc' }]
      });

      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].status).toBe('pending');
      expect(result.data?.[1].status).toBe('draft');
    });
  });

  describe('select operations', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO tax_rules (id, account_id, name, rate_percent, is_inclusive, is_active, created_at, updated_at)
        VALUES
          ('tax-1', 'acc-1', 'Standard', 10.0, 0, 1, '2025-01-01', '2025-01-01'),
          ('tax-2', 'acc-1', 'Reduced', 5.0, 0, 1, '2025-01-01', '2025-01-01'),
          ('tax-3', 'acc-2', 'Other', 8.0, 1, 0, '2025-01-01', '2025-01-01')
      `);
    });

    it('should select all records', async () => {
      const result = await adapter.select<{ id: string }>('tax_rules');
      expect(result.data).toHaveLength(3);
    });

    it('should filter with where clause', async () => {
      const result = await adapter.select<{ id: string; name: string }>('tax_rules', {
        where: [{ column: 'account_id', operator: '=', value: 'acc-1' }]
      });
      expect(result.data).toHaveLength(2);
    });

    it('should filter with IN operator', async () => {
      const result = await adapter.select<{ id: string }>('tax_rules', {
        where: [{ column: 'id', operator: 'in', value: ['tax-1', 'tax-3'] }]
      });
      expect(result.data).toHaveLength(2);
    });

    it('should order results', async () => {
      const result = await adapter.select<{ rate_percent: number }>('tax_rules', {
        orderBy: [{ column: 'rate_percent', direction: 'desc' }]
      });
      expect(result.data?.[0].rate_percent).toBe(10);
      expect(result.data?.[2].rate_percent).toBe(5);
    });

    it('should limit results', async () => {
      const result = await adapter.select<{ id: string }>('tax_rules', {
        limit: 2
      });
      expect(result.data).toHaveLength(2);
    });
  });

  describe('selectOne', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO payment_types (id, account_id, name, type, is_active, sort_order, created_at, updated_at)
        VALUES ('pt-1', 'acc-1', 'Cash', 'cash', 1, 0, '2025-01-01', '2025-01-01')
      `);
    });

    it('should return single record by id', async () => {
      const result = await adapter.selectOne<{ name: string }>('payment_types', 'pt-1');
      expect(result.data?.name).toBe('Cash');
    });

    it('should return null for non-existent id', async () => {
      const result = await adapter.selectOne<{ name: string }>('payment_types', 'pt-missing');
      expect(result.data).toBeNull();
    });
  });

  describe('insert', () => {
    it('should insert record and return it', async () => {
      const result = await adapter.insert('tax_groups', {
        id: 'tg-1',
        account_id: 'acc-1',
        name: 'Default Tax Group',
        is_active: 1,
        created_at: '2025-01-01',
        updated_at: '2025-01-01'
      });

      expect(result.data).toBeDefined();
      expect((result.data as { id: string }).id).toBe('tg-1');
    });

    it('should generate id if not provided', async () => {
      const result = await adapter.insert('tax_groups', {
        account_id: 'acc-1',
        name: 'Auto ID Group',
        is_active: 1,
        created_at: '2025-01-01',
        updated_at: '2025-01-01'
      });

      expect(result.data).toBeDefined();
      expect((result.data as { id: string }).id).toBeDefined();
    });
  });

  describe('insertMany', () => {
    it('should insert multiple records', async () => {
      const result = await adapter.insertMany('tax_groups', [
        { id: 'tg-1', account_id: 'acc-1', name: 'Group 1', is_active: 1, created_at: '2025-01-01', updated_at: '2025-01-01' },
        { id: 'tg-2', account_id: 'acc-1', name: 'Group 2', is_active: 1, created_at: '2025-01-01', updated_at: '2025-01-01' }
      ]);

      expect(result.data).toHaveLength(2);

      const allGroups = await adapter.select('tax_groups');
      expect(allGroups.data).toHaveLength(2);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO tax_groups (id, account_id, name, is_active, created_at, updated_at)
        VALUES ('tg-1', 'acc-1', 'Original Name', 1, '2025-01-01', '2025-01-01')
      `);
    });

    it('should update record', async () => {
      const result = await adapter.update('tax_groups', 'tg-1', { name: 'Updated Name' });

      expect((result.data as { name: string }).name).toBe('Updated Name');
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO tax_groups (id, account_id, name, is_active, created_at, updated_at)
        VALUES ('tg-1', 'acc-1', 'To Delete', 1, '2025-01-01', '2025-01-01')
      `);
    });

    it('should delete record', async () => {
      const result = await adapter.delete('tax_groups', 'tg-1');

      expect(result.data?.id).toBe('tg-1');

      const remaining = await adapter.select('tax_groups');
      expect(remaining.data).toHaveLength(0);
    });
  });

  describe('sync_journal operations', () => {
    it('should store sync journal entries', async () => {
      await adapter.insert('sync_journal', {
        id: 'sj-1',
        operation: 'insert',
        table_name: 'orders',
        record_id: 'order-1',
        data: JSON.stringify({ id: 'order-1', status: 'draft' }),
        timestamp: '2025-01-01T00:00:00Z',
        edge_node_id: 'edge-1',
        status: 'pending',
        checksum: 'abc123',
        attempts: 0
      });

      const result = await adapter.select<{ id: string; status: string }>('sync_journal', {
        where: [{ column: 'status', operator: '=', value: 'pending' }]
      });

      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].id).toBe('sj-1');
    });

    it('should update sync journal status', async () => {
      db.exec(`
        INSERT INTO sync_journal (id, operation, table_name, record_id, data, timestamp, edge_node_id, status, checksum, attempts)
        VALUES ('sj-1', 'insert', 'orders', 'order-1', '{}', '2025-01-01', 'edge-1', 'pending', 'abc', 0)
      `);

      await adapter.update('sync_journal', 'sj-1', {
        status: 'synced',
        synced_at: '2025-01-01T01:00:00Z'
      });

      const result = await adapter.selectOne<{ status: string; synced_at: string }>(
        'sync_journal',
        'sj-1'
      );
      expect(result.data?.status).toBe('synced');
      expect(result.data?.synced_at).toBe('2025-01-01T01:00:00Z');
    });
  });
});
