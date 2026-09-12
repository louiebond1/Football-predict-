import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const controllerSource = await readFile(new URL('../public/live-reference-table.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const serviceWorkerSource = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

function queryResult(data, error = null) {
  const result = { data, error };
  const query = {
    select() { return query; },
    eq() { return query; },
    in() { return query; },
    order() { return query; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
  return query;
}

function createHarness({ fixtureFailure = false, leaderboardFailure = false } = {}) {
  const screenListeners = {};
  const windowListeners = {};
  const documentListeners = {};
  const intervalCalls = [];
  let predictionQueryCount = 0;
  let activeTab = 'live';
  let football = {
    round: 'Matchday 4',
    fixtures: [
      { id: 1, kickoff: '2030-09-14T14:00:00Z', status: { short: 'NS', elapsed: null }, home: { name: 'Arsenal', logo: 'ars.png' }, away: { name: 'Chelsea', logo: 'che.png' }, goals: { home: null, away: null } },
      { id: 2, kickoff: '2026-09-12T12:00:00Z', status: { short: 'LIVE', elapsed: 61 }, home: { name: 'Liverpool', logo: 'liv.png' }, away: { name: 'Everton', logo: 'eve.png' }, goals: { home: 2, away: 1 } }
    ]
  };
  const screen = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(value) { this._html = String(value); },
    addEventListener(type, listener) { (screenListeners[type] ||= []).push(listener); }
  };
  const bodyClasses = new Set();
  const document = {
    body: {
      dataset: {},
      classList: { add: value => bodyClasses.add(value), remove: value => bodyClasses.delete(value) }
    },
    visibilityState: 'visible',
    querySelector(selector) {
      if (selector === '#screen') return screen;
      if (selector.includes('.bottom-nav')) return { dataset: { tab: activeTab } };
      return null;
    },
    addEventListener(type, listener) { (documentListeners[type] ||= []).push(listener); }
  };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from(table) {
      if (table === 'groups') return queryResult([{ id: 'g1' }]);
      if (table === 'group_members') return queryResult([{ user_id: 'u1' }, { user_id: 'u2' }]);
      if (table === 'profiles') return queryResult([{ id: 'u1', display_name: 'Louie' }, { id: 'u2', display_name: 'Alex' }]);
      if (table === 'group_leaderboard') return leaderboardFailure
        ? queryResult(null, new Error('leaderboard unavailable'))
        : queryResult([{ user_id: 'u1', points: 4 }, { user_id: 'u2', points: 2 }]);
      if (table === 'predictions') {
        predictionQueryCount += 1;
        return predictionQueryCount % 2 === 1
          ? queryResult([
              { fixture_id: 2, user_id: 'u1', predicted_home: 2, predicted_away: 1 },
              { fixture_id: 2, user_id: 'u2', predicted_home: 1, predicted_away: 1 }
            ])
          : queryResult([
              { fixture_id: 1, user_id: 'u1', predicted_home: 2, predicted_away: 0 },
              { fixture_id: 2, user_id: 'u1', predicted_home: 2, predicted_away: 1 }
            ]);
      }
      throw new Error(`Unexpected table ${table}`);
    },
    async rpc(name) {
      if (name === 'ensure_current_gameweek') return { data: 'gw1', error: null };
      if (name === 'group_pick_status') return { data: [{ user_id: 'u1', submitted_count: 2 }, { user_id: 'u2', submitted_count: 1 }], error: null };
      throw new Error(`Unexpected RPC ${name}`);
    }
  };
  const history = {
    state: {},
    pushState(value) { this.state = value; },
    replaceState(value) { this.state = value; }
  };
  const window = {
    __kickpotSupabase: supabase,
    addEventListener(type, listener) { (windowListeners[type] ||= []).push(listener); },
    scrollTo() {}
  };
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const context = {
    console: { ...console, error() {} }, document, window, history, sessionStorage: storage, localStorage: storage,
    fetch: async () => fixtureFailure
      ? { ok: false, json: async () => ({ error: 'feed unavailable' }) }
      : { ok: true, json: async () => football },
    setTimeout, clearTimeout,
    setInterval(callback, delay) { intervalCalls.push({ callback, delay }); return intervalCalls.length; },
    clearInterval() {}, Date, Intl, Object, String, Number, Array, Set, Map, Promise
  };
  vm.runInNewContext(controllerSource, context, { filename: 'live-reference-table.js' });

  function eventTarget(kind, page) {
    return {
      closest(selector) {
        if (kind === 'page' && selector === '[data-live-page]') return { dataset: { livePage: page } };
        if (kind === 'back' && selector === '[data-live-back]') return {};
        if (kind === 'retry' && selector === '[data-live-retry]') return {};
        return null;
      }
    };
  }
  function fireScreen(type, kind, page) {
    for (const listener of screenListeners[type] || []) listener({ target: eventTarget(kind, page), preventDefault() {} });
  }
  async function settle() {
    for (let i = 0; i < 8; i += 1) await new Promise(resolve => setImmediate(resolve));
  }
  return {
    screen, window, document, windowListeners, intervalCalls, bodyClasses, fireScreen, settle,
    setActiveTab(value) { activeTab = value; },
    setFootball(value) { football = value; }
  };
}

test('Live mounts directly on the table and fixtures/picks are controller-owned drill-ins', async () => {
  const harness = createHarness();
  harness.window.KickPotLive.mount({ reset: true });
  assert.match(harness.screen.innerHTML, /Loading Live Table/);
  assert.doesNotMatch(harness.screen.innerHTML, /Live Matchday|data-live-subtab/);
  await harness.settle();
  assert.match(harness.screen.innerHTML, /data-live-view="table"/);
  assert.match(harness.screen.innerHTML, /<h1>Live Table<\/h1>/);

  harness.fireScreen('click', 'page', 'fixtures');
  assert.match(harness.screen.innerHTML, /data-live-view="fixtures"/);
  assert.match(harness.screen.innerHTML, /Arsenal/);
  assert.match(harness.screen.innerHTML, /Liverpool/);
  assert.match(harness.screen.innerHTML, /2–1/);
  assert.match(harness.screen.innerHTML, /61&#039;/);
  assert.match(harness.screen.innerHTML, /Group picks/);
  assert.match(harness.screen.innerHTML, /Alex/);
  assert.match(harness.screen.innerHTML, /1–1/);
  assert.equal((harness.screen.innerHTML.match(/Group picks/g) || []).length, 1, 'future fixture picks stay hidden');

  harness.fireScreen('pointerup', 'back');
  assert.match(harness.screen.innerHTML, /data-live-view="table"/);
  harness.fireScreen('click', 'page', 'picks');
  assert.match(harness.screen.innerHTML, /data-live-view="picks"/);
  assert.match(harness.screen.innerHTML, /2-0/);
  harness.fireScreen('pointerup', 'back');
  assert.match(harness.screen.innerHTML, /data-live-view="table"/);
});

test('30-second refresh and PWA resume preserve the current Live drill-in', async () => {
  const harness = createHarness();
  harness.window.KickPotLive.mount({ reset: true });
  await harness.settle();
  harness.fireScreen('click', 'page', 'fixtures');
  assert.equal(harness.intervalCalls.at(-1).delay, 30000);
  harness.intervalCalls.at(-1).callback();
  await harness.settle();
  assert.match(harness.screen.innerHTML, /data-live-view="fixtures"/);
  for (const listener of harness.windowListeners.pageshow || []) listener({});
  await harness.settle();
  assert.match(harness.screen.innerHTML, /data-live-view="fixtures"/);

  harness.fireScreen('click', 'page', 'picks');
  harness.intervalCalls.at(-1).callback();
  await harness.settle();
  assert.match(harness.screen.innerHTML, /data-live-view="picks"/);
});

test('re-entering Live ten times always resets directly to the table', async () => {
  const harness = createHarness();
  for (let index = 0; index < 10; index += 1) {
    harness.window.KickPotLive.mount({ reset: true });
    await harness.settle();
    assert.match(harness.screen.innerHTML, /data-live-view="table"/);
    assert.doesNotMatch(harness.screen.innerHTML, /Live Matchday|data-live-subtab/);
    harness.fireScreen('click', 'page', index % 2 ? 'fixtures' : 'picks');
    harness.window.KickPotLive.unmount();
  }
});

test('fixture feed failures render a visible retry state, never a blank screen', async () => {
  const harness = createHarness({ fixtureFailure: true });
  harness.window.KickPotLive.mount({ reset: true });
  await harness.settle();
  assert.match(harness.screen.innerHTML, /Live could not be loaded/);
  assert.match(harness.screen.innerHTML, /feed unavailable/);
  assert.match(harness.screen.innerHTML, /data-live-retry/);
});

test('fixtures remain available when a secondary leaderboard read fails', async () => {
  const harness = createHarness({ leaderboardFailure: true });
  harness.window.KickPotLive.mount({ reset: true });
  await harness.settle();
  harness.fireScreen('click', 'page', 'fixtures');
  assert.match(harness.screen.innerHTML, /Arsenal/);
  assert.match(harness.screen.innerHTML, /Liverpool/);
});

test('leaving either drill-in clears Live state for every bottom-nav destination', async () => {
  const harness = createHarness();
  harness.window.KickPotLive.mount({ reset: true });
  await harness.settle();
  for (const destination of ['gw', 'history', 'group']) {
    harness.setActiveTab('live');
    harness.window.KickPotLive.mount({ reset: true });
    harness.fireScreen('click', 'page', destination === 'history' ? 'picks' : 'fixtures');
    harness.setActiveTab(destination);
    harness.window.KickPotLive.unmount();
    assert.equal(harness.bodyClasses.has('kp-native-live'), false);
    assert.equal(harness.document.body.dataset.kpLivePage, undefined);
  }
});

test('static ownership, navigation, and cache assertions', () => {
  assert.equal((controllerSource.match(/function render\s*\(/g) || []).length, 1);
  assert.doesNotMatch(appSource, /function renderLive|Live Matchday/);
  assert.match(appSource, /KickPotLive\?\.mount\(\{ reset: resetLive \}\)/);
  assert.match(appSource, /state\.tab !== 'live'\) window\.KickPotLive\?\.unmount/);
  assert.doesNotMatch(indexSource, /(?:src|href)="\/(?:core-boot-guard|live-state-v1|live-status\.js|live-polish-v2|live-hierarchy-v1\.js|reference-live)/);
  assert.match(serviceWorkerSource, /kickpot-v108-20260912-live-group-picks/);
  assert.doesNotMatch(serviceWorkerSource, /['"]\/(?:core-boot-guard|live-state-v1|live-status\.js|live-polish-v2|reference-live)/);
});
