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
  if (!document.querySelector('script[data-kp-brand-pass3]')) {
    const script = document.createElement('script');
    script.src = '/brand-pass3.js?v=1&studio=20260906q';
    script.defer = true;
    script.dataset.kpBrandPass3 = '1';
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

  function syncScreen() {
    const tab = document.querySelector('.nav-item.active')?.dataset?.tab || '';
    if (tab) body.dataset.kpScreen = tab;
    installThemeButton();
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
  if (screen) new MutationObserver(syncScreen).observe(screen, { childList: true });
  window.addEventListener('pageshow', syncScreen);
})();
