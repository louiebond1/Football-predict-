// Renders the KickPot trailer to MP4.
//   node render.mjs                 full film → out/KickPot_Trailer.mp4
//   node render.mjs --stills        sample frames → build/stills/*.png
//   node render.mjs --samples 1     faster draft render without motion blur
// Requires Node 18+, Playwright with Chromium, and FFmpeg on PATH.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
// createRequire also finds a globally installed Playwright, which plain ESM import does not
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const samples = +arg('--samples', 5);
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.mkdirSync(path.join(root, 'out'), { recursive: true });

const launchOpts = process.env.KP_CHROMIUM ? { executablePath: process.env.KP_CHROMIUM } : {};
const browser = await chromium.launch({ ...launchOpts, args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', e => { console.error('Page error:', e.message); process.exitCode = 1; });
await page.goto(pathToFileURL(path.join(root, 'index.html')).href + '?render');
await page.waitForFunction(() => window.KP_READY === true, null, { timeout: 60000 });

const clip = { x: 0, y: 0, width: 1920, height: 1080 };
const { FPS, DUR } = await page.evaluate(() => window.KP_TIMELINE);

if (args.includes('--stills')) {
  const dir = path.join(root, 'build', 'stills'); fs.mkdirSync(dir, { recursive: true });
  const times = (arg('--at', '') || '0.5,1.5,3.6,4.9,6.3,7.45,8.2,9.9,11.3,11.8,13.2,14.3,14.9,16.5,19.0,20.3,20.7,21.6,22.4,22.8,23.6,24.5,25.3,26.5,27.3,28.5').split(',').map(Number);
  for (const t of times) {
    await page.evaluate(([t, s]) => window.KP.draw(t, s), [t, samples]);
    await page.screenshot({ path: path.join(dir, `t${t.toFixed(2).padStart(5, '0')}.png`), clip });
  }
  console.log(`Wrote ${times.length} stills to build/stills`);
  await browser.close(); process.exit();
}

// 1. sound
console.log('Rendering soundtrack…');
const b64 = await page.evaluate(() => window.KP.wav());
const wavPath = path.join(root, 'build', 'soundtrack.wav');
fs.writeFileSync(wavPath, Buffer.from(b64, 'base64'));
if (args.includes('--audio-only')) { console.log('Wrote build/soundtrack.wav'); await browser.close(); process.exit(); }

// 2. picture → ffmpeg
const outPath = path.join(root, 'out', arg('--out', 'KickPot_Trailer.mp4'));
const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-i', wavPath,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'animation',
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-shortest', outPath], { stdio: ['pipe', 'inherit', 'inherit'] });
const frames = Math.round(DUR * FPS), t0 = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate(([t, s]) => window.KP.draw(t, s), [i / FPS, samples]);
  const png = await page.screenshot({ clip, type: 'png' });
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 60 === 0) console.log(`frame ${i}/${frames}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
await browser.close();
console.log('Done →', path.relative(root, outPath));
