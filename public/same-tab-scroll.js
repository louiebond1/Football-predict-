const ROUTE_PREFIX = 'kp-route-v1:';
const SCROLL_PREFIX = 'kp-scroll-v1:';
const screen = document.querySelector('#screen');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
let pendingTab = '';
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
function finishArrival() {
  if (!screen || !pendingTab || currentTab() !== pendingTab) return;
  pendingTab = '';
  clearTimeout(arrivalTimer);
  arrivalAnimation?.cancel();
  if (reduceMotion || typeof screen.animate !== 'function') return;
  arrivalAnimation = screen.animate([
    { opacity: 0.985, transform: 'translateY(1px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 90, easing: 'cubic-bezier(.22,.61,.36,1)' });
}

document.addEventListener('click', event => {
  const nav = event.target.closest('.nav-item[data-tab]');
  if (!nav) return;
  const toTab = nav.dataset.tab;
  const sameTab = toTab === currentTab();
  const hasSubroute = Boolean(currentRoute(toTab));
  clearDestinationState(toTab);

  // Re-tapping Live is intentionally allowed through to app.js so the Live
  // controller can return a fixtures/picks drill-in directly to its table.
  if (sameTab && !hasSubroute && toTab !== 'live') {
    event.preventDefault();
    event.stopImmediatePropagation();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    return;
  }

  pendingTab = toTab;
  clearTimeout(arrivalTimer);
  arrivalAnimation?.cancel();
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  arrivalTimer = setTimeout(finishArrival, 250);
}, true);

const observer = new MutationObserver(() => {
  const head = screen?.querySelector('.kp3-fixtures-card .card-head');
  if (head?.querySelector('.kp3-count')) head.querySelector(':scope > .muted')?.remove();
  if (pendingTab && currentTab() === pendingTab) queueMicrotask(finishArrival);
});
if (screen) observer.observe(screen, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
