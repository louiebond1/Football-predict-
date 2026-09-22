/* Betting Mode Lab — access gate.
 *
 * This is the ONLY place that decides whether Betting Mode Lab may render.
 * It is deliberately kept outside betting-lab.js itself: swapping the check
 * from "admin only" to "any group member" later means editing the one line
 * below, not touching the Betting Mode UI/components at all.
 *
 * Reuses the exact same authoritative admin check as the real KickPot Admin
 * console (isCurrentUserGroupAdmin in admin-v1.js — treasurer of the active
 * group, verified against a live RLS-protected read, never a cached flag).
 *
 * Runs for every page load/hash change, so a normal user cannot reach the
 * lab by typing the URL: the check re-resolves every time, and nothing of
 * the lab's DOM is created until it passes. On denial the hash is silently
 * stripped — no message that would confirm to a non-admin that this route
 * means anything.
 */
import { isCurrentUserGroupAdmin } from './admin-v1.js';

const ROUTE_HASH = '#betting-lab';
let activeLab = null; // { unmount }
let checking = false;
let checkingOverlay = null;
let hostShell = null;

function concealHostShell() {
  if (hostShell) return;
  hostShell = document.querySelector('#app');
  if (hostShell) {
    hostShell.setAttribute('aria-hidden', 'true');
    hostShell.style.visibility = 'hidden';
    hostShell.style.pointerEvents = 'none';
  }
  document.documentElement.classList.add('kp-betting-route');
}
function revealHostShell() {
  document.documentElement.classList.remove('kp-betting-route');
  if (hostShell) {
    hostShell.style.visibility = '';
    hostShell.style.pointerEvents = '';
    hostShell.removeAttribute('aria-hidden');
    hostShell = null;
  }
}

function showChecking() {
  concealHostShell();
  if (checkingOverlay) return;
  checkingOverlay = document.createElement('div');
  checkingOverlay.className = 'kp-betting-lab-checking';
  checkingOverlay.setAttribute('role', 'status');
  checkingOverlay.textContent = 'Checking access…';
  document.body.append(checkingOverlay);
}
function hideChecking() { checkingOverlay?.remove(); checkingOverlay = null; }

function stripHash() {
  history.replaceState(null, '', window.location.pathname + window.location.search);
  revealHostShell();
}

async function evaluate() {
  if (window.location.hash !== ROUTE_HASH) {
    if (activeLab) { activeLab.unmount(); activeLab = null; }
    hideChecking();
    revealHostShell();
    return;
  }
  // The underlying KickPot shell defaults to Matchday. Hide it synchronously
  // for the entire betting-route lifecycle so async access/import work can
  // never expose a Matchday frame.
  concealHostShell();
  if (activeLab || checking) return;
  checking = true;
  showChecking();
  try {
    let allowed = false;
    try { allowed = await isCurrentUserGroupAdmin(); } catch { allowed = false; }
    // Hash may have changed while the (async, server-verified) check was in flight.
    if (window.location.hash !== ROUTE_HASH) return;
    if (!allowed) { stripHash(); return; }
    const mod = await import('./betting-lab.js');
    activeLab = mod.mount({ onClose: () => { activeLab = null; stripHash(); } });
  } finally {
    checking = false;
    hideChecking();
  }
}

window.addEventListener('hashchange', () => evaluate().catch(() => stripHash()));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => evaluate().catch(() => stripHash()));
else evaluate().catch(() => stripHash());
