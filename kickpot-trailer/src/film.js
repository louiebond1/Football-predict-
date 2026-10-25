// KickPot trailer — picture.
// drawFrame(ctx, t) is a pure function of time: the same t always draws the same frame.
// The film runs in story order, one idea per shot, with step labels (1–4) explaining the game.
// All staged data (names, picks, points) comes from timeline.js.
(function () {
  const { T, FPS, DUR, CLOCK, PLAYERS, FIXTURE, MATES, points } = window.KP_TIMELINE;
  const W = 1920, H = 1080;

  // KickPot identity: cream, ink, football green, muted gold (brand-pass1.css).
  const C = {
    paper: '#f4f1e8', card: '#fffdf8', ink: '#131a16', muted: '#68736c', line: '#d1cbbf',
    night: '#07100c', cream: '#f3f1e8', green: '#137a49', greenDeep: '#0a3f26',
    gold: '#c9a24f', goldPaper: '#a58a48',
  };
  const F = {
    disp: '"KP Display"', bold: '"KP Bold"', semi: '"KP Semi"',
    body: '"KP Body"', serif: '"KP Serif"', serifUp: '"KP Serif Upright"',
  };

  // ---------- maths ----------
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const P = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, q) => a + (b - a) * q;
  const eOut = x => 1 - Math.pow(1 - x, 3);
  const eIn = x => x * x * x;
  const eIO = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const eExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
  const eBack = (x, s = 1.70158) => { const c = s + 1; return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, q) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp(q)))).join(',')})`; };
  const rgba = (h, a) => `rgba(${hex(h).join(',')},${a})`;
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- staged scoring ----------
  const LIVE_SCORE = [1, 1], FINAL_SCORE = [2, 1];
  const PL = PLAYERS.map(p => ({
    ...p,
    dLive: points(p.pick, LIVE_SCORE), dFin: points(p.pick, FINAL_SCORE),
    live: p.base + points(p.pick, LIVE_SCORE), fin: p.base + points(p.pick, FINAL_SCORE),
  }));
  const byId = Object.fromEntries(PL.map(p => [p.id, p]));
  const ORDER_LIVE = [...PL].sort((a, b) => b.live - a.live).map(p => p.id);
  const ORDER_FT = [...PL].sort((a, b) => b.fin - a.fin).map(p => p.id);
  const LEADER_LIVE = ORDER_LIVE[0];
  const chipFor = d => (d === 3 ? '+3 EXACT' : d === 1 ? '+1 RESULT' : '');

  // ---------- assets ----------
  const A = { stadium: null, grain: null, figure: 0.7, wcache: new Map() };
  const CROWN = new Path2D('M2 5.2 7.2 9.4 12 2.6l4.8 6.8L22 5.2 20.2 16H3.8L2 5.2Zm2.5 9h15l.35-2.15H4.15L4.5 14.2Z');
  let mctx;

  async function load(base = '') {
    const faces = [
      ['KP Display', 'BarlowCondensed-Black.ttf'], ['KP Bold', 'BarlowCondensed-ExtraBold.ttf'],
      ['KP Semi', 'BarlowCondensed-SemiBold.ttf'], ['KP Body', 'Barlow-Bold.ttf'],
      ['KP Serif', 'InstrumentSerif-Italic.ttf'], ['KP Serif Upright', 'InstrumentSerif-Regular.ttf'],
    ];
    await Promise.all(faces.map(async ([name, file]) => {
      const f = new FontFace(name, `url(${base}assets/fonts/${file})`);
      await f.load(); document.fonts.add(f);
    }));
    A.stadium = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = base + 'assets/stadium.jpg'; });
    // film grain tile
    const g = document.createElement('canvas'); g.width = g.height = 512; const gx = g.getContext('2d');
    const img = gx.createImageData(512, 512), r = rng(11);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (r() - 0.5) * 120; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    gx.putImageData(img, 0, 0); A.grain = g;
    mctx = document.createElement('canvas').getContext('2d');
    mctx.font = `1000px ${F.disp}`; A.figure = mctx.measureText('0').actualBoundingBoxAscent / 1000;
  }

  function measure(s, size, font, ls = 0) {
    const key = s + '|' + size + '|' + font + '|' + ls;
    let w = A.wcache.get(key);
    if (w == null) { mctx.font = `${size}px ${font}`; mctx.letterSpacing = ls + 'px'; w = mctx.measureText(s).width; A.wcache.set(key, w); }
    return w;
  }
  function text(ctx, s, x, y, o = {}) {
    ctx.save();
    ctx.font = `${o.size || 40}px ${o.font || F.bold}`;
    ctx.fillStyle = o.color || C.ink; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = (o.ls || 0) + 'px';
    if (o.alpha != null) ctx.globalAlpha *= clamp(o.alpha);
    if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.blur || 30; }
    // letterSpacing adds trailing space; compensate when centring
    ctx.fillText(s, x + (o.align === 'center' || !o.align ? (o.ls || 0) / 2 : 0), y);
    ctx.restore();
  }

  // Score numerals "H–A" centred on (x, y), y = vertical centre of the figures.
  function scoreMetrics(size) {
    const dw = measure('0', size, F.disp), dash = measure('–', size, F.disp);
    return { dw, dash, total: dw * 2 + dash + size * 0.06 };
  }
  function drawScore(ctx, x, y, size, h, a, o = {}) {
    const m = scoreMetrics(size), cap = size * A.figure, base = y + cap / 2;
    const xs = [x - m.total / 2 + m.dw / 2, x, x + m.total / 2 - m.dw / 2];
    ctx.save();
    ctx.font = `${size}px ${F.disp}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = '0px';
    ctx.fillStyle = o.color || C.ink;
    if (o.alpha != null) ctx.globalAlpha *= clamp(o.alpha);
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur || 50; }
    if (o.flip) {
      const q = o.flip.q, clipR = () => { ctx.beginPath(); ctx.rect(xs[0] - m.dw, y - cap * 0.66, m.dw * 2, cap * 1.32); ctx.clip(); };
      ctx.save(); clipR(); const qo = eIn(clamp(q / 0.3)); ctx.globalAlpha *= 1 - qo;
      ctx.fillText(String(o.flip.from), xs[0], base + qo * cap * 1.4); ctx.restore();
      ctx.save(); clipR(); const qi = eBack(clamp((q - 0.05) / 0.45), 2.4);
      ctx.fillText(String(o.flip.to), xs[0], base - (1 - qi) * cap * 1.4); ctx.restore();
    } else ctx.fillText(String(h), xs[0], base);
    ctx.fillText('–', xs[1], base);
    ctx.fillText(String(a), xs[2], base);
    ctx.restore();
    return m.total;
  }

  function crown(ctx, x, y, w, o = {}) {
    // (x, y) = centre of the crown's drawn shape; w = drawn width
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0);
    const s = w / 20; ctx.scale(s * (o.sx || 1), s * (o.sy || 1)); ctx.translate(-12, -9.3);
    if (o.alpha != null) ctx.globalAlpha *= clamp(o.alpha);
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur || 40; }
    ctx.fillStyle = o.color || C.gold; ctx.fill(CROWN);
    ctx.restore();
  }

  function padlock(ctx, x, y, sz, closed, color) {
    const bw = sz * 0.8, bh = sz * 0.58, bodyTop = y - bh / 2 + sz * 0.2, r = bw * 0.3;
    const cy = bodyTop - r * 0.15 - (1 - closed) * sz * 0.22;
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = sz * 0.13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - r, bodyTop + 2); ctx.lineTo(x - r, cy); ctx.arc(x, cy, r, Math.PI, 0); ctx.lineTo(x + r, bodyTop + (closed > 0.98 ? 2 : -sz * 0.06 - (1 - closed) * sz * 0.1)); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(x - bw / 2, bodyTop, bw, bh, sz * 0.12); ctx.fill();
    ctx.restore();
  }

  function pill(ctx, x, y, label, o = {}) {
    const size = o.size || 40, ls = o.ls ?? size * 0.12, pad = size * 0.7;
    const dot = o.dot ? size * 0.55 : 0;
    const w = measure(label, size, o.font || F.bold, ls) + pad * 2 + dot, h = size * 1.55;
    const x0 = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
    ctx.save(); if (o.alpha != null) ctx.globalAlpha *= clamp(o.alpha);
    ctx.translate(x0 + w / 2, y); if (o.scale) ctx.scale(o.scale, o.scale); ctx.translate(-(x0 + w / 2), -y);
    ctx.beginPath(); ctx.roundRect(x0, y - h / 2, w, h, h / 2);
    if (o.dashed) { ctx.setLineDash([size * 0.28, size * 0.22]); ctx.lineWidth = Math.max(2, size * 0.07); ctx.strokeStyle = o.stroke || o.color; ctx.stroke(); ctx.setLineDash([]); }
    else { ctx.fillStyle = o.bg || C.ink; ctx.fill(); }
    if (o.dot) { ctx.beginPath(); ctx.arc(x0 + pad + dot * 0.3, y, size * 0.2, 0, Math.PI * 2); ctx.fillStyle = o.dotColor || o.color; ctx.fill(); }
    text(ctx, label, x0 + pad + dot, y + size * 0.36, { size, font: o.font || F.bold, color: o.color || C.cream, align: 'left', ls });
    ctx.restore();
    return w;
  }

  // ---------- camera & shake (kept gentle: only the big moments hit) ----------
  const IMPACTS = [
    [T.title1, 12], [T.title1b, 6], [T.title2, 10], [T.title2b, 6], [T.ko, 12], [T.live, 10], [T.goal, 34], [T.flip, 14],
    [T.exact, 12], [T.crownLand, 14], [T.jackLine, 6], [T.unbear2, 18], [T.logo, 10], [T.cta, 6], [T.sting, 6],
  ];
  // a quick zoom "punch" on each cut and big hit, so every scene lands on the beat
  const PUNCHES = [T.title1, T.title1b, T.title2, T.title2b, T.pick, T.rival, T.ko, T.live, T.goal, T.flip, T.exact, T.ft, T.crownLand, T.punch, T.unbear2, T.logo, T.sting];
  const punchAt = t => PUNCHES.reduce((s, t0) => s + (t >= t0 && t - t0 < 0.5 ? 0.045 * Math.exp(-(t - t0) * 9) : 0), 0);
  function shake(t) {
    let x = 0, y = 0, r = 0;
    for (const [t0, a] of IMPACTS) {
      const d = t - t0; if (d < 0 || d > 0.4) continue;
      const k = a * Math.pow(1 - d / 0.4, 2);
      x += k * Math.sin(d * 97 + t0 * 13); y += k * Math.sin(d * 71 + t0 * 7 + 1.7); r += k * 0.0004 * Math.sin(d * 53 + t0);
    }
    return { x, y, r };
  }
  function camera(ctx, t, s = 1, cx = W / 2, cy = H / 2) {
    const k = shake(t);
    ctx.translate(W / 2 + k.x, H / 2 + k.y); ctx.rotate(k.r); s *= 1 + punchAt(t); ctx.scale(s, s); ctx.translate(-cx, -cy);
  }
  // Big display line, vertically centred on y.
  function headline(ctx, s, x, y, size, color, o = {}) {
    const sc = o.scale ?? 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    text(ctx, s, 0, size * A.figure / 2, { size, font: F.disp, color, alpha: o.alpha, ls: o.ls || 0, align: o.align });
    ctx.restore();
  }
  // Step label, top-left: tells the viewer which part of the game they're watching.
  function step(ctx, t, t0, n, label, o = {}) {
    const a = eOut(P(t, t0, t0 + 0.3)) * (o.alpha ?? 1); if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - eOut(P(t, t0, t0 + 0.3))) * -60, 0);
    const size = 42, h = size * 1.55, x0 = 110, y = 112;
    ctx.beginPath(); ctx.arc(x0 + h / 2, y, h / 2, 0, Math.PI * 2); ctx.fillStyle = o.numBg || C.green; ctx.fill();
    text(ctx, String(n), x0 + h / 2, y + size * 0.36, { size, font: F.disp, color: o.numColor || C.cream });
    text(ctx, label, x0 + h + 20, y + size * 0.36, { size, font: F.bold, color: o.color || C.ink, align: 'left', ls: 5 });
    ctx.restore();
  }

  // ---------- backgrounds ----------
  function paperBg(ctx, t, drift = 0) {
    ctx.fillStyle = C.paper; ctx.fillRect(-200, -200, W + 400, H + 400);
    // faint pitch markings: halfway line and centre circle
    ctx.save(); ctx.strokeStyle = rgba(C.ink, 0.05); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(960 + drift, -200); ctx.lineTo(960 + drift, H + 200); ctx.stroke();
    ctx.beginPath(); ctx.arc(960 + drift, 540, 430, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function nightBg(ctx, t, o = {}) {
    const img = A.stadium, z = (o.zoom || 1.06) + (t % 40) * 0.003;
    const s = Math.max(W / img.width, H / img.height) * z, dw = img.width * s, dh = img.height * s;
    ctx.fillStyle = C.night; ctx.fillRect(-200, -200, W + 400, H + 400);
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2 - 20);
    ctx.fillStyle = rgba(C.night, o.dim ?? 0.76); ctx.fillRect(-200, -200, W + 400, H + 400);
    const g = ctx.createRadialGradient(960, 520, 200, 960, 540, 1250);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${o.vig ?? 0.55})`);
    ctx.fillStyle = g; ctx.fillRect(-200, -200, W + 400, H + 400);
  }

  // ---------- pick card (the object that carries the story) ----------
  // Card centred at (x, y), scale s. Numerals are drawn by the caller at numAt().
  const CARD = { w: 560, h: 340, num: 210, numDy: 34 };
  const numAt = (x, y, s) => ({ x, y: y + CARD.numDy * s, size: CARD.num * s });
  function drawPickCard(ctx, x, y, s, o = {}) {
    const g = o.grow ?? 1; if (g <= 0) return;
    const w = CARD.w * s, h = CARD.h * s, gs = lerp(0.6, 1, eOut(g));
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); ctx.scale(gs, gs); ctx.globalAlpha *= clamp(g * 1.5);
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 50 * s; ctx.shadowOffsetY = 18 * s;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 38 * s); ctx.fillStyle = o.fill || C.green; ctx.fill();
    ctx.shadowColor = 'transparent';
    if (o.gold) { ctx.lineWidth = 7 * s; ctx.strokeStyle = rgba(C.gold, clamp(o.gold)); ctx.stroke(); }
    else { ctx.lineWidth = 3 * s; ctx.strokeStyle = 'rgba(243,241,232,.22)'; ctx.stroke(); }
    text(ctx, o.label || 'YOUR PICK', -w / 2 + 42 * s, -h / 2 + 68 * s, { size: 40 * s, font: F.bold, color: C.cream, align: 'left', ls: 6 * s, alpha: 0.85 });
    padlock(ctx, w / 2 - 62 * s, -h / 2 + 56 * s, 50 * s, o.lockQ ?? 1, o.lockQ != null && o.lockQ < 1 ? 'rgba(243,241,232,.45)' : C.gold);
    if (o.num) drawScore(ctx, 0, CARD.numDy * s, CARD.num * s, o.num[0], o.num[1], { color: o.numColor || C.cream });
    ctx.restore();
  }

  // ---------- group table ----------
  const TB = { x: 1010, y0: 330, w: 820, h: 200, gap: 236 };
  const slotRect = (i, dx = 0) => ({ x: TB.x + dx, y: TB.y0 + i * TB.gap, w: TB.w, h: TB.h });
  const lerpRect = (a, b, q) => ({ x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q), w: lerp(a.w, b.w, q), h: lerp(a.h, b.h, q) });
  const crownOnRow = r => { const k = r.h / 176; return { x: r.x + 168 * k, y: r.y + 2 * k, w: 96 * k, rot: -0.2 }; };

  function rowSlot(id, t) {
    const a = ORDER_LIVE.indexOf(id), b = ORDER_FT.indexOf(id);
    const q = id === 'you' ? eExpo(P(t, T.swap, T.swap + 0.5)) : eIO(P(t, T.swap + 0.05, T.swap + 0.55));
    return lerp(a, b, q);
  }
  function rowPoints(p, t) {
    if (t < T.award) return p.live;
    return Math.round(lerp(p.live, p.fin, eOut(P(t, T.award, T.award + 0.4))));
  }
  function tableOffset(t) {
    if (t < T.ft) {
      const a = eExpo(P(t, T.table, T.table + 0.55)), b = eIn(P(t, T.tension, T.tension + 0.42));
      return (1 - a) * 1000 + b * 1100;
    }
    return (1 - eExpo(P(t, T.ft + 0.12, T.ft + 0.55))) * 1000;
  }
  function drawRow(ctx, r, p, pts, rank, o = {}) {
    const k = r.h / 176, you = p.id === 'you';
    ctx.save(); if (o.alpha != null) ctx.globalAlpha *= clamp(o.alpha);
    if (o.scale && o.scale !== 1) { ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(o.scale, o.scale); ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2)); }
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 28 * k);
    if (you) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40 * k; ctx.shadowOffsetY = 14 * k; ctx.fillStyle = C.paper; ctx.fill(); ctx.shadowColor = 'transparent'; }
    else { ctx.fillStyle = 'rgba(243,241,232,.1)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(243,241,232,.18)'; ctx.stroke(); }
    const ink = you ? C.ink : C.cream;
    text(ctx, String(rank), r.x + 54 * k, r.y + r.h / 2 + 72 * k * A.figure / 2, { size: 72 * k, font: F.disp, color: you ? C.goldPaper : C.gold });
    text(ctx, p.name, r.x + 110 * k, r.y + 104 * k, { size: 108 * k, font: F.disp, color: ink, align: 'left', ls: 1 * k });
    text(ctx, `PICKED ${p.pick[0]}–${p.pick[1]}`, r.x + 113 * k, r.y + 150 * k, { size: 40 * k, font: F.bold, color: you ? C.muted : 'rgba(243,241,232,.65)', align: 'left', ls: 3 * k });
    text(ctx, String(pts), r.x + r.w - 44 * k, r.y + r.h / 2 + 124 * k * A.figure / 2, { size: 124 * k, font: F.disp, color: ink, align: 'right' });
    text(ctx, 'PTS', r.x + r.w - 44 * k, r.y + r.h / 2 + 124 * k * A.figure / 2 + 40 * k, { size: 26 * k, font: F.bold, color: you ? C.muted : 'rgba(243,241,232,.55)', align: 'right', ls: 3 * k });
    ctx.restore();
  }
  const CHIP = 40;
  function rowChipX(r, label, size) {
    const k = r.h / 176, w = measure(label, size, F.bold, size * 0.12) + size * 1.4;
    return r.x + r.w - 175 * k - w / 2;
  }

  function burst(ctx, x, y, q, n, dist, color, size) {
    const r = rng(Math.round(x * 7 + y * 13));
    ctx.save(); ctx.fillStyle = color; ctx.globalAlpha *= 1 - q;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4, d = eOut(q) * dist * (0.5 + r() * 0.6), s = size * (0.6 + r());
      ctx.save(); ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.rotate(a);
      ctx.fillRect(-s * 2.2, -s / 2, s * 4.4, s); ctx.restore();
    }
    ctx.restore();
  }

  // Confetti: deterministic particles fired from (ox, oy) at time t0, falling under gravity.
  function confetti(ctx, t, t0, ox, oy, o = {}) {
    const d = t - t0, life = o.life || 2.2; if (d < 0 || d > life) return;
    const r = rng(o.seed || 7), cols = [C.gold, '#f0cf7d', C.cream, '#43b873', C.green];
    ctx.save(); ctx.globalAlpha *= 1 - P(d, life - 0.5, life);
    for (let i = 0; i < (o.n || 90); i++) {
      const a = (o.angle ?? -Math.PI / 2) + (r() - 0.5) * (o.spread || 2.6), sp = (o.speed || 1300) * (0.45 + r() * 0.7);
      const spin = r() * 10 - 5, flutter = 4 + r() * 6, ph = r() * 6, w = 12 + r() * 14, h = 7 + r() * 7, col = cols[Math.floor(r() * cols.length)];
      const k = (1 - Math.exp(-2.2 * d)) / 2.2;
      const x = ox + Math.cos(a) * sp * k + Math.sin(d * 3 + ph) * 24, y = oy + Math.sin(a) * sp * k + 520 * d * d;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ph + d * spin); ctx.scale(1, Math.cos(d * flutter + ph));
      ctx.fillStyle = col; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore();
    }
    ctx.restore();
  }

  // =====================================================================
  // 1–2. What the game is, then you pick the score (paper)
  // =====================================================================
  // Matchday card geometry (simplified from the app's Matchday screen), centred at MC.
  const MC = { x: 960, y: 600, w: 1000, h: 760 };
  function matchdayCard(ctx, t) {
    const { w, h } = MC;
    ctx.shadowColor = 'rgba(40,30,10,.16)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 26;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 52); ctx.fillStyle = C.card; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2; ctx.strokeStyle = C.line; ctx.stroke();
    text(ctx, 'MATCHDAY', -w / 2 + 64, -h / 2 + 92, { size: 34, font: F.bold, color: C.goldPaper, align: 'left', ls: 9 });
    text(ctx, FIXTURE.home, -w / 2 + 64, -h / 2 + 230, { size: 92, font: F.serifUp, color: C.ink, align: 'left' });
    text(ctx, FIXTURE.away, w / 2 - 64, -h / 2 + 230, { size: 92, font: F.serifUp, color: C.ink, align: 'right' });
    text(ctx, FIXTURE.kickoff, 0, -h / 2 + 196, { size: 50, font: F.bold, color: C.muted });
    text(ctx, 'Locks in 2h', 0, -h / 2 + 246, { size: 34, font: F.body, color: '#9a978f' });
    // steppers: app default draft is 1–1; one tap makes it 2–1
    const home = t >= T.tap ? 2 : 1, away = 1;
    const sy = -h / 2 + 300, sh = 200, sw = 410;
    [[-w / 2 + 70, home, T.tap], [w / 2 - 70 - sw, away, null]].forEach(([x, v, tap]) => {
      ctx.beginPath(); ctx.roundRect(x, sy, sw, sh, sh / 2); ctx.fillStyle = '#f7f4ec'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = rgba(C.ink, 0.1); ctx.stroke();
      const pop = tap != null && t >= tap ? 1 + 0.35 * Math.exp(-(t - tap) * 10) : 1;
      ctx.save(); ctx.translate(x + sw / 2, sy + sh / 2); ctx.scale(pop, pop);
      text(ctx, String(v), 0, 170 * A.figure / 2, { size: 170, font: F.disp, color: C.ink });
      ctx.restore();
      text(ctx, '−', x + 70, sy + sh / 2 + 28, { size: 90, font: F.body, color: C.green });
      text(ctx, '+', x + sw - 70, sy + sh / 2 + 30, { size: 90, font: F.body, color: C.green });
      if (tap != null) {
        const d = t - tap + 0.25; // finger arrives just before the tap
        if (d > 0 && d < 0.75) {
          const q = clamp((d - 0.25) / 0.5);
          ctx.beginPath(); ctx.arc(x + sw - 70, sy + sh / 2, 40 + q * 110, 0, Math.PI * 2); ctx.fillStyle = rgba(C.green, 0.3 * (1 - q)); ctx.fill();
        }
      }
    });
    ctx.fillStyle = rgba(C.ink, 0.12); ctx.fillRect(-1, sy + 50, 2, sh - 100);
    // "Lock in my picks" → "✓ Picks saved"
    const by = -h / 2 + 530, bh = 124, d = t - T.save;
    const press = d >= 0 && d < 0.3 ? 1 - 0.06 * Math.sin((d / 0.3) * Math.PI) : 1;
    ctx.save(); ctx.translate(0, by + bh / 2); ctx.scale(press, press);
    ctx.beginPath(); ctx.roundRect(-(w - 128) / 2, -bh / 2, w - 128, bh, bh / 2); ctx.fillStyle = C.goldPaper; ctx.fill();
    text(ctx, 'Lock in my picks', 0, 19, { size: 54, font: F.body, color: '#ffffff' });
    ctx.restore();
    if (d >= 0 && d < 0.45) { const q = d / 0.45; ctx.beginPath(); ctx.arc(0, by + bh / 2, 40 + q * 420, 0, Math.PI * 2); ctx.fillStyle = rgba(C.goldPaper, 0.22 * (1 - q)); ctx.fill(); }
    const sa = eOut(P(t, T.save + 0.1, T.save + 0.35));
    if (sa > 0) text(ctx, '✓ Picks saved', 0, h / 2 - 40 + (1 - sa) * 16, { size: 50, font: F.body, color: C.green, alpha: sa });
  }

  function sceneOpen(ctx, t, o = {}) {
    ctx.save(); camera(ctx, t, 1 + t * 0.005);
    if (o.bg !== false) paperBg(ctx, t, -t * 12);
    // title: what the game is
    const out = eIn(P(t, T.toPick, T.pick));
    if (out < 1) {
      ctx.save(); ctx.translate(0, -out * 900);
      crown(ctx, 960, 260, 130 * eBack(P(t, 0, 0.35), 2), { color: C.goldPaper });
      // each word slams in on the beat
      const lines = [[[['PREDICT ', T.title1], ['THE SCORE.', T.title1b]], 510, C.ink], [[['BEAT ', T.title2], ['YOUR MATES.', T.title2b]], 740, C.green]];
      for (const [parts, y, color] of lines) {
        let x = 960 - measure(parts.map(p => p[0]).join(''), 210, F.disp) / 2;
        for (const [w, t0] of parts) {
          const ww = measure(w, 210, F.disp);
          if (t >= t0) { const e = eExpo(P(t, t0, t0 + 0.3)); headline(ctx, w, x + ww / 2, y, 210, color, { scale: lerp(1.6, 1, e), alpha: e * 2 }); }
          x += ww;
        }
      }
      // your mates pop in around the title
      const spots = [[300, 330, -0.12, C.ink], [1620, 320, 0.1, C.goldPaper], [330, 930, 0.08, C.goldPaper], [1600, 940, -0.09, C.ink]];
      MATES.forEach((name, i) => {
        const t0 = T.mates + i * 0.24; if (t < t0) return;
        const [x, y, r, bg] = spots[i % spots.length], e = eBack(P(t, t0, t0 + 0.28), 2.6);
        ctx.save(); ctx.translate(x, y + Math.sin((t - t0) * 3 + i) * 6); ctx.rotate(r);
        pill(ctx, 0, 0, name, { size: 64, bg, color: C.cream, scale: e, font: F.disp, ls: 4 });
        ctx.restore();
      });
      ctx.restore();
    }
    // step 1: pick the score
    if (t >= T.toPick) {
      step(ctx, t, T.pick, 1, 'PICK THE SCORE', { alpha: 1 - P(t, T.toRival, T.toRival + 0.2) });
      const enter = eExpo(P(t, T.toPick + 0.1, T.pick + 0.35));
      const m = eIO(P(t, T.toRival, T.rival)); // shrink into your pick card
      const cx = lerp(MC.x, 620, m), cy = lerp(MC.y + (1 - enter) * 1000, 640, m), s = lerp(1, 0.56, m);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.globalAlpha *= 1 - P(m, 0.15, 0.6);
      matchdayCard(ctx, t);
      ctx.restore();
    }
    ctx.restore();
  }

  // =====================================================================
  // 3–4. Your mate laughs; kick-off locks the picks; how points work
  // =====================================================================
  function sceneRival(ctx, t) {
    ctx.save(); camera(ctx, t, 1 + P(t, T.toRival, T.toLive) * 0.03);
    paperBg(ctx, t, -(t - T.toRival) * 12);
    // green wipe for kick-off
    const wq = eIO(P(t, T.toKO, T.ko));
    if (wq > 0) {
      ctx.fillStyle = C.green; ctx.beginPath();
      ctx.moveTo(-200, -200); ctx.lineTo(-200 + wq * 2700, -200); ctx.lineTo(-200 + wq * 2700 - 500, H + 200); ctx.lineTo(-200, H + 200); ctx.fill();
    }
    // quote
    const qa = 1 - eIn(P(t, T.toKO, T.toKO + 0.3));
    if (qa > 0 && t >= T.q1) {
      ctx.save(); ctx.globalAlpha *= qa; ctx.translate(0, -(1 - qa) * 120);
      const p1 = '‘2–1? ', p2 = 'You’re having a laugh.’', size = 128;
      const w1 = measure(p1, size, F.serif), w2 = measure(p2, size, F.serif), x0 = 960 - (w1 + w2) / 2;
      const a1 = eBack(P(t, T.q1, T.q1 + 0.25), 2.2);
      ctx.save(); ctx.translate(x0 + w1 / 2, 290); ctx.scale(a1, a1); text(ctx, p1, 0, 0, { size, font: F.serif, color: C.ink }); ctx.restore();
      if (t >= T.q2) text(ctx, p2, x0 + w1, 290 + (1 - eOut(P(t, T.q2, T.q2 + 0.2))) * 24, { size, font: F.serif, color: C.ink, align: 'left', alpha: eOut(P(t, T.q2, T.q2 + 0.2)) });
      const ja = eOut(P(t, T.q2 + 0.3, T.q2 + 0.55));
      if (ja > 0) text(ctx, '— JACK', 960, 380, { size: 46, font: F.bold, color: C.muted, ls: 8, alpha: ja });
      ctx.restore();
    }
    // the two picks
    const up = eIO(P(t, T.toKO + 0.1, T.ko + 0.1));
    const lockQ = eIn(P(t, T.ko - 0.1, T.ko));
    const grow = P(t, T.toRival + 0.1, T.rival);
    const yx = lerp(620, 600, up), yy = lerp(640, 330, up), ys = lerp(1, 0.78, up);
    drawPickCard(ctx, yx, yy, ys, { grow, num: [2, 1], lockQ: t < T.ko - 0.1 ? 0 : lockQ });
    const jin = eExpo(P(t, T.rival, T.rival + 0.45));
    if (jin > 0) {
      const laugh = t >= T.q2 ? 0.06 * Math.sin((t - T.q2) * 32) * Math.exp(-(t - T.q2) * 3) : 0;
      const jx = lerp(lerp(2400, 1300, jin), 1320, up), jy = lerp(640, 330, up);
      drawPickCard(ctx, jx, jy, ys, { label: 'JACK’S PICK', fill: '#1d2621', num: [1, 1], lockQ: t < T.ko - 0.1 ? 0 : lockQ, rot: laugh });
    }
    // kick-off: picks locked, how points work
    if (t >= T.ko) {
      step(ctx, t, T.ko, 2, 'LOCKED AT KICK-OFF', { color: C.cream, numBg: C.cream, numColor: C.green });
      const k = eExpo(P(t, T.ko, T.ko + 0.3));
      headline(ctx, 'KICK-OFF. PICKS LOCKED.', 960, 600, 130, C.cream, { scale: lerp(1.25, 1, k), alpha: k * 2 });
      [[T.rule1, 'EXACT SCORE', '+3 POINTS'], [T.rule2, 'RIGHT RESULT', '+1 POINT']].forEach(([t0, a, b], i) => {
        const e = eExpo(P(t, t0, t0 + 0.35)); if (e <= 0) return;
        const y = 790 + i * 130;
        ctx.save(); ctx.globalAlpha *= Math.min(1, e * 2); ctx.translate((1 - e) * 80, 0);
        ctx.fillStyle = 'rgba(243,241,232,.12)'; ctx.beginPath(); ctx.roundRect(520, y - 56, 880, 112, 56); ctx.fill();
        text(ctx, a, 580, y + 22, { size: 62, font: F.bold, color: C.cream, align: 'left', ls: 4 });
        text(ctx, b, 1340, y + 30, { size: 84, font: F.disp, color: '#f0cf7d', align: 'right' });
        ctx.restore();
      });
    }
    ctx.restore();
  }

  // =====================================================================
  // 5–7. Live, tension, goal, full time (stadium)
  // =====================================================================
  function pickState(t) {
    let x = 1360, y = 560, s = 1.1;
    const a = eIO(P(t, T.table, T.table + 0.55)); x = lerp(x, 470, a); y = lerp(y, 790, a); s = lerp(s, 0.85, a);
    const b = eIO(P(t, T.tension, T.tension + 0.6)); x = lerp(x, 1360, b); y = lerp(y, 540, b); s = lerp(s, 1.2, b);
    const f = eExpo(P(t, T.ft, T.ft + 0.35)); x = lerp(x, 470, f); y = lerp(y, 580, f); s = lerp(s, 1.0, f);
    return { x, y, s };
  }
  function liveState(t) {
    let x = 600, y = 560, s = 380;
    const a = eIO(P(t, T.table, T.table + 0.55)); x = lerp(x, 470, a); y = lerp(y, 400, a); s = lerp(s, 260, a);
    const b = eIO(P(t, T.tension, T.tension + 0.6)); x = lerp(x, 560, b); y = lerp(y, 560, b); s = lerp(s, 400, b);
    const m = eIn(P(t, T.merge, T.exact));
    const pk = pickState(t), n = numAt(pk.x, pk.y, pk.s);
    return { x: lerp(x, n.x, m), y: lerp(y, n.y, m), s: lerp(s, n.size, m), m };
  }
  const clockAt = t => { let c = CLOCK[0][1]; for (const [t0, v] of CLOCK) if (t >= t0) c = v; return c; };
  const lastTick = t => { let tk = -9; for (const [t0] of CLOCK) if (t >= t0) tk = t0; return tk; };

  function sceneMatch(ctx, t) {
    const tension = eIO(P(t, T.tension, T.goal)) * (1 - P(t, T.goal, T.goal + 0.05));
    ctx.save(); camera(ctx, t, 1 + 0.13 * tension + 0.02 * P(t, T.live, T.tension), 960, 560);

    nightBg(ctx, t, { dim: lerp(0.74, 0.86, tension), vig: lerp(0.55, 0.85, tension), zoom: 1.08 });
    // goal: green flood, fades back to the stadium by full time
    if (t >= T.goal && t < T.ft + 0.4) {
      const fa = t < T.flip ? 1 : lerp(1, 0.85, P(t, T.flip, T.flip + 0.3)) * (1 - P(t, T.ft, T.ft + 0.4));
      const g = ctx.createRadialGradient(960, 560, 100, 960, 560, 1300);
      g.addColorStop(0, rgba('#17904f', fa)); g.addColorStop(1, rgba(C.greenDeep, fa));
      ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, H + 600);
    }

    const inGoal = t >= T.goal && t < T.flip;
    const objA = inGoal ? 0 : t >= T.flip ? eOut(P(t, T.flip, T.flip + 0.12)) : 1;
    ctx.save(); ctx.globalAlpha = objA;

    // step labels
    if (t < T.ft) step(ctx, t, T.live, 3, 'FOLLOW IT LIVE', { color: C.cream, alpha: 1 - P(t, T.tension, T.tension + 0.3) });
    else step(ctx, t, T.ft + 0.1, 4, 'TOP THE TABLE', { color: C.cream });

    // group table
    const off = tableOffset(t);
    if (off < 1000) {
      const ft = t >= T.ft;
      text(ctx, 'GROUP TABLE', TB.x + off + 4, TB.y0 - 46, { size: 38, font: F.bold, color: 'rgba(243,241,232,.65)', align: 'left', ls: 6 });
      if (!ft) pill(ctx, TB.x + TB.w + off, TB.y0 - 60, 'IF IT ENDS 1–1', { size: 36, align: 'right', dashed: true, color: C.cream, stroke: 'rgba(243,241,232,.55)' });
      else pill(ctx, TB.x + TB.w + off, TB.y0 - 60, 'FULL TIME', { size: 36, align: 'right', bg: C.gold, color: C.ink });
      const rects = {};
      for (const p of PL) rects[p.id] = slotRect(rowSlot(p.id, t), off);
      for (const id of ['jack', 'you']) {
        const r = rects[id], p = byId[id], k = r.h / 176;
        const charge = id === 'you' ? Math.sin(Math.PI * P(t, T.swap, T.swap + 0.5)) : 0;
        drawRow(ctx, r, p, rowPoints(p, t), Math.round(rowSlot(id, t)) + 1, { scale: 1 + charge * 0.04 });
        // projected points (dashed) fall away when the final score lands
        if (p.dLive > 0 && t < T.award + 0.4) {
          const d = P(t, T.award, T.award + 0.4), lab = `+${p.dLive}`;
          ctx.save(); ctx.translate(rowChipX(r, lab, CHIP * k), r.y + r.h / 2 + d * d * 180); ctx.rotate(d * 0.5);
          pill(ctx, 0, 0, lab, { size: CHIP * k, dashed: true, color: C.cream, stroke: 'rgba(243,241,232,.75)', alpha: 1 - d });
          ctx.restore();
        }
        if (p.dFin > 0 && t >= T.award) {
          const lab = chipFor(p.dFin);
          pill(ctx, rowChipX(r, lab, CHIP * k), r.y + r.h / 2, lab, { size: CHIP * k, bg: C.gold, color: C.ink, scale: eBack(P(t, T.award, T.award + 0.22), 2.2) });
        }
      }
      // the crown moves from the old leader to the new one
      const cj = crownOnRow(slotRect(rowSlot(LEADER_LIVE, T.crownLift), off));
      const cy = crownOnRow(slotRect(rowSlot('you', T.crownLand), off));
      if (t < T.crownLift) {
        const c = crownOnRow(rects[LEADER_LIVE]);
        crown(ctx, c.x, c.y, c.w, { rot: c.rot, glow: 'rgba(201,162,79,.5)', glowBlur: 30 });
      } else if (t < T.crownLand) {
        const q = P(t, T.crownLift, T.crownLand), e = eIO(q);
        crown(ctx, lerp(cj.x, cy.x, e) - 140 * Math.sin(Math.PI * q), lerp(cj.y, cy.y, e) - 60 * Math.sin(Math.PI * q), cj.w * (1 + 0.5 * Math.sin(Math.PI * q)),
          { rot: lerp(cj.rot, cy.rot + Math.PI * 2, e), glow: 'rgba(225,178,74,.8)', glowBlur: 50 });
      } else {
        const d = t - T.crownLand, sq = 0.25 * Math.exp(-d * 9) * Math.cos(d * 40), c = crownOnRow(rects.you);
        crown(ctx, c.x, c.y + sq * 20, c.w, { rot: c.rot, sx: 1 + sq, sy: 1 - sq, glow: 'rgba(225,178,74,.7)', glowBlur: 40 });
        if (d < 0.5) burst(ctx, c.x, c.y, d / 0.5, 20, 240, C.gold, 3);
      }
    }

    // your pick + the live score
    const pk = pickState(t), ls = liveState(t), n = numAt(pk.x, pk.y, pk.s);
    const exactQ = P(t, T.exact, T.exact + 0.08), exactFade = 1 - P(t, T.exact + 0.5, T.exact + 1.4);
    drawPickCard(ctx, pk.x, pk.y, pk.s, { gold: exactQ });
    drawScore(ctx, n.x, n.y, n.size, 2, 1, { color: exactQ > 0 ? mix(C.cream, '#f6d27a', exactQ * exactFade) : C.cream, glow: exactQ > 0 ? `rgba(225,178,74,${0.9 * exactFade})` : null, glowBlur: 60 });
    if (t >= T.ft) pill(ctx, pk.x, pk.y - CARD.h * pk.s / 2 - 60, `FULL TIME  ${FINAL_SCORE.join('–')}`, { size: 38, bg: C.cream, color: C.ink, alpha: eOut(P(t, T.ft + 0.15, T.ft + 0.45)) });

    if (t >= T.live && ls.m < 1) {
      const enter = eExpo(P(t, T.live, T.live + 0.3)), s = ls.s * lerp(1.3, 1, enter);
      const cap = s * A.figure, extrasA = (1 - P(ls.m, 0, 0.4)) * Math.min(1, enter * 2);
      const lsz = Math.max(42, s * 0.13), labelY = ls.y - cap / 2 - s * 0.16;
      text(ctx, `${FIXTURE.home.toUpperCase()}  v  ${FIXTURE.away.toUpperCase()}`, ls.x, labelY, { size: lsz, font: F.bold, color: 'rgba(243,241,232,.8)', ls: 6, alpha: extrasA });
      const tk = lastTick(t), tp = Math.exp(-(t - tk) * 8);
      pill(ctx, ls.x, labelY - lsz - 52, `LIVE  ${clockAt(t)}`, { size: 42, bg: C.green, color: C.cream, dot: true, dotColor: '#7cf0a8', alpha: extrasA, scale: 1 + tp * 0.05 });
      const flipQ = P(t, T.flip, T.flip + 0.45), hb = 1 + tension * 0.025 * Math.exp(-(t - tk) * 10);
      ctx.save(); ctx.translate(ls.x, ls.y); ctx.scale(hb, hb); ctx.translate(-ls.x, -ls.y);
      drawScore(ctx, ls.x, ls.y, s, t >= T.flip ? 2 : 1, 1, { color: C.cream, alpha: Math.min(1, enter * 2), flip: t >= T.flip && flipQ < 1 ? { from: 1, to: 2, q: flipQ } : null });
      ctx.restore();
    }

    // tension: big ticking clock
    const ca = P(t, T.tension + 0.25, T.tension + 0.6) * (1 - P(t, T.goal, T.goal + 0.04));
    if (ca > 0) {
      const tp = Math.exp(-(t - lastTick(t)) * 7);
      headline(ctx, clockAt(t), 960, 900, 130, C.cream, { scale: 1 + tp * 0.07, alpha: ca, ls: 2 });
    }

    // exact score: ring, then "+3 EXACT SCORE" which flies into your row when points are awarded
    if (t >= T.exact) {
      const d = t - T.exact;
      if (d < 0.6) { const q = d / 0.6; ctx.save(); ctx.strokeStyle = rgba('#e1b24a', 1 - q); ctx.lineWidth = 36 * (1 - q) + 2; ctx.beginPath(); ctx.arc(n.x, n.y, 80 + eOut(q) * 850, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); burst(ctx, n.x, n.y, q, 26, 650, '#e1b24a', 6); }
      const fly = eIn(P(t, T.award - 0.3, T.award));
      if (fly < 1) {
        const home = { x: pk.x, y: pk.y + CARD.h * pk.s / 2 + 84 };
        const you = slotRect(rowSlot('you', T.award), tableOffset(T.award)), k = you.h / 176;
        const dest = { x: rowChipX(you, '+3 EXACT', CHIP * k), y: you.y + you.h / 2 };
        pill(ctx, lerp(home.x, dest.x, fly), lerp(home.y, dest.y, fly) - 160 * Math.sin(Math.PI * fly), fly > 0 ? '+3 EXACT' : '+3  EXACT SCORE',
          { size: lerp(64, CHIP * k, fly), bg: C.gold, color: C.ink, scale: eBack(P(t, T.exact, T.exact + 0.24), 2.4) });
      }
    }
    ctx.restore(); // objA

    // callback to Jack's line
    const jl = eOut(P(t, T.jackLine, T.jackLine + 0.25));
    if (jl > 0) text(ctx, 'Still laughing, Jack?', 960, 990 + (1 - jl) * 24, { size: 96, font: F.serif, color: C.cream, alpha: jl });

    // celebrations: confetti cannons for the goal, a shower when the crown lands
    confetti(ctx, t, T.goal, 120, 1150, { angle: -1.15, spread: 1.0, speed: 2600, n: 120, seed: 3, life: 2.6 });
    confetti(ctx, t, T.goal, 1800, 1150, { angle: -1.99, spread: 1.0, speed: 2600, n: 120, seed: 5, life: 2.6 });
    if (t >= T.crownLand) { const c = crownOnRow(slotRect(rowSlot('you', T.crownLand), tableOffset(T.crownLand))); confetti(ctx, t, T.crownLand, c.x, c.y, { speed: 1100, n: 70, seed: 9, life: 2.2 }); }

    // GOAL: one clean full-frame hit, then out of the way
    if (t >= T.goal && t < T.flip + 0.15) {
      const fl = 1 - P(t, T.goal, T.goal + 0.08);
      if (fl > 0) { ctx.fillStyle = `rgba(255,253,240,${fl})`; ctx.fillRect(-300, -300, W + 600, H + 600); }
      // sunburst behind the word
      ctx.save(); ctx.translate(960, 540); ctx.rotate((t - T.goal) * 0.6); ctx.fillStyle = 'rgba(243,241,232,.09)';
      for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1600, (i / 16) * Math.PI * 2, (i / 16 + 1 / 32) * Math.PI * 2); ctx.fill(); }
      ctx.restore();
      const e = eExpo(P(t, T.goal, T.goal + 0.2)), ex = eIn(P(t, T.flip - 0.04, T.flip + 0.12));
      headline(ctx, 'GOAL!', 960, 540, 600, C.cream, { scale: lerp(1.5, 1, e) * (1 + ex * 0.5), alpha: Math.min(1, e * 3) * (1 - ex), ls: 6 });
    }
    ctx.restore();
  }

  // =====================================================================
  // 8. Punchline and logo
  // =====================================================================
  const BIG = { x: 250, y: 260, w: 1420, h: 260 };
  function scenePunch(ctx, t) {
    const toLogo = eIn(P(t, T.wipe, T.logo));
    ctx.save(); camera(ctx, t, 1 + P(t, T.punch, T.wipe) * 0.03 + P(t, T.logo, T.end) * 0.04, 960, 540);
    nightBg(ctx, t, { zoom: 1.12 });
    const q = eExpo(P(t, T.punch, T.punch + 0.5)), tEnd = T.punch - 0.01;
    // Jack's row and the score card leave
    const a = 1 - P(t, T.punch, T.punch + 0.3);
    if (a > 0) {
      const r0 = slotRect(rowSlot('jack', tEnd));
      drawRow(ctx, { ...r0, y: r0.y + q * 500 }, byId.jack, byId.jack.fin, 2, { alpha: a });
      ctx.save(); ctx.globalAlpha = a; ctx.translate(-q * 600, 0);
      const pk = pickState(tEnd); drawPickCard(ctx, pk.x, pk.y, pk.s, { gold: 1, num: [2, 1] });
      ctx.restore();
    }
    // your row, big, wearing the crown
    const r = lerpRect(slotRect(0), BIG, q);
    if (toLogo < 1) { ctx.save(); ctx.globalAlpha = 1 - toLogo; drawRow(ctx, r, byId.you, byId.you.fin, 1); ctx.restore(); }
    const u1 = eOut(P(t, T.unbear1, T.unbear1 + 0.2)), u2 = eExpo(P(t, T.unbear2, T.unbear2 + 0.25));
    if (u1 > 0) text(ctx, 'You’ll be', 960, 690 + (1 - u1) * 30, { size: 120, font: F.serif, color: C.cream, alpha: u1 * (1 - toLogo) });
    if (t >= T.unbear2) headline(ctx, 'UNBEARABLE.', 960, 870, 300, C.gold, { scale: lerp(1.4, 1, u2), alpha: Math.min(1, u2 * 3) * (1 - toLogo), ls: 2 });

    const c = crownOnRow(r), LOGO = { x: 960, y: 380, w: 300 };
    let cx = lerp(c.x, LOGO.x, toLogo), cy = lerp(c.y, LOGO.y, toLogo), cw = lerp(c.w, LOGO.w, toLogo), rot = lerp(c.rot, 0, toLogo);
    if (t >= T.wipe) {
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, eIn(P(t, T.wipe, T.logo)) * 2300, 0, Math.PI * 2); ctx.clip();
      paperBg(ctx, t, -(t - T.logo) * 16); ctx.restore();
    }
    if (t >= T.logo) {
      const word = 'KICKPOT', size = 270, ls = size * 0.075;
      let x = 960 - measure(word, size, F.disp, ls) / 2 + ls / 2;
      for (let i = 0; i < word.length; i++) {
        const lw = measure(word[i], size, F.disp, ls), e = eExpo(P(t, T.logo + i * 0.03, T.logo + i * 0.03 + 0.25));
        text(ctx, word[i], x + lw / 2 - ls / 2, 720 + (1 - e) * 60, { size, font: F.disp, color: C.ink, alpha: Math.min(1, e * 2) });
        x += lw;
      }
      const la = eOut(P(t, T.line, T.line + 0.4));
      if (la > 0) text(ctx, 'Predict the score. Beat your mates.', 960, 870 + (1 - la) * 24, { size: 84, font: F.serif, color: C.ink, alpha: la });
      if (t >= T.cta) pill(ctx, 960, 985, 'START A GROUP WITH YOUR MATES', { size: 54, bg: C.green, color: C.cream, scale: eBack(P(t, T.cta, T.cta + 0.3), 2.4), ls: 5 });
    }
    const land = t >= T.logo ? t - T.logo : -1;
    const sq = land >= 0 ? 0.25 * Math.exp(-land * 8) * Math.cos(land * 34) : 0;
    const hop = t >= T.sting ? Math.sin(Math.PI * P(t, T.sting, T.sting + 0.32)) * 30 : 0;
    crown(ctx, cx, cy - hop + sq * 24, cw, { rot, sx: 1 + sq, sy: 1 - sq, color: t >= T.logo ? C.goldPaper : C.gold, glow: t < T.logo ? 'rgba(225,178,74,.75)' : null, glowBlur: 50 });
    if (land >= 0 && land < 0.5) burst(ctx, cx, cy, land / 0.5, 22, 380, C.goldPaper, 5);
    ctx.restore();
  }

  // ---------- frame assembly ----------
  function renderAt(ctx, t) {
    ctx.save();
    if (t < T.toRival + 0.48) {
      if (t >= T.toRival) sceneRival(ctx, t); // paper behind the shrinking card
      sceneOpen(ctx, t, { bg: t < T.toRival });
    } else if (t < T.toLive) sceneRival(ctx, t);
    else if (t < T.punch) {
      sceneMatch(ctx, t);
      // push through from kick-off into the stadium
      const k = P(t, T.toLive, T.live + 0.12);
      if (k < 1) { ctx.save(); ctx.globalAlpha = 1 - eIn(k); ctx.translate(960, 540); ctx.scale(1 + eIn(k) * 0.35, 1 + eIn(k) * 0.35); ctx.translate(-960, -540); sceneRival(ctx, t); ctx.restore(); }
    } else scenePunch(ctx, t);
    ctx.restore();
  }

  function post(ctx, t) {
    ctx.save(); ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay';
    const f = Math.floor(t * FPS), ox = (f * 137) % 512, oy = (f * 251) % 512;
    for (let x = -ox; x < W; x += 512) for (let y = -oy; y < H; y += 512) ctx.drawImage(A.grain, x, y);
    ctx.restore();
  }

  // samples > 1 renders a motion-blurred frame (180° shutter) by averaging sub-frames.
  let sub = null;
  function drawFrame(ctx, t, opts = {}) {
    const n = opts.samples || 1, shutter = opts.shutter ?? 0.5;
    if (n <= 1) { renderAt(ctx, t); post(ctx, t); return; }
    if (!sub) { sub = document.createElement('canvas'); sub.width = W; sub.height = H; }
    const sx = sub.getContext('2d');
    for (let k = 0; k < n; k++) {
      const ts = t + ((k + 0.5) / n - 0.5) * shutter / FPS;
      sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalAlpha = 1; renderAt(sx, Math.max(0, ts));
      ctx.globalAlpha = 1 / (k + 1); ctx.drawImage(sub, 0, 0);
    }
    ctx.globalAlpha = 1; post(ctx, t);
  }

  window.KP_FILM = { load, drawFrame, W, H };
})();
