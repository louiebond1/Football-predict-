import './security-headers.mjs';
import http from 'node:http';

const publicPort = Number(process.env.PORT || 3000);
const internalPort = publicPort === 3000 ? 3001 : publicPort + 1;
process.env.PORT = String(internalPort);
await import('./server.mjs');
process.env.PORT = String(publicPort);

const HERO_URL = 'https://images.unsplash.com/photo-1663298953773-4a63966632a8?auto=format&fit=crop&q=82&w=1200';

async function sendRemoteImage(res, remoteUrl, fallbackType = 'image/png') {
  try {
    const r = await fetch(remoteUrl, { headers: { 'User-Agent': 'KickPot/1.0', 'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' } });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(200, {
      'Content-Type': r.headers.get('content-type') || fallbackType,
      'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400'
    });
    res.end(buf);
    return true;
  } catch {
    return false;
  }
}

async function handleSpecial(req, res, url) {
  if (url.pathname === '/assets/matchday-hero.jpg') {
    const ok = await sendRemoteImage(res, HERO_URL, 'image/jpeg');
    if (ok) return true;
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Hero unavailable');
    return true;
  }

  const crest = url.pathname.match(/^\/assets\/crest\/(\d+)$/);
  if (crest) {
    const id = crest[1];
    if (await sendRemoteImage(res, `https://crests.football-data.org/${id}.png`, 'image/png')) return true;
    if (await sendRemoteImage(res, `https://crests.football-data.org/${id}.svg`, 'image/svg+xml')) return true;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Crest unavailable');
    return true;
  }

  if (url.pathname === '/api/football/fixtures' && req.method === 'GET') {
    const r = await fetch(`http://127.0.0.1:${internalPort}${req.url}`, { headers: { accept: 'application/json' } });
    const text = await r.text();
    if (!r.ok) {
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(text);
      return true;
    }
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (data?.fixtures) {
      for (const fixture of data.fixtures) {
        if (fixture?.home?.id) fixture.home.logo = `/assets/crest/${fixture.home.id}`;
        if (fixture?.away?.id) fixture.away.logo = `/assets/crest/${fixture.away.id}`;
      }
    }
    const out = JSON.stringify(data ?? JSON.parse(text));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(out);
    return true;
  }

  if (url.pathname === '/reference-matchday-v1.css' && req.method === 'GET') {
    const r = await fetch(`http://127.0.0.1:${internalPort}${req.url}`);
    let css = await r.text();
    css = css.replace(/--ref-photo:url\("[^"]+"\);/, '--ref-photo:url("/assets/matchday-hero.jpg");');
    res.writeHead(r.status, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(css);
    return true;
  }

  return false;
}

function proxy(req, res) {
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: internalPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${internalPort}` }
  }, upstreamRes => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error', err => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Upstream error: ${err.message}`);
  });
  req.pipe(upstream);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (await handleSpecial(req, res, url)) return;
  proxy(req, res);
}).listen(publicPort, '0.0.0.0', () => console.log(`KickPot asset proxy listening on ${publicPort}, app on ${internalPort}`));

setTimeout(async () => {
  try { await fetch(`http://127.0.0.1:${internalPort}/api/football/fixtures`); }
  catch (error) { console.error('KickPot startup fixture sync failed:', error.message); }
}, 1500);
