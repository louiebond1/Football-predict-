import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROUP_KEY = 'kp-active-group-v1';
const TAB_KEY = 'kp-active-tab-v1';
const ROUTE_PREFIX = 'kp-route-v1:';
const screen = document.querySelector('#screen');
let client = null;
let ctxCache = null;
let ctxAt = 0;
let ctxKey = '';

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function isStandalone() { return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }

async function getClient() {
  if (client) return client;
  const cfg = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}
function invalidateContext() { ctxCache = null; ctxAt = 0; ctxKey = ''; }
async function getContext(force = false) {
  const selected = document.querySelector('#groupSwitch')?.value || sessionStorage.getItem(GROUP_KEY) || '';
  if (!force && ctxCache && ctxKey === selected && Date.now() - ctxAt < 12000) return ctxCache;
  const sb = await getClient();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data: groups, error } = await sb.from('groups').select('id,name,join_code,stake_pence,treasurer_id,payments_required,winner_prize,loser_punishment').order('created_at');
  if (error) return null;
  const group = (groups || []).find(g => g.id === selected) || (groups || [])[0] || null;
  ctxCache = { sb, session, groups: groups || [], group };
  ctxAt = Date.now(); ctxKey = selected;
  return ctxCache;
}

function closeOverlay(node) { node?.remove(); }
async function openAccountSettings() {
  if (document.querySelector('.kp-account-overlay')) return;
  const sb = await getClient();
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const { data: profile } = await sb.from('profiles').select('display_name').eq('id', session.user.id).maybeSingle();
  const name = profile?.display_name || session.user.email?.split('@')[0] || 'Player';
  const overlay = document.createElement('div');
  overlay.className = 'kp-account-overlay';
  overlay.innerHTML = `<section class="kp-account-sheet" role="dialog" aria-modal="true" aria-label="Account settings">
    <div class="kp-account-handle"></div>
    <div class="kp-account-head"><h2>Account</h2><button type="button" class="kp-account-close" aria-label="Close">×</button></div>
    <div class="kp-account-avatar">${esc(name.slice(0,1).toUpperCase())}</div>
    <div class="kp-account-form">
      <label>Display name<input id="kpAccountName" maxlength="40" value="${esc(name)}"></label>
      <label>Email<input value="${esc(session.user.email || '')}" readonly></label>
      <button type="button" class="kp-account-primary" id="kpAccountSave">Save changes</button>
      <small class="kp-account-status" id="kpAccountStatus"></small>
    </div>
    <div class="kp-account-section"><strong>KickPot app</strong><p>${isStandalone() ? 'KickPot is already running from your Home Screen.' : isIOS() ? 'Add KickPot to your iPhone Home Screen and it opens like an app, without Safari chrome.' : 'You can install KickPot to your Home Screen from your browser.'}</p>${isStandalone() ? '' : `<button type="button" class="kp-account-install" id="kpInstallHelp">${isIOS() ? 'How to add to Home Screen' : 'Install / add to Home Screen'}</button>`}</div>
    <button type="button" class="kp-account-signout" id="kpAccountSignOut">Sign out</button>
  </section>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(overlay); });
  overlay.querySelector('.kp-account-close').addEventListener('click', () => closeOverlay(overlay));
  overlay.querySelector('#kpAccountSave').addEventListener('click', async () => {
    const input = overlay.querySelector('#kpAccountName');
    const status = overlay.querySelector('#kpAccountStatus');
    const button = overlay.querySelector('#kpAccountSave');
    const next = input.value.trim();
    if (!next || next.length > 40) { status.textContent = 'Use a name between 1 and 40 characters.'; return; }
    button.disabled = true; status.textContent = 'Saving…';
    const { error } = await sb.from('profiles').update({ display_name: next }).eq('id', session.user.id);
    button.disabled = false;
    if (error) { status.textContent = error.message; return; }
    status.textContent = 'Saved ✓';
    const chip = document.querySelector('#userChip'); if (chip) chip.textContent = next.slice(0,1).toUpperCase();
    overlay.querySelector('.kp-account-avatar').textContent = next.slice(0,1).toUpperCase();
    invalidateContext();
  });
  overlay.querySelector('#kpInstallHelp')?.addEventListener('click', () => {
    const p = overlay.querySelector('.kp-account-section p');
    p.innerHTML = isIOS()
      ? 'In Safari, tap the <strong>Share</strong> button at the bottom, scroll down and choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.'
      : 'Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>.';
  });
  overlay.querySelector('#kpAccountSignOut').addEventListener('click', async () => {
    const button = overlay.querySelector('#kpAccountSignOut'); button.disabled = true; button.textContent = 'Signing out…';
    await sb.auth.signOut();
    sessionStorage.clear();
    location.reload();
  });
  document.body.append(overlay);
}

function createGroupForm(list) {
  if (!list || list.querySelector('.kp-create-group-row')) return;
  const joinAnother = list.querySelector('.kp3-join-another');
  const row = document.createElement('button');
  row.type = 'button'; row.className = 'kp3-setting-row kp-create-group-row';
  row.innerHTML = '<span><strong>Create new group</strong><small>Start another private competition</small></span><em>＋</em>';
  const form = document.createElement('div');
  form.className = 'kp-create-group-form'; form.hidden = true;
  form.innerHTML = `<label>Group name<input class="kp-create-name" maxlength="40" placeholder="e.g. Sunday League Legends"></label><label>Weekly stake (£)<input class="kp-create-stake" type="number" min="0" max="1000" step="1" value="5"></label><button type="button" class="kp-create-submit">Create group</button><small class="kp-create-group-status"></small>`;
  row.addEventListener('click', () => { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input')?.focus(); });
  form.querySelector('.kp-create-submit').addEventListener('click', async () => {
    const sb = await getClient(); if (!sb) return;
    const status = form.querySelector('.kp-create-group-status');
    const button = form.querySelector('.kp-create-submit');
    const name = form.querySelector('.kp-create-name').value.trim();
    const stake = Math.max(0, Math.round(Number(form.querySelector('.kp-create-stake').value || 0) * 100));
    if (!name) { status.textContent = 'Give the group a name.'; return; }
    button.disabled = true; status.textContent = 'Creating…';
    const { data, error } = await sb.rpc('create_group', { p_name: name, p_stake_pence: stake });
    if (error) { button.disabled = false; status.textContent = error.message; return; }
    status.textContent = 'Created ✓';
    sessionStorage.setItem(GROUP_KEY, data.id);
    sessionStorage.setItem(TAB_KEY, 'group');
    sessionStorage.removeItem(`${ROUTE_PREFIX}group`);
    setTimeout(() => location.reload(), 350);
  });
  if (joinAnother) list.insertBefore(row, joinAnother); else list.append(row);
  row.after(form);
}

function stakesMarkup(group) {
  const rows = [];
  if (group.winner_prize?.trim()) rows.push(`<div class="kp-stakes-line"><span>Winner</span><strong>${esc(group.winner_prize.trim())}</strong></div>`);
  if (group.loser_punishment?.trim()) rows.push(`<div class="kp-stakes-line"><span>Loser</span><strong>${esc(group.loser_punishment.trim())}</strong></div>`);
  return rows.join('');
}
function termsHash(group) {
  const str = `${group.id}|${group.winner_prize || ''}|${group.loser_punishment || ''}`;
  let h = 2166136261;
  for (let i=0;i<str.length;i++) { h ^= str.charCodeAt(i); h = Math.imul(h,16777619); }
  return (h >>> 0).toString(36);
}
function maybeShowStakes(group) {
  if (!group || (!group.winner_prize?.trim() && !group.loser_punishment?.trim())) return;
  const key = `kp-stakes-seen:${group.id}:${termsHash(group)}`;
  if (sessionStorage.getItem(key) || document.querySelector('.kp-stakes-overlay')) return;
  const chip = document.querySelector('#userChip'); if (!chip || chip.hidden) return;
  const overlay = document.createElement('div'); overlay.className = 'kp-stakes-overlay';
  overlay.innerHTML = `<section class="kp-stakes-modal"><small>THIS GROUP IS PLAYING FOR</small><h2>${esc(group.name)}</h2><div class="kp-stakes-lines">${stakesMarkup(group)}</div><button type="button">I’m in</button></section>`;
  overlay.querySelector('button').addEventListener('click', () => { sessionStorage.setItem(key,'1'); overlay.remove(); });
  document.body.append(overlay);
}
function addStakesCard(group) {
  const overview = document.querySelector('.kp3-group-overview');
  if (!overview || overview.querySelector('.kp-stakes-card')) return;
  const rows = stakesMarkup(group); if (!rows) return;
  const card = document.createElement('section'); card.className = 'kp-stakes-card';
  card.innerHTML = `<small>WHAT YOU’RE PLAYING FOR</small><div class="kp-stakes-lines">${rows}</div>`;
  const menu = overview.querySelector('.kp3-group-menu');
  if (menu) overview.insertBefore(card, menu); else overview.append(card);
}

function applyFunPresentation(group) {
  const fun = group?.payments_required === false;
  document.body.classList.toggle('kp-fun-mode', fun);
  if (!group) return;
  if (fun) {
    const subtitle = document.querySelector('.kp3-group-head .hero-sub');
    if (subtitle && !/^For fun\b/i.test(subtitle.textContent)) subtitle.textContent = subtitle.textContent.replace(/^£[^·]+·\s*/, 'For fun · ');
    const pot = document.querySelector('.kp3-pot-hero');
    if (pot && !pot.classList.contains('kp-for-fun-hero')) {
      pot.classList.add('kp-for-fun-hero');
      const small = pot.querySelector('small'); const strong = pot.querySelector('strong'); const span = pot.querySelector('span');
      if (small) small.textContent = 'PLAY MODE'; if (strong) strong.textContent = 'For fun'; if (span) span.textContent = 'No payment required';
    }
    [...document.querySelectorAll('.kp3-group-menu .kp3-nav-row')].forEach(row => {
      if (/^Payments$/i.test(row.querySelector('.kp3-nav-copy strong')?.textContent?.trim() || '')) row.classList.add('kp-mode-hidden');
    });
    document.querySelectorAll('.kp3-member-status').forEach(status => {
      status.className = 'kp3-member-status kp-playing-status'; status.textContent = 'Playing'; status.disabled = true;
    });
    [...document.querySelectorAll('.kp-admin-nav-row')].forEach(row => {
      if (/^Payment control$/i.test(row.querySelector('.kp3-nav-copy strong')?.textContent?.trim() || '')) row.classList.add('kp-admin-payment-disabled');
    });
  }
}

async function enhanceGroupSettings() {
  const list = document.querySelector('.kp3-settings-list');
  if (!list) return;
  createGroupForm(list);
  const ctx = await getContext();
  if (ctx?.group) { applyFunPresentation(ctx.group); addStakesCard(ctx.group); maybeShowStakes(ctx.group); }
}

async function enhanceAdminGroupPage() {
  const header = [...document.querySelectorAll('.kp-admin-page .kp3-drill-header h1')].find(h => /^Group & invite$/i.test(h.textContent.trim()));
  const page = header?.closest('.kp-admin-page');
  if (!page || page.querySelector('.kp-mode-section')) return;
  const ctx = await getContext(true); const group = ctx?.group;
  if (!group || group.treasurer_id !== ctx.session.user.id) return;
  const section = document.createElement('section'); section.className = 'kp-admin-section kp-mode-section';
  section.innerHTML = `<div class="kp-admin-section-head"><div><strong>Play mode & stakes</strong><small>Choose money mode or just play for fun</small></div></div><div class="kp-mode-form"><label class="kp-mode-toggle"><span class="kp-mode-toggle-copy"><strong>Require weekly payment</strong><small>Turn this off to let everyone predict without paying.</small></span><span class="kp-switch"><input type="checkbox" class="kp-payment-required" ${group.payments_required !== false ? 'checked' : ''}><span></span></span></label><div class="kp-mode-note">When payment is off, KickPot unlocks predictions automatically and hides payment controls for this group.</div><label>Winner prize / reward<textarea class="kp-winner-prize" maxlength="240" placeholder="e.g. Winner chooses the pub, gets a trophy, £50 prize…">${esc(group.winner_prize || '')}</textarea></label><label>Loser punishment / forfeit<textarea class="kp-loser-punishment" maxlength="240" placeholder="e.g. Loser wears an Arsenal shirt to the pub…">${esc(group.loser_punishment || '')}</textarea></label><button type="button" class="kp-mode-save">Save play mode</button><small class="kp-mode-status"></small></div>`;
  const after = header.closest('.kp3-drill-header');
  after?.after(section);
  section.querySelector('.kp-mode-save').addEventListener('click', async () => {
    const status = section.querySelector('.kp-mode-status'); const button = section.querySelector('.kp-mode-save');
    const paymentsRequired = section.querySelector('.kp-payment-required').checked;
    const winnerPrize = section.querySelector('.kp-winner-prize').value.trim() || null;
    const loserPunishment = section.querySelector('.kp-loser-punishment').value.trim() || null;
    button.disabled = true; status.textContent = 'Saving…';
    const { error } = await ctx.sb.from('groups').update({ payments_required: paymentsRequired, winner_prize: winnerPrize, loser_punishment: loserPunishment }).eq('id', group.id);
    if (error) { button.disabled = false; status.textContent = error.message; return; }
    status.textContent = 'Saved ✓'; invalidateContext();
    sessionStorage.removeItem(`kp-stakes-seen:${group.id}:${termsHash(group)}`);
    setTimeout(() => location.reload(), 450);
  });
}

async function refreshGroupFeatures(force = false) {
  const ctx = await getContext(force); if (!ctx?.group) return;
  applyFunPresentation(ctx.group);
  addStakesCard(ctx.group);
  maybeShowStakes(ctx.group);
  if (document.querySelector('.kp3-settings-list')) enhanceGroupSettings();
  if (document.querySelector('.kp-admin-page')) enhanceAdminGroupPage();
}

function scheduleRefresh() {
  [0,80,240,650].forEach(ms => setTimeout(() => refreshGroupFeatures(ms === 650).catch(() => {}), ms));
}

document.addEventListener('click', event => {
  const chip = event.target.closest('#userChip');
  if (chip) {
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    openAccountSettings().catch(() => {});
    return;
  }
  const label = event.target.closest('.kp3-nav-row')?.querySelector('.kp3-nav-copy strong')?.textContent?.trim() || '';
  if (/^Group settings$/i.test(label) || /^Group & invite$/i.test(label) || /^Members$/i.test(label) || event.target.closest('.kp-admin-entry')) scheduleRefresh();
  if (event.target.closest('.nav-item[data-tab],.kp3-back')) scheduleRefresh();
}, true);

document.addEventListener('change', event => {
  if (event.target?.id === 'groupSwitch') { invalidateContext(); scheduleRefresh(); }
}, true);

window.addEventListener('load', scheduleRefresh);
window.addEventListener('pageshow', scheduleRefresh);
window.addEventListener('focus', () => { invalidateContext(); scheduleRefresh(); });
setTimeout(scheduleRefresh, 900);
