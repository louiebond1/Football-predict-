import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYERS, MIN_NUMBER, MAX_NUMBER, readMind } from '../public/mind-reader/cards.js';

const range = Array.from({ length: MAX_NUMBER - MIN_NUMBER + 1 }, (_, i) => i + MIN_NUMBER);

test('there are six players with distinct power-of-two values covering 1–63', () => {
  assert.equal(PLAYERS.length, 6);
  assert.deepEqual(PLAYERS.map(p => p.value), [1, 2, 4, 8, 16, 32]);
  assert.equal(PLAYERS.reduce((sum, p) => sum + p.value, 0), MAX_NUMBER);
});

for (const player of PLAYERS) {
  test(`${player.lastName}'s card lists exactly the right 32 numbers`, () => {
    const expected = range.filter(n => (n & player.value) !== 0);
    assert.deepEqual(player.numbers, expected);
    assert.equal(player.numbers.length, 32);
    assert.equal(new Set(player.numbers).size, 32);
  });
}

test('every number 1–63 is revealed correctly from honest answers', () => {
  for (const n of range) {
    const answers = PLAYERS.map(p => p.numbers.includes(n));
    assert.equal(readMind(answers), n, `number ${n}`);
  }
});

test('all 64 answer combinations map to distinct totals, and only all-NO gives 0', () => {
  const seen = new Set();
  for (let mask = 0; mask < 64; mask++) {
    const answers = PLAYERS.map((_, i) => Boolean(mask & (1 << i)));
    const total = readMind(answers);
    assert.ok(!seen.has(total));
    seen.add(total);
    assert.equal(total === 0, mask === 0);
    // The total's number must appear on exactly the cards answered YES.
    if (total) PLAYERS.forEach((p, i) => assert.equal(p.numbers.includes(total), answers[i]));
  }
  assert.equal(seen.size, 64);
});

test('readMind rejects an incomplete set of answers', () => {
  assert.throws(() => readMind([true, false]));
  assert.throws(() => readMind(undefined));
});
