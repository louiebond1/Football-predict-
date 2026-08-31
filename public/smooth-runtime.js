const screen = document.querySelector('#screen');
const nav = [...document.querySelectorAll('.nav-item')];

const TAB_KEY = 'kp-active-tab-v1';
const GROUP_KEY = 'kp-active-group-v1';
const ROUTE_PREFIX = 'kp-route-v1:';
const SCROLL_PREFIX = 'kp-scroll-v1:';
const INVITE_KEY = 'kp-pending-invite-v1';
const VALID_TABS = new Set(['gw', 'live', 'history', 'group']);

function cleanInviteCode(value = '') {
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}
function readStoredInvite() {
  try {
    const raw = JSON.parse(localStorage.getItem(INVITE_KEY) || 'null');
    if (!raw?.code || !raw?.savedAt || Date.now() - raw.savedAt > 2 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(INVITE_KEY);
      return '';
    }
    return cleanInviteCode(raw.code);
  } catch {
    localStorage.removeItem(INVITE_KEY);
    return '';
  }
}
function inviteFromUrl() {
  try { return cleanInviteCode(new URL(location.href).searchParams.get('join') || ''); }
  catch { return ''; }
}
function storeInvite(code) {
  const clean = cleanInviteCode(code);
  if (!clean) return '';
  localStorage.setItem(INVITE_KEY, JSON.stringify({ code: clean, savedAt: Date.now() }));
  return clean;
}
function makeInviteUrl(code) {
  const url = new URL('/', location.origin);
  url.searchParams.set('join', cleanInviteCode(code));
  return url.toString();
}
function clearPendingInvite() {
  pendingInvite = '';
  localStorage.removeItem(INVITE_KEY);
  try {
    const url = new URL(location.href);
    if (url.searchParams.has('join')) {
      url.searchParams.delete('join');
      history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {}
}

const urlInvite = inviteFromUrl();
let pendingInvite = urlInvite ? storeInvite(urlInvite) : readStoredInvite();
let inviteFormOpened = false;
let inviteJoinAttempt = false;

let desiredTab = sessionStorage.getItem(TAB_KEY) || 'gw';
if (!VALID_TABS.has(desiredTab)) desiredTab = 'gw';
let initialRestoreDone = false;
let userRouteActionUntil = 0;
let restoreTimer = 0;
let liveSignature = '';
let restoringGroup = false;
let restoringRoute = false;
let lastKnownScroll = window.scrollY;

history.scrollRestoration = 'manual';

function activeTab() {
  return document.querySelector('.nav-item.active')?.dataset.tab || desiredTab || 'gw';
}
function routeFor(tab = activeTab()) {
  return sessionStorage.getItem(`${ROUTE_PREFIX}${tab}`) || '';
}
function scrollKey(tab = activeTab(), route = routeFor(tab)) {
  return `${SCROLL_PREFIX}${tab}:${route || 'root'}`;
}
function saveScroll() {
  lastKnownScroll = window.scrollY;
  if (!initialRestoreDone) return;
  sessionStorage.setItem(scrollKey(), String(Math.max(0, Math.round(lastKnownScroll))));
}
function savedScroll(tab = activeTab(), route = routeFor(tab)) {
  return Math.max(0, Number(sessionStorage.getItem(scrollKey(tab, route)) || 0));
}
function scheduleScrollRestore(y) {
  const target = Math.max(0, Number(y) || 0);
  const token = ++restoreTimer;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (token !== restoreTimer) return;
    window.scrollTo({ top: target, behavior: 'auto' });
    lastKnownScroll = target;
  }));
}
function routeLabel(button) {
  return button?.querySelector('.kp3-nav-copy strong')?.textContent?.trim()
    || button?.querySelector('strong')?.textContent?.trim()
    || '';
}
function normaliseLiveMarkup(html) {
  return String(html).replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\d{2}:\d{2}\b/g, 'LIVE_CLOCK');
}
function inviteCodeRow() {
  return [...document.querySelectorAll('.kp3-setting-row')].find(row => {
    const label = row.querySelector('small')?.textContent?.trim().toLowerCase();
    return label === 'invite code';
  });
}
function installInviteShareAction() {
  const codeRow = inviteCodeRow();
  const settings = codeRow?.parentElement;
  if (!codeRow || !settings || settings.querySelector('.kp-invite-share-row')) return;
  const code = cleanInviteCode(codeRow.querySelector('strong')?.textContent || '');
  if (!code) return;

  const share = document.createElement('button');
  share.type = 'button';
  share.className = 'kp3-setting-row kp-invite-share-row';
  share.innerHTML = '<span><small>Invite link</small><strong>Send straight to KickPot</strong></span><em>Share</em>';
  share.addEventListener('click', async () => {
    const groupName = document.querySelector('.kp3-group-head h1')?.textContent?.trim() || 'my KickPot group';
    const url = makeInviteUrl(code);
    const em = share.querySelector('em');
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join ${groupName} on KickPot`,
          text: `Join my KickPot group “${groupName}”.`,
          url
        });
      } else {
        await navigator.clipboard.writeText(url);
        if (em) em.textContent = 'Copied';
        setTimeout(() => { if (em) em.textContent = 'Share'; }, 1400);
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
        if (em) em.textContent = 'Copied';
        setTimeout(() => { if (em) em.textContent = 'Share'; }, 1400);
      } catch {}
    }
  });
  codeRow.after(share);
}
function applyPendingInvite() {
  if (!pendingInvite) return;

  const onboardingInput = document.querySelector('#joinCode');
  if (onboardingInput) {
    if (!onboardingInput.value) onboardingInput.value = pendingInvite;
    onboardingInput.setAttribute('autocomplete', 'off');
    onboardingInput.setAttribute('autocapitalize', 'characters');
  }

  const form = document.querySelector('.kp3-join-form');
  const joinAnother = document.querySelector('.kp3-join-another');
  const input = form?.querySelector('input');
  if (input) {
    input.removeAttribute('maxlength');
    input.placeholder = 'Invite code';
    input.setAttribute('autocapitalize', 'characters');
    if (!input.value) input.value = pendingInvite;
  }
  if (joinAnother && form?.hidden && !inviteFormOpened) {
    inviteFormOpened = true;
    joinAnother.click();
    setTimeout(() => {
      const openedInput = document.querySelector('.kp3-join-form input');
      if (openedInput && !openedInput.value) openedInput.value = pendingInvite;
    }, 0);
  }
}
function maybeFinishInviteJoin() {
  if (!inviteJoinAttempt || !pendingInvite) return;
  const joined = /joined\s*[✓✔]?/i.test(document.querySelector('.kp3-join-status')?.textContent || '');
  const joinedCore = !document.querySelector('#joinCode') && Boolean(document.querySelector('.group-head,.kp3-group-root'));
  if (joined || joinedCore) {
    inviteJoinAttempt = false;
    clearPendingInvite();
  }
}
function prepareInviteRoute() {
  if (!pendingInvite || document.querySelector('#joinCode')) return;
  const userChip = document.querySelector('#userChip');
  if (!userChip || userChip.hidden) return;
  if (!document.querySelector('.group-head,.kp3-group-root')) return;
  desiredTab = 'group';
  sessionStorage.setItem(TAB_KEY, 'group');
  sessionStorage.setItem(`${ROUTE_PREFIX}group`, 'Group settings');
}

// app.js replaces #screen.innerHTML during renders. Intercept only this one
// element so background refreshes retain scroll and identical Live polls do
// not rebuild the DOM at all.
const innerHTMLDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
if (screen && innerHTMLDescriptor?.get && innerHTMLDescriptor?.set) {
  Object.defineProperty(screen, 'innerHTML', {
    configurable: true,
    get() { return innerHTMLDescriptor.get.call(this); },
    set(value) {
      const html = String(value);
      const isLiveRender = html.includes('<h1>Live Matchday</h1>');
      const userNavigating = performance.now() < userRouteActionUntil;

      if (isLiveRender) {
        const signature = normaliseLiveMarkup(html);
        if (liveSignature && signature === liveSignature && !userNavigating) return;
        liveSignature = signature;
      }

      const y = window.scrollY;
      innerHTMLDescriptor.set.call(this, value);
      if (initialRestoreDone && !userNavigating && y > 0) scheduleScrollRestore(y);
    }
  });
}

window.addEventListener('scroll', saveScroll, { passive: true });
window.addEventListener('pagehide', saveScroll);

document.addEventListener('pointerdown', event => {
  if (event.target.closest('.nav-item,.kp3-nav-row,.kp3-back,.kp-admin-entry')) {
    userRouteActionUntil = performance.now() + 1200;
  }
}, true);

document.addEventListener('click', event => {
  const navButton = event.target.closest('.nav-item[data-tab]');
  if (navButton) {
    saveScroll();
    desiredTab = navButton.dataset.tab;
    sessionStorage.setItem(TAB_KEY, desiredTab);
    const y = savedScroll(desiredTab);
    setTimeout(() => scheduleScrollRestore(y), 0);
    return;
  }

  const joinButton = event.target.closest('#joinGroupBtn,.kp3-join-submit');
  if (joinButton && pendingInvite) {
    const input = joinButton.id === 'joinGroupBtn'
      ? document.querySelector('#joinCode')
      : document.querySelector('.kp3-join-form input');
    const chosen = cleanInviteCode(input?.value || '');
    if (chosen === pendingInvite) inviteJoinAttempt = true;
    else if (chosen) clearPendingInvite();
  }

  const back = event.target.closest('.kp3-back');
  if (back) {
    const tab = activeTab();
    sessionStorage.removeItem(`${ROUTE_PREFIX}${tab}`);
    return;
  }

  const row = event.target.closest('.kp3-nav-row');
  if (row && !row.disabled) {
    const label = routeLabel(row);
    if (label) sessionStorage.setItem(`${ROUTE_PREFIX}${activeTab()}`, label);
  }
}, true);

document.addEventListener('change', event => {
  if (event.target?.id === 'groupSwitch' && event.target.value) {
    sessionStorage.setItem(GROUP_KEY, event.target.value);
  }
}, true);

function restoreGroupIfNeeded() {
  if (restoringGroup) return true;
  const wanted = sessionStorage.getItem(GROUP_KEY);
  const select = document.querySelector('#groupSwitch');
  if (!wanted || !select || select.value === wanted || ![...select.options].some(o => o.value === wanted)) return false;
  restoringGroup = true;
  select.value = wanted;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  setTimeout(() => { restoringGroup = false; finishInitialRestore(); }, 700);
  return true;
}

function restoreSubrouteIfNeeded() {
  if (restoringRoute) return false;
  const tab = activeTab();
  const wanted = routeFor(tab);
  if (!wanted) return false;
  const match = [...document.querySelectorAll('.kp3-nav-row')].find(row => routeLabel(row) === wanted && !row.disabled);
  if (!match) return false;
  const visibleRoot = match.closest('.kp3-view');
  if (visibleRoot?.hidden) return false;
  restoringRoute = true;
  userRouteActionUntil = performance.now() + 700;
  match.click();
  setTimeout(() => {
    scheduleScrollRestore(savedScroll(tab, wanted));
    restoringRoute = false;
    applyPendingInvite();
  }, 80);
  return true;
}

function finishInitialRestore() {
  if (initialRestoreDone) return;
  const userChip = document.querySelector('#userChip');
  if (!screen?.children.length) return;

  applyPendingInvite();
  installInviteShareAction();

  // Signed-out/auth and zero-group onboarding screens should remain untouched.
  if (!userChip || userChip.hidden) return;
  if (document.querySelector('#joinCode')) return;

  prepareInviteRoute();
  if (restoreGroupIfNeeded()) return;

  const target = document.querySelector(`.nav-item[data-tab="${desiredTab}"]`);
  if (target && !target.classList.contains('active')) {
    userRouteActionUntil = performance.now() + 700;
    target.click();
    return;
  }

  if (restoreSubrouteIfNeeded()) return;

  initialRestoreDone = true;
  applyPendingInvite();
  installInviteShareAction();
  scheduleScrollRestore(savedScroll(desiredTab));
}

const observer = new MutationObserver(() => {
  applyPendingInvite();
  installInviteShareAction();
  maybeFinishInviteJoin();
  if (!initialRestoreDone) {
    finishInitialRestore();
    return;
  }
  // If a real background update rebuilt the current view, restore the saved
  // sub-route/scroll before the browser paints the next stable frame.
  if (performance.now() >= userRouteActionUntil) restoreSubrouteIfNeeded();
});
if (screen) observer.observe(screen, { childList: true, subtree: true });

setTimeout(finishInitialRestore, 80);
setTimeout(finishInitialRestore, 300);
setTimeout(finishInitialRestore, 900);