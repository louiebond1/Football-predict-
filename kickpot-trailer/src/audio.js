// KickPot trailer — sound.
// An original soundtrack and sound design, synthesised with the Web Audio API in an
// OfflineAudioContext. No samples or licensed music. Every cue reads its time from timeline.js.
// Pass 1 renders the film's sound; pass 2 masters it.
(function () {
  const { T, B, DUR, CLOCK } = window.KP_TIMELINE;
  const SR = 48000;

  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  // Key of D major. Bars cycle D – A – Bm – G.
  const CHORDS = [[62, 66, 69], [61, 64, 69], [59, 62, 66], [59, 62, 67]];
  const ROOTS = [38, 33, 35, 31];

  async function renderStem() {
    const ctx = new OfflineAudioContext(2, Math.ceil(DUR * SR), SR);
    const r = rng(5);

    // noise sources
    const white = ctx.createBuffer(1, SR * 3, SR);
    { const d = white.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
    const pink = ctx.createBuffer(1, SR * 6, SR);
    { const d = pink.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) { const w = r() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } }

    // buses
    const master = ctx.createGain(); master.connect(ctx.destination);
    const musicDuck = ctx.createGain(); musicDuck.connect(master);
    const music = ctx.createGain(); music.connect(musicDuck);
    const drums = ctx.createGain(); drums.gain.value = 0.9; drums.connect(master);
    const sfx = ctx.createGain(); sfx.connect(master);
    const verb = ctx.createConvolver();
    { const len = SR * 2.2, ir = ctx.createBuffer(2, len, SR);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      verb.buffer = ir; }
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.28; verb.connect(verbOut); verbOut.connect(master);

    // helpers
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const BQ = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const PAN = p => { const s = ctx.createStereoPanner(); s.pan.value = p; return s; };
    const noise = (t, dur, buf = white) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t, r() * 2); s.stop(t + dur + 0.05); return s; };
    const osc = (type, f, t, dur) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(t + dur + 0.05); return o; };
    const perc = (g, t, peak, dec, att = 0.002) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec); };
    const send = (node, amt) => { const g = G(amt); node.connect(g); g.connect(verb); };
    const ducks = [];

    // ---- drums ----
    function kick(t, v = 1) {
      const o = osc('sine', 160, t, 0.5); o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      const g = G(0); perc(g, t, v, 0.42); o.connect(g); g.connect(drums);
      const n = noise(t, 0.03), hp = BQ('highpass', 2500), ng = G(0); perc(ng, t, 0.25 * v, 0.018); n.connect(hp); hp.connect(ng); ng.connect(drums);
      ducks.push(t);
    }
    function clap(t, v = 1) {
      const bp = BQ('bandpass', 1300, 0.9), g = G(0), out = G(v * 0.55); bp.connect(g); g.connect(out); out.connect(drums); send(out, 0.5);
      g.gain.setValueAtTime(0, t);
      for (const o of [0, 0.011, 0.023]) { g.gain.setValueAtTime(1, t + o); g.gain.exponentialRampToValueAtTime(0.15, t + o + 0.009); }
      g.gain.setValueAtTime(0.9, t + 0.034); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      noise(t, 0.3).connect(bp);
    }
    function hat(t, v = 1, open = false, pan = 0.25) {
      const n = noise(t, open ? 0.3 : 0.06), hp = BQ('highpass', open ? 7000 : 8000), g = G(0), p = PAN(pan);
      perc(g, t, 0.22 * v, open ? 0.2 : 0.035); n.connect(hp); hp.connect(g); g.connect(p); p.connect(drums);
    }
    function crash(t, v = 1) {
      const n = noise(t, 2.2), hp = BQ('highpass', 4200), g = G(0); perc(g, t, 0.32 * v, 1.9, 0.004);
      n.connect(hp); hp.connect(g); g.connect(drums); send(g, 0.4);
    }
    function boom(t, v = 1) {
      const o = osc('sine', 70, t, 1.6); o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(27, t + 1.3);
      const g = G(0); perc(g, t, 0.85 * v, 1.5, 0.003); o.connect(g); g.connect(master);
    }
    function snare(t, v = 1) {
      const n = noise(t, 0.2), bp = BQ('bandpass', 2200, 0.6), g = G(0); perc(g, t, 0.4 * v, 0.13);
      n.connect(bp); bp.connect(g); g.connect(drums);
      const o = osc('triangle', 190, t, 0.12), og = G(0); perc(og, t, 0.3 * v, 0.08); o.connect(og); og.connect(drums);
    }

    // ---- tonal ----
    function stab(t, notes, v = 1, dur = 0.2, bright = 4200) {
      const lp = BQ('lowpass', bright, 2.5), g = G(0), out = G(v * 0.085);
      lp.frequency.setValueAtTime(bright, t); lp.frequency.exponentialRampToValueAtTime(700, t + dur);
      perc(g, t, 1, dur + 0.05, 0.004); lp.connect(g); g.connect(out); out.connect(music); send(out, 0.55);
      notes.forEach((n, i) => { for (const det of [-9, 9]) { const o = osc('sawtooth', midi(n), t, dur + 0.1); o.detune.value = det; const p = PAN((i - 1) * 0.35 + det / 60); o.connect(p); p.connect(lp); } });
      const sub = osc('square', midi(notes[0] - 12), t, dur + 0.1), sg = G(0.4); sub.connect(sg); sg.connect(lp);
    }
    function bass(t, n, dur = 0.2, v = 1) {
      const lp = BQ('lowpass', 900, 5), g = G(0); lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(220, t + dur);
      perc(g, t, 0.34 * v, dur, 0.004); lp.connect(g); g.connect(music);
      const o = osc('sawtooth', midi(n), t, dur), s = osc('sine', midi(n - 12), t, dur), sg = G(0.9); o.connect(lp); s.connect(sg); sg.connect(g);
    }
    function pluck(t, n, v = 1) {
      const o = osc('triangle', midi(n), t, 0.3), g = G(0); perc(g, t, 0.22 * v, 0.22); o.connect(g); g.connect(music); send(g, 0.3);
    }
    function bell(t, notes, v = 1, step = 0.06) {
      notes.forEach((n, i) => {
        const f = midi(n), tt = t + i * step;
        [[1, 1, 1.6], [2.76, 0.35, 0.7], [5.4, 0.14, 0.35]].forEach(([m, a, d]) => {
          const o = osc('sine', f * m, tt, d + 0.1), g = G(0); perc(g, tt, 0.12 * v * a, d, 0.002); o.connect(g); g.connect(sfx); send(g, 0.6);
        });
      });
    }
    function bwomp(t, v = 1) { // sarcastic descending bass
      const o = osc('sawtooth', 250, t, 0.55); o.frequency.setValueAtTime(250, t); o.frequency.exponentialRampToValueAtTime(58, t + 0.45);
      const vib = osc('sine', 7, t, 0.55), vg = G(14); vib.connect(vg); vg.connect(o.frequency);
      const lp = BQ('lowpass', 1100, 6), g = G(0); perc(g, t, 0.36 * v, 0.5, 0.01); o.connect(lp); lp.connect(g); g.connect(music); send(g, 0.2);
    }

    // ---- sound effects ----
    function whoosh(t, dur, v = 1, up = true) {
      const n = noise(t, dur, pink), bp = BQ('bandpass', up ? 300 : 3500, 1.4), g = G(0);
      bp.frequency.setValueAtTime(up ? 300 : 3500, t); bp.frequency.exponentialRampToValueAtTime(up ? 4200 : 250, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9 * v, t + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(bp); bp.connect(g); g.connect(sfx);
    }
    function tick(t, v = 1, hi = true) {
      const o = osc('sine', hi ? 2350 : 1650, t, 0.06), g = G(0); perc(g, t, 0.28 * v, 0.035, 0.001); o.connect(g); g.connect(sfx);
      const n = noise(t, 0.02), hp = BQ('highpass', 3500), ng = G(0); perc(ng, t, 0.2 * v, 0.012); n.connect(hp); hp.connect(ng); ng.connect(sfx);
    }
    function heartbeat(t, v = 1) {
      for (const [o, a] of [[0, 1], [0.15, 0.7]]) { const s = osc('sine', 54, t + o, 0.25), g = G(0); perc(g, t + o, 0.7 * v * a, 0.17, 0.006); s.connect(g); g.connect(master); }
    }
    function uiClick(t, f = 1000, v = 1) {
      const n = noise(t, 0.02), hp = BQ('highpass', 2800), ng = G(0); perc(ng, t, 0.45 * v, 0.01); n.connect(hp); hp.connect(ng); ng.connect(sfx);
      const o = osc('sine', f, t, 0.1), g = G(0); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.05); perc(g, t, 0.3 * v, 0.07); o.connect(g); g.connect(sfx);
    }
    function lockClunk(t, v = 1) {
      const o = osc('sine', 150, t, 0.2); o.frequency.exponentialRampToValueAtTime(55, t + 0.12); const g = G(0); perc(g, t, 0.7 * v, 0.16); o.connect(g); g.connect(sfx);
      const m = osc('square', 1900, t, 0.08), bp = BQ('bandpass', 2600, 7), mg = G(0); perc(mg, t, 0.35 * v, 0.06); m.connect(bp); bp.connect(mg); mg.connect(sfx); send(mg, 0.3);
      const n = noise(t + 0.055, 0.02), hp = BQ('highpass', 4000), ng = G(0); perc(ng, t + 0.055, 0.4 * v, 0.012); n.connect(hp); hp.connect(ng); ng.connect(sfx);
    }
    function whistle(t, dur, v = 1) {
      const o = osc('sine', 3050, t, dur), lfo = osc('square', 34, t, dur), lg = G(150); lfo.connect(lg); lg.connect(o.frequency);
      o.frequency.setValueAtTime(2850, t); o.frequency.linearRampToValueAtTime(3080, t + 0.04);
      const g = G(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.015); g.gain.setValueAtTime(0.16 * v, t + dur - 0.04); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(sfx); send(g, 0.5);
      const n = noise(t, dur), bp = BQ('bandpass', 3050, 9), ng = G(0); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.25 * v, t + 0.015); ng.gain.setValueAtTime(0.25 * v, t + dur - 0.04); ng.gain.linearRampToValueAtTime(0, t + dur);
      n.connect(bp); bp.connect(ng); ng.connect(sfx);
    }
    function sparkle(t, dur, v = 1) {
      const o = osc('sine', 900, t, dur), g = G(0); o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(2600, t + dur);
      const am = osc('sine', 22, t, dur), ag = G(0.5); am.connect(ag); ag.connect(g.gain);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06 * v, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(sfx); send(g, 0.6);
    }

    // ---- crowd: pink-noise body + a bank of "voices" through vowel formants ----
    const crowdLP = BQ('lowpass', 3800, 0.5), crowdG = G(0); crowdLP.connect(crowdG); crowdG.connect(master);
    { const n = ctx.createBufferSource(); n.buffer = pink; n.loop = true; n.start(0);
      const bp = BQ('bandpass', 850, 0.45), g = G(1.1); n.connect(bp); bp.connect(g); g.connect(crowdLP);
      const voices = G(1); voices.connect(crowdLP);
      for (const [f, q, a] of [[720, 5, 1], [1180, 6, 0.6], [2500, 7, 0.25]]) {
        const fb = BQ('bandpass', f, q), fg = G(a * 0.5); fb.connect(fg); fg.connect(voices);
        for (let i = 0; i < 26; i++) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 130 + r() * 230; o.start(0);
          const vib = ctx.createOscillator(); vib.frequency.value = 3 + r() * 4; const vg = G(o.frequency.value * 0.03); vib.connect(vg); vg.connect(o.frequency); vib.start(0);
          const og = G(0.012), p = PAN(r() * 1.6 - 0.8); o.connect(og); og.connect(p); p.connect(fb);
        }
      }
    }
    const cg = crowdG.gain, cf = crowdLP.frequency;
    cg.setValueAtTime(0, 0); cg.setValueAtTime(0, T.toLive); cg.linearRampToValueAtTime(0.3, T.live + 0.1);
    cg.setValueAtTime(0.3, T.tension); cg.linearRampToValueAtTime(0.05, T.tension + 0.15); cg.linearRampToValueAtTime(0.16, T.goal - 0.06);
    cg.linearRampToValueAtTime(0.05, T.goal - 0.01); cg.linearRampToValueAtTime(1.2, T.goal + 0.08); cg.setValueAtTime(1.2, T.goal + 0.7);
    cg.linearRampToValueAtTime(0.5, T.ft); cg.linearRampToValueAtTime(0.7, T.ft + 0.6); cg.linearRampToValueAtTime(0.25, T.punch + 0.3);
    cg.setValueAtTime(0.25, T.wipe); cg.linearRampToValueAtTime(0, T.logo + 0.4);
    cf.setValueAtTime(3800, 0); cf.setValueAtTime(3800, T.tension); cf.exponentialRampToValueAtTime(650, T.tension + 0.25); cf.exponentialRampToValueAtTime(1400, T.goal - 0.02);
    cf.exponentialRampToValueAtTime(6500, T.goal + 0.03);

    // ================= ARRANGEMENT =================
    const chordAt = (t, t0) => CHORDS[Math.floor((t - t0) / (4 * B) + 1e-6) % 4];
    const rootAt = (t, t0) => ROOTS[Math.floor((t - t0) / (4 * B) + 1e-6) % 4];
    function groove(t0, t1, o = {}) {
      const nb = Math.round((t1 - t0) / B);
      for (let i = 0; i < nb; i++) {
        const t = t0 + i * B;
        if (o.kick !== false) kick(t, o.kickV || 1);
        if (o.clap !== false && i % 2 === 1) clap(t, 0.9);
        for (let s = 0; s < 4; s++) if (o.hats !== false) hat(t + s * B / 4, s === 2 ? 1 : 0.45, s === 2 && o.open !== false, s % 2 ? -0.3 : 0.3);
        if (o.bass !== false) { const rn = rootAt(t, t0); bass(t + B / 2, rn, B / 2 * 0.9); bass(t + B * 0.75, rn + 12, B / 4 * 0.8, 0.7); }
        if (o.stabs) { const ch = chordAt(t, t0); stab(t + B / 2, ch.map(n => n + 12), 0.8, 0.13); }
        if (o.pluck) { const rn = rootAt(t, t0); pluck(t, rn + 24, 0.8); pluck(t + B / 2, rn + 31, 0.5); }
      }
    }

    // 1. What the game is
    kick(T.title1, 1.2); boom(T.title1, 0.7); crash(T.title1, 0.8); stab(T.title1, [50, 57, 62, 66], 1.2, 0.45, 2500); bass(T.title1, 26, 0.45, 1.1);
    kick(T.title2, 1.1); stab(T.title2, [57, 62, 66, 69], 1.2, 0.35, 3000); clap(T.title2, 0.8);
    groove(T.title2 + B, T.toPick, { stabs: false, bass: false, clap: false });
    whoosh(T.toPick, T.pick - T.toPick + 0.1, 0.8, true);

    // 2. Pick the score: light, playful, tactile clicks
    groove(T.pick, T.toRival, { stabs: false, clap: false, open: false, bass: false, pluck: true, kickV: 0.75 });
    uiClick(T.tap, 1000, 1.3);
    uiClick(T.save, 700, 1); bell(T.save + 0.04, [79, 86], 0.9, 0.09);

    // 3. Your mate: groove with bass, a snare on "2–1?", a sarcastic bass drop on "laugh"
    whoosh(T.toRival, T.rival - T.toRival, 0.6, false);
    groove(T.rival, T.toKO, { stabs: false, clap: true, open: false });
    snare(T.q1, 1); stab(T.q1, [69, 74, 78], 0.7, 0.14, 5000);
    bwomp(T.q2 + 0.24, 1.1);

    // 4. Kick-off: whistle, padlocks, full groove; a ding for each scoring rule
    whoosh(T.toKO, T.ko - T.toKO, 0.9, true);
    whistle(T.ko, 0.5, 0.9); lockClunk(T.ko + 0.02, 1.2); kick(T.ko, 1.2); crash(T.ko, 0.7); stab(T.ko, [62, 66, 69], 1, 0.3);
    groove(T.ko + B, T.toLive, { stabs: true });
    bell(T.rule1, [81, 86], 0.8, 0.06); bell(T.rule2, [78], 0.7);
    whoosh(T.toLive - 0.1, 0.36, 0.9, true);

    // 5. Live: crowd, full groove, quiet clock ticks
    crash(T.live, 0.9); kick(T.live, 1.2); boom(T.live, 0.5);
    groove(T.live, T.tension - B, { stabs: true });
    whoosh(T.table - 0.12, 0.3, 0.6);
    for (let i = 0; i < 8; i++) snare(T.tension - B + i * B / 8, 0.25 + i * 0.08);
    kick(T.tension - B, 1); kick(T.tension - B / 2, 1);
    for (const [t0] of CLOCK) if (t0 < T.tension) tick(t0, 0.35);

    // 6. Tension: music cut, clock, heartbeat, drone, riser
    for (const [t0] of CLOCK) if (t0 >= T.tension && t0 < T.goal) { tick(t0, 1.7); heartbeat(t0 + B / 2, 0.8); }
    { const o = osc('sawtooth', midi(26), T.tension, T.goal - T.tension), lp = BQ('lowpass', 160, 3), g = G(0);
      o.frequency.setValueAtTime(midi(26), T.tension); o.frequency.exponentialRampToValueAtTime(midi(28), T.goal - 0.05);
      lp.frequency.setValueAtTime(140, T.tension); lp.frequency.exponentialRampToValueAtTime(700, T.goal - 0.05);
      g.gain.setValueAtTime(0, T.tension); g.gain.linearRampToValueAtTime(0.08, T.goal - 0.1); g.gain.linearRampToValueAtTime(0, T.goal - 0.04);
      o.connect(lp); lp.connect(g); g.connect(master); }
    { const n = noise(T.goal - 1.2, 1.2, white), bp = BQ('bandpass', 400, 1.2), g = G(0);
      bp.frequency.setValueAtTime(400, T.goal - 1.2); bp.frequency.exponentialRampToValueAtTime(7000, T.goal - 0.06);
      g.gain.setValueAtTime(0, T.goal - 1.2); g.gain.exponentialRampToValueAtTime(0.3, T.goal - 0.07); g.gain.linearRampToValueAtTime(0, T.goal - 0.045);
      n.connect(bp); bp.connect(g); g.connect(sfx); }

    // 7. Goal and payoff
    kick(T.goal, 1.5); boom(T.goal, 1.3); crash(T.goal, 1.4);
    stab(T.goal, [62, 66, 69, 74], 1.6, 0.6, 3000); bass(T.goal, 26, 0.6, 1.4);
    { const n = noise(T.goal, 0.5, white), lp = BQ('lowpass', 2500), g = G(0); perc(g, T.goal, 0.5, 0.45, 0.003); n.connect(lp); lp.connect(g); g.connect(sfx); }
    kick(T.flip, 0.9); snare(T.flip, 0.6);
    groove(T.goal + 2 * B, T.punch, { stabs: true, kickV: 1.05 });
    whoosh(T.merge, T.exact - T.merge, 0.8, true);
    bell(T.exact, [74, 78, 81, 86], 1.3, 0.05); lockClunk(T.exact, 0.6);
    whistle(T.ft, 0.15, 1); whistle(T.ft + 0.19, 0.15, 1); whistle(T.ft + 0.38, 0.6, 1);
    for (let i = 0; i < 4; i++) tick(T.award + i * 0.08, 0.5, i % 2 === 0);
    bell(T.award, [86, 90], 0.8, 0.07);
    whoosh(T.swap - 0.05, 0.4, 1, true);
    sparkle(T.crownLift, T.crownLand - T.crownLift, 1);
    bell(T.crownLand, [62, 69, 74, 78, 81], 1.4, 0.035); crash(T.crownLand, 0.7);

    // 8. Punchline and logo
    kick(T.punch, 1.1); crash(T.punch, 0.7);
    bass(T.unbear1, 26, T.unbear2 - T.unbear1, 1); // a held breath on "You'll be…"
    kick(T.unbear2, 1.4); boom(T.unbear2, 0.9); crash(T.unbear2, 1); clap(T.unbear2, 1.1); stab(T.unbear2, [59, 62, 67, 71], 1.4, 0.45, 3200);
    groove(T.unbear2 + B, T.wipe, { stabs: true });
    whoosh(T.wipe, T.logo - T.wipe, 1, true);
    kick(T.logo, 1.3); boom(T.logo, 1); crash(T.logo, 1.1); stab(T.logo, [62, 66, 69, 74, 78], 1.4, 0.7, 2800); bell(T.logo + 0.02, [74, 81, 86], 1, 0.04);
    groove(T.logo + B, T.sting, { stabs: false, clap: true, kickV: 0.8, open: false });
    kick(T.sting, 1.3); crash(T.sting, 1); stab(T.sting, [50, 62, 66, 69, 74], 1.6, 0.8, 2600); bass(T.sting, 26, 0.8, 1.2); bell(T.sting + 0.02, [86], 0.7);

    // sidechain duck of the tonal bus on every kick
    ducks.sort((a, b) => a - b);
    const dg = musicDuck.gain; dg.setValueAtTime(1, 0);
    for (const t of ducks) { dg.setValueAtTime(1, Math.max(0, t - 0.005)); dg.linearRampToValueAtTime(0.4, t + 0.004); dg.linearRampToValueAtTime(1, t + 0.2); }

    return ctx.startRendering();
  }

  async function renderSoundtrack() {
    const stem = await renderStem();
    const ctx = new OfflineAudioContext(2, Math.ceil(DUR * SR), SR);
    const bus = ctx.createGain(); bus.gain.value = 1.15;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.16;
    const shaper = ctx.createWaveShaper(); { const n = 4096, curve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * 1.25) / Math.tanh(1.25); } shaper.curve = curve; }
    const out = ctx.createGain(), LEVEL = 0.64; // LEVEL sets overall loudness (≈ −14 LUFS)
    // strip the mix back for the tension beat, slam it open for the goal
    out.gain.setValueAtTime(LEVEL, 0); out.gain.setValueAtTime(LEVEL, T.tension); out.gain.linearRampToValueAtTime(LEVEL * 0.6, T.tension + 0.03);
    out.gain.setValueAtTime(LEVEL * 0.6, T.goal - 0.005); out.gain.linearRampToValueAtTime(LEVEL, T.goal);
    bus.connect(comp); comp.connect(shaper); shaper.connect(out); out.connect(ctx.destination);

    const main = ctx.createBufferSource(); main.buffer = stem; main.connect(bus); main.start(0);

    const buf = await ctx.startRendering();
    // short fade at the very end
    const fade = Math.floor(0.12 * SR);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade; }
    return buf;
  }

  function toWav(buf) {
    const n = buf.length, ch = buf.numberOfChannels, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
    out.setUint16(22, ch, true); out.setUint32(24, SR, true); out.setUint32(28, SR * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
    w(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const chans = [...Array(ch)].map((_, c) => buf.getChannelData(c)); let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    return new Uint8Array(out.buffer);
  }

  window.KP_AUDIO = { renderSoundtrack, toWav, SR };
})();
