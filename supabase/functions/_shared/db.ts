// Database utilities for Supabase Edge Functions

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

/**
 * Get Supabase client with user context (respects RLS)
 */
export function getSupabaseClient(authToken?: string): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const options = authToken
    ? {
        global: {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      }
    : undefined;

  return createClient(supabaseUrl, supabaseAnonKey, options);
}

/**
 * Get Supabase admin client (bypasses RLS)
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) {
    return _supabaseAdmin;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase admin environment variables');
  }

  _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return _supabaseAdmin;
}

/**
 * Execute RPC function with error handling
 */
export async function callRpc<T>(
  supabase: SupabaseClient,
  functionName: string,
  params: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.rpc(functionName, params);

  if (error) {
    throw new Error(`RPC ${functionName} failed: ${error.message}`);
  }

  return data as T;
}

/**
 * Validate UUID format
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Parse request body with validation
 */
export async function parseBody<T>(
  req: Request,
  requiredFields: (keyof T)[]
): Promise<T> {
  let body: T;

  try {
    body = await req.json();
  } catch {
    throw new Error('Invalid JSON body');
  }

  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null) {
      throw new Error(`Missing required field: ${String(field)}`);
    }
  }

  return body;
}
