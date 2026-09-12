(() => {
  const STORAGE_KEY = 'kickpot-theme-v1';
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;
  body.classList.add('kp-studio');

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
  if (!document.querySelector('script[data-kp-matchday-hero-img]')) {
    const script = document.createElement('script');
    script.src = '/matchday-hero-img.js?v=2&studio=20260908final';
    script.defer = true;
    script.dataset.kpMatchdayHeroImg = '1';
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
