import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from '../config/database';
import type {
  DatabaseAdapter,
  MutationResult,
  QueryResult,
  SelectOptions,
  SingleResult,
  TransactionContext,
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

export class CloudAdapter implements DatabaseAdapter {
  readonly type = 'cloud' as const;
  private client: SupabaseClient;

  constructor(useAdmin = false) {
    this.client = useAdmin && supabaseAdmin ? supabaseAdmin : supabase;
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
    // Supabase doesn't have native transaction support via the client
    // We simulate it by using the same client instance
    // For true ACID transactions, use Postgres functions or edge functions
    const tx: TransactionContext = {
      insert: <U>(t: string, d: Partial<U>) => this.insert<U>(t, d),
      update: <U>(t: string, i: string, d: Partial<U>) => this.update<U>(t, i, d),
      delete: (t: string, i: string) => this.delete(t, i)
    };

    return callback(tx);
  }
}

export const cloudDb = new CloudAdapter();
export const cloudDbAdmin = new CloudAdapter(true);
