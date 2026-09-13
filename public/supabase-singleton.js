import { createClient as makeClient } from './vendor/supabase.js';
export function createClient(url, key, options = {}) {
  if (window.__kickpotSupabase) return window.__kickpotSupabase;
  const client = makeClient(url, key, { ...options, global: {fetch: (url,init={})=>fetch(url,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})}, auth: {
    storageKey: 'kickpot-auth-v2', persistSession: true, autoRefreshToken: true,
    detectSessionInUrl: true, ...options.auth, experimental: {passkey:true}
  }});
  window.__kickpotSupabase = client;
  return client;
}
