// Mock database adapter for testing

import { vi } from 'vitest';
import type {
  DatabaseAdapter,
  MutationResult,
  QueryResult,
  SelectOptions,
  SingleResult,
  TransactionContext
} from '../../db/types';

/**
 * Creates a mock database adapter with all methods mocked
 */
export function createMockDb(): MockDatabaseAdapter {
  return {
    type: 'cloud',
    isOnline: true,
    select: vi.fn(),
    selectOne: vi.fn(),
    insert: vi.fn(),
    insertMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn()
  } as MockDatabaseAdapter;
}

/**
 * Creates a mock database adapter that stores data in memory
 */
export function createInMemoryDb(): InMemoryDatabaseAdapter {
  const tables: Record<string, Record<string, unknown>[]> = {};

  const getTable = (name: string) => {
    if (!tables[name]) {
      tables[name] = [];
    }
    return tables[name];
  };

  return {
    type: 'edge',
    isOnline: true,
    tables,

    async select<T>(table: string, options?: SelectOptions): Promise<QueryResult<T>> {
      let data = [...getTable(table)] as T[];

      // Apply where clauses
      if (options?.where) {
        for (const clause of options.where) {
          data = data.filter((row) => {
            const value = (row as Record<string, unknown>)[clause.column];
            switch (clause.operator) {
              case '=':
                return value === clause.value;
              case '!=':
                return value !== clause.value;
              case '>':
                return (value as number) > (clause.value as number);
              case '>=':
                return (value as number) >= (clause.value as number);
              case '<':
                return (value as number) < (clause.value as number);
              case '<=':
                return (value as number) <= (clause.value as number);
              case 'in':
                return (clause.value as unknown[]).includes(value);
              case 'like':
                return String(value).includes(String(clause.value).replace(/%/g, ''));
              case 'is':
                return value === clause.value;
              default:
                return true;
            }
          });
        }
      }

      // Apply ordering
      if (options?.orderBy?.length) {
        for (const order of options.orderBy) {
          data.sort((a, b) => {
            const aVal = (a as Record<string, unknown>)[order.column];
            const bVal = (b as Record<string, unknown>)[order.column];
            const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return order.direction === 'desc' ? -cmp : cmp;
          });
        }
      }

      // Apply pagination
      if (options?.offset) {
        data = data.slice(options.offset);
      }
      if (options?.limit) {
        data = data.slice(0, options.limit);
      }

      return { data, count: data.length };
    },

    async selectOne<T>(table: string, id: string): Promise<SingleResult<T>> {
      const row = getTable(table).find((r) => (r as { id: string }).id === id);
      return { data: (row as T) ?? null };
    },

    async insert<T>(table: string, data: Partial<T>): Promise<MutationResult<T>> {
      const record = { ...data } as Record<string, unknown>;
      if (!record.id) {
        record.id = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      getTable(table).push(record);
      return { data: record as T };
    },

    async insertMany<T>(table: string, data: Partial<T>[]): Promise<MutationResult<T[]>> {
      const results: T[] = [];
      for (const item of data) {
        const result = await this.insert<T>(table, item);
        if (result.data) {
          results.push(result.data);
        }
      }
      return { data: results };
    },

    async update<T>(table: string, id: string, data: Partial<T>): Promise<MutationResult<T>> {
      const tableData = getTable(table);
      const index = tableData.findIndex((r) => (r as { id: string }).id === id);
      if (index === -1) {
        return { data: null, error: 'Not found' };
      }
      tableData[index] = { ...tableData[index], ...data };
      return { data: tableData[index] as T };
    },

    async delete(table: string, id: string): Promise<MutationResult<{ id: string }>> {
      const tableData = getTable(table);
      const index = tableData.findIndex((r) => (r as { id: string }).id === id);
      if (index === -1) {
        return { data: null, error: 'Not found' };
      }
      tableData.splice(index, 1);
      return { data: { id } };
    },

    async transaction<T>(callback: (tx: TransactionContext) => Promise<T>): Promise<T> {
      const tx: TransactionContext = {
        insert: <U>(t: string, d: Partial<U>) => this.insert<U>(t, d),
        update: <U>(t: string, i: string, d: Partial<U>) => this.update<U>(t, i, d),
        delete: (t: string, i: string) => this.delete(t, i)
      };
      return callback(tx);
    },

    // Helper methods for testing
    clear(table?: string) {
      if (table) {
        tables[table] = [];
      } else {
        for (const key of Object.keys(tables)) {
          tables[key] = [];
        }
      }
    },

    seed<T>(table: string, data: T[]) {
      tables[table] = data as Record<string, unknown>[];
    },

    getAll<T>(table: string): T[] {
      return getTable(table) as T[];
    }
  };
}

// Type definitions
export interface MockDatabaseAdapter extends DatabaseAdapter {
  select: ReturnType<typeof vi.fn>;
  selectOne: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  insertMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
}

export interface InMemoryDatabaseAdapter extends DatabaseAdapter {
  tables: Record<string, Record<string, unknown>[]>;
  clear(table?: string): void;
  seed<T>(table: string, data: T[]): void;
  getAll<T>(table: string): T[];
}
