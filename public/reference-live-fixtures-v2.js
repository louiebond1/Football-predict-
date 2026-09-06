(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  function compactTime(text = '') {
    const m = String(text).match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{2}:\d{2})\b/i);
    return m ? m[1] : '';
  }

  function processFixture(fixture) {
    const teams = fixture.querySelector('.teams');
    const scorepick = fixture.querySelector('.scorepick');
    const rules = fixture.querySelector(':scope > .rules');
    if (!teams || !scorepick) return;

    const ruleText = (rules?.textContent || '').replace(/\s+/g, ' ').trim();
    const kickoff = compactTime(ruleText);
    const scores = [...scorepick.querySelectorAll('.scorebox')].map(el => (el.textContent || '').trim());
    const upcoming = kickoff && scores.length >= 2 && scores.every(v => !v || v === '–' || v === '-');

    fixture.classList.toggle('kp-ref-upcoming', Boolean(upcoming));
    if (upcoming) scorepick.dataset.kpCenter = kickoff;
    else delete scorepick.dataset.kpCenter;

    if (!fixture.querySelector(':scope > .kp-ref-fixture-chevron')) {
      const chevron = document.createElement('span');
      chevron.className = 'kp-ref-fixture-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '›';
      fixture.appendChild(chevron);
    }

    const home = fixture.querySelector('.team:not(.away) span')?.textContent?.trim() || '';
    const away = fixture.querySelector('.team.away span')?.textContent?.trim() || '';
    const center = upcoming ? kickoff : scores.filter(Boolean).join('–');
    if (home && away) fixture.setAttribute('aria-label', `${home} ${center ? center + ' ' : ''}${away}${ruleText ? `. ${ruleText}` : ''}`);
  }

  function apply() {
    if (document.body?.dataset?.kpScreen !== 'live') return;
    const cards = [...screen.querySelectorAll('.card')];
    cards.forEach(card => {
      const fixtures = [...card.querySelectorAll(':scope > .fixture')];
      if (!fixtures.length) return;
      card.classList.add('kp-ref-fixtures-card');

      let list = card.querySelector(':scope > .kp-ref-fixture-list');
      if (!list) {
        list = document.createElement('div');
        list.className = 'kp-ref-fixture-list';
        const title = card.querySelector(':scope > .card-title,:scope > .card-head');
        if (title) title.after(list);
        else card.prepend(list);
      }

      fixtures.forEach(fixture => {
        list.appendChild(fixture);
        processFixture(fixture);
      });
      [...list.querySelectorAll(':scope > .fixture')].forEach(processFixture);
    });
  }

  let raf = 0;
  const queue = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      apply();
    });
  };

  apply();
  new MutationObserver(queue).observe(screen, { childList: true, subtree: true, characterData: true });
  document.querySelector('.bottom-nav')?.addEventListener('click', () => setTimeout(queue, 0), { passive: true });
  window.addEventListener('pageshow', queue);
})();
