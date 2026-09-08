(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  function markRows() {
    if (document.querySelector('.nav-item.active')?.dataset?.tab !== 'live') return;
    const rows = [...screen.querySelectorAll('.table tbody tr')];
    rows.forEach((row, index) => {
      row.classList.toggle('kp-is-leader', index === 0);
      const text = (row.textContent || '').toLowerCase();
      row.classList.toggle('kp-is-me', text.includes('(you)') || /\byou\b/.test(text));
    });
  }

  function fixGoalSwingCopy() {
    if (document.querySelector('.nav-item.active')?.dataset?.tab !== 'live') return;
    const card = screen.querySelector('.kp3-swing,.swing');
    if (!card) return;
    const detail = [...card.querySelectorAll(':scope > div')].find(el => !el.classList.contains('eyebrow'));
    const p = card.querySelector('p');
    if (!p) return;
    const nameMatch = p.textContent.trim().match(/^(.+?)\s+is now leading the pot\.?$/i);
    if (!nameMatch) return;
    const name = nameMatch[1];
    const unchanged = /standings unchanged/i.test(detail?.textContent || '');
    p.textContent = unchanged ? `${name} stays top.` : `${name} leads the pot.`;
  }

  let queued = false;
  function polish() {
    queued = false;
    markRows();
    fixGoalSwingCopy();
  }
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(polish);
  }

  new MutationObserver(queue).observe(screen, { childList:true, subtree:true, characterData:true });
  document.querySelector('.bottom-nav')?.addEventListener('click', () => setTimeout(queue, 0), true);
  window.addEventListener('pageshow', queue);
  queue();
})();
