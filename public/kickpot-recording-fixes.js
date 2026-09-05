(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  function markFixtures() {
    const active = document.querySelector('.nav-item.active')?.dataset?.tab;
    if (active !== 'gw' && active !== 'live') return;
    screen.querySelectorAll('.fixture').forEach(row => {
      const editable = Boolean(row.querySelector('.kp3-score-stepper,[data-score]')) && row.dataset.locked !== '1';
      row.classList.toggle('kp-editable-fixture', editable);
      row.classList.toggle('kp-locked-fixture', !editable);
    });
  }

  function markLeaderboard() {
    if (document.querySelector('.nav-item.active')?.dataset?.tab !== 'live') return;
    const rows = [...screen.querySelectorAll('.table tbody tr')];
    rows.forEach((row, index) => {
      row.classList.toggle('kp-is-leader', index === 0);
      const text = (row.textContent || '').toLowerCase();
      row.classList.toggle('kp-is-me', text.includes('(you)') || /\byou\b/.test(text));
    });
  }

  function repairDrawPreview() {
    if (document.querySelector('.nav-item.active')?.dataset?.tab !== 'history') return;
    const latest = screen.querySelector('.kp-settlement-draw,.kp3-latest-winner,.winner');
    const title = latest?.querySelector('h1')?.textContent?.trim() || '';
    const draw = title.match(/^(\d+)-WAY DRAW$/i);
    if (!draw) return;
    const label = `${draw[1]}-way draw`;
    const round = latest.querySelector('.muted')?.textContent?.split('·')[0]?.trim() || '';
    const rows = [...screen.querySelectorAll('.kp3-history-preview .payment-row,.kp3-gameweeks-list .payment-row,section.card .payment-row')];
    rows.forEach(row => {
      const left = row.querySelector('span')?.textContent?.trim() || '';
      const result = row.querySelector('b');
      if (!result) return;
      if ((round && left === round && /^player$/i.test(result.textContent.trim())) || /^player$/i.test(result.textContent.trim())) {
        result.textContent = label;
      }
    });
  }

  function fixDuplicateCounts() {
    screen.querySelectorAll('.kp3-fixtures-card .card-head').forEach(head => {
      const muted = head.querySelector(':scope > .muted');
      const count = head.querySelector('.kp3-count');
      if (muted && count) muted.remove();
    });
  }

  function polish() {
    markFixtures();
    markLeaderboard();
    repairDrawPreview();
    fixDuplicateCounts();
  }

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; polish(); });
  };

  new MutationObserver(queue).observe(screen, { childList: true, subtree: true, characterData: true });
  document.querySelector('.bottom-nav')?.addEventListener('click', () => setTimeout(queue, 0), true);
  window.addEventListener('pageshow', queue);
  window.addEventListener('focus', queue);
  queue();
})();
