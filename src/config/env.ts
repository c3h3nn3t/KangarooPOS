import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Supabase (Cloud Database)
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Edge Database (SQLite)
  EDGE_DB_PATH: z.string().default('./data/edge.db'),
  EDGE_NODE_ID: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Feature Flags
  OFFLINE_REFUNDS_ENABLED: z.coerce.boolean().default(true),
  SYNC_INTERVAL_MS: z.coerce.number().default(30000)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Environment validation failed:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = {
  supabase: {
    url: parsed.data.SUPABASE_URL,
    anonKey: parsed.data.SUPABASE_ANON_KEY,
    serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY
  },
  server: {
    port: parsed.data.PORT,
    nodeEnv: parsed.data.NODE_ENV,
    isDev: parsed.data.NODE_ENV === 'development',
    isProd: parsed.data.NODE_ENV === 'production',
    isTest: parsed.data.NODE_ENV === 'test'
  },
  edge: {
    dbPath: parsed.data.EDGE_DB_PATH,
    nodeId: parsed.data.EDGE_NODE_ID
  },
  logging: {
    level: parsed.data.LOG_LEVEL
  },
  features: {
    offlineRefundsEnabled: parsed.data.OFFLINE_REFUNDS_ENABLED,
    syncIntervalMs: parsed.data.SYNC_INTERVAL_MS
  }
} as const;

export type Config = typeof config;
