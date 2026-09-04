const ROUTE_PREFIX = 'kp-route-v1:';
const SCROLL_PREFIX = 'kp-scroll-v1:';

function forceTop() {
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function resetTab(tab) {
  if (!tab) return;
  try {
    sessionStorage.removeItem(`${ROUTE_PREFIX}${tab}`);
    sessionStorage.setItem(`${SCROLL_PREFIX}${tab}:root`, '0');
  } catch {}

  forceTop();
  requestAnimationFrame(() => requestAnimationFrame(forceTop));
  [0, 60, 180, 450, 900].forEach(ms => setTimeout(forceTop, ms));
}

document.addEventListener('pointerdown', event => {
  const nav = event.target.closest('.nav-item[data-tab]');
  if (!nav) return;
  resetTab(nav.dataset.tab);
}, true);

document.addEventListener('click', event => {
  const nav = event.target.closest('.nav-item[data-tab]');
  if (!nav) return;
  resetTab(nav.dataset.tab);
}, true);
