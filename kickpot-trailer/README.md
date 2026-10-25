# KickPot trailer — “2–1? You’re having a laugh.”

A 22-second, 1920×1080, 30 fps trailer with an original synthesised soundtrack.

**Finished film:** `out/KickPot_Trailer.mp4`

## The film

| Time | Beat | What happens |
|---|---|---|
| 0.0–3.8 | The challenge | A giant **2–1** slams in as *your prediction*. A green “?” lands, then: *“You’re having a laugh.”* — Jack, who went 1–1. The 2–1 shrinks into a green **YOUR PICK** card and the padlock clicks shut. |
| 3.8–7.2 | The situation | Match-cut to the stadium: **live 1–1, 89:30**, beside your locked 2–1. The group table slides in: Jack 1st (19, with a dashed **+3 LIVE** projection), Sam 16, you 3rd on 15. *“Jack’s already screenshotted it.”* |
| 7.2–9.4 | The tension | The music cuts out. The camera tightens on live 1–1 v your 2–1. The clock ticks faster against a heartbeat. |
| 9.4–13.2 | The goal | **GOAL.** The 1 flips to a 2 and the crowd erupts. The live 2–1 slides onto your 2–1 and they lock: **+3 EXACT SCORE**. Full-time whistle. Points are awarded, you charge from 3rd to 1st, and the crown flips off Jack and lands on you. |
| 13.2–17.0 | How you called it | Rewind to before kick-off: the Matchday card at the app’s default 1–1, tapped up to 2–1 (via a cheeky 3–1). **PICK IT.** “Lock in my picks” → “✓ Picks saved”. **CALL IT.** Kick-off locks it. **OWN IT.** Fast-forward back. |
| 17.0–22.0 | The punchline | You, top of the table, crowned. *“You’ll be* **UNBEARABLE.**” The crown swells with your ego on three beats, then flies to centre and becomes the KickPot logo. *“Your mates won’t hear the end of it.”* One last button hit and out. |

### Scoring continuity (staged demo data)

Rules from the repo: exact score **+3**, correct result **+1**, otherwise 0. The two don’t stack.

| Player | Pick | Before | Live at 1–1 (projected) | Full time 2–1 (awarded) |
|---|---|---|---|---|
| Jack | 1–1 | 16 | +3 → **19** (1st) | 0 → **16** (3rd) |
| Sam | 2–0 | 16 | 0 → 16 (2nd) | +1 → **17** (2nd) |
| You | 2–1 | 15 | 0 → 15 (3rd) | +3 → **18** (1st) |

Projected points are shown as dashed **LIVE** chips under a “LIVE · PROJECTED” header. Awarded points are solid chips under “FULL TIME · AWARDED”. There are no ties at any point. The data lives in `src/timeline.js`, and `film.js` calculates every number from it.

## Project layout

```
index.html        Preview player: play / scrub / arrow keys step frames / motion-blur toggle
render.mjs        Renders the MP4 (Chromium via Playwright → PNG frames → FFmpeg)
src/timeline.js   Every cue time (125 BPM grid), match clock, players, picks, scoring
src/film.js       All picture: scenes, layout, typography, motion, rewind/FF effects
src/audio.js      All sound: music, crowd, whistles, clicks, ticks, mastering (Web Audio)
assets/           stadium.jpg and crown.svg (from the app repo); fonts (SIL OFL)
out/              Finished film
build/            Render intermediates (soundtrack.wav, stills) — safe to delete
```

## Preview and edit

Open `index.html` in Chrome. Some browsers block fonts loaded from `file://`. If that happens, serve the folder instead: `python3 -m http.server` and visit `http://localhost:8000`.

- **Retime anything:** edit `src/timeline.js`. Picture and sound both read from it, so they stay in sync.
- **Change copy:** search `src/film.js` for the line, e.g. `UNBEARABLE.` or `screenshotted`.
- **Change names, picks or points:** edit `PLAYERS` in `src/timeline.js`. Rankings, chips and the crown follow the numbers. Check the order still tells the story.
- **Change the music:** `src/audio.js` → *ARRANGEMENT*. `LEVEL` in `renderSoundtrack()` sets overall loudness.

## Render

Needs Node 18+, Playwright with Chromium (`npm i playwright && npx playwright install chromium`) and FFmpeg on `PATH`.

```sh
node render.mjs                  # final: 5-sample motion blur → out/KickPot_Trailer.mp4 (~8 min)
node render.mjs --samples 1      # quick draft without motion blur
node render.mjs --stills --at 2.0,9.5,12.5   # check individual frames → build/stills
node render.mjs --audio-only     # just the soundtrack → build/soundtrack.wav
```

Mastered to about −14 LUFS integrated, true peak below −1 dBTP.

## Honesty notes

- The interface elements are simplified motion graphics based on the app’s Matchday and Live table designs. They are not screen recordings, and they are not pixel-exact. Button and status copy (“Lock in my picks”, “✓ Picks saved”, “Locked”, “Locks in 2h”) and the 1–1 default draft come from `matchday-reference-live.js`.
- The match, players, picks and points are illustrative.
- All music and sound effects are synthesised in `src/audio.js`. There are no samples, licensed music or voices.
- Fonts: Barlow / Barlow Condensed and Instrument Serif, both under the SIL Open Font License (licences in `assets/fonts`).
