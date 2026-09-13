import test from 'node:test';import assert from 'node:assert/strict';import{chooseRound}from'../football.mjs';
test('hold the current round until every fixture is final',()=>{
 assert.equal(chooseRound(4,[{round_name:'Matchday 3',fixtures:[{status:'FT'},{status:'LIVE'}]},{round_name:'Matchday 4',fixtures:[{status:'NS'}]}]),3);
});
test('advance after completion, without crossing the end of the season',()=>{
 assert.equal(chooseRound(3,[{round_name:'Matchday 3',fixtures:[{status:'FT'}]}]),4);
 assert.equal(chooseRound(38,[{round_name:'Matchday 38',fixtures:[{status:'FT'}]}]),38);
 assert.equal(chooseRound(1,[]),1);
});
import {validateMatches} from '../football.mjs';
test('malformed upstream fixtures fail before synchronization or rendering',()=>{
 const fixture={id:1,utcDate:'2026-09-13T12:00:00Z',status:'TIMED',homeTeam:{id:1,name:'Home'},awayTeam:{id:2,name:'Away'},score:{fullTime:{home:null,away:null}}};
 assert.deepEqual(validateMatches([fixture]),[fixture]);
 assert.throws(()=>validateMatches({}));assert.throws(()=>validateMatches([{...fixture,utcDate:'bad'}]));assert.throws(()=>validateMatches([{...fixture,score:{fullTime:{home:-1}}}]));
});
