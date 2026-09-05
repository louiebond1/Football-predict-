const screen = document.querySelector('#screen');
const FINAL_CODES = new Set(['FT','AET','PEN','PST','CANC','ABD','AWD','WO']);
let fixtures = [];
let fixturesAt = 0;
let busy = false;

function normalise(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function kickoffLabel(value) {
  try {
    return new Intl.DateTimeFormat('en-GB', { weekday:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
  } catch { return ''; }
}

async function loadFixtures(force = false) {
  if (!force && fixtures.length && Date.now() - fixturesAt < 15000) return fixtures;
  const data = await fetch(`/api/football/fixtures?_=${Date.now()}`, { cache:'no-store' }).then(r => r.json()).catch(() => null);
  fixtures = data?.fixtures || [];
  fixturesAt = Date.now();
  return fixtures;
}

function fixtureForRow(row, list) {
  const directId = Number(row.dataset.fixture || 0);
  if (directId) return list.find(f => Number(f.id) === directId) || null;
  const teams = [...row.querySelectorAll('.team')];
  const home = normalise(teams[0]?.textContent || '');
  const away = normalise(teams[1]?.textContent || '');
  if (!home || !away) return null;
  return list.find(f => normalise(f.home?.name) === home && normalise(f.away?.name) === away) || null;
}

function isActuallyLive(f, now = Date.now()) {
  const kickoff = new Date(f?.kickoff).getTime();
  if (!Number.isFinite(kickoff) || now < kickoff) return false;
  const code = String(f?.status?.short || '').toUpperCase();
  return !FINAL_CODES.has(code);
}

function statusText(fixture, now) {
  const code = String(fixture?.status?.short || '').toUpperCase();
  if (now < new Date(fixture.kickoff).getTime() || code === 'NS') return kickoffLabel(fixture.kickoff);
  if (code === 'FT') return 'Full-time';
  if (code === 'HT') return 'Half-time';
  if (code === 'AET') return 'After extra time';
  if (code === 'PEN') return 'Penalties';
  if (code === 'PST') return 'Postponed';
  if (code === 'CANC') return 'Cancelled';
  if (fixture.status?.elapsed) return `${fixture.status.elapsed}'`;
  return 'LIVE';
}

function updateScoreNode(node, value, live) {
  if (!node || value == null) return;
  const next = String(value);
  if (node.textContent !== next) {
    node.textContent = next;
    node.classList.add('kp-score-changed');
    setTimeout(() => node.classList.remove('kp-score-changed'), 700);
  }
  node.classList.toggle('accent', live);
}

function updateFixtureRow(row, fixture, now) {
  const live = isActuallyLive(fixture, now);
  const scoreNodes = [...row.querySelectorAll('.scorepick .scorebox')];
  if (scoreNodes.length >= 2) {
    updateScoreNode(scoreNodes[0], fixture.goals?.home, live);
    updateScoreNode(scoreNodes[scoreNodes.length - 1], fixture.goals?.away, live);
  }

  const rules = row.querySelector('.rules');
  if (!rules) return;
  let status = rules.querySelector('[data-kp-live-status]');
  if (!status) {
    const oldAccent = [...rules.querySelectorAll('.accent')].find(el => /^(LIVE|\d+'|Half-time)$/i.test(el.textContent?.trim() || ''));
    if (oldAccent) {
      status = oldAccent;
      status.dataset.kpLiveStatus = '1';
    } else {
      status = document.createElement('span');
      status.dataset.kpLiveStatus = '1';
      rules.prepend(status, document.createTextNode(' '));
    }
  }
  const nextStatus = statusText(fixture, now);
  if (status.textContent !== nextStatus) status.textContent = nextStatus;
  status.classList.toggle('accent', live);
}

function repairFutureRow(row, fixture, now) {
  const kickoff = new Date(fixture.kickoff).getTime();
  if (!Number.isFinite(kickoff) || now >= kickoff) return;
  row.querySelectorAll('.scorebox.accent').forEach(box => box.classList.remove('accent'));
}

function repairLiveSummary(actualLive) {
  const hero = screen?.querySelector('.kp3-page-hero, .hero');
  const pills = hero ? [...hero.querySelectorAll('.pill')] : [];
  const livePill = pills.find(p => /\bLive\b/i.test(p.textContent || ''));
  const strong = livePill?.querySelector('strong');
  const nextCount = String(actualLive);
  if (strong && strong.textContent !== nextCount) strong.textContent = nextCount;

  screen?.querySelectorAll('.kp3-table-card .badge, .card .card-head .badge').forEach(badge => {
    if (!/^LIVE$/i.test(badge.textContent?.trim() || '')) return;
    badge.hidden = actualLive === 0;
  });

  if (actualLive === 0) screen?.querySelector('.kp3-live-impact')?.remove();
}

async function repair() {
  if (busy || !screen?.classList.contains('kp3-live')) return;
  busy = true;
  try {
    const list = await loadFixtures();
    if (!screen?.classList.contains('kp3-live') || !list.length) return;
    const now = Date.now();
    const actualLive = list.filter(f => isActuallyLive(f, now)).length;
    const rows = [...screen.querySelectorAll('.kp3-live-fixture, .kp3-live-card .fixture')];
    rows.forEach(row => {
      const fixture = fixtureForRow(row, list);
      if (!fixture) return;
      updateFixtureRow(row, fixture, now);
      repairFutureRow(row, fixture, now);
    });
    repairLiveSummary(actualLive);
  } finally {
    busy = false;
  }
}

const observer = new MutationObserver(() => queueMicrotask(repair));
if (screen) observer.observe(screen, { childList:true, subtree:true });
setInterval(repair, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { fixturesAt = 0; repair(); } });
window.addEventListener('focus', () => { fixturesAt = 0; repair(); });
setTimeout(repair, 250);
