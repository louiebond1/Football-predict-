const THEME_KEY = 'kp-theme-v1';
const root = document.documentElement;
const meta = document.querySelector('meta[name="theme-color"]');

function preferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function themeIcon(theme) {
  return theme === 'dark'
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.5 12h2M19.5 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.6A8.2 8.2 0 0 1 9.4 3.5a8.2 8.2 0 1 0 11.1 11.1Z"/></svg>';
}

function paint(theme, persist = false) {
  const next = theme === 'dark' ? 'dark' : 'light';
  root.dataset.theme = next;
  root.style.colorScheme = next;
  if (persist) localStorage.setItem(THEME_KEY, next);
  if (meta) meta.content = next === 'dark' ? '#0b0d10' : '#f3f0e8';
  const button = document.querySelector('#themeBtn');
  if (button) {
    button.innerHTML = themeIcon(next);
    button.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    button.title = next === 'dark' ? 'Light mode' : 'Dark mode';
  }
}

paint(preferredTheme());

document.querySelector('#themeBtn')?.addEventListener('click', () => {
  paint(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
});

window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', event => {
  if (!localStorage.getItem(THEME_KEY)) paint(event.matches ? 'dark' : 'light');
});
