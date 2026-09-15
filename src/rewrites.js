// HORDES — G8 STEP 2: RULE-REWRITE RUN-ALTERING CARDS ("rewrites").
//
// The owner's G8 decision (docs/HORDES_GOALS_2026-09-12.md) is option 6,
// sequenced 1 -> 3 -> 4 -> 2; this file is STEP 2, the LAST one. The naming is
// deliberate and mirrors the two families that already exist:
//   src/rules.js  = CONDITION shape  (the run OBEYS something: Horde Bait,
//                   One of Each)
//   src/perks.js  = STATS shape      (an always-on number: Regrowth, Focus,
//                   Thick Skin)
//   src/rewrites.js = REWRITE shape  (how the run PLAYS changes: piercing,
//                   detonating kills, retaliating pickups)
//
// THREE CARDS, each a one-line trade the player can read at draft speed, each
// ONCE-ONLY (it leaves the pool once taken, like a rule or a perk card), and
// each granted through the SAME apply(player) contract every other card uses —
// the draft screen needs no special case:
//
//   PIERCE ALL (pierceall) — every projectile pierces; nothing stops at the
//     first body. The NOVA_SHOT evolution already does this for the volley
//     (weapons.js PIERCE_ALL sentinel); the card makes it weapon-agnostic,
//     read at SPAWN (main.js volley fire + weapons.js boomerang throw) so the
//     duplicated update loops need no change.
//   CHAIN REACTION (onkillboom) — every kill detonates; the blast damages
//     nearby enemies. The COLOSSUS deathShockwave is the precedent (main.js's
//     death pass): enemy-side friendly fire only, so it can never kill the
//     player; the death pass splices each enemy exactly once, so a kill
//     detonates exactly once; NO toast per kill (the event feed is for rare
//     moments — the owner's juice rule).
//   BLOOD HARVEST (healthdamage) — picking up a health potion also damages
//     nearby enemies. Hooked on the PICKUP (the ground-drop collect path), not
//     the drink: the ask is "health pickups also damage".
//
// WHERE THE STATE LIVES: on the RUN player (`state.player.rewrites`), exactly
// like `rules` / `skills` / `takenStats`, so a fresh makePlayer() is a fresh
// run and nothing enters the save schema.
//
// PURE BY DESIGN: every helper is a pure function of (state[, value]) — no
// rng, no DOM, no mutation outside the writer the game calls. That is what
// lets test/test_rewrites.mjs measure the rewrites with no browser and no sim.
//
// G21 SLICE 1 (2026-09-15): the KEYWORD TAXONOMY + FINITE REWRITE SLOTS.
//   - REWRITE_TAGS: the reserved keyword set (FROST / CHAIN / ORBIT / BURN /
//     CONDUCT). Every card carries a `tags` array from the set (slice 1: one
//     tag per card; cross-tag combos are slice 2). The draft desc is PREFIXED
//     with the tag at the rewriteCards seam so stacking reads at draft speed;
//     pierceall/healthdamage stay untagged (they predate the taxonomy and
//     honestly belong to no keyword family — do NOT force-tag them).
//   - REWRITE_SLOTS (config.js): FOUR finite slots. A full run is offered NO
//     rewrite cards (rewriteCards returns [] — the family self-filters, the
//     draft pool needs no special case). Empty slots pay -5% skill/ult
//     cooldown each through emptySlotCooldownMult, read in exactly ONE place
//     (skillCooldown, perks.js) so the HUD's readiness readout can never lie.
//   - FIVE new cards, one per tag (RIME / IGNITE / LIVE WIRE / AFTERSHOCK /
//     WIDE ORBIT), fed by the ONE on-weapon-hit writer onWeaponHit(state,
//     enemy), called from direct-weapon-hit sites ONLY (never from blasts,
//     burn ticks, echoes, thorns or enemy damage). AFTERSHOCK and WIDE ORBIT
//     are PREDICATE-offered (a dead card can never be drafted) through the
//     optional per-card `offered(state)` (precedent: frostcard.js).
import { CONFIG as C } from './config.js';

export const REWRITE_TAGS = ['FROST', 'CHAIN', 'ORBIT', 'BURN', 'CONDUCT'];

export const REWRITES = {
  pierceall: {
    id: 'pierceall',
    name: 'Pierce All',
    tags: [],
    desc: 'every shot pierces - nothing stops at the first body',
  },
  onkillboom: {
    id: 'onkillboom',
    name: 'Chain Reaction',
    tags: ['CHAIN'],
    desc: 'every kill detonates - the blast damages enemies nearby',
  },
  healthdamage: {
    id: 'healthdamage',
    name: 'Blood Harvest',
    tags: [],
    desc: 'health potions also damage enemies nearby',
  },
  // ---- G21 slice 1: one rule card per keyword -------------------------------
  rime: {
    id: 'rime',
    name: 'Rime',
    tags: ['FROST'],
    desc: 'your weapon hits chill - enemies crawl for a moment',
  },
  ignite: {
    id: 'ignite',
    name: 'Ignite',
    tags: ['BURN'],
    desc: 'your weapon hits set enemies burning for 3s',
  },
  livewire: {
    id: 'livewire',
    name: 'Live Wire',
    tags: ['CONDUCT'],
    desc: 'every 5th weapon hit zaps a nearby enemy',
  },
  aftershock: {
    id: 'aftershock',
    name: 'Aftershock',
    tags: ['CHAIN'],
    // PREDICATE-offered: a run with NO detonation source (the onkillboom
    // card, the Witch's CHAIN_REACTION Q or the Rogue's AFTERIMAGE) must
    // never see this card — a dead pick cannot be drafted.
    offered: hasBlastSource,
    desc: 'every detonation echoes once, half size and half damage',
  },
  wideorbit: {
    id: 'wideorbit',
    name: 'Wide Orbit',
    tags: ['ORBIT'],
    // PREDICATE-offered: only while an ORBIT weapon is equipped (the same
    // equipped-weapon read detectSynergies consumes).
    offered: orbitEquipped,
    desc: 'ORBIT blades fly 30% wider and spin 20% faster',
  },
};
export const REWRITE_IDS = Object.keys(REWRITES);

// The weight ONE rewrite card carries in the draft pool. G21 slice 1: the
// family grew 3 -> 8 cards (C4), so the PER-CARD weight retunes to hold the
// FAMILY SHARE at the measured ~0.06 (8 x 0.0075 = 0.06, exactly the old
// 3 x 0.02) — every draft measurement this project keeps stays comparable.
// MEASURED CURVE (60 runs/cell, seed 4242, good/bad MEAN survival ratio,
// tools/draft_sim.mjs --rewrite-weight, fresh-profile CLI baseline):
// 0.005 -> x1.05, 0.0075 -> x1.04, 0.01 -> x1.05, 0.015 -> x1.05,
// 0.02 -> x1.04 — flat across the band (the family is a small share at any
// of these weights), every cell clearing the acceptance substance (bad fails
// 100%, good beats bad on 3/5 minute-10 metrics). The absolute ratio is far
// below the HISTORY cells because the tree moved (post-E1/W7B sim baseline
// is good 58s vs bad 56s at the fresh profile), not because the family
// weakened; the old tree cannot be re-run (no git checkout per house rules).
// HISTORY (the 3-card family, same method): 0.05 -> 1.69x, 0.03 -> 1.73x,
// 0.02 -> 1.77x, 0.01 -> 1.79x, gently monotone, all cells clearing the
// acceptance substance (bad fails 100%, good beats bad >=3/5 minute-10
// metrics); the family shipped at 0.02/card under the owner directive
// 2026-09-13 ("should use mana? And be rare.").
export const REWRITE_CARD_WEIGHT = 0.0075;

// ---- CHAIN REACTION numbers (the detonation on every kill) -----------------
// Radius covers a trash pack; damage is a flat + a fraction of the player's
// weapon damage so the blast stays relevant as the ladder's HP curve climbs
// (a pure flat number would be dust by minute 5).
export const BOOM_RADIUS = 40;
export const BOOM_DAMAGE_FLAT = 4;
export const BOOM_DAMAGE_FRAC = 0.5;   // + 50% of the player's weapon damage

// CHAIN REACTION's mana price. A detonation on EVERY kill is the strongest
// engine in the family (one-bad-pick probe 1.20x), so it now draws on the pool.
// SOFT gate, not a hard one: when the run cannot pay, the blast still fires at
// a reduced radius and damage rather than vanishing, so the card never goes
// dark mid-fight (the failure mode measured on Chain Zap's first cut).
export const BOOM_MANA_COST = 6;
export const BOOM_DRY_RADIUS_MULT = 0.6;
export const BOOM_DRY_DAMAGE_MULT = 0.4;

// ---- BLOOD HARVEST numbers (the blast on every health pickup) --------------
// Potions are ~rare (POTIONS.DROP_CHANCE 0.03/kill), so the blast is allowed
// to hit harder than a Chain Reaction detonation: a full weapon hit's worth
// on top of a flat, in a slightly wider ring around the player (the pickup
// happens at the player's feet, not at the corpse).
export const HARVEST_RADIUS = 55;
export const HARVEST_DAMAGE_FLAT = 10;
export const HARVEST_DAMAGE_FRAC = 1.0;   // + 100% of the player's weapon damage

// ---- G21 slice 1: the five keyword cards' numbers (the family keeps its ----
// ---- numbers here, beside BOOM_*/HARVEST_* — see the brief's C4)         ----
// RIME (FROST): a direct hit refreshes the EXISTING slow field to this
// duration; the grip is gentler than FROST_NOVA's cast (0.75 move mult vs the
// nova's 0.45) because it fires on EVERY direct hit, not on a paid cast.
export const RIME_SLOW_DURATION = 1.5;
export const RIME_SLOW_FACTOR = 0.75;
// IGNITE (BURN): a direct hit refreshes the burn (never stacks): FLAT + FRAC x
// the player's weapon damage per second, for DURATION seconds, snapshotted at
// application. Burn damage never triggers riders and never detonates.
export const IGNITE_BURN_DURATION = 3;
export const IGNITE_BURN_FLAT = 2;
export const IGNITE_BURN_FRAC = 0.25;
// LIVE WIRE (CONDUCT): every EVERY-th direct hit zaps the nearest OTHER live
// enemy within RANGE for MULT x the player's weapon damage (0.5 matches the
// house zap falloff convention). The counter is a run-player integer — hits
// are EVENTS, so 60Hz and 120Hz count identically.
export const LIVEWIRE_EVERY = 5;
export const LIVEWIRE_RANGE = 120;
export const LIVEWIRE_DAMAGE_MULT = 0.5;
// AFTERSHOCK (CHAIN): every applyBlast detonation echoes ONCE, DELAY seconds
// later, at half radius and half damage, through the SAME applyBlast path.
// The echo is flagged so it never echoes and never schedules again.
export const AFTERSHOCK_DELAY = 0.4;
export const AFTERSHOCK_RADIUS_MULT = 0.5;
export const AFTERSHOCK_DAMAGE_MULT = 0.5;
// WIDE ORBIT (ORBIT): the orbit blade ring widens and spins faster (the
// updateOrbit reads, weapons.js — the ONLY weapons.js touch beside the rider).
export const WIDEORBIT_RADIUS_MULT = 1.3;
export const WIDEORBIT_SPIN_MULT = 1.2;
// The empty-slot opportunity-cost payment (C2): each EMPTY rewrite slot is
// worth -5% skill/ult cooldown, multiplicative via skillCooldown (perks.js).
// Floored at x0.80 so raising REWRITE_SLOTS can never deepen the payment.
export const EMPTY_SLOT_COOLDOWN_STEP = 0.05;
export const EMPTY_SLOT_COOLDOWN_FLOOR = 0.80;

// ---------- readers --------------------------------------------------------
export function rewritesOf(state) {
  const p = state && state.player;
  return (p && p.rewrites) || null;
}
export function hasRewrite(state, id) {
  const r = rewritesOf(state);
  return !!(r && r[id]);
}
/** A rewrite can be TAKEN once; after that its card leaves the pool. */
export function rewriteCardOffered(id, state) {
  return !hasRewrite(state, id);
}
/** How many of the finite REWRITE_SLOTS the run has spent (0..REWRITE_SLOTS). */
export function rewriteCount(state) {
  const r = rewritesOf(state);
  return r ? Object.keys(r).filter(k => r[k]).length : 0;
}
/**
 * C2 - EMPTY SLOTS PAY: x0.80 at zero rewrites taken, +0.05 per slot spent,
 * x1.00 at a full house. Floored at EMPTY_SLOT_COOLDOWN_FLOOR so a raised
 * REWRITE_SLOTS can never deepen the payment. Read in exactly ONE place
 * (skillCooldown, perks.js) — the COOLDOWN part only, so a kill-charged
 * ult's KILL count is untouched and its floor still applies after the mult.
 */
export function emptySlotCooldownMult(state) {
  const empty = Math.max(0, C.REWRITE_SLOTS - rewriteCount(state));
  return Math.max(EMPTY_SLOT_COOLDOWN_FLOOR, 1 - EMPTY_SLOT_COOLDOWN_STEP * empty);
}
// ---- the two offering predicates (C4) ---------------------------------------
/** AFTERSHOCK: the run has a detonation source for the echo to ride. */
function hasBlastSource(state) {
  if (hasRewrite(state, 'onkillboom')) return true;
  const q = state && state.character && state.character.skill;
  return q === 'CHAIN_REACTION' || q === 'AFTERIMAGE';
}
/** WIDE ORBIT: an ORBIT weapon is equipped (the read detectSynergies consumes). */
function orbitEquipped(state) {
  return !!(state && state.weapons && state.weapons.some(w => w && w.type === 'ORBIT'));
}
/** The draft cards for every rewrite the run can still be offered. */
export function rewriteCards(state) {
  // C1: FOUR finite slots — a full run is offered NO rewrite cards. The
  // family self-filters HERE so the draft pool needs no special case.
  if (rewriteCount(state) >= C.REWRITE_SLOTS) return [];
  const out = [];
  for (const id of REWRITE_IDS) {
    if (!rewriteCardOffered(id, state)) continue;
    const r = REWRITES[id];
    // C4: a predicate-offered card consumes NO rng and never reaches the
    // pool while its predicate is false (a dead card cannot be drafted).
    if (r.offered && !r.offered(state)) continue;
    out.push({
      id: 'rewrite_' + id,
      rewrite: id,
      name: r.name,
      // C3: the tag is prefixed at THIS seam so stacking reads at draft
      // speed; untagged cards keep their byte-identical desc.
      desc: r.tags.length ? r.tags.join('+') + ' - ' + r.desc : r.desc,
      weight: REWRITE_CARD_WEIGHT,
      // Same contract as every other draft card: apply(player).
      apply: (p) => { if (!p.rewrites) p.rewrites = {}; p.rewrites[id] = true; },
    });
  }
  return out;
}

// ---------- writers --------------------------------------------------------
/** Grant a rewrite. Returns true only when the id is a real rewrite. */
export function grantRewrite(state, id) {
  if (!REWRITES[id] || !state || !state.player) return false;
  if (!state.player.rewrites) state.player.rewrites = {};
  state.player.rewrites[id] = true;
  return true;
}

// ---------- applied-value helpers (the ONE source the game reads) -----------
/**
 * The detonation numbers (radius/damage/manaCost) for a pool state. PURE.
 * N1 slice 1: the Witch's Q chain detonates its kills with THESE numbers —
 * the same blast, the same 6-mana price, the same dry fallback — so there is
 * exactly ONE detonation implementation in the game. rewriteBoom (the
 * draftable card: EVERY kill detonates) and the Q (CHAIN kills detonate)
 * both call this; only their gating differs.
 */
export function boomBlast(p) {
  // PURE: the helper decides what the blast WOULD be and what it WOULD cost;
  // the caller performs the spend. A state with no finite mana pool (unit
  // tests, any non-run caller) cannot bind the cost, so it reads funded.
  const pool = typeof p.mana === 'number' ? p.mana : Infinity;
  const funded = pool >= BOOM_MANA_COST;
  const base = BOOM_DAMAGE_FLAT + BOOM_DAMAGE_FRAC * (p.stats.damage || 0);
  return {
    radius: funded ? BOOM_RADIUS : BOOM_RADIUS * BOOM_DRY_RADIUS_MULT,
    damage: funded ? base : base * BOOM_DRY_DAMAGE_MULT,
    manaCost: funded ? BOOM_MANA_COST : 0,
  };
}
/** CHAIN REACTION (the rewrite card)'s detonation at the kill site, or null when not held. */
export function rewriteBoom(state) {
  if (!hasRewrite(state, 'onkillboom')) return null;
  return boomBlast(state.player);
}
/** BLOOD HARVEST's blast at the pickup site, or null when not held. */
export function harvestBlast(state) {
  if (!hasRewrite(state, 'healthdamage')) return null;
  const p = state.player;
  return {
    radius: HARVEST_RADIUS,
    damage: HARVEST_DAMAGE_FLAT + HARVEST_DAMAGE_FRAC * (p.stats.damage || 0),
  };
}
/**
 * N1 slice 3: the ONE radial-blast APPLICATION, exported so every detonation
 * shares a single implementation. main.js's death pass (onkillboom / the
 * Witch's chain kills) used to own this loop inline; the Rogue's AFTERIMAGE
 * phantoms (skills.js updateUlts) now detonate through the SAME path.
 * Applies damage + the hit flash to every live enemy inside radius and pushes
 * the established 'rewrite_boom' draw effect (render.js already draws it).
 * Enemy-side friendly fire only, exactly like the death-pass loop — a blast
 * can never hurt the player. Returns the number of enemies hit.
 */
export function applyBlast(state, x, y, blast) {
  let hits = 0;
  for (const o of state.enemies) {
    if (o.hp <= 0) continue;
    if (Math.hypot(o.x - x, o.y - y) <= blast.radius) {
      o.hp -= blast.damage;
      o.flash = 0.08;
      hits++;
    }
  }
  state.effects.push({ kind: 'rewrite_boom', x, y, radius: blast.radius, age: 0, ttl: 0.25 });
  // G21 slice 1 AFTERSHOCK: every detonation schedules ONE echo through the
  // SAME path — half radius, half damage, AFTERSHOCK_DELAY seconds later.
  // blast.echo marks the echo itself: it never echoes (no chain-of-chains).
  // The queue is lazy run state (never serialised); tickRewriteEchoes fires it.
  if (hasRewrite(state, 'aftershock') && !blast.echo) {
    (state.rewriteEchoes || (state.rewriteEchoes = [])).push({
      x, y,
      radius: blast.radius * AFTERSHOCK_RADIUS_MULT,
      damage: blast.damage * AFTERSHOCK_DAMAGE_MULT,
      t: AFTERSHOCK_DELAY, echo: true,
    });
  }
  return hits;
}

/** AFTERSHOCK's echo queue, dt-driven (60Hz and 120Hz fire at the same wall
 * time). Called once per frame from main.js's play loop, flyingGuard-wrapped
 * like every ground blast. Returns the number of echoes fired this call. */
export function tickRewriteEchoes(state, dt) {
  const q = state.rewriteEchoes;
  if (!q || q.length === 0) return 0;
  let fired = 0;
  for (let i = q.length - 1; i >= 0; i--) {
    const e = q[i];
    e.t -= dt;
    if (e.t > 1e-9) continue;   // float dust: 24 x (1/60) never lands on exactly 0.4
    q.splice(i, 1);
    applyBlast(state, e.x, e.y, { radius: e.radius, damage: e.damage, echo: true });
    fired++;
  }
  return fired;
}

// ---------- G21 slice 1: the ONE on-weapon-hit rider writer -------------------
/**
 * onWeaponHit(state, enemy) — called from DIRECT-weapon-hit damage sites ONLY
 * (weapons.js hurt() — orbit/boomerang/zap/nova-pulse/scythe/seeker/mine/
 * beam — plus main.js's volley projectile, the synergy zap forks and the
 * synergy mine detonation), and from NOWHERE else: never from blasts
 * (applyBlast), burn ticks, echoes, thorns, or enemy damage. Feeds RIME,
 * IGNITE and LIVE WIRE. A hit that kills still counts (the hit happened).
 */
export function onWeaponHit(state, enemy) {
  const p = state && state.player;
  if (!p || !enemy) return;
  const r = p.rewrites;
  if (!r) return;
  if (r.rime) {
    // Refresh, never stack — and never TRUNCATE a longer slow already
    // gripping (a FROST_NOVA window outlasts the chill; the gentler grip
    // factor still applies while the chill is freshest).
    enemy.slow = Math.max(enemy.slow || 0, RIME_SLOW_DURATION);
    enemy.slowMult = RIME_SLOW_FACTOR;
  }
  if (r.ignite) {
    // Refresh, never stack: the dps snapshots the CURRENT weapon damage.
    enemy.burn = IGNITE_BURN_DURATION;
    enemy.burnDps = IGNITE_BURN_FLAT + IGNITE_BURN_FRAC * (p.stats.damage || 0);
  }
  if (r.livewire) {
    p.livewireHits = (p.livewireHits || 0) + 1;
    if (p.livewireHits % LIVEWIRE_EVERY === 0) {
      // The nearest OTHER live enemy within RANGE of the struck one (the
      // first-found-wins-ties scan, same rule weapons.js nearestEnemy owns —
      // duplicated here so rewrites.js stays import-cycle-free).
      let best = null, bestD = Infinity;
      for (const o of state.enemies) {
        if (o === enemy || o.hp <= 0) continue;
        const d = Math.hypot(o.x - enemy.x, o.y - enemy.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      if (best && bestD <= LIVEWIRE_RANGE) {
        // Applied DIRECTLY (never through hurt/onWeaponHit): the zap cannot
        // retrigger the rider — no recursion, no chain-of-chains.
        best.hp -= LIVEWIRE_DAMAGE_MULT * (p.stats.damage || 0);
        best.flash = 0.08;
        state.effects.push({ kind: 'zap',
          points: [{ x: enemy.x, y: enemy.y }, { x: best.x, y: best.y }],
          age: 0, ttl: 0.15 });
      }
    }
  }
}

// ---------- G21 slice 1: the WIDE ORBIT applied-value readers -----------------
// updateOrbit (weapons.js) reads THESE, never the ledger — one source, so the
// game and the test measure the same numbers. x1 when the card is not held.
export function wideOrbitRadiusMult(state) {
  return hasRewrite(state, 'wideorbit') ? WIDEORBIT_RADIUS_MULT : 1;
}
export function wideOrbitSpinMult(state) {
  return hasRewrite(state, 'wideorbit') ? WIDEORBIT_SPIN_MULT : 1;
}
