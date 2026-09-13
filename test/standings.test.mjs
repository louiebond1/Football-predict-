import test from'node:test';import assert from'node:assert/strict';import{readStandings}from'../public/standings.js';
test('frozen standings replace mutable totals for settled weeks',async()=>{
 const sb={from:table=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:table==='group_leaderboard'?[{gameweek_id:1,points:999},{gameweek_id:2,points:3}]:[{gameweek_id:1,points:4,display_name:'Original name'}]})};return q;}};
 assert.deepEqual(await readStandings(sb,'group'),[{gameweek_id:2,points:3},{gameweek_id:1,points:4,display_name:'Original name'}]);
});
