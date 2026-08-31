import * as Supabase from 'https://esm.sh/@supabase/supabase-js@2?bundle';

export * from 'https://esm.sh/@supabase/supabase-js@2?bundle';

let sharedClient = null;
let sharedUrl = '';
let sharedKey = '';

export function createClient(url, key, options = {}) {
  if (sharedClient && sharedUrl === url && sharedKey === key) return sharedClient;

  const authOptions = {
    // v2 deliberately leaves the old Safari/PWA paired refresh-token store
    // behind. Every browser context now owns one fresh local session instead
    // of copying/rotating the same refresh token between Safari and the PWA.
    storageKey: 'kickpot-auth-v2',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    ...(options.auth || {})
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
