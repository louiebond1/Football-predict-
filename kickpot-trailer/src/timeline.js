// KickPot trailer — master timeline.
// Every visual cue (film.js) and every sound cue (audio.js) reads its time from here,
// so retiming a beat in one place keeps picture and sound in sync.
// Grid: 125 BPM, one beat = 0.48 s, one bar = 1.92 s. Times are seconds.
// The story runs in order, one idea per shot:
//   what the game is → you pick 2–1 → your mate laughs → picks lock + how points work
//   → live 1–1 late on, mate top → tension → goal, exact score → you top the table → logo
(function () {
  const BPM = 125, B = 60 / BPM;
  const FPS = 30, DUR = 32.0;

  const T = {
    // 1. What the game is
    title1: 0.00,      // "PREDICT"
    title1b: 0.48,     // "THE SCORE."
    title2: 0.96,      // "BEAT"
    title2b: 1.44,     // "YOUR MATES."
    mates: 1.92,       // mates' names pop in, one per half-beat
    toPick: 2.88,      // title lifts away, Matchday card rises in
    // 2. Pick the score
    pick: 3.36,        // step 1 label
    tap: 4.80,         // home + : 1–1 → 2–1
    save: 5.76,        // "Lock in my picks" → "✓ Picks saved"
    // 3. Your mate
    toRival: 7.20,     // Matchday card shrinks into your pick card
    rival: 7.68,       // your mate's pick slides in beside yours
    q1: 8.64,          // "‘2–1?"
    q2: 9.36,          // "You're having a laugh.’"
    // 4. Kick-off: picks lock, how points work
    toKO: 11.04,       // green wipe
    ko: 11.52,         // padlock + whistle: "KICK-OFF. PICKS LOCKED."
    rule1: 12.24,      // exact score +3
    rule2: 12.72,      // right result +1
    toLive: 14.16,     // push through to the stadium
    // 5. Live
    live: 14.40,       // 1–1, 89th minute, beside your 2–1
    table: 15.36,      // group table: your mate top (if it ends 1–1), you second
    // 6. Tension
    tension: 18.24,    // music drops, clock ticks, camera tightens
    // 7. Goal and payoff
    goal: 20.16,       // GOAL
    flip: 20.52,       // 1–1 becomes 2–1
    merge: 20.88,      // live 2–1 slides onto your 2–1
    exact: 21.36,      // exact score: +3
    ft: 22.08,         // full-time whistle, table returns
    award: 22.56,      // points awarded
    swap: 23.04,       // you go top
    crownLift: 23.28,  // crown leaves your mate
    crownLand: 24.00,  // crown lands on you — confetti
    jackLine: 24.48,   // "Still laughing, Josh?"
    // 8. Punchline and logo
    punch: 26.40,      // your row, big
    unbear1: 26.64,    // "You'll be"
    unbear2: 26.88,    // "UNBEARABLE."
    wipe: 28.56,       // crown flies to centre, paper wipe
    logo: 28.80,       // KickPot lockup
    line: 29.28,       // "Predict the score. Beat your mates."
    cta: 30.24,        // "START A GROUP WITH YOUR MATES"
    sting: 31.20,      // final hit
    end: DUR,
  };

  // Match clock: [time it appears, text]. Ticks speed up in the tension beat.
  const CLOCK = [
    [14.40, '89:41'], [15.36, '89:42'], [16.32, '89:43'], [17.28, '89:44'],
    [18.24, '89:45'], [18.72, '89:46'], [19.20, '89:47'], [19.68, '89:48'], [20.16, '89:49'],
  ];

  // Staged demo data — illustrative, not real users or results.
  // Scoring (repo rules): exact score +3, correct result +1, otherwise 0.
  //          pick   points before   if it ends 1–1   full time 2–1
  // Josh     1–1    16              +3 → 19 (1st)     0 → 16 (2nd)
  // You      2–1    15              0  → 15 (2nd)     +3 → 18 (1st)
  const PLAYERS = [
    { id: 'rival', name: 'JOSH', pick: [1, 1], base: 16 }, // the mate who laughs at your 2–1
    { id: 'you',  name: 'YOU',  pick: [2, 1], base: 15 },
  ];
  const FIXTURE = { home: 'Aston Villa', away: 'Manchester City', kickoff: '15:00' };
  const MATES = ['LOUIE', 'JOSH', 'CASEY', 'ZAC']; // stickers in the opening

  function points(pick, score) {
    const [ph, pa] = pick, [ah, aa] = score;
    if (ph === ah && pa === aa) return 3;
    if (Math.sign(ph - pa) === Math.sign(ah - aa)) return 1;
    return 0;
  }

  window.KP_TIMELINE = { BPM, B, FPS, DUR, T, CLOCK, PLAYERS, FIXTURE, MATES, points };
})();
