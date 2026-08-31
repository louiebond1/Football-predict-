const screen = document.querySelector('#screen');

function hasText(el, text) {
  return (el?.textContent || '').toLowerCase().includes(text.toLowerCase());
}

function directCard(title) {
  return [...screen.querySelectorAll(':scope > .card')].find(card => hasText(card.querySelector('.card-title'), title));
}

function makeTabs(items, active, onChange) {
  const nav = document.createElement('div');
  nav.className = 'kp-subnav';
  nav.innerHTML = items.map(item => `<button type="button" data-view="${item.id}" class="${item.id === active ? 'active' : ''}">${item.label}</button>`).join('');
  nav.addEventListener('click', e => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    onChange(btn.dataset.view);
  });
  return nav;
}

function showOnly(map, key) {
  Object.entries(map).forEach(([name, nodes]) => {
    (Array.isArray(nodes) ? nodes : [nodes]).forEach(node => {
      if (node) node.hidden = name !== key;
    });
  });
}

function clampScore(value) {
  return Math.max(0, Math.min(20, Number(value) || 0));
}

function buildScoreStepper(input, side, teamName) {
  const wrap = document.createElement('div');
  wrap.className = `team-score-stepper team-score-${side}`;

  input.readOnly = true;
  input.setAttribute('inputmode', 'none');
  input.setAttribute('aria-label', `${teamName} predicted goals`);

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'score-step-btn score-minus';
  minus.textContent = '−';
  minus.setAttribute('aria-label', `Decrease ${teamName} score`);

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'score-step-btn score-plus';
  plus.textContent = '+';
  plus.setAttribute('aria-label', `Increase ${teamName} score`);

  const change = delta => {
    const next = clampScore(Number(input.value) + delta);
    if (String(next) === String(input.value)) return;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  minus.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    change(-1);
  });
  plus.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    change(1);
  });

  wrap.append(minus, input, plus);
  return wrap;
}

function upgradeFixtureScoreControls(fixture) {
  const scorepick = fixture.querySelector('.scorepick');
  const homeInput = scorepick?.querySelector('[data-score="home"]');
  const awayInput = scorepick?.querySelector('[data-score="away"]');
  if (!scorepick || !homeInput || !awayInput || scorepick.dataset.stepperV2 === '1') return;

  scorepick.dataset.stepperV2 = '1';
  const teams = fixture.querySelectorAll('.team');
  const homeName = teams[0]?.textContent?.trim() || 'Home team';
  const awayName = teams[1]?.textContent?.trim() || 'Away team';

  scorepick.querySelectorAll('.step').forEach(btn => btn.remove());
  scorepick.querySelectorAll('.dash').forEach(el => el.remove());

  const home = buildScoreStepper(homeInput, 'home', homeName);
  const divider = document.createElement('span');
  divider.className = 'score-versus';
  divider.textContent = '–';
  divider.setAttribute('aria-hidden', 'true');
  const away = buildScoreStepper(awayInput, 'away', awayName);

  scorepick.replaceChildren(home, divider, away);
}

function enhanceGW() {
  screen.className = 'screen screen-gw-pro';
  const hero = screen.querySelector(':scope > .hero');
  const picks = directCard('Your Picks');
  if (!picks || picks.dataset.pro === '1') return;
  picks.dataset.pro = '1';
  hero?.classList.add('gw-hero-pro');
  picks.classList.add('fixtures-list-pro');

  const fixtures = [...picks.querySelectorAll(':scope > .fixture')];
  fixtures.forEach(f => {
    f.classList.add('fixture-line-pro');
    upgradeFixtureScoreControls(f);
  });

  let lastDay = '';
  fixtures.forEach(fixture => {
    const txt = fixture.querySelector('.rules')?.textContent?.trim() || '';
    const day = txt.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/)?.[1] || '';
    if (day && day !== lastDay) {
      const label = document.createElement('div');
      label.className = 'fixture-date-pro';
      label.textContent = day === 'Sat' ? 'Saturday' : day === 'Sun' ? 'Sunday' : day;
      picks.insertBefore(label, fixture);
      lastDay = day;
    }
  });

  const status = picks.querySelector('#gwStatus');
  if (status) {
    status.classList.add('gw-privacy-note');
    status.textContent = "Picks stay private until each fixture kicks off.";
  }
}

function enhanceLive() {
  screen.className = 'screen screen-live-pro';
  const hero = screen.querySelector(':scope > .hero');
  const table = directCard('Live Table');
  const fixtures = directCard("This Gameweek's Fixtures");
  const need = directCard('What You Need');
  const swing = [...screen.querySelectorAll(':scope > .card')].find(c => c.classList.contains('swing'));
  if (!hero || !table || !fixtures || hero.dataset.pro === '1') return;
  hero.dataset.pro = '1';
  hero.classList.add('live-hero-pro');
  table.classList.add('live-panel-pro');
  fixtures.classList.add('live-panel-pro');
  need?.classList.add('live-panel-pro');
  swing?.classList.add('live-swing-pro');
  fixtures.querySelectorAll('.fixture').forEach(f => f.classList.add('fixture-line-pro'));

  const tabs = makeTabs([
    { id: 'matches', label: 'Matches' },
    { id: 'table', label: 'Table' },
    ...(need ? [{ id: 'you', label: 'You' }] : [])
  ], 'matches', key => showOnly({ matches: [fixtures, swing], table, you: need }, key));
  hero.after(tabs);
  showOnly({ matches: [fixtures, swing], table, you: need }, 'matches');
}

function enhanceHistory() {
  screen.className = 'screen screen-history-pro';
  const first = screen.querySelector(':scope > .card');
  const past = directCard('Past Gameweeks');
  const stats = directCard('Your Season Stats');
  const awards = directCard('Awards');
  if (!first || !past || !stats || first.dataset.pro === '1') return;
  first.dataset.pro = '1';

  const header = document.createElement('section');
  header.className = 'section-heading-pro';
  header.innerHTML = '<div class="section-kicker-pro">SEASON</div><h1>History</h1><p>Your record, results and awards.</p>';
  screen.insertBefore(header, first);

  first.classList.add('history-hero-pro');
  past.classList.add('history-panel-pro');
  stats.classList.add('history-panel-pro');
  awards?.classList.add('history-panel-pro');

  const tabs = makeTabs([
    { id: 'overview', label: 'Overview' },
    { id: 'gameweeks', label: 'Gameweeks' },
    { id: 'awards', label: 'Awards' }
  ], 'overview', key => showOnly({ overview: [first, stats], gameweeks: past, awards }, key));
  header.after(tabs);
  showOnly({ overview: [first, stats], gameweeks: past, awards }, 'overview');
}

function enhanceGroup() {
  screen.className = 'screen screen-group-pro';
  const head = screen.querySelector(':scope > .group-head');
  const join = [...screen.querySelectorAll(':scope > .pill')].find(el => hasText(el, 'Join code'));
  const switcher = screen.querySelector(':scope > .select-wrap');
  const pot = directCard('Pot');
  const payments = directCard('Member Payments');
  const week = directCard('This Week');
  const rivalry = directCard('Group Rivalry');
  const pay = directCard('Pay the Treasurer');
  const admin = directCard('Treasurer · Bank Details');
  if (!head || !pot || head.dataset.pro === '1') return;
  head.dataset.pro = '1';

  const dashboard = document.createElement('section');
  dashboard.className = 'group-hero-pro';
  screen.insertBefore(dashboard, head);
  dashboard.append(head, pot);

  const badge = pot.querySelector('.badge')?.textContent?.trim() || '';
  const amount = pot.querySelector('.pot-amount')?.textContent?.trim() || '';
  const summary = document.createElement('div');
  summary.className = 'group-summary-pro';
  summary.innerHTML = `<span><small>Current pot</small><strong>${amount}</strong></span><span><small>Payments</small><strong>${badge}</strong></span>`;
  dashboard.append(summary);

  pot.querySelector('.pot-hero')?.remove();
  pot.querySelector('.badge')?.remove();
  pot.classList.add('group-pot-hidden-pro');

  const settings = document.createElement('section');
  settings.className = 'group-settings-pro';
  if (join) {
    const invite = document.createElement('div');
    invite.className = 'setting-line-pro';
    invite.innerHTML = `<span><small>Invite code</small><strong>${join.querySelector('strong')?.textContent || ''}</strong></span>`;
    settings.append(invite);
    join.remove();
  }
  if (switcher) settings.append(switcher);
  if (pay) settings.append(pay);
  if (admin) settings.append(admin);

  payments?.classList.add('group-panel-pro');
  week?.classList.add('group-panel-pro');
  rivalry?.classList.add('group-panel-pro', 'rivalry-pro');

  const tabs = makeTabs([
    { id: 'home', label: 'Overview' },
    { id: 'members', label: 'Members' },
    { id: 'rivalry', label: 'Rivalry' },
    { id: 'settings', label: 'Settings' }
  ], 'home', key => showOnly({ home: week, members: payments, rivalry, settings }, key));
  dashboard.after(tabs);
  tabs.after(settings);
  if (rivalry) settings.after(rivalry);
  if (payments) rivalry?.after(payments);
  if (week) payments?.after(week);
  showOnly({ home: week, members: payments, rivalry, settings }, 'home');
}

let busy = false;
function enhance() {
  if (busy || !screen || !screen.children.length) return;
  busy = true;
  try {
    const tab = document.querySelector('.nav-item.active')?.dataset?.tab;
    if (tab === 'gw') enhanceGW();
    if (tab === 'live') enhanceLive();
    if (tab === 'history') enhanceHistory();
    if (tab === 'group') enhanceGroup();
  } finally {
    busy = false;
  }
}

const observer = new MutationObserver(() => queueMicrotask(enhance));
observer.observe(screen, { childList: true });
window.addEventListener('load', enhance);
queueMicrotask(enhance);
