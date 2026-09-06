(() => {
  const KEY = 'kp-active-group-v1';
  let applyingSavedSelection = false;

  function readStoredGroup() {
    try {
      const sessionValue = sessionStorage.getItem(KEY);
      if (sessionValue) return sessionValue;
    } catch {}
    try {
      return localStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  }

  function storeGroup(groupId) {
    if (!groupId) return;
    try { sessionStorage.setItem(KEY, groupId); } catch {}
    try { localStorage.setItem(KEY, groupId); } catch {}
  }

  function clearStoredGroup() {
    try { sessionStorage.removeItem(KEY); } catch {}
    try { localStorage.removeItem(KEY); } catch {}
  }

  function restoreGroupSelection() {
    const select = document.querySelector('#groupSwitch');
    if (!select) return;

    const stored = readStoredGroup();
    if (!stored) {
      storeGroup(select.value);
      return;
    }

    const isStillAvailable = [...select.options].some(option => option.value === stored);
    if (!isStillAvailable) {
      clearStoredGroup();
      storeGroup(select.value);
      return;
    }

    // Keep both storage scopes in sync so a normal reload and a later PWA
    // relaunch both return to the same group.
    storeGroup(stored);
    if (select.value === stored || applyingSavedSelection) return;

    // app.js owns the actual group state. Driving its existing change handler
    // avoids a second data-loading implementation and keeps this patch scoped.
    applyingSavedSelection = true;
    select.value = stored;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    queueMicrotask(() => { applyingSavedSelection = false; });
  }

  // Capture the choice before app.js begins its async group reload.
  document.addEventListener('change', event => {
    const target = event.target;
    if (target?.id !== 'groupSwitch' || applyingSavedSelection) return;
    storeGroup(target.value);
  }, true);

  const root = document.querySelector('#screen') || document.body;
  const observer = new MutationObserver(() => queueMicrotask(restoreGroupSelection));
  observer.observe(root, { childList: true, subtree: true });

  window.addEventListener('pageshow', restoreGroupSelection);
  restoreGroupSelection();
})();
