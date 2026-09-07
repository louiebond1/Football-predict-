(() => {
  // v3: intentionally no longer wraps the shared Supabase client.
  // Auth validation, persisted-group ordering, and temporary query tracing
  // now live inside supabase-singleton.js itself. Keeping a second Proxy layer
  // here made it possible for the two wrappers to interfere with each other's
  // thenable/query instrumentation during cold boot.
  window.__kpCoreBootGuardVersion = 3;
})();
