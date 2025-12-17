import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { config } from './env';

const commonOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
};

// Cloud database client (Supabase)
export const supabase: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  commonOptions
);

// Admin client with service role (bypasses RLS)
export const supabaseAdmin: SupabaseClient | null = config.supabase.serviceRoleKey
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey, commonOptions)
  : null;

export type DatabaseType = 'cloud' | 'edge';

export interface DatabaseConfig {
  type: DatabaseType;
  isOnline: boolean;
}

// Database connection state
let _isOnline = true;

export function setOnlineStatus(online: boolean): void {
  _isOnline = online;
}

export function isOnline(): boolean {
  return _isOnline;
}

export function getActiveDatabase(): DatabaseType {
  return _isOnline ? 'cloud' : 'edge';
}
