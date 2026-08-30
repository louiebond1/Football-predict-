# KickPot

Installable iPhone-first Premier League prediction PWA.

## Rules
- Exact score: +3
- Correct result: +1
- £5 per Gameweek
- Winner takes the pot
- Treasurer confirms payment
- Database blocks unpaid users from submitting predictions
- Predictions lock at each fixture kickoff

> First-goalscorer (+2) is not currently active. It requires per-match goal-events data,
> which football-data.org's free tier doesn't provide. Re-enabling it needs a provider
> with an events/lineups endpoint (e.g. API-Football's paid Pro tier).

## Live setup already completed
- Supabase project: `KickPot`
- Region: London (`eu-west-2`)
- Database tables + RLS installed, including a payment-gated predictions policy
- `create_group` / `join_group` RPCs (SECURITY DEFINER) generate join codes and seed the current Gameweek's payment rows
- Payment claim (self) + Treasurer confirmation (RLS-scoped to `groups.treasurer_id`) installed
- `score_fixture_predictions` trigger recomputes points whenever a fixture result is written
- `settle_gameweek` RPC crowns the winner once every fixture in the round is `FINISHED`
- football-data.org server proxy + caching implemented (server-side only — the token never reaches the browser)
- Railway configuration included
- PWA manifest, service worker and iPhone icons included
- Client (`public/app.js`) is a real Supabase-backed app: magic-link auth, group create/join, live leaderboard, payment tracking and prediction submission all talk to Supabase directly under RLS

## Railway deployment
Deploy this GitHub repository in Railway, then add these environment variables:

- `FOOTBALL_DATA_TOKEN` — your football-data.org API token (from https://www.football-data.org/client/register)
- `FOOTBALL_DATA_COMPETITION=PL`
- `SUPABASE_URL` — already shown in `.env.example`
- `SUPABASE_PUBLISHABLE_KEY` — already shown in `.env.example`
- `SUPABASE_SECRET_KEY` — the project's **service_role / secret** key (Supabase Dashboard → Project Settings → API). Never use a personal access token (`sbp_...`) here — that's an account-level management credential, not a data-API key, and must never be embedded in an app.

Railway runs `npm start`. Generate a public domain in Railway Settings > Networking.

## Database migration
Run `supabase/schema.sql` in the Supabase SQL editor. It is idempotent (safe to re-run on an existing project) — it drops and recreates its own policies/functions/triggers rather than failing on "already exists".

On iPhone: open the Railway domain in Safari > Share > Add to Home Screen.

## Football API usage
The API token stays server-side. The current matchday is cached for 6 hours and fixtures for 5 minutes, to stay well within football-data.org's free-tier rate limit (10 requests/minute).

## Security
Never commit `FOOTBALL_DATA_TOKEN` or `SUPABASE_SECRET_KEY`.
The Supabase publishable key is intended for browser use and is protected by RLS.
