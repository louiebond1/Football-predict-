(() => {
  const KEY = 'kp-active-group-v1';
  let applyingSavedSelection = false;

  function readSessionGroup() {
    try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
  }

  function readDurableGroup() {
    try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
  }

  function readStoredGroup() {
    return readSessionGroup() || readDurableGroup();
  }

  function storeSession(groupId) {
    if (!groupId) return;
    try { sessionStorage.setItem(KEY, groupId); } catch {}
  }

  function storeExplicitChoice(groupId) {
    if (!groupId) return;
    // sessionStorage is tab-local; localStorage is the durable preference for
    // future tabs/PWA relaunches. Only an explicit user switch should update
    // the durable value, otherwise two open tabs can overwrite each other's
    // preference on every MutationObserver/live-refresh pass.
    storeSession(groupId);
    try { localStorage.setItem(KEY, groupId); } catch {}
  }

  function clearSessionGroup() {
    try { sessionStorage.removeItem(KEY); } catch {}
  }

  function clearDurableGroup() {
    try { localStorage.removeItem(KEY); } catch {}
  }

  function restoreGroupSelection() {
    const select = document.querySelector('#groupSwitch');
    if (!select) return;

    const sessionValue = readSessionGroup();
    const durableValue = readDurableGroup();
    const stored = sessionValue || durableValue;

    if (!stored) {
      // First ever/default selection: establish both tab-local and durable state.
      storeExplicitChoice(select.value);
      return;
    }

    const isStillAvailable = [...select.options].some(option => option.value === stored);
    if (!isStillAvailable) {
      if (sessionValue) clearSessionGroup();
      if (!sessionValue && durableValue) clearDurableGroup();
      storeExplicitChoice(select.value);
      return;
    }

    // A new tab inherits the durable choice into its own sessionStorage. An
    // existing tab keeps its own session choice without rewriting localStorage,
    // so independent tabs cannot fight over the durable preference during polls.
    if (!sessionValue) storeSession(stored);
    if (select.value === stored || applyingSavedSelection) return;

    // app.js owns the actual group state. Driving its existing change handler
    // avoids a second data-loading implementation and keeps this patch scoped.
    applyingSavedSelection = true;
    select.value = stored;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    queueMicrotask(() => { applyingSavedSelection = false; });
  }

  // Capture an explicit user choice before app.js begins its async group reload.
  document.addEventListener('change', event => {
    const target = event.target;
    if (target?.id !== 'groupSwitch' || applyingSavedSelection) return;
    storeExplicitChoice(target.value);
  }, true);

  const root = document.querySelector('#screen') || document.body;
  const observer = new MutationObserver(() => queueMicrotask(restoreGroupSelection));
  observer.observe(root, { childList: true, subtree: true });

  window.addEventListener('pageshow', restoreGroupSelection);
  restoreGroupSelection();
})();

// History v2 is deliberately loaded as an isolated inline enhancement. It does
// not touch app boot, global navigation, or create any page-covering overlay.
(() => {
  if (!document.querySelector('link[data-kp-history-v2]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/history-inline-v2.css?v=2';
    link.dataset.kpHistoryV2 = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-kp-history-v2]')) {
    const script = document.createElement('script');
    script.src = '/history-inline-v2.js?v=2';
    script.defer = true;
    script.dataset.kpHistoryV2 = '1';
    document.head.appendChild(script);
  }
})();
