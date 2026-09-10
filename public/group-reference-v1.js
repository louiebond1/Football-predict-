/* Screenshot-led Group hub enhancement. Leaves original Group controls/events in DOM. */
(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  const icons = {
    lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h13M13 7l5 5-5 5"/></svg>',
    chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5l7 7-7 7"/></svg>',
    users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.8a4.5 4.5 0 0 1 4.7 4.2v1"/></svg>',
    rules:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h5"/></svg>',
    link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3l7 3v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3z"/><path d="M8.5 12l2.2 2.2 4.8-5"/></svg>'
  };

  function cleanText(s=''){ return s.replace(/\s+/g,' ').trim(); }

  function findCard(label) {
    return [...screen.querySelectorAll('.card')].find(card => cleanText(card.querySelector('.card-title')?.textContent || '').toLowerCase().includes(label));
  }

  function focusLegacy(label) {
    screen.querySelectorAll('.group-ref-focus').forEach(el => el.classList.remove('group-ref-focus'));
    const card = findCard(label);
    if (!card) return;
    card.classList.add('group-ref-focus');
    screen.classList.add('group-ref-show-legacy');
    requestAnimationFrame(() => card.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  function enhance() {
    const head = screen.querySelector(':scope > .group-head');
    if (!head || screen.querySelector(':scope > .group-ref-hub')) {
      if (!head && screen.classList.contains('group-ref-screen')) {
        screen.classList.remove('group-ref-screen','group-ref-show-legacy');
      }
      return;
    }

    const title = cleanText(head.querySelector('h1')?.textContent || 'Your group');
    const meta = cleanText(head.querySelector('.hero-sub')?.textContent || '');
    const memberMatch = meta.match(/(\d+)\s+members?/i);
    const memberCount = memberMatch ? Number(memberMatch[1]) : screen.querySelectorAll('.payment-row').length;
    const treasurerMatch = meta.match(/Treasurer:\s*(.+)$/i);
    const treasurer = treasurerMatch ? treasurerMatch[1] : '';
    const stakeMatch = meta.match(/£\s*([\d.]+)/);
    const stake = stakeMatch ? Number(stakeMatch[1]) : 0;
    const mode = stake > 0 ? `£${stake % 1 ? stake.toFixed(2) : stake}/week` : 'For fun';
    const modeSub = stake > 0 ? 'Weekly stake enabled' : 'No payment required';

    const avatarNodes = [...screen.querySelectorAll('.payment-row .avatar')];
    const avatars = avatarNodes.slice(0,5).map(a => a.outerHTML).join('') || '<span class="avatar">K</span>';
    const extra = Math.max(0, memberCount - Math.min(5, Math.max(1, avatarNodes.length)));
    const extraHtml = extra ? `<span class="group-ref-more">+${extra}</span>` : '';

    [...screen.children].forEach(el => el.classList.add('group-ref-legacy'));
    screen.classList.add('group-ref-screen');

    const hub = document.createElement('section');
    hub.className = 'group-ref-hub';
    hub.innerHTML = `
      <div class="group-ref-hero">
        <div class="group-ref-hero-inner">
          <div class="group-ref-private">${icons.lock}<span>Private group</span></div>
          <h1 class="group-ref-title">${title.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}</h1>
          <div class="group-ref-meta">${mode} · ${memberCount} member${memberCount===1?'':'s'}${treasurer ? ` · Treasurer: ${treasurer}` : ''}</div>
          <button class="group-ref-view" type="button" data-group-ref-target="member payments">View group ${icons.arrow}</button>
        </div>
      </div>
      <div class="group-ref-members">
        <div class="group-ref-avatar-stack">${avatars}${extraHtml}</div>
        <button class="group-ref-member-link" type="button" data-group-ref-target="member payments">${memberCount} member${memberCount===1?'':'s'} ${icons.chev}</button>
      </div>
      <div class="group-ref-mode">
        <div>
          <div class="group-ref-eyebrow">Play mode</div>
          <h2 class="group-ref-mode-title">${mode}</h2>
          <div class="group-ref-mode-sub">${modeSub}</div>
        </div>
        <div class="group-ref-kicker">Same game<br>different<br>friends</div>
      </div>
      <div class="group-ref-menu">
        <button class="group-ref-menu-row" type="button" data-group-ref-target="member payments"><span class="group-ref-menu-icon">${icons.users}</span><span class="group-ref-menu-copy"><b>Members</b><span>Manage your group</span></span><span class="group-ref-menu-tail">${icons.chev}</span></button>
        <button class="group-ref-menu-row" type="button" data-group-ref-target="this week"><span class="group-ref-menu-icon">${icons.rules}</span><span class="group-ref-menu-copy"><b>Rules</b><span>Scoring & lock times</span></span><span class="group-ref-menu-tail">${icons.chev}</span></button>
        <button class="group-ref-menu-row" type="button" data-group-ref-target="pay the treasurer"><span class="group-ref-menu-icon">${icons.link}</span><span class="group-ref-menu-copy"><b>Group settings</b><span>Invite code & group access</span></span><span class="group-ref-menu-tail">${icons.chev}</span></button>
        <button class="group-ref-menu-row" type="button" data-group-ref-target="treasurer"><span class="group-ref-menu-icon">${icons.shield}</span><span class="group-ref-menu-copy"><b>Admin</b><span>Payments, members & scoring controls</span></span><span class="group-ref-menu-tail">${treasurer ? '<span class="group-ref-role">Treasurer</span>' : ''}${icons.chev}</span></button>
      </div>
      <div class="group-ref-banner"><div class="group-ref-banner-copy">Good football<br>better friends</div><div class="group-ref-banner-brand">KickPot</div></div>`;

    screen.prepend(hub);
    hub.querySelectorAll('[data-group-ref-target]').forEach(btn => btn.addEventListener('click', () => focusLegacy(btn.dataset.groupRefTarget)));
  }

  const observer = new MutationObserver(() => requestAnimationFrame(enhance));
  observer.observe(screen,{childList:true,subtree:true});
  enhance();
})();
