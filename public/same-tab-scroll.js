const ROUTE_PREFIX = 'kp-route-v1:';
const SCROLL_PREFIX = 'kp-scroll-v1:';
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

let running = false;
let targetButton = null;
let bypass = false;
let waitFrame = 0;
let waitToken = 0;

function resetTabRoot(tab) {
  if (!tab) return;
  try {
    sessionStorage.removeItem(`${ROUTE_PREFIX}${tab}`);
    sessionStorage.setItem(`${SCROLL_PREFIX}${tab}:root`, '0');
  } catch {}
}

function finishNavigation(token) {
  if (token !== waitToken) return;
  cancelAnimationFrame(waitFrame);
  waitFrame = 0;

  const target = targetButton;
  targetButton = null;
  running = false;

  const currentButton = document.querySelector('.nav-item.active');
  const currentTab = currentButton?.dataset.tab || '';
  const destinationTab = target?.dataset.tab || '';

  resetTabRoot(currentTab);
  resetTabRoot(destinationTab);
  window.scrollTo({ top: 0, behavior: 'auto' });

  // Re-tapping the active tab is just a return-to-top action. Do not rebuild it.
  if (!target || target === currentButton) return;

  // Hand the actual tab change back to KickPot's existing navigation handler.
  bypass = true;
  try {
    target.click();
  } finally {
    bypass = false;
  }
}

function waitForNativeScroll(token, startedAt) {
  if (token !== waitToken) return;

  if (window.scrollY <= 2) {
    finishNavigation(token);
    return;
  }

  // Native smooth scrolling is controlled by Safari. We only observe it; we do
  // not write scrollY on every frame. The timeout is a fail-safe, not an animation.
  if (performance.now() - startedAt > 1200) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    finishNavigation(token);
    return;
  }

  waitFrame = requestAnimationFrame(() => waitForNativeScroll(token, startedAt));
}

function startNativeReturnToTop() {
  if (running) return;
  running = true;
  const token = ++waitToken;

  if (reduceMotion || window.scrollY <= 2) {
    finishNavigation(token);
    return;
  }

  // Let iOS/Safari perform the actual scrolling. This produces the visible
  // glide through the current page instead of fading and teleporting to the top.
  window.scrollTo({ top: 0, behavior: 'smooth' });
  waitFrame = requestAnimationFrame(() => waitForNativeScroll(token, performance.now()));
}

// Only intercept a bottom-tab tap when there is a real scroll-to-top to perform.
// At the top, different-tab navigation is left completely untouched.
window.addEventListener('click', event => {
  if (bypass) return;

  const rawTarget = event.target;
  const button = rawTarget instanceof Element ? rawTarget.closest('.nav-item[data-tab]') : null;
  if (!button) return;

  const sameTab = button.classList.contains('active');
  const atTop = window.scrollY <= 2;

  // Avoid an unnecessary full re-render when the active tab is tapped at top.
  if (sameTab && atTop && !running) {
    event.preventDefault();
    event.stopPropagation();
    resetTabRoot(button.dataset.tab);
    return;
  }

  // When already at the top, switching tabs uses the original app navigation.
  if (atTop && !running) return;

  // While Safari is gliding upward, repeated taps only change the final target.
  targetButton = button;
  event.preventDefault();
  event.stopPropagation();
  resetTabRoot(button.dataset.tab);
  startNativeReturnToTop();
}, true);
