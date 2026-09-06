(() => {
  const screen = document.querySelector('#screen');

  function hash(value = '') {
    let h = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function cleanName(value = '') {
    return String(value)
      .replace(/\(you\)/ig, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function avatarKey(el) {
    const row = el.closest('.row-left,.kp3-member-row,.payment-row,.award-tile,tr');
    const strong = row?.querySelector('strong,b');
    const name = cleanName(strong?.textContent || '');
    if (name && name.length > 1) return name.toLowerCase();
    const dataUser = el.closest('[data-kp-user]')?.dataset?.kpUser;
    if (dataUser) return dataUser;
    return cleanName(el.textContent || '?').toLowerCase();
  }

  function paintAvatars(root = document) {
    root.querySelectorAll?.('.avatar').forEach(el => {
      const key = avatarKey(el);
      const tone = String(hash(key) % 6);
      if (el.dataset.kpTone !== tone) el.dataset.kpTone = tone;
      if (!el.dataset.kpAvatarKey) el.dataset.kpAvatarKey = key;
    });
  }

  function installWordmark() {
    const span = document.querySelector('.brand > span');
    if (!span || span.dataset.kpWordmark === '1') return;
    span.dataset.kpWordmark = '1';
    span.className = `${span.className || ''} kp-wordmark`.trim();
    span.innerHTML = '<span class="kp-word-kick">KICK</span><span class="kp-word-slash" aria-hidden="true">/</span><span class="kp-word-pot">POT</span>';
  }

  let queued = false;
  function refresh() {
    queued = false;
    installWordmark();
    paintAvatars(document);
  }
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(refresh);
  }

  installWordmark();
  paintAvatars(document);

  if (screen) {
    new MutationObserver(queue).observe(screen, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  window.addEventListener('pageshow', queue);
  document.querySelector('.bottom-nav')?.addEventListener('click', () => setTimeout(queue, 0), true);
})();
