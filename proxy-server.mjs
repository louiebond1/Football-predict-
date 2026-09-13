// Compatibility entry point for Railway deployments that retain the old start
// command. All serving and synchronization still belong to the canonical app.
await import('./scripts/build.mjs');
await import('./start.mjs');
