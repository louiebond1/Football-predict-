(() => {
  const GROUP_KEY = 'kp-active-group-v1';
  let client = null;
  let refreshPromise = null;

  function readStoredGroup() {
    try {
      const sessionValue = sessionStorage.getItem(GROUP_KEY);
      if (sessionValue) return sessionValue;
    } catch {}
    try {
      return localStorage.getItem(GROUP_KEY) || '';
    } catch {
      return '';
    }
  }

  function isAuthTokenFailure(error) {
    if (!error) return false;
    const text = [error.message, error.details, error.hint, error.code]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return text.includes('jwt expired')
      || text.includes('jwt is expired')
      || text.includes('invalid jwt')
      || text.includes('jwt invalid')
      || text.includes('invalid signature')
      || text.includes('signature verification')
      || text.includes('no suitable key')
      || text.includes('wrong key type')
      || text.includes('pgrst301')
      || (text.includes('expired') && text.includes('token'));
  }

  async function refreshSessionOnce() {
    if (!client?.auth) return false;
    if (!refreshPromise) {
      refreshPromise = client.auth.refreshSession()
        .then(({ data, error }) => !error && !!data?.session)
        .catch(() => false)
        .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }

  function maybePrioritiseStoredGroup(result, meta) {
    if (meta.table !== 'groups' || !meta.selectAll || !meta.orderCreatedAt || meta.filtered) return result;
    if (!Array.isArray(result?.data) || result.data.length < 2) return result;

    const stored = readStoredGroup();
    if (!stored) return result;
    const index = result.data.findIndex(group => group?.id === stored);
    if (index <= 0) return result;

    // Several legacy/enhancement modules independently load the user's groups
    // and fall back to groups[0] when #groupSwitch is not mounted yet. Always
    // put the persisted active group first for this specific unfiltered ordered
    // groups query so every init path resolves the same group during cold boot.
    const reordered = result.data.slice();
    const [selected] = reordered.splice(index, 1);
    reordered.unshift(selected);
    return { ...result, data: reordered };
  }

  async function executeBuilder(target, meta) {
    let result = await target;

    // Recover once from server-side JWT failures even when getSession() still
    // considers the locally cached session usable. This covers expiry plus the
    // equivalent malformed/signature/key errors PostgREST can return for a bad
    // cached access token while the refresh token is still valid.
    if (isAuthTokenFailure(result?.error)) {
      const refreshed = await refreshSessionOnce();
      if (refreshed) {
        result = await target;
        // If this particular builder captured the old Authorization header,
        // a reload now starts all builders from the freshly persisted session.
        if (isAuthTokenFailure(result?.error)) {
          setTimeout(() => location.reload(), 0);
        }
      }
    }

    return maybePrioritiseStoredGroup(result, meta);
  }

  function wrapBuilder(target, meta) {
    if (!target || typeof target !== 'object' || typeof target.then !== 'function') return target;

    return new Proxy(target, {
      get(obj, prop) {
        if (prop === 'then') {
          return (resolve, reject) => executeBuilder(obj, meta).then(resolve, reject);
        }

        const value = Reflect.get(obj, prop, obj);
        if (typeof value !== 'function') return value;

        return (...args) => {
          const nextMeta = { ...meta };
          if (meta.table === 'groups') {
            if (prop === 'select' && args[0] === '*') nextMeta.selectAll = true;
            if (prop === 'order' && args[0] === 'created_at') nextMeta.orderCreatedAt = true;
            if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'range', 'match', 'not', 'or', 'filter'].includes(prop)) {
              nextMeta.filtered = true;
            }
          }

          const next = value.apply(obj, args);
          return wrapBuilder(next, nextMeta);
        };
      }
    });
  }

  function patchClient(nextClient) {
    if (!nextClient || nextClient.__kpCoreBootGuard) return nextClient;

    try {
      Object.defineProperty(nextClient, '__kpCoreBootGuard', { value: true });
    } catch {
      nextClient.__kpCoreBootGuard = true;
    }

    const originalFrom = nextClient.from.bind(nextClient);
    nextClient.from = table => wrapBuilder(originalFrom(table), {
      table,
      selectAll: false,
      orderCreatedAt: false,
      filtered: false
    });

    const originalRpc = nextClient.rpc.bind(nextClient);
    nextClient.rpc = (...args) => wrapBuilder(originalRpc(...args), {
      table: `rpc:${args[0]}`,
      selectAll: false,
      orderCreatedAt: false,
      filtered: false
    });

    return nextClient;
  }

  // Install before app.js runs. supabase-singleton.js assigns the shared client
  // to window.__kickpotSupabase; the setter lets us patch it synchronously at
  // creation time, before any legacy/core init path performs group-scoped work.
  let current = window.__kickpotSupabase || null;
  const descriptor = Object.getOwnPropertyDescriptor(window, '__kickpotSupabase');
  if (!descriptor || descriptor.configurable) {
    Object.defineProperty(window, '__kickpotSupabase', {
      configurable: true,
      enumerable: true,
      get() { return current; },
      set(value) {
        current = patchClient(value);
        client = current;
      }
    });
    if (current) {
      current = patchClient(current);
      client = current;
    }
  } else if (current) {
    current = patchClient(current);
    client = current;
  }
})();
