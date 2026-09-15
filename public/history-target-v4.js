(() => {
  const screen=document.querySelector('#screen');
  if(!screen)return;
  const sync=()=>{
    if(!document.querySelector('.nav-item[data-tab="history"]')?.classList.contains('active'))return;
    const h=screen.querySelector(':scope > .winner h1');
    if(!h||h.dataset.kpReferenceTitle==='1')return;
    const raw=(h.textContent||'').trim();
    if(!/^DRAW\b/i.test(raw)&&!/NO WINNER/i.test(raw)){
      const name=raw.replace(/\s+WINS$/i,'').toLowerCase().replace(/(^|[\s_-])([a-z])/g,(_,a,b)=>a+b.toUpperCase());
      h.textContent=name;
    }
    h.dataset.kpReferenceTitle='1';
  };
  new MutationObserver(sync).observe(screen,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('.nav-item[data-tab="history"]'))requestAnimationFrame(sync)});
  sync();
})();
