(() => {
  const screen = document.querySelector('#screen');
  const TONE_COUNT = 10;
  const TONE_STORE_VERSION = 'kp-avatar-tones-v2';
  const probeSteps = [1, 3, 7, 9];

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

  function activeGroupKey() {
    const selected = document.querySelector('#groupSwitch')?.value;
    return selected || 'global';
  }

  function storageKey(groupKey) {
    return `${TONE_STORE_VERSION}:${groupKey}`;
  }

  function readToneMap(groupKey) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(groupKey)) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeToneMap(groupKey, map) {
    try {
      localStorage.setItem(storageKey(groupKey), JSON.stringify(map));
    } catch {
      // Avatar colour is cosmetic; storage failure should never affect rendering.
    }
  }

  function chooseFreeTone(key, used) {
    const preferred = hash(key) % TONE_COUNT;
    const step = probeSteps[hash(`${key}|step`) % probeSteps.length];
    for (let i = 0; i < TONE_COUNT; i += 1) {
      const tone = (preferred + (i * step)) % TONE_COUNT;
      if (!used.has(tone)) return tone;
    }
    // Groups larger than the palette can still render deterministically; only
    // after all ten distinct tones are occupied do we allow a repeated tone.
    return preferred;
  }

  function ensureToneAssignments(keys, groupKey) {
    const map = readToneMap(groupKey);
    const used = new Set();

    // Keep valid previous assignments stable across rerenders/reloads, but only
    // reserve each tone once. Any stale/colliding stored value is repaired below.
    Object.keys(map).sort().forEach(key => {
      const tone = Number(map[key]);
      if (!Number.isInteger(tone) || tone < 0 || tone >= TONE_COUNT || used.has(tone)) {
        delete map[key];
        return;
      }
      used.add(tone);
    });

    [...new Set(keys)].sort().forEach(key => {
      const existing = Number(map[key]);
      if (Number.isInteger(existing) && existing >= 0 && existing < TONE_COUNT) return;
      const tone = chooseFreeTone(key, used);
      map[key] = tone;
      used.add(tone);
    });

    writeToneMap(groupKey, map);
    return map;
  }

  function paintAvatars(root = document) {
    const avatars = [...(root.querySelectorAll?.('.avatar') || [])];
    if (!avatars.length) return;

    const groupKey = activeGroupKey();
    const keyed = avatars.map(el => ({ el, key: avatarKey(el) }));
    const map = ensureToneAssignments(keyed.map(item => item.key), groupKey);

    keyed.forEach(({ el, key }) => {
      const tone = String(map[key] ?? (hash(key) % TONE_COUNT));
      if (el.dataset.kpTone !== tone) el.dataset.kpTone = tone;
      if (el.dataset.kpAvatarKey !== key) el.dataset.kpAvatarKey = key;
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
  document.addEventListener('change', event => {
    if (event.target?.matches?.('#groupSwitch')) setTimeout(queue, 0);
  }, true);
})();
