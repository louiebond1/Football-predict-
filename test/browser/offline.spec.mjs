import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'allow'});
test('cached shell and unavailable API offer a working reconnect action',async({page,context,browserName})=>{
 await page.goto('/');await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const cached=await page.evaluate(async()=>{
   const keys=await caches.keys();const cache=await caches.open(keys.find(k=>k.startsWith('kickpot-')));
   return (await cache.keys()).map(r=>new URL(r.url).pathname);
 });
 expect(cached).toContain('/vendor/supabase.js');expect(cached).not.toContain('/api/config');
 // Windows WebKit's native offline toggle fails navigation inside the engine.
 // Check cached shell installation plus API-outage recovery there; Chromium
 // additionally verifies a full offline navigation using the installed worker.
 if(browserName==='webkit')await page.addInitScript(()=>{
   const original=window.fetch.bind(window);window.restoreTestNetwork=()=>window.fetch=original;
   window.fetch=(url,options)=>String(url).includes('/api/')?Promise.reject(new TypeError('Network unavailable')):original(url,options);
 });else await context.setOffline(true);
 await page.reload();
 await expect(page.locator('#retryApp')).toBeVisible();await expect(page.locator('#screen')).toContainText('Couldn’t load KickPot');
 if(browserName==='webkit')await page.evaluate(()=>window.restoreTestNetwork());else await context.setOffline(false);
 await page.locator('#retryApp').click();await expect(page.locator('#kpPasswordSubmit')).toBeVisible();
});
