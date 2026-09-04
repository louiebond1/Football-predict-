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

async function loadFixtures() {
  if (fixtures.length && Date.now() - fixturesAt < 15000) return fixtures;
  const data = await fetch('/api/football/fixtures', { cache:'no-store' }).then(r => r.json()).catch(() => null);
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

function repairFutureRow(row, fixture, now) {
  const kickoff = new Date(fixture.kickoff).getTime();
  if (!Number.isFinite(kickoff) || now >= kickoff) return;

  row.querySelectorAll('.scorebox.accent').forEach(box => box.classList.remove('accent'));
  const rules = row.querySelector('.rules');
  if (!rules) return;
  const liveLabel = [...rules.querySelectorAll('.accent')].find(el => /^LIVE$/i.test(el.textContent?.trim() || ''));
  if (liveLabel) {
    liveLabel.textContent = kickoffLabel(fixture.kickoff);
    liveLabel.classList.remove('accent');
  } else if (/^LIVE\b/i.test(rules.textContent?.trim() || '')) {
    const first = rules.firstChild;
    if (first?.nodeType === Node.TEXT_NODE) first.nodeValue = first.nodeValue.replace(/^LIVE/i, kickoffLabel(fixture.kickoff));
  }
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
    const shouldHide = actualLive === 0;
    if (badge.hidden !== shouldHide) badge.hidden = shouldHide;
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
      if (fixture) repairFutureRow(row, fixture, now);
    });
    repairLiveSummary(actualLive);
  } finally {
    busy = false;
  }
}

const observer = new MutationObserver(() => queueMicrotask(repair));
if (screen) observer.observe(screen, { childList:true, subtree:true });
setInterval(repair, 1000);
setTimeout(repair, 250);
