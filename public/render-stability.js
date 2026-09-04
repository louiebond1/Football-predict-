const screen = document.querySelector('#screen');
const GROUP_KEY = 'kp-active-group-v1';

// Remember the raw app render for each tab. Enhancer scripts are allowed to
// rearrange the DOM afterwards; identical background renders should not tear
// that finished UI down and rebuild it again.
const screenSignatures = new Map();
const delayedContent = new Map();
let userActionUntil = 0;

function activeTab() {
  return document.querySelector('.nav-item.active')?.dataset?.tab || 'gw';
}

function activeGroupKey() {
  return document.querySelector('#groupSwitch')?.value
    || sessionStorage.getItem(GROUP_KEY)
    || 'default';
}

function normaliseScreenMarkup(html, tab) {
  let value = String(html);
  // The Live hero clock is display-only. A minute tick must never cause the
  // entire Live DOM to be destroyed and rebuilt.
  if (tab === 'live') {
    value = value.replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\d{2}:\d{2}\b/g, 'LIVE_CLOCK');
  }
  return value;
}

function isUserRouteAction(target) {
  return Boolean(target?.closest?.('.nav-item,.kp3-nav-row,.kp3-back,.kp-admin-entry'));
}

document.addEventListener('pointerdown', event => {
  if (isUserRouteAction(event.target)) userActionUntil = performance.now() + 1200;
}, true);

// smooth-runtime installs the first #screen innerHTML wrapper. Wrap that setter
// rather than replacing its behaviour, and add all-tab identical-render dedupe.
const upstream = screen ? Object.getOwnPropertyDescriptor(screen, 'innerHTML') : null;
if (screen && upstream?.get && upstream?.set) {
  Object.defineProperty(screen, 'innerHTML', {
    configurable: true,
    get() { return upstream.get.call(this); },
    set(value) {
      const tab = activeTab();
      const signature = normaliseScreenMarkup(value, tab);
      const navigating = performance.now() < userActionUntil;

      if (!navigating && screenSignatures.get(tab) === signature) return;
      screenSignatures.set(tab, signature);
      upstream.set.call(this, value);
    }
  });
}

const DELAYED_IDS = ['seasonStatsCard', 'awardsCard', 'rivalryCard'];

function delayedKey(id) {
  return `${activeGroupKey()}:${id}`;
}

function isPlaceholder(node) {
  const text = node?.textContent || '';
  return /\bLoading(?:…|\.\.\.)/i.test(text);
}

function restoreOrRememberDelayedContent() {
  if (!screen) return;

  DELAYED_IDS.forEach(id => {
    const node = screen.querySelector(`#${id}`);
    if (!node) return;

    const key = delayedKey(id);
    const cached = delayedContent.get(key);

    // app.js recreates these cards with a Loading placeholder on each visit.
    // Restore the last finished version in the same microtask, before paint.
    if (isPlaceholder(node) && cached) {
      if (node.innerHTML !== cached) node.innerHTML = cached;
      return;
    }

    // Once real data has arrived, remember the finished markup. Only replace
    // the cache if the component genuinely changed.
    if (!isPlaceholder(node) && node.innerHTML && cached !== node.innerHTML) {
      delayedContent.set(key, node.innerHTML);
    }
  });
}

const observer = new MutationObserver(() => queueMicrotask(restoreOrRememberDelayedContent));
if (screen) observer.observe(screen, { childList: true, subtree: true });

// A group change must always be allowed to render even if two groups happen to
// produce identical visible markup. Cache entries remain namespaced per group.
document.addEventListener('change', event => {
  if (event.target?.id === 'groupSwitch') {
    userActionUntil = performance.now() + 1200;
    queueMicrotask(restoreOrRememberDelayedContent);
  }
}, true);

queueMicrotask(restoreOrRememberDelayedContent);
