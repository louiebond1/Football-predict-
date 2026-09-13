import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
let db;
const owner='10000000-0000-0000-0000-000000000001',member='10000000-0000-0000-0000-000000000002',stranger='10000000-0000-0000-0000-000000000003',group='20000000-0000-0000-0000-000000000001';
async function asUser(uid,sql){await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);try{return await db.query(sql);}finally{await db.exec('reset role');}}
test.before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon,service_role;`);
 await db.exec((await readFile('supabase/schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 for(const f of (await readdir('supabase/migrations')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.exec(`insert into auth.users(id,email) values('${owner}','owner@test.invalid'),('${member}','member@test.invalid'),('${stranger}','stranger@test.invalid');
 insert into public.profiles(id,display_name)values('${owner}','Owner'),('${member}','Member');
 insert into public.groups(id,name,join_code,treasurer_id,stake_pence,payments_required)values('${group}','Test','TEST01','${owner}',0,false);
 insert into public.group_members(group_id,user_id,role)values('${group}','${owner}','treasurer'),('${group}','${member}','member');
 insert into public.gameweeks(league_id,season,round_name,starts_at,ends_at)values(39,2026,'Matchday 1',now()-interval '1 day',now()+interval '1 day');
 insert into public.fixtures(id,gameweek_id,kickoff,home_team_name,away_team_name,status)values(1,1,now()+interval '1 day','Home','Away','NS'),(2,1,now()-interval '1 hour','Home','Away','LIVE');
 insert into public.predictions(group_id,fixture_id,user_id,predicted_home,predicted_away)values('${group}',1,'${owner}',2,0),('${group}',2,'${owner}',1,1);`);
});
test.after(async()=>{await db?.close();});
test('RLS hides other users’ picks until kickoff and excludes outsiders',async()=>{
 assert.deepEqual((await asUser(member,'select fixture_id from public.predictions order by fixture_id')).rows.map(r=>r.fixture_id),[2]);
 assert.equal((await asUser(stranger,'select * from public.predictions')).rows.length,0);
 assert.equal((await asUser(owner,'select * from public.predictions')).rows.length,2);
});
test('prediction points cannot be forged by clients',async()=>{
 await assert.rejects(asUser(owner,`update public.predictions set points=999 where fixture_id=1`),/permission|scoring/i);
 await assert.rejects(asUser(member,`insert into public.predictions(group_id,fixture_id,user_id,predicted_home,predicted_away,points)values('${group}',1,'${member}',1,0,999)`),/permission|scoring/i);
});
test('open prediction cannot be moved to a locked fixture',async()=>{
 await asUser(member,`insert into public.predictions(group_id,fixture_id,user_id,predicted_home,predicted_away)values('${group}',1,'${member}',1,0)`);
 await assert.rejects(asUser(member,`update public.predictions set fixture_id=2 where fixture_id=1 and user_id='${member}'`),/identity|fixture|row-level/i);
});
test('editing own open pick works; locked and unpaid writes fail',async()=>{
 await asUser(member,`update public.predictions set predicted_home=3 where fixture_id=1 and user_id='${member}'`);
 await assert.rejects(asUser(member,`insert into public.predictions(group_id,fixture_id,user_id,predicted_home,predicted_away)values('${group}',2,'${member}',1,0)`),/row-level|locked/i);
 await db.exec(`update public.groups set payments_required=true,stake_pence=500 where id='${group}'`);
 await assert.rejects(asUser(member,`update public.predictions set predicted_home=4 where fixture_id=1 and user_id='${member}'`),/row-level/i);
 await db.exec(`update public.groups set payments_required=false where id='${group}'`);
});
test('treasurer identity is changed only through the guarded RPC',async()=>{
 await assert.rejects(asUser(owner,`update public.groups set treasurer_id='${stranger}' where id='${group}'`),/permission/i);
 await assert.rejects(asUser(member,`select public.admin_transfer_treasurer('${group}','${stranger}')`),/treasurer/i);
});
test('members cannot confirm payments and even treasurers cannot retarget a payment',async()=>{
 await asUser(owner,`select public.ensure_group_gameweek('${group}',1)`);
 await assert.rejects(asUser(member,`update public.payments set confirmed_paid_at=now(),confirmed_by='${member}' where group_id='${group}' and user_id='${member}'`),/claim|payment|row-level/i);
 await assert.rejects(asUser(owner,`update public.payments set user_id='${stranger}' where group_id='${group}' and user_id='${member}'`),/identity/i);
 await asUser(member,`update public.payments set claimed_paid_at=now() where group_id='${group}' and user_id='${member}'`);
 await asUser(owner,`update public.payments set confirmed_paid_at=now(),confirmed_by='${owner}' where group_id='${group}' and user_id='${member}'`);
});
test('scoring computes exact and result points, and clears withdrawn results',async()=>{
 await db.exec(`update public.fixtures set status='FT',home_goals=1,away_goals=1 where id=2`);
 assert.equal((await db.query('select points from public.predictions where fixture_id=2')).rows[0].points,3);
 await db.exec(`update public.fixtures set status='LIVE',home_goals=null,away_goals=null where id=2`);
 assert.equal((await db.query('select points from public.predictions where fixture_id=2')).rows[0].points,0);
});
test('settlement requires final scores and keeps its snapshot on retries',async()=>{
 await assert.rejects(asUser(owner,`select public.settle_gameweek('${group}',1)`),/finished/i);
 await db.exec(`update public.fixtures set status='FT',home_goals=1,away_goals=1`);
 const first=(await asUser(owner,`select (public.settle_gameweek('${group}',1)).*`)).rows[0];
 assert.ok(first.settled_at);
 const snapshots=(await db.query('select * from public.gameweek_standings_snapshots order by user_id')).rows;
 assert.equal(snapshots.length,2);
 await db.exec(`update public.fixtures set home_goals=2,away_goals=0`);
 const retry=(await asUser(owner,`select (public.settle_gameweek('${group}',1)).*`)).rows[0];
 assert.deepEqual(retry,first);
 assert.deepEqual((await db.query('select * from public.gameweek_standings_snapshots order by user_id')).rows,snapshots);
 await assert.rejects(asUser(member,`select public.snapshot_gameweek_standings('${group}',1)`),/permission/i);
 assert.equal((await asUser(stranger,'select * from public.gameweek_standings_snapshots')).rows.length,0);
});
test('atomic login quota admits five attempts and denies the sixth',async()=>{
 const hash='a'.repeat(64);
 for(let i=0;i<5;i++)assert.equal((await db.query(`select public.consume_login_attempt('${hash}') as allowed`)).rows[0].allowed,true);
 assert.equal((await db.query(`select public.consume_login_attempt('${hash}') as allowed`)).rows[0].allowed,false);
 await assert.rejects(asUser(member,`select public.consume_login_attempt('${hash}')`),/permission/i);
});
