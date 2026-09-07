(() => {
  // Keep the core app boot independent from the upstream football provider.
  // If /api/football/fixtures stalls or errors, return an empty successful
  // payload quickly so group/session boot can finish. Live refreshes can retry
  // later without trapping the whole app on "Loading your pot…".
  const nativeFetch = window.fetch.bind(window);
  const FIXTURE_BOOT_TIMEOUT_MS = 2200;

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const isFixtureRequest = /\/api\/football\/fixtures(?:\?|$)/.test(url);
    if (!isFixtureRequest) return nativeFetch(input, init);

    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => {
        window.__kpFixtureProviderDegraded = true;
        resolve(new Response(JSON.stringify({ fixtures: [], round: null, degraded: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        }));
      }, FIXTURE_BOOT_TIMEOUT_MS);
    });

    try {
      const response = await Promise.race([nativeFetch(input, init), timeout]);
      clearTimeout(timer);
      if (response?.ok) return response;
      window.__kpFixtureProviderDegraded = true;
      return new Response(JSON.stringify({ fixtures: [], round: null, degraded: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    } catch {
      clearTimeout(timer);
      window.__kpFixtureProviderDegraded = true;
      return new Response(JSON.stringify({ fixtures: [], round: null, degraded: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }
  };

  window.__kpCoreBootGuardVersion = 4;
})();
