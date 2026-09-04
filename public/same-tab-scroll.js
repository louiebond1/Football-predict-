const ROUTE_PREFIX = 'kp-route-v1:';
const SCROLL_PREFIX = 'kp-scroll-v1:';
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

let running = false;
let targetButton = null;
let bypass = false;
let raf = 0;

function resetTabRoot(tab) {
  if (!tab) return;
  try {
    sessionStorage.removeItem(`${ROUTE_PREFIX}${tab}`);
    sessionStorage.setItem(`${SCROLL_PREFIX}${tab}:root`, '0');
  } catch {}
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function finishTransition() {
  const target = targetButton;
  targetButton = null;
  running = false;
  raf = 0;

  const current = document.querySelector('.nav-item.active')?.dataset.tab || '';
  const destination = target?.dataset.tab || '';
  resetTabRoot(current);
  resetTabRoot(destination);
  window.scrollTo({ top: 0, behavior: 'auto' });

  if (!target) return;
  bypass = true;
  try {
    // Let the existing KickPot navigation handler perform the actual switch.
    // By this point the viewport is already at the top, so there is no jump.
    target.click();
  } finally {
    bypass = false;
  }
}

function startTransition() {
  if (running) return;
  running = true;

  const startY = Math.max(0, window.scrollY);
  if (reduceMotion || startY <= 2) {
    finishTransition();
    return;
  }

  const startAt = performance.now();
  const duration = Math.min(320, Math.max(190, 165 + startY * 0.07));

  const step = now => {
    const progress = Math.min(1, (now - startAt) / duration);
    const eased = easeOutCubic(progress);
    const nextY = Math.max(0, Math.round(startY * (1 - eased)));
    window.scrollTo({ top: nextY, behavior: 'auto' });

    if (progress < 1) {
      raf = requestAnimationFrame(step);
      return;
    }
    finishTransition();
  };

  raf = requestAnimationFrame(step);
}

// Intercept only bottom-nav clicks while the page is actually scrolled down.
// The current screen glides to the top first; then the existing app navigation
// runs normally. Repeated taps during the glide only update the final target.
window.addEventListener('click', event => {
  if (bypass) return;
  const target = event.target;
  const button = target instanceof Element ? target.closest('.nav-item[data-tab]') : null;
  if (!button) return;

  const y = Math.max(0, window.scrollY);
  if (y <= 2 && !running) return;

  targetButton = button;
  event.preventDefault();
  event.stopPropagation();

  resetTabRoot(button.dataset.tab);
  startTransition();
}, true);
