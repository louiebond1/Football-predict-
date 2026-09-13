# Production-readiness audit — 13 September 2026

Scope: repository-wide application/server review, deployed Supabase schema/function comparison, regression implementation, browser verification and deployment hardening. Baseline: `497cfc2` on `claude/kickpot-pwa-deploy-7ashz5`. The isolated checkout had no unrelated local changes.

## Findings and fixes

| Severity | Finding | Correction |
| --- | --- | --- |
| Critical | Clients could write computed prediction points or move an open prediction onto a locked fixture. | Column grants, immutable prediction identity, restrictive kickoff policy and PostgreSQL regression tests. |
| High | Competing renderers, observers and delayed handlers could replace screens or retain stale group/account state. | Removed obsolete scripts; explicit app/controller lifecycle; guarded async completions; isolated drafts. |
| High | Live fetch failures could escape error handling; secondary failures could hide fixtures or misrepresent group picks. | Independent fixture publication, visible retry/partial errors, bounded refresh, generation guards and explicit picks errors. |
| High | Reveal and lock behavior needed consistent kickoff enforcement. | Started-fixture query scope, verified RLS, edit/save kickoff checks and disclosures preserved across refresh. |
| High | Worker caching could retain foreign/authenticated responses, return HTML as scripts and activate incompatible assets. | Static allowlist, locally bundled SDK, transitive dependency validation, content-derived versions and explicit upgrades. |
| High | Login quota admission was not atomic. | Database row lock before verification, fail-closed quota/alias errors, generic login failures, bounded body and deadlines. |
| High | Production settlement/rollover differed from repository history. | Preserved production eligibility/tie-breaks; serialized settlement, final-score validation, frozen snapshots and current-season selection. |
| Medium | Finished previous weeks became inaccessible for closeout; History totals/ranks could drift. | Pending closeout cards across weeks, snapshot-first standings and tied historical ranks. |
| Medium | Payment identity and repeated actions could race with navigation. | Immutable payment identity, captured week/user scope and duplicate-action guards. |
| Medium | Missing assets returned HTML, malformed paths and upstream failures were weakly bounded. | Real 404s, path/method/round validation, request coalescing/deadlines and configuration validation. |
| Medium | Mobile back/score controls were clipped; hero layering hid text; missing crests broke layout. | Safe-area layout, full touch targets, image layering/fallbacks, date headings and payment navigation. |
| Medium | Theme initialization depended on repair scripts; accessibility and deployment checks were incomplete. | Explicit theme setup, preserved styles, labels, focus/escape, reduced motion, zoom, lockfile, CI and operational documentation. |

## Verification

- `npm ci`, build, syntax/lint, tests, `npm start` and dependency audit succeeded. Start-command health endpoint returned 200.
- 34 unit/integration tests passed: real embedded PostgreSQL schema/migrations, privacy, forged points, payment authorization, fixture identity, scoring, settlement, quota, mocked edge auth, HTTP behavior and service-worker caching.
- 52 distinct browser test/project combinations passed across desktop Chromium, iPhone-sized Chromium/WebKit and 320px mobile. The full 44-case run passed; the added History/sign-out cases plus affected Group flows passed in a 12-case targeted run.
- Browser coverage includes save/edit, group isolation, kickoff, Live fixtures/reveal, 30-second refresh, back, unpaid restrictions, save failures, Group panels, payment claim and admin confirmation/cancellation, account, auth tabs, sign-out, History empty/pending/settled/player states, theme and overflow.
- Desktop/mobile screenshots were inspected and used to correct score, hero and payment-row layout defects. Build validated 53 offline assets, including transitive CSS/JS dependencies.
- `npm audit`: zero vulnerabilities. Diff reviewed for accidental changes, secret exposure and authorization regressions.
- Supabase migrations `production_readiness` and `production_schema_alignment` applied successfully to project `agxffllgcahbacvxhqua`. Production checks confirm clients cannot write points, execute quota admission or rewrite snapshots.
- `invite-password-auth` version 4 deployed ACTIVE with its existing public-login JWT setting. Public GET/OPTIONS/malformed POST checks returned 405/200/400 with expected CORS.

## Boundaries and operation

No real account credentials were supplied. Real successful login, registration/email delivery, biometric passkeys, populated private production screens and payment transfers were not exercised. Verification used mocks, PostgreSQL tests and deployed metadata/privilege checks. No production test users/payments were created or historical records rewritten. Bank transfers are external to KickPot.

Chromium verified native offline reopening. Windows WebKit's native offline navigation fails inside the runner; its test checks cache installation and a mocked fetch outage/reconnect. Physical iPhone installation, upgrade prompts and background suspension need device acceptance. Worker event tests verify explicit upgrades, but no existing physical installed version was available.

Supabase advisors retain intentional warnings for guarded authenticated SECURITY DEFINER RPCs and deny-by-default private auth tables. Leaked-password protection remains disabled as an existing Auth setting; review compatibility with the established PIN flow before enabling it. [Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No payment, eligibility or PIN rule changed.

Both required database migrations and the edge function are deployed. Railway must build the pushed branch with the documented configuration; verify its worker hash and fixture endpoint after deployment. Health alone does not prove provider availability. Historical migration ledgers differ: do not replay the bootstrap or old migrations on production.
