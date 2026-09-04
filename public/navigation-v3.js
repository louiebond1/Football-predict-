const ROUTE_PREFIX = 'kp-route-v1:';
const SCROLL_PREFIX = 'kp-scroll-v1:';
const screen = document.querySelector('#screen');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
const STABLE_CLASS = { gw:'kp3-gw', live:'kp3-live', history:'kp3-history', group:'kp3-group' };
let pendingTab = '';
let pendingSince = 0;
let arrivalAnimation = null;
let arrivalTimer = 0;

function currentTab() {
  return document.querySelector('.nav-item.active')?.dataset.tab || '';
}

function currentRoute(tab) {
  try { return sessionStorage.getItem(`${ROUTE_PREFIX}${tab}`) || ''; }
  catch { return ''; }
}

function clearDestinationState(tab) {
  try {
    sessionStorage.removeItem(`${ROUTE_PREFIX}${tab}`);
    sessionStorage.setItem(`${SCROLL_PREFIX}${tab}:root`, '0');
  } catch {}
}

function fixVisibleRenderArtifacts() {
  // ui-v3 adds its own fixture count. Remove the original count so the
  // Matchday header never reads "Your Picks10 fixtures" or shows it twice.
  const head = screen?.querySelector('.kp3-fixtures-card .card-head');
  if (head?.querySelector('.kp3-count')) {
    head.querySelector(':scope > .muted')?.remove();
  }
}

function destinationIsStable(tab) {
  const cls = STABLE_CLASS[tab];
  return !cls || screen?.classList.contains(cls);
}

function finishArrival(force = false) {
  if (!screen || !pendingTab) return;
  const active = currentTab();
  if (active !== pendingTab) return;
  if (!force && !destinationIsStable(pendingTab)) return;

  pendingTab = '';
  clearTimeout(arrivalTimer);
  arrivalTimer = 0;
  arrivalAnimation?.cancel();
  if (reduceMotion || typeof screen.animate !== 'function') return;

  // Animate only after ui-v3 has completed its structural upgrade. This avoids
  // the visible base-layout -> enhanced-layout morph seen in the recording.
  arrivalAnimation = screen.animate([
    { opacity: 0.96, transform: 'translateY(2px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], {
    duration: 120,
    easing: 'cubic-bezier(.22,.61,.36,1)'
  });
}

// Loaded before smooth-runtime.js on purpose. Direct bottom-tab taps are
// normalized here first so the older restore layer cannot fight the gesture.
document.addEventListener('click', event => {
  const nav = event.target.closest('.nav-item[data-tab]');
  if (!nav) return;

  const toTab = nav.dataset.tab;
  const fromTab = currentTab();
  const sameTab = toTab === fromTab;
  const hasSubroute = Boolean(currentRoute(toTab));

  clearDestinationState(toTab);

  if (sameTab && !hasSubroute) {
    // Re-tapping the active root tab should behave like a native app: keep the
    // current DOM and smoothly scroll it all the way back to the top.
    event.preventDefault();
    event.stopImmediatePropagation();
    pendingTab = '';
    clearTimeout(arrivalTimer);
    arrivalAnimation?.cancel();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    return;
  }

  // For a switch (or leaving a drill-down via its current tab), put the page at
  // zero in the same click task as app.js's synchronous render. The browser
  // therefore never paints the destination at the previous screen's offset.
  pendingTab = toTab;
  pendingSince = performance.now();
  clearTimeout(arrivalTimer);
  arrivalAnimation?.cancel();
  window.scrollTo({ top: 0, behavior: 'auto' });

  // If an enhancer ever fails, never leave a transition pending indefinitely.
  arrivalTimer = setTimeout(() => finishArrival(true), 180);
}, true);

const observer = new MutationObserver(() => {
  fixVisibleRenderArtifacts();
  if (!pendingTab) return;
  if (performance.now() - pendingSince > 180) finishArrival(true);
  else queueMicrotask(() => finishArrival(false));
});
if (screen) observer.observe(screen, { childList: true, subtree: true, attributes:true, attributeFilter:['class'] });

fixVisibleRenderArtifacts();
