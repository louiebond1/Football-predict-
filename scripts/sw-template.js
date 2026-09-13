self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE))));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('kickpot-')&&k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'){
    event.respondWith(caches.open(CACHE).then(async c=>(await c.match('/'))||fetch(event.request)));return;
  }
  // The installed shell and its scripts upgrade together. Never cache API/auth data.
  if(!CORE.includes(url.pathname))return;
  event.respondWith(caches.open(CACHE).then(async cache=>
    (await cache.match(url.pathname))||fetch(event.request)));
});
