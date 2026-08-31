import * as Supabase from 'https://esm.sh/@supabase/supabase-js@2?bundle';

export * from 'https://esm.sh/@supabase/supabase-js@2?bundle';

let sharedClient = null;
let sharedUrl = '';
let sharedKey = '';

export function createClient(url, key, options = {}) {
  if (sharedClient && sharedUrl === url && sharedKey === key) return sharedClient;

  const requestedAuth = options.auth || {};
  const authOptions = {
    storageKey: 'kickpot-auth-v2',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    ...requestedAuth,
    experimental: {
      passkey: true,
      ...(requestedAuth.experimental || {})
    }
  };

  sharedClient = Supabase.createClient(url, key, {
    ...options,
    auth: authOptions
  });
  sharedUrl = url;
  sharedKey = key;
  window.__kickpotSupabase = sharedClient;
  return sharedClient;
}
