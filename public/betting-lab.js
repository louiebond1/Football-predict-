/* Betting Mode Lab — the actual member-facing prototype UI.
 * Reached only through betting-lab-gate.js, which has already verified the
 * viewer is an admin before this module is even imported. Nothing in here
 * re-checks auth — that separation is deliberate, see the gate file.
 *
 * Everything is mock data (./betting-mock-data.js) and local fake-money
 * state (./betting-lab-state.js). No network calls happen in this file.
 */
import { buildDemoGameweek, findFixture, MARKET_CATEGORIES, MOCK_DISCLAIMER } from './betting-mock-data.js';
import { getState, subscribe, placeBet, settleBet, resetDemo, openStake, gwProfit, formatGBP } from './betting-lab-state.js';
import { isSingleChoiceMarket, toBuilderLeg, validateBuilderSelections } from './betting-builder-compat.js';

const svg = (body, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const icons = {
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  bet: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', 19),
  tickets: svg('<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z"/>', 19),
  trophy: svg('<path d="M8 4h8v4a4 4 0 0 1-8 0V4z"/><path d="M5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3"/><path d="M10 15h4v3h-4z"/><path d="M8 21h8"/>', 19),
  chevron: svg('<path d="M9 6l6 6-6 6"/>', 16),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 14)
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const kickoffLabel = iso => new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const teamMark = name => {
  const words = String(name).split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? words.map(w => w[0]).slice(0, 2).join('') : String(name).slice(0, 2);
  return `<span class="kbl-team-mark" aria-hidden="true">${esc(initials.toUpperCase())}</span>`;
};
const leagueMark = label => `<span class="kbl-league-mark" aria-hidden="true">${label === 'Premier League' ? '♛' : label === 'Championship' ? '◌' : label === 'La Liga' ? 'L' : 'A'}</span>`;
const round2 = n => Math.round(n * 100) / 100;
const crestUrl = name => ({
  'Arsenal':'https://crests.football-data.org/57.png',
  'Leeds United':'https://crests.football-data.org/341.png',
  'Aston Villa':'https://crests.football-data.org/58.png',
  'Brentford':'https://crests.football-data.org/402.png',
  'Chelsea':'https://crests.football-data.org/61.png',
  'AFC Bournemouth':'https://crests.football-data.org/1044.png',
  'Ipswich Town':'https://crests.football-data.org/349.png',
  'Fulham':'https://crests.football-data.org/63.png',
  'Sunderland':'https://crests.football-data.org/71.png',
  'Brighton & Hove Albion':'https://crests.football-data.org/397.png',
  'Manchester United':'https://crests.football-data.org/66.png',
  'Tottenham Hotspur':'https://crests.football-data.org/73.png',
  'Crystal Palace':'https://crests.football-data.org/354.png',
  'Nottingham Forest':'https://crests.football-data.org/351.png',
  'Hull City':'https://crests.football-data.org/322.png'
}[name] || '');
const teamCrest = name => {
  const url = crestUrl(name);
  const fallback = teamMark(name);
  return url ? `<img class="kbl-team-crest" src="${url}" alt="" loading="eager" decoding="async" onerror="this.outerHTML=\'${fallback.replace(/'/g, '&#39;')}\'">` : fallback;
};

export function mount({ onClose }) {
  const gameweek = buildDemoGameweek();
  const root = document.createElement('div');
  root.className = 'kp-betting-lab';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Betting Mode Lab');
  document.body.append(root);
  document.body.style.overflow = 'hidden';

  /* Ephemeral UI state — never persisted, resets whenever the lab is closed. */
  const ui = {
    tab: 'bet',
    openFixtureId: null,
    category: 'popular',
    slip: new Map(), // marketId|selectionId -> selection; supports same-game Bet Builders
    slipExpanded: false,
    stakeInput: '10.00'
  };

  root.innerHTML = `
    <header class="kbl-top kbl-brand-top">
      <div class="kbl-brand"><strong>KICKPOT</strong><small>FOOTBALL. FRIENDS. MORE.</small></div>
      <div class="kbl-header-balance-wrap"><div class="kbl-header-balance" data-header-balance>£100.00</div><button type="button" class="kbl-balance-plus" aria-label="Balance">+</button></div>
    </header>
    <main class="kbl-content" data-content></main>
    <div class="kbl-slipbar" data-slipbar hidden></div>
    <nav class="kbl-nav" aria-label="Betting Mode navigation">
      <button type="button" class="kbl-nav-item" data-close>${svg('<path d="M3 11l9-8 9 8v9H6v-9"/><path d="M9 20v-6h6v6"/>',19)}<small>Home</small></button>
      <button type="button" class="kbl-nav-item" data-tab="bet">${icons.bet}<small>Betting</small></button>
      <button type="button" class="kbl-nav-item" data-tab="mybets">${icons.tickets}<small>My Bets</small></button>
      <button type="button" class="kbl-nav-item" data-tab="table">${icons.trophy}<small>Leaderboard</small></button>
      <button type="button" class="kbl-nav-item">${svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',19)}<small>More</small></button>
    </nav>
    <div class="kbl-toast" data-toast hidden></div>
  `;

  const contentEl = root.querySelector('[data-content]');
  const slipbarEl = root.querySelector('[data-slipbar]');
  const toastEl = root.querySelector('[data-toast]');
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
  }

  function combinedOdds() {
    return round2([...ui.slip.values()].reduce((p, s) => p * s.odds, 1));
  }
  function stakePence() {
    const n = Number.parseFloat(ui.stakeInput.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }
  function slipKey(marketId, selectionId) { return `${marketId}|${selectionId}`; }
  function selectionItem(fixture, market, selection) {
    return {
      ...toBuilderLeg({ fixture, market, selection }),
      fixtureLabel: `${fixture.home} v ${fixture.away}`,
      odds: selection.odds
    };
  }

  function toggleSelection(fixture, market, selection) {
    const key = slipKey(market.id, selection.id);

    if (ui.slip.has(key)) {
      ui.slip.delete(key);
      ui.slipExpanded = false;
      renderAll();
      return;
    }

    const nextSlip = new Map(ui.slip);
    let replaced = false;

    if (isSingleChoiceMarket(market.id)) {
      for (const [existingKey, existing] of nextSlip) {
        if (existing.fixtureId === fixture.id && existing.marketId === market.id) {
          nextSlip.delete(existingKey);
          replaced = true;
        }
      }
    }

    nextSlip.set(key, selectionItem(fixture, market, selection));

    const compatibility = validateBuilderSelections([...nextSlip.values()]);
    if (!compatibility.ok) {
      toast(compatibility.error);
      return;
    }

    ui.slip = nextSlip;
    ui.slipExpanded = false;
    if (replaced) toast('Replaced selection');
    renderAll();
  }

  function fixtureMatchResult(fixture) {
    return fixture.markets.popular.find(m => m.id.endsWith(':result'));
  }

  function renderFixtureCard(fixture) {
    const mr = fixtureMatchResult(fixture);
    const [home, draw, away] = mr.selections;
    const selectedKeys = new Set([...ui.slip.keys()]);
    const cell = (s, code) => `<div class="kbl-price"><span>${code}</span><button type="button" class="kbl-odds-cell${selectedKeys.has(slipKey(mr.id, s.id)) ? ' is-selected' : ''}" data-odds data-fixture="${fixture.id}" data-market="${mr.id}" data-selection="${s.id}" aria-label="${code} ${s.odds.toFixed(2)}"><span class="kbl-odds-value">${s.odds.toFixed(2)}</span></button></div>`;
    return `<article class="kbl-fixture kbl-fixture-table">
      <button type="button" class="kbl-fixture-main" data-open-fixture="${fixture.id}" aria-label="Open ${esc(fixture.home)} v ${esc(fixture.away)} markets">
        <span class="kbl-fixture-names"><span class="kbl-team-line">${teamCrest(fixture.home)}<strong>${esc(fixture.home)}</strong></span><span class="kbl-team-line">${teamCrest(fixture.away)}<strong>${esc(fixture.away)}</strong></span></span>
        <span class="kbl-fixture-time">${kickoffLabel(fixture.kickoff)}</span>
      </button>
      <div class="kbl-odds-row">${cell(home, '1')}${cell(draw, 'X')}${cell(away, '2')}</div>
      <button class="kbl-card-chevron" type="button" data-open-fixture="${fixture.id}" aria-label="All markets">${icons.chevron}</button>
    </article>`;
  }

  function renderBetTab() {
    const st = getState();
    return `
      <section class="kbl-leagues" aria-label="Competitions">
        <button class="is-active" type="button">${leagueMark('Premier League')}<span>Premier League</span></button><button type="button">${leagueMark('Championship')}<span>Championship</span></button><button type="button">${leagueMark('La Liga')}<span>La Liga</span></button><button type="button">${leagueMark('Serie A')}<span>Serie A</span></button>
      </section>
      <section class="kbl-fixtures">
        <div class="kbl-fixtures-head"><div><strong>Premier League</strong><span>GW6⌄</span></div><div class="kbl-date-tabs"><button class="is-active">Sat 10 Oct</button><button>Sun 11 Oct</button><button>Mon 12 Oct</button><button>▣&nbsp;&nbsp; All Fixtures</button></div></div>
        ${gameweek.fixtures.map((fixture, index) => {
          const previous = gameweek.fixtures[index - 1];
          const dateKey = new Date(fixture.kickoff).toDateString();
          const previousKey = previous ? new Date(previous.kickoff).toDateString() : null;
          const dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }).format(new Date(fixture.kickoff));
          return (dateKey !== previousKey ? `<div class="kbl-date-label">${dateLabel}</div>` : '') + renderFixtureCard(fixture);
        }).join('')}
      </section>`;
  }

  function renderMarketsDrilldown(fixture) {
    const cat = MARKET_CATEGORIES.find(c => c.key === ui.category) ? ui.category : 'popular';
    const markets = fixture.markets[cat] || [];
    const selectedKeys = new Set([...ui.slip.keys()]);
    return `
      <section class="kbl-drill">
        <button type="button" class="kbl-back" data-back-fixture>${svg('<path d="M15 6l-6 6 6 6"/>', 18)}<span>All fixtures</span></button>
        <div class="kbl-drill-head">
          <div class="kbl-drill-teams">${esc(fixture.home)} <span>v</span> ${esc(fixture.away)}</div>
          <div class="kbl-drill-kickoff">${kickoffLabel(fixture.kickoff)} · Pick multiple markets to build your bet</div>
        </div>
        <div class="kbl-builder-banner"><span>BET BUILDER</span><strong>Combine match + player picks</strong><small>Selections from this game can now be added together.</small></div><div class="kbl-cats">
          ${MARKET_CATEGORIES.map(c => `<button type="button" class="kbl-cat${c.key === cat ? ' is-active' : ''}" data-category="${c.key}">${esc(c.label)}</button>`).join('')}
        </div>
        ${markets.map(market => `
          <div class="kbl-market">
            <div class="kbl-market-name">${esc(market.name)}</div>
            <div class="kbl-selections">
              ${market.selections.map(s => `<button type="button" class="kbl-selection${selectedKeys.has(slipKey(market.id, s.id)) ? ' is-selected' : ''}" data-odds data-fixture="${fixture.id}" data-market="${market.id}" data-selection="${s.id}"><span>${esc(s.name)}</span><b>${s.odds.toFixed(2)}</b></button>`).join('')}
            </div>
          </div>`).join('')}
      </section>`;
  }

  function betRowHTML(bet, { settleable }) {
    const lines = bet.selections.map(s => `<div class="kbl-bet-sel"><span>${esc(s.fixtureLabel)}</span><small>${esc(s.selectionName)} · ${esc(s.marketName)}</small><b>${s.oddsAtPlacement.toFixed(2)}</b></div>`).join('');
    const header = bet.type === 'bet-builder' ? `Bet Builder · ${bet.selections.length} legs` : bet.type === 'acca' ? `Accumulator · ${bet.selections.length} selections` : 'Single';
    if (settleable) {
      return `<article class="kbl-bet-card" data-bet="${bet.id}">
        <div class="kbl-bet-type">${header}</div>
        ${lines}
        <div class="kbl-bet-figures"><div><small>Stake</small><b>${formatGBP(bet.stake)}</b></div><div><small>Total odds</small><b>${bet.combinedOdds.toFixed(2)}</b></div><div><small>Potential return</small><b>${formatGBP(bet.potentialReturn)}</b></div></div>
        <div class="kbl-settle-row"><span class="kbl-demo-tag">DEMO SETTLEMENT</span><div><button type="button" class="kbl-settle kbl-settle-lost" data-settle="${bet.id}" data-outcome="lost">Mark LOST</button><button type="button" class="kbl-settle kbl-settle-won" data-settle="${bet.id}" data-outcome="won">Mark WON</button></div></div>
      </article>`;
    }
    const won = bet.status === 'won';
    return `<article class="kbl-bet-card is-settled">
      <div class="kbl-bet-type">${header}<span class="kbl-result-badge ${won ? 'is-won' : 'is-lost'}">${won ? 'WON' : 'LOST'}</span></div>
      ${lines}
      <div class="kbl-bet-figures"><div><small>Stake</small><b>${formatGBP(bet.stake)}</b></div><div><small>Odds</small><b>${bet.combinedOdds.toFixed(2)}</b></div><div><small>${won ? 'Return' : 'Profit/loss'}</small><b class="${won ? 'is-up' : 'is-down'}">${won ? formatGBP(bet.returnPence) : formatGBP(bet.profit)}</b></div></div>
    </article>`;
  }

  function renderMyBets() {
    const st = getState();
    const sub = ui.myBetsSub || 'open';
    return `
      <section class="kbl-mybets">
        <div class="kbl-subtabs">
          <button type="button" class="kbl-subtab${sub === 'open' ? ' is-active' : ''}" data-sub="open">Open (${st.openBets.length})</button>
          <button type="button" class="kbl-subtab${sub === 'settled' ? ' is-active' : ''}" data-sub="settled">Settled (${st.settledBets.length})</button>
        </div>
        ${sub === 'open'
          ? (st.openBets.length ? st.openBets.map(b => betRowHTML(b, { settleable: true })).join('') : `<div class="kbl-empty">No open bets. Head to Bet to place one.</div>`)
          : (st.settledBets.length ? st.settledBets.map(b => betRowHTML(b, { settleable: false })).join('') : `<div class="kbl-empty">Nothing settled yet.</div>`)}
      </section>`;
  }

  function renderTable() {
    const st = getState();
    const rows = [...st.friends, { name: 'You', balance: st.balance, isYou: true }].sort((a, b) => b.balance - a.balance);
    return `<section class="kbl-table">
      <div class="kbl-section-head">Gameweek table</div>
      ${rows.map((r, i) => `<div class="kbl-table-row${r.isYou ? ' is-you' : ''}"><span class="kbl-rank">${i + 1}</span><span class="kbl-name">${esc(r.name)}</span><span class="kbl-balance">${formatGBP(r.balance)}</span></div>`).join('')}
    </section>`;
  }

  function renderSlip() {
    const items = [...ui.slip.values()];
    if (!items.length) { slipbarEl.hidden = true; return; }
    slipbarEl.hidden = false;
    const odds = combinedOdds();
    const stake = stakePence();
    const potentialReturn = Math.round(stake * odds);
    const potentialProfit = potentialReturn - stake;
    const st = getState();
    const insufficient = stake > 0 && stake > st.balance;
    const canPlace = items.length && stake > 0 && !insufficient;
    if (!ui.slipExpanded) {
      slipbarEl.innerHTML = `
        <div class="kbl-slip-summary">
          <button type="button" class="kbl-slip-summary-main" data-expand-slip aria-label="Open bet slip">
            <span class="kbl-slip-summary-count">${items.length} selection${items.length > 1 ? 's' : ''}</span>
            <small>${formatGBP(stake)} stake · Est. return ${formatGBP(potentialReturn)}</small>
          </button>
          <button type="button" class="kbl-slip-summary-open" data-expand-slip>View slip <span>→</span></button>
        </div>`;
      return;
    }
    slipbarEl.innerHTML = `
      <div class="kbl-slip">
        <div class="kbl-slip-head"><span>${items.length > 1 ? (new Set(items.map(item => item.fixtureId)).size === 1 ? `Bet Builder · ${items.length} selections` : `Accumulator · ${items.length} selections`) : 'Bet slip'}</span><button type="button" class="kbl-icon-btn" data-collapse-slip aria-label="Minimise slip">${svg('<path d="M6 15l6-6 6 6"/>', 16)}</button></div>
        <div class="kbl-slip-items">
          ${items.map(s => `<div class="kbl-slip-item"><div><b>${esc(s.selectionName)}</b><small>${esc(s.fixtureLabel)} · ${esc(s.marketName)}</small></div><span>${s.odds.toFixed(2)}</span><button type="button" class="kbl-slip-remove" data-remove-slip="${slipKey(s.marketId, s.selectionId)}" aria-label="Remove selection">${icons.x}</button></div>`).join('')}
        </div>
        <div class="kbl-stake-row">
          <span class="kbl-stake-label">Stake</span>
          <div class="kbl-stake-input-wrap"><span>£</span><input type="text" inputmode="decimal" class="kbl-stake-input" data-stake value="${esc(ui.stakeInput)}" aria-label="Stake amount"></div>
        </div>
        <div class="kbl-quick-stakes">
          ${[500, 1000, 2500].map(p => `<button type="button" class="kbl-quick" data-quick="${p}">${formatGBP(p)}</button>`).join('')}
          <button type="button" class="kbl-quick" data-quick="max">MAX</button>
        </div>
        <div class="kbl-slip-figures">
          <div><span>Total odds</span><b data-total-odds>${(items.length > 1 ? odds : items[0].odds).toFixed(2)}</b></div>
          <div><span>Potential return</span><b data-potential-return>${formatGBP(potentialReturn)}</b></div>
          <div><span>Potential profit</span><b class="${potentialProfit > 0 ? 'is-up' : ''}" data-potential-profit>${potentialProfit >= 0 ? '+' : ''}${formatGBP(potentialProfit)}</b></div>
        </div>
        <div class="kbl-balance-row"><span>Balance</span><b>${formatGBP(st.balance)}</b><span>After stake</span><b data-balance-after>${formatGBP(st.balance - (stake > st.balance ? 0 : stake))}</b></div>
        <div class="kbl-slip-warning" data-insufficient ${insufficient ? '' : 'hidden'}>You don’t have enough virtual balance for this stake.</div>
        <button type="button" class="kbl-place" data-place data-place-amount ${canPlace ? '' : 'disabled'}>PLACE DEMO BET — ${formatGBP(stake)}</button>
      </div>`;
  }

  /* Lightweight update path for stake keystrokes: touches only the derived
   * numbers, never recreates the <input>, so focus/cursor/keyboard stay put. */
  function refreshSlipFigures() {
    const items = [...ui.slip.values()];
    if (!items.length || !ui.slipExpanded) return;
    const odds = combinedOdds();
    const stake = stakePence();
    const potentialReturn = Math.round(stake * odds);
    const potentialProfit = potentialReturn - stake;
    const st = getState();
    const insufficient = stake > 0 && stake > st.balance;
    const canPlace = stake > 0 && !insufficient;
    const set = (sel, text) => { const el = slipbarEl.querySelector(sel); if (el) el.textContent = text; };
    set('[data-potential-return]', formatGBP(potentialReturn));
    const profitEl = slipbarEl.querySelector('[data-potential-profit]');
    if (profitEl) { profitEl.textContent = `${potentialProfit >= 0 ? '+' : ''}${formatGBP(potentialProfit)}`; profitEl.classList.toggle('is-up', potentialProfit > 0); }
    set('[data-balance-after]', formatGBP(st.balance - (stake > st.balance ? 0 : stake)));
    const warn = slipbarEl.querySelector('[data-insufficient]'); if (warn) warn.hidden = !insufficient;
    const placeBtn = slipbarEl.querySelector('[data-place]');
    if (placeBtn) { placeBtn.toggleAttribute('disabled', !canPlace); placeBtn.textContent = `PLACE DEMO BET — ${formatGBP(stake)}`; }
  }

  function renderAll() {
    const st = getState();
    if (ui.tab === 'bet') {
      contentEl.innerHTML = ui.openFixtureId ? renderMarketsDrilldown(findFixture(ui.openFixtureId)) : renderBetTab();
    } else if (ui.tab === 'mybets') {
      contentEl.innerHTML = renderMyBets();
    } else {
      contentEl.innerHTML = renderTable();
    }
    root.querySelectorAll('.kbl-nav-item').forEach(b => b.classList.toggle('is-active', b.dataset.tab === ui.tab));
    const hb = root.querySelector('[data-header-balance]'); if (hb) hb.textContent = formatGBP(st.balance);
    renderSlip();
  }

  /* Single delegated listener — avoids re-binding on every innerHTML swap
   * and keeps DOM ownership simple (no partial patches, no double-render). */
  root.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-close]')) { unmount(); onClose?.(); return; }
    if (t.closest('[data-reset]')) {
      if (window.confirm('Reset the entire Betting Mode Lab demo back to £100.00? This clears all open and settled demo bets.')) {
        resetDemo(); ui.slip.clear(); ui.slipExpanded = false; ui.openFixtureId = null; renderAll(); toast('Demo reset to £100.00');
      }
      return;
    }
    const navBtn = t.closest('[data-tab]');
    if (navBtn) { ui.tab = navBtn.dataset.tab; ui.openFixtureId = null; renderAll(); return; }
    const oddsBtn = t.closest('[data-odds]');
    if (oddsBtn) {
      const fixture = findFixture(oddsBtn.dataset.fixture);
      const market = [...Object.values(fixture.markets)].flat().find(m => m.id === oddsBtn.dataset.market);
      const selection = market.selections.find(s => s.id === oddsBtn.dataset.selection);
      toggleSelection(fixture, market, selection);
      return;
    }
    const openFx = t.closest('[data-open-fixture]');
    if (openFx && !t.closest('[data-odds]')) { ui.openFixtureId = openFx.dataset.openFixture; ui.category = 'popular'; renderAll(); return; }
    if (t.closest('[data-back-fixture]')) { ui.openFixtureId = null; renderAll(); return; }
    const catBtn = t.closest('[data-category]');
    if (catBtn) { ui.category = catBtn.dataset.category; renderAll(); return; }
    const subBtn = t.closest('[data-sub]');
    if (subBtn) { ui.myBetsSub = subBtn.dataset.sub; renderAll(); return; }
    if (t.closest('[data-expand-slip]')) { ui.slipExpanded = true; renderSlip(); return; }
    if (t.closest('[data-collapse-slip]')) { ui.slipExpanded = false; renderSlip(); return; }
    const removeBtn = t.closest('[data-remove-slip]');
    if (removeBtn) { ui.slip.delete(removeBtn.dataset.removeSlip); if (!ui.slip.size) ui.slipExpanded = false; renderAll(); return; }
    const quickBtn = t.closest('[data-quick]');
    if (quickBtn) {
      const st = getState();
      ui.stakeInput = quickBtn.dataset.quick === 'max' ? (st.balance / 100).toFixed(2) : (Number(quickBtn.dataset.quick) / 100).toFixed(2);
      renderSlip(); return;
    }
    const settleBtn = t.closest('[data-settle]');
    if (settleBtn) {
      const result = settleBet(settleBtn.dataset.settle, settleBtn.dataset.outcome);
      if (result.ok) toast(result.bet.status === 'won' ? `Won — ${formatGBP(result.bet.returnPence)} credited` : 'Marked lost');
      renderAll();
      return;
    }
    if (t.closest('[data-place]') && !t.closest('[data-place][disabled]')) {
      const stake = stakePence();
      const result = placeBet({ selections: [...ui.slip.values()].map(s => ({ fixtureId: s.fixtureId, marketId: s.marketId, selectionId: s.selectionId })), stakePence: stake });
      if (!result.ok) { toast(result.error); return; }
      ui.slip.clear(); ui.slipExpanded = false; ui.stakeInput = '10.00';
      toast(`Bet placed — ${formatGBP(result.bet.stake)} at ${result.bet.combinedOdds.toFixed(2)}`);
      renderAll();
    }
  });
  root.addEventListener('input', e => {
    if (e.target.matches('[data-stake]')) {
      const before = e.target.value;
      const cleaned = before.replace(/[^0-9.]/g, '').replace(/^(\d*\.\d{0,2}).*$/, '$1');
      ui.stakeInput = cleaned;
      if (cleaned !== before) {
        const pos = e.target.selectionStart - (before.length - cleaned.length);
        e.target.value = cleaned;
        e.target.setSelectionRange(Math.max(0, pos), Math.max(0, pos));
      }
      refreshSlipFigures();
    }
  });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { unmount(); onClose?.(); } });

  const unsubscribe = subscribe(() => renderAll());
  renderAll();

  function unmount() {
    unsubscribe();
    document.body.style.overflow = '';
    root.remove();
  }

  return { unmount };
}
