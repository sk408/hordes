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
// G21 SLICE 2 (2026-09-15): the CROSS-TAG COMBOS + the second card per tag.
//   - The family reaches FOURTEEN cards (goal band 12-20): the five slice-1
//     keyword cards plus GLACIER (FROST), WILDFIRE (BURN) and OVERLOAD
//     (CONDUCT) — always offered until taken/full, like every single-tag card
//     — and the THREE combos THERMAL SHOCK (FROST+BURN), STORM REAPER
//     (CONDUCT+CHAIN) and GLACIAL ORBIT (ORBIT+FROST), each offered ONLY while
//     the run owns BOTH constituents and carrying BOTH tags (the draft desc
//     prefixes "TAG1+TAG2 - ").
//   - REWRITE_SLOTS stays 4 (D3) and the family share stays in the goal's band
//     by WEIGHT CLASS (D4): singles at REWRITE_CARD_WEIGHT, combos at
//     REWRITE_COMBO_WEIGHT_MULT x that.
//   - NO new rider path (R3): the wildfire transfer, the thermal-shock burst,
//     the storm-reaper blast and the overload discharge are each applied
//     DIRECTLY. They advance no counter and fire no onWeaponHit. Storm Reaper
//     detonates through the SAME applyBlast path every other blast uses.
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
  // ---- G21 slice 2: the SECOND card per tag (always offered) ----------------
  glacier: {
    id: 'glacier',
    name: 'Glacier',
    tags: ['FROST'],
    desc: 'hits on a chilled enemy deal +20% damage',
  },
  wildfire: {
    id: 'wildfire',
    name: 'Wildfire',
    tags: ['BURN'],
    desc: 'a burning enemy spreads its burn when it dies',
  },
  overload: {
    id: 'overload',
    name: 'Overload',
    tags: ['CONDUCT'],
    desc: 'every 20th hit discharges a nova zap into nearby enemies',
  },
  // ---- G21 slice 2: the THREE cross-tag combos (predicate-offered) ----------
  // A combo is offered ONLY while the run owns BOTH constituents; it carries
  // BOTH tags, so the draft seam prefixes the desc with "TAG1+TAG2 - " and the
  // stack reads at draft speed. Half weight (REWRITE_COMBO_WEIGHT_MULT): a
  // strictly stronger, predicate-gated card must not inflate the family share.
  thermalshock: {
    id: 'thermalshock',
    name: 'Thermal Shock',
    tags: ['FROST', 'BURN'],
    offered: comboOffered('rime', 'ignite'),
    desc: 'a chilled enemy that catches fire bursts for 3x its burn damage',
  },
  stormreaper: {
    id: 'stormreaper',
    name: 'Storm Reaper',
    tags: ['CONDUCT', 'CHAIN'],
    offered: comboOffered('livewire', 'onkillboom'),
    desc: 'an enemy killed by a zap detonates a half blast',
  },
  glacialorbit: {
    id: 'glacialorbit',
    name: 'Glacial Orbit',
    tags: ['ORBIT', 'FROST'],
    offered: comboOffered('wideorbit', 'rime'),
    desc: 'orbit hits chill longer and bite chilled enemies harder',
  },
};
export const REWRITE_IDS = Object.keys(REWRITES);
/** A card is a CROSS-TAG COMBO when it carries two reserved tags. */
export function isComboRewrite(id) {
  const r = REWRITES[id];
  return !!r && r.tags.length > 1;
}

// The weight ONE SINGLE-TAG/LEGACY rewrite card carries in the draft pool
// (cross-tag combos carry REWRITE_COMBO_WEIGHT_MULT x this — see below).
// G21 slice 2: the family grew 8 -> 14 cards (3 + 5 + 3 singles/legacy = 11,
// plus 3 combos), so the PER-CARD weight retunes AGAIN to hold the FAMILY
// SHARE in the goal's [0.055, 0.070] band: 11 x 0.005 + 3 x 0.0025 = 0.0625
// (slice 1 shipped 8 x 0.0075 = 0.06; the 3-card family shipped 3 x 0.02 =
// 0.06). Every draft measurement this project keeps stays comparable.
// MEASURED CURVE — G21 SLICE 2, 14 CARDS (60 runs/cell, seed 4242, good/bad
// MEAN survival ratio, tools/draft_sim.mjs --rewrite-weight, fresh-profile CLI
// baseline; the cell number is the SINGLES' weight, combos track at half):
// 0.005 -> x1.05, 0.0075 -> x1.05, 0.01 -> x1.05, 0.015 -> x1.04,
// 0.02 -> x1.04 — flat across the band, and EVERY cell clears the acceptance
// substance (bad fails 100%, good beats bad on 3/5 minute-10 metrics) at
// "bad fails 100% | metric wins 3/5" in all five cells. The shipped cell is
// 0.0050. The absolute ratio sits far below the HISTORY cells because the
// tree moved (post-E1/W7B sim baseline is good 58s vs bad 56s at the fresh
// profile), not because the family weakened; the old tree cannot be re-run
// (no git checkout per house rules).
// HISTORY — G21 SLICE 1, 8 CARDS (same method): 0.005 -> x1.05, 0.0075 ->
// x1.04, 0.01 -> x1.05, 0.015 -> x1.05, 0.02 -> x1.04 (the weight slice 1
// shipped was 0.0075).
// HISTORY — THE 3-CARD FAMILY (same method): 0.05 -> 1.69x, 0.03 -> 1.73x,
// 0.02 -> 1.77x, 0.01 -> 1.79x, gently monotone, all cells clearing the
// acceptance substance (bad fails 100%, good beats bad >=3/5 minute-10
// metrics); the family shipped at 0.02/card under the owner directive
// 2026-09-13 ("should use mana? And be rare.").
export const REWRITE_CARD_WEIGHT = 0.005;

// G21 slice 2 (D4): the family is FOURTEEN cards in the same finite slots, so
// the share is held by weight CLASS rather than one flat number:
//   - eleven single-tag/legacy cards at REWRITE_CARD_WEIGHT  (11 x w)
//   - three CROSS-TAG COMBOS at half weight                  (3 x w/2)
// FAMILY TOTAL = 11w + 3(w/2) = 12.5w. The D4 band [0.055, 0.070] is met at
// w = 0.005 -> 12.5 x 0.005 = 0.0625 (the slice-1 shipped share was 0.06).
// Combo cards are strictly stronger AND predicate-gated (both constituents
// required), so pricing them below the singles keeps a given pick's expected
// power-per-share where the 8-card family had it.
export const REWRITE_COMBO_WEIGHT_MULT = 0.5;

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

// ---- G21 slice 2: the six new cards' numbers (same block as slice 1) -------
// GLACIER (FROST): a DIRECT weapon hit against a body already carrying the
// `slow` field lands +20% damage. Read at the direct-hit damage sites through
// directHitMult, never by a blast/burn/echo/thorn (they do not ride, R3).
export const GLACIER_DAMAGE_MULT = 1.20;
// WILDFIRE (BURN): a burning enemy's death hands its burn (remaining dps AND
// duration, full) to the nearest OTHER live body within RANGE — once per
// death. A burn application, never a weapon hit.
export const WILDFIRE_RANGE = 100;
// OVERLOAD (CONDUCT): every EVERY-th direct hit discharges a RANGE-wide nova
// zap at MULT x weapon damage into the TARGETS nearest live enemies (the
// struck body included — 'nearest live enemies', unlike LIVE WIRE's 'other').
// MULT sits above LIVE WIRE's 0.5 so the once-per-20 card reads as a tier
// above the once-per-5 one (the D5 probe re-measures it).
export const OVERLOAD_EVERY = 20;
export const OVERLOAD_RANGE = 100;
export const OVERLOAD_TARGETS = 3;
export const OVERLOAD_DAMAGE_MULT = 0.75;
// THERMAL SHOCK (FROST+BURN): refreshing the burn on an ALREADY-BURNING,
// CHILLED enemy bursts for MULT x the burn dps, instantly. Burn-sourced: no
// rider, no counter, and a burst-lethal corpse is stamped burn-lethal so the
// death pass never detonates it.
export const THERMALSHOCK_BURST_MULT = 3;
// STORM REAPER (CONDUCT+CHAIN): a corpse the LIVE WIRE zap killed detonates a
// MULT-strength CHAIN REACTION blast (radius AND damage) through the SAME
// applyBlast path — so AFTERSHOCK echoes it exactly like any other detonation.
export const STORMREAPER_BLAST_MULT = 0.5;
// GLACIAL ORBIT (ORBIT+FROST): an ORBIT blade hit chills for CHILL seconds
// (against RIME's RIME_SLOW_DURATION on every other direct hit) and deals MULT
// damage to a body that is ALREADY chilled. Extends RIME's write on the orbit
// path only — no second status system.
export const GLACIALORBIT_CHILL_DURATION = 2.5;
export const GLACIALORBIT_DAMAGE_MULT = 1.10;

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
/**
 * G21 slice 2 D2: a CROSS-TAG COMBO is offered only while the run owns BOTH
 * constituents. The predicate reads `state.player.rewrites` through the same
 * reader every other card uses, and (like every other predicate) consumes no
 * rng: rewriteCards never draws at all.
 */
function comboOffered(a, b) {
  return (state) => hasRewrite(state, a) && hasRewrite(state, b);
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
      // D4: a combo (two tags) carries HALF the per-card weight; every other
      // card keeps the family base. The weights are read by openDraft's pool
      // and by tools/draft_sim.mjs, so one number drives both.
      weight: r.tags.length > 1
        ? REWRITE_CARD_WEIGHT * REWRITE_COMBO_WEIGHT_MULT
        : REWRITE_CARD_WEIGHT,
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
 * onWeaponHit(state, enemy, opts) — called from DIRECT-weapon-hit damage sites
 * ONLY (weapons.js hurt() — orbit/boomerang/zap/nova-pulse/scythe/seeker/mine/
 * beam — plus main.js's volley projectile, the synergy zap forks and the
 * synergy mine detonation), and from NOWHERE else: never from blasts
 * (applyBlast), burn ticks, echoes, thorns, or enemy damage. Feeds RIME,
 * IGNITE, LIVE WIRE and (slice 2) OVERLOAD.
 * `opts.orbit` marks an ORBIT blade contact, which is the ONLY hit class
 * GLACIAL ORBIT extends (its longer chill); every other caller omits it.
 * A hit that kills still counts (the hit happened).
 */
export function onWeaponHit(state, enemy, opts) {
  const p = state && state.player;
  if (!p || !enemy) return;
  const r = p.rewrites;
  if (!r) return;
  if (r.rime) {
    // Refresh, never stack — and never TRUNCATE a longer slow already
    // gripping (a FROST_NOVA window outlasts the chill; the gentler grip
    // factor still applies while the chill is freshest).
    // G21 slice 2 GLACIAL ORBIT: an ORBIT blade hit chills for LONGER
    // (GLACIALORBIT_CHILL_DURATION vs RIME_SLOW_DURATION). It is the same
    // write to the same field — no second status system — and the max() still
    // refuses to truncate a longer nova window.
    const dur = (r.glacialorbit && opts && opts.orbit)
      ? GLACIALORBIT_CHILL_DURATION : RIME_SLOW_DURATION;
    enemy.slow = Math.max(enemy.slow || 0, dur);
    enemy.slowMult = RIME_SLOW_FACTOR;
  }
  if (r.ignite) {
    // Refresh, never stack: the dps snapshots the CURRENT weapon damage.
    const wasBurning = (enemy.burn || 0) > 0 && (enemy.burnDps || 0) > 0;
    enemy.burn = IGNITE_BURN_DURATION;
    enemy.burnDps = IGNITE_BURN_FLAT + IGNITE_BURN_FRAC * (p.stats.damage || 0);
    // G21 slice 2 THERMAL SHOCK: a REFRESH that lands on a body that is both
    // ALREADY BURNING and CHILLED bursts instantly for 3x the burn dps. The
    // burst is BURN-SOURCED damage: applied directly here, so it advances no
    // counter and fires no rider; a burst that kills stamps the corpse
    // burn-lethal exactly like the burn tick does, so the death pass never
    // detonates it (R3 — no chain-of-chains).
    if (r.thermalshock && wasBurning && (enemy.slow || 0) > 0) {
      enemy.hp -= THERMALSHOCK_BURST_MULT * enemy.burnDps;
      enemy.flash = 0.08;
      state.effects.push({ kind: 'nova_pulse', x: enemy.x, y: enemy.y,
        radius: 16, age: 0, ttl: 0.2 });
      if (enemy.hp <= 0) enemy.burnLethal = true;
    }
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
        // G21 slice 2 STORM REAPER: a corpse the ZAP killed is STAMPED here
        // and detonated by the death pass (main.js) through the SAME
        // applyBlast path every other detonation uses — so it is
        // flyingGuard-wrapped, never rides, and AFTERSHOCK may echo it. A zap
        // that does not kill stamps nothing (R2: kills only, not hits).
        if (r.stormreaper && best.hp <= 0) best.zapLethal = true;
      }
    }
  }
  if (r.overload) {
    // G21 slice 2 OVERLOAD: its OWN run-player integer, separate from LIVE
    // WIRE's; both advance on the same hit and may fire together.
    p.overloadHits = (p.overloadHits || 0) + 1;
    if (p.overloadHits % OVERLOAD_EVERY === 0) {
      // A RANGE-wide nova centred on the struck body: the TARGETS nearest
      // live enemies inside it, the struck one INCLUDED (the brief's
      // 'nearest live enemies', against LIVE WIRE's 'nearest OTHER'). Applied
      // DIRECTLY — the discharge never re-advances either counter and never
      // fires a rider (R3).
      const inRange = [];
      for (const o of state.enemies) {
        if (o.hp <= 0) continue;
        const d = Math.hypot(o.x - enemy.x, o.y - enemy.y);
        if (d <= OVERLOAD_RANGE) inRange.push({ o, d });
      }
      inRange.sort((a, b) => a.d - b.d);
      for (const { o } of inRange.slice(0, OVERLOAD_TARGETS)) {
        o.hp -= OVERLOAD_DAMAGE_MULT * (p.stats.damage || 0);
        o.flash = 0.08;
        state.effects.push({ kind: 'zap',
          points: [{ x: enemy.x, y: enemy.y }, { x: o.x, y: o.y }],
          age: 0, ttl: 0.15 });
      }
    }
  }
}

// ---------- G21 slice 2: the second-tag + combo applied-value helpers ---------
/**
 * The damage multiplier ONE DIRECT weapon hit lands with. PURE. Read at every
 * direct-hit damage site (main.js's volley / zap fork / scythe lash / mine
 * payload and weapons.js hurt()), beside the onWeaponHit rider, so a blast,
 * burn tick, echo, thorn or discharge can never see it (R3).
 *   GLACIER       x1.20 on any direct hit against a SLOWED (chilled) body.
 *   GLACIAL ORBIT x1.10 on an ORBIT blade hit against a chilled body.
 * An ORBIT hit that LANDS the chill prices at x1: the chill is written by
 * onWeaponHit AFTER the damage, so only a chill already gripping counts.
 * `opts.orbit` selects the ORBIT-only card; every other caller omits it.
 */
export function directHitMult(state, enemy, opts) {
  if (!enemy || !(enemy.slow > 0)) return 1;
  let m = 1;
  if (hasRewrite(state, 'glacier')) m *= GLACIER_DAMAGE_MULT;
  if (opts && opts.orbit && hasRewrite(state, 'glacialorbit')) m *= GLACIALORBIT_DAMAGE_MULT;
  return m;
}
/**
 * G21 slice 2 WILDFIRE: a BURNING enemy's death hands its burn — remaining dps
 * AND duration, full — to the nearest OTHER live body within WILDFIRE_RANGE,
 * once per death. Called from the death pass beside the blast gate.
 * The transfer is a BURN APPLICATION, never a weapon hit: it advances no
 * counter and fires no rider (R3), and a transferred burn kills through the
 * burn tick, so its own corpse is stamped burn-lethal like any other burn
 * kill. A transferred burn can therefore spread AGAIN when its carrier dies
 * with time still on it — the same refresh semantics slice 1 gave the burn
 * (stated in the report). Returns the receiving enemy, or null.
 */
export function wildfireTransfer(state, dead) {
  if (!hasRewrite(state, 'wildfire')) return null;
  if (!dead || !((dead.burn || 0) > 0) || !((dead.burnDps || 0) > 0)) return null;
  let best = null, bestD = Infinity;
  for (const o of state.enemies) {
    if (o === dead || o.hp <= 0) continue;
    const d = Math.hypot(o.x - dead.x, o.y - dead.y);
    if (d < bestD) { bestD = d; best = o; }
  }
  if (!best || bestD > WILDFIRE_RANGE) return null;
  best.burn = dead.burn;         // remaining duration, full
  best.burnDps = dead.burnDps;   // remaining dps, full
  return best;
}
/**
 * G21 slice 2 STORM REAPER: the 50%-strength CHAIN REACTION blast a live-wire
 * ZAP kill detonates, or null when the combo is not held (or the run has no
 * detonation source to price it from). Radius AND damage scale by
 * STORMREAPER_BLAST_MULT, and the strength reads boomBlast — the SAME numbers
 * and the SAME dry-pool fallback CHAIN REACTION uses, so the blast obeys every
 * slice-1 blast rule. The caller wraps it in the ground-blast guard (flyers
 * take nothing). No mana is spent for it: the corpse's own kill detonation
 * already pays the pool price through rewriteBoom at the death pass.
 */
export function stormReaperBlast(state) {
  if (!hasRewrite(state, 'stormreaper')) return null;
  const boom = rewriteBoom(state);      // null unless onkillboom is held
  if (!boom) return null;
  return { radius: boom.radius * STORMREAPER_BLAST_MULT,
    damage: boom.damage * STORMREAPER_BLAST_MULT };
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
