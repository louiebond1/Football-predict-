# KickPot trailer — “2–1? You’re having a laugh.”

A 32-second, 1920×1080, 30 fps trailer with an original synthesised soundtrack. It tells the story in order, one idea per shot, so someone who has never heard of KickPot understands the game. Numbered step labels (1–4) walk through how it works.

**Finished film:** `out/KickPot_Trailer.mp4`

## The film

| Time | Beat | What happens |
|---|---|---|
| 0.0–3.4 | What it is | **PREDICT THE SCORE. BEAT YOUR MATES.** slams in word by word on the beat, and your mates’ names pop up around it as stickers. A terrace-chant hook starts. |
| 3.4–7.7 | 1 · Pick the score | The Matchday card rises in: Aston Villa v Manchester City, starting at the app’s default 1–1. One tap makes it **2–1**. “Lock in my picks” → “✓ Picks saved”. |
| 7.7–11.0 | Your mate | The card shrinks into **YOUR PICK 2–1**, and **JOSH’S PICK 1–1** slides in beside it. *“‘2–1? You’re having a laugh.’ — Josh”* |
| 11.0–14.4 | 2 · Locked at kick-off | A green wipe and a whistle. Both padlocks close: **KICK-OFF. PICKS LOCKED.** Then the rules: **EXACT SCORE +3 POINTS**, **RIGHT RESULT +1 POINT**. |
| 14.4–18.2 | 3 · Follow it live | Push into the stadium: **live 1–1, 89th minute**, beside your 2–1. The group table shows *if it ends 1–1*: Josh top on 19 (his dashed **+3**), you second on 15. |
| 18.2–20.2 | Tension | The music drops out and the clock ticks faster against a heartbeat. The camera tightens on 1–1 v 2–1. |
| 20.2–26.4 | 4 · Top the table | **GOAL!** Sunburst and confetti cannons. 1–1 flips to 2–1. The live score slides onto your pick: **+3 EXACT SCORE**. Full-time whistle. Josh’s +3 falls away (16), your +3 lands (18), you go top and the crown moves to you in a shower of confetti. *“Still laughing, Josh?”* |
| 26.4–32.0 | Punchline | Your row, crowned. *“You’ll be* **UNBEARABLE.**” The crown flies to centre and becomes the KickPot logo: *“Predict the score. Beat your mates.”* Then the call to action: **START A GROUP WITH YOUR MATES**. |

### Scoring continuity (staged demo data)

Rules from the repo: exact score **+3**, correct result **+1**, otherwise 0. The two don’t stack.

| Player | Pick | Before | If it ends 1–1 | Full time 2–1 |
|---|---|---|---|---|
| Josh | 1–1 | 16 | +3 → **19** (1st) | 0 → **16** (2nd) |
| You | 2–1 | 15 | 0 → 15 (2nd) | +3 → **18** (1st) |

During the match, points that depend on the final score are shown as a dashed chip under an “IF IT ENDS 1–1” header. Awarded points are solid chips under “FULL TIME”. There are no ties at any point. The data lives in `src/timeline.js`, and `film.js` calculates every number from it.

## Project layout

```
index.html        Preview player: play / scrub / arrow keys step frames / motion-blur toggle
render.mjs        Renders the MP4 (Chromium via Playwright → PNG frames → FFmpeg)
src/timeline.js   Every cue time (125 BPM grid), match clock, players, picks, scoring
src/film.js       All picture: scenes, layout, typography, motion, transitions
src/audio.js      All sound: music, crowd, whistles, clicks, ticks, mastering (Web Audio)
assets/           stadium.jpg and crown.svg (from the app repo); fonts (SIL OFL)
out/              Finished film
build/            Render intermediates (soundtrack.wav, stills) — safe to delete
```

## Preview and edit

Open `index.html` in Chrome. Some browsers block fonts loaded from `file://`. If that happens, serve the folder instead: `python3 -m http.server` and visit `http://localhost:8000`.

- **Retime anything:** edit `src/timeline.js`. Picture and sound both read from it, so they stay in sync.
- **Change copy:** search `src/film.js` for the line, e.g. `UNBEARABLE.` or `PREDICT THE SCORE.`
- **Change names, picks or points:** edit `PLAYERS` (the rival’s name drives his pick card, quote credit and the “Still laughing” line) and `MATES` (opening stickers) in `src/timeline.js`. Rankings, chips and the crown follow the numbers. Check the order still tells the story.
- **Change the music:** `src/audio.js` → *ARRANGEMENT*. `LEVEL` in `renderSoundtrack()` sets overall loudness.

## Render

Needs Node 18+, Playwright with Chromium (`npm i playwright && npx playwright install chromium`) and FFmpeg on `PATH`.

```sh
node render.mjs                  # final: 5-sample motion blur → out/KickPot_Trailer.mp4 (~10 min)
node render.mjs --samples 1      # quick draft without motion blur
node render.mjs --stills --at 2.0,9.5,12.5   # check individual frames → build/stills
node render.mjs --audio-only     # just the soundtrack → build/soundtrack.wav
```

Mastered to about −14 LUFS integrated, true peak below −1 dBTP.

## Honesty notes

- The interface elements are simplified motion graphics based on the app’s Matchday and Live table designs. They are not screen recordings, and they are not pixel-exact. Button and status copy (“Lock in my picks”, “✓ Picks saved”, “Locks in 2h”) and the 1–1 default draft come from `matchday-reference-live.js`.
- The match, players, picks and points are illustrative.
- All music and sound effects are synthesised in `src/audio.js`, including the terrace-chant hook (formant-filtered synth voices, not recordings). There are no samples, licensed music or real voices.
- Fonts: Barlow / Barlow Condensed and Instrument Serif, both under the SIL Open Font License (licences in `assets/fonts`).
