// Authentication utilities for Supabase Edge Functions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthContext {
  userId: string;
  accountId: string;
  role: string;
  email: string;
}

export async function getAuthContext(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables');
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error('Auth error:', authError?.message);
    return null;
  }

  // Get user details from users table
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('account_id, role, email')
    .eq('id', user.id)
    .single();

  if (userError || !userData) {
    console.error('User lookup error:', userError?.message);
    return null;
  }

  return {
    userId: user.id,
    accountId: userData.account_id,
    role: userData.role,
    email: userData.email
  };
}

export function requireAuth(auth: AuthContext | null): auth is AuthContext {
  return auth !== null;
}

export function requireRole(
  auth: AuthContext,
  allowedRoles: string[]
): boolean {
  const roleHierarchy: Record<string, number> = {
    owner: 4,
    admin: 3,
    manager: 2,
    cashier: 1,
    kitchen: 1
  };

  const userLevel = roleHierarchy[auth.role] ?? 0;
  const requiredLevel = Math.min(
    ...allowedRoles.map(role => roleHierarchy[role] ?? 0)
  );

  return userLevel >= requiredLevel;
}
