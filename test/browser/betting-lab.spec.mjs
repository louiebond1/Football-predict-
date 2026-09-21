import {test,expect} from '@playwright/test';
const uid='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
const gid='20000000-0000-0000-0000-000000000001';

/* Trimmed copy of app.spec.mjs's auth/Supabase stub — asUid picks which user
 * is "signed in"; uid is the group's treasurer (the only admin concept that
 * exists in KickPot), other is an ordinary member of the same group. */
async function setup(page,{asUid=uid}={}){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const user={id:asUid,email:asUid===uid?'louie@example.test':'alex@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  await page.addInitScript(({user})=>{
    const token=btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:user.id,role:'authenticated',exp:4102444800}))+'.signature';
    localStorage.setItem('kickpot-auth-v2',JSON.stringify({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_at:4102444800,user}));
  },{user});
  const groups=[{id:gid,name:'Sunday Pot',join_code:'ABC123',stake_pence:500,payments_required:true,treasurer_id:uid,created_at:'2026-01-01'}];
  const fixtures=[{id:1,kickoff:'2099-09-14T14:00:00Z',status:{short:'NS'},home:{id:1,name:'Arsenal'},away:{id:2,name:'Chelsea'},goals:{home:null,away:null}}];
  await page.route('**/api/football/fixtures*',r=>r.fulfill({json:{round:'Matchday 4',gameweekId:4,fixtures}}));
  await page.route('https://agxffllgcahbacvxhqua.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url()),table=url.pathname.split('/').at(-1),method=req.method();
    if(url.pathname.includes('/auth/v1/'))return route.fulfill({json:user});
    if(url.pathname.includes('/rpc/'))return route.fulfill({json:table.startsWith('ensure')?4:null});
    if(method==='POST'||method==='PATCH')return route.fulfill({json:[]});
    const groupId=url.searchParams.get('group_id')?.slice(3)||gid;
    const tables={groups,group_members:[{group_id:groupId,user_id:uid,role:'treasurer'},{group_id:groupId,user_id:other,role:'member'}],profiles:[{id:uid,display_name:'Louie'},{id:other,display_name:'Alex'}],payments:[{group_id:groupId,gameweek_id:4,user_id:uid,confirmed_paid_at:'2026-01-01'},{group_id:groupId,gameweek_id:4,user_id:other,confirmed_paid_at:'2026-01-01'}],predictions:[],group_gameweeks:[],point_adjustments:[],gameweeks:[{id:4,round_name:'Matchday 4'}]};
    let data=tables[table]||[];
    for(const [key,filter]of url.searchParams){if(filter.startsWith('eq.'))data=data.filter(r=>String(r[key])===filter.slice(3));if(filter.startsWith('in.'))data=data.filter(r=>filter.slice(4,-1).split(',').includes(String(r[key])));}
    if(req.headers().accept?.includes('vnd.pgrst.object'))data=data[0]||null;
    await route.fulfill({json:data});
  });
  return {errors};
}

test('admin sees the Betting Mode Lab entry and can open it; normal member does not see it and is denied by direct URL',async({page})=>{
  const h=await setup(page,{asUid:uid});
  await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();
  await page.locator('[data-tab=group]').click();
  await page.locator('[data-open=admin]').click();
  await expect(page.locator('.kp-admin-menu')).toBeVisible();
  await expect(page.getByRole('button',{name:/Betting Mode Lab/})).toBeVisible();
  await page.getByRole('button',{name:/Betting Mode Lab/}).click();
  await expect(page.locator('.kp-betting-lab')).toBeVisible();
  await expect(page.locator('.kp-betting-lab')).toContainText('£100.00');
  await expect(page.locator('.kbl-prototype-tag')).toContainText('PROTOTYPE');
  expect(h.errors).toEqual([]);
});

test('normal member never sees the entry and a direct hash visit is silently denied',async({page})=>{
  const h=await setup(page,{asUid:other});
  await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();
  await page.locator('[data-tab=group]').click();
  await expect(page.locator('[data-open=admin]')).toHaveCount(0);
  await page.evaluate(()=>{window.location.hash='betting-lab';});
  await expect(page.locator('.kp-betting-lab')).toHaveCount(0,{timeout:3000});
  await expect(page.locator('.kp-betting-lab-checking')).toHaveCount(0);
  await page.waitForFunction(()=>window.location.hash==='');
  expect(h.errors).toEqual([]);
});

test('direct hash visit as admin also opens the lab (defense in depth, not just nav hiding)',async({page})=>{
  await setup(page,{asUid:uid});
  await page.goto('/#betting-lab');
  await expect(page.locator('.kp-betting-lab')).toBeVisible();
});

test('full fake-money game loop: select, replace, accumulator, stake, place, settle, leaderboard, reset, persistence',async({page})=>{
  const h=await setup(page,{asUid:uid});
  await page.goto('/#betting-lab');
  const lab=page.locator('.kp-betting-lab');
  await expect(lab).toBeVisible();
  await expect(lab.locator('.kbl-bankroll-amount')).toHaveText('£100.00');

  const fixtures=lab.locator('.kbl-fixture');
  await expect(fixtures).toHaveCount(10);
  const first=fixtures.nth(0), second=fixtures.nth(1);

  // Select a single (Home) on the first fixture.
  const firstOdds=first.locator('.kbl-odds-cell').nth(0);
  const firstOddsValue=Number(await firstOdds.locator('.kbl-odds-value').innerText());
  await firstOdds.click();
  await expect(firstOdds).toHaveClass(/is-selected/);
  await expect(lab.locator('.kbl-slip')).toBeVisible();
  await expect(lab.locator('.kbl-slip-items .kbl-slip-item')).toHaveCount(1);

  // Deselect it.
  await firstOdds.click();
  await expect(lab.locator('.kbl-slipbar')).toBeHidden();

  // Re-select Home, then replace with Draw on the same fixture.
  await firstOdds.click();
  const firstDraw=first.locator('.kbl-odds-cell').nth(1);
  const firstDrawValue=Number(await firstDraw.locator('.kbl-odds-value').innerText());
  await firstDraw.click();
  await expect(lab.locator('.kbl-toast')).toContainText('Replaced');
  await expect(lab.locator('.kbl-slip-items .kbl-slip-item')).toHaveCount(1);

  // Add a second fixture's selection -> accumulator.
  const secondOdds=second.locator('.kbl-odds-cell').nth(0);
  const secondOddsValue=Number(await secondOdds.locator('.kbl-odds-value').innerText());
  await secondOdds.click();
  await expect(lab.locator('.kbl-slip-items .kbl-slip-item')).toHaveCount(2);
  const expectedCombined=(Math.round(firstDrawValue*secondOddsValue*100)/100).toFixed(2);
  await expect(lab.locator('[data-total-odds]')).toHaveText(expectedCombined);

  // Quick stake button.
  await lab.locator('[data-quick="1000"]').click();
  await expect(lab.locator('[data-potential-return]')).toHaveText(`£${(10*Number(expectedCombined)).toFixed(2)}`);

  // Insufficient balance is prevented.
  await lab.locator('[data-stake]').fill('500');
  await expect(lab.locator('[data-insufficient]')).toBeVisible();
  await expect(lab.locator('[data-place]')).toBeDisabled();

  // Back to an affordable stake and place the bet.
  await lab.locator('[data-quick="1000"]').click();
  await expect(lab.locator('[data-place]')).toBeEnabled();
  await lab.locator('[data-place]').click();
  await expect(lab.locator('.kbl-toast')).toContainText('Bet placed');
  await expect(lab.locator('.kbl-slipbar')).toBeHidden();
  await expect(lab.locator('.kbl-bankroll-amount')).toHaveText('£90.00');

  // Open Bets shows it.
  await lab.locator('[data-tab="mybets"]').click();
  await expect(lab.locator('.kbl-bet-card')).toHaveCount(1);
  await expect(lab.locator('.kbl-bet-card')).toContainText('Accumulator');

  // Settle WON credits the calculated return.
  const potentialReturnPence=Math.round(1000*Number(expectedCombined));
  await lab.locator('[data-settle][data-outcome="won"]').click();
  await expect(lab.locator('.kbl-toast')).toContainText('Won');
  await expect(lab.locator('[data-tab="bet"]')).toBeVisible(); // nav still there, no crash
  const newBalancePence=9000+potentialReturnPence;
  await lab.locator('[data-tab="bet"]').click();
  await expect(lab.locator('.kbl-bankroll-amount')).toHaveText(`£${(newBalancePence/100).toFixed(2)}`);

  // Place and settle a LOST single to prove no credit happens.
  await first.locator('.kbl-odds-cell').nth(2).click();
  await lab.locator('[data-quick="500"]').click();
  await lab.locator('[data-place]').click();
  await lab.locator('[data-tab="mybets"]').click();
  await lab.locator('[data-settle][data-outcome="lost"]').click();
  await lab.locator('[data-sub="settled"]').click();
  await expect(lab.locator('.kbl-bet-card.is-settled')).toHaveCount(2);
  // Settled bets are newest-first; the LOST single was settled after the WON acca.
  await expect(lab.locator('.kbl-bet-card.is-settled').first()).toContainText('LOST');

  // Leaderboard renders with a You row.
  await lab.locator('[data-tab="table"]').click();
  await expect(lab.locator('.kbl-table-row')).toHaveCount(11); // 10 mock friends + You
  await expect(lab.locator('.kbl-table-row.is-you')).toContainText('You');

  // Reload keeps the state (localStorage persistence).
  await page.reload();
  await page.evaluate(()=>{window.location.hash='betting-lab';});
  await expect(lab).toBeVisible();
  await expect(lab.locator('.kbl-bankroll-amount')).not.toHaveText('£100.00');

  // Reset puts everything back to £100 with no bets.
  page.once('dialog',d=>d.accept());
  await lab.locator('[data-reset]').click();
  await expect(lab.locator('.kbl-bankroll-amount')).toHaveText('£100.00');
  await lab.locator('[data-tab="mybets"]').click();
  await expect(lab.locator('.kbl-empty')).toBeVisible();

  expect(h.errors).toEqual([]);
});

test('closing the lab leaves the rest of KickPot untouched',async({page})=>{
  const h=await setup(page,{asUid:uid});
  await page.goto('/');await expect(page.locator('.kp-native-hero')).toBeVisible();
  await page.evaluate(()=>{window.location.hash='betting-lab';});
  await expect(page.locator('.kp-betting-lab')).toBeVisible();
  await page.locator('[data-close]').click();
  await expect(page.locator('.kp-betting-lab')).toHaveCount(0);
  await expect(page.locator('.kp-native-hero')).toBeVisible();
  await page.locator('[data-tab=live]').click();await expect(page.locator('[data-live-view=table]')).toBeVisible();
  await page.locator('[data-tab=history]').click();await expect(page.locator('#kpHistoryInlineV2')).toBeVisible();
  await page.locator('[data-tab=group]').click();await expect(page.locator('.group-reference-hub')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  expect(h.errors).toEqual([]);
});
