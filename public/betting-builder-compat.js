const PLAYER_MARKETS = new Set(['atgs','fgs','shots','sot','booked','assists']);
const SINGLE_CHOICE_MARKETS = new Set([
  'result','dc','dnb','btts','ou05','ou15','ou25','ou25b','ou35',
  'homegoals','awaygoals','firstscore','fh','htft','ah','score','fgs'
]);
const MATCH_TOTAL_MARKETS = new Set(['ou05','ou15','ou25','ou25b','ou35']);

export const SUPPORTED_MARKET_KEYS = Object.freeze([
  'result','dc','dnb','btts','ou25','score',
  'ou05','ou15','ou25b','ou35','homegoals','awaygoals','firstscore',
  'fh','htft','ah',
  'atgs','fgs','shots','sot','booked','assists'
]);

const SUPPORTED = new Set(SUPPORTED_MARKET_KEYS);
const MAX_GOALS = 8;

export function marketKeyFromId(marketId = '') {
  return String(marketId).split(':').pop();
}

export function isSingleChoiceMarket(marketId) {
  return SINGLE_CHOICE_MARKETS.has(marketKeyFromId(marketId));
}

export function toBuilderLeg(hit) {
  const fixture = hit.fixture || hit;
  const market = hit.market;
  const selection = hit.selection;
  return {
    fixtureId: fixture.id,
    home: fixture.home,
    away: fixture.away,
    marketId: market.id,
    marketKey: marketKeyFromId(market.id),
    marketName: market.name,
    selectionId: selection.id,
    selectionName: selection.name,
    playerTeam: selection.team || null
  };
}

const resultOf = (homeGoals, awayGoals) =>
  homeGoals > awayGoals ? 'Home' : homeGoals < awayGoals ? 'Away' : 'Draw';

function overUnderPass(name, value) {
  const match = String(name).match(/^(Over|Under)\s+([0-9.]+)$/i);
  if (!match) return null;
  const line = Number(match[2]);
  return match[1].toLowerCase() === 'over' ? value > line : value < line;
}

function structuralPass(leg, state) {
  const key = leg.marketKey;
  const name = leg.selectionName;
  const homeGoals = state.homeGoals;
  const awayGoals = state.awayGoals;
  const totalGoals = homeGoals + awayGoals;

  if (PLAYER_MARKETS.has(key)) {
    if (key === 'fgs' && name === 'No Goalscorer') return totalGoals === 0;
    return null;
  }

  if (key === 'result') return resultOf(homeGoals, awayGoals) === name;

  if (key === 'dc') {
    if (name === 'Home or Draw') return homeGoals >= awayGoals;
    if (name === 'Home or Away') return homeGoals !== awayGoals;
    if (name === 'Draw or Away') return homeGoals <= awayGoals;
    return false;
  }

  if (key === 'dnb') {
    if (name === 'Home') return homeGoals > awayGoals;
    if (name === 'Away') return awayGoals > homeGoals;
    return false;
  }

  if (key === 'btts') {
    if (name === 'Yes') return homeGoals > 0 && awayGoals > 0;
    if (name === 'No') return homeGoals === 0 || awayGoals === 0;
    return false;
  }

  if (MATCH_TOTAL_MARKETS.has(key)) return overUnderPass(name, totalGoals);
  if (key === 'homegoals') return overUnderPass(name, homeGoals);
  if (key === 'awaygoals') return overUnderPass(name, awayGoals);

  if (key === 'score') {
    const match = String(name).match(/^(\d+)-(\d+)$/);
    return Boolean(match) && homeGoals === Number(match[1]) && awayGoals === Number(match[2]);
  }

  if (key === 'firstscore') {
    if (name === 'No Goal') return totalGoals === 0;
    return state.firstTeam === name;
  }

  if (key === 'fh') return state.halfTimeResult === name;

  if (key === 'htft') {
    const parts = String(name).split('/');
    return parts.length === 2 &&
      state.halfTimeResult === parts[0] &&
      resultOf(homeGoals, awayGoals) === parts[1];
  }

  if (key === 'ah') {
    const match = String(name).match(/^(.*)\s([+-]\d+(?:\.\d+)?)$/);
    if (!match) return false;
    const team = match[1];
    const handicap = Number(match[2]);
    const ownGoals = team === leg.home ? homeGoals : team === leg.away ? awayGoals : null;
    if (ownGoals === null) return false;
    const opponentGoals = team === leg.home ? awayGoals : homeGoals;
    return ownGoals + handicap > opponentGoals;
  }

  return true;
}

function minimumTeamGoals(requiredScorers, requiredAssisters) {
  let minimum = Math.max(requiredScorers.size, requiredAssisters.size);
  if (requiredScorers.size === 1 && requiredAssisters.size === 1) {
    const scorer = [...requiredScorers][0];
    const assister = [...requiredAssisters][0];
    if (scorer === assister) minimum = Math.max(minimum, 2);
  }
  return minimum;
}

function playerConstraintsPass(legs, state, negatedLeg = null) {
  const requiredScorers = { Home: new Set(), Away: new Set() };
  const requiredAssisters = { Home: new Set(), Away: new Set() };
  const requiredShotsOnTarget = { Home: new Set(), Away: new Set() };
  const firstGoalscorers = [];

  for (const leg of legs) {
    const key = leg.marketKey;
    const name = leg.selectionName;
    const team = leg.playerTeam;

    if (key === 'fgs' && name !== 'No Goalscorer') {
      if (!team) return false;
      firstGoalscorers.push(leg);
      requiredScorers[team].add(name);
    } else if (key === 'atgs') {
      if (!team) return false;
      requiredScorers[team].add(name);
    } else if (key === 'assists') {
      if (!team) return false;
      requiredAssisters[team].add(name);
    } else if (key === 'sot') {
      if (!team) return false;
      requiredShotsOnTarget[team].add(name);
    }
  }

  if (new Set(firstGoalscorers.map(leg => leg.selectionName)).size > 1) return false;

  if (firstGoalscorers.length) {
    const first = firstGoalscorers[0];
    if (state.firstTeam !== first.playerTeam) return false;
  }

  if (state.homeGoals < minimumTeamGoals(requiredScorers.Home, requiredAssisters.Home)) return false;
  if (state.awayGoals < minimumTeamGoals(requiredScorers.Away, requiredAssisters.Away)) return false;

  if (!negatedLeg) return true;

  const key = negatedLeg.marketKey;
  const name = negatedLeg.selectionName;
  const team = negatedLeg.playerTeam;

  if (!PLAYER_MARKETS.has(key)) return true;
  if (key === 'fgs' && name === 'No Goalscorer') return state.homeGoals + state.awayGoals > 0;

  if (key === 'atgs') {
    return !team || !requiredScorers[team].has(name);
  }

  if (key === 'sot') {
    return !team ||
      (!requiredShotsOnTarget[team].has(name) && !requiredScorers[team].has(name));
  }

  if (key === 'assists') {
    return !team || !requiredAssisters[team].has(name);
  }

  if (key === 'shots' || key === 'booked') return true;

  if (key === 'fgs') {
    if (!team) return true;
    if (firstGoalscorers.some(leg => leg.selectionName === name)) return false;
    if (firstGoalscorers.length) return true;
    if (state.homeGoals + state.awayGoals === 0) return true;
    if (state.firstTeam !== team) return true;

    const teamGoals = team === 'Home' ? state.homeGoals : state.awayGoals;
    return !(teamGoals === 1 && requiredScorers[team].has(name));
  }

  return true;
}

function *possibleMatchStates() {
  for (let homeGoals = 0; homeGoals <= MAX_GOALS; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= MAX_GOALS; awayGoals += 1) {
      const firstTeams = homeGoals + awayGoals === 0
        ? ['None']
        : [
            ...(homeGoals > 0 ? ['Home'] : []),
            ...(awayGoals > 0 ? ['Away'] : [])
          ];

      for (let halfHome = 0; halfHome <= homeGoals; halfHome += 1) {
        for (let halfAway = 0; halfAway <= awayGoals; halfAway += 1) {
          const halfTimeResult = resultOf(halfHome, halfAway);
          for (const firstTeam of firstTeams) {
            yield { homeGoals, awayGoals, halfTimeResult, firstTeam };
          }
        }
      }
    }
  }
}

function isFeasible(legs, negatedLeg = null) {
  for (const state of possibleMatchStates()) {
    let structuralOkay = true;

    for (const leg of legs) {
      if (structuralPass(leg, state) === false) {
        structuralOkay = false;
        break;
      }
    }

    if (!structuralOkay) continue;

    if (negatedLeg && !PLAYER_MARKETS.has(negatedLeg.marketKey)) {
      if (structuralPass(negatedLeg, state) !== false) continue;
    }

    if (playerConstraintsPass(legs, state, negatedLeg)) return true;
  }

  return false;
}

function sameMetricError(legs) {
  const matchTotals = legs.filter(leg => MATCH_TOTAL_MARKETS.has(leg.marketKey));
  if (matchTotals.length > 1) {
    return 'Choose one match total-goals line in a Bet Builder.';
  }
  return null;
}

export function validateBuilderSelections(legs) {
  if (!Array.isArray(legs) || legs.length < 2) return { ok: true };

  const byFixture = new Map();
  for (const leg of legs) {
    if (!byFixture.has(leg.fixtureId)) byFixture.set(leg.fixtureId, []);
    byFixture.get(leg.fixtureId).push(leg);
  }

  for (const group of byFixture.values()) {
    if (group.length < 2) continue;

    const unsupported = group.find(leg => !SUPPORTED.has(leg.marketKey));
    if (unsupported) {
      return {
        ok: false,
        code: 'unsupported-market',
        error: unsupported.marketName + ' is not yet supported in Bet Builder.'
      };
    }

    const onePerMarket = new Map();
    for (const leg of group) {
      if (!SINGLE_CHOICE_MARKETS.has(leg.marketKey)) continue;
      const prior = onePerMarket.get(leg.marketId);
      if (prior && prior.selectionId !== leg.selectionId) {
        return {
          ok: false,
          code: 'same-market',
          error: leg.marketName + ': choose one selection.'
        };
      }
      onePerMarket.set(leg.marketId, leg);
    }

    const metricError = sameMetricError(group);
    if (metricError) return { ok: false, code: 'same-metric', error: metricError };

    if (!isFeasible(group)) {
      return {
        ok: false,
        code: 'impossible',
        error: 'Those selections cannot all happen together.'
      };
    }

    for (let index = 0; index < group.length; index += 1) {
      const leg = group[index];
      const others = group.filter((_, otherIndex) => otherIndex !== index);
      if (others.length && !isFeasible(others, leg)) {
        return {
          ok: false,
          code: 'redundant',
          error: 'Those selections cannot be combined because one outcome already guarantees another.'
        };
      }
    }
  }

  return { ok: true };
}
