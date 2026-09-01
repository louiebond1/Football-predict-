import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const screen = document.querySelector('#screen');
const GROUP_KEY = 'kp-active-group-v1';
const tabTitles = { gw: 'Matchday', live: 'Live', history: 'History', group: 'Group' };
const readySelectors = { gw: '.kp3-gw-root', live: '.kp3-live-root', history: '.kp3-history-root', group: '.kp3-group-root' };
let transition = null;
let transitionToken = 0;
let client = null;
let groupContext = null;
let groupContextAt = 0;
let renameBusy = false;

function normaliseText(text = '') {
  return String(text)
    .replace(/\bGameweeks\b/g, 'Matchdays')
    .replace(/\bGameweek\b/g, 'Matchday');
}

function normaliseVisibleCopy(root = screen) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || /^(SCRIPT|STYLE|TEXTAREA)$/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return /\bGameweeks?\b/.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => { node.nodeValue = normaliseText(node.nodeValue); });
}

function setNavCopy() {
  const label = document.querySelector('.nav-item[data-tab="gw"] small');
  if (label && label.textContent !== 'Matchday') label.textContent = 'Matchday';
}

function removeTransition(token) {
  if (!transition || token !== transitionToken) return;
  const node = transition;
  transition = null;
  node.classList.add('is-ready');
  setTimeout(() => node.remove(), 110);
}

function waitForTab(tab, token) {
  const start = performance.now();
  const check = () => {
    if (token !== transitionToken || !transition) return;
    const active = document.querySelector('.nav-item.active')?.dataset.tab;
    const ready = active === tab && Boolean(screen?.querySelector(readySelectors[tab]));
    if (ready) {
      requestAnimationFrame(() => removeTransition(token));
      return;
    }
    if (performance.now() - start > 2200) {
      removeTransition(token);
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

function showTransition(tab) {
  const current = document.querySelector('.nav-item.active')?.dataset.tab;
  if (!screen || !tab || tab === current || !screen.children.length) return;
  transition?.remove();
  const rect = screen.getBoundingClientRect();
  const token = ++transitionToken;
  const node = document.createElement('div');
  node.className = 'kp-tab-transition';
  node.setAttribute('aria-hidden', 'true');
  node.style.left = `${Math.max(0, rect.left)}px`;
  node.style.top = `${Math.max(0, rect.top)}px`;
  node.style.width = `${Math.max(1, rect.width)}px`;
  node.style.height = `${Math.max(180, Math.min(window.innerHeight - Math.max(0, rect.top) - 74, rect.height || window.innerHeight))}px`;
  node.innerHTML = `<div class="kp-tab-transition-title">${tabTitles[tab] || ''}</div><div class="kp-tab-skeleton kp-tab-skeleton-wide"></div><div class="kp-tab-skeleton"></div><div class="kp-tab-skeleton"></div>`;
  document.body.append(node);
  transition = node;
  waitForTab(tab, token);
}

async function getClient() {
  if (client) return client;
  if (window.__kickpotSupabase) { client = window.__kickpotSupabase; return client; }
  const cfg = await fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (!cfg?.supabaseConfigured) return null;
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return client;
}

async function getActiveGroupContext(force = false) {
  if (!force && groupContext && Date.now() - groupContextAt < 15000) return groupContext;
  const sb = await getClient();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data: groups, error } = await sb.from('groups').select('id,name,treasurer_id').order('created_at');
  if (error) return null;
  const selected = document.querySelector('#groupSwitch')?.value || sessionStorage.getItem(GROUP_KEY) || '';
  const group = (groups || []).find(g => g.id === selected) || (groups || [])[0] || null;
  groupContext = { sb, session, group };
  groupContextAt = Date.now();
  return groupContext;
}

async function injectRename() {
  if (renameBusy) return;
  const list = document.querySelector('.kp3-settings-list');
  if (!list || list.querySelector('.kp-group-rename')) return;
  renameBusy = true;
  try {
    const ctx = await getActiveGroupContext();
    if (!ctx?.group || ctx.group.treasurer_id !== ctx.session.user.id || !document.querySelector('.kp3-settings-list')) return;
    const block = document.createElement('div');
    block.className = 'kp-group-rename';
    block.innerHTML = `<label><span>Group name</span><input type="text" maxlength="40" value="${String(ctx.group.name || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}"></label><button type="button">Save name</button><small></small>`;
    list.prepend(block);
    const input = block.querySelector('input');
    const button = block.querySelector('button');
    const status = block.querySelector('small');
    button.addEventListener('click', async () => {
      const next = input.value.trim();
      if (next.length < 2 || next.length > 40) { status.textContent = 'Use 2–40 characters.'; return; }
      button.disabled = true;
      status.textContent = 'Saving…';
      const { error } = await ctx.sb.rpc('rename_group', { p_group_id: ctx.group.id, p_name: next });
      if (error) { button.disabled = false; status.textContent = error.message || 'Could not rename group.'; return; }
      status.textContent = 'Saved ✓';
      document.querySelector('.kp3-group-head h1')?.replaceChildren(document.createTextNode(next));
      const option = document.querySelector(`#groupSwitch option[value="${CSS.escape(ctx.group.id)}"]`);
      if (option) option.textContent = next;
      groupContext = null;
      setTimeout(() => location.reload(), 450);
    });
  } finally {
    renameBusy = false;
  }
}

setNavCopy();
normaliseVisibleCopy();

document.addEventListener('pointerdown', event => {
  const nav = event.target.closest('.nav-item[data-tab]');
  if (nav) showTransition(nav.dataset.tab);
}, true);

document.addEventListener('click', event => {
  const groupSettings = event.target.closest('.kp3-nav-row');
  const label = groupSettings?.querySelector('.kp3-nav-copy strong')?.textContent?.trim() || '';
  if (/^Group settings$/i.test(label)) [40,140,360].forEach(ms => setTimeout(injectRename, ms));
}, true);

document.addEventListener('change', event => {
  if (event.target?.id === 'groupSwitch') { groupContext = null; groupContextAt = 0; }
}, true);

const copyObserver = new MutationObserver(() => {
  setNavCopy();
  normaliseVisibleCopy();
  if (document.querySelector('.kp3-settings-list')) injectRename().catch(() => {});
});
if (screen) copyObserver.observe(screen, { childList: true, subtree: true });

window.addEventListener('pageshow', () => {
  setNavCopy();
  normaliseVisibleCopy();
  setTimeout(() => injectRename().catch(() => {}), 250);
});
