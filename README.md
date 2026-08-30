# KickPot

Installable iPhone-first Premier League prediction PWA.

## Rules
- Exact score: +3
- Correct result: +1
- Correct first goalscorer: +2
- £5 per Gameweek
- Winner takes the pot
- Treasurer confirms payment
- Database blocks unpaid users from submitting predictions
- Predictions lock at each fixture kickoff

## Live setup already completed
- Supabase project: `KickPot`
- Region: London (`eu-west-2`)
- Database tables + RLS installed
- Create/join group functions installed
- Payment claim + Treasurer confirmation installed
- Prediction scoring trigger installed
- Football-data server proxy + caching implemented
- Railway configuration included
- PWA manifest, service worker and iPhone icons included

## Railway deployment
Deploy this GitHub repository in Railway, then add these environment variables:

- `FOOTBALL_API_KEY` — your rotated API-Football key
- `SUPABASE_URL` — already shown in `.env.example`
- `SUPABASE_PUBLISHABLE_KEY` — already shown in `.env.example`
- `SUPABASE_SECRET_KEY` — copy the project secret key from Supabase directly into Railway; never commit it
- `PREMIER_LEAGUE_ID=39`
- `PREMIER_LEAGUE_SEASON=2026`

Railway runs `npm start`. Generate a public domain in Railway Settings > Networking.

On iPhone: open the Railway domain in Safari > Share > Add to Home Screen.

## Football API usage
The API key stays server-side. Current round is cached for 6 hours, fixtures for 5 minutes, match events for 90 seconds, and team squads for 24 hours to conserve the 100-request/day free allowance.

## Security
Never commit `FOOTBALL_API_KEY` or `SUPABASE_SECRET_KEY`.
The Supabase publishable key is intended for browser use and is protected by RLS.
