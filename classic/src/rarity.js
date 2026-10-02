// HORDES — rarity tiers (G10: RARE AND VERY RARE ENEMIES).
//
// WHY THIS FILE EXISTS
// The owner's ask: "we could have an enemy guide of enemies you've
// encountered. have rare and extremely rare enemies." This file owns the
// second half: the tier table, the roll, and the stamp. It is a NEW file so
// no other track can collide with it.
//
// THE MODEL
//   * Every trunk spawn (main.js spawnWave) rolls ONE extra Math.random draw:
//     MYTHIC band first, then RARE, else COMMON. One draw per spawn, rolled
//     only for types that participate — the COLOSSUS is already the mini-boss
//     tier and is NEVER tier-rolled (same exclusion the elite flag uses).
//   * A tier MULTIPLIES the enemy's own already-escalated stats (hp/xp) and
//     adds a drop bonus the death pass reads (potions AND item drops). It
//     COMPOSES with the elite flag rather than conflicting: an enemy can be
//     elite AND rare; each system stamps its own fields.
//   * NO new sprites (9 new art sets is not this wave): the tell reuses the
//     elite visual vocabulary — the same 1px outline ring the elite gold
//     uses, in the tier's own colour (see `tell` below).
//
// RATES — CONSTANTS, WITH THE MEASUREMENT BESIDE THEM
// These are MEASURED, not asserted: test/test_rarity.mjs rolls the REAL
// rollRarity 100,000 times and checks the measured rate against each constant
// within RATE_TOL_ABS. Tolerance reasoning: binomial sigma at N=100k is
// sqrt(p(1-p)/N) = 0.044% at p=0.02 and 0.017% at p=0.003; 3 sigma is ~0.13%
// worst case, so 0.15% absolute covers honest sampling noise and nothing else.
// Measured (mulberry32 seed 4242, N=100000, 2026-09-12):
//   RARE   constant 0.02    measured 0.02004 (2.0040e-2)
//   MYTHIC constant 0.003   measured 0.00321 (3.2100e-3)
//
// DESIGN INTENT (goals doc, standing constraints): players lose most runs
// early, feel weak at the start, and progress through knowledge + shop
// purchases. The multipliers are honest and SMALL on purpose:
//   mean hp factor  = 1 + 0.02 * (1.6 - 1) + 0.003 * (2.5 - 1) = 1.0165
//   mean xp factor  = 1 + 0.02 * (2.0 - 1) + 0.003 * (4.0 - 1) = 1.029
// i.e. the rarity layer adds ~1.7% mean enemy hp and ~2.9% mean xp — a
// flavour layer, not a difficulty wall. The sims price exactly these factors
// (tools/draft_sim.mjs folds them into spawnMix) and PART D's invariants are
// re-measured with the layer on.
//
// THE ELITE TIER IS NOT REBUILT HERE (brief C2): it already exists —
// C.SPAWNER.ELITE_CHANCE 0.05 after C.SPAWNER.ELITE_TIME 60s, ramping to
// C.LADDER.ELITE_MAX 0.12 by C.LADDER.ELITE_FROM 600s (formula:
// config.js ladderEliteChance). The bestiary's tier section documents it by
// READING those constants; this file only gives it a rank in the ordering so
// an encounter's bestTier can compare RARE vs ELITE vs MYTHIC.

// Encounter-tier ordering (brief A1): COMMON < RARE < ELITE < MYTHIC. ELITE
// outranks RARE because 5% after 60s is the common case and 2% from t=0 is
// the chase; MYTHIC outranks everything.
export const TIER_ORDER = ['COMMON', 'RARE', 'ELITE', 'MYTHIC'];
export const TIER_RANK = TIER_ORDER.reduce((m, id, i) => { m[id] = i; return m; }, {});

export const RATE_TOL_ABS = 0.0015;   // 0.15% absolute at N=100k (see header)

export const RARITY = {
  COMMON: {
    id: 'COMMON', name: 'Common', tier: TIER_RANK.COMMON,
    // chance: the rest of the roll (1 - RARE - MYTHIC). Not a field — the
    // roll treats "not in a band" as COMMON by construction.
  },
  RARE: {
    id: 'RARE', name: 'Rare',
    chance: 0.02,        // 2% of tier-rolled spawns — measured 0.02004 at N=100k
    tier: TIER_RANK.RARE,
    hpMult: 1.6,         // +60% hp (vs the elite's 4x): a chase, not a wall
    xpMult: 2.0,         // double xp — the reward for the chase
    dropBonus: 0.15,     // +15% absolute on the death-pass drop rolls
    tell: { outline: '#6fd8ff' },   // cool cyan ring, the elite ring's shape
  },
  MYTHIC: {
    id: 'MYTHIC', name: 'Extremely Rare',   // the owner's words
    chance: 0.003,       // 0.3% — measured 0.00321 at N=100k
    tier: TIER_RANK.MYTHIC,
    hpMult: 2.5,
    xpMult: 4.0,
    dropBonus: 0.35,
    // violet ring that PULSES at 2Hz (the VAMPIRIC tell's cadence), so a
    // mythic is distinguishable from a rare at a glance even in a horde.
    tell: { outline: '#c89aff', pulseHz: 2 },
  },
};

// The ELITE tier's catalog identity (its RATE lives in config.js — read it
// from there, never retype it; see bestiaryModel's tier info).
export const ELITE_TIER = { id: 'ELITE', name: 'Elite', tier: TIER_RANK.ELITE };

// ---- the roll ----------------------------------------------------------------

// ONE rng draw. Band order is pinned by test_rarity.mjs: MYTHIC first, then
// RARE, else COMMON. rng: injectable () => [0,1) (default Math.random).
export function rollRarity(rng = Math.random) {
  const r = rng();
  if (r < RARITY.MYTHIC.chance) return RARITY.MYTHIC.id;
  if (r < RARITY.MYTHIC.chance + RARITY.RARE.chance) return RARITY.RARE.id;
  return RARITY.COMMON.id;
}

// ---- the stamp ----------------------------------------------------------------

// Stamp a rolled tier onto a spawned enemy. Multiplies the enemy's OWN
// already-escalated hp (same convention escalate/applyEliteModifier use:
// maxHp mirrors hp), multiplies xp, and adds the drop bonus the death pass
// reads. COMMON is a no-op (nothing stamped, no field) so a plain spawn is
// byte-identical to pre-G10. Mutates and returns the enemy.
export function applyRarity(enemy, tierId) {
  const t = RARITY[tierId];
  if (!t || tierId === 'COMMON' || !enemy) return enemy;
  enemy.rarity = t.id;
  enemy.hp *= t.hpMult;
  enemy.maxHp = enemy.hp;
  enemy.xp *= t.xpMult;
  enemy.dropBonus = (enemy.dropBonus || 0) + t.dropBonus;
  return enemy;
}

// ---- tier comparison (the encounters namespace's bestTier ordering) -----------

// The tier a SPAWN counts as, for encounter bookkeeping: the rank-max of the
// rarity roll and the elite flag (an elite CHASER is tier ELITE; a rare
// CHASER is RARE; an elite AND mythic CHASER is MYTHIC).
export function effectiveTierId(rarityId, isElite) {
  let id = 'COMMON';
  if (rarityId && (TIER_RANK[rarityId] ?? -1) > TIER_RANK[id]) id = rarityId;
  if (isElite && TIER_RANK.ELITE > TIER_RANK[id]) id = 'ELITE';
  return id;
}

// Rank compare two tier ids (unknown ids rank below COMMON). Returns the
// higher id, or null when both are unknown.
export function tierMax(a, b) {
  const ra = TIER_RANK[a] ?? -1, rb = TIER_RANK[b] ?? -1;
  if (ra < 0 && rb < 0) return null;
  return rb > ra ? b : a;
}
