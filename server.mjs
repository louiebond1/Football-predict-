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
  if (!r.ok || data.errors && Object.keys(data.errors).length) {
    throw new Error(`Football API error: ${r.status} ${JSON.stringify(data.errors || data)}`);
  }
  return data;
}

async function getCurrentRound() {
  return cached(`round:${SEASON}`, 6*60*60*1000, async () => {
    const d = await apiFootball('fixtures/rounds', { league: LEAGUE_ID, season: SEASON, current: 'true' });
    return d.response?.[0] || null;
  });
}

async function getFixtures(round) {
  const r = round || await getCurrentRound();
  if (!r) return [];
  return cached(`fixtures:${SEASON}:${r}`, 5*60*1000, async () => {
    const d = await apiFootball('fixtures', { league: LEAGUE_ID, season: SEASON, round: r });
    return d.response || [];
  });
}

async function getFixtureEvents(fixtureId) {
  return cached(`events:${fixtureId}`, 90*1000, async () => {
    const d = await apiFootball('fixtures/events', { fixture: fixtureId });
    return d.response || [];
  });
}

function firstGoalScorer(events) {
  const goals = events.filter(e => e.type === 'Goal' && e.detail !== 'Missed Penalty' && e.detail !== 'Own Goal');
  if (!goals.length) return null;
  goals.sort((a,b) => ((a.time?.elapsed||0)*60+(a.time?.extra||0))-((b.time?.elapsed||0)*60+(b.time?.extra||0)));
  const g = goals[0];
  return { playerId: g.player?.id, player: g.player?.name, teamId: g.team?.id, team: g.team?.name, minute: g.time?.elapsed, detail: g.detail };
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

async function handleApi(req, res, url) {
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ok:true, app:'KickPot' });
    if (url.pathname === '/api/config') return send(res, 200, {
      supabaseUrl: SUPABASE_URL,
      supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
      footballConfigured: Boolean(API_KEY),
      supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)
    });
    if (url.pathname === '/api/football/current-round') {
      const round = await getCurrentRound();
      return send(res, 200, { round });
    }
    if (url.pathname === '/api/football/fixtures') {
      const round = url.searchParams.get('round') || undefined;
      const fixtures = (await getFixtures(round)).map(normaliseFixture);
      return send(res, 200, { round: round || await getCurrentRound(), fixtures });
    }
    const ev = url.pathname.match(/^\/api\/football\/fixtures\/(\d+)\/events$/);
    if (ev) {
      const events = await getFixtureEvents(ev[1]);
      return send(res, 200, { events, firstGoalScorer: firstGoalScorer(events) });
    }
    return send(res, 404, { error:'Not found' });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

const mime = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.webmanifest':'application/manifest+json'
};

async function serveStatic(req, res, url) {
  let reqPath = decodeURIComponent(url.pathname);
  if (reqPath === '/') reqPath = '/index.html';
  let file = path.normalize(path.join(publicDir, reqPath));
  if (!file.startsWith(publicDir)) return send(res, 403, 'Forbidden', 'text/plain');
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, 'index.html');
    const data = await readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  } catch {
    const html = await readFile(path.join(publicDir, 'index.html'));
    res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-cache' });
    res.end(html);
  }
}

http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req,res,url);
  return serveStatic(req,res,url);
}).listen(PORT, '0.0.0.0', () => console.log(`KickPot listening on ${PORT}`));
