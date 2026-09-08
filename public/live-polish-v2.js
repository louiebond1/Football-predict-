(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  // Load the final Live visual system without disturbing the approved Matchday screen.
  const head = document.head;
  const addCss = (href,id) => {
    if (document.getElementById(id)) return;
    const link=document.createElement('link'); link.id=id; link.rel='stylesheet'; link.href=href; head.appendChild(link);
  };
  const addScript = (src,id) => {
    if (document.getElementById(id)) return;
    const s=document.createElement('script'); s.id=id; s.src=src; s.defer=true; document.body.appendChild(s);
  };
  addCss('/reference-live-v1.css?v=1&studio=20260908live','kp-live-ref-css');
  addCss('/reference-live-fixtures-v2.css?v=2&studio=20260908live','kp-live-fixtures-css');
  addCss('/live-final-v3.css?v=1&studio=20260908live','kp-live-final-css');
  addScript('/reference-live-v1.js?v=1&studio=20260908live','kp-live-ref-js');
  addScript('/reference-live-fixtures-v2.js?v=2&studio=20260908live','kp-live-fixtures-js');

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
