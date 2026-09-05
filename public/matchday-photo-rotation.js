const screen = document.querySelector('#screen');
const HALF_HOUR = 30 * 60 * 1000;

const PHOTOS = [
  {
    src: 'https://images.unsplash.com/photo-1747213286331-0f00410a62e2?auto=format&fit=crop&w=1600&q=82',
    position: '50% 48%'
  },
  {
    src: 'https://images.unsplash.com/photo-1781152791898-945ca008c8ef?auto=format&fit=crop&w=1600&q=82',
    position: '50% 54%'
  },
  {
    src: 'https://images.unsplash.com/photo-1767916732786-a83902ffc25c?auto=format&fit=crop&w=1600&q=82',
    position: '50% 50%'
  },
  {
    src: 'https://images.unsplash.com/photo-1556816214-6d16c62fbbf6?auto=format&fit=crop&w=1600&q=82',
    position: '50% 58%'
  }
];

let currentIndex = -1;
let timer = 0;
let observerQueued = false;

function slotIndex(now = Date.now()) {
  return Math.floor(now / HALF_HOUR) % PHOTOS.length;
}

function preload(index) {
  const photo = PHOTOS[index % PHOTOS.length];
  const img = new Image();
  img.decoding = 'async';
  img.src = photo.src;
}

function ensureFigure() {
  const hero = screen?.querySelector('.kp3-gw-root > .kp3-page-hero');
  if (!hero) return null;

  let figure = screen.querySelector('.kp-matchday-photo');
  if (figure) return figure;

  figure = document.createElement('figure');
  figure.className = 'kp-matchday-photo';
  figure.setAttribute('aria-hidden', 'true');
  figure.innerHTML = '<img class="kp-matchday-photo-a" alt=""><img class="kp-matchday-photo-b" alt="">';
  hero.before(figure);
  return figure;
}

function swapTo(index, force = false) {
  const figure = ensureFigure();
  if (!figure) return;
  if (!force && index === currentIndex && figure.querySelector('img.is-active')) return;

  const photo = PHOTOS[index];
  const active = figure.querySelector('img.is-active');
  const next = active?.classList.contains('kp-matchday-photo-a')
    ? figure.querySelector('.kp-matchday-photo-b')
    : figure.querySelector('.kp-matchday-photo-a');

  next.style.objectPosition = photo.position;
  next.onload = () => {
    if (!document.body.contains(figure)) return;
    active?.classList.remove('is-active');
    next.classList.add('is-active');
  };
  next.src = photo.src;

  if (next.complete) next.onload();
  currentIndex = index;
  preload((index + 1) % PHOTOS.length);
}

function syncPhoto(force = false) {
  const figure = ensureFigure();
  if (!figure) return;
  swapTo(slotIndex(), force);
}

function scheduleBoundary() {
  clearTimeout(timer);
  const wait = HALF_HOUR - (Date.now() % HALF_HOUR) + 40;
  timer = window.setTimeout(() => {
    syncPhoto();
    scheduleBoundary();
  }, wait);
}

function queueSync() {
  if (observerQueued) return;
  observerQueued = true;
  queueMicrotask(() => {
    observerQueued = false;
    syncPhoto();
  });
}

const observer = new MutationObserver(queueSync);
if (screen) observer.observe(screen, { childList: true, subtree: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncPhoto();
});
window.addEventListener('pageshow', () => syncPhoto(true));

preload(slotIndex());
preload((slotIndex() + 1) % PHOTOS.length);
scheduleBoundary();
queueSync();
