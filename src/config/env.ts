import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Supported regions
export type Region = 'TR' | 'EU' | 'US';
export type Currency = 'TRY' | 'EUR' | 'USD';
export type Locale = 'tr-TR' | 'en-US' | 'en-GB' | 'de-DE' | 'fr-FR' | 'es-ES' | 'it-IT' | 'pt-PT' | 'nl-NL';

// Region-specific defaults
export const REGION_DEFAULTS: Record<Region, { currency: Currency; locale: Locale; timezone: string }> = {
  TR: { currency: 'TRY', locale: 'tr-TR', timezone: 'Europe/Istanbul' },
  EU: { currency: 'EUR', locale: 'en-GB', timezone: 'Europe/London' },
  US: { currency: 'USD', locale: 'en-US', timezone: 'America/New_York' }
};

// Currency configuration
export const CURRENCY_CONFIG: Record<Currency, { symbol: string; code: string; decimals: number; symbolPosition: 'before' | 'after' }> = {
  TRY: { symbol: '₺', code: 'TRY', decimals: 2, symbolPosition: 'after' },
  EUR: { symbol: '€', code: 'EUR', decimals: 2, symbolPosition: 'before' },
  USD: { symbol: '$', code: 'USD', decimals: 2, symbolPosition: 'before' }
};

// VAT rates by region
export const VAT_RATES: Record<Region, { standard: number; reduced: number[]; zero: boolean }> = {
  TR: { standard: 20, reduced: [10, 1], zero: false }, // KDV rates
  EU: { standard: 21, reduced: [10, 5], zero: true },   // Varies by country, using average
  US: { standard: 0, reduced: [], zero: true }          // Sales tax varies by state
};

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
  SYNC_INTERVAL_MS: z.coerce.number().default(30000),

  // PIN Authentication Security
  PIN_MAX_ATTEMPTS: z.coerce.number().default(5),
  PIN_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  PIN_LOCKOUT_MS: z.coerce.number().default(30 * 60 * 1000), // 30 minutes
  PIN_LOCKOUT_MULTIPLIER: z.coerce.number().default(2),
  PIN_MAX_LOCKOUT_MS: z.coerce.number().default(24 * 60 * 60 * 1000), // 24 hours

  // Region & Localization (defaults to Turkey)
  DEFAULT_REGION: z.enum(['TR', 'EU', 'US']).default('TR'),
  DEFAULT_CURRENCY: z.enum(['TRY', 'EUR', 'USD']).default('TRY'),
  DEFAULT_LOCALE: z.enum(['tr-TR', 'en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pt-PT', 'nl-NL']).default('tr-TR'),
  DEFAULT_TIMEZONE: z.string().default('Europe/Istanbul'),

  // Compliance
  FISCAL_ENABLED: z.coerce.boolean().default(false),
  GDPR_ENABLED: z.coerce.boolean().default(false),

  // Payment Gateways
  IYZICO_API_KEY: z.string().optional(),
  IYZICO_SECRET_KEY: z.string().optional(),
  IYZICO_BASE_URL: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_TERMINAL_LOCATION: z.string().optional(),
  SUMUP_API_KEY: z.string().optional(),
  SQUARE_ACCESS_TOKEN: z.string().optional(),
  SQUARE_LOCATION_ID: z.string().optional()
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
  },
  pin: {
    maxAttempts: parsed.data.PIN_MAX_ATTEMPTS,
    windowMs: parsed.data.PIN_WINDOW_MS,
    lockoutMs: parsed.data.PIN_LOCKOUT_MS,
    lockoutMultiplier: parsed.data.PIN_LOCKOUT_MULTIPLIER,
    maxLockoutMs: parsed.data.PIN_MAX_LOCKOUT_MS
  },
  region: {
    default: parsed.data.DEFAULT_REGION as Region,
    currency: parsed.data.DEFAULT_CURRENCY as Currency,
    locale: parsed.data.DEFAULT_LOCALE as Locale,
    timezone: parsed.data.DEFAULT_TIMEZONE
  },
  compliance: {
    fiscalEnabled: parsed.data.FISCAL_ENABLED,
    gdprEnabled: parsed.data.GDPR_ENABLED
  },
  payments: {
    iyzico: {
      apiKey: parsed.data.IYZICO_API_KEY,
      secretKey: parsed.data.IYZICO_SECRET_KEY,
      baseUrl: parsed.data.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com'
    },
    stripe: {
      secretKey: parsed.data.STRIPE_SECRET_KEY,
      terminalLocation: parsed.data.STRIPE_TERMINAL_LOCATION
    },
    sumup: {
      apiKey: parsed.data.SUMUP_API_KEY
    },
    square: {
      accessToken: parsed.data.SQUARE_ACCESS_TOKEN,
      locationId: parsed.data.SQUARE_LOCATION_ID
    }
  }
} as const;

export type Config = typeof config;
