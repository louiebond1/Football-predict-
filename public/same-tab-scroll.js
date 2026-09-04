const ROUTE_PREFIX = 'kp-route-v1:';
const SCROLL_PREFIX = 'kp-scroll-v1:';
const screen = document.querySelector('#screen');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

let running = false;
let targetButton = null;
let bypass = false;
let transitionToken = 0;
let exitAnimation = null;
let arrivalAnimation = null;

function resetTabRoot(tab) {
  if (!tab) return;
  try {
    sessionStorage.removeItem(`${ROUTE_PREFIX}${tab}`);
    sessionStorage.setItem(`${SCROLL_PREFIX}${tab}:root`, '0');
  } catch {}
}

function cancelAnimation(animation) {
  try { animation?.cancel(); } catch {}
}

function animateArrival() {
  cancelAnimation(exitAnimation);
  exitAnimation = null;
  cancelAnimation(arrivalAnimation);
  arrivalAnimation = null;

  if (reduceMotion || !screen || typeof screen.animate !== 'function') return;
  arrivalAnimation = screen.animate([
    { opacity: 0.42, transform: 'translate3d(0, 12px, 0)' },
    { opacity: 1, transform: 'translate3d(0, 0, 0)' }
  ], {
    duration: 175,
    easing: 'cubic-bezier(.22,.61,.36,1)'
  });
}

function performSwitch(token) {
  if (token !== transitionToken) return;

  const target = targetButton;
  targetButton = null;
  const currentButton = document.querySelector('.nav-item.active');
  const currentTab = currentButton?.dataset.tab || '';
  const destinationTab = target?.dataset.tab || '';
  const sameTab = Boolean(target && currentButton === target);

  resetTabRoot(currentTab);
  resetTabRoot(destinationTab);

  // Reset the actual document position only while the old screen is almost
  // faded out. Safari no longer has to animate thousands of scroll pixels.
  window.scrollTo({ top: 0, behavior: 'auto' });

  if (target && !sameTab) {
    bypass = true;
    try {
      // Hand the real navigation back to KickPot's existing app.js handler.
      target.click();
    } finally {
      bypass = false;
    }
  }

  running = false;
  requestAnimationFrame(animateArrival);
}

async function startTransition() {
  if (running) return;
  running = true;
  const token = ++transitionToken;

  cancelAnimation(arrivalAnimation);
  arrivalAnimation = null;

  if (reduceMotion || !screen || typeof screen.animate !== 'function') {
    performSwitch(token);
    return;
  }

  // Animate the already-painted viewport on the compositor instead of driving
  // window.scrollY frame-by-frame. This is substantially smoother in iOS PWAs.
  exitAnimation = screen.animate([
    { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    { opacity: 0.18, transform: 'translate3d(0, -14px, 0)' }
  ], {
    duration: 125,
    easing: 'cubic-bezier(.4,0,.6,1)',
    fill: 'forwards'
  });

  // Never let a Web Animations quirk trap navigation. The timeout guarantees
  // the tab switch completes even if Safari fails to resolve .finished.
  await Promise.race([
    exitAnimation.finished.catch(() => null),
    new Promise(resolve => setTimeout(resolve, 180))
  ]);
  performSwitch(token);
}

window.addEventListener('click', event => {
  if (bypass) return;
  const rawTarget = event.target;
  const button = rawTarget instanceof Element ? rawTarget.closest('.nav-item[data-tab]') : null;
  if (!button) return;

  const sameTab = button.classList.contains('active');
  const atTop = window.scrollY <= 2;

  // Re-tapping the active tab while already at the top needs no animation.
  if (sameTab && atTop && !running) {
    cancelAnimation(arrivalAnimation);
    arrivalAnimation = null;
    return;
  }

  // During one short transition, repeated taps merely replace the destination.
  // There is still only one animation and one eventual navigation action.
  targetButton = button;
  event.preventDefault();
  event.stopPropagation();
  resetTabRoot(button.dataset.tab);
  startTransition();
}, true);
