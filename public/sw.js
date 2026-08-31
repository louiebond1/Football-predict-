const CACHE='kickpot-v30';
const CORE=[
  '/',
  '/styles.css',
  '/premium-ui.css?v=8',
  '/product-v3.css?v=1',
  '/product-v3-tune.css?v=4',
  '/admin-v1.css?v=1',
  '/admin-v1-fix.css?v=1',
  '/settings-v1.css?v=3',
  '/auth-password.css?v=1',
  '/live-status.css?v=1',
  '/supabase-singleton.js?v=1',
  '/smooth-runtime.js?v=1',
  '/auth-ux.js?v=2',
  '/app.js?v=2',
  '/password-auth.js?v=1',
  '/ui-v3.js?v=1',
  '/live-status.js?v=2',
  '/admin-v1.js?v=1',
  '/settings-v2.js?v=1',
  '/account-password.js?v=1',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
]));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r})
      .catch(()=>caches.match(e.request))
  );
});