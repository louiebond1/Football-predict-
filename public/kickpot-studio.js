(() => {
  const STORAGE_KEY = 'kickpot-theme-v1';
  const photos = [
    'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=82',
    'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=82',
    'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=82',
    'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1200&q=82'
  ];

  const root = document.documentElement;
  const body = document.body;
  if (!body) return;
  body.classList.add('kp-studio');

  function preferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(value) {
    root.dataset.kpTheme = value;
    localStorage.setItem(STORAGE_KEY, value);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = value === 'light' ? '#f5f1e8' : '#0a0d12';
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

  function photoSlot() {
    return Math.floor(Date.now() / 1800000);
  }

  let lastPhotoSlot = -1;
  function applyPhoto() {
    const slot = photoSlot();
    if (slot === lastPhotoSlot) return;
    lastPhotoSlot = slot;
    const current = photos[slot % photos.length];
    const next = photos[(slot + 1) % photos.length];
    root.style.setProperty('--kp-photo', `url("${current}")`);
    const pre = new Image();
    pre.decoding = 'async';
    pre.src = next;
  }

  function syncScreen() {
    const tab = document.querySelector('.nav-item.active')?.dataset?.tab || '';
    if (tab) body.dataset.kpScreen = tab;
    installThemeButton();
    applyPhoto();
  }

  applyTheme(preferredTheme());
  installThemeButton();
  syncScreen();
  setInterval(applyPhoto, 30000);

  const nav = document.querySelector('.bottom-nav');
  if (nav) {
    new MutationObserver(syncScreen).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    nav.addEventListener('click', () => queueMicrotask(syncScreen), { passive: true });
  }

  const screen = document.querySelector('#screen');
  if (screen) new MutationObserver(syncScreen).observe(screen, { childList: true });
  window.addEventListener('pageshow', syncScreen);
})();