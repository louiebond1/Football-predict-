import * as Supabase from 'https://esm.sh/@supabase/supabase-js@2?bundle';

export * from 'https://esm.sh/@supabase/supabase-js@2?bundle';

const GROUP_KEY = 'kp-active-group-v1';
const TRACE_LIMIT = 400;
let sharedClient = null;
let sharedUrl = '';
let sharedKey = '';

function readStoredGroup() {
  try {
    const value = sessionStorage.getItem(GROUP_KEY);
    if (value) return value;
  } catch {}
  try {
    return localStorage.getItem(GROUP_KEY) || '';
  } catch {
    return '';
  }
}

function trace(entry) {
  if (typeof window === 'undefined') return;
  const list = window.__kpSupabaseTrace || (window.__kpSupabaseTrace = []);
  list.push({ at: performance?.now?.() ?? Date.now(), ...entry });
  if (list.length > TRACE_LIMIT) list.splice(0, list.length - TRACE_LIMIT);
}

function callerStack() {
  try { return new Error().stack || ''; } catch { return ''; }
}

function authErrorText(error) {
  return [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean).join(' ').toLowerCase();
}

function isAuthTokenFailure(error) {
  if (!error) return false;
  const text = authErrorText(error);
  return text.includes('jwt')
    || text.includes('pgrst301')
    || text.includes('invalid token')
    || text.includes('expired token')
    || text.includes('signature verification')
    || text.includes('invalid signature')
    || text.includes('no suitable key')
    || text.includes('wrong key type');
}

function prioritiseStoredGroup(result, meta) {
  if (meta.table !== 'groups' || !meta.selected || !meta.orderCreatedAt || meta.filtered) return result;
  if (!Array.isArray(result?.data) || result.data.length < 2) return result;
  const stored = readStoredGroup();
  const before = result.data[0]?.id || '';
  if (!stored) {
    trace({ kind:'groups-result', stored:'', before, after:before, stack:meta.stack });
    return result;
  }
  const index = result.data.findIndex(group => group?.id === stored);
  if (index <= 0) {
    trace({ kind:'groups-result', stored, before, after:before, stack:meta.stack });
    return result;
  }
  const reordered = result.data.slice();
  const [selected] = reordered.splice(index, 1);
  reordered.unshift(selected);
  trace({ kind:'groups-result', stored, before, after:reordered[0]?.id || '', stack:meta.stack });
  return { ...result, data: reordered };
}

async function executeBuilder(target, meta) {
  const result = await target;
  return prioritiseStoredGroup(result, meta);
}

function wrapBuilder(target, meta) {
  // supabase.from(table) returns a PostgrestQueryBuilder that is NOT thenable
  // until select()/insert()/update()/etc is called. The old guard required
  // target.then up front, so the initial from() builder escaped unproxied and
  // select/order/eq were never observed. RPC builders are already thenable,
  // which is why RPC tracing worked while table-query tracing never did.
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) return target;

  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop, obj);

      if (prop === 'then') {
        if (typeof value !== 'function') return value;
        return (resolve, reject) => executeBuilder(obj, meta).then(resolve, reject);
      }

      if (typeof value !== 'function') return value;
      return (...args) => {
        const nextMeta = { ...meta };
        if (meta.table === 'groups') {
          if (prop === 'select') nextMeta.selected = true;
          if (prop === 'order' && args[0] === 'created_at') nextMeta.orderCreatedAt = true;
          if (['eq','neq','gt','gte','lt','lte','like','ilike','is','in','contains','containedBy','range','match','not','or','filter'].includes(prop)) nextMeta.filtered = true;
        }
        if (prop === 'eq' && args[0] === 'group_id') {
          trace({ kind:'group-eq', table:meta.table, groupId:String(args[1] || ''), stack:callerStack() });
        }
        const next = value.apply(obj, args);
        return wrapBuilder(next, nextMeta);
      };
    }
  });
}

function patchQueryTracing(client) {
  if (client.__kpSingletonTrace) return;
  Object.defineProperty(client, '__kpSingletonTrace', { value:true });
  const originalFrom = client.from.bind(client);
  client.from = table => wrapBuilder(originalFrom(table), {
    table,
    selected:false,
    orderCreatedAt:false,
    filtered:false,
    stack:callerStack()
  });
  const originalRpc = client.rpc.bind(client);
  client.rpc = (name, args, ...rest) => {
    const gid = args?.p_group_id || args?.gid || null;
    if (gid) trace({ kind:'group-rpc', rpc:name, groupId:String(gid), stack:callerStack() });
    return originalRpc(name, args, ...rest);
  };
}

function patchSessionValidation(client) {
  if (client.auth.__kpValidatedSession) return;
  Object.defineProperty(client.auth, '__kpValidatedSession', { value:true });
  const originalGetSession = client.auth.getSession.bind(client.auth);
  const originalGetUser = client.auth.getUser.bind(client.auth);
  const originalRefreshSession = client.auth.refreshSession.bind(client.auth);
  let validatedToken = '';
  let validationToken = '';
  let validationPromise = null;
  let refreshing = false;

  async function validate(session) {
    const token = session?.access_token || '';
    if (!token || token === validatedToken) return session;
    if (validationPromise && validationToken === token) return validationPromise;
    validationToken = token;
    validationPromise = (async () => {
      const probe = await originalGetUser(token).catch(error => ({ data:null, error }));
      if (!probe?.error && probe?.data?.user) {
        validatedToken = token;
        trace({ kind:'auth-validated' });
        return session;
      }
      if (!isAuthTokenFailure(probe?.error)) {
        trace({ kind:'auth-validation-skipped', error:probe?.error?.message || String(probe?.error || '') });
        return session;
      }
      trace({ kind:'auth-refresh-start', error:probe.error?.message || '' });
      refreshing = true;
      try {
        const current = session?.refresh_token ? { refresh_token: session.refresh_token } : undefined;
        const refreshed = await originalRefreshSession(current).catch(error => ({ data:null, error }));
        if (!refreshed?.error && refreshed?.data?.session) {
          validatedToken = refreshed.data.session.access_token || '';
          trace({ kind:'auth-refresh-success' });
          return refreshed.data.session;
        }
        trace({ kind:'auth-refresh-failed', error:refreshed?.error?.message || String(refreshed?.error || '') });
        return session;
      } finally {
        refreshing = false;
      }
    })().finally(() => {
      validationPromise = null;
      validationToken = '';
    });
    return validationPromise;
  }

  client.auth.getSession = async (...args) => {
    const result = await originalGetSession(...args);
    if (refreshing) return result;
    const session = result?.data?.session;
    if (!session) return result;
    const next = await validate(session);
    if (next === session) return result;
    return { ...result, data:{ ...result.data, session:next } };
  };
}

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
  patchSessionValidation(sharedClient);
  patchQueryTracing(sharedClient);
  sharedUrl = url;
  sharedKey = key;
  window.__kickpotSupabase = sharedClient;
  return sharedClient;
}
