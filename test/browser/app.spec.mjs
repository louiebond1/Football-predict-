import {test,expect} from '@playwright/test';
const uid='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
const gid='20000000-0000-0000-0000-000000000001',g2='20000000-0000-0000-0000-000000000002';
async function setup(page,{signedIn=true,paid=true,picksFailure=false,saveFailure=false,pendingSettlement=false,adminDelayMs=0}={}){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const user={id:uid,email:'louie@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 if(signedIn)await page.addInitScript(({user})=>{
  const token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:user.id,role:'authenticated',exp:4102444800}))+'.signature';
  localStorage.setItem('kickpot-auth-v2',JSON.stringify({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_at:4102444800,user}));
 },{user});
 const groups=[{id:gid,name:'Sunday Pot',join_code:'ABC123',stake_pence:500,payments_required:true,treasurer_id:uid,created_at:'2026-01-01',bank_account_name:'Test',bank_sort_code:'00-00-00',bank_account_number:'00000000'},{id:g2,name:'Friends',join_code:'ABC124',stake_pence:0,payments_required:false,treasurer_id:other,created_at:'2026-01-02'}];
 const fixtures=[{id:1,kickoff:'2099-09-14T14:00:00Z',status:{short:'NS'},home:{id:1,name:'Arsenal'},away:{id:2,name:'Chelsea'},goals:{home:null,away:null}},{id:2,kickoff:'2026-01-01T12:00:00Z',status:{short:'LIVE',elapsed:61},home:{id:3,name:'Liverpool'},away:{id:4,name:'Everton'},goals:{home:2,away:1}}];
 const predictions=[{group_id:gid,fixture_id:1,user_id:uid,predicted_home:2,predicted_away:0,points:0},{group_id:gid,fixture_id:2,user_id:other,predicted_home:1,predicted_away:1,points:0}];
 let writes=0;const mutations=[];
 await page.route('**/api/football/fixtures*',r=>r.fulfill({json:{round:'Matchday 4',gameweekId:4,fixtures}}));
 await page.route('https://agxffllgcahbacvxhqua.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1),method=req.method();
   if(url.pathname.includes('/auth/v1/'))return route.fulfill({json:user});
   if(url.pathname.includes('/rpc/'))return route.fulfill({json:table==='group_pick_status'?[{user_id:uid,submitted_count:1},{user_id:other,submitted_count:1}]:table.startsWith('ensure')?4:null});
   // Admin enhancement performs this secondary read after the base Group DOM
   // exists. Delaying it reproduces the slow mobile-network race that used to
   // expose the legacy Group screen before replacing it with the real hub.
   if(adminDelayMs&&method==='GET'&&table==='point_adjustments')await new Promise(resolve=>setTimeout(resolve,adminDelayMs));
   if(method==='POST'||method==='PATCH'){
     mutations.push({table,body:req.postDataJSON(),query:Object.fromEntries(url.searchParams)});
     if(saveFailure&&table==='predictions')return route.fulfill({status:503,json:{message:'Save unavailable. Try again.'}});
     if(table==='predictions'){writes++;const rows=req.postDataJSON();for(const p of rows){const i=predictions.findIndex(x=>x.fixture_id===p.fixture_id&&x.group_id===p.group_id&&x.user_id===p.user_id);if(i<0)predictions.push(p);else predictions[i]=p;}}
     return route.fulfill({json:[]});
   }
   const groupId=url.searchParams.get('group_id')?.slice(3)||gid;
   const tables={groups,group_members:[{group_id:groupId,user_id:uid,role:'treasurer'},{group_id:groupId,user_id:other,role:'member'}],profiles:[{id:uid,display_name:'Louie'},{id:other,display_name:'Alex'}],payments:[{group_id:groupId,gameweek_id:4,user_id:uid,confirmed_paid_at:paid?'2026-01-01':null},{group_id:groupId,gameweek_id:4,user_id:other}],predictions,group_leaderboard:[{group_id:gid,gameweek_id:4,user_id:uid,display_name:'Louie',points:4,exact_scores:1},{group_id:gid,gameweek_id:4,user_id:other,display_name:'Alex',points:2}],group_gameweeks:[],point_adjustments:[],gameweeks:[{id:4,round_name:'Matchday 4'}]};
   if(picksFailure&&table==='predictions'&&!url.searchParams.has('user_id'))return route.fulfill({status:503,json:{message:'Picks unavailable'}});
   let data=tables[table]||[];
   if(pendingSettlement&&table==='group_gameweeks')data=[{group_id:gid,gameweek_id:3,settled_at:null,gameweeks:{round_name:'Matchday 3',fixtures:[{status:'FT',home_goals:2,away_goals:1}]}}];
   for(const [key,filter]of url.searchParams){if(filter.startsWith('eq.'))data=data.filter(r=>String(r[key])===filter.slice(3));if(filter.startsWith('in.'))data=data.filter(r=>filter.slice(4,-1).split(',').includes(String(r[key])));}
   if(req.headers().accept?.includes('vnd.pgrst.object'))data=data[0]||null;
   await route.fulfill({json:data});
 });
 return {errors,fixtures,predictions,mutations,writes:()=>writes};
}
test('Matchday save/edit, Live reveal, back navigation, and group isolation',async({page})=>{
 const h=await setup(page);await page.goto('/');
 await expect(page.locator('.kp-native-hero')).toBeVisible();
 await page.getByRole('button',{name:'Increase Arsenal score'}).click();
 await page.locator('#kpNativeLock').click();await expect(page.locator('#kpNativeStatus')).toContainText('Picks saved');expect(h.writes()).toBe(1);
 expect(h.predictions.find(p=>p.fixture_id===1&&p.user_id===uid).predicted_home).toBe(3);
 await page.locator('[data-tab=live]').click();await expect(page.locator('[data-live-view=table]')).toBeVisible();
 await page.getByRole('button',{name:'Live fixtures'}).click();
 await expect(page.locator('.kp-live-fxc')).toHaveCount(2);
 await expect(page.locator('summary')).toHaveCount(1);
 await page.locator('summary').click();await expect(page.locator('.kp-live-group-picks-list')).toContainText('Alex');
 await expect(page.locator('.kp-live-group-picks-list')).toContainText('1–1');
 await page.getByRole('button',{name:'Back to Live Table'}).click();await expect(page.locator('[data-live-view=table]')).toBeVisible();
 await page.getByRole('button',{name:'My picks'}).click();await expect(page.locator('.kp-live-picks')).toContainText('3-0');
 await page.locator('[data-tab=gw]').click();await page.locator('#groupSwitch').selectOption(g2);
 await expect(page.locator('.kp-native-hero')).toBeVisible();await expect(page.locator('[data-score-value="1,home"]')).toHaveText('1');
 await page.locator('[data-tab=live]').click();await page.getByRole('button',{name:'Live fixtures'}).click();await expect(page.locator('.kp-live-group-picks-list')).not.toContainText('1–1');
 expect(h.errors).toEqual([]);
});
test('Group panels, payments, admin, history, account and small-screen layout',async({page})=>{
 const h=await setup(page);await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();
 await page.locator('[data-tab=group]').click();await expect(page.locator('.group-reference-hub')).toBeVisible();
 for(const panel of ['members','rules','settings','payments']){
   await page.locator('.group-reference-menu [data-open='+panel+']').click();await expect(page.locator('.group-reference-panel')).toBeVisible();
   await page.locator('.group-reference-back').click();await expect(page.locator('.group-reference-panel')).toHaveCount(0);
 }
 await page.locator('[data-open=admin]').click();await expect(page.locator('.kp-admin-menu')).toBeVisible();
 await page.locator('.group-reference-back').click();
 await page.locator('[data-tab=history]').click();await expect(page.locator('#kpHistoryInlineV2')).toContainText('No completed Matchdays');
 await page.locator('#userChip').click();await expect(page.getByRole('dialog',{name:'Account settings'})).toBeVisible();await page.getByRole('button',{name:'Close',exact:true}).click();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow).toBe(false);expect(h.errors).toEqual([]);
});

test('slow admin data never exposes a second Group UI and mobile back returns to the hub',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const h=await setup(page,{adminDelayMs:900});
 await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();
 await page.locator('[data-tab=group]').click();

 // During the delayed role/admin read, only the neutral loading treatment may
 // paint. The legacy card list is still present for logic hooks, but hidden.
 await expect(page.locator('.kp-group-loading-cover')).toBeVisible();
 await expect(page.locator('#screen > .kp3-group-root')).not.toBeVisible();
 await expect(page.locator('.group-reference-hub')).toBeVisible();
 const hub=page.locator('.group-reference-hub');
 const originalHub=await hub.evaluate(element=>{element.dataset.regressionIdentity='original';return element.dataset.regressionIdentity;});
 expect(originalHub).toBe('original');
 await expect(hub.getByRole('button',{name:/Admin/})).toBeVisible();

 // Waiting beyond the old delayed-render window must not replace the hub.
 await page.waitForTimeout(1100);
 await expect(page.locator('.group-reference-hub[data-regression-identity="original"]')).toBeVisible();
 await expect(page.locator('.kp-group-loading-cover')).not.toBeVisible();

 await hub.locator('.group-reference-menu [data-open=members]').click();
 await expect(page.locator('.group-reference-panel')).toBeVisible();
 await page.goBack();
 await expect(page.locator('.group-reference-panel')).toHaveCount(0);
 await expect(page.locator('.group-reference-hub')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
 expect(h.errors).toEqual([]);
});
test('unpaid users cannot edit or save; reveal failures are visible',async({page})=>{
 const h=await setup(page,{paid:false,picksFailure:true});await page.goto('/');await expect(page.locator('#kpNativeLock')).toBeDisabled();
 await expect(page.locator('[data-score-step]')).toHaveCount(0);await page.locator('[data-tab=live]').click();await page.getByRole('button',{name:'Live fixtures'}).click();await expect(page.locator('#screen')).toContainText('Group picks unavailable');expect(h.writes()).toBe(0);expect(h.errors).toEqual([]);
});
test('signed-out screen is stable and never replaced by Matchday',async({page})=>{
 const h=await setup(page,{signedIn:false});await page.goto('/');await expect(page.locator('#kpPasswordSubmit')).toBeVisible();
 await expect(page.locator('.bottom-nav')).toBeHidden();
 await page.locator('#kpAuthRegisterTab').click();await expect(page.locator('#authDisplayName')).toBeVisible();
 await page.locator('#kpAuthLoginTab').click();await expect(page.locator('#kpPasswordSubmit')).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await expect(page.locator('.kp-native-hero')).toHaveCount(0);
 expect(h.errors).toEqual([]);
});

test('kickoff locks unsaved picks and Live refresh keeps group picks expanded',async({page})=>{
 const h=await setup(page);await page.clock.install({time:new Date('2026-09-13T12:00:00Z')});
 h.fixtures[0].kickoff='2026-09-13T12:00:05Z';await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();
 await page.getByRole('button',{name:'Increase Arsenal score'}).click();
 await page.clock.fastForward(6000);await expect(page.locator('[data-score-step]')).toHaveCount(0);await expect(page.locator('#kpNativeLock')).toBeDisabled();
 await page.locator('[data-tab=live]').click();await page.getByRole('button',{name:'Live fixtures'}).click();
 await expect(page.locator('summary')).toHaveCount(2);await page.locator('summary').last().click();
 await page.clock.fastForward(31000);await expect(page.locator('details[open]')).toHaveCount(1);await expect(page.locator('details[open]')).toContainText('Alex');
 expect(h.writes()).toBe(0);expect(h.errors).toEqual([]);
});

test('failed save preserves drafts and browser back restores the previous screen',async({page})=>{
 const h=await setup(page,{saveFailure:true});await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();
 await page.getByRole('button',{name:'Increase Arsenal score'}).click();await page.locator('#kpNativeLock').click();
 await expect(page.locator('#kpNativeStatus')).toContainText('Save unavailable');await expect(page.locator('#kpNativeLock')).toBeEnabled();
 await expect(page.locator('[data-score-value="1,home"]')).toHaveText('3');
 await page.locator('[data-tab=group]').click();await page.locator('.group-reference-menu [data-open=members]').click();
 await page.goBack();await expect(page.locator('.group-reference-panel')).toHaveCount(0);await expect(page.locator('.group-reference-hub')).toBeVisible();
 await page.goBack();await expect(page.locator('.kp-native-hero')).toBeVisible();await expect(page.locator('[data-score-value="1,home"]')).toHaveText('3');
 expect(h.errors).toEqual([]);
});

test('finished previous Matchday remains available to settle after rollover',async({page})=>{
 const h=await setup(page,{pendingSettlement:true});await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();
 await page.locator('[data-tab=history]').click();await expect(page.locator('[data-settle-week="3"]')).toBeVisible();
 const request=page.waitForRequest(r=>r.url().includes('/rpc/settle_gameweek'));
 await page.locator('[data-settle-week="3"]').click();expect((await request).postDataJSON()).toEqual({p_group_id:gid,p_gameweek_id:3});expect(h.errors).toEqual([]);
});

test('visual baseline has no horizontal overflow on key screens',async({page},testInfo)=>{
 const h=await setup(page);await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();
 for(const tab of ['gw','live','group','history']){
   if(tab!=='gw')await page.locator('[data-tab='+tab+']').click();
   await expect(page.locator({gw:'.kp-native-hero',live:'.kp-live-board',group:'.group-reference-hub',history:'#kpHistoryInlineV2'}[tab])).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
   await page.screenshot({path:testInfo.outputPath(tab+'.png'),fullPage:true});
 }
 expect(h.errors).toEqual([]);
});

test('score targets stay visible and theme preference survives navigation',async({page})=>{
 await setup(page);await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();
 for(const button of await page.locator('[data-score-step]').all()){
  const box=await button.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await button.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right+1&&r.bottom<=p.bottom+1;})).toBe(true);
 }
 await page.locator('[data-tab=group]').click();await expect(page.locator('.group-reference-hub')).toBeVisible();
 await page.locator('#kpThemeToggle').click();await expect(page.locator('html')).toHaveAttribute('data-kp-theme','dark');
 await expect(page.locator('html')).toHaveAttribute('data-kp-theme','dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-kp-theme','dark');
});

test('payment claim stays scoped to the displayed week and admin confirmation is deliberate',async({page})=>{
 const h=await setup(page,{paid:false});await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();
 await page.locator('[data-tab=group]').click();await page.locator('.group-reference-menu [data-open=payments]').click();
 await page.locator('#claimPaid').click();await expect.poll(()=>h.mutations.filter(m=>m.table==='payments').length).toBe(1);
 const payment=h.mutations.find(m=>m.table==='payments');expect(payment.query.group_id).toBe('eq.'+gid);expect(payment.query.gameweek_id).toBe('eq.4');expect(payment.query.user_id).toBe('eq.'+uid);
 // The old claim button stays disabled until the awaited refresh completes.
 // Wait for the replacement panel, rather than inspecting the covered old hub.
 await expect(page.locator('.group-reference-panel #claimPaid')).toBeEnabled();
 await page.locator('.group-reference-back').click();
 await expect(page.locator('.group-reference-panel')).toHaveCount(0);
 await page.locator('[data-open=admin]').click();await page.getByRole('button',{name:/Payment control/}).click();
 await page.locator('.kp-admin-member-action').filter({hasText:'Alex'}).click();
 await expect(page.getByRole('dialog',{name:'Mark as paid?'})).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 expect(h.mutations.filter(m=>m.table==='payments')).toHaveLength(1);
 await page.locator('.kp-admin-member-action').filter({hasText:'Alex'}).click();await page.getByRole('button',{name:'Mark paid',exact:true}).click();
 await expect.poll(()=>h.mutations.filter(m=>m.table==='payments').length).toBe(2);expect(h.errors).toEqual([]);
});

test('History uses settled snapshot totals and preserves tied ranks in player drill-in',async({page})=>{
 const h=await setup(page);
 await page.route('**/rest/v1/gameweek_standings_snapshots*',r=>r.fulfill({json:[{group_id:gid,gameweek_id:4,user_id:uid,display_name:'Louie',points:7,exact_scores:2,team_score_hits:4,final_rank:1},{group_id:gid,gameweek_id:4,user_id:other,display_name:'Alex',points:7,exact_scores:2,team_score_hits:4,final_rank:1}]}));
 await page.route('**/rest/v1/group_gameweeks*',r=>r.fulfill({json:[{group_id:gid,gameweek_id:4,settled_at:'2026-01-02',settlement_kind:'draw',winner_user_ids:[uid,other],gameweeks:{round_name:'Matchday 4'}}]}));
 await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();await page.locator('[data-tab=history]').click();
 await expect(page.locator('.kp-hi-rank')).toHaveText(['1','1']);await expect(page.locator('#screen')).toContainText('DRAW');
 await page.locator('[data-hi-user="'+other+'"]').click();await expect(page.locator('.kp-hi-player-summary')).toContainText('7 pts');
 await page.getByRole('button',{name:'Back to table'}).click();await expect(page.locator('.kp-hi-rank')).toHaveText(['1','1']);expect(h.errors).toEqual([]);
});

test('signing out clears drafts and removes authenticated screens',async({page})=>{
 const h=await setup(page);await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();await page.getByRole('button',{name:'Increase Arsenal score'}).click();
 await page.locator('#userChip').click();await page.locator('#kpAccountSignOut').click();await expect(page.locator('#kpPasswordSubmit')).toBeVisible();
 await expect(page.locator('.kp-native-hero,.kp-account-overlay')).toHaveCount(0);await expect(page.locator('.bottom-nav')).toBeHidden();
 expect(await page.evaluate(()=>window.KickPotApp.context().groups.length)).toBe(0);expect(h.errors).toEqual([]);
});
