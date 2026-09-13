import { createClient } from './supabase-singleton.js';

const screen = document.querySelector('#screen');
const subState = { history: 'overview', group: 'overview' };
let lastTab = null;
let busy = false;
let sb = null;
let dataCache = null;
let dataCacheAt = 0;
let winnerChecked = false;


function hasText(el, text) {
  return (el?.textContent || '').toLowerCase().includes(text.toLowerCase());
}
function directCard(title) {
  return [...screen.querySelectorAll(':scope > .card')].find(card => hasText(card.querySelector('.card-title'), title));
}
function clampScore(value) { return Math.max(0, Math.min(20, Number(value) || 0)); }
function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
function chevron() {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
}
function backIcon() {
  return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
}
function icon(name) {
  const icons = {
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17.3" cy="8.6" r="2.3"/><path d="M18.7 20v-1a4 4 0 0 0-2.7-3.78"/>',
    card: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M7 15h4"/>',
    shield: '<path d="M12 3.5l7 2.7v5.3c0 5-3.1 7.9-7 9-3.9-1.1-7-4-7-9V6.2l7-2.7z"/><path d="M9.5 12l1.7 1.7 3.5-3.7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.6v-.08a1.7 1.7 0 0 0-.4-1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 3.8 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H2V9.6h.08a1.7 1.7 0 0 0 1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.86-2.86.06.06A1.7 1.7 0 0 0 8 3.8a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V2h4v.08a1.7 1.7 0 0 0 .4 1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 20.2 8c.14.36.35.7.6 1 .27.28.61.49 1 .6h.08v4h-.08a1.7 1.7 0 0 0-1 .4c-.27.28-.47.62-.6 1z"/>',
    trophy: '<path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 8M17 5.5h2.5A2.5 2.5 0 0 1 17 8"/><path d="M12 12v4M8.5 20h7"/>',
    target: '<circle cx="12" cy="12" r="8.3"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || ''}</svg>`;
}

function makeBackHeader(title, subtitle, onBack) {
  const header = document.createElement('section');
  header.className = 'kp3-drill-header';
  header.innerHTML = `<button type="button" class="kp3-back" aria-label="Back">${backIcon()}</button><div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>`;
  header.querySelector('.kp3-back').addEventListener('click', onBack);
  return header;
}

function makeNavRow(label, meta, iconName, onClick, extra = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `kp3-nav-row ${extra}`.trim();
  button.innerHTML = `<span class="kp3-nav-icon">${icon(iconName)}</span><span class="kp3-nav-copy"><strong>${esc(label)}</strong>${meta ? `<small>${esc(meta)}</small>` : ''}</span><span class="kp3-nav-meta"></span><span class="kp3-nav-chevron">${chevron()}</span>`;
  button.addEventListener('click', onClick);
  return button;
}

function showView(map, key) {
  Object.entries(map).forEach(([name, node]) => { if (node) node.hidden = name !== key; });
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
}

async function getSupabase() {
  if (sb) return sb;
  const cfg = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  sb = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return sb;
}

function memberStatus(source, memberRow) {
  const paid = Boolean(source?.querySelector('.paid'));
  const claimed = /\bClaimed\b/i.test(source?.textContent || '');
  const confirm = source?.querySelector('.confirm-btn');
  const el = document.createElement(confirm ? 'button' : 'span');
  if (confirm) el.type = 'button';
  el.className = `kp3-member-status ${paid ? 'is-paid' : claimed ? 'is-pending' : 'is-unpaid'}${confirm ? ' can-approve' : ''}`;
  el.textContent = paid ? 'Paid ✓' : claimed ? 'Needs approval' : 'Unpaid';
  if (confirm) {
    el.addEventListener('click', () => {
      el.disabled = true; el.textContent = 'Approving…'; confirm.click();
    });
  }
  memberRow.append(el);
}

function buildMembers(payments) {
  const list = document.createElement('div'); list.className = 'kp3-members-list';
  const rows = [...(payments?.querySelectorAll('.payment-row') || [])];
  rows.forEach(source => {
    const row = document.createElement('div'); row.className = 'kp3-member-row';
    const left = source.querySelector('.row-left')?.cloneNode(true); if (left) row.append(left);
    memberStatus(source, row); list.append(row);
  });
  if (!rows.length) list.innerHTML = '<div class="kp3-empty-small">No members yet.</div>';
  return list;
}

function improvePaymentCard(pay, mePaid) {
  if (!pay) return;
  pay.classList.add('kp3-payment-details');
  const claim = pay.querySelector('#claimPaid');
  const waiting = pay.querySelector('.status.warning');
  if (mePaid) {
    claim?.remove(); waiting?.remove();
    if (!pay.querySelector('.kp3-payment-confirmed')) {
      const done = document.createElement('div'); done.className = 'kp3-payment-confirmed'; done.textContent = 'Paid ✓'; pay.append(done);
    }
  }
  const bankbox = pay.querySelector('.bankbox');
  if (bankbox && !pay.querySelector('.kp3-copy-bank')) {
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'kp3-copy-bank'; copy.innerHTML = `${icon('copy')} Copy payment details`;
    copy.addEventListener('click', async () => {
      const text = [...bankbox.querySelectorAll('.bankline')].map(line => `${line.querySelector('span')?.textContent?.trim() || ''}: ${line.querySelector('b')?.textContent?.trim() || ''}`).join('\n');
      try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; setTimeout(() => { copy.innerHTML = `${icon('copy')} Copy payment details`; }, 1400); } catch {}
    });
    bankbox.after(copy);
  }
}

async function setupJoinAnother(container) {
  const button = container.querySelector('.kp3-join-another');
  if (!button || button.dataset.bound === '1') return;
  button.dataset.bound = '1';
  button.addEventListener('click', () => {
    const form = container.querySelector('.kp3-join-form');
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('input')?.focus();
  });
  container.querySelector('.kp3-join-submit')?.addEventListener('click', async () => {
    const input = container.querySelector('.kp3-join-form input');
    const status = container.querySelector('.kp3-join-status');
    const code = input?.value.trim(); if (!code) return;
    status.textContent = 'Joining…';
    try {
      const client = await getSupabase();
      const { data, error } = await client.rpc('join_group', { p_join_code: code });
      if (error) throw error;
      status.textContent = 'Joined ✓';
      await window.KickPotApp.selectGroup(data.id);
    } catch (err) { status.textContent = err.message || 'Could not join group.'; }
  });
}

function enhanceGroup() {
  subState.group='overview';
  screen.className = 'screen kp3-screen kp3-group';
  if (screen.querySelector(':scope > .kp3-group-root')) return;
  const head = screen.querySelector(':scope > .group-head');
  const join = [...screen.querySelectorAll(':scope > .pill')].find(el => hasText(el, 'Join code'));
  const switcher = screen.querySelector(':scope > .select-wrap');
  const pot = directCard('Pot');
  const payments = directCard('Member Payments');
  const week = directCard('This Week');
  const pay = directCard('Pay the Treasurer');
  const admin = directCard('Treasurer · Bank Details');
  const rivalry = directCard('Group Rivalry');
  const leave = directCard('Leave Group');
  if (!head || !pot) return;
  rivalry?.remove();

  const myRow = [...(payments?.querySelectorAll('.payment-row') || [])].find(r => hasText(r, '(you)'));
  const mePaid = Boolean(myRow?.querySelector('.paid'));
  improvePaymentCard(pay, mePaid);
  const amount = pot.querySelector('.pot-amount')?.textContent?.trim() || '£0';
  const paymentBadge = pot.querySelector('.badge')?.textContent?.trim() || '0/0 paid';
  const memberCount = payments?.querySelectorAll('.payment-row').length || 0;

  const root = document.createElement('div'); root.className = 'kp3-group-root';
  const overview = document.createElement('section'); overview.className = 'kp3-view kp3-group-overview';
  const members = document.createElement('section'); members.className = 'kp3-view';
  const paymentView = document.createElement('section'); paymentView.className = 'kp3-view';
  const rules = document.createElement('section'); rules.className = 'kp3-view';
  const settings = document.createElement('section'); settings.className = 'kp3-view';
  screen.insertBefore(root, head); root.append(overview, members, paymentView, rules, settings);

  head.classList.add('kp3-group-head');
  const subtitle = head.querySelector('.hero-sub');
  if (subtitle) subtitle.textContent = subtitle.textContent.replace(/\b1 members\b/i, '1 member');
  overview.append(head);

  if (switcher) { switcher.classList.add('kp3-group-switch-top'); overview.append(switcher); }

  const potHero = document.createElement('section'); potHero.className = 'kp3-pot-hero';
  potHero.innerHTML = `<div><small>CURRENT POT</small><strong>${esc(amount)}</strong><span>${esc(paymentBadge)} ✓</span></div><div class="kp3-ball-art" aria-hidden="true"></div>`;
  overview.append(potHero);

  const nav = document.createElement('div'); nav.className = 'kp3-group-menu';
  const views = { overview, members, payments: paymentView, rules, settings };
  const go = key => { if(window.KickPotGroup?.navigate(key))return;subState.group = key; showView(views, key); };
  const m = makeNavRow('Members', 'Manage your group', 'users', () => go('members'));
  m.querySelector('.kp3-nav-meta').textContent = `${memberCount} member${memberCount === 1 ? '' : 's'}`;
  const p = makeNavRow('Payments', 'Payment details & status', 'card', () => go('payments'));
  p.querySelector('.kp3-nav-meta').textContent = paymentBadge;
  nav.append(m, p, makeNavRow('Rules', 'Scoring & lock times', 'shield', () => go('rules')), makeNavRow('Group settings', 'Invite code & admin', 'settings', () => go('settings')));
  overview.append(nav);

  members.append(makeBackHeader('Members', `${memberCount} in this group`, () => go('overview')), buildMembers(payments));
  const invite = document.createElement('button'); invite.type = 'button'; invite.className = 'kp3-primary-small'; invite.textContent = 'Invite members'; invite.addEventListener('click', () => go('settings')); members.append(invite);

  paymentView.append(makeBackHeader('Payments', paymentBadge, () => go('overview')));
  if (pay) paymentView.append(pay);
  if (payments) { payments.classList.add('kp3-payment-history'); paymentView.append(payments); }

  rules.append(makeBackHeader('Rules', 'How the pot works', () => go('overview')));
  if (week) { week.classList.add('kp3-rules-card'); rules.append(week); }

  settings.append(makeBackHeader('Group settings', 'Invite and manage', () => go('overview')));
  const settingsList = document.createElement('div'); settingsList.className = 'kp3-settings-list';
  if (join) {
    const code = join.querySelector('strong')?.textContent?.trim() || '';
    const row = document.createElement('button'); row.type = 'button'; row.className = 'kp3-setting-row'; row.innerHTML = `<span><small>Invite code</small><strong>${esc(code)}</strong></span><em>Copy</em>`;
    row.addEventListener('click', async () => { try { await navigator.clipboard.writeText(code); row.querySelector('em').textContent = 'Copied'; setTimeout(() => row.querySelector('em').textContent = 'Copy', 1300); } catch {} });
    settingsList.append(row); join.remove();
  }
  const joinAnother = document.createElement('button'); joinAnother.type = 'button'; joinAnother.className = 'kp3-setting-row kp3-join-another'; joinAnother.innerHTML = `<span>${icon('plus')}<strong>Join another group</strong></span>${chevron()}`;
  settingsList.append(joinAnother);
  const form = document.createElement('div'); form.className = 'kp3-join-form'; form.hidden = true; form.innerHTML = `<input type="text" maxlength="6" placeholder="6-character join code" autocomplete="off"><button type="button" class="kp3-join-submit">Join group</button><small class="kp3-join-status"></small>`;
  settingsList.append(form); settings.append(settingsList);
  if (admin) {
    admin.classList.add('kp3-admin-card');
    [['#bankName','Account holder'],['#bankSort','Sort code'],['#bankAcc','Account number']].forEach(([sel,label]) => {
      const input = admin.querySelector(sel); const wrap = input?.closest('.scorer-row');
      if (input && wrap && !wrap.querySelector('label')) { const l = document.createElement('label'); l.textContent = label; l.htmlFor = input.id; wrap.prepend(l); }
    });
    settings.append(admin);
  }
  if (leave) { leave.classList.add('kp3-leave-card'); settings.append(leave); }
  pot.remove();
  setupJoinAnother(settings);
  showView(views, subState.group);
}

export {enhanceGroup};
