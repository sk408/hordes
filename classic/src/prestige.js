// HORDES — PRESTIGE system (owner-designed, player-facing).
//
// Owner spec (implement exactly this):
//   * Surviving to 30:00 offers PRESTIGE: the run resets at tier P+1 (P starts
//     at 0).
//   * Enemy strength x1.5^P (hp AND damage — WHERE each is applied is stated
//     at the call sites in main.js, summarised here):
//       - HP: main.js stampStageStats (the last stamp on every trunk / minion
//         / ring / chest-horde spawn — applied AFTER preStageMaxHp is recorded
//         so chests.js isEliteish stays prestige-invariant with no chest file
//         change) AND the four hp-overwrite sites that bypass the stamp:
//         spawnBoss, spawnMidBoss, stampHeavy, startFinale (maw pool).
//       - DAMAGE: the one shared dmgMult threat curve in main.js update()
//         (contact responds to it sub-linearly through the SURVIVAL pow — the
//         existing contract — while projectiles / novas / fans ride it
//         linearly), plus the flat TICK drain at its own site. The maw's
//         mercy-rule hits are EXCLUDED by contract (exact thirds of player HP).
//   * Gold income x2^P (all sources, same seam family): purseCredit (per-kill
//     tier gold), settleRunGold (AWARD incl. FIRST_CLEAR, plus winBonus), and
//     collectRunChest (milestone bank). The purse remainder is never
//     re-multiplied at settlement (it was already scaled at credit time).
//   * Speed unlocks per tier, player-facing: P1 -> 3x, P2 -> 5x, P3+ -> 7x.
//     Offered ladder is [1, 3, 5, 7]; every speed runs on fixed-substep
//     simulation (N fixed-dt steps per rendered frame, never scaled dt — the
//     dev branch's slice-8 dev_telemetry.js speed control demonstrates the
//     pattern; the player path here carries no dev gating).
//   * Prestige level persists in the player profile (profile.prestige) across
//     sessions. Stored as a plain integer field: save.js preserves unknown
//     top-level fields verbatim (the mawSlain precedent), so no schema bump
//     is needed and every version-pinned test keeps passing.
//   * Stated intent (do not "correct"): gold (2x) outpaces difficulty (1.5x)
//     per tier — deliberate power fantasy; difficulty comes from density and
//     chaos at speed.
//
// This module is PURE + node-safe (no DOM, no imports): every behaviour lives
// in main.js behind these helpers, so the numbers are matrix-testable without
// a frame loop. Integer pixel discipline / 60-120Hz correctness are inherited:
// all mults are per-event or per-spawn scalars (never per-frame accumulations),
// and the substep loop reuses the frame's own dt unchanged.

export const PRESTIGE = {
  ENEMY_BASE: 1.5,   // enemy hp AND damage scale as ENEMY_BASE^P
  GOLD_BASE: 2,      // gold income scales as GOLD_BASE^P
  // The offered speed ladder (multipliers of sim speed). 1x is always live;
  // 3x/5x/7x unlock at tiers 1/2/3 (SPEED_MIN_TIER). No 2x/4x/8x rung: the
  // owner spec names exactly 3x, 5x, 7x.
  SPEEDS: [1, 3, 5, 7],
  // Minimum prestige tier that unlocks each offered speed.
  SPEED_MIN_TIER: { 1: 0, 3: 1, 5: 2, 7: 3 },
  // Sanity bound on the stored tier (1.5^30 ~= 1.9e5 enemy, 2^30 ~= 1e9 gold
  // per unit — the purse clamp still bounds the wallet). Reaching it takes 30
  // survivals; it exists so a hand-edited profile cannot push pow() to
  // Infinity and NaN the combat math.
  MAX_TIER: 30,
};

// Normalise any stored/arbitrary tier to a safe integer. Fail closed to 0.
export function normalizePrestige(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(PRESTIGE.MAX_TIER, Math.floor(n)));
}

// Read the run's tier off a profile (missing/garbage -> 0, never throws).
export function getPrestige(profile) {
  return normalizePrestige(profile && profile.prestige);
}

// Write a tier onto a profile (mutates; clamps through normalizePrestige).
// Returns the applied tier. Persistence itself rides the existing save path
// (main.js persistProfile) — this function never touches storage.
export function setPrestige(profile, p) {
  const v = normalizePrestige(p);
  if (profile && typeof profile === 'object') profile.prestige = v;
  return v;
}

// Enemy strength multiplier at tier P: 1 / 1.5 / 2.25 / ... PURE.
export function prestigeEnemyMult(p) {
  return Math.pow(PRESTIGE.ENEMY_BASE, normalizePrestige(p));
}

// Gold income multiplier at tier P: 1 / 2 / 4 / ... PURE.
export function prestigeGoldMult(p) {
  return Math.pow(PRESTIGE.GOLD_BASE, normalizePrestige(p));
}

// The speeds a tier may run, slowest first. PURE.
export function prestigeAllowedSpeeds(p) {
  const t = normalizePrestige(p);
  return PRESTIGE.SPEEDS.filter((s) => t >= (PRESTIGE.SPEED_MIN_TIER[s] ?? Infinity));
}

// May tier P run speed s? PURE.
export function prestigeCanUseSpeed(p, s) {
  return prestigeAllowedSpeeds(p).includes(Math.floor(Number(s)));
}

// Normalise any stored/arbitrary speed against a tier. Fail closed to 1x
// (a locked or unknown speed never runs — the gate defaults to normal speed).
export function prestigeNormSpeed(p, s) {
  const v = Math.floor(Number(s));
  return prestigeCanUseSpeed(p, v) ? v : 1;
}

// Cycle to the next allowed speed for a tier, wrapping (the SPEED button /
// key path drives this). PURE.
export function prestigeNextSpeed(p, cur) {
  const allowed = prestigeAllowedSpeeds(p);
  const i = allowed.indexOf(prestigeNormSpeed(p, cur));
  return allowed[(i + 1) % allowed.length];
}

// The prestige offer fires on the 30:00 SURVIVAL only (runWon), never on
// death: runSurvived() is the single caller that composes the offer card, and
// die()/endRun() never do. This predicate is the matrix-testable half of that
// rule (the other half is "only runSurvived adds the card", asserted through
// the real loop in test_prestige.mjs).
export function prestigeOfferForRun(runWon) {
  return runWon === true;
}
