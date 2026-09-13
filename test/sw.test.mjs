import test from 'node:test';import assert from 'node:assert/strict';import vm from'node:vm';import{readFile,stat}from'node:fs/promises';
const source=await readFile('public/sw.js','utf8');
function harness(){const listeners={},deleted=[],network=[];const cached=new Map([['/','shell']]);let skipped=0;
 const cache={match:async p=>cached.get(p),addAll:async()=>{}};
 const context={self:{location:{origin:'https://kickpot.test'},clients:{claim:async()=>{}},skipWaiting:()=>skipped++,addEventListener:(t,cb)=>listeners[t]=cb},URL,caches:{open:async()=>cache,keys:async()=>['other-app','kickpot-old'],delete:async k=>deleted.push(k)},fetch:async req=>{network.push(req.url);return 'network';}};
 vm.runInNewContext(source,context);
 return{listeners,deleted,network,skipped:()=>skipped};
}
test('every precached asset exists and index dependencies are included',async()=>{
 const core=JSON.parse(source.match(/const CORE=(\[[^;]+\]);/)[1]);
 for(const p of core)assert.ok((await stat('public'+(p==='/'?'/index.html':p))).isFile(),p);
 const html=await readFile('public/index.html','utf8');for(const m of html.matchAll(/(?:src|href)="(\/[^"?]+)(?:\?[^"]*)?"/g))assert.ok(core.includes(m[1]),m[1]);
 assert.ok(core.includes('/vendor/supabase.js'));
});
test('service worker never handles authenticated API or foreign requests',()=>{
 const h=harness();for(const url of ['https://kickpot.test/api/config','https://supabase.test/rest/v1/predictions'])h.listeners.fetch({request:{url,method:'GET'},respondWith(){assert.fail('private request intercepted');}});
});
test('unknown assets never receive the HTML shell',()=>{const h=harness();h.listeners.fetch({request:{url:'https://kickpot.test/missing.js',method:'GET'},respondWith(){assert.fail('unknown asset intercepted');}});});
test('upgrades require an explicit message and delete only KickPot caches',async()=>{const h=harness();assert.equal(h.skipped(),0);let pending;h.listeners.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(h.deleted,['kickpot-old']);h.listeners.message({data:{type:'SKIP_WAITING'}});assert.equal(h.skipped(),1);});
