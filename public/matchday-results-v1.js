const screen = document.querySelector('#screen');
const TERMINAL = new Set(['FT','AET','PEN']);
let fixtures = [];
let fixturesAt = 0;
let busy = false;

function activeMatchday() {
  return document.querySelector('.nav-item[data-tab="gw"]')?.classList.contains('active');
}

async function loadFixtures(force = false) {
  if (!force && fixtures.length && Date.now() - fixturesAt < 30000) return fixtures;
  const data = await fetch('/api/football/fixtures', { cache:'no-store' }).then(r => r.json()).catch(() => null);
  fixtures = data?.fixtures || fixtures;
  fixturesAt = Date.now();
  return fixtures;
}

function statusText(fixture) {
  if (TERMINAL.has(fixture.status?.short)) return 'Full-time';
  if (fixture.status?.short === 'HT') return 'Half-time';
  if (fixture.status?.short && fixture.status.short !== 'NS') {
    return fixture.status?.elapsed ? `${fixture.status.elapsed}'` : 'Live';
  }
  return '';
}

function enhanceRow(row, fixture) {
  if (fixture.goals?.home == null || fixture.goals?.away == null) return;
  if (Date.now() < new Date(fixture.kickoff).getTime()) return;

  const scorepick = row.querySelector('.scorepick');
  const rules = row.querySelector('.rules');
  if (!scorepick || !rules) return;

  if (!row.dataset.kpUserPick) {
    const values = [...scorepick.querySelectorAll('.scorebox')].map(node => node.value ?? node.textContent?.trim() ?? '–');
    row.dataset.kpUserPick = `${values[0] ?? '–'}–${values[1] ?? '–'}`;
  }

  const actual = `${fixture.goals.home}–${fixture.goals.away}`;
  if (row.dataset.kpActualScore !== actual) {
    row.dataset.kpActualScore = actual;
    scorepick.classList.add('kp-actual-score');
    scorepick.innerHTML = `<strong>${fixture.goals.home}</strong><span>–</span><strong>${fixture.goals.away}</strong>`;
  }

  let resultMeta = rules.querySelector('.kp-result-meta');
  if (!resultMeta) {
    resultMeta = document.createElement('span');
    resultMeta.className = 'kp-result-meta';
    rules.prepend(resultMeta);
  }
  const state = statusText(fixture);
  resultMeta.textContent = `${state}${state ? ' · ' : ''}Your pick ${row.dataset.kpUserPick} · `;
  row.classList.toggle('kp-is-live', !TERMINAL.has(fixture.status?.short));
  row.classList.toggle('kp-is-finished', TERMINAL.has(fixture.status?.short));
}

async function sync(force = false) {
  if (busy || !activeMatchday()) return;
  const rows = [...screen.querySelectorAll('.kp3-gw .fixture[data-fixture]')];
  if (!rows.length) return;
  busy = true;
  try {
    const list = await loadFixtures(force);
    const byId = new Map(list.map(f => [Number(f.id), f]));
    rows.forEach(row => {
      const fixture = byId.get(Number(row.dataset.fixture));
      if (fixture) enhanceRow(row, fixture);
    });
  } finally {
    busy = false;
  }
}

const observer = new MutationObserver(() => queueMicrotask(() => sync(false)));
if (screen) observer.observe(screen, { childList:true, subtree:true });
document.addEventListener('click', e => {
  if (e.target.closest('.nav-item[data-tab="gw"]')) setTimeout(() => sync(true), 80);
}, true);
window.addEventListener('focus', () => sync(true));
window.addEventListener('pageshow', () => sync(true));
setInterval(() => sync(true), 30000);
setTimeout(() => sync(true), 250);
