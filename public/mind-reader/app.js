import { PLAYERS, readMind } from '/mind-reader/cards.js';

// ?speed=0 makes every pause instant (used by the automated UI tests).
const SPEED = (() => {
  const raw = new URLSearchParams(location.search).get('speed');
  const n = raw === null ? 1 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1;
})();

// Suspense timeline, in milliseconds.
const TIMING = {
  hush: 1500,
  hold: 1800,
  reading: 2200,
  gotit: 1000,
  gap: 380,
  actionsDelay: 1700,
};

// Faint pitch markings behind each player's name. All share one viewBox
// (visible window 400 × 200) anchored to the right of the hero, so the name sits over
// the quietest part of the drawing.
const MOTIFS = {
  // Goalkeeper: the goal, six-yard box and penalty area
  goal: `
    <line x1="100" y1="40" x2="460" y2="40" />
    <rect x="245" y="26" width="60" height="14" />
    <rect x="225" y="40" width="100" height="40" />
    <rect x="165" y="40" width="220" height="110" />
    <circle class="spot" cx="275" cy="112" r="2.5" />
    <path d="M239.5 150 A 52 52 0 0 0 310.5 150" />`,
  // Right back: the right touchline and an overlapping run
  'right-flank': `
    <line x1="380" y1="-20" x2="380" y2="280" />
    <line x1="110" y1="60" x2="380" y2="60" />
    <path d="M40 60 A 70 70 0 0 0 180 60" />
    <circle class="spot" cx="110" cy="60" r="2.5" />
    <path class="run" d="M356 236 C 354 190, 354 140, 358 86" />`,
  // Centre back: the defending penalty area, side on
  box: `
    <line x1="392" y1="-20" x2="392" y2="280" />
    <rect x="282" y="40" width="110" height="180" />
    <rect x="352" y="95" width="40" height="70" />
    <circle class="spot" cx="320" cy="130" r="2.5" />
    <path d="M282 94.5 A 52 52 0 0 0 282 165.5" />`,
  // Midfield: the halfway line and centre circle
  centre: `
    <line x1="290" y1="-20" x2="290" y2="280" />
    <circle cx="290" cy="130" r="82" />
    <circle class="spot" cx="290" cy="130" r="3" />`,
  // Attacking midfield: the edge of the box and a through ball
  arc: `
    <rect x="200" y="-40" width="260" height="160" />
    <rect x="270" y="-40" width="120" height="70" />
    <circle class="spot" cx="330" cy="60" r="2.5" />
    <path d="M294 120 A 70 70 0 0 0 366 120" />
    <path class="run" d="M372 232 C 330 200, 318 160, 334 96" />`,
  // Left back: the left touchline and a run up the wing
  'left-flank': `
    <line x1="60" y1="30" x2="460" y2="30" />
    <path d="M386 30 A 14 14 0 0 0 400 44" />
    <line x1="170" y1="30" x2="170" y2="280" />
    <path d="M170 150 A 80 80 0 0 1 250 230" />
    <path class="run" d="M196 56 C 250 52, 310 52, 372 56" />`,
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const els = {
  app: $('#app'),
  dots: $('#dots'),
  back: $('[data-action="back"]'),
  heroStage: $('#hero-stage'),
  motif: $('#hero-motif'),
  photo: $('#hero-photo'),
  first: $('#hero-first'),
  last: $('#hero-last'),
  meta: $('#hero-meta'),
  sheet: $('#sheet'),
  grid: $('#grid'),
  answerButtons: $$('[data-action="answer"]'),
  resultNumber: $('#result-number'),
  revealActions: $('#reveal-actions'),
  lines: Object.fromEntries($$('#stage [data-line]').map(el => [el.dataset.line, el])),
};

const state = {
  index: 0,
  answers: [],
  busy: false,
  run: 0, // bumps on every restart so a stale reveal sequence stops itself
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms * SPEED));

/* ---------- Screens ---------- */

function showScreen(name) {
  els.app.dataset.screen = name;
  const screen = document.querySelector(`.screen[data-screen="${name}"]`);
  screen.classList.remove('is-entering');
  void screen.offsetWidth; // restart the fade-in
  screen.classList.add('is-entering');
  if (name === 'card') fitName();
}

/* ---------- Player cards ---------- */

function buildDots() {
  els.dots.innerHTML = PLAYERS.map(() => '<li></li>').join('');
}

function renderCard(index) {
  const player = PLAYERS[index];

  els.first.textContent = player.firstName;
  els.last.textContent = player.lastName;
  els.meta.textContent = `${player.role} · ${player.nation}`;
  els.motif.innerHTML = MOTIFS[player.motif] || '';

  if (player.photo) {
    els.photo.hidden = false;
    els.photo.src = player.photo;
    els.photo.onerror = () => { els.photo.hidden = true; };
  } else {
    els.photo.hidden = true;
    els.photo.removeAttribute('src');
  }

  els.grid.innerHTML = player.numbers.map(n => `<li>${n}</li>`).join('');
  els.grid.setAttribute('aria-label', `Numbers on ${player.firstName} ${player.lastName}'s card`);

  Array.from(els.dots.children).forEach((dot, i) => {
    dot.className = i < index ? 'done' : i === index ? 'current' : '';
  });
  els.dots.setAttribute('aria-label', `Player ${index + 1} of ${PLAYERS.length}`);
  els.back.hidden = index === 0;

  els.answerButtons.forEach(btn => btn.classList.remove('is-chosen'));
  fitName();
}

// Shrink long surnames (Alderweireld, Assou-Ekotto) to fit on one line.
function fitName() {
  const el = els.last;
  const max = window.innerHeight <= 700 ? 52 : 60;
  el.style.fontSize = `${max}px`;
  const available = el.parentElement.clientWidth;
  if (!available) return;
  const needed = el.scrollWidth;
  if (needed > available) {
    el.style.fontSize = `${Math.floor(max * (available / needed) * 0.98)}px`;
  }
}

async function swapCard(nextIndex, direction) {
  const parts = [els.heroStage, els.sheet];
  const animate = !reduceMotion.matches && SPEED > 0;
  const shift = 28 * direction;

  if (animate) {
    await Promise.all(parts.map((el, i) => el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-shift}px)` }],
      { duration: 220, delay: i * 30, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    ).finished));
  }

  state.index = nextIndex;
  renderCard(nextIndex);
  els.sheet.scrollTop = 0;

  if (animate) {
    await Promise.all(parts.map((el, i) => el.animate(
      [{ opacity: 0, transform: `translateX(${shift}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 420, delay: i * 50, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    ).finished));
    parts.forEach(el => el.getAnimations().forEach(a => a.cancel()));
  }
}

async function answer(yes, button) {
  if (state.busy || els.app.dataset.screen !== 'card') return;
  state.busy = true;
  button?.classList.add('is-chosen');
  if (navigator.vibrate) navigator.vibrate(8);

  state.answers[state.index] = yes;

  if (state.index < PLAYERS.length - 1) {
    await swapCard(state.index + 1, 1);
    state.busy = false;
  } else {
    await wait(160);
    state.busy = false;
    reveal();
  }
}

async function goBack() {
  if (state.busy || state.index === 0) return;
  state.busy = true;
  state.answers.length = state.index - 1;
  await swapCard(state.index - 1, -1);
  state.busy = false;
}

function start() {
  state.run += 1;
  state.index = 0;
  state.answers = [];
  state.busy = false;
  renderCard(0);
  showScreen('card');
}

/* ---------- Suspense + reveal ---------- */

function setLine(name) {
  Object.entries(els.lines).forEach(([key, el]) => el.classList.toggle('is-on', key === name));
}

async function reveal() {
  const run = state.run;
  const total = readMind(state.answers);
  const stillHere = () => run === state.run;

  setLine(null);
  els.revealActions.classList.remove('is-on');
  els.resultNumber.textContent = total > 0 ? String(total) : '';
  document.documentElement.style.setProperty('--reading-ms', `${Math.max(1, TIMING.reading * SPEED - 200)}ms`);
  showScreen('reveal');

  const steps = [['hush', TIMING.hush], ['hold', TIMING.hold], ['reading', TIMING.reading], ['gotit', TIMING.gotit]];
  await wait(300);
  for (const [line, ms] of steps) {
    if (!stillHere()) return;
    setLine(line);
    await wait(ms);
    if (!stillHere()) return;
    setLine(null);
    await wait(TIMING.gap);
  }
  if (!stillHere()) return;

  if (total > 0) {
    setLine('result');
    if (navigator.vibrate) navigator.vibrate([12, 60, 24]);
  } else {
    setLine('miss');
  }
  els.app.dataset.result = total > 0 ? String(total) : 'miss';

  await wait(TIMING.actionsDelay);
  if (!stillHere()) return;
  els.revealActions.classList.add('is-on');
}

function restart() {
  state.run += 1;
  setLine(null);
  els.revealActions.classList.remove('is-on');
  delete els.app.dataset.result;
  showScreen('intro');
}

/* ---------- Wiring ---------- */

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  switch (target.dataset.action) {
    case 'start': return start();
    case 'answer': return answer(target.dataset.answer === 'yes', target);
    case 'back': return goBack();
    case 'restart': return restart();
  }
});

document.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const screen = els.app.dataset.screen;
  const key = event.key.toLowerCase();
  if (screen === 'card') {
    if (key === 'y') answer(true, els.answerButtons[1]);
    else if (key === 'n') answer(false, els.answerButtons[0]);
    else if (key === 'backspace' || key === 'arrowleft') goBack();
  } else if (screen === 'intro' && key === 'enter' && !event.target.closest('button')) {
    start();
  }
});

window.addEventListener('resize', () => { if (els.app.dataset.screen === 'card') fitName(); });
document.fonts?.ready.then(fitName);

buildDots();
renderCard(0);
