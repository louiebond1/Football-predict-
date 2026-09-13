// Upgrade only at the user's request so a deploy cannot discard unsaved picks.
if ('serviceWorker' in navigator) {
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloading)location.reload();
  });
  navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{
    const offer=()=>{
      if(!reg.waiting||!navigator.serviceWorker.controller||document.querySelector('#updateApp'))return;
      const button=document.createElement('button');button.id='updateApp';button.className='status warning';button.textContent='Update available — save your picks, then tap to reload';
      button.onclick=()=>{reloading=true;reg.waiting?.postMessage({type:'SKIP_WAITING'});};
      document.querySelector('#app').prepend(button);
    };
    offer();reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',offer));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)reg.update().catch(()=>{});});
  }).catch(()=>{console.warn('Offline installation unavailable.');});
}
