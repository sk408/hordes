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
export const REWRITES = {
  pierceall: {
    id: 'pierceall',
    name: 'Pierce All',
    desc: 'REWRITE - every projectile pierces; nothing stops at the first body',
  },
  onkillboom: {
    id: 'onkillboom',
    name: 'Chain Reaction',
    desc: 'REWRITE - every kill detonates; the blast damages nearby enemies',
  },
  healthdamage: {
    id: 'healthdamage',
    name: 'Blood Harvest',
    desc: 'REWRITE - picking up a health potion also damages nearby enemies',
  },
};
export const REWRITE_IDS = Object.keys(REWRITES);

// The weight ONE rewrite card carries in the draft pool (three cards -> family
// weight 0.15 at this constant — between the rules family's 0.20 and the
// perks' 0.12, by design). MEASURED CURVE (60 runs/cell, seed 4242, good/bad
// MEAN survival ratio at the shipped once-retune shape): 0.05 -> 1.69x,
// 0.03 -> 1.73x, 0.02 -> 1.77x, 0.01 -> 1.79x. Gently monotone — every family
// card a GREED run draws is one fewer stat stack, so lower weight reads as a
// marginally cleaner greed cohort — but the slope is ~0.1x of ratio across a
// 5x weight range and ALL cells clear the acceptance bar's substance (bad
// fails 100%, good beats bad >=3/5 minute-10 metrics at every weight), so the
// offer rate is a taste knob, not a balance one: 0.05 ships unchanged to keep
// the family visible in drafts. Invariants at 0.05 (families ON, luck 0): bad
// fails 100%, good beats bad 3/5 minute-10 metrics, one-bad-pick probes
// pierceall 1.23x / onkillboom 1.20x / healthdamage 1.06x — all >= the 0.8x
// bar.
export const REWRITE_CARD_WEIGHT = 0.05;

// ---- CHAIN REACTION numbers (the detonation on every kill) -----------------
// Radius covers a trash pack; damage is a flat + a fraction of the player's
// weapon damage so the blast stays relevant as the ladder's HP curve climbs
// (a pure flat number would be dust by minute 5).
export const BOOM_RADIUS = 40;
export const BOOM_DAMAGE_FLAT = 4;
export const BOOM_DAMAGE_FRAC = 0.5;   // + 50% of the player's weapon damage

// ---- BLOOD HARVEST numbers (the blast on every health pickup) --------------
// Potions are ~rare (POTIONS.DROP_CHANCE 0.03/kill), so the blast is allowed
// to hit harder than a Chain Reaction detonation: a full weapon hit's worth
// on top of a flat, in a slightly wider ring around the player (the pickup
// happens at the player's feet, not at the corpse).
export const HARVEST_RADIUS = 55;
export const HARVEST_DAMAGE_FLAT = 10;
export const HARVEST_DAMAGE_FRAC = 1.0;   // + 100% of the player's weapon damage

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
/** The draft cards for every rewrite the run does not already hold. */
export function rewriteCards(state) {
  const out = [];
  for (const id of REWRITE_IDS) {
    if (!rewriteCardOffered(id, state)) continue;
    const r = REWRITES[id];
    out.push({
      id: 'rewrite_' + id,
      rewrite: id,
      name: r.name,
      desc: r.desc,
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
/** CHAIN REACTION's detonation at the kill site, or null when not held. */
export function rewriteBoom(state) {
  if (!hasRewrite(state, 'onkillboom')) return null;
  const p = state.player;
  return {
    radius: BOOM_RADIUS,
    damage: BOOM_DAMAGE_FLAT + BOOM_DAMAGE_FRAC * (p.stats.damage || 0),
  };
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
