import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from '../config/database';
import type {
  CompleteOrderPaymentResult,
  ExtendedDatabaseAdapter,
  MutationResult,
  QueryResult,
  RpcOperation,
  RpcTransactionResult,
  SelectOptions,
  SingleResult,
  SyncBatchResult,
  SyncJournalEntry,
  TransactionContext,
  TransferInventoryResult,
  WhereClause
} from './types';

// biome-ignore lint/suspicious/noExplicitAny: Supabase query builder types are complex
type QueryBuilder = any;

function applyWhereClause(query: QueryBuilder, where: WhereClause[]): QueryBuilder {
  let q = query;
  for (const clause of where) {
    switch (clause.operator) {
      case '=':
        q = q.eq(clause.column, clause.value);
        break;
      case '!=':
        q = q.neq(clause.column, clause.value);
        break;
      case '>':
        q = q.gt(clause.column, clause.value);
        break;
      case '>=':
        q = q.gte(clause.column, clause.value);
        break;
      case '<':
        q = q.lt(clause.column, clause.value);
        break;
      case '<=':
        q = q.lte(clause.column, clause.value);
        break;
      case 'in':
        q = q.in(clause.column, clause.value as unknown[]);
        break;
      case 'like':
        q = q.like(clause.column, clause.value as string);
        break;
      case 'ilike':
        q = q.ilike(clause.column, clause.value as string);
        break;
      case 'is':
        q = q.is(clause.column, clause.value as null);
        break;
    }
  }
  return q;
}

export class CloudAdapter implements ExtendedDatabaseAdapter {
  readonly type = 'cloud' as const;
  private client: SupabaseClient;
  private useAdmin: boolean;

  constructor(useAdmin = false) {
    this.client = useAdmin && supabaseAdmin ? supabaseAdmin : supabase;
    this.useAdmin = useAdmin;
  }

  get isOnline(): boolean {
    return true; // Cloud adapter is always "online" from its perspective
  }

  async select<T>(table: string, options: SelectOptions = {}): Promise<QueryResult<T>> {
    const columns = options.columns?.join(',') ?? '*';
    let query = this.client.from(table).select(columns, { count: 'exact' });

    if (options.where?.length) {
      query = applyWhereClause(query, options.where);
    }

    if (options.orderBy?.length) {
      for (const order of options.orderBy) {
        query = query.order(order.column, { ascending: order.direction === 'asc' });
      }
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit ?? 100) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data ?? []) as T[], count: count ?? undefined };
  }

  async selectOne<T>(table: string, id: string): Promise<SingleResult<T>> {
    const { data, error } = await this.client.from(table).select('*').eq('id', id).single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { data: null };
      }
      return { data: null, error: error.message };
    }

    return { data: data as T };
  }

  async insert<T>(table: string, data: Partial<T>): Promise<MutationResult<T>> {
    const { data: result, error } = await this.client.from(table).insert(data).select().single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: result as T };
  }

  async insertMany<T>(table: string, data: Partial<T>[]): Promise<MutationResult<T[]>> {
    const { data: result, error } = await this.client.from(table).insert(data).select();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: result as T[] };
  }

  async update<T>(table: string, id: string, data: Partial<T>): Promise<MutationResult<T>> {
    const { data: result, error } = await this.client
      .from(table)
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: result as T };
  }

  async delete(table: string, id: string): Promise<MutationResult<{ id: string }>> {
    const { error } = await this.client.from(table).delete().eq('id', id);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: { id } };
  }

  async transaction<T>(callback: (tx: TransactionContext) => Promise<T>): Promise<T> {
    // For backwards compatibility, still provide the TransactionContext interface
    // However, this is NOT atomic - for true ACID transactions, use executeTransaction() or specialized RPC methods
    const tx: TransactionContext = {
      insert: <U>(t: string, d: Partial<U>) => this.insert<U>(t, d),
      update: <U>(t: string, i: string, d: Partial<U>) => this.update<U>(t, i, d),
      delete: (t: string, i: string) => this.delete(t, i)
    };

    return callback(tx);
  }

  // =============================================================================
  // RPC-BASED ACID TRANSACTION METHODS
  // =============================================================================

  /**
   * Execute multiple operations in a single ACID transaction via PostgreSQL RPC
   * All operations succeed or all fail together
   */
  async executeTransaction(
    operations: RpcOperation[],
    accountId: string
  ): Promise<RpcTransactionResult> {
    const { data, error } = await this.client.rpc('execute_transaction', {
      p_operations: operations,
      p_account_id: accountId
    });

    if (error) {
      throw new Error(`Transaction failed: ${error.message}`);
    }

    return data as RpcTransactionResult;
  }

  /**
   * Atomically complete an order with payment
   * Handles: order status update, payment creation, inventory deduction, customer stats
   */
  async completeOrderWithPayment(
    orderId: string,
    paymentData: Record<string, unknown>,
    accountId: string,
    deductInventory = true
  ): Promise<CompleteOrderPaymentResult> {
    const { data, error } = await this.client.rpc('complete_order_with_payment', {
      p_order_id: orderId,
      p_payment_data: paymentData,
      p_account_id: accountId,
      p_deduct_inventory: deductInventory
    });

    if (error) {
      throw new Error(`Complete order failed: ${error.message}`);
    }

    return data as CompleteOrderPaymentResult;
  }

  /**
   * Atomically transfer inventory between stores
   * Creates paired transfer_in/transfer_out transactions
   */
  async transferInventory(
    fromStoreId: string,
    toStoreId: string,
    items: Array<{ product_id: string; variant_id?: string; quantity: number }>,
    accountId: string,
    employeeId?: string,
    notes?: string
  ): Promise<TransferInventoryResult> {
    const { data, error } = await this.client.rpc('transfer_inventory', {
      p_from_store_id: fromStoreId,
      p_to_store_id: toStoreId,
      p_items: items,
      p_account_id: accountId,
      p_employee_id: employeeId ?? null,
      p_notes: notes ?? null
    });

    if (error) {
      throw new Error(`Inventory transfer failed: ${error.message}`);
    }

    return data as TransferInventoryResult;
  }

  /**
   * Sync batch of offline operations atomically
   * Processes sync journal entries from edge nodes
   */
  async syncBatchOperations(
    entries: SyncJournalEntry[],
    accountId: string,
    edgeNodeId: string
  ): Promise<SyncBatchResult> {
    const formattedEntries = entries.map((entry) => ({
      id: entry.id,
      operation: entry.operation,
      table: entry.table,
      recordId: entry.recordId,
      data: entry.data
    }));

    const { data, error } = await this.client.rpc('sync_batch_operations', {
      p_entries: formattedEntries,
      p_account_id: accountId,
      p_edge_node_id: edgeNodeId
    });

    if (error) {
      throw new Error(`Batch sync failed: ${error.message}`);
    }

    return data as SyncBatchResult;
  }
}

export const cloudDb = new CloudAdapter();
export const cloudDbAdmin = new CloudAdapter(true);
