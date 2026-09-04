const ROUTE_PREFIX = 'kp-route-v1:';
const SCROLL_PREFIX = 'kp-scroll-v1:';
const screen = document.querySelector('#screen');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
let transitionToken = 0;
let arrivalAnimation = null;

function clearSavedTabState(tab) {
  if (!tab) return;
  try {
    sessionStorage.removeItem(`${ROUTE_PREFIX}${tab}`);
    sessionStorage.setItem(`${SCROLL_PREFIX}${tab}:root`, '0');
  } catch {}
}

function smoothReturnToTop() {
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}

function beginTabArrival(tab) {
  clearSavedTabState(tab);
  const token = ++transitionToken;

  if (!screen || reduceMotion) {
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    return;
  }

  arrivalAnimation?.cancel();

  // Hide the old scrolled content for the single render frame so users never
  // see the new tab briefly painted at the previous tab's scroll position.
  screen.style.opacity = '0';
  screen.style.transform = 'translateY(8px)';
  screen.style.pointerEvents = 'none';

  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (token !== transitionToken) return;
    window.scrollTo({ top: 0, behavior: 'auto' });

    screen.style.opacity = '';
    screen.style.transform = '';
    screen.style.pointerEvents = '';

    arrivalAnimation = screen.animate([
      { opacity: 0.78, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], {
      duration: 220,
      easing: 'cubic-bezier(.22,.61,.36,1)'
    });
  }));
}

document.addEventListener('click', event => {
  const nav = event.target.closest('.nav-item[data-tab]');
  if (!nav) return;

  const tab = nav.dataset.tab;
  const sameTab = nav.classList.contains('active');
  let savedRoute = '';
  try { savedRoute = sessionStorage.getItem(`${ROUTE_PREFIX}${tab}`) || ''; } catch {}

  // Re-tapping the current top-level tab should feel like a native app:
  // smoothly glide back to the top without forcing a full re-render.
  if (sameTab && !savedRoute) {
    clearSavedTabState(tab);
    event.preventDefault();
    event.stopPropagation();
    smoothReturnToTop();
    return;
  }

  // Switching tabs (or leaving a sub-page via its bottom tab) renders the new
  // root at the top, then gives it a short eased arrival instead of a flash.
  beginTabArrival(tab);
}, true);
