(() => {
  let armed = false;
  let lastReload = 0;

  function watchStatus(status) {
    if (!status || status.dataset.kpModeWatch === '1') return;
    status.dataset.kpModeWatch = '1';
    const observer = new MutationObserver(() => {
      if (!armed || !/Saved\s*✓/i.test(status.textContent || '')) return;
      const now = Date.now();
      if (now - lastReload < 1500) return;
      lastReload = now;
      armed = false;
      // The core app keeps group/payment state in module-local memory. Until that
      // state store is consolidated, refresh immediately after a play-mode write
      // so Matchday cannot retain a stale payment gate.
      setTimeout(() => location.reload(), 360);
    });
    observer.observe(status, { childList: true, characterData: true, subtree: true });
  }

  document.addEventListener('click', event => {
    if (!event.target.closest('.kp-mode-save')) return;
    armed = true;
    watchStatus(document.querySelector('.kp-mode-status'));
  }, true);

  const root = document.querySelector('#screen');
  if (root) new MutationObserver(() => watchStatus(document.querySelector('.kp-mode-status')))
    .observe(root, { childList: true, subtree: true });
})();
