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
  Arsenal: 0.88, 'Leeds United': 0.43, 'Aston Villa': 0.62, Brentford: 0.51,
  Chelsea: 0.72, 'AFC Bournemouth': 0.50, 'Ipswich Town': 0.40, Fulham: 0.52,
  Sunderland: 0.42, 'Brighton & Hove Albion': 0.58, 'Manchester United': 0.66,
  'Tottenham Hotspur': 0.69, 'Crystal Palace': 0.57, 'Nottingham Forest': 0.56,
  'Hull City': 0.39, Everton: 0.50, Liverpool: 0.87, 'Manchester City': 0.90,
  'Coventry City': 0.40, 'Newcastle United': 0.70
};

/* 2026/27 senior attacking/player-market pool, refreshed from the Premier
 * League's post-window squad lists. This is demo data: inclusion here does
 * not imply a player will start a particular match. */
const PLAYER_POOL = {
  Arsenal: ['Bukayo Saka','Viktor Gyokeres','Kai Havertz','Eberechi Eze','Noni Madueke','Martin Odegaard','Declan Rice','Bruno Guimaraes'],
  'Leeds United': ['Dominic Calvert-Lewin','Noah Okafor','Harry Wilson','Daniel James','Brenden Aaronson','Lukas Nmecha','Mateo Joseph','Ao Tanaka'],
  'Aston Villa': ['Nicolas Jackson','Alejandro Garnacho','Tammy Abraham','Emiliano Buendia','John McGinn','Leon Goretzka','Amadou Onana','Joao Gomes'],
  Brentford: ['Igor Thiago','Dango Ouattara','Kevin Schade','Keane Lewis-Potter','Fabio Carvalho','Mathias Jensen','Mikkel Damsgaard','Callum Wilson'],
  Chelsea: ['Cole Palmer','Morgan Rogers','Joao Pedro','Emmanuel Emegha','Pedro Neto','Jamie Gittens','Danny Welbeck','Estevao'],
  'AFC Bournemouth': ['Evanilson','Justin Kluivert','Amine Adli','David Brooks','Marcus Tavernier','Alex Scott','Eli Junior Kroupi','Ben Doak'],
  'Ipswich Town': ['Daizen Maeda','Chuba Akpom','Julio Enciso','Abdul Fatawu','Jack Clarke','Jaden Philogene','Anis Mehmeti','Zian Flemming'],
  Fulham: ['Rodrigo Muniz','Alex Iwobi','Oscar Bobb','Emile Smith Rowe','Kevin','Gonzalo Garcia','Cesar Palacios','Tom Cairney'],
  Sunderland: ['Brian Brobbey','Wilson Isidor','Romaine Mundle','Habib Diarra','Enzo Le Fee','Nilson Angulo','Abdoullah Ba','Granit Xhaka'],
  'Brighton & Hove Albion': ['Joao Pedro','Kaoru Mitoma','Yankuba Minteh','Georginio Rutter','Evan Ferguson','Stefanos Tzimas','Ibrahim Osman','Matt O’Riley'],
  'Manchester United': ['Benjamin Sesko','Bryan Mbeumo','Matheus Cunha','Bruno Fernandes','Amad Diallo','Marcus Rashford','Joshua Zirkzee','Mason Mount'],
  'Tottenham Hotspur': ['Dominic Solanke','Omar Marmoush','Mohammed Kudus','Xavi Simons','Savio','Dejan Kulusevski','Mykhailo Mudryk','James Maddison'],
  'Crystal Palace': ['Jean-Philippe Mateta','Eddie Nketiah','Ismaila Sarr','Yeremy Pino','Evann Guessand','Dwight McNeil','Daichi Kamada','Matheus Franca'],
  'Nottingham Forest': ['Chris Wood','Liam Delap','Arnaud Kalimuendo','Igor Jesus','Morgan Gibbs-White','Callum Hudson-Odoi','Dan Ndoye','James McAtee'],
  'Hull City': ['Oliver McBurnie','Joe Gelhardt','Mohamed-Ali Cho','Mohamed Belloumi','Abdulkadir Omur','Sorba Thomas','Ilyas Ansah','Matt Crooks'],
  Everton: ['Thierno Barry','Jack Grealish','Brennan Johnson','Kiernan Dewsbury-Hall','Carlos Alcaraz','Hayden Hackney','James Garner','Merlin Rohl'],
  Liverpool: ['Alexander Isak','Hugo Ekitike','Cody Gakpo','Bradley Barcola','Florian Wirtz','Federico Chiesa','Dominik Szoboszlai','Alexis Mac Allister'],
  'Manchester City': ['Erling Haaland','Phil Foden','Antoine Semenyo','Jeremy Doku','Rayan Cherki','Iliman Ndiaye','Elliot Anderson','Enzo Fernandez'],
  'Coventry City': ['Haji Wright','Taiwo Awoniyi','Ellis Simms','Brandon Thomas-Asante','Tatsuhiro Sakamoto','Loum Tchaouna','Jack Rudoni','Gustavo Hamer'],
  'Newcastle United': ['Yoane Wissa','Anthony Elanga','Harvey Barnes','William Osula','Jacob Ramsey','Jacob Murphy','Joelinton','Nicolas Gonzalez']
};

const FIXTURES = [
  ['2026-10-10T11:30:00Z','Arsenal','Leeds United'],
  ['2026-10-10T14:00:00Z','Aston Villa','Brentford'],
  ['2026-10-10T14:00:00Z','Chelsea','AFC Bournemouth'],
  ['2026-10-10T14:00:00Z','Ipswich Town','Fulham'],
  ['2026-10-10T14:00:00Z','Sunderland','Brighton & Hove Albion'],
  ['2026-10-10T16:30:00Z','Manchester United','Tottenham Hotspur'],
  ['2026-10-11T13:00:00Z','Crystal Palace','Nottingham Forest'],
  ['2026-10-11T13:00:00Z','Hull City','Everton'],
  ['2026-10-11T15:30:00Z','Liverpool','Manchester City'],
  ['2026-10-12T19:00:00Z','Coventry City','Newcastle United']
];

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
  const sel = (name, odds, meta = {}) => ({ id: name.replace(/\s+/g, '_'), name, odds: clampOdds(odds), ...meta });
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
  const allPlayers = [...homePlayers.map(p => ({ p, s: hs, team: 'Home' })), ...awayPlayers.map(p => ({ p, s: as, team: 'Away' }))];
  const players = [
    market('atgs', 'Anytime Goalscorer', 'players', allPlayers.map(({ p, s, team }) => sel(p, 2.0 + (1 - s) * 3 + rand() * 0.6, { team }))),
    market('fgs', 'First Goalscorer', 'players', [...allPlayers.map(({ p, s, team }) => sel(p, 4.2 + (1 - s) * 5 + rand(), { team })), sel('No Goalscorer', 11 + rand() * 3)]),
    market('shots', 'Player Shots (Over 1.5)', 'players', allPlayers.slice(0, 3).map(({ p, s, team }) => sel(p, 1.9 + (1 - s) * 1.1 + rand() * 0.3, { team }))),
    market('sot', 'Player Shots On Target (Over 0.5)', 'players', allPlayers.slice(0, 3).map(({ p, s, team }) => sel(p, 1.6 + (1 - s) * 0.9 + rand() * 0.25, { team }))),
    market('booked', 'Player To Be Booked', 'players', allPlayers.slice(0, 4).map(({ p, team }) => sel(p, 3.8 + rand() * 2.5, { team }))),
    market('assists', 'Player Assists (Anytime)', 'players', allPlayers.map(({ p, s, team }) => sel(p, 3.6 + (1 - s) * 3 + rand() * 0.6, { team })))
  ];

  return { popular, goals, match: matchMarkets, players };
}

let cachedGameweek = null;
export function buildDemoGameweek() {
  if (cachedGameweek) return cachedGameweek;
  const fixtures = FIXTURES.map(([kickoff, home, away], i) => {
    const id = `demo-2026-gw6-fx-${i + 1}`;
    const rand = seedFrom(id);
    return { id, home, away, kickoff, markets: buildMarkets(id, home, away, rand) };
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
