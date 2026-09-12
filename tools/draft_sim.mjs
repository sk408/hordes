// HORDES — DRAFT STAKES SIM v2 (SURVIVAL-GAP wave, 2026-09-12).
//
// Sk408 reframe (docs/PLAYTEST_FEEDBACK_2026-09-11.md #5): in an auto-playing
// game the DRAFT IS THE GAME. Acceptance bar, verbatim from the brief:
//   "a deliberately bad draft run must be able to fail, and a good draft must
//    visibly outperform it. If two opposite draft strategies produce the same
//    result at minute 10, the balance is broken."
//
// ⚠️ v1 measured the RETIRED run unit (5 waves, ~3.5-minute runs, an unbeatable
// finale as the ending, a "minute 10" bar that no run could reach). It was
// rebuilt, not retuned, on the LIVE structure: a bounded 30:00 ladder
// (CONFIG.RUN.LIMIT, CONFIG.LADDER: 15 waves x 120s, a knee at 4:00 below which
// the curves are bit-identical to the shipped ones), a mid-wave HERALD beat, a
// wave BOSS every 120s, the maw as a MILESTONE at wave 5, and RUN SURVIVED at
// the limit.
//
// Run: node tools/draft_sim.mjs [--runs N] [--seed S] [--validate]
//   --runs N     runs per draft archetype (default 60)
//   --seed S     rng seed (default 4242; deterministic given the seed)
//   --validate   also run the REAL loop (tools/real_loop.mjs) for the fresh
//                stage and print the model's margin against it
//
// WHAT IT SIMULATES: one FRESH-profile run (meta.js makeProfile: starter set
// VOLLEY + BOOMERANG, 3 weapon slots — no shop purchases, no artifacts; the
// draft is the ONLY lever, which is the point). Three draft policies fight the
// same escalation:
//   GREED-DAMAGE    always the highest marginal-DPS card (dmg/multi/pierce/rate)
//   SURVIVAL        always the highest marginal-defense card (hp > speed-kite)
//   ADVERSARIAL-BAD deliberately bad: the LOWEST-impact card of each offer,
//                   scored honestly from the cards' known magnitudes (a
//                   'multi' past the projectile cap, a tapered late speed
//                   pick, or +30% pickup radius all score near zero).
//
// ======================= WHY NOT HEADLESS main.js ==========================
// main.js is DOM-bound at every draft seam (openDraft writes ovCards via
// document.createElement; audio.playSfx on every level/pick; render.js owns the
// loop). balance_sim.mjs precedent applies: model the loop from the LIVE
// numbers, importing the real modules wherever they are pure —
//   config.js    CONFIG (the LADDER curves + RUN limit, SPAWNER, POTIONS, XP),
//                UPGRADES (the REAL card applies run verbatim), ladderBeats
//   entities.js  makePlayer, contactHitDamage (THE live contact-damage
//                function — the sim cannot price a hit differently from the
//                game), hpScale/xpScale
//   weapons.js   makeWeapon, levelUpWeapon, weaponLevelParams (live tables)
//   enemy_types.js ENEMY_TYPES / ELITE_TEMPLATE (live mults and pack sizes)
//   meta.js      computeRunGold (the live end-of-run gold integrator)
//
// ============================ MODEL ASSUMPTIONS ============================
// Every game number is imported; the knobs in SIM_TUNING are the model's
// assumptions and are listed here:
//   SPAWNING (expected value, no rng): the live formulas from main.js spawnWave
//     interval(t) = max(0.25, 1.35 - 0.008t); groups(t) = ladderGroups(t)
//     (== the shipped formula through 4:00, capped after); type mix = the live
//     SPAWNER weights/gates per minion-wave w = floor(t/30); pack size = the
//     live per-type packSize; elites = ladderEliteChance(t) folded into hp/xp.
//     Field soft-capped at FIELD_CAP.
//   PLAYER DPS (per weapon, live stats + live level tables) as v1 (unchanged —
//     the dps model was never the stale part).
//   BOSSES: hp = BASE_HP * ladderHp(w) * (HP_MULT_BASE + HP_MULT_PER_WAVE*wave)
//     (the wave's live formula), the HERALD at the wave midpoint
//     (ESCALATION.MIDBOSS), the timers pausing exactly as main.js pauses them
//     (the next wave starts when the boss dies), and the maw as a MILESTONE
//     window at END_WAVE that does NOT end the run.
//   DAMAGE TAKEN (the model assumption): hits/s = min(HITS_CAP, PRESSURE_K *
//     (N/OVERWHELM_N)^2 * closing), priced through entities.contactHitDamage
//     against the LIVE ladder damage curve and the player's LIVE max HP — so
//     the sim moves with CONFIG.SURVIVAL and can never price a hit the game
//     would not. The herald/boss add their own contact while alive.
//   XP / DRAFTS: live curve xpNext = 30 * XP_LEVEL_GROWTH^level; gem xp =
//     BASE_XP * ladderXp(w) * mix. Level-ups grow max HP by
//     CONFIG.SURVIVAL.HP_PER_LEVEL x the run's start pool (the live rule,
//     mirrored from main.js levelUp). Draft rolls mirror main.js openDraft
//     (weapon cards weight 1, the 7 stat cards weight 0.3, take 3).
// ==========================================================================

import { pathToFileURL } from 'node:url';
import { CONFIG as C, UPGRADES, ladderHp, ladderXp, ladderDmg, ladderGroups,
  ladderEliteChance, ladderBeats, runClock } from '../src/config.js';
import { makePlayer, contactHitDamage } from '../src/entities.js';
import {
  WEAPONS, WEAPON_MAX_LEVEL, makeWeapon, levelUpWeapon, weaponLevelParams,
} from '../src/weapons.js';
import { ENEMY_TYPES, ELITE_TEMPLATE } from '../src/enemy_types.js';
import { computeRunGold, STARTER_WEAPONS, draftCardWeight,
         draftRarityOf } from '../src/meta.js';
// G8 steps 3+4 (run-level measurement): the two new card families, read
// through the SAME seams the game reads — the constants from rules.js/perks.js
// and the applied-value helpers, so a measurement of the sim is a measurement
// of the game.
import { RULE_IDS, RULE_CARD_WEIGHT, statCardOffered, grantRule } from '../src/rules.js';
import {
  SKILL_PERK_IDS, SKILL_CARD_WEIGHT, grantSkill, hpRegenPerSec, damageTakenMult,
} from '../src/perks.js';
// G8 step 2 (rule-rewrite family): cards + the applied-value helpers the game
// reads, through the same seams as the other two families.
import {
  REWRITE_IDS, REWRITE_CARD_WEIGHT, grantRewrite, rewriteBoom, harvestBlast,
} from '../src/rewrites.js';
import { CHESTS } from '../src/chests.js';

const UPGRADES_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));
// DRAFT_TAPER mirrors main.js:1449 (speed/rate cards diminish per repeat).
// Sim-only copy: main.js is not importable (DOM). If main.js retunes the
// taper, update this array to match.
const DRAFT_TAPER = [1, 0.75, 0.55, 0.4, 0.3, 0.22, 0.15];

// ---------- sim tuning knobs (assumptions — see header) ----------------------
export const SIM_TUNING = {
  DT: 0.5,              // tick (s)
  FIELD_CAP: 140,       // soft cap on enemies alive (crowd saturation)
  CROWD_SAT: 12,        // N at which weapon cooldowns stop idling
  SPREAD_EFF: 0.7,      // effective value of each extra volley projectile
  PIERCE_VAL: 0.35,     // dps multiplier per pierce point vs a crowd
  AOE_B: 3.5,           // dense-crowd AoE/pierce-all bonus (documented above)
  BOSS_DPS_SHARE: 0.6,  // fraction of dps on the boss while it lives
  OVERWHELM_N: 170,     // alive enemies at full surround pressure
  PRESSURE_K: 1.2,      // pressure curve gain
  HITS_CAP: 1 / 0.6,    // invuln-capped contact hits per second (live 0.6s)
  CHEST_GOLD: 32,       // mean gold per opened chest (in-run currency)
  // G8 step 2 rewrite-model assumptions (documented, coarse on purpose):
  PIERCEALL_VAL: 2,     // PIERCE ALL's crowd value, in pierce POINTS (the live
                        // sentinel is 'unlimited'; against the crowd model the
                        // (1+PIERCE_VAL*p) curve saturates, so +2 points is the
                        // honest bounded reading of 'nothing stops at the first
                        // body' at field density)
  BOOM_FRESH: 1,        // CHAIN REACTION: expected FRESH bodies per detonation
                        // (radius 40 vs field spread; 1 is the conservative
                        // floor — the blast usually clips a pack)
  HARVEST_FRESH: 2,     // BLOOD HARVEST: expected bodies per blast (radius 55,
                        // centered on the player where the horde is densest)
};

// Live lever defaults (what the sim runs with no patch — the values to
// compare LEVER proposals against). Overrides arrive via the `patch` argument.
export const LIVE = {
  statWeight: 0.3,      // main.js:1418 (stat cards vs weapon weight 1)
  luckLevel: 0,         // G8 step 1: Fortune level feeding the stat weights
  maxProj: C.WEAPON.MAX_PROJECTILES,   // config.js WEAPON.MAX_PROJECTILES (3)
  xpGrowth: C.XP_LEVEL_GROWTH,         // config.js XP_LEVEL_GROWTH (1.28)
  hpCardPct: false,     // UPGRADES hp card: live = +25 flat
  // G8 steps 3+4: the run-rule + skill-perk card families ride the draft pool,
  // exactly like src/main.js openDraft (ruleCards + skillCards). Set to false
  // ONLY as the "before" cell of a before/after measurement.
  families: true,
};

const DT = SIM_TUNING.DT;
const LIMIT = C.RUN.LIMIT;
const WAVES = C.LADDER.WAVES;
const WAVE_SECONDS = C.LADDER.WAVE_SECONDS;
const BOSS_ORDER = ['GRAVELMAW', 'CHOIR_MOTHER', 'PYRAXIS'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------- rng (mulberry32 — deterministic, seedable) -----------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- enemy mix in expectation (live SPAWNER weights & type mults) -----
// Cached per minion-wave w = floor(t/30). Elites fold the LIVE ladder elite
// chance at play time t into hp/xp.
const MIX_CACHE = new Map();
function spawnMix(w, t) {
  const key = w + ':' + Math.round(ladderEliteChance(t) * 100);
  if (MIX_CACHE.has(key)) return MIX_CACHE.get(key);
  const S = C.SPAWNER;
  const entries = [['CHASER', S.CHASER_WEIGHT]];
  if (w >= S.SWARMER_WAVE) entries.push(['SWARMER', S.SWARMER_WEIGHT]);
  if (w >= S.BRUTE_WAVE) entries.push(['BRUTE', S.BRUTE_WEIGHT]);
  if (w >= S.DASHER_WAVE) entries.push(['DASHER', S.DASHER_WEIGHT]);
  if (w >= S.SPITTER_WAVE) entries.push(['SPITTER', S.SPITTER_WEIGHT]);
  if (w >= S.WARLOCK_WAVE) entries.push(['WARLOCK', S.WARLOCK_WEIGHT]);
  if (w >= S.TICK_WAVE) entries.push(['TICK', S.TICK_WEIGHT]);
  if (w >= S.COLOSSUS_WAVE) entries.push(['COLOSSUS', S.COLOSSUS_WEIGHT]);
  const tot = entries.reduce((s, e) => s + e[1], 0);
  const eliteFrac = ladderEliteChance(t);
  let pack = 0, hp = 0, xp = 0, contact = 0, speed = 0;
  for (const [id, weight] of entries) {
    const T = ENEMY_TYPES[id];
    const share = weight / tot;
    pack += share * (id === 'TICK' ? C.SPAWNER.TICK_PACK : (T.packSize || 1));
    hp += share * T.hpMult * (1 + eliteFrac * (ELITE_TEMPLATE.hpMult - 1));
    xp += share * T.xpMult * (1 + eliteFrac * (ELITE_TEMPLATE.xpMult - 1));
    contact += share * T.contactDamageMult;
    speed += share * T.speedMult;
  }
  const mix = { pack, hp, xp, contact, speed };
  MIX_CACHE.set(key, mix);
  return mix;
}

// ---------- weapon dps estimates (live stats + live level tables) -----------
function volleyDps(player, weapons, P) {
  const w = weapons.find(x => x.type === 'VOLLEY');
  if (!w) return 0;
  const lp = weaponLevelParams('VOLLEY', w.level);
  const n = Math.min(player.stats.projectiles + (lp.proj || 0), P.maxProj);
  const perShot = player.stats.damage * (lp.dmgMult || 1) * (1 + 0.2 * (lp.proj || 0));
  return (perShot / player.stats.cooldown) * (1 + SIM_TUNING.SPREAD_EFF * (n - 1));
}

function boomerangDps(player, weapons) {
  const w = weapons.find(x => x.type === 'BOOMERANG');
  if (!w) return 0;
  const lp = weaponLevelParams('BOOMERANG', w.level);
  const cycle = WEAPONS.BOOMERANG.COOLDOWN * (player.stats.cooldown / C.WEAPON.COOLDOWN);
  const perThrow = player.stats.damage * (lp.dmgMult || 1);
  const hitsPerThrow = 1.4 + 0.5 * (player.stats.pierce + (lp.pierceBonus || 0));
  return (perThrow / cycle) * hitsPerThrow;
}

function dpsBase(player, weapons, P) {
  return volleyDps(player, weapons, P) + boomerangDps(player, weapons);
}

// Effective dps vs the live field: crowd idles cooldowns, crowds multiply
// pierce/AoE value (see header).
function dpsEff(player, weapons, N, P, extraPierce = 0) {
  const crowd = clamp(N / SIM_TUNING.CROWD_SAT, 0, 1);
  const boom = weapons.find(x => x.type === 'BOOMERANG');
  const pierceTot = player.stats.pierce +
    (boom ? (weaponLevelParams('BOOMERANG', boom.level).pierceBonus || 0) : 0) + extraPierce;
  return dpsBase(player, weapons, P) * crowd *
    (1 + SIM_TUNING.PIERCE_VAL * pierceTot + SIM_TUNING.AOE_B * crowd);
}

// ---------- draft: roll 3 like openDraft, pick 1 by policy ------------------
function cardImpact(card, player, weapons, counts, P, held) {
  const base = dpsBase(player, weapons, P);
  // G8 step 2 retune: under ONE OF EACH a weapon pick grants +1 BONUS level
  // (main.js pick()), so a level-up prices cur -> cur+2 and a grant lands at
  // Lv2 — the payout has to be priced where the policy can see it.
  const bonus = held && held.rules && held.rules.once ? 1 : 0;
  if (card.kind === 'grant') {
    const shadow = { stats: { ...player.stats } };
    const add = boomerangDps(shadow, [{ type: 'BOOMERANG', level: 1 + bonus }]);
    return { dps: base > 0 ? add / base : 1, ehp: 0 };
  }
  if (card.kind === 'wlevel') {
    const cur = card.w.level;
    // At-cap pricing: under ONE OF EACH an at-cap weapon pick converts to
    // +10% player damage (applyCard does the conversion; main.js pick() does
    // the same). Player damage feeds EVERY weapon's dps, so the marginal
    // value is exactly +0.1 relative — priced exactly, not coarse.
    if (bonus && cur >= WEAPON_MAX_LEVEL) return { dps: 0.1, ehp: 0 };
    if (card.w.type === 'VOLLEY') {
      const a = weaponLevelParams('VOLLEY', cur), b = weaponLevelParams('VOLLEY', cur + 1 + bonus);
      const f = (b.dmgMult * (1 + 0.2 * (b.proj || 0))) / (a.dmgMult * (1 + 0.2 * (a.proj || 0)));
      return { dps: base > 0 ? (f - 1) * (volleyDps(player, weapons, P) / base) : 0, ehp: 0 };
    }
    const a = weaponLevelParams('BOOMERANG', cur), b = weaponLevelParams('BOOMERANG', cur + 1 + bonus);
    const f = (b.dmgMult * (1.4 + 0.5 * player.stats.pierce + 0.5 * (b.pierceBonus || 0))) /
      (a.dmgMult * (1.4 + 0.5 * player.stats.pierce + 0.5 * (a.pierceBonus || 0)));
    return { dps: base > 0 ? (f - 1) * (boomerangDps(player, weapons) / base) : 0, ehp: 0 };
  }
  const taper = id => {
    const n = (counts[id] || 0) + 1;
    return DRAFT_TAPER[Math.min(n - 1, DRAFT_TAPER.length - 1)];
  };
  // ---- G8 steps 3+4: the rule + skill families. Coarse HONEST numbers, each
  // with its reasoning in the comment — no invented precision. The mechanical
  // effects live in applyCard + the run loop (held state), read through the
  // same seams the game reads; the numbers below only tell the POLICIES what
  // a card is worth so the run-level measurement can actually pick them.
  if (card.kind === 'rule') {
    if (card.id === 'hordebait') {
      // PAYOUT, enumerated from CHESTS.WEIGHTS + rollContents: expected
      // upgrades/chest 1.05 -> 1.25 (+19%) and potions/chest 0.35 -> 0.75
      // (both modeled in the loop: the extra potions land in healBank). The
      // PRICE is a 6-enemy horde on EVERY chest (also modeled). The upgrade
      // surplus itself is NOT a stat the sim applies (chest contents are not
      // drafted), so the score below prices only the sustain side: a fraction
      // of a hp-card per chest, ~1 chest per 2 minutes.
      return { dps: 0.02, ehp: 0.03 };
    }
    // 'once' (One of Each): no direct stat, and the two structural effects
    // pull opposite ways — offers tilt toward the weight-1 weapon cards, but
    // the run LOSES stat stacking (the axis a greed build lives on). Priced
    // at exactly 0: the net is policy-dependent and unmeasurable in this
    // model, so the sim lets the mechanics (statCardOffered filtering) speak
    // and refuses to guess a number.
    return { dps: 0, ehp: 0 };
  }
  if (card.kind === 'skill') {
    if (card.id === 'regrowth') {
      // 0.7 flat hp/s (perks.REGROWTH_HP_PER_SEC, deliberately NOT a percent).
      // Priced at the mid-run band: this model's incoming contact pressure is
      // order ~10 hp/s around minute 5, so the heal cancels ~7% of it — the
      // same order as a mid-taper hp card. It decays late by design.
      return { dps: 0, ehp: 0.07 };
    }
    if (card.id === 'thick') {
      // EXACT, not coarse: a permanent damageTakenMult of 0.88 is effective HP
      // x(1/0.88) = +13.6%, forever, on every modeled damage path.
      return { dps: 0, ehp: 1 / 0.88 - 1 };
    }
    // 'focus': the sim has NO Q/W ability layer (no mana, no cooldowns), so
    // this model CANNOT see the perk's real value (-20% mana / -15% cd in the
    // live game). Priced at exactly 0 rather than invented — which means the
    // run-level numbers below measure focus as a dead card, and the honesty
    // cost is reported in the tick note, not hidden here.
    return { dps: 0, ehp: 0 };
  }
  if (card.kind === 'rewrite') {
    if (card.id === 'pierceall') {
      // PRICED OFF THE MODEL ITSELF (not invented): the run loop gives PIERCE
      // ALL +PIERCEALL_VAL effective pierce in dpsEff, so the marginal value
      // of the card is exactly that curve's next step, same shape as the
      // 'pierce' stat card one branch down.
      const pv = SIM_TUNING.PIERCE_VAL, cur = player.stats.pierce || 0;
      return { dps: pv * SIM_TUNING.PIERCEALL_VAL / (1 + pv * cur), ehp: 0 };
    }
    if (card.id === 'onkillboom') {
      // Coarse, from the live numbers: each detonation is 4 + 0.5 x weapon
      // damage (half a hit), and at field density the model credits
      // BOOM_FRESH fresh bodies per kill -> roughly +0.5x dps while the field
      // holds, tapering as trash dies instantly anyway. 0.2 is the honest
      // mid-band, not a derivation.
      return { dps: 0.2, ehp: 0 };
    }
    // 'healthdamage': potions land on ~3% of kills and the blast is 10 + 1.0 x
    // weapon damage — rare but wide. Coarse 0.04 with the reasoning stated;
    // the run loop applies the modeled blast when held.
    return { dps: 0.04, ehp: 0 };
  }
  switch (card.id) {
    case 'dmg': return { dps: 0.25, ehp: 0 };
    case 'rate': {
      const r = 0.15 * taper('rate');
      return { dps: r / Math.max(0.05, 1 - r), ehp: 0 };
    }
    case 'speed': return { dps: 0, ehp: 0.8 * 0.15 * taper('speed') }; // kite value
    case 'pickup': return { dps: 0.05, ehp: 0.01 };
    case 'multi': {
      const n = Math.min(player.stats.projectiles, P.maxProj);
      return n < P.maxProj
        ? { dps: SIM_TUNING.SPREAD_EFF / (1 + SIM_TUNING.SPREAD_EFF * (n - 1)), ehp: 0 }
        : { dps: 0.01, ehp: 0 };   // DEAD past the live projectile cap — honest
    }
    case 'hp': return P.hpCardPct ? { dps: 0, ehp: 0.25 } : { dps: 0, ehp: 25 / player.stats.maxHp };
    case 'pierce': return { dps: SIM_TUNING.PIERCE_VAL / (1 + SIM_TUNING.PIERCE_VAL * player.stats.pierce), ehp: 0 };
    default: return { dps: 0, ehp: 0 };
  }
}

export const POLICIES = {
  GREED_DAMAGE: { label: 'GREED-DAMAGE', pick: m => m.dps + 0.1 * m.ehp, argmax: true },
  SURVIVAL: { label: 'SURVIVAL', pick: m => 2 * m.ehp + 0.5 * m.dps, argmax: true },
  ADVERSARIAL_BAD: { label: 'ADVERSARIAL-BAD', pick: m => m.dps + m.ehp, argmax: false },
};

// `held` mirrors the run player's card state so the pool shrinks exactly like
// openDraft's does: { rules: {id:true}, skills: {id:true}, takenStats: {id:1} }.
// Default = a fresh run (nothing held), which is what measureDraftOffers uses.
export function buildDraftPool(weapons, patch, held = {}) {
  const cards = [];
  const slotCap = 3;   // startWeaponSlots(makeProfile()) — fresh profile
  const nonVolley = weapons.filter(w => w.type !== 'VOLLEY').length;
  if (slotCap - 1 - nonVolley > 0) {
    for (const id of STARTER_WEAPONS) {
      if (id === 'VOLLEY' || weapons.some(w => w.type === id)) continue;
      cards.push({ kind: 'grant', weapon: id, weight: 1 });
    }
  }
  const onceHeld = !!(held.rules && held.rules.once);
  for (const w of weapons) {
    // G8 step 2 retune (extended ladder): under once the weapon ladder never
    // ends — at-cap picks stay offered and convert to +10% player damage
    // (applyCard; main.js openDraft/pick() do the same).
    if ((w.level || 1) < WEAPON_MAX_LEVEL || onceHeld) cards.push({ kind: 'wlevel', w, weight: 1 });
  }
  // G8 step 1: stat weights ride the SHARED meta.js seam, so this pool is the
  // same number openDraft() computes. statWeight stays the family lever (L1);
  // luckLevel multiplies ON TOP of it, and at luck 0 the product is exactly
  // statWeight (bit-identical to the shipped sim).
  // G8 step 3: ONE OF EACH drops a taken stat from the pool (statCardOffered
  // reads the same held-state shape the game's player carries).
  const heldState = { player: {
    rules: held.rules || {}, takenStats: held.takenStats || {}, skills: held.skills || {},
    rewrites: held.rewrites || {},
  } };
  const luckLv = Number.isFinite(patch.luckLevel) ? patch.luckLevel : LIVE.luckLevel;
  const statW  = Number.isFinite(patch.statWeight) ? patch.statWeight : LIVE.statWeight;
  const families = patch.families === undefined ? LIVE.families : patch.families;
  for (const u of UPGRADES) {
    if (!statCardOffered(u.id, heldState)) continue;
    cards.push({ kind: 'stat', id: u.id,
      weight: draftCardWeight(u.id, 'stat', luckLv) * (statW / 0.3) });
  }
  // G8 steps 3+4: the rule + skill families, at the SAME weights openDraft
  // gives them (constants imported, never restated), one card per entry the
  // run does not already hold.
  if (families) {
    for (const id of RULE_IDS) {
      if (held.rules && held.rules[id]) continue;
      cards.push({ kind: 'rule', id, weight: RULE_CARD_WEIGHT });
    }
    for (const id of SKILL_PERK_IDS) {
      if (held.skills && held.skills[id]) continue;
      cards.push({ kind: 'skill', id, weight: SKILL_CARD_WEIGHT });
    }
    // G8 step 2: the rewrite family, same contract.
    for (const id of REWRITE_IDS) {
      if (held.rewrites && held.rewrites[id]) continue;
      cards.push({ kind: 'rewrite', id, weight: REWRITE_CARD_WEIGHT });
    }
  }
  return cards;
}

function rollThree(pool, rng) {
  const p = [...pool], out = [];
  while (out.length < 3 && p.length > 0) {
    let r = rng() * p.reduce((s, c) => s + c.weight, 0);
    let idx = p.length - 1;
    for (let i = 0; i < p.length; i++) { if ((r -= p[i].weight) < 0) { idx = i; break; } }
    out.push(p.splice(idx, 1)[0]);
  }
  return out;
}

function applyCard(card, player, weapons, counts, patch, held, heldState) {
  // G8 step 2 retune: under ONE OF EACH the weapon tilt actually pays — a
  // level-up grants +1 BONUS level, a grant lands at Lv2, and an at-cap
  // level-up converts to +10% player damage (main.js pick() does the same;
  // levelUpWeapon caps at WEAPON_MAX_LEVEL, never an overflow).
  const once = !!(held && held.rules && held.rules.once);
  if (card.kind === 'grant') {
    const w = makeWeapon(card.weapon);
    if (once) levelUpWeapon(w);
    weapons.push(w);
    return;
  }
  if (card.kind === 'wlevel') {
    if (once && (card.w.level || 1) >= WEAPON_MAX_LEVEL) { player.stats.damage *= 1.10; return; }
    levelUpWeapon(card.w);
    if (once) levelUpWeapon(card.w);
    return;
  }
  if (card.kind === 'rule') { grantRule(heldState, card.id); return; }
  if (card.kind === 'skill') { grantSkill(heldState, card.id); return; }
  if (card.kind === 'rewrite') { grantRewrite(heldState, card.id); return; }
  // The `once` ledger is written for EVERY stat pick (main.js pick() does the
  // same); the rule only gates OFFERING, and it is retroactive by design.
  if (card.kind === 'stat') held.takenStats[card.id] = 1;
  if (card.id === 'speed' || card.id === 'rate') {
    counts[card.id] = (counts[card.id] || 0) + 1;
    const t = DRAFT_TAPER[Math.min(counts[card.id] - 1, DRAFT_TAPER.length - 1)];
    if (card.id === 'speed') player.stats.speed *= 1 + 0.15 * t;
    else player.stats.cooldown *= 1 - 0.15 * t;
  } else if (card.id === 'hp' && patch.hpCardPct) {
    const add = Math.round(player.stats.maxHp * 0.25);
    player.stats.maxHp += add;
    player.hp = Math.min(player.hp + add, player.stats.maxHp);
  } else {
    UPGRADES_BY_ID[card.id].apply(player);   // REAL card apply (live numbers)
  }
}

// ---------- G8 step 1 measurement: what luck does to the OFFER ----------
// Rolls `draws` real 3-card offers off the FRESH-run pool (the same
// buildDraftPool openDraft mirrors) and returns per-offer rates by tier.
// PURE and seeded, so a regression in the weighting is a number, not an opinion.
export function measureDraftOffers(luck = 0, seed = 4242, draws = 20000) {
  const patch = { statWeight: LIVE.statWeight, luckLevel: luck };
  const weapons = STARTER_WEAPONS.map(id => makeWeapon(id));
  const rng = mulberry32(seed);
  const c = { grants: 0, COMMON: 0, UNCOMMON: 0, RARE: 0, cards: 0 };
  for (let i = 0; i < draws; i++) {
    for (const card of rollThree(buildDraftPool(weapons, patch), rng)) {
      c.cards++;
      if (card.kind === 'stat') c[draftRarityOf(card.id)]++;
      else c.grants++;
    }
  }
  const rate = k => c[k] / draws;                    // per OFFER (3 cards)
  return { luck: luck, draws, cards: c.cards,
    perOffer: { grants: rate('grants'), COMMON: rate('COMMON'),
                UNCOMMON: rate('UNCOMMON'), RARE: rate('RARE') },
    statPerOffer: (c.COMMON + c.UNCOMMON + c.RARE) / draws,
    counts: c };
}

// ---------- one run -----------------------------------------------------------
// Returns checkpoints at minutes 2/5/10 (metrics freeze at death if earlier),
// the final state (run length, death wave + killer, income), and draft
// telemetry for the lever analysis.
export function simulateRun(seed, policyName = 'GREED_DAMAGE', patch = {}) {
  const P = { ...LIVE, ...patch };
  const policy = POLICIES[policyName];
  if (!policy) throw new Error(`draft_sim: unknown policy ${policyName}`);
  const rng = mulberry32(seed);
  const player = makePlayer();
  // G8 steps 3+4: the run's held cards, driven through the REAL helpers
  // (grantRule / grantSkill / statCardOffered all read this same state), so
  // the sim's pool and effects cannot drift from the game's. `startCards`
  // injects cards as if taken at t=0 — the "one bad pick never loses a run"
  // probe holds a card the policy would not have chosen.
  const held = { rules: player.rules, skills: player.skills, takenStats: player.takenStats,
    rewrites: player.rewrites };
  const heldState = { player };
  for (const id of (P.startCards || [])) {
    if (!grantRule(heldState, id) && !grantSkill(heldState, id)) grantRewrite(heldState, id);
  }
  const weapons = [makeWeapon('VOLLEY')];
  const startMaxHp = player.stats.maxHp;    // the pool HP_PER_LEVEL is linear in
  const counts = {};
  const picks = {};
  let deadMulti = 0;
  let xp = player.xp, level = 1, xpNext = player.xpNext;
  let N = 0, kills = 0, dmgTaken = 0, healBank = 0;
  let t = 0;
  // The ladder: wave n is armed at waveEnd; the timer PAUSES while the boss
  // lives (the next wave starts when the boss dies), exactly as main.js does.
  let waveNum = 1, waveEnd = WAVE_SECONDS, waveStart = 0;
  let bossHp = 0, bossCount = 0, bossId = null;
  let heraldHp = 0, heraldDone = false;
  let waves = 0, mawUsed = false, mawHp = 0, mawUntil = 0;
  let dead = false, killer = null, reachedLimit = false;
  const checkpoints = {};
  const draftTimes = [];
  const deathWaves = new Map();

  const snap = (mark) => {
    checkpoints[mark] = {
      at: Math.min(Math.round(t), mark),
      dead,
      survivalTime: Math.round(t),
      kills: Math.round(kills),
      damageTaken: Math.round(dmgTaken),
      wavesCleared: waves,
      level,
      gold: computeRunGold({
        kills: Math.round(kills), level, time: Math.round(t), goldMult: 1,
      }),
    };
  };

  const killLabel = (kind) => {
    if (kind === 'herald') return 'HERALD';
    if (kind === 'boss') return 'ENDBOSS:' + (bossId || '?');
    if (kind === 'maw') return 'MAW';
    return 'contact:' + kind;
  };

  while (t < LIMIT && !dead) {
    const w = Math.floor(t / 30);
    const mix = spawnMix(w, t);

    // Spawning (expected value, live formulas + the LIVE ladder density).
    const interval = Math.max(0.25, C.ENEMY.SPAWN_INTERVAL - t * 0.008);
    const groups = ladderGroups(t);
    N = Math.min(SIM_TUNING.FIELD_CAP, N + (groups / interval) * mix.pack * DT);

    // HERALD beat: mid-wave, once per wave (ladderBeats cadence past END_WAVE).
    if (!heraldDone && ladderBeats(waveNum).herald && t >= waveStart + WAVE_SECONDS * C.ESCALATION.MIDBOSS.AT_FRACTION) {
      heraldDone = true;
      const M = C.ESCALATION.MIDBOSS;
      const mhp = C.ENEMY.BASE_HP * ladderHp(w) * (M.HP_MULT_BASE + M.HP_MULT_PER_WAVE * waveNum);
      heraldHp = mhp;
    }

    // Wave BOSS: spawns at the wave end; the timer has been paused since.
    if (bossHp <= 0 && heraldHp <= 0 && t >= waveEnd) {
      bossCount = waveNum % C.ESCALATION.BOSS.DOUBLE_EVERY === 0 ? 2 : 1;
      bossId = BOSS_ORDER[(waveNum - 1) % BOSS_ORDER.length];
      bossHp = C.ENEMY.BASE_HP * ladderHp(w) *
        (C.ESCALATION.BOSS.HP_MULT_BASE + C.ESCALATION.BOSS.HP_MULT_PER_WAVE * waveNum) * bossCount;
    }
    // The maw MILESTONE at END_WAVE: a window the player can survive (the run
    // continues) or clear; it never ends the run either way.
    if (!mawUsed && waveNum > C.ESCALATION.END_WAVE && waves >= C.ESCALATION.END_WAVE) {
      mawUsed = true;
      mawHp = C.RUN.MAW_HP;
      mawUntil = t + C.RUN.MAW_WINDOW;
    }
    if (mawHp > 0 && t >= mawUntil) mawHp = 0;   // the maw withdraws

    // Damage out. G8 step 2 PIERCE ALL: +PIERCEALL_VAL effective pierce in the
    // crowd curve (see SIM_TUNING for the honest-bounded reading).
    const dps = dpsEff(player, weapons, N, P,
      held.rewrites.pierceall ? SIM_TUNING.PIERCEALL_VAL : 0);
    let dmg = dps * DT;
    if (mawHp > 0) {
      const toMaw = dmg * SIM_TUNING.BOSS_DPS_SHARE;
      mawHp -= toMaw; dmg -= toMaw;
    } else if (bossHp > 0) {
      const toBoss = dmg * SIM_TUNING.BOSS_DPS_SHARE;
      bossHp -= toBoss; dmg -= toBoss;
      if (bossHp <= 0) {
        waves++;
        xp += C.ENEMY.BASE_XP * ladderXp(w) * C.ESCALATION.BOSS.XP_KILLS * bossCount;
        // HORDE BAIT, run-level: the wave's chest answers with a horde (the
        // price — GAMBLE_HORDE_COUNT escalated CHASERs in the live game) and
        // rolls one band better (the payout — enumerated: potions/chest 0.35
        // -> 0.75 under the bump, upgrades/chest 1.05 -> 1.25 which this sim
        // cannot apply because chest contents are not drafted). Only the
        // DELTA over the unmodeled baseline is credited, so a no-bait run's
        // numbers stay bit-identical.
        if (held.rules.hordebait) {
          N = Math.min(SIM_TUNING.FIELD_CAP, N + CHESTS.GAMBLE_HORDE_COUNT);
          healBank += 0.4;
        }
        bossHp = 0; bossCount = 0;
        waveStart = t; waveEnd = t + WAVE_SECONDS;   // the timer resumes
        heraldDone = false;
      }
    } else if (heraldHp > 0) {
      const toHerald = dmg * SIM_TUNING.BOSS_DPS_SHARE;
      heraldHp -= toHerald; dmg -= toHerald;
      if (heraldHp <= 0) {
        heraldHp = 0;
        xp += C.ENEMY.BASE_XP * ladderXp(w) * C.ESCALATION.MIDBOSS.XP_KILLS;
      }
    }
    const avgHp = C.ENEMY.BASE_HP * ladderHp(w) * mix.hp;
    let killN = Math.min(N, Math.max(0, dmg) / Math.max(1e-9, avgHp));
    // G8 step 2 CHAIN REACTION, run-level: every kill detonates
    // (4 + 0.5 x weapon damage — the live rewriteBoom numbers), credited at
    // BOOM_FRESH fresh bodies per detonation. Single step, no chain recursion:
    // a boom's victims detonate next tick, which is the conservative bound of
    // the live frame-by-frame propagation.
    if (held.rewrites.onkillboom && killN > 0) {
      const boom = rewriteBoom(heldState);
      killN = Math.min(N, killN + killN * SIM_TUNING.BOOM_FRESH * boom.damage / avgHp);
    }
    // G8 step 2 BLOOD HARVEST, run-level: ~DROP_CHANCE potions per kill reach
    // the inventory (the healBank seam); each pickup blasts
    // 10 + 1.0 x weapon damage at HARVEST_FRESH fresh bodies (the live
    // harvestBlast numbers, centered on the player where the horde is densest).
    let harvestKills = 0;
    if (held.rewrites.healthdamage && killN > 0) {
      const blast = harvestBlast(heldState);
      harvestKills = Math.min(Math.max(0, N - killN),
        killN * C.POTIONS.DROP_CHANCE * SIM_TUNING.HARVEST_FRESH * blast.damage / avgHp);
      killN += harvestKills;
    }
    kills += killN; N -= killN;

    // XP -> drafts.
    xp += killN * C.ENEMY.BASE_XP * ladderXp(w) * mix.xp;
    while (xp >= xpNext) {
      xp -= xpNext; level++;
      xpNext = Math.floor(xpNext * P.xpGrowth);
      // The live HP_PER_LEVEL rule (linear in the run's start pool).
      const gain = startMaxHp * C.SURVIVAL.HP_PER_LEVEL;
      player.stats.maxHp += gain;
      player.hp = Math.min(player.stats.maxHp, player.hp + gain);
      const offers = rollThree(buildDraftPool(weapons, P, held), rng);
      if (offers.length === 0) continue;
      const scored = offers.map(c => ({ c, m: cardImpact(c, player, weapons, counts, P, held) }));
      let best = scored[0];
      for (const s of scored) {
        const a = policy.pick(s.m), b = policy.pick(best.m);
        if (policy.argmax ? a > b : a < b) best = s;
      }
      applyCard(best.c, player, weapons, counts, P, held, heldState);
      const id = best.c.kind === 'stat' ? best.c.id
        : best.c.kind === 'grant' ? 'grant_' + best.c.weapon
        : best.c.kind === 'rule' ? 'rule_' + best.c.id
        : best.c.kind === 'skill' ? 'skill_' + best.c.id
        : best.c.kind === 'rewrite' ? 'rewrite_' + best.c.id
        : 'wlevel_' + best.c.w.type;
      picks[id] = (picks[id] || 0) + 1;
      draftTimes.push(t);
      if (id === 'multi' && player.stats.projectiles > P.maxProj) deadMulti++;
    }

    // G8 step 4, run-level: REGROWTH heals through the same helper the game's
    // resource seams call (flat rate, dt-scaled), before damage in.
    const regen = hpRegenPerSec(heldState) * DT;
    if (regen > 0) player.hp = Math.min(player.stats.maxHp, player.hp + regen);

    // Damage in: the crowd's pressure curve, priced by the LIVE contact-damage
    // function against the player's LIVE pool. Boss/herald add contact.
    // THICK SKIN rides the same funnel the game routes player HP through.
    const avgSpd = C.ENEMY.BASE_SPEED * (1 + 0.05 * w) * mix.speed;
    const closing = clamp(avgSpd / player.stats.speed, 0.12, 1.6);
    const surround = clamp(N / SIM_TUNING.OVERWHELM_N, 0, 1);
    let hits = Math.min(SIM_TUNING.HITS_CAP,
      SIM_TUNING.PRESSURE_K * surround * surround * closing);
    let threaten = 'MIX';
    if (mawHp > 0) { hits = Math.min(SIM_TUNING.HITS_CAP, hits + 0.4); threaten = 'maw'; }
    else if (bossHp > 0 || heraldHp > 0) { hits = Math.min(SIM_TUNING.HITS_CAP, hits + 0.3); threaten = bossHp > 0 ? 'boss' : 'herald'; }
    const dm = ladderDmg(w);
    // One ambient hit, priced at the LIVE function with this wave's mix.
    const ambient = contactHitDamage(C.SURVIVAL.BASE_CONTACT, dm, mix.contact, 1, player.stats.maxHp);
    // A boss/herald contact is the charger-weighted one (GRAVELMAW's charge
    // window is the wave's contact peak; others are plain).
    const heavyType = bossId === 'GRAVELMAW' ? 2.2 : 1.0;
    const heavy = (bossHp > 0 || heraldHp > 0)
      ? contactHitDamage(C.SURVIVAL.BASE_CONTACT, dm, heavyType, bossId === 'GRAVELMAW' ? 1.5 : 1,
        player.stats.maxHp)
      : 0;
    const hurt = (hits * ambient + (heavy > 0 ? 0.25 * heavy : 0)) * DT * damageTakenMult(heldState);
    if (hurt > 0) {
      if (player.hp < 0.5 * player.stats.maxHp && healBank >= 1) {
        player.hp = Math.min(player.stats.maxHp, player.hp + C.POTIONS.HP_HEAL);
        healBank--;
      }
      player.hp -= hurt; dmgTaken += hurt;
      if (player.hp <= 0) {
        dead = true;
        // The killer is whichever threat the wave's beat points at.
        killer = killLabel(threaten === 'boss' ? 'boss'
          : threaten === 'herald' ? 'herald'
          : threaten === 'maw' ? 'maw'
          : culprit(w));
        deathWaves.set(waveNum, (deathWaves.get(waveNum) || 0) + 1);
        break;
      }
    }
    healBank += killN * C.POTIONS.DROP_CHANCE;

    for (const mark of [120, 300, 600]) if (t >= mark && !checkpoints[mark]) snap(mark);
    t += DT;
  }
  if (!dead && t >= LIMIT) reachedLimit = true;
  for (const mark of [120, 300, 600]) if (!checkpoints[mark]) snap(mark);

  const chests = waves + (mawUsed ? 1 : 0);
  return {
    policy: policyName,
    dead, reachedLimit,
    survivalTime: reachedLimit ? LIMIT : Math.round(t),
    wave: waveNum, wavesCleared: waves,
    killer: reachedLimit ? null : killer,
    incomeProfile: computeRunGold({
      kills: Math.round(kills), level, time: reachedLimit ? LIMIT : Math.round(t), goldMult: 1,
    }),
    incomeChest: chests * SIM_TUNING.CHEST_GOLD,
    kills: Math.round(kills),
    checkpoints,
    picks,
    deadMulti,
    draftsByMinute: {
      120: draftTimes.filter(x => x <= 120).length,
      300: draftTimes.filter(x => x <= 300).length,
      600: draftTimes.filter(x => x <= 600).length,
    },
  };
}

function culprit(w) {
  if (w >= C.SPAWNER.BRUTE_WAVE) return 'BRUTE';
  if (w >= C.SPAWNER.TICK_WAVE) return 'TICK';
  return 'CHASER';
}

// ---------- cohort + verdict --------------------------------------------------
export function simulateCohort(seed, runs, policyName, patch = {}) {
  const out = [];
  for (let i = 0; i < runs; i++) out.push(simulateRun(seed + i * 7919, policyName, patch));
  return out;
}

function cohortSummary(cohort, mark) {
  const cp = cohort.map(r => r.checkpoints[mark]);
  return {
    survival: median(cohort.map(r => r.survivalTime)),
    meanSurvival: cohort.reduce((s, r) => s + r.survivalTime, 0) / cohort.length,
    kills: median(cp.map(c => c.kills)),
    damageTaken: median(cp.map(c => c.damageTaken)),
    waves: median(cp.map(c => c.wavesCleared)),
    gold: median(cp.map(c => c.gold)),
    limitRuns: cohort.filter(r => r.reachedLimit).length,
    failRate: () => cohort.filter(r => r.dead).length / cohort.length,
  };
}

// The acceptance bar from the brief (see header): bad can fail + dies
// meaningfully earlier; good beats bad on >=3 of 5 minute-10 metrics.
export function divergenceVerdict(good, bad) {
  const g = cohortSummary(good, 600), b = cohortSummary(bad, 600);
  const wins = [
    ['survivalTime', g.survival > b.survival],
    ['kills', g.kills > b.kills],
    ['wavesCleared', g.waves > b.waves],
    ['gold', g.gold > b.gold],
    ['damageTaken (lower better)', g.damageTaken < b.damageTaken],
  ];
  const winCount = wins.filter(w => w[1]).length;
  return {
    pass: b.failRate() >= 0.5 && b.survival <= 0.8 * g.survival && winCount >= 3,
    badCanFail: b.failRate() >= 0.5,
    badEarlier: b.survival <= 0.8 * g.survival,
    goodBad: b.survival > 0 ? g.survival / b.survival : Infinity,
    metricWins: wins, winCount,
    good: g, bad: b,
  };
}

// ---------- lever analysis ----------------------------------------------------
// PROPOSALS ONLY — no src/ edits. Each lever re-runs the sim with the live
// value patched to the proposal and reports the divergence delta, so the
// tuning decision gets numbers, not vibes.
export const LEVERS = [
  {
    id: 'L1', name: 'stat-card draft weight',
    file: 'src/main.js openDraft pool',
    current: 'stat cards weight 0.3 vs weapon cards 1.0',
    proposed: 'statWeight 0.3 -> 0.5',
    patch: { statWeight: 0.5 },
    why: 'the draft decision layer (stat cards) is a minority of offers; weapon level-up cards are near-auto-picks, so most drafts carry no real decision',
  },
  {
    id: 'L2', name: 'hp card: flat -> percent',
    file: 'src/config.js UPGRADES.hp (Iron Heart)',
    current: '+25 flat max HP + heal 25',
    proposed: '+25% max HP (+ same fraction healed)',
    patch: { hpCardPct: true },
    why: 'flat +25 decays against the ladder contact curve — the SURVIVAL archetype\'s core card stops mattering exactly when long runs are decided',
  },
  {
    id: 'L3', name: 'projectile cap / dead multi card',
    file: 'src/config.js WEAPON.MAX_PROJECTILES; src/main.js volley',
    current: 'cap 3; a 3rd Split Shot card does NOTHING (dead card in the draft)',
    proposed: 'cap 3 -> 4 (or convert overflow picks to +20% damage)',
    patch: { maxProj: 4 },
    why: 'a draft card that can be picked while doing nothing is the purest form of a fake choice — it also poisons the ADVERSARIAL-BAD score',
  },
  {
    id: 'L4', name: 'xp curve / draft frequency',
    file: 'src/config.js XP_LEVEL_GROWTH',
    current: 'xpNext x' + C.XP_LEVEL_GROWTH + ' per level',
    proposed: 'x1.28 -> x1.22 (more drafts across a 30:00 run)',
    patch: { xpGrowth: 1.22 },
    why: 'the number of drafts (decisions) per run collapses as the run stretches — the game takes the steering wheel away late',
  },
];

function leverDelta(seed, runs, patch) {
  const good = simulateCohort(seed, runs, 'GREED_DAMAGE', patch);
  const bad = simulateCohort(seed, runs, 'ADVERSARIAL_BAD', patch);
  const surv = simulateCohort(seed, runs, 'SURVIVAL', patch);
  return {
    ...divergenceVerdict(good, bad),
    survMed: cohortSummary(surv, 600).meanSurvival,
  };
}

// ---------- main ---------------------------------------------------------------
function fmtDeaths(cohort) {
  const m = new Map();
  for (const r of cohort) {
    if (r.reachedLimit) continue;
    const k = `w${r.wave} ${r.killer}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ');
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--')
      ? Number(args[i + 1]) : dflt;
  };
  const runs = Math.max(3, Math.floor(flag('--runs', 60)));
  const seed = Math.max(1, Math.floor(flag('--seed', 4242)));
  const leverRuns = Math.min(runs, 30);

  console.log(`HORDES DRAFT STAKES SIM v2 — ${runs} runs/archetype, seed ${seed}`);
  console.log(`fresh profile (starter VOLLEY+BOOMERANG, 3 slots); ladder ${WAVES} x ${WAVE_SECONDS}s ` +
    `= ${runClock(LIMIT)}; draft is the only lever`);
  console.log('');

  const cohorts = {
    GREED_DAMAGE: simulateCohort(seed, runs, 'GREED_DAMAGE'),
    SURVIVAL: simulateCohort(seed, runs, 'SURVIVAL'),
    ADVERSARIAL_BAD: simulateCohort(seed, runs, 'ADVERSARIAL_BAD'),
  };

  // Divergence table (medians) at minute 2 / 5 / 10.
  for (const mark of [120, 300, 600]) {
    console.log(`--- minute ${mark / 60} (medians; metrics freeze at death) ---`);
    console.log('policy          | survive(s) | kills | dmg taken | waves | gold  | dead%');
    console.log('----------------+------------+-------+-----------+-------+-------+------');
    for (const [name, cohort] of Object.entries(cohorts)) {
      const s = cohortSummary(cohort, mark);
      const deadFrac = cohort.filter(r => r.checkpoints[mark].dead).length / cohort.length;
      console.log(
        POLICIES[name].label.padEnd(16) + ' | ' +
        String(Math.round(s.survival)).padStart(10) + ' | ' +
        String(Math.round(s.kills)).padStart(5) + ' | ' +
        String(Math.round(s.damageTaken)).padStart(9) + ' | ' +
        String(s.waves).padStart(5) + ' | ' +
        String(Math.round(s.gold)).padStart(5) + ' | ' +
        (100 * deadFrac).toFixed(0).padStart(4) + '%');
    }
    console.log('');
  }

  // Run-length + where runs die (the Phase-A report shape) per archetype.
  console.log('RUN LENGTH + WHERE RUNS DIE (per archetype):');
  for (const [name, cohort] of Object.entries(cohorts)) {
    const s = cohortSummary(cohort, 600);
    const times = cohort.map(r => r.survivalTime);
    const income = cohort.reduce((a, r) => a + r.incomeProfile + r.incomeChest, 0) / cohort.length;
    console.log(`  ${POLICIES[name].label.padEnd(16)} mean ${Math.round(s.meanSurvival)}s · ` +
      `median ${Math.round(median(times))}s · best ${Math.max(...times)}s · ` +
      `limit ${s.limitRuns}/${cohort.length} · income/run ${Math.round(income)}g`);
    console.log(`    deaths: ${fmtDeaths(cohort) || 'none'}`);
  }
  console.log('');

  // Draft telemetry (medians): how many decisions actually happened.
  console.log('draft telemetry (median picks by minute / dead-multi picks / archetype shape):');
  for (const [name, cohort] of Object.entries(cohorts)) {
    const mid = cohort[runs >> 1];
    const top = Object.entries(mid.picks).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, v]) => `${k}x${v}`).join(' ');
    console.log(`  ${POLICIES[name].label.padEnd(16)} drafts m2:${mid.draftsByMinute[120]}` +
      ` m5:${mid.draftsByMinute[300]} m10:${mid.draftsByMinute[600]}` +
      ` dead-multi:${mid.deadMulti}  [${top}]`);
  }
  console.log('');

  const v = divergenceVerdict(cohorts.GREED_DAMAGE, cohorts.ADVERSARIAL_BAD);
  console.log('ACCEPTANCE BAR (brief, verbatim):');
  console.log('  "a deliberately bad draft run must be able to fail, and a good draft must');
  console.log('   visibly outperform it. If two opposite draft strategies produce the same');
  console.log('   result at minute 10, the balance is broken."');
  console.log(`  bad can fail (>=50% bad runs die before the limit): ${(100 * v.bad.failRate()).toFixed(0)}% -> ${v.badCanFail ? 'yes' : 'NO'}`);
  console.log(`  bad dies meaningfully earlier (<=0.8x good): bad ${Math.round(v.bad.survival)}s vs good ${Math.round(v.good.survival)}s (ratio ${v.goodBad.toFixed(2)}) -> ${v.badEarlier ? 'yes' : 'NO'}`);
  console.log(`  good beats bad on >=3 of 5 minute-10 metrics: ${v.winCount}/5 -> ${v.winCount >= 3 ? 'yes' : 'NO'}`);
  for (const [metric, won] of v.metricWins) console.log(`    ${won ? 'W' : '.'} ${metric}`);
  console.log(`VERDICT: ${v.pass ? 'PASS' : 'FAIL'}`);
  console.log('');

  console.log('LEVER ANALYSIS — where draft impact collapses (proposals only, no src/ edits):');
  const medSurv = name => Math.round(cohortSummary(cohorts[name], 600).meanSurvival);
  console.log(`  baseline: good ${medSurv('GREED_DAMAGE')}s vs bad ${medSurv('ADVERSARIAL_BAD')}s survival (x${v.goodBad.toFixed(2)})`);
  for (const L of LEVERS) {
    const lv = leverDelta(seed, leverRuns, L.patch);
    const baseSurv = cohortSummary(cohorts.SURVIVAL, 600).meanSurvival;
    console.log(`  ${L.id} ${L.name} — ${L.file}`);
    console.log(`     current: ${L.current}`);
    console.log(`     proposed: ${L.proposed}`);
    console.log(`     expected divergence: good/bad survival x${lv.goodBad.toFixed(2)} ` +
      `(baseline x${v.goodBad.toFixed(2)}), survival-archetype ${Math.round(lv.survMed)}s ` +
      `(baseline ${Math.round(baseSurv)}s), metric wins ${lv.winCount}/5, ` +
      `bad fail ${(100 * lv.bad.failRate()).toFixed(0)}% -> ${lv.pass ? 'PASS' : 'FAIL'} bar`);
    console.log(`     why: ${L.why}`);
  }
  console.log('');

  // Validation against the REAL loop (fresh stage — the sim is fresh-only).
  if (args.includes('--validate')) {
    const { runRealCohort } = await import('./real_loop.mjs');
    const n = Math.max(3, Math.floor(flag('--validate-runs', 6)));
    const real = await runRealCohort('fresh', n);
    const simMean = cohortSummary(cohorts.GREED_DAMAGE, 600).meanSurvival;
    const realMean = real.reduce((s, r) => s + r.time, 0) / real.length;
    console.log(`VALIDATION vs the REAL loop (fresh, n=${n}):`);
    console.log(`  analytic GREED-DAMAGE mean ${Math.round(simMean)}s · real-loop fresh mean ${Math.round(realMean)}s ` +
      `· delta ${(100 * (simMean - realMean) / realMean).toFixed(0)}%`);
    console.log(`  real deaths: ${real.filter(r => !r.won).map(r => `${r.killer}@w${r.wave}`).join(' ')}`);
    console.log(`  real income/run ${Math.round(real.reduce((s, r) => s + r.gold, 0) / real.length)}g`);
    console.log('');
  }

  if (!v.pass) process.exitCode = 1;
}

// Only auto-run when invoked directly (test_draft_sim.mjs imports this module —
// importing must NOT trigger a simulation).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
