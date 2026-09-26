// End-to-end check of the mind reader in a real browser at phone size.
//
// Plays the trick once for every number 1–63, answering each card by reading
// the numbers actually rendered on screen, and checks the reveal. Also covers
// the all-NO recovery screen, the back button and Play again.
//
//   npm run test:e2e            (needs Playwright + Chromium available)

import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const PORT = Number(process.env.E2E_PORT || 4391);
const URL = `http://127.0.0.1:${PORT}/mind-reader/?speed=0`;

const server = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const browser = await chromium.launch();

try {
  await waitForServer();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(URL);

  const screen = () => page.locator('#app').getAttribute('data-screen');
  const cardNumbers = async () => (await page.locator('#grid li').allTextContents()).map(Number);
  const answer = yes => page.tap(`[data-answer="${yes ? 'yes' : 'no'}"]`);
  const noHorizontalScroll = async label => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `${label}: page scrolls horizontally by ${overflow}px`);
  };

  async function play(n, { onCard } = {}) {
    assert.equal(await screen(), 'intro');
    await page.tap('[data-action="start"]');
    for (let card = 0; card < 6; card++) {
      assert.equal(await screen(), 'card');
      const numbers = await cardNumbers();
      assert.equal(numbers.length, 32, `card ${card + 1} shows 32 numbers`);
      assert.equal(await page.locator('#dots li.current').count(), 1);
      if (onCard) await onCard(card, numbers);
      await answer(numbers.includes(n));
    }
    await page.waitForSelector('#app[data-result]');
    const result = await page.locator('#app').getAttribute('data-result');
    await page.waitForSelector('#reveal-actions.is-on');
    return result;
  }

  // Every number 1–63 resolves correctly through the UI.
  for (let n = 1; n <= 63; n++) {
    const result = await play(n, {
      onCard: n === 1 ? (card) => noHorizontalScroll(`card ${card + 1}`) : undefined,
    });
    assert.equal(result, String(n), `thought of ${n}, app revealed ${result}`);
    assert.equal(await page.locator('#result-number').textContent(), String(n));
    assert.ok(await page.locator('[data-line="result"]').isVisible());
    if (n === 1) await noHorizontalScroll('reveal');
    await page.tap('[data-action="restart"]');
  }
  console.log('ok - all 63 numbers revealed correctly through the UI');

  // All NO → recovery screen, never "0".
  assert.equal(await play(0), 'miss');
  assert.ok(await page.locator('[data-line="miss"]').isVisible());
  assert.ok(!(await page.locator('[data-line="result"]').isVisible()));
  assert.equal(await page.locator('#result-number').textContent(), '');
  await page.tap('[data-action="restart"]');
  assert.equal(await screen(), 'intro');
  console.log('ok - all-NO shows the recovery screen and restarts');

  // Back button: a wrong answer can be corrected.
  await page.tap('[data-action="start"]');
  assert.ok(!(await page.locator('[data-action="back"]').isVisible()), 'no back button on the first card');
  const target = 37;
  for (let card = 0; card < 3; card++) await answer((await cardNumbers()).includes(target));
  await answer(!(await cardNumbers()).includes(target)); // deliberate mistake on card 4
  await page.tap('[data-action="back"]');
  await page.waitForFunction(() => document.querySelectorAll('#dots li.current')[0] === document.querySelectorAll('#dots li')[3]);
  for (let card = 3; card < 6; card++) await answer((await cardNumbers()).includes(target));
  await page.waitForSelector('#app[data-result]');
  assert.equal(await page.locator('#app').getAttribute('data-result'), String(target));
  console.log('ok - back button lets a wrong answer be corrected');

  // Play again starts clean from the intro.
  await page.waitForSelector('#reveal-actions.is-on');
  await page.tap('[data-action="restart"]');
  assert.equal(await screen(), 'intro');
  await page.tap('[data-action="start"]');
  assert.deepEqual((await cardNumbers()).slice(0, 4), [1, 3, 5, 7]);
  console.log('ok - play again resets to the first player');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('ok - no page errors');
} finally {
  await browser.close();
  server.kill();
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(URL)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}
