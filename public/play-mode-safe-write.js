import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROUP_KEY = 'kp-active-group-v1';
let client = null;

function selectedGroupId() {
  return document.querySelector('#groupSwitch')?.value
    || sessionStorage.getItem(GROUP_KEY)
    || localStorage.getItem(GROUP_KEY)
    || '';
}

async function getClient() {
  if (client) return client;
  const cfg = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}

function stampPlayModePage(page) {
  if (!page || page.dataset.kpGroupId) return;
  const id = selectedGroupId();
  if (id) page.dataset.kpGroupId = id;
}

function dedupePlayModeUi() {
  const navs = [...document.querySelectorAll('.kp-playmode-nav')];
  const pages = [...document.querySelectorAll('.kp-playmode-page')];

  // settings-v2 can be asked to enhance the same Admin menu several times in
  // quick succession. Each call checks for an existing row before awaiting its
  // group query, so two calls can both pass that check and later append a row.
  // Keep the newest complete pair and discard earlier duplicate pairs.
  if (navs.length > 1) navs.slice(0, -1).forEach(node => node.remove());
  if (pages.length > 1) pages.slice(0, -1).forEach(node => node.remove());
}

function syncPlayModeUi() {
  document.querySelectorAll('.kp-playmode-page').forEach(stampPlayModePage);
  dedupePlayModeUi();
}

const root = document.querySelector('#screen') || document.body;
new MutationObserver(() => queueMicrotask(syncPlayModeUi)).observe(root, { childList: true, subtree: true });
syncPlayModeUi();

// A Play Mode page captures a group context when settings-v2 builds it. Never
// allow that page to survive a group switch: it could otherwise present controls
// from one group while a different group is now selected.
document.addEventListener('change', event => {
  if (event.target?.id !== 'groupSwitch') return;
  document.querySelectorAll('.kp-playmode-page').forEach(node => node.remove());
  document.querySelectorAll('.kp-playmode-nav').forEach(node => node.remove());
}, true);

// Intercept Play Mode saves before settings-v2's page-local handler. Re-read the
// current group and session from Supabase and require the page's captured group
// id to match the currently selected group before any write is allowed.
document.addEventListener('click', async event => {
  const button = event.target.closest('.kp-mode-save');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const page = button.closest('.kp-playmode-page');
  const status = page?.querySelector('.kp-mode-status');
  const pageGroupId = page?.dataset.kpGroupId || '';
  const groupId = selectedGroupId();

  if (!page || !status || !pageGroupId || !groupId || pageGroupId !== groupId) {
    if (status) status.textContent = 'Group changed — reopen Play mode before saving.';
    return;
  }

  const paymentsRequired = page.querySelector('.kp-payment-required')?.checked === true;
  const winnerPrize = page.querySelector('.kp-winner-prize')?.value.trim() || null;
  const loserPunishment = page.querySelector('.kp-loser-punishment')?.value.trim() || null;

  button.disabled = true;
  status.textContent = 'Saving…';

  try {
    const sb = await getClient();
    if (!sb) throw new Error('Could not connect to KickPot.');

    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Your session expired. Sign in again.');

    const { data: group, error: groupError } = await sb
      .from('groups')
      .select('id,treasurer_id,payments_required')
      .eq('id', groupId)
      .maybeSingle();
    if (groupError) throw groupError;
    if (!group || group.treasurer_id !== session.user.id) throw new Error('Only this group’s Treasurer can change Play Mode.');

    // The user may have switched groups while the verification request was in flight.
    if (selectedGroupId() !== groupId || page.dataset.kpGroupId !== groupId || !page.isConnected) {
      throw new Error('Group changed — reopen Play mode before saving.');
    }

    const { data: updated, error: updateError } = await sb
      .from('groups')
      .update({
        payments_required: paymentsRequired,
        winner_prize: winnerPrize,
        loser_punishment: loserPunishment
      })
      .eq('id', groupId)
      .eq('treasurer_id', session.user.id)
      .select('id,payments_required')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated?.id || updated.id !== groupId) throw new Error('Play Mode was not saved.');

    try { sessionStorage.setItem(GROUP_KEY, groupId); } catch {}
    try { localStorage.setItem(GROUP_KEY, groupId); } catch {}
    status.textContent = 'Saved ✓';
    setTimeout(() => location.reload(), 320);
  } catch (err) {
    button.disabled = false;
    status.textContent = err?.message || 'Could not save Play Mode.';
  }
}, true);
