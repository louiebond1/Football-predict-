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

## Mind Reader (`/mind-reader`)

A standalone Spurs-themed magic trick served by the same server at
`/mind-reader/`. The spectator thinks of a number from 1–63, says YES or NO to
six player cards, and the app reveals their number. It can be added to an
iPhone home screen and runs full screen.

- `public/mind-reader/cards.js`: the six players, their exact number lists and
  `readMind()`, which turns the answers into the number
- `public/mind-reader/app.js`: screens, transitions and the reveal sequence
- `public/mind-reader/styles.css`: all styling (Inter Tight is self-hosted, OFL)

**Player photos:** none are bundled. Each card uses a typographic treatment
with faint pitch markings instead. To add a photo, drop the image in
`public/mind-reader/players/` and set that player's `photo` in `cards.js` (for
example `photo: '/mind-reader/players/lloris.jpg'`). Portrait cut-outs work
best. If an image fails to load, the card falls back to the typographic
design.

**Tests**

- `npm test`: checks every card list against the rule it must follow, checks
  that all 63 numbers resolve correctly, and checks that all 64 YES/NO
  combinations are distinct
- `npm run test:e2e`: plays the trick in Chromium at iPhone size for every
  number 1–63 by reading the rendered cards. It also covers the all-NO
  recovery screen, the back button and Play again. It needs Playwright; point
  `PLAYWRIGHT_MODULE` at a global install if it isn't a local dependency.
- Add `?speed=0` to the URL to skip the suspense timings when testing by hand.
