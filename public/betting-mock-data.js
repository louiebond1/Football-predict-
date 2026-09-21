/* Betting Mode Lab — MOCK DATA LAYER.
 *
 * Every price in this file is invented for prototype testing. None of it is
 * sourced from API-Football, football-data.org, or any bookmaker. Nothing
 * here is evidence that a real provider supplies these markets — see the
 * KickPot Betting Mode discovery reports for what has actually been proven.
 *
 * The shape is deliberately provider-agnostic:
 *   Fixture -> Market -> Selection -> decimal odds
 * so that a future server-side API-Football normalizer can populate this
 * exact same shape and the UI in betting-lab.js never has to change.
 */

export const MOCK_DISCLAIMER = 'MOCK ODDS — prototype only, not from a live provider';

/* Tiny seeded PRNG (mulberry32) so the "random-looking" demo odds are stable
 * across reloads instead of jumping around every time the module runs. */
function seedFrom(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const round2 = n => Math.round(n * 100) / 100;
const clampOdds = n => Math.max(1.05, round2(n));
/* No-vig combine, used only to keep derived markets (Double Chance, Draw No
 * Bet) looking mathematically sane relative to the 1X2 line — not a claim
 * about how any real bookmaker prices them. */
const combine = (...odds) => clampOdds(1 / odds.reduce((sum, o) => sum + 1 / o, 0));

const TEAM_STRENGTH = {
  Arsenal: 0.82, 'Leeds United': 0.42, Liverpool: 0.86, Chelsea: 0.68,
  'Manchester City': 0.88, 'Tottenham Hotspur': 0.66, 'Newcastle United': 0.7, 'Aston Villa': 0.6,
  'Manchester United': 0.64, 'Brighton & Hove Albion': 0.58, 'West Ham United': 0.5, Everton: 0.46,
  'Wolverhampton Wanderers': 0.44, 'Crystal Palace': 0.55, Brentford: 0.52, Fulham: 0.53,
  'Nottingham Forest': 0.56, Bournemouth: 0.48, Burnley: 0.38, Sunderland: 0.36
};

const PLAYER_POOL = {
  Arsenal: ['Bukayo Saka', 'Gabriel Martinelli', 'Kai Havertz'],
  'Leeds United': ['Joel Piroe', 'Wilfried Gnonto'],
  Liverpool: ['Mohamed Salah', 'Darwin Núñez', 'Luis Díaz'],
  Chelsea: ['Cole Palmer', 'Nicolas Jackson'],
  'Manchester City': ['Erling Haaland', 'Phil Foden'],
  'Tottenham Hotspur': ['Son Heung-min', 'Dominic Solanke'],
  'Newcastle United': ['Alexander Isak', 'Anthony Gordon'],
  'Aston Villa': ['Ollie Watkins', 'Morgan Rogers'],
  'Manchester United': ['Bruno Fernandes', 'Rasmus Højlund'],
  'Brighton & Hove Albion': ['Danny Welbeck', 'Kaoru Mitoma'],
  'West Ham United': ['Jarrod Bowen', 'Niclas Füllkrug'],
  Everton: ['Dominic Calvert-Lewin', 'Iliman Ndiaye'],
  'Wolverhampton Wanderers': ['Matheus Cunha', 'Pedro Neto'],
  'Crystal Palace': ['Jean-Philippe Mateta', 'Eberechi Eze'],
  Brentford: ['Bryan Mbeumo', 'Yoane Wissa'],
  Fulham: ['Raúl Jiménez', 'Andreas Pereira'],
  'Nottingham Forest': ['Chris Wood', 'Anthony Elanga'],
  Bournemouth: ['Dominic Solanke-Mitchell', 'Antoine Semenyo'],
  Burnley: ['Jaidon Anthony', 'Zian Flemming'],
  Sunderland: ['Wilson Isidor', 'Eliezer Mayenda']
};

const FIXTURE_PAIRS = [
  ['Arsenal', 'Leeds United'], ['Liverpool', 'Chelsea'], ['Manchester City', 'Tottenham Hotspur'],
  ['Newcastle United', 'Aston Villa'], ['Manchester United', 'Brighton & Hove Albion'],
  ['West Ham United', 'Everton'], ['Wolverhampton Wanderers', 'Crystal Palace'],
  ['Brentford', 'Fulham'], ['Nottingham Forest', 'Bournemouth'], ['Burnley', 'Sunderland']
];

/* Spreads the demo gameweek's kickoffs across the next Fri/Sat/Sun/Mon
 * relative to whenever the lab is opened, so it always reads as "upcoming". */
function demoKickoff(index) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const daysAhead = [5, 6, 6, 6, 7, 7, 7, 8, 8, 9][index] ?? 6;
  const hour = [20, 12.5, 15, 17.5, 14, 14, 16.5, 19, 14, 20][index] ?? 15;
  const d = new Date(base.getTime() + daysAhead * 86400000);
  d.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
  while (d.getTime() < Date.now()) d.setDate(d.getDate() + 7);
  return d.toISOString();
}

function matchResultOdds(rand, homeStrength, awayStrength) {
  const homeEdge = 0.12; // generic home advantage bump, mock only
  const hs = homeStrength + homeEdge, as = awayStrength;
  const total = hs + as + 0.55; // 0.55 = generic "draw weight"
  const pHome = hs / total, pAway = as / total, pDraw = 1 - pHome - pAway;
  const margin = 1.07 + rand() * 0.04; // mock bookmaker overround
  return {
    home: clampOdds(margin / pHome),
    draw: clampOdds(margin / Math.max(pDraw, 0.08)),
    away: clampOdds(margin / pAway)
  };
}

function buildMarkets(fixtureId, home, away, rand) {
  const hs = TEAM_STRENGTH[home] ?? 0.5, as = TEAM_STRENGTH[away] ?? 0.5;
  const mr = matchResultOdds(rand, hs, as);
  const expGoals = 2.0 + (hs + as - 1) * 1.4; // mock expected total goals, drives Over/Under lines
  const sel = (name, odds) => ({ id: name.replace(/\s+/g, '_'), name, odds: clampOdds(odds) });
  const market = (key, name, category, selections) => ({
    id: `${fixtureId}:${key}`, name, category,
    selections: selections.map(s => ({ ...s, id: `${fixtureId}:${key}:${s.id}` }))
  });

  const overUnder = (line, weightOver) => [
    sel(`Over ${line}`, 1 / (weightOver * (0.92 + rand() * 0.06))),
    sel(`Under ${line}`, 1 / ((1 - weightOver) * (0.92 + rand() * 0.06)))
  ];
  const ouWeight = line => Math.min(0.93, Math.max(0.07, 1 - Math.exp(-expGoals / (line + 0.6)) * 0.62));

  const popular = [
    market('result', 'Match Result', 'popular', [sel('Home', mr.home), sel('Draw', mr.draw), sel('Away', mr.away)]),
    market('dc', 'Double Chance', 'popular', [
      sel('Home or Draw', combine(mr.home, mr.draw)), sel('Home or Away', combine(mr.home, mr.away)), sel('Draw or Away', combine(mr.draw, mr.away))
    ]),
    market('dnb', 'Draw No Bet', 'popular', [sel('Home', clampOdds(combine(mr.home, mr.draw) * 1.08)), sel('Away', clampOdds(combine(mr.draw, mr.away) * 1.08))]),
    market('btts', 'Both Teams To Score', 'popular', [sel('Yes', 1.6 + (1 - Math.abs(hs - as)) * 0.3 + rand() * 0.15), sel('No', 2.05 + Math.abs(hs - as) * 0.6 + rand() * 0.15)]),
    market('ou25', 'Over/Under 2.5 Goals', 'popular', overUnder('2.5', ouWeight(2.5))),
    market('score', 'Correct Score', 'popular', [
      sel('1-0', 7.5 + (as - hs) * 3), sel('2-0', 9.5 + (as - hs) * 3), sel('2-1', 8.5), sel('1-1', 6.8),
      sel('0-0', 8.2 + (hs - as) * 2), sel('0-1', 8.8 + (hs - as) * 3), sel('1-2', 9.8 + (hs - as) * 3), sel('3-1', 12.5)
    ].map(s => ({ ...s, odds: clampOdds(s.odds) })))
  ];

  const goals = [
    market('ou05', 'Over/Under 0.5 Goals', 'goals', overUnder('0.5', ouWeight(0.5))),
    market('ou15', 'Over/Under 1.5 Goals', 'goals', overUnder('1.5', ouWeight(1.5))),
    market('ou25b', 'Over/Under 2.5 Goals', 'goals', overUnder('2.5', ouWeight(2.5))),
    market('ou35', 'Over/Under 3.5 Goals', 'goals', overUnder('3.5', ouWeight(3.5))),
    market('homegoals', `${home} Team Goals O/U 1.5`, 'goals', overUnder('1.5', Math.min(0.85, 0.35 + hs * 0.4))),
    market('awaygoals', `${away} Team Goals O/U 1.5`, 'goals', overUnder('1.5', Math.min(0.85, 0.35 + as * 0.4))),
    market('firstscore', 'First Team To Score', 'goals', [sel('Home', combine(mr.home, 2.6)), sel('Away', combine(mr.away, 2.6)), sel('No Goal', 12 + rand() * 3)])
  ];

  const matchMarkets = [
    market('fh', 'First Half Result', 'match', [sel('Home', clampOdds(mr.home * 1.55)), sel('Draw', clampOdds(mr.draw * 0.62)), sel('Away', clampOdds(mr.away * 1.55))]),
    market('htft', 'Half Time / Full Time', 'match', [
      'Home/Home', 'Home/Draw', 'Home/Away', 'Draw/Home', 'Draw/Draw', 'Draw/Away', 'Away/Home', 'Away/Draw', 'Away/Away'
    ].map((name, i) => sel(name, [3.6, 12, 26, 9, 4.8, 11, 21, 10, 6.2][i] + rand())),
    ),
    market('ah', `Asian Handicap (${hs >= as ? home + ' -1' : away + ' -1'})`, 'match', [
      sel(hs >= as ? `${home} -1` : `${away} -1`, 1.85 + rand() * 0.1), sel(hs >= as ? `${away} +1` : `${home} +1`, 1.95 + rand() * 0.1)
    ])
  ];

  const homePlayers = PLAYER_POOL[home] || [], awayPlayers = PLAYER_POOL[away] || [];
  const allPlayers = [...homePlayers.map(p => ({ p, s: hs })), ...awayPlayers.map(p => ({ p, s: as }))];
  const players = [
    market('atgs', 'Anytime Goalscorer', 'players', allPlayers.map(({ p, s }) => sel(p, 2.0 + (1 - s) * 3 + rand() * 0.6))),
    market('shots', 'Player Shots (Over 1.5)', 'players', allPlayers.slice(0, 3).map(({ p, s }) => sel(p, 1.9 + (1 - s) * 1.1 + rand() * 0.3))),
    market('sot', 'Player Shots On Target (Over 0.5)', 'players', allPlayers.slice(0, 3).map(({ p, s }) => sel(p, 1.6 + (1 - s) * 0.9 + rand() * 0.25))),
    market('booked', 'Player To Be Booked', 'players', allPlayers.slice(0, 4).map(({ p }) => sel(p, 3.8 + rand() * 2.5))),
    market('assists', 'Player Assists (Anytime)', 'players', allPlayers.map(({ p, s }) => sel(p, 3.6 + (1 - s) * 3 + rand() * 0.6)))
  ];

  return { popular, goals, match: matchMarkets, players };
}

let cachedGameweek = null;
export function buildDemoGameweek() {
  if (cachedGameweek) return cachedGameweek;
  const fixtures = FIXTURE_PAIRS.map(([home, away], i) => {
    const id = `demo-fx-${i + 1}`;
    const rand = seedFrom(id);
    return { id, home, away, kickoff: demoKickoff(i), markets: buildMarkets(id, home, away, rand) };
  });
  cachedGameweek = { disclaimer: MOCK_DISCLAIMER, fixtures };
  return cachedGameweek;
}

export function findFixture(fixtureId) {
  return buildDemoGameweek().fixtures.find(f => f.id === fixtureId) || null;
}

export function findSelection(fixtureId, marketId, selectionId) {
  const fixture = findFixture(fixtureId);
  if (!fixture) return null;
  for (const list of Object.values(fixture.markets)) {
    const market = list.find(m => m.id === marketId);
    const selection = market?.selections.find(s => s.id === selectionId);
    if (market && selection) return { fixture, market, selection };
  }
  return null;
}

export const MARKET_CATEGORIES = [
  { key: 'popular', label: 'Popular' },
  { key: 'goals', label: 'Goals' },
  { key: 'match', label: 'Match' },
  { key: 'players', label: 'Players' }
];
