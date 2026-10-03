// HORDES — src/explore.js
//
// M5b EXPLORE pilot: it fights exactly like AUTO, but when the field is calm
// it walks to the nearest site worth using. A map waypoint overrides the
// pick in AUTO and EXPLORE. Pure: reads state, returns a goal; main.js
// publishes it as state.pilotGoal and the AutoPilot routes to it (the
// existing planner around buildings). The flee branch still outranks it, so
// a threat always turns the pilot back to kiting.

import { SITES, siteOpen } from './sites.js';
import { CONFIG as C } from './config.js';

export const EXPLORE = {
  CALM_R: 160,          // no live enemy this close...
  CROWD_R: 300,         // ...at most CROWD_MAX live enemies this close...
  CROWD_MAX: 3,
  CALM_HP: 0.6,         // ...and HP at or above this
  GEM_R: 80,            // more than GEM_MAX XP gems this close are banked first
  GEM_MAX: 4,           //   (AUTO's drift)
  FOUNTAIN_HP: 0.7,     // only walks to a fountain below this
  ALTAR_HP: 0.8,        // the boss altar: HP at or above this...
  ALTAR_LEVEL_BASE: 4,  // ...and level >= BASE + PER_WAVE * wave
  ALTAR_LEVEL_PER_WAVE: 4,
  ALTAR_WAVE_FRAC: 0.4, // ...and at least this much of the wave has passed
  REACH_R: 18,          // a plain waypoint clears inside this
  MAX_DIST: 900,        // hard ceiling on a detour (the carrier hunt too)
  DETOUR_BASE: 560,     // the detour cap: BASE - PER_WAVE x (wave - 1)...
  DETOUR_PER_WAVE: 80,
  DETOUR_MIN: 300,      // ...never below this
  YARD_CLEAR_R: 340,    // the walled yard (a dead end): no live enemy this close
  CARRIER_HP: 0.7,      // hunts the key carrier only at or above this HP
  GOAL_GIVEUP_S: 30,    // a site held this long in all without being used is given up (main.js)
  // A build ahead of the curve (level >= ALTAR_LEVEL_BASE + PER_WAVE x wave)
  // can afford the old, looser look: it kills what comes while it walks.
  STRONG: { CALM_R: 110, CROWD_MAX: Infinity, CALM_HP: 0.5, YARD_CLEAR_R: 140, DETOUR: 900 },
};

// Ahead of the curve: the altar's level rule.
export function strongBuild(state, p) {
  const n = (state.wave && state.wave.num) || 1;
  return (p.level || 1) >= EXPLORE.ALTAR_LEVEL_BASE + EXPLORE.ALTAR_LEVEL_PER_WAVE * n;
}

// EXPLORE careers (8 seeds) died earlier than AUTO: walking to sites it left
// the XP gems behind (level 3.2 vs 4.1 at 1:00, 5.8 vs 7.4 at 2:00), went out
// with half HP, took 900 px detours to the rim and kept site goals while a
// boss was up. The rules below keep AUTO's fighting and levelling first; a
// site is a detour for an empty, healthy moment. (docs/WORLD.md, "EXPLORE
// career fix".)

// Calm: HP at or above CALM_HP, no live enemy within CALM_R, and at most
// CROWD_MAX within CROWD_R (a wider look than the nearest enemy).
export function exploreCalm(state, p) {
  if (!p || !p.stats) return false;
  const k = strongBuild(state, p) ? EXPLORE.STRONG : EXPLORE;
  if (p.hp < k.CALM_HP * p.stats.maxHp) return false;
  const r2 = k.CALM_R * k.CALM_R, c2 = EXPLORE.CROWD_R * EXPLORE.CROWD_R;
  let crowd = 0;
  for (const e of state.enemies || []) {
    if (!(e.hp > 0)) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d <= r2) return false;
    if (d <= c2 && ++crowd > k.CROWD_MAX) return false;
  }
  return true;
}

// A boss or the herald alive: the fight comes first, no detours.
export function bossFight(state) {
  const w = state.wave || {};
  if (w.boss && w.boss.hp > 0) return true;
  return (w.bosses || []).some(b => b && b.hp > 0) || (w.midBosses || []).some(b => b && b.hp > 0);
}

// XP gems near enough, and enough of them, to bank first.
export function gemsNear(state, p) {
  const r2 = EXPLORE.GEM_R * EXPLORE.GEM_R;
  let n = 0;
  for (const g of state.gems || []) if ((g.x - p.x) ** 2 + (g.y - p.y) ** 2 <= r2 && ++n > EXPLORE.GEM_MAX) return true;
  return false;
}

// The detour cap: how far a site may be, shrinking as the waves grow (a
// build ahead of the curve keeps the full reach).
export function detourCap(state, p = null) {
  if (p && strongBuild(state, p)) return EXPLORE.STRONG.DETOUR;
  const n = (state.wave && state.wave.num) || 1;
  return Math.min(EXPLORE.MAX_DIST, Math.max(EXPLORE.DETOUR_MIN, EXPLORE.DETOUR_BASE - EXPLORE.DETOUR_PER_WAVE * (n - 1)));
}

// No live enemy within r.
function emptyAround(state, p, r) {
  const r2 = r * r;
  for (const e of state.enemies || []) if (e.hp > 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= r2) return false;
  return true;
}

// The boss-altar rule: only when the build looks strong enough, and only
// when the altar would answer (main.js altarCanSummon): before the maw's
// wave, no boss alive, no portal coming, more than 3 s left in the wave.
export function altarReady(state, p) {
  const w = state.wave || {};
  if (!p || !p.stats || w.boss || state.portal || w.pendingClear) return false;
  const end = (C.ESCALATION && C.ESCALATION.END_WAVE) || Infinity;
  if ((w.num || 1) >= end || (w.bosses || []).some(b => b && b.hp > 0)) return false;
  if (w.endsAt != null && (w.endsAt - state.time) <= 3) return false;
  if (p.hp < EXPLORE.ALTAR_HP * p.stats.maxHp) return false;
  if ((p.level || 1) < EXPLORE.ALTAR_LEVEL_BASE + EXPLORE.ALTAR_LEVEL_PER_WAVE * (w.num || 1)) return false;
  const len = (C.ESCALATION && C.ESCALATION.WAVE_LENGTH) || 0;
  if (len > 0 && w.endsAt != null && (w.endsAt - state.time) > len * (1 - EXPLORE.ALTAR_WAVE_FRAC)) return false;
  return true;
}

// Would EXPLORE use this site now?
export function exploreWants(state, p, s) {
  if (!siteOpen(s)) return false;
  switch (s.kind) {
    case 'shrine': return true;
    case 'brazier': return true;
    case 'fountain': return p.hp < EXPLORE.FOUNTAIN_HP * p.stats.maxHp;
    case 'altar': return altarReady(state, p);
    // M5b slice 3: the vault once the key is held; the lever; the yard once open.
    case 'vault': return !!(state.poi && state.poi.hasKey);
    case 'lever': return s.state === 'unused';
    // The walled yard is a dead end: only into an empty field.
    case 'yard': return !!s.open && emptyAround(state, p, strongBuild(state, p) ? EXPLORE.STRONG.YARD_CLEAR_R : EXPLORE.YARD_CLEAR_R);
    default: return false;   // never takes a cursed statue
  }
}

// Stand-in sites: the pilot holds inside the ring instead of walking through.
export function holdRadius(s) {
  if (s.kind === 'shrine') return SITES.SHRINE_R - 10;
  if (s.kind === 'fountain') return SITES.FOUNTAIN_R - 8;
  if (s.kind === 'crack') return 10;
  return 0;
}

// The goal for this frame, or null. `mode` is the pilot mode; `skip` is a Set
// of site ids the pilot gave up on (unreachable).
export function exploreGoal(state, p, mode, skip = null) {
  if (mode === 'MANUAL' || !p) return null;
  const wp = state.waypoint;
  if (wp) {
    const s = wp.site;
    if (s) return { x: s.x, y: s.y, site: s, hold: holdRadius(s), waypoint: true };
    return { x: wp.x, y: wp.y, site: null, hold: 0, waypoint: true };
  }
  if (mode !== 'EXPLORE') return null;
  // Fight and level first: no detour during a boss or herald fight, or while
  // XP gems lie near (AUTO's drift banks them), or when the field is not calm.
  const ahead = strongBuild(state, p);
  if (bossFight(state) || (!ahead && gemsNear(state, p)) || !exploreCalm(state, p)) return null;
  const w = state.poi;
  // M5b slice 3: the dropped key first; then the key carrier when healthy and seen.
  if (w && w.keyDrop && Math.hypot(w.keyDrop.x - p.x, w.keyDrop.y - p.y) <= EXPLORE.MAX_DIST) {
    return { x: w.keyDrop.x, y: w.keyDrop.y, site: null, hold: 0, waypoint: false, key: true };
  }
  // The hunt also waits for a strong enough build (the sim found early hunts
  // at the wave-1 boss cost runs).
  if (strongBuild(state, p) && w && w.carrier && w.carrierSeen && w.carrier.hp > 0 && p.hp >= EXPLORE.CARRIER_HP * p.stats.maxHp &&
    Math.hypot(w.carrier.x - p.x, w.carrier.y - p.y) <= detourCap(state, p)) {
    return { x: w.carrier.x, y: w.carrier.y, site: null, hold: 60, waypoint: false, carrier: true };
  }
  const cap = detourCap(state, p);
  let best = null, bd = cap * cap;
  for (const s of state.sites || []) {
    if (skip && skip.has(s.id)) continue;
    if (!exploreWants(state, p, s)) continue;
    const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  // Secrets it has noticed: a cracked wall (it stands by and chips it), a glyph.
  for (const s of state.secrets || []) {
    if (!s.seen || s.state === 'spent' || (skip && skip.has(s.id))) continue;
    const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best ? { x: best.x, y: best.y, site: best, hold: holdRadius(best), waypoint: false } : null;
}

// Does the waypoint come off? It clears once its site is used up (or taken,
// for the statue), or when a plain point is reached.
export function waypointDone(state, p) {
  const wp = state.waypoint;
  if (!wp) return false;
  if (wp.site) return !siteOpen(wp.site);
  return Math.hypot(wp.x - p.x, wp.y - p.y) <= EXPLORE.REACH_R;
}
