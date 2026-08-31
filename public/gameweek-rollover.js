import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const screen = document.querySelector('#screen');
const GROUP_KEY = 'kp-active-group-v1';
let sb = null;
let cache = null;
let cacheAt = 0;
let busy = false;
const drafts = new Map();

function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function parseRound(label='') { return Number(String(label).match(/(\d+)/)?.[1] || 0); }
function londonDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(value));
  const get = type => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function kickoffLabel(value) {
  return new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/London', weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
}
function countdown(ms) {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms/1000), d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function crest(team) {
  const initial = esc((team?.name || '?').slice(0,1));
  return team?.logo ? `<img class="crest" src="${esc(team.logo)}" alt="" loading="lazy" data-initial="${initial}">` : `<span class="crest-fallback">${initial}</span>`;
}
async function client() {
  if (sb) return sb;
  const cfg = await fetch('/api/config', { cache:'no-store' }).then(r=>r.json()).catch(()=>null);
  if (!cfg?.supabaseConfigured) return null;
  sb = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  return sb;
}
function activeTab() { return document.querySelector('.nav-item.active')?.dataset?.tab || ''; }
function groupIdFromPage(groups) {
  const selected = document.querySelector('#groupSwitch')?.value || sessionStorage.getItem(GROUP_KEY) || '';
  return (groups || []).find(g=>g.id===selected)?.id || groups?.[0]?.id || '';
}

async function loadBridge(force=false) {
  if (!force && cache && Date.now()-cacheAt < 20000) return cache;
  const current = await fetch('/api/football/fixtures', { cache:'no-store' }).then(r=>r.json()).catch(()=>null);
  const currentRound = parseRound(current?.round);
  const currentFixtures = current?.fixtures || [];
  if (!currentRound || !currentFixtures.length) return null;

  const lastKickoff = currentFixtures.reduce((max,f)=> Math.max(max, new Date(f.kickoff).getTime() || 0), 0);
  if (!lastKickoff || londonDateKey(Date.now()) < londonDateKey(lastKickoff)) {
    cache = { active:false }; cacheAt = Date.now(); return cache;
  }

  const targetRound = currentRound + 1;
  const next = await fetch(`/api/football/fixtures?round=${targetRound}`, { cache:'no-store' }).then(r=>r.json()).catch(()=>null);
  if (!(next?.fixtures || []).length) return null;

  const c = await client();
  if (!c) return null;
  const { data:{ session } } = await c.auth.getSession();
  if (!session) return null;

  const { data:groups } = await c.from('groups').select('id,name,treasurer_id,payments_required,stake_pence').order('created_at');
  const gid = groupIdFromPage(groups || []);
  const group = (groups || []).find(g=>g.id===gid);
  if (!group) return null;

  const { data:gwRows } = await c.from('gameweeks').select('id,round_name').eq('league_id',39).eq('round_name', next.round).order('id',{ascending:false}).limit(1);
  const gameweekId = gwRows?.[0]?.id;
  if (!gameweekId) return null;

  const { error:ensureError } = await c.rpc('ensure_group_gameweek', { gid, gwid:gameweekId });
  if (ensureError) return null;

  const fixtureIds = next.fixtures.map(f=>f.id).filter(Boolean);
  const [{data:members},{data:payments},{data:profiles},{data:predictions}] = await Promise.all([
    c.from('group_members').select('user_id,role').eq('group_id',gid),
    c.from('payments').select('*').eq('group_id',gid).eq('gameweek_id',gameweekId),
    c.from('profiles').select('id,display_name'),
    fixtureIds.length ? c.from('predictions').select('*').eq('group_id',gid).eq('user_id',session.user.id).in('fixture_id',fixtureIds) : Promise.resolve({data:[]})
  ]);
  const names = new Map((profiles||[]).map(p=>[p.id,p.display_name]));
  const paymentMap = new Map((payments||[]).map(p=>[p.user_id,p]));
  const predMap = new Map((predictions||[]).map(p=>[Number(p.fixture_id),p]));
  cache = { active:true, c, session, group, gid, gameweekId, round:next.round, fixtures:next.fixtures, members:members||[], payments:paymentMap, names, predictions:predMap, currentRound };
  cacheAt = Date.now();
  return cache;
}

function pick(ctx, fixtureId) {
  const key = `${ctx.gid}:${fixtureId}`;
  if (!drafts.has(key)) {
    const p = ctx.predictions.get(Number(fixtureId));
    drafts.set(key, p ? {home:Number(p.predicted_home),away:Number(p.predicted_away)} : {home:1,away:1});
  }
  return drafts.get(key);
}
function paymentState(ctx, uid=ctx.session.user.id) { return ctx.payments.get(uid) || null; }
function isUnlocked(ctx) { return ctx.group.payments_required === false || Boolean(paymentState(ctx)?.confirmed_paid_at); }

function paymentPanel(ctx) {
  if (ctx.group.payments_required === false) return '';
  const me = paymentState(ctx);
  const mine = me?.confirmed_paid_at ? '<span class="paid">✓ Paid & unlocked</span>' : me?.claimed_paid_at ? '<span class="unpaid">Waiting for Treasurer confirmation</span>' : '<span class="unpaid">Payment required before picks unlock</span>';
  const myAction = me?.confirmed_paid_at ? '' : ctx.group.treasurer_id === ctx.session.user.id
    ? `<button class="secondary kp-roll-confirm" data-user="${ctx.session.user.id}">Confirm my payment</button>`
    : me?.claimed_paid_at ? '' : '<button class="secondary" id="kpRollClaim">I\'ve paid</button>';
  const adminRows = ctx.group.treasurer_id === ctx.session.user.id ? `<div class="kp-roll-payments">${ctx.members.map(m=>{
    const p=paymentState(ctx,m.user_id); const name=ctx.names.get(m.user_id)||'Player';
    return `<div class="payment-row"><strong>${esc(name)}</strong><span>${p?.confirmed_paid_at ? '<span class="paid">Paid ✓</span>' : `<button class="secondary chip-btn kp-roll-confirm" data-user="${m.user_id}">${p?.claimed_paid_at ? 'Confirm' : 'Mark paid'}</button>`}</span></div>`;
  }).join('')}</div>` : '';
  return `<section class="card kp-roll-payment"><div class="card-title">${esc(ctx.round)} payment</div><div class="kp-roll-pay-status">${mine}${myAction}</div>${adminRows}</section>`;
}

function fixtureRow(ctx,f) {
  const locked = Date.now() >= new Date(f.kickoff).getTime();
  const saved = ctx.predictions.get(Number(f.id));
  const p = pick(ctx,f.id);
  return `<div class="fixture kp3-pick-fixture" data-kp-roll-fixture="${f.id}">
    <div class="teams">
      <div class="team">${crest(f.home)}<span>${esc(f.home?.name)}</span></div>
      <div class="scorepick">${locked
        ? `<span class="scorebox">${saved?.predicted_home ?? '–'}</span><span class="kp3-vs">vs</span><span class="scorebox">${saved?.predicted_away ?? '–'}</span>`
        : `<div class="kp3-score-stepper"><button class="kp3-step" data-side="home" data-delta="-1">−</button><span class="scorebox" data-value="home">${p.home}</span><button class="kp3-step" data-side="home" data-delta="1">+</button></div><span class="kp3-vs">vs</span><div class="kp3-score-stepper"><button class="kp3-step" data-side="away" data-delta="-1">−</button><span class="scorebox" data-value="away">${p.away}</span><button class="kp3-step" data-side="away" data-delta="1">+</button></div>`}
      </div>
      <div class="team away"><span>${esc(f.away?.name)}</span>${crest(f.away)}</div>
    </div>
    <div class="rules">${kickoffLabel(f.kickoff)} · ${locked ? 'locked' : 'locks at kick-off'}${saved ? ' · saved ✓' : ''}</div>
  </div>`;
}

function renderBridge(ctx) {
  if (!ctx?.active || activeTab() !== 'gw' || !screen) return;
  const unlocked = isUnlocked(ctx);
  const first = ctx.fixtures.filter(f=>Date.now()<new Date(f.kickoff)).sort((a,b)=>new Date(a.kickoff)-new Date(b.kickoff))[0];
  screen.className = 'screen kp3-screen kp3-gw kp-rollover-screen';
  screen.dataset.kpRollover = ctx.round;
  screen.innerHTML = `<div class="kp3-gw-root kp-rollover-root">
    <section class="hero kp3-page-hero"><div class="eyebrow">NEXT GAMEWEEK OPEN</div><h1>${esc(ctx.round)}</h1><div class="hero-meta"><span class="pill">Opens from final-day midnight</span>${first ? `<span class="pill lock">Locks in <strong>${countdown(new Date(first.kickoff)-Date.now())}</strong></span>` : ''}</div></section>
    ${paymentPanel(ctx)}
    <section class="card kp3-fixtures-card"><div class="card-head"><div class="card-title">Your Picks</div><span class="muted">${ctx.fixtures.length} fixtures</span></div>
      ${ctx.fixtures.map(f=>fixtureRow(ctx,f)).join('')}
      <button class="primary" id="kpRollLock" ${unlocked ? '' : 'disabled'}>Lock In My Picks</button>
      <div id="kpRollStatus" class="kp3-privacy">Picks stay private until each fixture kicks off.</div>
    </section>
  </div>`;

  screen.querySelectorAll('[data-kp-roll-fixture] .kp3-step').forEach(btn=>btn.addEventListener('click',()=>{
    const row=btn.closest('[data-kp-roll-fixture]'); const id=Number(row.dataset.kpRollFixture); const p=pick(ctx,id); const side=btn.dataset.side; const delta=Number(btn.dataset.delta);
    p[side]=Math.max(0,Math.min(20,p[side]+delta));
    row.querySelector(`[data-value="${side}"]`).textContent=String(p[side]);
  }));
  screen.querySelector('#kpRollClaim')?.addEventListener('click', async()=>{
    const {error}=await ctx.c.from('payments').update({claimed_paid_at:new Date().toISOString()}).eq('group_id',ctx.gid).eq('gameweek_id',ctx.gameweekId).eq('user_id',ctx.session.user.id);
    if (!error) { cache=null; await run(true); }
  });
  screen.querySelectorAll('.kp-roll-confirm').forEach(btn=>btn.addEventListener('click', async()=>{
    const uid=btn.dataset.user;
    const {error}=await ctx.c.from('payments').update({confirmed_paid_at:new Date().toISOString(),confirmed_by:ctx.session.user.id}).eq('group_id',ctx.gid).eq('gameweek_id',ctx.gameweekId).eq('user_id',uid);
    if (!error) { cache=null; await run(true); }
  }));
  screen.querySelector('#kpRollLock')?.addEventListener('click', async()=>{
    const status=screen.querySelector('#kpRollStatus');
    const rows=ctx.fixtures.filter(f=>Date.now()<new Date(f.kickoff)).map(f=>{ const p=pick(ctx,f.id); return {group_id:ctx.gid,fixture_id:f.id,user_id:ctx.session.user.id,predicted_home:p.home,predicted_away:p.away}; });
    if (!rows.length) { status.textContent='No open fixtures left to predict.'; return; }
    status.textContent='Saving…';
    const {error}=await ctx.c.from('predictions').upsert(rows,{onConflict:'group_id,fixture_id,user_id'});
    if (error) { status.textContent=error.message; return; }
    status.textContent='✓ Picks locked in and synced for the group.';
    cache=null; setTimeout(()=>run(true),450);
  });
}

async function run(force=false) {
  if (busy || activeTab() !== 'gw') return;
  const chip=document.querySelector('#userChip');
  if (!chip || chip.hidden) return;
  busy=true;
  try { const ctx=await loadBridge(force); if (ctx?.active && activeTab()==='gw') renderBridge(ctx); }
  finally { busy=false; }
}

document.addEventListener('click',e=>{ if (e.target.closest('.nav-item[data-tab="gw"]')) setTimeout(()=>run(true),20); });
window.addEventListener('pageshow',()=>setTimeout(()=>run(true),120));
window.addEventListener('focus',()=>setTimeout(()=>run(true),120));
setInterval(()=>run(false),5000);
setTimeout(()=>run(true),180);
