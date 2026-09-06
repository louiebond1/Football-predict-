(() => {
  let reloading = false;
  let lastCheck = 0;

  function visibleRound() {
    const active = document.querySelector('.nav-item.active')?.dataset?.tab;
    if (active !== 'gw') return null;
    const title = document.querySelector('#screen .kp3-page-hero h1, #screen .hero h1')?.textContent || '';
    const m = title.match(/(?:Matchday|Gameweek)\s+(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  async function check(force = false) {
    if (reloading || document.hidden) return;
    const now = Date.now();
    if (!force && now - lastCheck < 10000) return;
    lastCheck = now;
    const shown = visibleRound();
    if (!shown) return;
    try {
      const res = await fetch(`/api/football/current-round?_=${now}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const active = Number(data?.round);
      if (!Number.isFinite(active) || active === shown) return;

      const key = `kickpot-round-reload:${shown}->${active}`;
      const previous = sessionStorage.getItem(key);
      if (previous && now - Number(previous) < 30000) return;
      sessionStorage.setItem(key, String(now));
      reloading = true;
      location.reload();
    } catch {}
  }

  setInterval(() => check(false), 12000);
  window.addEventListener('focus', () => check(true));
  window.addEventListener('pageshow', () => check(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(true); });
  document.querySelector('.bottom-nav')?.addEventListener('click', () => setTimeout(() => check(true), 250), true);
  setTimeout(() => check(true), 1200);
})();
