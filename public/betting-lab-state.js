/* Betting Mode Lab — local, fake-money state engine.
 * Everything here lives in localStorage under one namespaced key. No network
 * calls, no Supabase writes, no real fixtures, no real money. All amounts
 * are stored as integer pence to avoid floating-point drift, matching the
 * convention KickPot already uses for stake_pence/amount_pence.
 */
import { findSelection } from './betting-mock-data.js';

const STORAGE_KEY = 'kickpot-betting-lab-v1';
const STARTING_BALANCE_PENCE = 10000; // £100.00

const FRIEND_NAMES = ['Jamie', 'Sam', 'Charlie', 'Ben', 'Priya', 'Tom', 'Ryan', 'Freya', 'Jack', 'Nadia'];
function seededFriends() {
  // Deterministic mock leaderboard flavor — not a claim about real users.
  let h = 42;
  const rand = () => { h = Math.imul(h ^ (h << 13), 0x45d9f3b); h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; };
  return FRIEND_NAMES.map(name => {
    const profitPence = Math.round((rand() - 0.35) * 9000);
    return { name, balance: STARTING_BALANCE_PENCE + profitPence };
  });
}

function defaultState() {
  return {
    version: 1,
    balance: STARTING_BALANCE_PENCE,
    startingBalance: STARTING_BALANCE_PENCE,
    openBets: [],
    settledBets: [],
    friends: seededFriends()
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.balance !== 'number' || parsed.version !== 1) return defaultState();
    return parsed;
  } catch { return defaultState(); }
}

function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode / quota — demo state just won't persist */ }
}

let state = load();
const listeners = new Set();
function notify() { listeners.forEach(fn => { try { fn(state); } catch {} }); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getState() { return state; }

export function resetDemo() {
  state = defaultState();
  save(state);
  notify();
  return state;
}

export function openStake() { return state.openBets.reduce((sum, b) => sum + b.stake, 0); }
export function gwProfit() { return state.balance + openStake() - state.startingBalance; }

/* selections can include multiple independent markets from one fixture (demo Bet Builder). */
export function placeBet({ selections, stakePence }) {
  if (!Array.isArray(selections) || !selections.length) return { ok: false, error: 'No selection.' };
  const unique = new Map();
  for (const sel of selections) unique.set(`${sel.marketId}|${sel.selectionId}`, sel);
  const resolved = [];
  for (const s of unique.values()) {
    const hit = findSelection(s.fixtureId, s.marketId, s.selectionId);
    if (!hit) return { ok: false, error: 'A selected price is no longer available.' };
    resolved.push({
      fixtureId: hit.fixture.id, fixtureLabel: `${hit.fixture.home} v ${hit.fixture.away}`,
      marketId: hit.market.id, marketName: hit.market.name,
      selectionId: hit.selection.id, selectionName: hit.selection.name,
      oddsAtPlacement: hit.selection.odds
    });
  }
  if (!Number.isFinite(stakePence) || stakePence <= 0) return { ok: false, error: 'Enter a stake.' };
  if (stakePence > state.balance) return { ok: false, error: 'You don’t have enough virtual balance for this stake.' };

  const combinedOdds = Math.round(resolved.reduce((product, s) => product * s.oddsAtPlacement, 1) * 100) / 100;
  const potentialReturn = Math.round(stakePence * combinedOdds);
  const bet = {
    id: `bet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: resolved.length > 1 ? (new Set(resolved.map(x => x.fixtureId)).size === 1 ? 'bet-builder' : 'acca') : 'single',
    selections: resolved,
    stake: stakePence,
    combinedOdds,
    potentialReturn,
    status: 'open',
    placedAt: new Date().toISOString()
  };
  state.balance -= stakePence;
  state.openBets.unshift(bet);
  save(state);
  notify();
  return { ok: true, bet };
}

export function settleBet(betId, outcome) {
  const idx = state.openBets.findIndex(b => b.id === betId);
  if (idx === -1) return { ok: false, error: 'Bet not found (already settled?).' };
  const bet = state.openBets[idx];
  const won = outcome === 'won';
  const returnPence = won ? bet.potentialReturn : 0;
  const settled = { ...bet, status: won ? 'won' : 'lost', settledAt: new Date().toISOString(), returnPence, profit: returnPence - bet.stake };
  state.openBets.splice(idx, 1);
  state.settledBets.unshift(settled);
  if (won) state.balance += returnPence;
  save(state);
  notify();
  return { ok: true, bet: settled };
}

export function formatGBP(pence) {
  const sign = pence < 0 ? '−' : '';
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}
