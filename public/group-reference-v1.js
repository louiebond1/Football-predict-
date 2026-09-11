/* Authoritative screenshot-led Group screen renderer. Runs last and re-applies after legacy renders. */
(() => {
  const screen = document.querySelector('#screen');
  if (!screen) return;

  const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const clean = (s='') => String(s).replace(/\s+/g,' ').trim();
  const svg = {
    lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h13M13 7l5 5-5 5"/></svg>',
    back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 5l-7 7 7 7"/></svg>',
    chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5l7 7-7 7"/></svg>',
    users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17.2" cy="8.8" r="2.4"/><path d="M16.2 14.4a4.5 4.5 0 0 1 4.4 4.5V20"/></svg>',
    rules:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h5"/></svg>',
    link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3l7 3v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3z"/><path d="M8.5 12l2.2 2.2 4.8-5"/></svg>'
  };

  function groupTabActive(){ return !!document.querySelector('.nav-item[data-tab="group"]')?.classList.contains('active'); }
  function findSource(){
    if (screen.dataset.groupReference === 'v4') return null;
    const head = screen.querySelector('.group-head');
    const h1 = head?.querySelector('h1');
    return head && h1 ? {head,h1} : null;
  }
  function collect(){
    const src = findSource(); if (!src) return null;
    const title = clean(src.h1.textContent) || 'Your group';
    const headMeta = clean(src.head.querySelector('.hero-sub')?.textContent || '');
    const memberMatch = headMeta.match(/(\d+)\s+members?/i);
    const treasurerMatch = headMeta.match(/Treasurer:\s*(.+)$/i);
    const stakeMatch = headMeta.match(/£\s*([\d.]+)/);
    const funMode = /^for fun\b/i.test(headMeta);
    const paymentRows = [...screen.querySelectorAll('.payment-row')];
    const memberCount = memberMatch ? Number(memberMatch[1]) : (paymentRows.length || 1);
    const treasurer = treasurerMatch ? clean(treasurerMatch[1]) : '';
    const stake = stakeMatch ? Number(stakeMatch[1]) : 0;
    const isTreasurer = !!screen.querySelector('.kp-admin-entry, .kp-admin-first-paint');
    const names = paymentRows.map(r => clean(r.querySelector('strong')?.textContent || '')).filter(Boolean);
    const initials = names.slice(0,5).map(n => {
      const bits=n.replace(/\s*\(you\)\s*/i,'').trim().split(/\s+/).filter(Boolean);
      return (bits.length>1 ? bits[0][0]+bits[bits.length-1][0] : (bits[0]||'?').slice(0,2)).toUpperCase();
    });
    while(initials.length < Math.min(memberCount,5)) initials.push('?');
    return {title,memberCount,treasurer,stake,funMode,isTreasurer,initials,children:[...screen.children]};
  }

  function resetPanel(scrollHome=true){
    const panel = screen.querySelector('.group-reference-panel');
    const legacy = screen.querySelector('.group-reference-legacy');
    if (panel && legacy) {
      const moved = panel.querySelector('[data-group-original-card="1"]');
      if (moved) {
        moved.removeAttribute('data-group-original-card');
        legacy.appendChild(moved);
      }
      panel.remove();
    }
    screen.querySelector('.group-reference-hub')?.classList.remove('group-reference-hub--compact');
    if (scrollHome) window.scrollTo({top:0,behavior:'smooth'});
  }

  function cardTitle(card){ return clean(card.querySelector('.card-title')?.textContent || card.textContent || ''); }

  function findTarget(legacy,label){
    const cards=[...legacy.querySelectorAll('.card')];
    if(label==='members') return cards.find(c=>/member payments|members/i.test(cardTitle(c)));
    if(label==='rules') return cards.find(c=>/this week|rules/i.test(cardTitle(c)));
    if(label==='settings') return cards.find(c=>/pay the treasurer|group settings/i.test(cardTitle(c)));
    return null;
  }

  function mountPanel(target,title){
    const panel=document.createElement('section');
    panel.className='group-reference-panel';
    panel.innerHTML=`<div class="group-reference-panel-head"><button type="button" class="group-reference-back" aria-label="Back to Group">${svg.back}</button><div><small>GROUP</small><h2>${esc(title)}</h2></div></div>`;
    panel.appendChild(target);
    screen.querySelector('.group-reference-hub')?.classList.add('group-reference-hub--compact');
    screen.appendChild(panel);
    panel.querySelector('.group-reference-back')?.addEventListener('click',()=>{
      resetPanel(true);
      document.dispatchEvent(new CustomEvent('kp:group-refresh'));
    });
    requestAnimationFrame(()=>requestAnimationFrame(()=>panel.scrollIntoView({behavior:'smooth',block:'start'})));
  }

  function openAdmin(){
    resetPanel(false);
    const legacy = screen.querySelector('.group-reference-legacy');
    const entry = legacy?.querySelector('.kp-admin-entry');
    if (!entry) {
      console.warn('[KickPot Group] admin console not available (not the treasurer)');
      return;
    }
    entry.click();
    const tryMount = (tries=0) => {
      const view = legacy.querySelector('.kp-admin-view');
      if (view && !view.hidden) {
        view.dataset.groupOriginalCard='1';
        mountPanel(view,'Admin');
        return;
      }
      if (tries < 25) setTimeout(()=>tryMount(tries+1), 60);
    };
    tryMount();
  }

  function openLegacy(label){
    if (label === 'admin') { openAdmin(); return; }
    resetPanel(false);
    const legacy = screen.querySelector('.group-reference-legacy');
    if (!legacy) return;
    const target=findTarget(legacy,label);
    const titles={members:'Members',rules:'Rules',settings:'Group settings'};
    if (!target) {
      console.warn('[KickPot Group] panel target not found:', label);
      return;
    }

    target.hidden=false;
    target.removeAttribute('hidden');
    target.style.removeProperty('display');
    target.style.removeProperty('visibility');
    target.style.removeProperty('opacity');
    target.dataset.groupOriginalCard='1';
    mountPanel(target,titles[label]||'Group');
  }

  function render(){
    if (!groupTabActive()) { delete screen.dataset.groupReference; screen.classList.remove('group-reference-screen'); return; }
    const data=collect(); if (!data) return;
    const isFun = data.funMode || !(data.stake>0);
    const mode = isFun ? 'For fun' : `£${Number.isInteger(data.stake)?data.stake:data.stake.toFixed(2)}/week`;
    const modeSub = isFun ? 'No weekly payment' : 'Weekly payment enabled';
    const avatarHtml=data.initials.map((x,i)=>`<span class="group-reference-avatar" style="z-index:${20-i}">${esc(x)}</span>`).join('');
    const extra=Math.max(0,data.memberCount-data.initials.length);
    const legacy=document.createElement('div'); legacy.className='group-reference-legacy'; legacy.hidden=true;
    data.children.forEach(el=>legacy.appendChild(el));

    screen.innerHTML=''; screen.dataset.groupReference='v4'; screen.classList.add('group-reference-screen');
    const hub=document.createElement('section'); hub.className='group-reference-hub';
    hub.innerHTML=`
      <section class="group-reference-hero"><div class="group-reference-hero-content"><div class="group-reference-private">${svg.lock}<span>Private group</span></div><h1>${esc(data.title)}</h1><p>${mode} · ${data.memberCount} member${data.memberCount===1?'':'s'}${data.treasurer?` · Treasurer: ${esc(data.treasurer)}`:''}</p><button type="button" data-open="members">View group ${svg.arrow}</button></div></section>
      <section class="group-reference-members-strip"><div class="group-reference-avatars">${avatarHtml}${extra?`<span class="group-reference-avatar group-reference-avatar-more">+${extra}</span>`:''}</div><button type="button" data-open="members"><span>${data.memberCount} member${data.memberCount===1?'':'s'}</span>${svg.chev}</button></section>
      <section class="group-reference-mode"><div><div class="group-reference-eyebrow">Play mode</div><h2>${esc(mode)}</h2><p>${esc(modeSub)}</p></div></section>
      <section class="group-reference-menu">
        <button type="button" data-open="members"><span class="group-reference-menu-icon">${svg.users}</span><span class="group-reference-menu-copy"><b>Members</b><small>Manage your group</small></span><span class="group-reference-menu-tail">${svg.chev}</span></button>
        <button type="button" data-open="rules"><span class="group-reference-menu-icon">${svg.rules}</span><span class="group-reference-menu-copy"><b>Rules</b><small>Scoring & lock times</small></span><span class="group-reference-menu-tail">${svg.chev}</span></button>
        <button type="button" data-open="settings"><span class="group-reference-menu-icon">${svg.link}</span><span class="group-reference-menu-copy"><b>Group settings</b><small>Invite code & group access</small></span><span class="group-reference-menu-tail">${svg.chev}</span></button>
        ${data.isTreasurer?`<button type="button" data-open="admin"><span class="group-reference-menu-icon">${svg.shield}</span><span class="group-reference-menu-copy"><b>Admin</b><small>Payments, members & scoring controls</small></span><span class="group-reference-menu-tail"><em>Treasurer</em>${svg.chev}</span></button>`:''}
      </section>`;
    screen.append(hub,legacy);
    hub.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>openLegacy(btn.dataset.open)));
  }

  let queued=false;
  const schedule=()=>{ if(queued) return; queued=true; requestAnimationFrame(()=>{queued=false;render();}); };
  new MutationObserver(()=>{ if(screen.dataset.groupReference!=='v4') schedule(); }).observe(screen,{childList:true,subtree:false});
  document.addEventListener('kp:group-refresh', () => {
    if (!groupTabActive() || screen.querySelector('.group-reference-panel')) return;
    delete screen.dataset.groupReference;
    schedule();
  });
  document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>setTimeout(schedule,0)));
  setTimeout(schedule,0);
})();
