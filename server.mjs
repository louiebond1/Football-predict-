import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {applySecurityHeaders} from './security-headers.mjs';
import { chooseRound, validateMatches } from './football.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);
const FOOTBALL_DATA_TOKEN = process.env.FOOTBALL_DATA_TOKEN || '';
const COMPETITION = process.env.FOOTBALL_DATA_COMPETITION || 'PL';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';
if(!Number.isInteger(PORT)||PORT<0||PORT>65535)throw new Error('PORT must be a valid TCP port');
if(COMPETITION!=='PL')throw new Error('KickPot requires FOOTBALL_DATA_COMPETITION=PL');
if(SUPABASE_URL){
  const url=new URL(SUPABASE_URL);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Invalid SUPABASE_URL');
  if(process.env.NODE_ENV==='production'&&url.protocol!=='https:')throw new Error('Production SUPABASE_URL must use HTTPS');
}

const cache = new Map();
const pending = new Map();
function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return Promise.resolve(hit.value);
  if (pending.has(key)) return pending.get(key);
  const promise = Promise.resolve().then(fn).then(value => {
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expires: Date.now() + ttlMs }); return value;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

function send(res, status, body, type='application/json; charset=utf-8', extra={}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(payload);
}

function timedFetch(url, options = {}) { return fetch(url, { ...options, signal: AbortSignal.timeout(12000) }); }
async function footballData(p, params={}) {
  if (!FOOTBALL_DATA_TOKEN) throw new Error('FOOTBALL_DATA_TOKEN is not configured');
  const url = new URL(`https://api.football-data.org/v4/${p}`);
  Object.entries(params).forEach(([k,v]) => v != null && url.searchParams.set(k, String(v)));
  const r = await timedFetch(url, { headers: { 'X-Auth-Token': FOOTBALL_DATA_TOKEN } });
  const data = await r.json();
  if (!r.ok) throw new Error(`football-data.org error: ${r.status} ${JSON.stringify(data)}`);
  return data;
}
const STATUS_MAP={SCHEDULED:'NS',TIMED:'NS',IN_PLAY:'LIVE',PAUSED:'HT',FINISHED:'FT',POSTPONED:'PST',SUSPENDED:'PST',CANCELLED:'CANC',AWARDED:'FT'};
function mapStatus(s){return STATUS_MAP[s]||s;}
async function supabaseAdmin(restPath,{method='GET',body,prefer=''}={}){
  if(!SUPABASE_URL||!SUPABASE_SECRET_KEY)return null;
  const r=await timedFetch(`${SUPABASE_URL}/rest/v1/${restPath}`,{method,headers:{apikey:SUPABASE_SECRET_KEY,Authorization:`Bearer ${SUPABASE_SECRET_KEY}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},body:body==null?undefined:JSON.stringify(body)});
  if(!r.ok)throw new Error(`Supabase admin error ${r.status}: ${await r.text()}`);
  const text=await r.text();return text?JSON.parse(text):null;
}
async function getCurrentMatchday(){return cached(`matchday:${COMPETITION}`,30*1000,async()=>{
  const d=await cached(`season:${COMPETITION}`,6*60*60*1000,()=>footballData(`competitions/${COMPETITION}`));
  const season=Number(d.currentSeason?.startDate?.slice(0,4));
  if(!Number.isInteger(season))throw new Error('Invalid football season');
  const weeks=await supabaseAdmin(`gameweeks?league_id=eq.39&season=eq.${season}&select=round_name,fixtures(status)&order=starts_at.asc`);
  return chooseRound(d.currentSeason?.currentMatchday,weeks||[]);
});}
function normaliseFixture(m){return{id:m.id,kickoff:m.utcDate,status:{short:mapStatus(m.status),elapsed:null},venue:m.venue||null,league:{id:m.competition?.id,name:m.competition?.name},home:{id:m.homeTeam?.id,name:m.homeTeam?.shortName||m.homeTeam?.name,logo:m.homeTeam?.crest},away:{id:m.awayTeam?.id,name:m.awayTeam?.shortName||m.awayTeam?.name,logo:m.awayTeam?.crest},goals:{home:m.score?.fullTime?.home??null,away:m.score?.fullTime?.away??null},score:m.score};}
async function syncFixtures(matchday,rawMatches){if(!SUPABASE_SECRET_KEY||!rawMatches.length)return;const dates=rawMatches.map(m=>new Date(m.utcDate).getTime()).filter(Number.isFinite);const season=Number(rawMatches[0]?.season?.startDate?.slice(0,4))||new Date().getFullYear();const gw=await supabaseAdmin('gameweeks?on_conflict=league_id,season,round_name',{method:'POST',body:[{league_id:39,season,round_name:`Matchday ${matchday}`,starts_at:new Date(Math.min(...dates)).toISOString(),ends_at:new Date(Math.max(...dates)).toISOString()}],prefer:'resolution=merge-duplicates,return=representation'});const gameweekId=gw?.[0]?.id;if(!gameweekId)return;const fixtures=rawMatches.map(m=>({id:m.id,gameweek_id:gameweekId,kickoff:m.utcDate,home_team_id:m.homeTeam.id,home_team_name:m.homeTeam.shortName||m.homeTeam.name,away_team_id:m.awayTeam.id,away_team_name:m.awayTeam.shortName||m.awayTeam.name,status:mapStatus(m.status),home_goals:m.score?.fullTime?.home??null,away_goals:m.score?.fullTime?.away??null,updated_at:new Date().toISOString()}));await supabaseAdmin('fixtures?on_conflict=id',{method:'POST',body:fixtures,prefer:'resolution=merge-duplicates'});return gameweekId;}
async function getFixtures(matchday){const md=matchday||await getCurrentMatchday();if(!md)return {matches:[],gameweekId:null,matchday:null};return cached(`fixtures:${COMPETITION}:${md}`,30*1000,async()=>{const d=await footballData(`competitions/${COMPETITION}/matches`,{matchday:md});const raw=validateMatches(d.matches);const gameweekId=await syncFixtures(md,raw);return {matches:raw,gameweekId:gameweekId||null,matchday:md};});}
async function handleApi(req,res,url){try{
  if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed'},'application/json',{Allow:'GET, HEAD'});
  if(url.pathname==='/api/health')return send(res,200,{ok:true,app:'KickPot'});

  if(url.pathname==='/api/config')return send(res,200,{supabaseUrl:SUPABASE_URL,supabasePublishableKey:SUPABASE_PUBLISHABLE_KEY,footballConfigured:Boolean(FOOTBALL_DATA_TOKEN),supabaseConfigured:Boolean(SUPABASE_URL&&SUPABASE_PUBLISHABLE_KEY),databaseSyncConfigured:Boolean(SUPABASE_SECRET_KEY)});
  if(url.pathname==='/api/football/current-round')return send(res,200,{round:await getCurrentMatchday()});
  if(url.pathname==='/api/football/fixtures'){const matchday=url.searchParams.get('round')||undefined;if(matchday&&!/^(?:[1-9]|[12][0-9]|3[0-8])$/.test(matchday))return send(res,400,{error:'Round must be between 1 and 38'});const raw=await getFixtures(matchday);const md=raw.matchday;return send(res,200,{round:md?`Matchday ${md}`:null,gameweekId:raw.gameweekId,fixtures:raw.matches.map(normaliseFixture)});}
  return send(res,404,{error:'Not found'});
}catch(err){console.error('API request failed:', err.name);return send(res,503,{error:'Service temporarily unavailable. Please try again.'});}}

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
async function serveStatic(req,res,url) {
  if (!['GET','HEAD'].includes(req.method)) return send(res,405,'Method not allowed','text/plain', {Allow:'GET, HEAD'});
  let pathname;
  try { pathname=decodeURIComponent(url.pathname); } catch { return send(res,400,'Invalid path','text/plain'); }
  if (pathname.includes('\\') || pathname.includes('\0')) return send(res,400,'Invalid path','text/plain');
  const file=path.resolve(publicDir, '.'+(pathname==='/'?'/index.html':pathname));
  const relative=path.relative(publicDir,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)) return send(res,403,'Forbidden','text/plain');
  try {
    if (!(await stat(file)).isFile()) return send(res,404,'Not found','text/plain');
    const data=await readFile(file),ext=path.extname(file).toLowerCase();
    res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-cache',...(pathname==='/sw.js'?{'Service-Worker-Allowed':'/'}:{})});
    res.end(req.method==='HEAD'?undefined:data);
  } catch { return send(res,404,'Not found','text/plain'); }
}
export const server = http.createServer(async(req,res)=>{
  applySecurityHeaders(res);
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')) return await handleApi(req,res,url);
    return await serveStatic(req,res,url);
  } catch { if (!res.headersSent) send(res,400,{error:'Invalid request'}); else res.end(); }
});
if (process.env.NODE_ENV === 'production') {
  const missing = ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','FOOTBALL_DATA_TOKEN'].filter(k=>!process.env[k]);
  if (missing.length) throw new Error('Missing required configuration: '+missing.join(', '));
}
if (SUPABASE_PUBLISHABLE_KEY.startsWith('sb_secret_') || SUPABASE_PUBLISHABLE_KEY.startsWith('sbp_')) throw new Error('Public key must be a publishable or anon key');
try { if (JSON.parse(Buffer.from(SUPABASE_PUBLISHABLE_KEY.split('.')[1] || '', 'base64url').toString()).role === 'service_role') throw new Error('Service role key cannot be public'); } catch(e) { if(e.message==='Service role key cannot be public') throw e; }
server.listen(PORT,'0.0.0.0',()=>console.log('KickPot listening on '+server.address().port));
