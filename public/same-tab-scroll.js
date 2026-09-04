const ROUTE_PREFIX = 'kp-route-v1:';
const SCROLL_PREFIX = 'kp-scroll-v1:';
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
let smoothTimer = 0;

// Re-tapping the tab that is already active should behave like a native app:
// keep normal navigation untouched, but glide the current screen back to top.
// This intentionally does not prevent, stop, hide, or intercept navigation.
document.addEventListener('click', event => {
  const button = event.target.closest('.nav-item[data-tab]');
  if (!button || !button.classList.contains('active')) return;

  const tab = button.dataset.tab;
  try {
    sessionStorage.removeItem(`${ROUTE_PREFIX}${tab}`);
    sessionStorage.setItem(`${SCROLL_PREFIX}${tab}:root`, '0');
  } catch {}

  clearTimeout(smoothTimer);
  // smooth-runtime may finish one saved-position restore over the next two
  // animation frames. Start the glide just after that so it cannot be cancelled.
  smoothTimer = setTimeout(() => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, 70);
}, true);
