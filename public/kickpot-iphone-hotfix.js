(() => {
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;

  const candidates = [
    'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=82',
    'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=82',
    'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=82',
    'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1200&q=82'
  ];

  let generation = 0;
  function desiredIndex(){ return Math.floor(Date.now()/1800000) % candidates.length; }

  function tryPhoto(startIndex = desiredIndex()) {
    const token = ++generation;
    body.classList.remove('kp-photo-ready');
    let tries = 0;

    const attempt = index => {
      if (token !== generation || tries >= candidates.length) return;
      tries += 1;
      const url = candidates[index % candidates.length];
      const img = new Image();
      img.decoding = 'async';
      const timer = setTimeout(() => { img.src=''; attempt(index + 1); }, 3500);
      img.onload = () => {
        clearTimeout(timer);
        if (token !== generation) return;
        root.style.setProperty('--kp-photo', `url("${url}")`);
        body.classList.add('kp-photo-ready');
      };
      img.onerror = () => { clearTimeout(timer); attempt(index + 1); };
      img.src = url;
    };
    attempt(startIndex);
  }

  tryPhoto();
  setInterval(() => {
    const slot = desiredIndex();
    if (body.dataset.kpPhotoSlot !== String(slot)) {
      body.dataset.kpPhotoSlot = String(slot);
      tryPhoto(slot);
    }
  }, 30000);

  window.addEventListener('pageshow', () => tryPhoto());
})();
