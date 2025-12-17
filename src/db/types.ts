// Database types for hybrid cloud/edge architecture

export type DatabaseType = 'cloud' | 'edge';

export interface QueryResult<T> {
  data: T[];
  count?: number;
  error?: string;
}

export interface SingleResult<T> {
  data: T | null;
  error?: string;
}

export interface MutationResult<T> {
  data: T | null;
  error?: string;
}

export interface DatabaseAdapter {
  readonly type: DatabaseType;
  readonly isOnline: boolean;

  // Query operations
  select<T>(table: string, options?: SelectOptions): Promise<QueryResult<T>>;
  selectOne<T>(table: string, id: string): Promise<SingleResult<T>>;

  // Mutation operations
  insert<T>(table: string, data: Partial<T>): Promise<MutationResult<T>>;
  insertMany<T>(table: string, data: Partial<T>[]): Promise<MutationResult<T[]>>;
  update<T>(table: string, id: string, data: Partial<T>): Promise<MutationResult<T>>;
  delete(table: string, id: string): Promise<MutationResult<{ id: string }>>;

  // Transaction support
  transaction<T>(callback: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

export interface SelectOptions {
  columns?: string[];
  where?: WhereClause[];
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
}

export interface WhereClause {
  column: string;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'like' | 'ilike' | 'is';
  value: unknown;
}

export interface OrderByClause {
  column: string;
  direction: 'asc' | 'desc';
}

export interface TransactionContext {
  insert<T>(table: string, data: Partial<T>): Promise<MutationResult<T>>;
  update<T>(table: string, id: string, data: Partial<T>): Promise<MutationResult<T>>;
  delete(table: string, id: string): Promise<MutationResult<{ id: string }>>;
}

// Sync-related types
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed';

export interface SyncJournalEntry {
  id: string;
  operation: 'insert' | 'update' | 'delete';
  table: string;
  recordId: string;
  data: Record<string, unknown>;
  timestamp: string;
  edgeNodeId: string;
  status: SyncStatus;
  checksum: string;
  attempts: number;
  lastAttempt?: string;
  error?: string;
}

export interface EdgeNodeInfo {
  id: string;
  storeId: string;
  name: string;
  lastSyncAt?: string;
  isOnline: boolean;
}

// Tables that sync to edge (subset of cloud data)
export const EDGE_SYNC_TABLES = [
  'products',
  'product_variants',
  'product_categories',
  'modifiers',
  'modifier_groups',
  'employees', // For PIN-based auth
  'customers', // Cached for offline lookup
  'tax_rules',
  'payment_types',
  'store_settings'
] as const;

export type EdgeSyncTable = (typeof EDGE_SYNC_TABLES)[number];
