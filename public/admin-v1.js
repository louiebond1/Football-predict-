import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const screen = document.querySelector('#screen');
let client = null;
let attemptToken = 0;

const svg = (body, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const icons = {
  admin: svg('<path d="M12 3.5l7 2.7v5.3c0 5-3.1 7.9-7 9-3.9-1.1-7-4-7-9V6.2l7-2.7z"/><path d="M9 12h6M12 9v6"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>', 19),
  users: svg('<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17.3" cy="8.6" r="2.3"/>'),
  points: svg('<path d="M12 3l2.6 5.4 6 .8-4.3 4.1 1 5.9L12 16.5l-5.3 2.7 1-5.9-4.3-4.1 6-.8L12 3z"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  card: svg('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/>'),
  copy: svg('<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', 16)
};

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

async function getClient() {
  if (client) return client;
  const cfg = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}

async function loadAdminData() {
  const sb = await getClient();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data: groups, error: groupsError } = await sb.from('groups').select('id,name,join_code,stake_pence,treasurer_id').order('created_at');
  if (groupsError) throw groupsError;
  const selected = document.querySelector('#groupSwitch')?.value;
  const group = (groups || []).find(g => g.id === selected) || (groups || [])[0];
  if (!group || group.treasurer_id !== session.user.id) return { sb, session, group, isAdmin: false };

  const { data: gameweekId, error: gwError } = await sb.rpc('ensure_current_gameweek', { p_group_id: group.id });
  if (gwError) throw gwError;
  const { data: members, error: membersError } = await sb.from('group_members').select('user_id,role,joined_at').eq('group_id', group.id).order('joined_at');
  if (membersError) throw membersError;
  const ids = (members || []).map(m => m.user_id);
  let profiles = [];
  if (ids.length) {
    const res = await sb.from('profiles').select('id,display_name').in('id', ids);
    if (res.error) throw res.error;
    profiles = res.data || [];
  }
  const [paymentsRes, historyRes, adjustmentRes] = await Promise.all([
    sb.from('payments').select('*').eq('group_id', group.id).eq('gameweek_id', gameweekId),
    sb.from('group_gameweeks').select('gameweek_id,settled_at,gameweeks(round_name)').eq('group_id', group.id).order('gameweek_id', { ascending: false }).limit(38),
    sb.from('point_adjustments').select('*').eq('group_id', group.id).order('created_at', { ascending: false }).limit(30)
  ]);
  if (paymentsRes.error) throw paymentsRes.error;
  if (historyRes.error) throw historyRes.error;
  if (adjustmentRes.error) throw adjustmentRes.error;
  const names = new Map((profiles || []).map(p => [p.id, p.display_name]));
  names.set(session.user.id, names.get(session.user.id) || session.user.email?.split('@')[0] || 'You');
  const paymentMap = new Map((paymentsRes.data || []).map(p => [p.user_id, p]));
  return {
    sb, session, group, isAdmin: true, gameweekId,
    members: members || [], names, paymentMap,
    history: historyRes.data || [], adjustments: adjustmentRes.data || []
  };
}

function setGroupView(root, target) {
  [...root.querySelectorAll(':scope > .kp3-view')].forEach(view => { view.hidden = view !== target; });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function modal(title, message, confirmLabel = 'Confirm') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'kp-admin-modal';
    overlay.innerHTML = `<div class="kp-admin-modal-card"><strong>${esc(title)}</strong><p>${esc(message)}</p><div><button type="button" class="kp-admin-modal-cancel">Cancel</button><button type="button" class="kp-admin-modal-confirm">${esc(confirmLabel)}</button></div></div>`;
    const finish = value => { overlay.remove(); resolve(value); };
    overlay.querySelector('.kp-admin-modal-cancel').addEventListener('click', () => finish(false));
    overlay.querySelector('.kp-admin-modal-confirm').addEventListener('click', () => finish(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(false); });
    document.body.append(overlay);
  });
}

function paymentStatus(payment) {
  if (payment?.confirmed_paid_at) return 'paid';
  if (payment?.claimed_paid_at) return 'pending';
  return 'unpaid';
}

function adminHeader(onBack) {
  const header = document.createElement('section');
  header.className = 'kp3-drill-header kp-admin-header';
  header.innerHTML = `<button type="button" class="kp3-back" aria-label="Back">${icons.back}</button><div><h1>Admin</h1><p>Treasurer controls · changes are deliberate and auditable</p></div>`;
  header.querySelector('button').addEventListener('click', onBack);
  return header;
}

function section(title, subtitle = '') {
  const el = document.createElement('section');
  el.className = 'kp-admin-section';
  el.innerHTML = `<div class="kp-admin-section-head"><div><strong>${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div></div>`;
  return el;
}

async function renderAdmin(view, root, overview) {
  view.innerHTML = '';
  view.append(adminHeader(() => setGroupView(root, overview)));
  const loading = document.createElement('div'); loading.className = 'kp-admin-loading'; loading.textContent = 'Loading admin controls…'; view.append(loading);

  let data;
  try { data = await loadAdminData(); }
  catch (err) { loading.textContent = err.message || 'Could not load admin controls.'; return; }
  if (!data?.isAdmin) { view.remove(); return; }
  loading.remove();

  const { sb, session, group, members, names, paymentMap, gameweekId, history, adjustments } = data;
  const paid = members.filter(m => paymentStatus(paymentMap.get(m.user_id)) === 'paid').length;
  const pending = members.filter(m => paymentStatus(paymentMap.get(m.user_id)) === 'pending').length;
  const unpaid = members.length - paid - pending;

  const summary = document.createElement('section'); summary.className = 'kp-admin-summary';
  summary.innerHTML = `<div><small>PAID</small><strong>${paid}/${members.length}</strong></div><div><small>NEEDS APPROVAL</small><strong>${pending}</strong></div><div><small>UNPAID</small><strong>${unpaid}</strong></div>`;
  view.append(summary);

  const payments = section('Payment control', 'Tap a member to correct their payment state');
  const paymentList = document.createElement('div'); paymentList.className = 'kp-admin-list';
  members.forEach(member => {
    const p = paymentMap.get(member.user_id);
    const status = paymentStatus(p);
    const row = document.createElement('button'); row.type = 'button'; row.className = 'kp-admin-member-action';
    row.innerHTML = `<span><b>${esc(names.get(member.user_id) || 'Player')}</b><small>${status === 'paid' ? 'Confirmed paid' : status === 'pending' ? 'Says they have paid' : 'Not marked paid'}</small></span><em class="${status}">${status === 'paid' ? 'Paid ✓' : status === 'pending' ? 'Approve' : 'Mark paid'}</em>`;
    row.addEventListener('click', async () => {
      const makePaid = status !== 'paid';
      const ok = await modal(makePaid ? 'Mark as paid?' : 'Mark as unpaid?', `${names.get(member.user_id) || 'This member'} will be ${makePaid ? 'confirmed as paid' : 'reset to unpaid'} for this Gameweek.`, makePaid ? 'Mark paid' : 'Mark unpaid');
      if (!ok) return;
      row.disabled = true;
      const patch = makePaid
        ? { confirmed_paid_at: new Date().toISOString(), confirmed_by: session.user.id }
        : { claimed_paid_at: null, confirmed_paid_at: null, confirmed_by: null };
      const { error } = await sb.from('payments').update(patch).eq('group_id', group.id).eq('gameweek_id', gameweekId).eq('user_id', member.user_id);
      if (error) { row.disabled = false; row.querySelector('small').textContent = error.message; return; }
      await renderAdmin(view, root, overview);
    });
    paymentList.append(row);
  });
  payments.append(paymentList); view.append(payments);

  const details = section('Group details', 'Renaming is immediate; stake changes apply to future Gameweeks');
  details.innerHTML += `<div class="kp-admin-form"><label>Group name<input id="kpAdminGroupName" value="${esc(group.name)}" maxlength="40"></label><label>Weekly stake (£)<input id="kpAdminStake" type="number" min="0" max="1000" step="1" value="${Number(group.stake_pence || 0) / 100}"></label><button type="button" id="kpAdminSaveGroup">Save group details</button><small id="kpAdminGroupStatus"></small></div>`;
  details.querySelector('#kpAdminSaveGroup').addEventListener('click', async () => {
    const button = details.querySelector('#kpAdminSaveGroup'); const status = details.querySelector('#kpAdminGroupStatus');
    const name = details.querySelector('#kpAdminGroupName').value.trim(); const stake = Math.round(Number(details.querySelector('#kpAdminStake').value || 0) * 100);
    if (!name) { status.textContent = 'Group name is required.'; return; }
    button.disabled = true; status.textContent = 'Saving…';
    const { error } = await sb.from('groups').update({ name, stake_pence: stake }).eq('id', group.id);
    if (error) { button.disabled = false; status.textContent = error.message; return; }
    status.textContent = 'Saved ✓'; data.group.name = name; data.group.stake_pence = stake;
    const title = screen.querySelector('.kp3-group-head h1'); if (title) title.textContent = name;
    const opt = document.querySelector(`#groupSwitch option[value="${CSS.escape(group.id)}"]`); if (opt) opt.textContent = name;
    button.disabled = false;
  });
  view.append(details);

  const points = section('Adjust points', 'Emergency correction only · original predictions are never changed');
  const gwOptions = [{ id: gameweekId, label: 'Current Gameweek' }];
  history.forEach(h => { if (!gwOptions.some(x => Number(x.id) === Number(h.gameweek_id))) gwOptions.push({ id: h.gameweek_id, label: h.gameweeks?.round_name || `Gameweek ${h.gameweek_id}` }); });
  points.innerHTML += `<div class="kp-admin-form"><label>Member<select id="kpAdminPointsMember">${members.map(m => `<option value="${m.user_id}">${esc(names.get(m.user_id) || 'Player')}</option>`).join('')}</select></label><label>Gameweek<select id="kpAdminPointsGW">${gwOptions.map(g => `<option value="${g.id}">${esc(g.label)}</option>`).join('')}</select></label><div class="kp-admin-delta"><label>Adjustment<input id="kpAdminDelta" type="number" min="-50" max="50" step="1" placeholder="e.g. +2 or -1"></label></div><label>Reason<input id="kpAdminReason" maxlength="180" placeholder="e.g. scoring correction"></label><button type="button" id="kpAdminApplyPoints">Apply adjustment</button><small id="kpAdminPointsStatus">Every adjustment is kept in the audit trail.</small></div>`;
  points.querySelector('#kpAdminApplyPoints').addEventListener('click', async () => {
    const button = points.querySelector('#kpAdminApplyPoints'); const status = points.querySelector('#kpAdminPointsStatus');
    const userId = points.querySelector('#kpAdminPointsMember').value; const gw = Number(points.querySelector('#kpAdminPointsGW').value); const delta = Number(points.querySelector('#kpAdminDelta').value); const reason = points.querySelector('#kpAdminReason').value.trim();
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 50) { status.textContent = 'Enter a whole-number adjustment between −50 and +50.'; return; }
    if (reason.length < 3) { status.textContent = 'Add a short reason so the correction is auditable.'; return; }
    const ok = await modal('Apply point adjustment?', `${names.get(userId) || 'Player'}: ${delta > 0 ? '+' : ''}${delta} points. Reason: ${reason}`, 'Apply');
    if (!ok) return;
    button.disabled = true; status.textContent = 'Applying…';
    const { error } = await sb.from('point_adjustments').insert({ group_id: group.id, gameweek_id: gw, user_id: userId, delta, reason, created_by: session.user.id });
    if (error) { button.disabled = false; status.textContent = error.message; return; }
    status.textContent = 'Applied ✓';
    await renderAdmin(view, root, overview);
  });
  view.append(points);

  const audit = section('Point adjustment history', adjustments.length ? 'Latest corrections' : 'No manual point changes');
  const auditList = document.createElement('div'); auditList.className = 'kp-admin-audit';
  if (!adjustments.length) auditList.innerHTML = '<div class="kp-admin-empty">No adjustments have been made.</div>';
  adjustments.forEach(a => {
    const gw = gwOptions.find(g => Number(g.id) === Number(a.gameweek_id));
    const row = document.createElement('div'); row.className = 'kp-admin-audit-row';
    row.innerHTML = `<span><b>${esc(names.get(a.user_id) || 'Player')}</b><small>${esc(gw?.label || `GW ${a.gameweek_id}`)} · ${esc(a.reason)}</small></span><strong class="${a.delta > 0 ? 'plus' : 'minus'}">${a.delta > 0 ? '+' : ''}${a.delta}</strong>`;
    auditList.append(row);
  });
  audit.append(auditList); view.append(audit);

  const membersAdmin = section('Member administration', 'Remove members or hand over treasurer control');
  membersAdmin.innerHTML += `<div class="kp-admin-form"><label>Member<select id="kpAdminMemberSelect">${members.filter(m => m.user_id !== session.user.id).map(m => `<option value="${m.user_id}">${esc(names.get(m.user_id) || 'Player')}</option>`).join('')}</select></label><div class="kp-admin-split"><button type="button" id="kpAdminTransfer">Make treasurer</button><button type="button" id="kpAdminRemove" class="danger">Remove member</button></div><small id="kpAdminMemberStatus">You cannot remove yourself until treasurer control is transferred.</small></div>`;
  const targetSelect = membersAdmin.querySelector('#kpAdminMemberSelect');
  if (!targetSelect?.options.length) membersAdmin.querySelectorAll('#kpAdminTransfer,#kpAdminRemove').forEach(b => b.disabled = true);
  membersAdmin.querySelector('#kpAdminTransfer')?.addEventListener('click', async () => {
    const uid = targetSelect.value; if (!uid) return;
    const ok = await modal('Transfer treasurer?', `${names.get(uid) || 'This member'} will become treasurer and you will lose Admin access.`, 'Transfer'); if (!ok) return;
    const { error } = await sb.rpc('admin_transfer_treasurer', { p_group_id: group.id, p_user_id: uid });
    if (error) { membersAdmin.querySelector('#kpAdminMemberStatus').textContent = error.message; return; }
    location.reload();
  });
  membersAdmin.querySelector('#kpAdminRemove')?.addEventListener('click', async () => {
    const uid = targetSelect.value; if (!uid) return;
    const ok = await modal('Remove member?', `${names.get(uid) || 'This member'} will be removed from this group. Their historical prediction data is retained unless database rules remove it.`, 'Remove'); if (!ok) return;
    const { error } = await sb.rpc('admin_remove_member', { p_group_id: group.id, p_user_id: uid });
    if (error) { membersAdmin.querySelector('#kpAdminMemberStatus').textContent = error.message; return; }
    location.reload();
  });
  view.append(membersAdmin);

  const access = section('Invite access', 'Regenerate the code if it has been shared somewhere it should not be');
  access.innerHTML += `<div class="kp-admin-code"><span><small>Current code</small><strong id="kpAdminCode">${esc(group.join_code)}</strong></span><button type="button" id="kpAdminRegenerate">Regenerate</button></div><small id="kpAdminCodeStatus"></small>`;
  access.querySelector('#kpAdminRegenerate').addEventListener('click', async () => {
    const ok = await modal('Regenerate invite code?', 'The current code will stop working immediately.', 'Regenerate'); if (!ok) return;
    const button = access.querySelector('#kpAdminRegenerate'); button.disabled = true;
    const { data: newCode, error } = await sb.rpc('admin_regenerate_join_code', { p_group_id: group.id });
    if (error) { button.disabled = false; access.querySelector('#kpAdminCodeStatus').textContent = error.message; return; }
    access.querySelector('#kpAdminCode').textContent = newCode; access.querySelector('#kpAdminCodeStatus').textContent = 'New invite code active ✓'; button.disabled = false;
  });
  view.append(access);

  const bank = screen.querySelector('.kp3-admin-card');
  if (bank) {
    const bankWrap = section('Treasurer bank details', 'Shown to members on the payment page');
    bankWrap.append(bank); view.append(bankWrap);
  }
}

async function enhanceAdmin() {
  if (!document.querySelector('.nav-item[data-tab="group"].active')) return;
  const root = screen?.querySelector(':scope > .kp3-group-root');
  const overview = root?.querySelector(':scope > .kp3-group-overview');
  const menu = overview?.querySelector('.kp3-group-menu');
  if (!root || !overview || !menu || menu.querySelector('.kp-admin-entry')) return;

  let data;
  try { data = await loadAdminData(); } catch { return; }
  if (!data?.isAdmin) return;

  const settingsRow = [...menu.querySelectorAll('.kp3-nav-row')].find(r => /^Group settings/i.test(r.textContent.trim()));
  const settingsSmall = settingsRow?.querySelector('.kp3-nav-copy small'); if (settingsSmall) settingsSmall.textContent = 'Invite code & group access';

  const view = document.createElement('section'); view.className = 'kp3-view kp-admin-view'; view.hidden = true; root.append(view);
  const entry = document.createElement('button'); entry.type = 'button'; entry.className = 'kp3-nav-row kp-admin-entry';
  entry.innerHTML = `<span class="kp3-nav-icon">${icons.admin}</span><span class="kp3-nav-copy"><strong>Admin</strong><small>Payments, members & scoring controls</small></span><span class="kp3-nav-meta">Treasurer</span><span class="kp3-nav-chevron"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>`;
  entry.addEventListener('click', async () => { setGroupView(root, view); await renderAdmin(view, root, overview); });
  menu.append(entry);

  const bank = screen.querySelector('.kp3-admin-card');
  if (bank) bank.hidden = true;
}

function scheduleEnhance() {
  const token = ++attemptToken;
  let tries = 0;
  const run = () => {
    if (token !== attemptToken) return;
    enhanceAdmin().catch(() => {});
    if (++tries < 16 && document.querySelector('.nav-item[data-tab="group"].active') && !screen?.querySelector('.kp-admin-entry')) setTimeout(run, 75);
  };
  setTimeout(run, 0);
}

document.querySelector('.nav-item[data-tab="group"]')?.addEventListener('click', scheduleEnhance);
window.addEventListener('load', scheduleEnhance);
window.addEventListener('pageshow', scheduleEnhance);
if (document.querySelector('.nav-item[data-tab="group"].active')) scheduleEnhance();

// The Group tab's DOM is fully rebuilt (screen.innerHTML replaced) by any
// app.js re-render — a payment confirm, a bank-details save, switching
// groups, etc. — which wipes the injected Admin entry. The named event
// listeners above only cover navigating *to* the tab, not re-renders that
// happen while already on it, so watch #screen directly and re-run
// whenever the treasurer's Admin row isn't present.
if (screen) {
  new MutationObserver(() => {
    if (document.querySelector('.nav-item[data-tab="group"].active') && !screen.querySelector('.kp-admin-entry')) scheduleEnhance();
  }).observe(screen, { childList: true });
}
