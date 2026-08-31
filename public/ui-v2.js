const screen = document.querySelector('#screen');

function textIncludes(el, text) {
  return (el?.textContent || '').toLowerCase().includes(text.toLowerCase());
}

function cardByTitle(title) {
  return [...screen.querySelectorAll(':scope > .card')].find(card => textIncludes(card.querySelector('.card-title'), title));
}

function smoothTarget(button, target) {
  if (!button || !target) return;
  button.addEventListener('click', () => target.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function enhanceGW() {
  screen.classList.add('screen-gw-v2');
  const hero = screen.querySelector(':scope > .hero');
  hero?.classList.add('matchday-hero-v2');

  const picks = cardByTitle('Your Picks');
  if (!picks) return;
  picks.classList.add('picks-shell-v2');

  const fixtures = [...picks.querySelectorAll(':scope > .fixture')];
  let lastDay = '';
  fixtures.forEach((fixture) => {
    fixture.classList.add('fixture-v2');
    const rules = fixture.querySelector('.rules')?.textContent?.trim() || '';
    const day = rules.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/)?.[1] || '';
    if (day && day !== lastDay) {
      const divider = document.createElement('div');
      divider.className = 'fixture-day-v2';
      divider.textContent = day === 'Sat' || day === 'Sun' ? `${day} fixtures` : day;
      picks.insertBefore(divider, fixture);
      lastDay = day;
    }
  });
}

function enhanceLive() {
  screen.classList.add('screen-live-v2');
  screen.querySelector(':scope > .hero')?.classList.add('live-hero-v2');
  const liveTable = cardByTitle('Live Table');
  const fixtures = cardByTitle("This Gameweek's Fixtures");
  const need = cardByTitle('What You Need');
  liveTable?.classList.add('live-table-v2');
  fixtures?.classList.add('live-fixtures-v2');
  need?.classList.add('what-you-need-v2');
  fixtures?.querySelectorAll('.fixture').forEach(f => f.classList.add('fixture-v2'));
}

function enhanceHistory() {
  screen.classList.add('screen-history-v2');
  const first = screen.querySelector(':scope > .card');
  if (first && textIncludes(first, 'No Gameweeks settled yet')) first.classList.add('history-empty-hero-v2');
  cardByTitle('Past Gameweeks')?.classList.add('history-past-v2');
  cardByTitle('Your Season Stats')?.classList.add('history-stats-v2');
  cardByTitle('Awards')?.classList.add('history-awards-v2');
}

function enhanceGroup() {
  screen.classList.add('screen-group-v2');
  const head = screen.querySelector(':scope > .group-head');
  const joinPill = [...screen.querySelectorAll(':scope > .pill')].find(el => textIncludes(el, 'Join code'));
  const switcher = screen.querySelector(':scope > .select-wrap');
  const pot = cardByTitle('Pot');
  const payments = cardByTitle('Member Payments');
  const week = cardByTitle('This Week');
  const rivalry = cardByTitle('Group Rivalry');
  const pay = cardByTitle('Pay the Treasurer');
  const admin = cardByTitle('Treasurer · Bank Details');

  if (!head || !pot) return;

  head.classList.add('group-head-v2');
  pot.classList.add('group-pot-v2');
  payments?.classList.add('group-payments-v2');
  week?.classList.add('group-week-v2');
  rivalry?.classList.add('group-rivalry-v2');

  const hero = document.createElement('section');
  hero.className = 'group-dashboard-v2';
  screen.insertBefore(hero, head);
  hero.append(head, pot);

  const badgeText = pot.querySelector('.badge')?.textContent?.trim() || '0/0 paid';
  const match = badgeText.match(/(\d+)\/(\d+)/);
  const paid = Number(match?.[1] || 0);
  const total = Math.max(1, Number(match?.[2] || 1));
  const pct = Math.round((paid / total) * 100);

  const progress = document.createElement('div');
  progress.className = 'group-progress-v2';
  progress.innerHTML = `<div class="group-progress-copy"><span>Weekly pot ready</span><strong>${paid}/${total} paid</strong></div><div class="group-progress-track"><i style="width:${pct}%"></i></div>`;
  hero.append(progress);

  const quick = document.createElement('div');
  quick.className = 'group-quick-v2';
  quick.innerHTML = `
    <button type="button" data-go="payments"><span>Members</span><small>payments</small></button>
    <button type="button" data-go="week"><span>This week</span><small>rules</small></button>
    <button type="button" data-go="rivalry"><span>Rivalry</span><small>stats</small></button>`;
  hero.after(quick);
  smoothTarget(quick.querySelector('[data-go="payments"]'), payments);
  smoothTarget(quick.querySelector('[data-go="week"]'), week);
  smoothTarget(quick.querySelector('[data-go="rivalry"]'), rivalry);

  if (payments && week) {
    const core = document.createElement('section');
    core.className = 'group-core-v2';
    quick.after(core);
    core.append(payments, week);
  }

  if (rivalry) {
    rivalry.classList.add('group-feature-v2');
    const heading = rivalry.querySelector('.card-title');
    if (heading) heading.insertAdjacentHTML('beforeend', '<span class="group-feature-tag">Season</span>');
  }

  const details = document.createElement('details');
  details.className = 'group-tools-v2';
  details.innerHTML = `<summary><div><strong>Group tools</strong><span>Invite, payment details & settings</span></div><span class="group-tools-chevron">›</span></summary><div class="group-tools-body"></div>`;
  const body = details.querySelector('.group-tools-body');

  if (joinPill) {
    const invite = document.createElement('div');
    invite.className = 'group-invite-v2';
    invite.innerHTML = `<span>Invite code</span><strong>${joinPill.querySelector('strong')?.textContent || ''}</strong>`;
    body.append(invite);
    joinPill.remove();
  }
  if (switcher) body.append(switcher);
  if (pay) body.append(pay);
  if (admin) body.append(admin);

  screen.append(details);
}

let enhancing = false;
function enhance() {
  if (enhancing || !screen || !screen.children.length) return;
  enhancing = true;
  try {
    screen.classList.remove('screen-gw-v2', 'screen-live-v2', 'screen-history-v2', 'screen-group-v2');
    const tab = document.querySelector('.nav-item.active')?.dataset?.tab;
    if (tab === 'gw') enhanceGW();
    if (tab === 'live') enhanceLive();
    if (tab === 'history') enhanceHistory();
    if (tab === 'group') enhanceGroup();
  } finally {
    enhancing = false;
  }
}

const observer = new MutationObserver(() => queueMicrotask(enhance));
observer.observe(screen, { childList: true });
window.addEventListener('load', enhance);
queueMicrotask(enhance);
