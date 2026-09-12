(() => {
  // Core boot guard v4.
  // The Live tab has a legacy renderer underneath the newer Live Table UI.
  // On a cold entry that legacy path can briefly paint its old Fixtures-first
  // screen before the newer hierarchy script switches the tab to Live Table.
  // This guard runs before app.js/live-reference-table.js and makes that stale
  // intermediate state impossible to paint.
  window.__kpCoreBootGuardVersion = 4;

  const screen = document.querySelector('#screen');
  if (!screen) return;

  const style = document.createElement('style');
  style.id = 'kp-live-first-paint-style';
  style.textContent = `
    /* The old three-tab strip is no longer part of the product UI. */
    body.kp-native-live .kp-live-subnav{display:none!important}

    /* During a Live cold-entry, never expose the obsolete fixtures-first
       renderer. Keep the surface neutral until the real table is mounted. */
    body.kp-live-first-paint #screen{visibility:hidden!important}
    body.kp-live-first-paint #app{background:#f7f3ea!important}
    html[data-kp-theme="dark"] body.kp-live-first-paint #app{background:#0d100f!important}
  `;
  document.head.appendChild(style);

  const activeTab = () => document.querySelector('.bottom-nav .nav-item.active')?.dataset?.tab || '';

  function armLiveFirstPaint(){
    document.body.classList.add('kp-live-first-paint');
  }

  function settleLiveFirstPaint(){
    if (activeTab() !== 'live') {
      document.body.classList.remove('kp-live-first-paint');
      return;
    }

    const root = screen.querySelector('.kp-live-screen');
    const table = screen.querySelector('[data-live-subtab="table"]');
    if (!root || !table) return;

    // live-reference-table.js historically starts at fixtures. Flip its own
    // native state to table inside the same mutation turn, before Safari gets
    // a chance to paint the obsolete page.
    if (!table.classList.contains('active')) {
      table.click();
      return;
    }

    // Table is now the native source-of-truth; the hierarchy script can add
    // its action buttons without the user ever seeing the retired screen.
    document.body.classList.remove('kp-live-first-paint');
  }

  // Capture the Live tap before any of the older navigation listeners run.
  document.addEventListener('pointerdown', e => {
    const live = e.target.closest?.('.bottom-nav .nav-item[data-tab="live"]');
    if (live) armLiveFirstPaint();
  }, true);

  document.addEventListener('click', e => {
    const nav = e.target.closest?.('.bottom-nav .nav-item[data-tab]');
    if (!nav) return;
    if (nav.dataset.tab === 'live') armLiveFirstPaint();
    else document.body.classList.remove('kp-live-first-paint');
    queueMicrotask(settleLiveFirstPaint);
  }, true);

  const observer = new MutationObserver(() => queueMicrotask(settleLiveFirstPaint));
  observer.observe(screen, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});

  // Covers app resume / PWA restore directly onto Live.
  if (activeTab() === 'live') {
    armLiveFirstPaint();
    queueMicrotask(settleLiveFirstPaint);
  }
})();
