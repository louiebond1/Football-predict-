import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);
const FOOTBALL_DATA_TOKEN = process.env.FOOTBALL_DATA_TOKEN || '';
const COMPETITION = process.env.FOOTBALL_DATA_COMPETITION || 'PL';
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

async function readJson(req, maxBytes = 16 * 1024) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maxBytes) throw new Error('Request too large');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw new Error('Invalid JSON'); }
}

/* ---------- one-time Safari -> installed PWA auth handoff ---------- */
const AUTH_PAIR_TTL_MS = 10 * 60 * 1000;
const authPairs = new Map();
function pruneAuthPairs() {
  const now = Date.now();
  for (const [id, pair] of authPairs) if (pair.expiresAt <= now) authPairs.delete(id);
  while (authPairs.size > 500) authPairs.delete(authPairs.keys().next().value);
}
function validPairId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{24,80}$/.test(value); }
async function supabaseUser(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !accessToken) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) return null;
  return r.json();
}
async function rotateSession(refreshToken) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !refreshToken) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  if (!r.ok) return null;
  return r.json();
}

async function footballData(path, params={}) {
  if (!FOOTBALL_DATA_TOKEN) throw new Error('FOOTBALL_DATA_TOKEN is not configured');
  const url = new URL(`https://api.football-data.org/v4/${path}`);
  Object.entries(params).forEach(([k,v]) => v != null && url.searchParams.set(k, String(v)));
  const r = await fetch(url, { headers: { 'X-Auth-Token': FOOTBALL_DATA_TOKEN } });
  const data = await r.json();
  if (!r.ok) throw new Error(`football-data.org error: ${r.status} ${JSON.stringify(data)}`);
  return data;
}

const STATUS_MAP = { SCHEDULED:'NS', TIMED:'NS', IN_PLAY:'LIVE', PAUSED:'HT', FINISHED:'FT', POSTPONED:'PST', SUSPENDED:'PST', CANCELLED:'CANC', AWARDED:'FT' };
function mapStatus(s) { return STATUS_MAP[s] || s; }

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
  const expectedTables = ['profiles','groups','group_members','gameweeks','fixtures','group_gameweeks','payments','predictions','point_adjustments'];
  const expectedRpcs = ['create_group','join_group','leave_group','ensure_current_gameweek','settle_gameweek','calculate_prediction_points','admin_transfer_treasurer','admin_remove_member','admin_regenerate_join_code'];
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

async function getCurrentMatchday() {
  return cached(`matchday:${COMPETITION}`, 6*60*60*1000, async () => {
    const d = await footballData(`competitions/${COMPETITION}`);
    return d.currentSeason?.currentMatchday || null;
  });
}

function normaliseFixture(m) {
  return {
    id: m.id,
    kickoff: m.utcDate,
    status: { short: mapStatus(m.status), elapsed: null },
    venue: m.venue || null,
    league: { id: m.competition?.id, name: m.competition?.name },
    home: { id: m.homeTeam?.id, name: m.homeTeam?.shortName || m.homeTeam?.name, logo: m.homeTeam?.crest },
    away: { id: m.awayTeam?.id, name: m.awayTeam?.shortName || m.awayTeam?.name, logo: m.awayTeam?.crest },
    goals: { home: m.score?.fullTime?.home ?? null, away: m.score?.fullTime?.away ?? null },
    score: m.score
  };
}

async function syncFixtures(matchday, rawMatches) {
  if (!SUPABASE_SECRET_KEY || !rawMatches.length) return;
  const dates = rawMatches.map(m => new Date(m.utcDate).getTime()).filter(Number.isFinite);
  const season = Number(rawMatches[0]?.season?.startDate?.slice(0,4)) || new Date().getFullYear();
  const gw = await supabaseAdmin('gameweeks?on_conflict=league_id,season,round_name', {
    method:'POST',
    body:[{
      league_id:39, season, round_name:`Matchday ${matchday}`,
      starts_at:new Date(Math.min(...dates)).toISOString(),
      ends_at:new Date(Math.max(...dates)).toISOString()
    }],
    prefer:'resolution=merge-duplicates,return=representation'
  });
  const gameweekId = gw?.[0]?.id;
  if (!gameweekId) return;
  const fixtures = rawMatches.map(m => ({
    id:m.id,
    gameweek_id:gameweekId,
    kickoff:m.utcDate,
    home_team_id:m.homeTeam.id,
    home_team_name:m.homeTeam.shortName || m.homeTeam.name,
    away_team_id:m.awayTeam.id,
    away_team_name:m.awayTeam.shortName || m.awayTeam.name,
    status:mapStatus(m.status),
    home_goals:m.score?.fullTime?.home ?? null,
    away_goals:m.score?.fullTime?.away ?? null,
    updated_at:new Date().toISOString()
  }));
  await supabaseAdmin('fixtures?on_conflict=id', {method:'POST', body:fixtures, prefer:'resolution=merge-duplicates'});
}

async function getFixtures(matchday) {
  const md = matchday || await getCurrentMatchday();
  if (!md) return [];
  // Live screens poll every 30s. Cache once server-side for the same interval so
  // ten users still produce roughly one provider request, not ten requests.
  return cached(`fixtures:${COMPETITION}:${md}`, 30*1000, async () => {
    const d = await footballData(`competitions/${COMPETITION}/matches`, { matchday: md });
    const raw = d.matches || [];
    await syncFixtures(md, raw).catch(err => console.error(err.message));
    return raw;
  });
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === '/api/health') return send(res, 200, {ok:true,app:'KickPot'});

    if (url.pathname === '/api/auth/pair/start' && req.method === 'POST') {
      pruneAuthPairs();
      const pairId = randomBytes(24).toString('base64url');
      authPairs.set(pairId, { expiresAt: Date.now() + AUTH_PAIR_TTL_MS, session: null });
      return send(res, 200, { pairId, expiresIn: Math.floor(AUTH_PAIR_TTL_MS / 1000) });
    }

    if (url.pathname === '/api/auth/pair/authorize' && req.method === 'POST') {
      pruneAuthPairs();
      const body = await readJson(req);
      const pairId = body.pairId;
      const pair = validPairId(pairId) ? authPairs.get(pairId) : null;
      if (!pair || pair.expiresAt <= Date.now()) return send(res, 404, { error:'Pairing expired' });
      const user = await supabaseUser(body.accessToken);
      if (!user?.id) return send(res, 401, { error:'Invalid session' });
      const rotated = await rotateSession(body.refreshToken);
      if (!rotated?.access_token || !rotated?.refresh_token || rotated.user?.id !== user.id) {
        return send(res, 401, { error:'Could not transfer session' });
      }
      pair.session = { accessToken: rotated.access_token, refreshToken: rotated.refresh_token, userId: user.id };
      pair.expiresAt = Date.now() + 2 * 60 * 1000;
      return send(res, 200, { ok:true });
    }

    if (url.pathname === '/api/auth/pair/status' && req.method === 'GET') {
      pruneAuthPairs();
      const pairId = url.searchParams.get('id') || '';
      const pair = validPairId(pairId) ? authPairs.get(pairId) : null;
      if (!pair) return send(res, 404, { error:'Pairing expired' });
      if (!pair.session) return send(res, 200, { ready:false });
      authPairs.delete(pairId);
      return send(res, 200, { ready:true, accessToken:pair.session.accessToken, refreshToken:pair.session.refreshToken });
    }

    if (url.pathname === '/api/debug/schema' && process.env.DEBUG_ENDPOINTS === '1') {
      const report = await inspectSchema();
      console.log('SCHEMA_INSPECT', JSON.stringify(report));
      return send(res, 200, report);
    }
    if (url.pathname === '/api/config') return send(res, 200, {
      supabaseUrl:SUPABASE_URL,
      supabasePublishableKey:SUPABASE_PUBLISHABLE_KEY,
      footballConfigured:Boolean(FOOTBALL_DATA_TOKEN),
      supabaseConfigured:Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY),
      databaseSyncConfigured:Boolean(SUPABASE_SECRET_KEY)
    });
    if (url.pathname === '/api/football/current-round') return send(res, 200, {round:await getCurrentMatchday()});
    if (url.pathname === '/api/football/fixtures') {
      const matchday = url.searchParams.get('round') || undefined;
      const raw = await getFixtures(matchday);
      const md = matchday || await getCurrentMatchday();
      return send(res, 200, {round: md ? `Matchday ${md}` : null, fixtures:raw.map(normaliseFixture)});
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
