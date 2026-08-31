const screen = document.querySelector('#screen');

const subState = { live: 'matches', history: 'overview', group: 'overview' };
let lastMainTab = null;

function hasText(el, text) {
  return (el?.textContent || '').toLowerCase().includes(text.toLowerCase());
}

function directCard(title) {
  return [...screen.querySelectorAll(':scope > .card')].find(card => hasText(card.querySelector('.card-title'), title));
}

function clampScore(value) {
  return Math.max(0, Math.min(20, Number(value) || 0));
}

function makeBackHeader(title, subtitle, onBack) {
  const header = document.createElement('section');
  header.className = 'drill-header-pro';
  header.innerHTML = `
    <button class="drill-back-pro" type="button" aria-label="Back">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div>`;
  header.querySelector('.drill-back-pro').addEventListener('click', onBack);
  return header;
}

function makeNavRow(label, meta, onClick, tone = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `nav-row-pro ${tone}`.trim();
  button.innerHTML = `<span><strong>${label}</strong>${meta ? `<small>${meta}</small>` : ''}</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`;
  button.addEventListener('click', onClick);
  return button;
}

function showView(map, key) {
  Object.entries(map).forEach(([name, node]) => {
    if (node) node.hidden = name !== key;
  });
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
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

  minus.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); change(-1); });
  plus.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); change(1); });

  wrap.append(minus, input, plus);
  return wrap;
}

function upgradeFixtureScoreControls(fixture) {
  const scorepick = fixture.querySelector('.scorepick');
  const homeInput = scorepick?.querySelector('[data-score="home"]');
  const awayInput = scorepick?.querySelector('[data-score="away"]');
  if (!scorepick || !homeInput || !awayInput || scorepick.dataset.finalStepper === '1') return;

  scorepick.dataset.finalStepper = '1';
  const teams = fixture.querySelectorAll('.team');
  const homeName = teams[0]?.textContent?.trim() || 'Home team';
  const awayName = teams[1]?.textContent?.trim() || 'Away team';

  scorepick.querySelectorAll('.step,.dash').forEach(el => el.remove());

  const home = buildScoreStepper(homeInput, 'home', homeName);
  const divider = document.createElement('span');
  divider.className = 'score-versus';
  divider.textContent = '–';
  divider.setAttribute('aria-hidden', 'true');
  const away = buildScoreStepper(awayInput, 'away', awayName);
  scorepick.replaceChildren(home, divider, away);
}

function enhanceGW() {
  screen.className = 'screen screen-gw-final';
  const hero = screen.querySelector(':scope > .hero');
  const picks = directCard('Your Picks');
  if (!picks || picks.dataset.finalUi === '1') return;
  picks.dataset.finalUi = '1';

  hero?.classList.add('gw-hero-final');
  picks.classList.add('fixtures-list-final');

  const fixtures = [...picks.querySelectorAll(':scope > .fixture')];
  fixtures.forEach(fixture => {
    fixture.classList.add('fixture-line-final');
    upgradeFixtureScoreControls(fixture);
  });

  let lastDay = '';
  fixtures.forEach(fixture => {
    const txt = fixture.querySelector('.rules')?.textContent?.trim() || '';
    const day = txt.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/)?.[1] || '';
    if (day && day !== lastDay) {
      const label = document.createElement('div');
      label.className = 'fixture-date-final';
      label.textContent = ({ Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday' })[day] || day;
      picks.insertBefore(label, fixture);
      lastDay = day;
    }
  });

  const status = picks.querySelector('#gwStatus');
  if (status) {
    status.className = 'gw-privacy-final';
    status.textContent = 'Picks stay private until each fixture kicks off.';
  }
}

function enhanceLive() {
  screen.className = 'screen screen-live-final';
  if (screen.querySelector(':scope > .live-root-final')) return;

  const hero = screen.querySelector(':scope > .hero');
  const switcher = screen.querySelector(':scope > .select-wrap');
  const table = directCard('Live Table');
  const fixtures = directCard("This Gameweek's Fixtures");
  const need = directCard('What You Need');
  const swing = [...screen.querySelectorAll(':scope > .card')].find(c => c.classList.contains('swing'));
  if (!hero || !table || !fixtures) return;

  fixtures.querySelectorAll('.fixture').forEach(fixture => {
    fixture.classList.add('live-match-final');
    fixture.querySelectorAll('.scorebox').forEach(score => score.classList.add('broadcast-score-final'));
    fixture.querySelector('.scorepick')?.classList.add('broadcast-scoreline-final');
  });
  table.classList.add('live-table-final');
  need?.classList.add('live-insight-final');
  swing?.classList.add('live-swing-final');

  const root = document.createElement('div');
  root.className = 'live-root-final';
  const matchesView = document.createElement('section');
  matchesView.className = 'live-view-final live-matches-view-final';
  const tableView = document.createElement('section');
  tableView.className = 'live-view-final live-table-view-final';

  screen.insertBefore(root, hero);
  root.append(matchesView, tableView);
  matchesView.append(hero);
  if (switcher) matchesView.append(switcher);
  if (need) matchesView.append(need);

  const tableCTA = makeNavRow('Live table', 'See the group standings', () => {
    subState.live = 'table';
    showView({ matches: matchesView, table: tableView }, 'table');
  }, 'nav-row-feature');
  matchesView.append(tableCTA, fixtures);
  if (swing) fixtures.after(swing);

  tableView.append(makeBackHeader('Live table', 'Gameweek standings', () => {
    subState.live = 'matches';
    showView({ matches: matchesView, table: tableView }, 'matches');
  }), table);

  showView({ matches: matchesView, table: tableView }, subState.live);
}

function enhanceHistory() {
  screen.className = 'screen screen-history-final';
  if (screen.querySelector(':scope > .history-root-final')) return;

  const first = screen.querySelector(':scope > .card');
  const switcher = screen.querySelector(':scope > .select-wrap');
  const settle = [...screen.querySelectorAll(':scope > .card')].find(c => hasText(c.querySelector('.card-title'), 'Ready to Settle'));
  const past = directCard('Past Gameweeks');
  const stats = directCard('Your Season Stats');
  const awards = directCard('Awards');
  if (!first || !past || !stats) return;

  const root = document.createElement('div');
  root.className = 'history-root-final';
  const overview = document.createElement('section');
  overview.className = 'history-view-final history-overview-final';
  const gameweeks = document.createElement('section');
  gameweeks.className = 'history-view-final';
  const awardsView = document.createElement('section');
  awardsView.className = 'history-view-final';

  screen.insertBefore(root, first);
  root.append(overview, gameweeks, awardsView);

  const masthead = document.createElement('section');
  masthead.className = 'history-masthead-final';
  masthead.innerHTML = '<div class="section-kicker-final">SEASON</div><h1>History</h1><p>Your record across the season.</p>';
  overview.append(masthead);
  if (switcher) overview.append(switcher);

  if (hasText(first, 'No Gameweeks settled yet')) {
    first.className = 'season-zero-final';
    first.innerHTML = `<div class="season-zero-mark-final"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 8M17 5.5h2.5A2.5 2.5 0 0 1 17 8"/><path d="M12 12v4M8.5 20h7"/></svg></div><strong>Season ready to start</strong><p>Your first settled Gameweek will appear here.</p>`;
  } else {
    first.classList.add('history-champion-final');
  }
  stats.classList.add('history-stats-final');
  overview.append(first, stats);
  if (settle) overview.append(settle);

  const menu = document.createElement('div');
  menu.className = 'history-menu-final';
  menu.append(
    makeNavRow('Gameweeks', 'Results and weekly winners', () => {
      subState.history = 'gameweeks';
      showView({ overview, gameweeks, awards: awardsView }, 'gameweeks');
    }),
    makeNavRow('Awards', 'Season milestones and bragging rights', () => {
      subState.history = 'awards';
      showView({ overview, gameweeks, awards: awardsView }, 'awards');
    })
  );
  overview.append(menu);

  past.classList.add('history-list-final');
  gameweeks.append(makeBackHeader('Gameweeks', 'Past results', () => {
    subState.history = 'overview';
    showView({ overview, gameweeks, awards: awardsView }, 'overview');
  }), past);

  if (awards) awards.classList.add('history-awards-final');
  awardsView.append(makeBackHeader('Awards', 'Season honours', () => {
    subState.history = 'overview';
    showView({ overview, gameweeks, awards: awardsView }, 'overview');
  }));
  if (awards) awardsView.append(awards);

  showView({ overview, gameweeks, awards: awardsView }, subState.history);
}

function cloneMemberList(payments) {
  const list = document.createElement('div');
  list.className = 'member-list-final';
  const rows = [...(payments?.querySelectorAll('.payment-row') || [])];
  rows.forEach(row => {
    const item = document.createElement('div');
    item.className = 'member-row-final';
    const left = row.querySelector('.row-left')?.cloneNode(true);
    if (left) item.append(left);
    list.append(item);
  });
  if (!rows.length) list.innerHTML = '<div class="empty">No members yet.</div>';
  return list;
}

function buildAvatarStrip(payments) {
  const strip = document.createElement('div');
  strip.className = 'member-strip-final';
  const rows = [...(payments?.querySelectorAll('.payment-row') || [])];
  const avatars = document.createElement('div');
  avatars.className = 'member-avatars-final';
  rows.slice(0, 5).forEach(row => {
    const avatar = row.querySelector('.avatar')?.cloneNode(true);
    if (avatar) avatars.append(avatar);
  });
  const copy = document.createElement('div');
  copy.className = 'member-strip-copy-final';
  copy.innerHTML = `<strong>${rows.length} member${rows.length === 1 ? '' : 's'}</strong><span>${rows.length ? 'In this private pot' : 'Invite friends to start the rivalry'}</span>`;
  strip.append(avatars, copy);
  return strip;
}

function enhancePaymentDetails(pay, mePaid) {
  if (!pay) return;
  pay.classList.add('payment-details-final');
  const claim = pay.querySelector('#claimPaid');
  const waiting = pay.querySelector('.status.warning');
  if (mePaid) {
    claim?.remove();
    waiting?.remove();
    if (!pay.querySelector('.payment-confirmed-final')) {
      const confirmed = document.createElement('div');
      confirmed.className = 'payment-confirmed-final';
      confirmed.innerHTML = '<span>✓</span><div><strong>Payment confirmed</strong><small>You are unlocked for this Gameweek.</small></div>';
      pay.append(confirmed);
    }
  }

  const bankbox = pay.querySelector('.bankbox');
  if (bankbox && !pay.querySelector('.copy-bank-final')) {
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'secondary copy-bank-final';
    copy.textContent = 'Copy payment details';
    copy.addEventListener('click', async () => {
      const lines = [...bankbox.querySelectorAll('.bankline')].map(line => {
        const label = line.querySelector('span')?.textContent?.trim() || '';
        const value = line.querySelector('b')?.textContent?.trim() || '';
        return `${label}: ${value}`;
      }).join('\n');
      try {
        await navigator.clipboard.writeText(lines);
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = 'Copy payment details'; }, 1500);
      } catch {
        copy.textContent = 'Press and hold to copy';
      }
    });
    bankbox.after(copy);
  }
}

function enhanceGroup() {
  screen.className = 'screen screen-group-final';
  if (screen.querySelector(':scope > .group-root-final')) return;

  const head = screen.querySelector(':scope > .group-head');
  const join = [...screen.querySelectorAll(':scope > .pill')].find(el => hasText(el, 'Join code'));
  const switcher = screen.querySelector(':scope > .select-wrap');
  const pot = directCard('Pot');
  const payments = directCard('Member Payments');
  const week = directCard('This Week');
  const rivalry = directCard('Group Rivalry');
  const pay = directCard('Pay the Treasurer');
  const admin = directCard('Treasurer · Bank Details');
  if (!head || !pot) return;

  const myRow = [...(payments?.querySelectorAll('.payment-row') || [])].find(row => hasText(row, '(you)'));
  const mePaid = Boolean(myRow?.querySelector('.paid'));
  enhancePaymentDetails(pay, mePaid);

  const amount = pot.querySelector('.pot-amount')?.textContent?.trim() || '£0';
  const paymentBadge = pot.querySelector('.badge')?.textContent?.trim() || '0/0 paid';
  const memberCount = payments?.querySelectorAll('.payment-row').length || 0;

  const root = document.createElement('div');
  root.className = 'group-root-final';
  const overview = document.createElement('section');
  overview.className = 'group-view-final group-overview-final';
  const membersView = document.createElement('section');
  membersView.className = 'group-view-final';
  const paymentsView = document.createElement('section');
  paymentsView.className = 'group-view-final';
  const paymentDetailsView = document.createElement('section');
  paymentDetailsView.className = 'group-view-final';
  const rulesView = document.createElement('section');
  rulesView.className = 'group-view-final';
  const rivalryView = document.createElement('section');
  rivalryView.className = 'group-view-final';
  const settingsView = document.createElement('section');
  settingsView.className = 'group-view-final';

  screen.insertBefore(root, head);
  root.append(overview, membersView, paymentsView, paymentDetailsView, rulesView, rivalryView, settingsView);

  const hero = document.createElement('section');
  hero.className = 'group-hero-final';
  hero.append(head);
  const summary = document.createElement('div');
  summary.className = 'group-summary-final';
  summary.innerHTML = `<div><small>Current pot</small><strong>${amount}</strong></div><div><small>Payments</small><strong>${paymentBadge}</strong></div>`;
  hero.append(summary);
  overview.append(hero, buildAvatarStrip(payments));

  const rivalryFeature = document.createElement('button');
  rivalryFeature.type = 'button';
  rivalryFeature.className = 'rivalry-feature-final';
  rivalryFeature.innerHTML = `<span class="rivalry-feature-kicker-final">RIVALRY</span><strong>Season bragging rights</strong><small>Wins, exact scores and the wooden spoon</small><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`;
  rivalryFeature.addEventListener('click', () => {
    subState.group = 'rivalry';
    showView({ overview, members: membersView, payments: paymentsView, paymentDetails: paymentDetailsView, rules: rulesView, rivalry: rivalryView, settings: settingsView }, 'rivalry');
  });
  overview.append(rivalryFeature);

  const navigation = document.createElement('div');
  navigation.className = 'group-navigation-final';
  const go = key => {
    subState.group = key;
    showView({ overview, members: membersView, payments: paymentsView, paymentDetails: paymentDetailsView, rules: rulesView, rivalry: rivalryView, settings: settingsView }, key);
  };
  navigation.append(
    makeNavRow('Members', `${memberCount} in the group`, () => go('members')),
    makeNavRow('Payments', paymentBadge, () => go('payments')),
    makeNavRow('Rules', 'Scoring and lock times', () => go('rules')),
    makeNavRow('Group settings', 'Invite code and admin', () => go('settings'))
  );
  overview.append(navigation);

  membersView.append(makeBackHeader('Members', `${memberCount} in this group`, () => go('overview')), cloneMemberList(payments));

  payments?.classList.add('payments-list-final');
  paymentsView.append(makeBackHeader('Payments', paymentBadge, () => go('overview')));
  if (payments) paymentsView.append(payments);
  if (pay) paymentsView.append(makeNavRow('Payment details', mePaid ? 'Confirmed for you' : 'Bank details and reference', () => go('paymentDetails'), 'nav-row-feature'));

  paymentDetailsView.append(makeBackHeader('Payment details', 'Pay the treasurer directly', () => go('payments')));
  if (pay) paymentDetailsView.append(pay);

  week?.classList.add('rules-page-final');
  rulesView.append(makeBackHeader('Rules', 'How this week works', () => go('overview')));
  if (week) rulesView.append(week);

  rivalry?.classList.add('rivalry-page-final');
  rivalryView.append(makeBackHeader('Rivalry', 'Season bragging rights', () => go('overview')));
  if (rivalry) rivalryView.append(rivalry);

  settingsView.append(makeBackHeader('Group settings', 'Invite and manage the group', () => go('overview')));
  const settingsList = document.createElement('div');
  settingsList.className = 'settings-list-final';
  if (join) {
    const code = join.querySelector('strong')?.textContent?.trim() || '';
    const invite = document.createElement('button');
    invite.type = 'button';
    invite.className = 'setting-row-final';
    invite.innerHTML = `<span><small>Invite code</small><strong>${code}</strong></span><em>Copy</em>`;
    invite.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); invite.querySelector('em').textContent = 'Copied'; setTimeout(() => { invite.querySelector('em').textContent = 'Copy'; }, 1500); } catch {}
    });
    settingsList.append(invite);
    join.remove();
  }
  if (switcher) settingsList.append(switcher);
  settingsView.append(settingsList);
  if (admin) {
    admin.classList.add('admin-page-final');
    settingsView.append(admin);
  }

  pot.remove();
  showView({ overview, members: membersView, payments: paymentsView, paymentDetails: paymentDetailsView, rules: rulesView, rivalry: rivalryView, settings: settingsView }, subState.group);
}

let busy = false;
function enhance() {
  if (busy || !screen || !screen.children.length) return;
  busy = true;
  try {
    const tab = document.querySelector('.nav-item.active')?.dataset?.tab;
    if (tab && tab !== lastMainTab) {
      lastMainTab = tab;
      if (tab === 'live') subState.live = 'matches';
      if (tab === 'history') subState.history = 'overview';
      if (tab === 'group') subState.group = 'overview';
    }
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
