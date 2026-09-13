# KickPot

Installable, iPhone-first Premier League prediction PWA. The existing rules remain: exact score +3, correct result +1, fixture-by-fixture kickoff locks, treasurer-confirmed payments for money groups, and optional For Fun mode. Existing settlement eligibility and tie-breaks (points, exact scores, team score hits) are preserved. First-goalscorer scoring is inactive in the current product.

## Local development and checks

Use Node.js 22 or newer (validated with Node 24). Supply environment variables through your shell or hosting environment; the server does not implicitly load a .env file.

```sh
npm ci
npm run build
npm start
npm run check
npm test
npx playwright install chromium webkit
npm run test:browser
npm audit
```

`npm start` runs the asset build first. The build bundles the pinned Supabase SDK locally, follows JS and CSS dependencies, verifies every offline asset, and generates a content-derived service-worker version. Commit the generated `public/sw.js`; `public/vendor/` is generated during deployment. The source is static HTML/CSS/JS served by Node; there is no separate frontend development server.

Unit/integration tests include PostgreSQL migrations and RLS using PGlite, server HTTP behavior, scoring/settlement, authentication-edge mocks, and service-worker events. Browser tests use the real client SDK with mocked network data on desktop Chromium, iPhone-sized Chromium/WebKit, and 320px mobile. Chromium uses native offline emulation; Windows WebKit verifies cache installation and API-outage recovery; full offline navigation needs physical Safari acceptance because the Windows WebKit runner reports an internal navigation error. No test signs in to a real account or transfers money.

## Railway configuration

Railway runs `npm start` and checks `/api/health`. Set:

- `NODE_ENV=production`
- `PORT` supplied by Railway
- `FOOTBALL_DATA_COMPETITION=PL`
- `FOOTBALL_DATA_TOKEN`: football-data.org token, server only
- `SUPABASE_URL`: HTTPS project URL
- `SUPABASE_PUBLISHABLE_KEY`: publishable or legacy anon key, safe for the browser under RLS
- `SUPABASE_SECRET_KEY`: service-role/secret data-API key, server only; never an account management token (`sbp_...`)

Production startup rejects missing required configuration and secret keys in the public-key setting. `/api/config` exposes only the public configuration and capability flags. `/api/health` is a process health check, not proof that upstream services are healthy. Check `/api/football/fixtures` for upstream readiness; failures return 503 with a retryable message.

Fixture synchronization runs at startup and once per minute while the server is running; a request also synchronizes the requested round. Identical requests are coalesced, fixture/round responses are cached for 30 seconds, and season metadata for six hours. Upstream calls have deadlines. Database-derived active-round selection holds an unfinished round until all its fixtures are final, matching the existing production rule. A postponed/cancelled fixture therefore requires an upstream final result or an explicit operator decision; the app does not invent results or change settlement rules.

## Database deployment

**Do not rerun `supabase/schema.sql` on the live project.** It is a historical bootstrap, and can overwrite newer policies/functions. For a new empty test database, apply the bootstrap and repository migrations in filename order. Production has additional migration history; reconcile its migration ledger before using a bulk `supabase db push`.

The September 2026 readiness release adds these migrations, in this order:

1. `20260913010250_production_readiness.sql`: column privileges, prediction/payment identity guards, derived scoring, atomic login quota, and indexes.
2. `20260913011936_production_schema_alignment.sql`: preserves production snapshot/settlement semantics, serializes settlement retries, validates final scores, and reconciles active-round selection.

They contain no bulk user-data rewrite or deletion. Apply only these reviewed migrations to an existing installation, through Supabase migrations/SQL tooling. Do not replay historical migrations against production. Keep their privileges when rolling application code back. Run `npm test` before deployment and inspect Supabase security advisors afterward.

Deploy `supabase/functions/invite-password-auth/index.ts` after the quota migration. Its JWT verification setting is **false**: this public login endpoint verifies the submitted credentials itself, consumes the database quota first, and uses service-role credentials only inside the edge runtime. Keep the allowed CORS origin synchronized with the production app domain. Required edge secrets are `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (Supabase runtime-provided).

## Ownership and operation

`app.js` owns the session, group selection, data refresh, and bottom navigation. Matchday and Live each expose one mount/unmount controller. Group panels are composed explicitly after core data loads; there are no renderer observers or delayed repair loops. Auth refresh does not recreate the account session. Draft picks belong to one user/group, stay through refresh and failed saves, and clear on account changes.

Other members' picks are queried/revealed only after valid kickoff timestamps; PostgreSQL RLS enforces privacy even against direct API calls. Prediction identity and computed points cannot be changed by clients. Server scoring clears derived points when an upstream final result is withdrawn. History reads frozen settlement snapshots in preference to mutable totals. Treasurers settle completed weeks from History, including weeks preceding the active round. Settlement is manual and does not initiate bank transfers. Audit corrections and payment operations remain subject to existing treasurer policies.

The service worker caches only versioned application assets, never Supabase/auth/API responses. An installed shell can open offline and offer reconnection; saving requires connectivity. Updates wait for an explicit “Update available” action so a deployment cannot silently discard draft picks. On iPhone, use Safari → Share → Add to Home Screen. A physical Home Screen installation, biometric prompts, and email delivery still require device/account acceptance testing.

Keep tokens and service-role keys out of source, browser code, screenshots and logs. The existing six-digit PIN/legacy-password product behavior is unchanged. Supabase's leaked-password setting must be managed in the Auth dashboard; review its compatibility with the established PIN flow before enabling it.
