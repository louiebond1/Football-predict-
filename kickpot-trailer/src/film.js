// KickPot trailer — picture.
// drawFrame(ctx, t) is a pure function of time: the same t always draws the same frame,
// which is what lets the rewind and fast-forward replay earlier moments of the film.
// All staged data (names, picks, points) comes from timeline.js.
(function () {
  const { T, FPS, DUR, CLOCK, PLAYERS, FIXTURE, points } = window.KP_TIMELINE;
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

  // ---------- camera & shake ----------
  const IMPACTS = [
    [T.slam, 30], [T.q, 12], [T.laugh, 9], [T.lock, 10], [T.live, 24], [T.goal, 54], [T.flip, 22],
    [T.exact, 18], [T.award, 8], [T.crownLand, 18], [T.ko, 14], [T.unbear2, 26], [T.logo, 16], [T.sting, 9],
  ];
  function shake(t) {
    let x = 0, y = 0, r = 0;
    for (const [t0, a] of IMPACTS) {
      const d = t - t0; if (d < 0 || d > 0.45) continue;
      const k = a * Math.pow(1 - d / 0.45, 2);
      x += k * Math.sin(d * 97 + t0 * 13); y += k * Math.sin(d * 71 + t0 * 7 + 1.7); r += k * 0.0005 * Math.sin(d * 53 + t0);
    }
    return { x, y, r };
  }
  function camera(ctx, t, s = 1, cx = W / 2, cy = H / 2) {
    const k = shake(t);
    ctx.translate(W / 2 + k.x, H / 2 + k.y); ctx.rotate(k.r); ctx.scale(s, s); ctx.translate(-cx, -cy);
  }

  // ---------- backgrounds ----------
  function paperBg(ctx, t, drift = 0) {
    ctx.fillStyle = C.paper; ctx.fillRect(-200, -200, W + 400, H + 400);
    // faint pitch markings: halfway line and centre circle
    ctx.save(); ctx.strokeStyle = rgba(C.ink, 0.055); ctx.lineWidth = 5;
    const ox = drift;
    ctx.beginPath(); ctx.moveTo(960 + ox, -200); ctx.lineTo(960 + ox, H + 200); ctx.stroke();
    ctx.beginPath(); ctx.arc(960 + ox, 540, 430, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(960 + ox, 540, 12, 0, Math.PI * 2); ctx.fillStyle = rgba(C.ink, 0.07); ctx.fill();
    ctx.restore();
  }
  function nightBg(ctx, t, o = {}) {
    const img = A.stadium, z = (o.zoom || 1.06) + (t % 30) * 0.004;
    const s = Math.max(W / img.width, H / img.height) * z, dw = img.width * s, dh = img.height * s;
    ctx.fillStyle = C.night; ctx.fillRect(-200, -200, W + 400, H + 400);
    ctx.drawImage(img, (W - dw) / 2 + (o.px || 0), (H - dh) / 2 - 20);
    ctx.fillStyle = rgba(C.night, o.dim ?? 0.76); ctx.fillRect(-200, -200, W + 400, H + 400);
    const g = ctx.createRadialGradient(960, 520, 200, 960, 540, 1250);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${o.vig ?? 0.55})`);
    ctx.fillStyle = g; ctx.fillRect(-200, -200, W + 400, H + 400);
  }

  // ---------- pick card (the object that carries the story) ----------
  // Card centred at (x, y), scale s. Numerals are drawn separately by the caller at numAt().
  const CARD = { w: 560, h: 340, num: 210, numDy: 34 };
  const numAt = (x, y, s) => ({ x, y: y + CARD.numDy * s, size: CARD.num * s });
  function drawPickCard(ctx, x, y, s, o = {}) {
    const g = o.grow ?? 1; if (g <= 0) return;
    const w = CARD.w * s, h = CARD.h * s, gs = lerp(0.55, 1, eBack(g, 1.2));
    ctx.save(); ctx.translate(x, y); ctx.scale(gs, gs); ctx.globalAlpha *= clamp(g * 2);
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 50 * s; ctx.shadowOffsetY = 18 * s;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 38 * s); ctx.fillStyle = o.fill || C.green; ctx.fill();
    ctx.shadowColor = 'transparent';
    if (o.gold) { ctx.lineWidth = 7 * s; ctx.strokeStyle = rgba(C.gold, clamp(o.gold)); ctx.stroke(); }
    else { ctx.lineWidth = 3 * s; ctx.strokeStyle = 'rgba(243,241,232,.22)'; ctx.stroke(); }
    const la = o.labelA ?? 1;
    text(ctx, o.label || 'YOUR PICK', -w / 2 + 42 * s, -h / 2 + 68 * s, { size: 40 * s, font: F.bold, color: C.cream, align: 'left', ls: 6 * s, alpha: la * 0.85 });
    padlock(ctx, w / 2 - 62 * s, -h / 2 + 56 * s, 50 * s, o.lockQ ?? 1, rgba(C.gold, la));
    ctx.restore();
  }

  // ---------- group table ----------
  const TB = { x: 1010, y0: 252, w: 820, h: 176, gap: 200 };
  const slotRect = (i, dx = 0) => ({ x: TB.x + dx, y: TB.y0 + i * TB.gap, w: TB.w, h: TB.h });
  const lerpRect = (a, b, q) => ({ x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q), w: lerp(a.w, b.w, q), h: lerp(a.h, b.h, q) });
  const crownOnRow = r => { const k = r.h / 176; return { x: r.x + 168 * k, y: r.y + 2 * k, w: 96 * k, rot: -0.2 }; };

  function rowSlot(id, t) {
    const a = ORDER_LIVE.indexOf(id), b = ORDER_FT.indexOf(id);
    const q = id === 'you' ? eExpo(P(t, T.reorder, T.reorder + 0.46)) : eIO(P(t, T.reorder + 0.05, T.reorder + 0.5));
    return lerp(a, b, q);
  }
  function rowPoints(p, t) {
    if (t < T.award) return p.live;
    const q = eOut(P(t, T.award, T.award + 0.34));
    return Math.round(lerp(p.live, p.fin, q));
  }
  function tableOffset(t) {
    if (t < T.ft) {
      const a = eExpo(P(t, T.table, T.table + 0.5)), b = eIn(P(t, T.tension, T.tension + 0.42));
      return (1 - a) * 1000 + b * 1100;
    }
    return (1 - eExpo(P(t, T.ft + 0.1, T.ft + 0.5))) * 1000;
  }
  function drawRow(ctx, r, p, pts, rank, o = {}) {
    const k = r.h / 176, you = p.id === 'you';
    ctx.save(); if (o.alpha != null) ctx.globalAlpha *= clamp(o.alpha);
    if (o.scale && o.scale !== 1) { ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(o.scale, o.scale); ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2)); }
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 28 * k);
    if (you) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40 * k; ctx.shadowOffsetY = 14 * k; ctx.fillStyle = C.paper; ctx.fill(); ctx.shadowColor = 'transparent'; }
    else { ctx.fillStyle = 'rgba(243,241,232,.085)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(243,241,232,.16)'; ctx.stroke(); }
    const ink = you ? C.ink : C.cream;
    text(ctx, String(rank), r.x + 54 * k, r.y + r.h / 2 + 72 * k * A.figure / 2, { size: 72 * k, font: F.disp, color: you ? C.goldPaper : C.gold });
    text(ctx, p.name, r.x + 110 * k, r.y + 104 * k, { size: 108 * k, font: F.disp, color: ink, align: 'left', ls: 1 * k });
    text(ctx, `PICKED ${p.pick[0]}–${p.pick[1]}`, r.x + 113 * k, r.y + 150 * k, { size: 44 * k, font: F.bold, color: you ? C.muted : 'rgba(243,241,232,.65)', align: 'left', ls: 3 * k });
    text(ctx, String(pts), r.x + r.w - 44 * k, r.y + r.h / 2 + 124 * k * A.figure / 2, { size: 124 * k, font: F.disp, color: ink, align: 'right' });
    ctx.restore();
  }
  const CHIP = 46; // row chip text size
  function rowChipX(r, label, size) {
    const k = r.h / 176, w = measure(label, size, F.bold, size * 0.12) + size * 1.4;
    return r.x + r.w - 186 * k - w / 2;
  }

  // ---------- left column: live score block ----------
  function liveState(t) {
    let x = 640, y = 600, s = 420;
    const a = eIO(P(t, T.table, T.table + 0.5)); x = lerp(x, 470, a); y = lerp(y, 372, a); s = lerp(s, 270, a);
    const b = eIO(P(t, T.tension, T.tension + 0.6)); x = lerp(x, 560, b); y = lerp(y, 560, b); s = lerp(s, 400, b);
    const m = eIn(P(t, T.merge, T.exact));
    const pk = pickState(t), n = numAt(pk.x, pk.y, pk.s);
    return { x: lerp(x, n.x, m), y: lerp(y, n.y, m), s: lerp(s, n.size, m), m };
  }
  function pickState(t) {
    let x = 1400, y = 560, s = 1.15;
    const a = eIO(P(t, T.table, T.table + 0.5)); x = lerp(x, 470, a); y = lerp(y, 800, a); s = lerp(s, 0.9, a);
    const b = eIO(P(t, T.tension, T.tension + 0.6)); x = lerp(x, 1360, b); y = lerp(y, 540, b); s = lerp(s, 1.2, b);
    const f = eExpo(P(t, T.ft, T.ft + 0.3)); x = lerp(x, 470, f); y = lerp(y, 560, f); s = lerp(s, 1.0, f);
    return { x, y, s };
  }
  const clockAt = t => { let c = CLOCK[0][1]; for (const [t0, v] of CLOCK) if (t >= t0) c = v; return c; };
  const lastTick = t => { let tk = -9; for (const [t0] of CLOCK) if (t >= t0) tk = t0; return tk; };

  // ---------- scene 1: the challenge ----------
  function sceneChallenge(ctx, t) {
    ctx.save(); camera(ctx, t, 1 + t * 0.012);
    paperBg(ctx, t, -t * 18);

    const slam = eExpo(P(t, 0, 0.26));
    const qL = eExpo(P(t, T.q, T.q + 0.3));
    const sw = eIO(P(t, T.sweep, T.live - 0.14));
    const out = eIn(P(t, T.sweep, T.sweep + 0.3));

    // numerals: centre → "2–1?" quote layout → pick card position
    const qSize = 500, qmW = measure('?', qSize, F.disp), gap = 26;
    const groupW = scoreMetrics(qSize).total + gap + qmW;
    let nx = lerp(960, 960 - (qmW + gap) / 2, qL), ny = lerp(520, 372, qL), ns = lerp(760 * lerp(1.9, 1, slam), qSize, qL);
    const tgt = numAt(1400, 560, 1.15);
    nx = lerp(nx, tgt.x, sw); ny = lerp(ny, tgt.y, sw); ns = lerp(ns, tgt.size, sw);
    const rot = lerp(lerp(0, -0.03, qL), 0, sw);

    // tag
    const tagA = P(t, T.tag, T.tag + 0.18) * (1 - P(t, T.q, T.q + 0.16));
    if (tagA > 0) pill(ctx, 960, 975 + (1 - eOut(P(t, T.tag, T.tag + 0.25))) * 40, `YOUR PREDICTION  ·  ${FIXTURE.home.toUpperCase()} v ${FIXTURE.away.toUpperCase()}`, { size: 50, bg: C.green, color: C.cream, alpha: tagA, ls: 6 });

    // pick card grows behind the numerals as they travel
    const grow = P(t, T.sweep + 0.22, T.lock - 0.02);
    const lockQ = eIn(P(t, T.lock - 0.1, T.lock));
    // the card wraps the travelling numerals
    if (grow > 0) drawPickCard(ctx, nx, ny - CARD.numDy * 1.15, 1.15, { grow, lockQ, labelA: P(t, T.sweep + 0.4, T.lock) });

    // opening quote mark
    const qa = qL * (1 - out);
    if (qa > 0) text(ctx, '‘', 960 - groupW / 2 - 60 - out * 1500, ny + qSize * 0.45, { size: 560, font: F.serif, color: C.goldPaper, alpha: qa });

    ctx.save(); ctx.translate(nx, ny); ctx.rotate(rot); ctx.translate(-nx, -ny);
    drawScore(ctx, nx, ny, ns, 2, 1, { color: mix(C.ink, C.cream, P(t, T.sweep + 0.25, T.lock)) });
    ctx.restore();

    // "?" slams in
    const qOut = eIn(P(t, T.sweep, T.sweep + 0.18));
    if (t >= T.q && qOut < 1) {
      // pops in, then spins up and away so it never crosses the numerals
      const qs = eBack(P(t, T.q, T.q + 0.2), 2.6) * (1 - qOut);
      const qx = 960 + groupW / 2 - qmW / 2 + qOut * 200;
      ctx.save(); ctx.translate(qx, 372 - qOut * 420); ctx.rotate(0.08 + rot + qOut * 2.5); ctx.scale(qs, qs);
      text(ctx, '?', 0, qSize * A.figure / 2, { size: qSize, font: F.disp, color: C.green });
      ctx.restore();
    }

    // "You're having a laugh."
    const l1 = 'You’re having a ', l2 = 'laugh.’', qsz = 156;
    const w1 = measure(l1, qsz, F.serif), w2 = measure(l2, qsz, F.serif), x0 = 960 - (w1 + w2) / 2 - out * 1700;
    const a1 = eOut(P(t, T.quote1, T.quote1 + 0.16)), a2 = eBack(P(t, T.laugh, T.laugh + 0.22), 2);
    if (a1 > 0 && out < 1) text(ctx, l1, x0, 800 + (1 - a1) * 30, { size: qsz, font: F.serif, color: C.ink, align: 'left', alpha: a1 * (1 - out) });
    if (t >= T.laugh && out < 1) {
      const d = t - T.laugh, wob = 0.09 * Math.sin(d * 34) * Math.exp(-d * 3.2);
      ctx.save(); ctx.translate(x0 + w1 + w2 / 2, 760); ctx.rotate(wob); ctx.scale(a2, a2);
      text(ctx, l2, -w2 / 2, 40, { size: qsz, font: F.serif, color: C.green, align: 'left', alpha: 1 - out });
      ctx.restore();
    }
    // attribution
    const ja = eOut(P(t, T.jack, T.jack + 0.2));
    if (ja > 0 && out < 1) text(ctx, '— JACK, WHO WENT 1–1', 960 - out * 1900, 935 + (1 - ja) * 26, { size: 52, font: F.bold, color: C.muted, ls: 6, alpha: ja * (1 - out) });

    ctx.restore();
  }

  // ---------- scenes 2–4: live match, tension, goal, full time ----------
  function sceneMatch(ctx, t, o = {}) {
    const tension = eIO(P(t, T.tension, T.goal)) * (1 - P(t, T.goal, T.goal + 0.05));
    const push = 1 + 0.15 * tension + 0.02 * P(t, T.live, T.tension);
    ctx.save(); camera(ctx, t, push, 960, 560);

    // background: stadium night, green flood for the goal
    nightBg(ctx, t, { dim: lerp(0.76, 0.86, tension), vig: lerp(0.55, 0.85, tension), zoom: 1.08 });
    const goalOn = t >= T.goal && t < T.ft + 0.4;
    if (goalOn) {
      const fa = t < T.flip ? 1 : lerp(1, 0.9, P(t, T.flip, T.flip + 0.3)) * (1 - P(t, T.ft, T.ft + 0.4));
      const g = ctx.createRadialGradient(960, 560, 100, 960, 560, 1300);
      g.addColorStop(0, rgba('#17904f', fa)); g.addColorStop(1, rgba(C.greenDeep, fa));
      ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, H + 600);
      // GOAL watermark after the front type explodes
      const wa = P(t, T.flip + 0.1, T.flip + 0.3) * (1 - P(t, T.ft - 0.2, T.ft + 0.2)) * 0.1;
      if (wa > 0) text(ctx, 'GOAL', 960 - (t - T.flip) * 60, 560 + 860 * A.figure / 2, { size: 860, font: F.disp, color: C.cream, alpha: wa, ls: 10 });
    }

    const objA = t >= T.goal && t < T.flip ? 0 : t >= T.flip ? P(t, T.flip, T.flip + 0.06) : 1;
    ctx.save(); ctx.globalAlpha = objA;

    // group table
    const off = tableOffset(t);
    if (off < 1000) {
      const ftMode = t >= T.ft;
      ctx.save();
      text(ctx, 'GROUP TABLE', TB.x + off + 4, 205, { size: 36, font: F.bold, color: 'rgba(243,241,232,.6)', align: 'left', ls: 6 });
      if (!ftMode) pill(ctx, TB.x + TB.w + off, 192, 'LIVE · PROJECTED', { size: 32, align: 'right', dashed: true, color: C.cream, stroke: 'rgba(243,241,232,.5)', dot: true, dotColor: '#43b873' });
      else pill(ctx, TB.x + TB.w + off, 192, 'FULL TIME · AWARDED', { size: 32, align: 'right', bg: C.gold, color: C.ink });
      const ids = ['jack', 'sam', 'you'];
      const rects = {}, pts = {};
      for (const id of ids) { rects[id] = slotRect(rowSlot(id, t), off); pts[id] = rowPoints(byId[id], t); }
      const drawOrder = ['jack', 'sam', 'you'];
      for (const id of drawOrder) {
        const r = rects[id], p = byId[id];
        const rank = Math.round(rowSlot(id, t)) + 1;
        const charge = id === 'you' ? Math.sin(Math.PI * P(t, T.reorder, T.reorder + 0.46)) : 0;
        if (charge > 0.02) { // speed streaks behind the charging row
          ctx.save(); ctx.globalAlpha *= charge * 0.5; ctx.fillStyle = C.paper;
          for (let i = 0; i < 5; i++) { const yy = r.y + 20 + i * 34; ctx.fillRect(r.x + 60 + i * 70, yy + r.h * 0.9, r.w - 200 - i * 50, 5); }
          ctx.restore();
        }
        drawRow(ctx, r, p, pts[id], rank, { scale: 1 + charge * 0.05 });
        // chips: projected (dashed) before full time, awarded (solid) after
        const k = r.h / 176;
        if (p.dLive > 0 && t < T.award + 0.4) {
          const d = P(t, T.award, T.award + 0.4), lab = `+${p.dLive} LIVE`;
          const cx = rowChipX(r, lab, CHIP * k);
          ctx.save(); ctx.translate(cx, r.y + r.h / 2 + d * d * 200); ctx.rotate(d * 0.5);
          pill(ctx, 0, 0, lab, { size: CHIP * k, dashed: true, color: C.cream, stroke: 'rgba(243,241,232,.7)', alpha: 1 - d });
          ctx.restore();
        }
        if (p.dFin > 0 && t >= T.award) {
          const lab = chipFor(p.dFin), pop = eBack(P(t, T.award, T.award + 0.22), 2.2);
          pill(ctx, rowChipX(r, lab, CHIP * k), r.y + r.h / 2, lab, { size: CHIP * k, bg: p.dFin === 3 ? C.gold : C.green, color: p.dFin === 3 ? C.ink : C.cream, scale: pop });
        }
      }
      // the crown
      const cj = crownOnRow(slotRect(rowSlot(LEADER_LIVE, T.crownLift), off));
      const cy = crownOnRow(slotRect(rowSlot('you', T.crownLand), off));
      if (t < T.crownLift) {
        const c = crownOnRow(rects[LEADER_LIVE]);
        const wob = t > T.award ? 0.12 * Math.sin((t - T.award) * 30) * Math.exp(-(t - T.award) * 4) : 0;
        crown(ctx, c.x, c.y, c.w, { rot: c.rot + wob, glow: 'rgba(201,162,79,.5)', glowBlur: 30 });
      } else if (t < T.crownLand) {
        const q = P(t, T.crownLift, T.crownLand), e = eIO(q);
        const x = lerp(cj.x, cy.x, e) - 120 * Math.sin(Math.PI * q), y = lerp(cj.y, cy.y, e) - 150 * Math.sin(Math.PI * q);
        crown(ctx, x, y, cj.w * (1 + 0.7 * Math.sin(Math.PI * q)), { rot: lerp(cj.rot, cy.rot + Math.PI * 2, e), glow: 'rgba(225,178,74,.8)', glowBlur: 50 });
      } else {
        const d = t - T.crownLand, sq = 0.28 * Math.exp(-d * 9) * Math.cos(d * 40);
        const c = crownOnRow(rects.you);
        crown(ctx, c.x, c.y + sq * 20, c.w, { rot: c.rot, sx: 1 + sq, sy: 1 - sq, glow: 'rgba(225,178,74,.7)', glowBlur: 40 });
        // landing burst
        if (d < 0.5) burst(ctx, c.x, c.y, d / 0.5, 22, 260, C.gold, 3);
      }
      ctx.restore();
    }

    // joke caption
    const ja = eOut(P(t, T.joke, T.joke + 0.25)) * (1 - P(t, T.tension, T.tension + 0.2));
    if (ja > 0) text(ctx, 'Jack’s already screenshotted it.', TB.x + 4 + tableOffset(t), 968 + (1 - ja) * 24, { size: 66, font: F.serif, color: C.cream, align: 'left', alpha: ja });

    // pick card + live score
    const pk = pickState(t), ls = liveState(t), n = numAt(pk.x, pk.y, pk.s);
    const exactQ = P(t, T.exact, T.exact + 0.08);
    const exactFade = 1 - P(t, T.exact + 0.5, T.exact + 1.4);
    drawPickCard(ctx, pk.x, pk.y, pk.s, { gold: exactQ, fill: exactQ > 0 ? mix(C.green, '#1b8a52', exactQ * exactFade) : C.green });
    const numGlow = exactQ > 0 ? `rgba(225,178,74,${0.9 * exactFade})` : null;
    drawScore(ctx, n.x, n.y, n.size, 2, 1, { color: exactQ > 0 ? mix(C.cream, '#f6d27a', exactQ * exactFade) : C.cream, glow: numGlow, glowBlur: 60 });
    if (t >= T.ft) {
      const fa = eOut(P(t, T.ft + 0.1, T.ft + 0.4));
      pill(ctx, pk.x, pk.y - CARD.h * pk.s / 2 - 60, 'FULL TIME  ' + FINAL_SCORE.join('–'), { size: 38, bg: C.cream, color: C.ink, alpha: fa });
    }

    if (t >= T.live && ls.m < 1) {
      const enter = eExpo(P(t, T.live, T.live + 0.24));
      const s = ls.s * lerp(1.5, 1, enter);
      const cap = s * A.figure, extrasA = (1 - P(ls.m, 0, 0.4)) * enter;
      const labelY = ls.y - cap / 2 - s * 0.16;
      text(ctx, `${FIXTURE.home.toUpperCase()}  v  ${FIXTURE.away.toUpperCase()}`, ls.x, labelY, { size: Math.max(42, s * 0.13), font: F.bold, color: 'rgba(243,241,232,.75)', ls: 6, alpha: extrasA });
      const tk = lastTick(t), tp = Math.exp(-(t - tk) * 8);
      pill(ctx, ls.x, labelY - Math.max(42, s * 0.13) - 52, `LIVE  ${clockAt(t)}`, { size: 40, bg: C.green, color: C.cream, dot: true, dotColor: '#7cf0a8', alpha: extrasA, scale: 1 + tp * 0.06 });
      const flipQ = P(t, T.flip, T.flip + 0.42);
      const hb = 1 + tension * 0.025 * Math.exp(-(t - tk) * 10);
      ctx.save(); ctx.translate(ls.x, ls.y); ctx.scale(hb, hb); ctx.translate(-ls.x, -ls.y);
      drawScore(ctx, ls.x, ls.y, s, t >= T.flip ? 2 : 1, 1, { color: C.cream, flip: t >= T.flip && flipQ < 1 ? { from: 1, to: 2, q: flipQ } : null });
      ctx.restore();
    }

    // tension: big ticking clock
    const ca = P(t, T.tension + 0.25, T.tension + 0.6) * (1 - P(t, T.goal, T.goal + 0.04));
    if (ca > 0) {
      const tk = lastTick(t), tp = Math.exp(-(t - tk) * 7);
      ctx.save(); ctx.translate(960, 900); ctx.scale(1 + tp * 0.08, 1 + tp * 0.08);
      text(ctx, clockAt(t), 0, 130 * A.figure / 2, { size: 130, font: F.disp, color: C.cream, alpha: ca, ls: 2 });
      ctx.restore();
    }

    // exact-score moment: ring burst + chip
    if (t >= T.exact) {
      const d = t - T.exact;
      if (d < 0.6) { const q = d / 0.6; ctx.save(); ctx.strokeStyle = rgba('#e1b24a', 1 - q); ctx.lineWidth = 40 * (1 - q) + 2; ctx.beginPath(); ctx.arc(n.x, n.y, 80 + eOut(q) * 900, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); burst(ctx, n.x, n.y, q, 30, 700, '#e1b24a', 7); }
      // "+3 EXACT SCORE" pops under the card, then flies into your row when points are awarded
      const pop = eBack(P(t, T.exact, T.exact + 0.24), 2.4);
      const fly = eIn(P(t, T.award - 0.26, T.award));
      if (fly < 1) {
        const home = { x: pk.x, y: pk.y + CARD.h * pk.s / 2 + 82 };
        const you = slotRect(rowSlot('you', T.award), tableOffset(T.award));
        const dest = { x: rowChipX(you, '+3 EXACT', CHIP), y: you.y + you.h / 2 };
        const x = lerp(home.x, dest.x, fly), y = lerp(home.y, dest.y, fly) - 160 * Math.sin(Math.PI * fly);
        pill(ctx, x, y, fly > 0 ? '+3 EXACT' : '+3  EXACT SCORE', { size: lerp(62, CHIP, fly), bg: C.gold, color: C.ink, scale: pop });
      }
    }
    ctx.restore(); // objA

    // GOAL front type
    if (t >= T.goal && t < T.flip + 0.2) {
      const fl = 1 - P(t, T.goal, T.goal + 0.07);
      if (fl > 0) { ctx.fillStyle = `rgba(255,253,240,${fl})`; ctx.fillRect(-300, -300, W + 600, H + 600); }
      const ex = eIn(P(t, T.flip, T.flip + 0.18));
      const letters = 'GOAL', size = 820;
      const total = measure(letters, size, F.disp, 8);
      let x = 960 - total / 2;
      for (let i = 0; i < 4; i++) {
        const lw = measure(letters[i], size, F.disp, 8);
        const e = eExpo(P(t, T.goal + i * 0.035, T.goal + i * 0.035 + 0.16));
        const sc = lerp(1.7, 1, e) * (1 + ex * 0.6);
        ctx.save(); ctx.translate(x + lw / 2, 560); ctx.scale(sc, sc); ctx.rotate((1 - e) * (i % 2 ? 0.2 : -0.2));
        text(ctx, letters[i], 0, size * A.figure / 2, { size, font: F.disp, color: C.cream, alpha: Math.min(e * 3, 1) * (1 - ex) });
        ctx.restore();
        x += lw;
      }
    }

    ctx.restore(); // camera
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

  // ---------- scene 5: how you called it ----------
  function sceneCall(ctx, t) {
    ctx.save(); camera(ctx, t, 1.0 + P(t, T.pick, T.ff) * 0.035, 960, 540);
    paperBg(ctx, t, -(t - T.pick) * 30);
    const enter = eExpo(P(t, T.pick, T.pick + 0.3));

    // time chip
    const isKO = t >= T.ko;
    if (!isKO) pill(ctx, 120, 110, '◀◀  BEFORE KICK-OFF', { size: 40, align: 'left', bg: C.ink, color: C.cream, alpha: enter });
    else pill(ctx, 120, 110, 'KICK-OFF', { size: 40, align: 'left', bg: C.green, color: C.cream, dot: true, dotColor: '#7cf0a8', scale: 1 + 0.1 * Math.exp(-(t - T.ko) * 8) });

    // the three verbs
    const words = [['PICK IT.', T.pick + 0.08], ['CALL IT.', T.save], ['OWN IT.', T.ko]];
    words.forEach(([w, t0], i) => {
      if (t < t0) return;
      const e = eExpo(P(t, t0, t0 + 0.2)), next = words[i + 1] ? P(t, words[i + 1][1], words[i + 1][1] + 0.15) : 0;
      ctx.save(); ctx.translate(120, 430 + i * 215); ctx.scale(lerp(1.35, 1, e), lerp(1.35, 1, e));
      text(ctx, w, 0, 0, { size: 230, font: F.disp, color: i === 2 ? C.green : C.ink, align: 'left', alpha: Math.min(1, e * 2) * lerp(1, 0.22, next) });
      ctx.restore();
    });

    // matchday card (simplified from the app's Matchday screen)
    const cx = lerp(2300, 1000, enter), cyy = 130, cw = 800, chh = 820;
    ctx.save(); ctx.translate(cx + cw / 2, cyy + chh / 2); ctx.rotate((1 - enter) * 0.08); ctx.translate(-(cx + cw / 2), -(cyy + chh / 2));
    ctx.shadowColor = 'rgba(40,30,10,.16)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 26;
    ctx.beginPath(); ctx.roundRect(cx, cyy, cw, chh, 46); ctx.fillStyle = C.card; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2; ctx.strokeStyle = C.line; ctx.stroke();
    const L = x => cx + x; // card-local x
    text(ctx, 'MATCHDAY', L(64), cyy + 92, { size: 32, font: F.bold, color: C.goldPaper, align: 'left', ls: 9 });
    text(ctx, FIXTURE.home, L(64), cyy + 210, { size: 76, font: F.serifUp, color: C.ink, align: 'left' });
    text(ctx, FIXTURE.away, L(cw - 64), cyy + 210, { size: 76, font: F.serifUp, color: C.ink, align: 'right' });
    text(ctx, FIXTURE.kickoff, L(cw / 2), cyy + 186, { size: 44, font: F.bold, color: C.muted });
    const lockLabel = isKO ? 'Locked' : 'Locks in 2h';
    text(ctx, lockLabel, L(cw / 2), cyy + 232, { size: 32, font: F.body, color: isKO ? C.ink : '#9a978f' });

    // steppers: app default draft is 1–1
    let home = 1; if (t >= T.tap1) home = 2; if (t >= T.tap2) home = 3; if (t >= T.tap3) home = 2;
    const away = 1;
    const lockedQ = eOut(P(t, T.ko, T.ko + 0.25));
    const sy = cyy + 300, sh = 170, sw2 = 320;
    [[L(56), home, [T.tap1, T.tap2, T.tap3]], [L(cw - 56 - sw2), away, []]].forEach(([x, v, taps], side) => {
      ctx.beginPath(); ctx.roundRect(x, sy, sw2, sh, sh / 2);
      ctx.fillStyle = mix('#f7f4ec', '#ebe6db', lockedQ); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = rgba(C.ink, 0.1); ctx.stroke();
      const last = taps.filter(tt => t >= tt).pop(), pop = last != null ? 1 + 0.3 * Math.exp(-(t - last) * 12) : 1;
      ctx.save(); ctx.translate(x + sw2 / 2, sy + sh / 2); ctx.scale(pop, pop);
      text(ctx, String(v), 0, 140 * A.figure / 2, { size: 140, font: F.disp, color: C.ink });
      ctx.restore();
      const ba = 1 - lockedQ;
      text(ctx, '−', x + 58, sy + sh / 2 + 22, { size: 76, font: F.body, color: C.green, alpha: ba });
      text(ctx, '+', x + sw2 - 58, sy + sh / 2 + 24, { size: 76, font: F.body, color: C.green, alpha: ba });
      if (isKO) padlock(ctx, x + sw2 - 46, sy + 40, 34 * lockedQ, 1, C.goldPaper);
      // tap ripples
      taps.forEach((tt, i) => {
        const d = t - tt; if (d < 0 || d > 0.4) return;
        const bx = i === 2 ? x + 58 : x + sw2 - 58, q = d / 0.4;
        ctx.beginPath(); ctx.arc(bx, sy + sh / 2, 30 + q * 90, 0, Math.PI * 2); ctx.fillStyle = rgba(C.green, 0.3 * (1 - q)); ctx.fill();
      });
    });
    ctx.fillStyle = rgba(C.ink, 0.12); ctx.fillRect(L(cw / 2 - 1), sy + 45, 2, sh - 90);

    // "Lock in my picks" → "✓ Picks saved"
    const by = cyy + 540, bh = 120, press = t >= T.save ? 1 - 0.05 * Math.exp(-(t - T.save) * 14) * Math.sin(Math.min(1, (t - T.save) * 10) * Math.PI) : 1;
    ctx.save(); ctx.globalAlpha *= lerp(1, 0.35, lockedQ); ctx.translate(L(cw / 2), by + bh / 2); ctx.scale(press, press);
    ctx.beginPath(); ctx.roundRect(-(cw - 112) / 2, -bh / 2, cw - 112, bh, bh / 2); ctx.fillStyle = C.goldPaper; ctx.fill();
    text(ctx, 'Lock in my picks', 0, 17, { size: 48, font: F.body, color: '#ffffff' });
    ctx.restore();
    if (t >= T.save) { const d = t - T.save; if (d < 0.45) { const q = d / 0.45; ctx.beginPath(); ctx.arc(L(cw / 2), by + bh / 2, 40 + q * 380, 0, Math.PI * 2); ctx.fillStyle = rgba(C.goldPaper, 0.25 * (1 - q)); ctx.fill(); } }
    const sa = eOut(P(t, T.save + 0.08, T.save + 0.3));
    if (sa > 0) text(ctx, '✓ Picks saved', L(cw / 2), cyy + 750 + (1 - sa) * 20, { size: 46, font: F.body, color: C.green, alpha: sa });

    // kick-off: padlock stamp
    if (isKO) {
      const e = eBack(P(t, T.ko, T.ko + 0.22), 2.2);
      ctx.save(); ctx.translate(L(cw - 70), cyy + 70); ctx.rotate((1 - e) * 0.6 - 0.12); ctx.scale(e * 1.0 + (1 - e) * 2.4, e * 1.0 + (1 - e) * 2.4);
      ctx.beginPath(); ctx.arc(0, 0, 78, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill();
      padlock(ctx, 0, -4, 74, 1, C.gold);
      ctx.restore();
    }
    ctx.restore(); // card
    ctx.restore(); // camera
  }

  // ---------- scene 6: the punchline ----------
  const BIG = { x: 250, y: 300, w: 1420, h: 260 };
  function scenePunch(ctx, t) {
    const toLogo = eIn(P(t, T.wipe, T.logo));
    ctx.save(); camera(ctx, t, 1 + P(t, T.back, T.wipe) * 0.03 + P(t, T.logo, T.end) * 0.05, 960, 540);
    nightBg(ctx, t, { zoom: 1.12 });

    const q = eExpo(P(t, T.back, T.back + 0.5));
    const tEnd = 12.9; // table state just before the rewind
    // other rows leave
    for (const id of ['sam', 'jack']) {
      const r0 = slotRect(rowSlot(id, tEnd)), a = 1 - P(t, T.back, T.back + 0.28);
      if (a > 0) { const r = { ...r0, y: r0.y + q * 500 }; drawRow(ctx, r, byId[id], byId[id].fin, ORDER_FT.indexOf(id) + 1, { alpha: a }); }
    }
    // left cards leave
    const la = 1 - P(t, T.back, T.back + 0.22);
    if (la > 0) { ctx.save(); ctx.globalAlpha = la; ctx.translate(-q * 600, 0); const pk = pickState(tEnd), n = numAt(pk.x, pk.y, pk.s); drawPickCard(ctx, pk.x, pk.y, pk.s, { gold: 1 }); drawScore(ctx, n.x, n.y, n.size, 2, 1, { color: C.cream }); ctx.restore(); }

    // your row, big
    const ego = [T.ego1, T.ego2, T.ego3].reduce((s, t0, i) => s + [0.45, 0.55, 0.7][i] * eBack(P(t, t0, t0 + 0.26), 2.6), 0);
    const r = lerpRect(slotRect(0), BIG, q);
    const rowA = 1 - toLogo;
    if (rowA > 0) {
      ctx.save(); ctx.globalAlpha = rowA;
      drawRow(ctx, r, byId.you, byId.you.fin, 1);
      ctx.restore();
    }

    // punchline text
    const u1 = eOut(P(t, T.unbear1, T.unbear1 + 0.2)), u2 = eExpo(P(t, T.unbear2, T.unbear2 + 0.22));
    const ta = 1 - toLogo;
    if (u1 > 0) text(ctx, 'You’ll be', 960, 718 + (1 - u1) * 30, { size: 120, font: F.serif, color: C.cream, alpha: u1 * ta });
    if (t >= T.unbear2) {
      ctx.save(); ctx.translate(960, 888); const s = lerp(1.6, 1, u2); ctx.scale(s, s);
      text(ctx, 'UNBEARABLE.', 0, 300 * A.figure / 2, { size: 300, font: F.disp, color: C.gold, alpha: Math.min(1, u2 * 3) * ta, ls: 2, shadow: 'rgba(0,0,0,.4)', blur: 30 });
      ctx.restore();
    }

    // the crown: on your head, then growing with your ego, then becoming the logo
    const c = crownOnRow(r);
    const cw0 = c.w * (1 + ego);
    // keep the crown sitting on your head: anchor its base
    const baseY = r.y + 22 * (r.h / 176); // crown sits on the row's top edge, above the name
    let cx = c.x + (cw0 - c.w) * 0.25, cy = baseY - cw0 * 0.33, cwid = cw0, rot = c.rot * (1 - ego * 0.15);
    const egoWob = [T.ego1, T.ego2, T.ego3].reduce((s, t0) => s + (t >= t0 ? 0.08 * Math.sin((t - t0) * 30) * Math.exp(-(t - t0) * 6) : 0), 0);
    rot += egoWob;
    const LOGO = { x: 960, y: 395, w: 300 };
    cx = lerp(cx, LOGO.x, toLogo); cy = lerp(cy, LOGO.y, toLogo); cwid = lerp(cwid, LOGO.w, toLogo); rot = lerp(rot, 0, toLogo);

    // paper wipe expanding from the crown
    if (t >= T.wipe) {
      const wr = eIn(P(t, T.wipe, T.logo)) * 2300;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, wr, 0, Math.PI * 2); ctx.clip();
      paperBg(ctx, t, -(t - T.logo) * 20);
      ctx.restore();
    }
    if (t >= T.logo) {
      // logo lockup
      const word = 'KICKPOT', size = 270, ls = size * 0.075;
      const total = measure(word, size, F.disp, ls); let x = 960 - total / 2 + ls / 2;
      for (let i = 0; i < word.length; i++) {
        const lw = measure(word[i], size, F.disp, ls), e = eExpo(P(t, T.logo + i * 0.03, T.logo + i * 0.03 + 0.2));
        text(ctx, word[i], x + lw / 2 - ls / 2, 735 + (1 - e) * 60, { size, font: F.disp, color: C.ink, alpha: Math.min(1, e * 2) });
        x += lw;
      }
      const la2 = eOut(P(t, T.line, T.line + 0.35));
      if (la2 > 0) text(ctx, 'Your mates won’t hear the end of it.', 960, 905 + (1 - la2) * 26, { size: 92, font: F.serif, color: C.ink, alpha: la2 });
    }
    const land = t >= T.logo ? t - T.logo : -1;
    const sq = land >= 0 ? 0.3 * Math.exp(-land * 8) * Math.cos(land * 34) : 0;
    const hop = t >= T.sting ? Math.sin(Math.PI * P(t, T.sting, T.sting + 0.32)) * 34 : 0;
    const colr = t >= T.logo ? C.goldPaper : C.gold;
    crown(ctx, cx, cy - hop + sq * 24, cwid, { rot, sx: 1 + sq, sy: 1 - sq, color: colr, glow: t < T.logo ? 'rgba(225,178,74,.75)' : null, glowBlur: 60 });
    if (land >= 0 && land < 0.5) burst(ctx, cx, cy, land / 0.5, 26, 420, C.goldPaper, 6);
    if (t >= T.sting && t < T.sting + 0.5) burst(ctx, cx, cy - 20, (t - T.sting) / 0.5, 14, 260, C.goldPaper, 4);
    ctx.restore();
  }

  // ---------- frame assembly ----------
  const rewSrc = t => lerp(T.rew, T.live + 0.06, eIO(P(t, T.rew, T.pick)));
  const ffSrc = t => lerp(T.live + 0.06, 12.9, eIO(P(t, T.ff, T.back)));

  function renderAt(ctx, t) {
    ctx.save();
    if (t < T.live) sceneChallenge(ctx, t);
    else if (t < T.rew) sceneMatch(ctx, t);
    else if (t < T.pick) sceneMatch(ctx, rewSrc(t));
    else if (t < T.ff) sceneCall(ctx, t);
    else if (t < T.back) sceneMatch(ctx, ffSrc(t));
    else scenePunch(ctx, t);
    ctx.restore();
  }

  let sub = null, tmp = null;
  function tape(ctx, t, dir) {
    // VHS-style rewind / fast-forward treatment applied after motion blur
    if (!tmp) { tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; }
    const tx = tmp.getContext('2d');
    tx.filter = 'saturate(.35) contrast(1.15) brightness(1.06)'; tx.drawImage(ctx.canvas, 0, 0); tx.filter = 'none';
    ctx.drawImage(tmp, 0, 0);
    const r = rng(Math.floor(t * FPS) * 31 + 7);
    for (let i = 0; i < 7; i++) { const y = r() * H, h = 20 + r() * 90, dx = (r() - 0.5) * 120; ctx.drawImage(tmp, 0, y, W, h, dx, y, W, h); }
    ctx.fillStyle = 'rgba(0,0,0,.16)'; for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
    const by = (t * 2400) % (H + 200) - 100; ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(0, by, W, 60);
    // big transport glyph
    ctx.save(); ctx.translate(960, 540); ctx.fillStyle = C.cream; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 30;
    const s = 150, flipX = dir < 0 ? -1 : 1; ctx.scale(flipX, 1);
    for (const ox of [-s * 0.5, s * 0.5]) { ctx.beginPath(); ctx.moveTo(ox - s * 0.5, -s * 0.6); ctx.lineTo(ox + s * 0.5, 0); ctx.lineTo(ox - s * 0.5, s * 0.6); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    text(ctx, dir < 0 ? 'REWIND' : 'FAST FORWARD', 960, 700, { size: 54, font: F.bold, color: C.cream, ls: 12, shadow: 'rgba(0,0,0,.5)' });
  }

  function post(ctx, t) {
    if (t >= T.rew && t < T.pick) tape(ctx, t, -1);
    if (t >= T.ff && t < T.back) tape(ctx, t, 1);
    // grain
    ctx.save(); ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay';
    const f = Math.floor(t * FPS), ox = (f * 137) % 512, oy = (f * 251) % 512;
    for (let x = -ox; x < W; x += 512) for (let y = -oy; y < H; y += 512) ctx.drawImage(A.grain, x, y);
    ctx.restore();
  }

  // samples > 1 renders a motion-blurred frame (180° shutter) by averaging sub-frames.
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
