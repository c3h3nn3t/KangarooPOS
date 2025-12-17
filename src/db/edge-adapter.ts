import Database from 'better-sqlite3';
import { config } from '../config/env';
import { generateId } from '../utils/idempotency';
import { logger } from '../utils/logger';
import type {
  DatabaseAdapter,
  MutationResult,
  QueryResult,
  SelectOptions,
  SingleResult,
  TransactionContext,
  WhereClause
} from './types';

function buildSqlWhere(where: WhereClause[]): { sql: string; params: unknown[] } {
  if (!where.length) {
    return { sql: '', params: [] };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  for (const clause of where) {
    switch (clause.operator) {
      case '=':
        conditions.push(`${clause.column} = ?`);
        params.push(clause.value);
        break;
      case '!=':
        conditions.push(`${clause.column} != ?`);
        params.push(clause.value);
        break;
      case '>':
        conditions.push(`${clause.column} > ?`);
        params.push(clause.value);
        break;
      case '>=':
        conditions.push(`${clause.column} >= ?`);
        params.push(clause.value);
        break;
      case '<':
        conditions.push(`${clause.column} < ?`);
        params.push(clause.value);
        break;
      case '<=':
        conditions.push(`${clause.column} <= ?`);
        params.push(clause.value);
        break;
      case 'in': {
        const values = clause.value as unknown[];
        const placeholders = values.map(() => '?').join(', ');
        conditions.push(`${clause.column} IN (${placeholders})`);
        params.push(...values);
        break;
      }
      case 'like':
        conditions.push(`${clause.column} LIKE ?`);
        params.push(clause.value);
        break;
      case 'ilike':
        conditions.push(`${clause.column} LIKE ? COLLATE NOCASE`);
        params.push(clause.value);
        break;
      case 'is':
        if (clause.value === null) {
          conditions.push(`${clause.column} IS NULL`);
        } else {
          conditions.push(`${clause.column} IS ?`);
          params.push(clause.value);
        }
        break;
    }
  }

  return { sql: ` WHERE ${conditions.join(' AND ')}`, params };
}

export class EdgeAdapter implements DatabaseAdapter {
  readonly type = 'edge' as const;
  private db: Database.Database | null = null;
  private _isOnline = true;

  get isOnline(): boolean {
    return this._isOnline;
  }

  setOnlineStatus(online: boolean): void {
    this._isOnline = online;
  }

  private getDb(): Database.Database {
    if (!this.db) {
      this.db = new Database(config.edge.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      logger.info({ path: config.edge.dbPath }, 'SQLite database initialized');
    }
    return this.db;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async select<T>(table: string, options: SelectOptions = {}): Promise<QueryResult<T>> {
    try {
      const db = this.getDb();
      const columns = options.columns?.join(', ') ?? '*';

      let sql = `SELECT ${columns} FROM ${table}`;
      let params: unknown[] = [];

      if (options.where?.length) {
        const whereResult = buildSqlWhere(options.where);
        sql += whereResult.sql;
        params = whereResult.params;
      }

      if (options.orderBy?.length) {
        const orderClauses = options.orderBy.map((o) => `${o.column} ${o.direction.toUpperCase()}`);
        sql += ` ORDER BY ${orderClauses.join(', ')}`;
      }

      if (options.limit) {
        sql += ` LIMIT ${options.limit}`;
      }

      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }

      const data = db.prepare(sql).all(...params) as T[];

      // Get count if needed
      let count: number | undefined;
      if (options.limit || options.offset) {
        let countSql = `SELECT COUNT(*) as count FROM ${table}`;
        if (options.where?.length) {
          const whereResult = buildSqlWhere(options.where);
          countSql += whereResult.sql;
        }
        const countResult = db.prepare(countSql).get(...params) as { count: number };
        count = countResult.count;
      }

      return { data, count };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { data: [], error: message };
    }
  }

  async selectOne<T>(table: string, id: string): Promise<SingleResult<T>> {
    try {
      const db = this.getDb();
      const data = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as T | undefined;
      return { data: data ?? null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { data: null, error: message };
    }
  }

  async insert<T>(table: string, data: Partial<T>): Promise<MutationResult<T>> {
    try {
      const db = this.getDb();
      const record = data as Record<string, unknown>;

      // Ensure ID exists
      if (!record.id) {
        record.id = generateId();
      }

      const columns = Object.keys(record);
      const values = Object.values(record);
      const placeholders = columns.map(() => '?').join(', ');

      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
      db.prepare(sql).run(...values);

      return { data: record as T };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { data: null, error: message };
    }
  }

  async insertMany<T>(table: string, data: Partial<T>[]): Promise<MutationResult<T[]>> {
    try {
      const db = this.getDb();
      const results: T[] = [];

      const insertTransaction = db.transaction((items: Partial<T>[]) => {
        for (const item of items) {
          const record = item as Record<string, unknown>;
          if (!record.id) {
            record.id = generateId();
          }

          const columns = Object.keys(record);
          const values = Object.values(record);
          const placeholders = columns.map(() => '?').join(', ');

          const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
          db.prepare(sql).run(...values);
          results.push(record as T);
        }
      });

      insertTransaction(data);
      return { data: results };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { data: null, error: message };
    }
  }

  async update<T>(table: string, id: string, data: Partial<T>): Promise<MutationResult<T>> {
    try {
      const db = this.getDb();
      const record = data as Record<string, unknown>;

      const setClauses = Object.keys(record)
        .map((col) => `${col} = ?`)
        .join(', ');
      const values = [...Object.values(record), id];

      const sql = `UPDATE ${table} SET ${setClauses} WHERE id = ?`;
      db.prepare(sql).run(...values);

      // Fetch updated record
      const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as T;
      return { data: updated };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { data: null, error: message };
    }
  }

  async delete(table: string, id: string): Promise<MutationResult<{ id: string }>> {
    try {
      const db = this.getDb();
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      return { data: { id } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { data: null, error: message };
    }
  }

  async transaction<T>(callback: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const db = this.getDb();
    const tx: TransactionContext = {
      insert: <U>(t: string, d: Partial<U>) => this.insert<U>(t, d),
      update: <U>(t: string, i: string, d: Partial<U>) => this.update<U>(t, i, d),
      delete: (t: string, i: string) => this.delete(t, i)
    };

    return new Promise((resolve, reject) => {
      const sqliteTransaction = db.transaction(async () => {
        try {
          const result = await callback(tx);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      try {
        sqliteTransaction();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Initialize edge database schema
  initSchema(schema: string): void {
    const db = this.getDb();
    db.exec(schema);
    logger.info('Edge database schema initialized');
  }

  // Execute raw SQL (for migrations)
  exec(sql: string): void {
    const db = this.getDb();
    db.exec(sql);
  }
}

export const edgeDb = new EdgeAdapter();
