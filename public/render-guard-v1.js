const screen = document.querySelector('#screen');
const own = screen ? Object.getOwnPropertyDescriptor(screen, 'innerHTML') : null;
let lastLiveSignature = '';
let lastLiveWriteAt = 0;

function normaliseLiveMarkup(html) {
  return String(html)
    .replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\d{2}:\d{2}\b/g, 'LIVE_CLOCK');
}

function screenAlreadyShowsLive() {
  return Boolean(screen?.querySelector('.kp3-live, .kp3-live-root'))
    || /Live Matchday/i.test(screen?.querySelector('h1')?.textContent || '');
}

// smooth-runtime installs an innerHTML wrapper before this module. Wrap that
// existing setter rather than bypassing it, and remove only the redundant Live
// repaint that follows a tab entry when the refreshed markup is unchanged.
if (screen && own?.get && own?.set) {
  Object.defineProperty(screen, 'innerHTML', {
    configurable: true,
    get() { return own.get.call(this); },
    set(value) {
      const html = String(value);
      const isLive = html.includes('<h1>Live Matchday</h1>');
      if (isLive) {
        const signature = normaliseLiveMarkup(html);
        const now = performance.now();
        if (screenAlreadyShowsLive() && signature === lastLiveSignature && now - lastLiveWriteAt < 1800) return;
        lastLiveSignature = signature;
        lastLiveWriteAt = now;
      }
      own.set.call(this, value);
    }
  });
}
