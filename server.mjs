import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.FOOTBALL_API_KEY || '';
const LEAGUE_ID = process.env.PREMIER_LEAGUE_ID || '39';
const SEASON = process.env.PREMIER_LEAGUE_SEASON || '2026';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';

const cache = new Map();
function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return Promise.resolve(hit.value);
  return fn().then(value => { cache.set(key, { value, expires: now + ttlMs }); return value; });
}

function send(res, status, body, type='application/json; charset=utf-8', extra={}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(payload);
}

async function apiFootball(endpoint, params={}) {
  if (!API_KEY) throw new Error('FOOTBALL_API_KEY is not configured');
  const url = new URL(`https://v3.football.api-sports.io/${endpoint}`);
  Object.entries(params).forEach(([k,v]) => v != null && url.searchParams.set(k, String(v)));
  const r = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
  const data = await r.json();
  if (!r.ok || (data.errors && Object.keys(data.errors).length)) {
    throw new Error(`Football API error: ${r.status} ${JSON.stringify(data.errors || data)}`);
  }
  return data;
}

async function supabaseAdmin(restPath, {method='GET', body, prefer=''}={}) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${restPath}`, {
    method,
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Supabase admin error ${r.status}: ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

async function inspectSchema() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) return { error: 'SUPABASE_SECRET_KEY not configured' };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}`, Accept: 'application/openapi+json' }
  });
  if (!r.ok) return { error: `openapi fetch failed: ${r.status} ${await r.text()}` };
  const spec = await r.json();
  const expectedTables = ['profiles','groups','group_members','gameweeks','fixtures','group_gameweeks','payments','predictions'];
  const expectedRpcs = ['create_group','join_group','ensure_current_gameweek','settle_gameweek','calculate_prediction_points'];
  const tables = {};
  for (const t of expectedTables) {
    const def = spec.definitions?.[t];
    tables[t] = def ? Object.keys(def.properties || {}) : null;
  }
  const views = { group_leaderboard: spec.definitions?.group_leaderboard ? Object.keys(spec.definitions.group_leaderboard.properties || {}) : null };
  const rpcs = {};
  for (const fn of expectedRpcs) rpcs[fn] = Boolean(spec.paths?.[`/rpc/${fn}`]);
  return { tables, views, rpcs };
}

async function getCurrentRound() {
  return cached(`round:${SEASON}`, 6*60*60*1000, async () => {
    const d = await apiFootball('fixtures/rounds', { league: LEAGUE_ID, season: SEASON, current: 'true' });
    return d.response?.[0] || null;
  });
}

function normaliseFixture(x) {
  return {
    id: x.fixture?.id,
    kickoff: x.fixture?.date,
    status: x.fixture?.status,
    venue: x.fixture?.venue,
    league: x.league,
    home: x.teams?.home,
    away: x.teams?.away,
    goals: x.goals,
    score: x.score
  };
}

async function syncFixtures(round, rawFixtures) {
  if (!SUPABASE_SECRET_KEY || !rawFixtures.length) return;
  const dates = rawFixtures.map(f => new Date(f.fixture.date).getTime()).filter(Number.isFinite);
  const gw = await supabaseAdmin('gameweeks?on_conflict=league_id,season,round_name', {
    method:'POST',
    body:[{
      league_id:Number(LEAGUE_ID), season:Number(SEASON), round_name:round,
      starts_at:new Date(Math.min(...dates)).toISOString(),
      ends_at:new Date(Math.max(...dates)).toISOString()
    }],
    prefer:'resolution=merge-duplicates,return=representation'
  });
  const gameweekId = gw?.[0]?.id;
  if (!gameweekId) return;
  const fixtures = rawFixtures.map(f => ({
    id:f.fixture.id,
    gameweek_id:gameweekId,
    kickoff:f.fixture.date,
    home_team_id:f.teams.home.id,
    home_team_name:f.teams.home.name,
    away_team_id:f.teams.away.id,
    away_team_name:f.teams.away.name,
    status:f.fixture.status?.short || null,
    home_goals:f.goals?.home,
    away_goals:f.goals?.away,
    ...((['FT','AET','PEN'].includes(f.fixture.status?.short) && f.goals?.home===0 && f.goals?.away===0)
      ? {first_scorer_player_id:0, first_scorer_name:'No goalscorer'} : {}),
    updated_at:new Date().toISOString()
  }));
  await supabaseAdmin('fixtures?on_conflict=id', {method:'POST', body:fixtures, prefer:'resolution=merge-duplicates'});
}

async function getFixtures(round) {
  const r = round || await getCurrentRound();
  if (!r) return [];
  return cached(`fixtures:${SEASON}:${r}`, 5*60*1000, async () => {
    const d = await apiFootball('fixtures', { league: LEAGUE_ID, season: SEASON, round:r });
    const raw = d.response || [];
    await syncFixtures(r, raw).catch(err => console.error(err.message));
    return raw;
  });
}

async function getFixtureEvents(fixtureId) {
  return cached(`events:${fixtureId}`, 90*1000, async () => {
    const d = await apiFootball('fixtures/events', { fixture:fixtureId });
    return d.response || [];
  });
}

function firstGoalScorer(events) {
  const goals = events.filter(e => e.type === 'Goal' && e.detail !== 'Missed Penalty' && e.detail !== 'Own Goal');
  if (!goals.length) return null;
  goals.sort((a,b) => ((a.time?.elapsed||0)*60+(a.time?.extra||0))-((b.time?.elapsed||0)*60+(b.time?.extra||0)));
  const g = goals[0];
  return { playerId:g.player?.id, player:g.player?.name, teamId:g.team?.id, team:g.team?.name, minute:g.time?.elapsed, detail:g.detail };
}

async function squad(teamId) {
  return cached(`squad:${teamId}`, 24*60*60*1000, async () => {
    const d = await apiFootball('players/squads', { team:teamId });
    return d.response?.[0]?.players || [];
  });
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === '/api/health') return send(res, 200, {ok:true,app:'KickPot'});
    if (url.pathname === '/api/debug/schema' && process.env.DEBUG_ENDPOINTS === '1') {
      const report = await inspectSchema();
      console.log('SCHEMA_INSPECT', JSON.stringify(report));
      return send(res, 200, report);
    }
    if (url.pathname === '/api/config') return send(res, 200, {
      supabaseUrl:SUPABASE_URL,
      supabasePublishableKey:SUPABASE_PUBLISHABLE_KEY,
      footballConfigured:Boolean(API_KEY),
      supabaseConfigured:Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY),
      databaseSyncConfigured:Boolean(SUPABASE_SECRET_KEY)
    });
    if (url.pathname === '/api/football/current-round') return send(res, 200, {round:await getCurrentRound()});
    if (url.pathname === '/api/football/fixtures') {
      const round = url.searchParams.get('round') || undefined;
      const raw = await getFixtures(round);
      return send(res, 200, {round:round || await getCurrentRound(),fixtures:raw.map(normaliseFixture)});
    }
    const scorers = url.pathname.match(/^\/api\/football\/fixtures\/(\d+)\/scorers$/);
    if (scorers) {
      const raw = await getFixtures();
      const fixture = raw.find(f => String(f.fixture.id) === scorers[1]);
      if (!fixture) return send(res, 404, {error:'Fixture not found'});
      const [home,away] = await Promise.all([squad(fixture.teams.home.id),squad(fixture.teams.away.id)]);
      return send(res, 200, {players:[
        {id:0,name:'No goalscorer',team:'No goalscorer'},
        ...home.map(p=>({id:p.id,name:p.name,team:fixture.teams.home.name,position:p.position})),
        ...away.map(p=>({id:p.id,name:p.name,team:fixture.teams.away.name,position:p.position}))
      ]});
    }
    const ev = url.pathname.match(/^\/api\/football\/fixtures\/(\d+)\/events$/);
    if (ev) {
      const events = await getFixtureEvents(ev[1]);
      const first = firstGoalScorer(events);
      if (first && SUPABASE_SECRET_KEY) {
        await supabaseAdmin(`fixtures?id=eq.${ev[1]}`, {
          method:'PATCH',
          body:{first_scorer_player_id:first.playerId,first_scorer_name:first.player,updated_at:new Date().toISOString()}
        }).catch(err=>console.error(err.message));
      }
      return send(res, 200, {events,firstGoalScorer:first});
    }
    return send(res, 404, {error:'Not found'});
  } catch (err) {
    return send(res, 500, {error:err.message});
  }
}

const mime = {
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'
};

async function serveStatic(req,res,url) {
  let reqPath = decodeURIComponent(url.pathname);
  if (reqPath === '/') reqPath = '/index.html';
  let file = path.normalize(path.join(publicDir,reqPath));
  if (!file.startsWith(publicDir)) return send(res,403,'Forbidden','text/plain');
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file,'index.html');
    const data = await readFile(file);
    const ext = path.extname(file);
    const longCache = ['.png','.ico'].includes(ext);
    res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':longCache?'public, max-age=86400':'no-cache'});
    res.end(data);
  } catch {
    const html = await readFile(path.join(publicDir,'index.html'));
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});
    res.end(html);
  }
}

http.createServer(async (req,res) => {
  const url = new URL(req.url,`http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req,res,url);
  return serveStatic(req,res,url);
}).listen(PORT,'0.0.0.0',()=>console.log(`KickPot listening on ${PORT}`));
