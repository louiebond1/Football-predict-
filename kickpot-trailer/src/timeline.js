// KickPot trailer — master timeline.
// Every visual cue (film.js) and every sound cue (audio.js) reads its time from here,
// so retiming a beat in one place keeps picture and sound in sync.
// Grid: 125 BPM, one beat = 0.48 s. Times are seconds.
(function () {
  const BPM = 125, B = 60 / BPM;
  const FPS = 30, DUR = 22.0;

  const T = {
    // 1. The challenge
    slam: 0.00,        // giant 2–1 lands
    tag: 0.20,         // "YOUR PREDICTION" label
    q: 0.72,           // "?" — the mate questions it
    quote1: 1.20,      // "You're having a"
    laugh: 1.56,       // "laugh."
    jack: 2.04,        // attribution: Jack, who went 1–1
    sweep: 2.88,       // quote swept away, 2–1 becomes a pick card
    lock: 3.36,        // pick card padlock closes
    // 2. The situation
    live: 3.84,        // cut to live match 1–1, 89th minute
    table: 4.80,       // group table slides in, Jack top, you third
    joke: 5.76,        // "Jack's already screenshotted it."
    // 3. The tension
    tension: 7.20,     // music cuts, clock ticks, camera tightens
    // 4. The goal and payoff
    goal: 9.36,        // GOAL. 1–1 becomes 2–1
    flip: 9.56,        // score digit flips under the GOAL type
    merge: 9.84,       // live 2–1 slides onto your 2–1
    exact: 10.32,      // they lock together: +3 exact score
    ft: 10.80,         // full-time whistle, table returns
    award: 11.04,      // points awarded
    reorder: 11.28,    // your row charges to first
    crownLift: 11.52,  // crown leaves Jack
    crownLand: 12.24,  // crown lands on you
    // 5. How you called it (rewind)
    rew: 13.20,        // rewind starts
    pick: 13.68,       // matchday card, before kick-off — "PICK IT."
    tap1: 13.92,       // home +  (1–1 → 2–1)
    tap2: 14.16,       // home +  (→ 3–1)
    tap3: 14.40,       // home −  (→ 2–1, second thoughts)
    save: 14.64,       // "Lock in my picks" → "✓ Picks saved" — "CALL IT."
    ko: 15.60,         // kick-off: prediction locked — "OWN IT."
    ff: 16.56,         // fast-forward back to the table
    back: 17.04,       // back at the top of the table
    // 6. The punchline
    unbear1: 17.28,    // "You'll be"
    unbear2: 17.52,    // "UNBEARABLE."
    ego1: 18.00,       // crown grows (big head)
    ego2: 18.48,
    ego3: 18.96,
    wipe: 19.20,       // crown flies to centre, paper wipe
    logo: 19.44,       // KickPot lockup
    line: 19.92,       // "Your mates won't hear the end of it."
    sting: 21.36,      // final button hit
    end: DUR,
  };

  // Match clock: each entry is [time it appears, text]. Ticks speed up in the tension beat.
  const CLOCK = [
    [3.84, '89:30'], [4.80, '89:31'], [5.76, '89:32'], [6.72, '89:33'],
    [7.44, '89:34'], [7.92, '89:35'], [8.40, '89:36'], [8.88, '89:37'], [9.36, '89:38'],
  ];

  // Staged demo data — illustrative, not real users or results.
  // Scoring (repo rules): exact score +3, correct result +1, otherwise 0.
  //            pick   points before this match   projected at 1–1   awarded at 2–1 FT
  // Jack       1–1    16                          +3 → 19            0  → 16
  // Sam        2–0    16                          0  → 16            +1 → 17
  // You        2–1    15                          0  → 15            +3 → 18
  const PLAYERS = [
    { id: 'jack', name: 'JACK', pick: [1, 1], base: 16 },
    { id: 'sam',  name: 'SAM',  pick: [2, 0], base: 16 },
    { id: 'you',  name: 'YOU',  pick: [2, 1], base: 15 },
  ];
  const FIXTURE = { home: 'Arsenal', away: 'Chelsea', kickoff: '15:00' };

  function points(pick, score) {
    const [ph, pa] = pick, [ah, aa] = score;
    if (ph === ah && pa === aa) return 3;
    if (Math.sign(ph - pa) === Math.sign(ah - aa)) return 1;
    return 0;
  }

  window.KP_TIMELINE = { BPM, B, FPS, DUR, T, CLOCK, PLAYERS, FIXTURE, points };
})();
