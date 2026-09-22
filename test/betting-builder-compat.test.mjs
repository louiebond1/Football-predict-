import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoGameweek } from '../public/betting-mock-data.js';
import {
  SUPPORTED_MARKET_KEYS,
  toBuilderLeg,
  validateBuilderSelections
} from '../public/betting-builder-compat.js';

const gameweek = buildDemoGameweek();
const fixture = gameweek.fixtures[0];

function marketByKey(fx, key) {
  return Object.values(fx.markets).flat().find(market => market.id.endsWith(':' + key));
}

function pick(key, name, fx = fixture) {
  const market = marketByKey(fx, key);
  assert.ok(market, 'Missing market ' + key);
  const selection = market.selections.find(item => item.name === name);
  assert.ok(selection, 'Missing selection ' + key + ' / ' + name);
  return toBuilderLeg({ fixture: fx, market, selection });
}

function expectAllowed(...legs) {
  const result = validateBuilderSelections(legs);
  assert.equal(result.ok, true, result.error || 'Expected combination to be allowed');
}

function expectBlocked(...legs) {
  const result = validateBuilderSelections(legs);
  assert.equal(result.ok, false, 'Expected combination to be blocked');
}

test('compatibility engine explicitly covers every market currently exposed by Betting Mode', () => {
  const actualKeys = [...new Set(
    gameweek.fixtures.flatMap(fx =>
      Object.values(fx.markets).flat().map(market => market.id.split(':').pop())
    )
  )].sort();

  assert.deepEqual(actualKeys, [...SUPPORTED_MARKET_KEYS].sort());

  for (const fx of gameweek.fixtures) {
    for (const market of fx.markets.players) {
      for (const selection of market.selections) {
        if (market.id.endsWith(':fgs') && selection.name === 'No Goalscorer') continue;
        assert.ok(selection.team === 'Home' || selection.team === 'Away',
          market.name + ' / ' + selection.name + ' is missing player-team metadata');
      }
    }
  }
});

test('blocks guaranteed, contradictory and duplicate-event Bet Builder combinations', () => {
  expectBlocked(
    pick('fgs', 'Bukayo Saka'),
    pick('ou05', 'Over 0.5')
  );

  expectBlocked(
    pick('fgs', 'Bukayo Saka'),
    pick('atgs', 'Bukayo Saka')
  );

  expectBlocked(
    pick('atgs', 'Bukayo Saka'),
    pick('sot', 'Bukayo Saka')
  );

  expectBlocked(
    pick('fgs', 'Bukayo Saka'),
    pick('firstscore', 'Home')
  );

  expectBlocked(
    pick('result', 'Home'),
    pick('dc', 'Home or Draw')
  );

  expectBlocked(
    pick('btts', 'Yes'),
    pick('ou15', 'Over 1.5')
  );

  expectBlocked(
    pick('ou05', 'Over 0.5'),
    pick('ou15', 'Under 1.5')
  );

  expectBlocked(
    pick('fgs', 'No Goalscorer'),
    pick('result', 'Draw')
  );
});

test('global validation catches impossible combinations that only fail with three or more legs', () => {
  expectBlocked(
    pick('atgs', 'Bukayo Saka'),
    pick('atgs', 'Gabriel Martinelli'),
    pick('ou15', 'Under 1.5')
  );

  expectBlocked(
    pick('atgs', 'Bukayo Saka'),
    pick('assists', 'Bukayo Saka'),
    pick('homegoals', 'Under 1.5')
  );
});

test('keeps genuinely compatible builder combinations available', () => {
  expectAllowed(
    pick('fgs', 'Bukayo Saka'),
    pick('atgs', 'Wilfried Gnonto')
  );

  expectAllowed(
    pick('result', 'Home'),
    pick('btts', 'Yes')
  );

  expectAllowed(
    pick('result', 'Home'),
    pick('ou25', 'Over 2.5')
  );

  expectAllowed(
    pick('btts', 'Yes'),
    pick('ou25', 'Under 2.5')
  );

  expectAllowed(
    pick('score', '2-1'),
    pick('fgs', 'Bukayo Saka')
  );

  expectAllowed(
    pick('shots', 'Bukayo Saka'),
    pick('sot', 'Bukayo Saka')
  );
});

test('exact-score and player requirements are checked against the whole match state', () => {
  expectBlocked(
    pick('score', '2-0'),
    pick('atgs', 'Wilfried Gnonto')
  );

  expectBlocked(
    pick('firstscore', 'Away'),
    pick('fgs', 'Bukayo Saka')
  );
});

test('different fixtures remain accumulator legs and do not cross-contaminate builder rules', () => {
  const second = gameweek.fixtures[1];
  const secondHome = marketByKey(second, 'result').selections.find(selection => selection.name === 'Home');
  expectAllowed(
    pick('result', 'Home'),
    toBuilderLeg({ fixture: second, market: marketByKey(second, 'result'), selection: secondHome })
  );
});

test('every current market pair can be evaluated without parser gaps or crashes', () => {
  const all = Object.values(fixture.markets).flat().flatMap(market =>
    market.selections.map(selection => toBuilderLeg({ fixture, market, selection }))
  );

  for (let first = 0; first < all.length; first += 1) {
    for (let second = first + 1; second < all.length; second += 1) {
      const result = validateBuilderSelections([all[first], all[second]]);
      assert.equal(typeof result.ok, 'boolean');
    }
  }
});
