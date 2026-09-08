const ROUTE_PREFIX = 'kp-route-v1:';
const SCROLL_PREFIX = 'kp-scroll-v1:';
const screen = document.querySelector('#screen');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
const STABLE_CLASS = { gw:'kp3-gw', live:'kp3-live', history:'kp3-history', group:'kp3-group' };
let pendingTab = '';
let pendingSince = 0;
let arrivalAnimation = null;
let arrivalTimer = 0;
let liveMask = null;
let liveMaskTimer = 0;

function currentTab() {
  return document.querySelector('.nav-item.active')?.dataset.tab || '';
}

function currentRoute(tab) {
  try { return sessionStorage.getItem(`${ROUTE_PREFIX}${tab}`) || ''; }
  catch { return ''; }
}

function clearDestinationState(tab) {
  try {
    sessionStorage.removeItem(`${ROUTE_PREFIX}${tab}`);
    sessionStorage.setItem(`${SCROLL_PREFIX}${tab}:root`, '0');
  } catch {}
}

function fixVisibleRenderArtifacts() {
  const head = screen?.querySelector('.kp3-fixtures-card .card-head');
  if (head?.querySelector('.kp3-count')) head.querySelector(':scope > .muted')?.remove();
}

function makeLiveMask() {
  clearLiveMask();
  const el = document.createElement('div');
  el.id = 'kpLiveEntryMask';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div style="height:100%;background:#f4efe4;overflow:hidden">
      <div style="height:214px;position:relative;background:#202329 url('/kickpot-hero-final.jpg') center 55%/cover no-repeat;color:white;padding:24px 22px 20px;box-sizing:border-box">
        <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,6,9,.78),rgba(4,6,9,.4) 62%,rgba(4,6,9,.14))"></div>
        <div style="position:relative;z-index:1;font:800 11px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#d2b76f">MATCHDAY</div>
        <div style="position:relative;z-index:1;margin-top:10px;font:500 56px/.86 Georgia,'Times New Roman',serif;letter-spacing:-.03em">Live</div>
        <div style="position:relative;z-index:1;margin-top:10px;font:800 10.5px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:.2em">REAL GAMES. REAL POINTS.</div>
      </div>
      <div style="height:47px;border-bottom:1px solid rgba(20,20,20,.1);display:flex;align-items:flex-end;gap:18px;padding:0 22px;box-sizing:border-box;background:#f4efe4">
        <div style="padding-bottom:12px;border-bottom:2px solid #a2833e;font:600 13.5px/1 Georgia,'Times New Roman',serif;color:#161713">Live Fixtures</div>
        <div style="padding-bottom:13px;font:600 13.5px/1 Georgia,'Times New Roman',serif;color:#9c9b99">Live Table</div>
        <div style="padding-bottom:13px;font:600 13.5px/1 Georgia,'Times New Roman',serif;color:#9c9b99">My Picks</div>
      </div>
      <div style="padding:22px;background:#f4efe4">
        <div style="height:28px;width:128px;border-radius:8px;background:rgba(20,20,20,.07)"></div>
        <div style="margin-top:14px;height:160px;border:1px solid rgba(20,20,20,.1);border-radius:16px;background:#fff"></div>
      </div>
    </div>`;
  Object.assign(el.style, {
    position:'fixed', left:'50%', transform:'translateX(-50%)', top:'0', bottom:'0',
    width:'min(100vw,430px)', zIndex:'90', background:'#f4efe4', pointerEvents:'none'
  });
  document.body.appendChild(el);
  liveMask = el;
  clearTimeout(liveMaskTimer);
  liveMaskTimer = setTimeout(clearLiveMask, 5200);
}

function clearLiveMask() {
  clearTimeout(liveMaskTimer);
  liveMaskTimer = 0;
  if (!liveMask) return;
  const el = liveMask;
  liveMask = null;
  if (!reduceMotion && el.animate) {
    const a = el.animate([{opacity:1},{opacity:0}], {duration:80,easing:'ease-out'});
    a.onfinish = () => el.remove();
  } else el.remove();
}

function makeExitMask() {
  clearLiveMask();
  const el = document.createElement('div');
  el.id = 'kpLiveEntryMask';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position:'fixed', left:'50%', transform:'translateX(-50%)', top:'0', bottom:'0',
    width:'min(100vw,430px)', zIndex:'90', background:'#f4efe4', pointerEvents:'none'
  });
  document.body.appendChild(el);
  liveMask = el;
  clearTimeout(liveMaskTimer);
  liveMaskTimer = setTimeout(clearLiveMask, 400);
}

function destinationIsStable(tab) {
  if (tab === 'live') return Boolean(screen?.querySelector('.kp-live-screen'));
  const cls = STABLE_CLASS[tab];
  return !cls || screen?.classList.contains(cls);
}

function finishArrival(force = false) {
  if (!screen || !pendingTab) return;
  const active = currentTab();
  if (active !== pendingTab) return;
  if (!force && !destinationIsStable(pendingTab)) return;

  const completedTab = pendingTab;
  pendingTab = '';
  clearTimeout(arrivalTimer);
  arrivalTimer = 0;
  arrivalAnimation?.cancel();
  clearLiveMask();
  if (reduceMotion || typeof screen.animate !== 'function') return;

  arrivalAnimation = screen.animate([
    { opacity: 0.985, transform: 'translateY(1px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 90, easing: 'cubic-bezier(.22,.61,.36,1)' });
}

document.addEventListener('click', event => {
  const nav = event.target.closest('.nav-item[data-tab]');
  if (!nav) return;

  const toTab = nav.dataset.tab;
  const fromTab = currentTab();
  const sameTab = toTab === fromTab;
  const hasSubroute = Boolean(currentRoute(toTab));
  clearDestinationState(toTab);

  if (sameTab && !hasSubroute) {
    event.preventDefault();
    event.stopImmediatePropagation();
    pendingTab = '';
    clearTimeout(arrivalTimer);
    arrivalAnimation?.cancel();
    if (toTab === 'live') clearLiveMask();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    return;
  }

  pendingTab = toTab;
  pendingSince = performance.now();
  clearTimeout(arrivalTimer);
  arrivalAnimation?.cancel();

  if (toTab === 'live' && fromTab !== 'live') makeLiveMask();
  else if (fromTab === 'live' && toTab !== 'live') makeExitMask();
  else clearLiveMask();

  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  requestAnimationFrame(() => {
    if (currentTab() === toTab) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  });

  arrivalTimer = setTimeout(() => finishArrival(true), toTab === 'live' ? 5000 : 180);
}, true);

const observer = new MutationObserver(() => {
  fixVisibleRenderArtifacts();
  if (!pendingTab) return;
  if (pendingTab === 'live' && screen?.querySelector('.kp-live-screen')) {
    queueMicrotask(() => finishArrival(false));
    return;
  }
  if (performance.now() - pendingSince > (pendingTab === 'live' ? 5000 : 180)) finishArrival(true);
  else queueMicrotask(() => finishArrival(false));
});
if (screen) observer.observe(screen, { childList: true, subtree: true, attributes:true, attributeFilter:['class'] });

window.addEventListener('pageshow', () => {
  if (currentTab() !== 'live') clearLiveMask();
});

fixVisibleRenderArtifacts();
