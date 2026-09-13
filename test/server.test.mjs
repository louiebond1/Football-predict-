import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
let child, origin;
test.before(async()=>{
 child=spawn(process.execPath,['start.mjs'],{env:{...process.env,PORT:'0',NODE_ENV:'test',SUPABASE_URL:'',SUPABASE_SECRET_KEY:'',SUPABASE_PUBLISHABLE_KEY:'',FOOTBALL_DATA_TOKEN:''},stdio:['ignore','pipe','pipe']});
 origin=await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{const m=String(d).match(/listening on (\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});child.on('error',reject);child.on('exit',c=>reject(Error('server exited '+c)));});
});
test.after(async()=>{child.kill();await once(child,'exit');});
test('missing static assets are real 404s, never HTML scripts',async()=>{const r=await fetch(origin+'/missing.js');assert.equal(r.status,404);assert.doesNotMatch(await r.text(),/doctype/i);});
test('invalid URI cannot crash the server',async()=>{assert.equal((await fetch(origin+'/%E0%A4%A')).status,400);assert.equal((await fetch(origin+'/api/health')).status,200);});
test('round validation, method boundaries and retired session relay',async()=>{assert.equal((await fetch(origin+'/api/football/fixtures?round=999')).status,400);assert.equal((await fetch(origin+'/api/config',{method:'POST'})).status,405);assert.equal((await fetch(origin+'/api/auth/pair/status?id=anything')).status,404);});
test('worker headers, MIME and security headers',async()=>{const r=await fetch(origin+'/sw.js');assert.match(r.headers.get('content-type'),/javascript/);assert.equal(r.headers.get('service-worker-allowed'),'/');assert.equal(r.headers.get('x-content-type-options'),'nosniff');});
test('public configuration never contains secret credentials',async()=>{const r=await fetch(origin+'/api/config');assert.deepEqual(Object.keys(await r.json()).sort(),['databaseSyncConfigured','footballConfigured','supabaseConfigured','supabasePublishableKey','supabaseUrl'].sort());});
test('legacy Railway entry point boots the canonical app with built assets',async()=>{
 const legacy=spawn(process.execPath,['proxy-server.mjs'],{env:{...process.env,PORT:'0',NODE_ENV:'test',SUPABASE_URL:'',SUPABASE_SECRET_KEY:'',SUPABASE_PUBLISHABLE_KEY:'',FOOTBALL_DATA_TOKEN:''},stdio:['ignore','pipe','pipe']});
 try{
  const url=await new Promise((resolve,reject)=>{legacy.stdout.on('data',d=>{const m=String(d).match(/listening on (\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});legacy.on('error',reject);legacy.on('exit',code=>reject(Error('legacy launch failed '+code)));});
  assert.equal((await fetch(url+'/api/health')).status,200);assert.equal((await fetch(url+'/vendor/supabase.js')).status,200);
 }finally{legacy.kill();await once(legacy,'exit');}
});
