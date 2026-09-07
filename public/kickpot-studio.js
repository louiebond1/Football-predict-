(() => {
  const STORAGE_KEY = 'kickpot-theme-v1';
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;
  body.classList.add('kp-studio');

  // Production iPhone fixes are isolated so they can be removed cleanly if needed.
  if (!document.querySelector('link[data-kp-iphone-hotfix]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/kickpot-iphone-hotfix.css?v=2';
    link.dataset.kpIphoneHotfix = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-kp-iphone-hotfix]')) {
    const script = document.createElement('script');
    script.src = '/kickpot-iphone-hotfix.js?v=2';
    script.defer = true;
    script.dataset.kpIphoneHotfix = '1';
    document.head.appendChild(script);
  }

  // Pass 3 is a deliberately isolated personality layer. Load it after the
  // production skin so it can remove the last generic/stock visual treatments
  // without touching game logic or screen hierarchy.
  if (!document.querySelector('link[data-kp-brand-pass3]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/brand-pass3.css?v=1&studio=20260906q';
    link.dataset.kpBrandPass3 = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('link[data-kp-brand-pass3-hotfix]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/brand-pass3-hotfix.css?v=1&studio=20260906r';
    link.dataset.kpBrandPass3Hotfix = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('link[data-kp-brand-pass3-avatar-v2]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/brand-pass3-avatar-v2.css?v=1&studio=20260906s';
    link.dataset.kpBrandPass3AvatarV2 = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-kp-brand-pass3]')) {
    const script = document.createElement('script');
    script.src = '/brand-pass3.js?v=2&studio=20260906s';
    script.defer = true;
    script.dataset.kpBrandPass3 = '1';
    document.head.appendChild(script);
  }

  // Matchday follows the supplied iPhone reference.
  if (!document.querySelector('link[data-kp-reference-matchday]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/reference-matchday-v1.css?v=1&studio=20260906t';
    link.dataset.kpReferenceMatchday = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-kp-reference-matchday]')) {
    const script = document.createElement('script');
    script.src = '/reference-matchday-v1.js?v=1&studio=20260906t';
    script.defer = true;
    script.dataset.kpReferenceMatchday = '1';
    document.head.appendChild(script);
  }

  // Live now uses the same reference language as Matchday: quiet crown header,
  // editorial type, flat standings and gold/neutral hierarchy.
  if (!document.querySelector('link[data-kp-reference-live]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/reference-live-v1.css?v=1&studio=20260906w';
    link.dataset.kpReferenceLive = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-kp-reference-live]')) {
    const script = document.createElement('script');
    script.src = '/reference-live-v1.js?v=1&studio=20260906w';
    script.defer = true;
    script.dataset.kpReferenceLive = '1';
    document.head.appendChild(script);
  }

  // The Live fixture block uses the supplied compact two-row card treatment.
  if (!document.querySelector('link[data-kp-reference-live-fixtures]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/reference-live-fixtures-v2.css?v=1&studio=20260906x';
    link.dataset.kpReferenceLiveFixtures = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-kp-reference-live-fixtures]')) {
    const script = document.createElement('script');
    script.src = '/reference-live-fixtures-v2.js?v=1&studio=20260906x';
    script.defer = true;
    script.dataset.kpReferenceLiveFixtures = '1';
    document.head.appendChild(script);
  }

  function preferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(value) {
    root.dataset.kpTheme = value;
    localStorage.setItem(STORAGE_KEY, value);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = value === 'light' ? '#f4f0e6' : '#06130d';
    const btn = document.querySelector('#kpThemeToggle');
    if (btn) {
      btn.textContent = value === 'dark' ? '☼' : '◐';
      btn.setAttribute('aria-label', value === 'dark' ? 'Use light mode' : 'Use dark mode');
    }
  }

  function installThemeButton() {
    const actions = document.querySelector('.topbar-actions');
    if (!actions || document.querySelector('#kpThemeToggle')) return;
    const btn = document.createElement('button');
    btn.id = 'kpThemeToggle';
    btn.type = 'button';
    btn.className = 'icon-btn';
    btn.addEventListener('click', () => applyTheme(root.dataset.kpTheme === 'dark' ? 'light' : 'dark'));
    const bell = document.querySelector('#bellBtn');
    actions.insertBefore(btn, bell || actions.firstChild);
    applyTheme(root.dataset.kpTheme || preferredTheme());
  }

  function syncHistoryBrowserHook() {
    if (document.querySelector('.nav-item[data-tab="history"]')?.classList.contains('active') !== true) return;
    const titles = [...document.querySelectorAll('#screen .card-title')];
    const title = titles.find(el => /Past (?:Matchdays|Gameweeks)/i.test(el.textContent || ''));
    if (!title) return;
    const mounted = !!document.querySelector('#kpHistoryBrowser');
    if (!mounted && /Past Matchdays/i.test(title.textContent || '')) {
      // history-browser-v1 originally targets the app's internal "Past Gameweeks"
      // heading. The polished skin renames it to "Past Matchdays", so temporarily
      // expose the internal label long enough for the enhancer to mount.
      title.textContent = 'Past Gameweeks';
    } else if (mounted && /Past Gameweeks/i.test(title.textContent || '')) {
      title.textContent = 'Past Matchdays';
    }
  }

  function syncScreen() {
    const tab = document.querySelector('.nav-item.active')?.dataset?.tab || '';
    if (tab) body.dataset.kpScreen = tab;
    installThemeButton();
    syncHistoryBrowserHook();
  }

  applyTheme(preferredTheme());
  installThemeButton();
  syncScreen();

  const nav = document.querySelector('.bottom-nav');
  if (nav) {
    new MutationObserver(syncScreen).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    nav.addEventListener('click', () => queueMicrotask(syncScreen), { passive: true });
  }

  const screen = document.querySelector('#screen');
  if (screen) new MutationObserver(syncScreen).observe(screen, { childList: true, subtree: true });
  window.addEventListener('pageshow', syncScreen);
})();
