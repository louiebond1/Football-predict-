# KickPot

Installable iPhone-first Premier League prediction PWA.

## Scoring
- Exact score: +3
- Correct result: +1
- Correct first goalscorer: +2

## Railway
1. Create a Railway project from this GitHub repository.
2. Add environment variables from `.env.example`.
3. Deploy. Railway should run `npm start` automatically.
4. Generate a public domain in Railway Settings > Networking.
5. On iPhone: open the domain in Safari > Share > Add to Home Screen.

## Football API
Uses API-Football through the server only. The key is never shipped to the browser.
The server caches current round for 6 hours, fixtures for 5 minutes and match events for 90 seconds.

## Supabase
Run `supabase/schema.sql` in the Supabase SQL editor after creating/connecting the project. Add the project URL and publishable key to Railway.
Never put a secret/service-role key in client-side code.

## Local run
`npm start` then open http://localhost:3000
