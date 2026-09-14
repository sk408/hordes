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
//   meta.js      the E1 purse seams (GOLD_TIER / purseValue / RUN_GOLD), the
//                draft-weight + meta-bonus seams, shop tables
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
//
// ======================= W7a TOOLING (2026-09-14) ===========================
// Four W7a additions, all read through the LIVE seams (economy modelling is
// owner-WAIVED — E1 is the economy retune; this sim only READS its seams):
//   ARCH BUFFS (G5): neither sim referenced arches, so the wave-25 arch fix
//     (DOUBLE_FIRE rate x2 / BERSERK +50% dmg reaching every weapon) was
//     unmeasurable. archExpectedMods() prices the live arch cadence
//     (main.js spawnWaveArches: 1-2 gates/wave, uniform over ARCH_TYPES) as a
//     steady-state expected uptime per buff, off the REAL ARCH_TYPES table.
//     Toggle: LIVE.arches / patch { arches: false } for before/after cells.
//   E1 RUN PURSE: computeRunGold is RETIRED as the payout authority
//     (main.js settleRunGold). Banked income is now purse + AWARD: per-kill
//     tier gold (meta.js purseValue, folded into the mix in expectation),
//     MID_BOSS per herald, BOSS per wave boss, plus RUN_GOLD.AWARD x goldMult
//     at settlement (the live chain multiplies the AWARD only — the purse
//     banks unmultiplied). Chests pay NO gold post-E1 (incomeChest = 0).
//   WEAPON UNLOCKS AS +1 OPTION + POOL DILUTION: the live game does NOT start
//     purchased weapons in the kit — an unlock adds a GRANT CARD to the draft
//     pool (main.js openDraft gates grants on profile.unlockedWeapons). The
//     old sim started them in the kit AND offered only STARTER_WEAPONS
//     grants: both halves wrong. Now purchases.weapon_X unlocks enter the
//     pool via P.unlockedWeapons, exactly the live semantics.
//   GENERIC WEAPON DPS: dpsBase only knew VOLLEY + BOOMERANG (a granted ORBIT
//     contributed 0 dps and its level-ups were priced AS a boomerang). Every
//     archetype now has a coarse, documented dps line (weaponDps) read off
//     the LIVE WEAPONS defs + WEAPON_LEVELS tables, so unlock net value and
//     weapon level-ups price honestly. The per-type "bodies per cycle"
//     constants are sim-only assumptions in SIM_TUNING, each with its
//     reasoning — same honesty standard as PIERCE_VAL / BOOM_FRESH.
// New CLI modes (the default report is unchanged in shape):
//   --divergence      G6 measurement: good-vs-bad on BOTH axes (survival-time
//                     ratio AND waves-cleared ratio) against the post-E1
//                     economy, vs the owner's raised >= x1.6 target (W7b's
//                     number — reported, not enacted here)
//   --meta-value      every shop stat row ranked by MEASURED marginal value
//                     (delta cohort outcome per 1000g of next-level cost)
//                     against balance_sim's hardcoded GREEDY_PRIORITY order
//   --unlock-value    each weapon unlock's NET value (option gain MINUS pool
//                     dilution) at the real slot counts 3 / 4 / 6
//   --arch-impact     the arch layer's measured contribution, on vs off
// Purchase rows the sim still cannot see stay HONEST ZEROS, printed as such:
// the mana rows (regen/well/siphon/thrifty — no mana layer), focus (no pilot
// engagement model), arcade (cosmetic), elite_* unlocks (elite modifiers are
// not modelled), and ZAP's mana dry-mult (modelled at FULL damage — stated).
// ==========================================================================

import { pathToFileURL } from 'node:url';
import { CONFIG as C, UPGRADES, ladderHp, ladderXp, ladderDmg, ladderGroups,
  ladderEliteChance, ladderBeats, runClock } from '../src/config.js';
import { makePlayer, contactHitDamage } from '../src/entities.js';
import {
  WEAPONS, WEAPON_MAX_LEVEL, makeWeapon, levelUpWeapon, weaponLevelParams,
} from '../src/weapons.js';
import { ENEMY_TYPES, ELITE_TEMPLATE } from '../src/enemy_types.js';
import { volleyProjectileCap } from '../src/config.js';   // the ONE cap definition
// W7a: computeRunGold is RETIRED as the payout authority (main.js
// settleRunGold, E1). The sim banks the purse + award through the LIVE seams:
// purseValue per kill (tier-weighted), RUN_GOLD.AWARD at settlement.
import { STARTER_WEAPONS, draftCardWeight,
         draftRarityOf, applyMetaBonuses, GOLD_TIER, purseValue, RUN_GOLD,
         SHOP_BY_ID, SHOP_UPGRADES, WEAPON_PRICES, startPotionCount,
         startWeaponSlots, upgradeCost } from '../src/meta.js';
// W7a (G5): the arch layer, read off the REAL table (durations + mods) — the
// sim may never restate an arch number.
import { ARCH_TYPES } from '../src/arches.js';
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
// G10 (rarity tiers): the tier table through the same seam the game rolls —
// spawnWave's one rollRarity() per tier-eligible spawn, folded into the mix's
// EXPECTED hp/xp exactly like the elite ladder fraction below it.
import { RARITY, rollRarity } from '../src/rarity.js';

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
  CHEST_GOLD: 32,       // RETIRED post-E1: chests pay no gold (the per-kill
                        // purse replaced every in-run gold surface; chests.js
                        // has no gold outcome). Unused; kept so old patch
                        // cells that reference the knob still load.
  // ---- W7a arch-layer assumptions (see header) ------------------------------
  ARCHES_PER_WAVE: 1.5, // live spawnWaveArches: 1 gate + 50% a second
  ARCH_TRIGGER: 0.8,    // fraction of spawned gates the kiting AUTO pilot
                        // walks under before the run ends. Gates PERSIST on
                        // the field until consumed (state.arches is only
                        // cleared at run reset) and the pilot crosses the
                        // arena every wave, so most gates are eventually
                        // triggered; 0.8 is the honest coarse reading, not a
                        // derivation. Sensitivity is one knob away.
  // ---- W7a generic weapon-dps assumptions (bodies per cycle at field -------
  // saturation; dpsEff's crowd factor scales them down on a thin field).
  ZAP_DRY_MULT: 1,      // ZAP is a mana weapon (WEAPONS.ZAP.MANA); the sim has
                        // NO mana layer, so it models FULL bolts. 1 = honest
                        // overstatement, stated — set to the live dry mult to
                        // price the starved case.
  NOVA_HIT: 4,          // bodies inside a 70-112px pulse ring inside a horde
  SCYTHE_RING: 10,      // bodies within melee reach at saturation; the arc
                        // fraction (lp.arc / 2pi) of them is hit per swing
  MINE_HIT: 2,          // bodies per detonation (BLAST 45+ px)
  BEAM_HIT: 5,          // bodies in a 240px piercing line
  ORBIT_CONTACT: 0.5,   // fraction of a blade's revolution spent in a body
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
  // G10 (rarity tiers): fold src/rarity.js's RARE/MYTHIC mults into the spawn
  // mix's expected hp/xp and the kill funnel's potion-drop rate, exactly where
  // the live spawnWave stamps them. Set to false ONLY as the "before" cell of a
  // before/after measurement.
  rarity: true,
  // W7a (G5): the arch layer. true = the live game (gates spawn every wave);
  // false ONLY as the "before" cell of a before/after measurement.
  arches: true,
  // W7a: the run's unlocked weapon set (live: profile.unlockedWeapons —
  // starters are always unlocked). Grant cards are drawn from this set; the
  // default is the fresh profile exactly (STARTER_WEAPONS).
  unlockedWeapons: null,
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
// chance at play time t into hp/xp. G10: rarity tiers fold the SAME way — the
// live spawnWave rolls rollRarity() once per tier-eligible spawn and multiplies
// hp/xp by the tier mult, so in expectation each type's mult scales by
// (1 + rareFrac*(RARE-1) + mythFrac*(MYTHIC-1)). COLOSSUS is never tier-rolled
// in the live seam and bosses roll nothing here, so the fold applies only to
// the minion mix — which is exactly what this function prices.
const MIX_CACHE = new Map();
function spawnMix(w, t, rarityOn) {
  const key = w + ':' + Math.round(ladderEliteChance(t) * 100) + ':' + (rarityOn ? 1 : 0);
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
  // G10 expected-value fold off the REAL tier table (src/rarity.js rates:
  // RARE 0.02 / MYTHIC 0.003, measured at N=100k in test_rarity.mjs). This is
  // the expected multiplier for ONE tier-eligible spawn; the COLOSSUS exclusion
  // is applied per-type inside the loop, not here.
  const rarHp = rarityOn ? 1 + RARITY.RARE.chance * (RARITY.RARE.hpMult - 1) +
    RARITY.MYTHIC.chance * (RARITY.MYTHIC.hpMult - 1) : 1;
  const rarXp = rarityOn ? 1 + RARITY.RARE.chance * (RARITY.RARE.xpMult - 1) +
    RARITY.MYTHIC.chance * (RARITY.MYTHIC.xpMult - 1) : 1;
  let pack = 0, hp = 0, xp = 0, contact = 0, speed = 0, purse = 0;
  for (const [id, weight] of entries) {
    const T = ENEMY_TYPES[id];
    const share = weight / tot;
    const tiered = rarityOn && id !== 'COLOSSUS' ? 1 : 0;
    pack += share * (id === 'TICK' ? C.SPAWNER.TICK_PACK : (T.packSize || 1));
    hp += share * T.hpMult * (1 + eliteFrac * (ELITE_TEMPLATE.hpMult - 1)) *
      (1 + tiered * (rarHp - 1));
    xp += share * T.xpMult * (1 + eliteFrac * (ELITE_TEMPLATE.xpMult - 1)) *
      (1 + tiered * (rarXp - 1));
    contact += share * T.contactDamageMult;
    speed += share * T.speedMult;
    // E1 purse fold: the live kill funnel credits purseValue(e) per corpse.
    // An elite-stamped body pays GOLD_TIER.ELITE INSTEAD of its type tier
    // (purseTier's elite branch outranks the type table), so the expected
    // value is the fraction blend. Rarity tiers (RARE/MYTHIC) are NOT purse
    // signals — purseTier never reads them — so there is nothing to fold.
    purse += share * ((1 - eliteFrac) * purseValue({ typeId: id }) +
      eliteFrac * purseValue({ typeId: id, elite: true }));
  }
  const mix = { pack, hp, xp, contact, speed, purse };
  MIX_CACHE.set(key, mix);
  return mix;
}

// ---------- weapon dps estimates (live stats + live level tables) -----------
// W7a: ONE generic pricing per archetype, read off the LIVE WEAPONS def and
// WEAPON_LEVELS table. VOLLEY and BOOMERANG keep their established formulas
// verbatim; the other archetypes are coarse per-cycle models — each type's
// "bodies per cycle" is either DERIVED from the live constants (ZAP's chain
// sum with FALLOFF, SCYTHE's arc fraction of the melee ring, SEEKER's missile
// count) or a documented SIM_TUNING assumption (NOVA/MINE/BEAM/ORBIT), and
// dpsEff's crowd factor still scales the total on a thin field. Before this,
// a granted non-starter weapon contributed 0 dps and its level-up cards were
// priced AS a boomerang — unlock net value was unmeasurable.
export function weaponDps(type, level, player, P) {
  const s = player.stats;
  const lp = weaponLevelParams(type, level);
  if (type === 'VOLLEY') {
    const n = Math.min(s.projectiles + (lp.proj || 0), P.maxProj);
    const perShot = s.damage * (lp.dmgMult || 1) * (1 + 0.2 * (lp.proj || 0));
    return (perShot / s.cooldown) * (1 + SIM_TUNING.SPREAD_EFF * (n - 1));
  }
  if (type === 'BOOMERANG') {
    const cycle = WEAPONS.BOOMERANG.COOLDOWN * (s.cooldown / C.WEAPON.COOLDOWN);
    const perThrow = s.damage * (lp.dmgMult || 1);
    const hitsPerThrow = 1.4 + 0.5 * (s.pierce + (lp.pierceBonus || 0));
    return (perThrow / cycle) * hitsPerThrow;
  }
  const def = WEAPONS[type];
  if (!def) return 0;
  const perBody = s.damage * (def.DAMAGE_MULT || 1) * (lp.dmgMult || 1);
  if (type === 'ORBIT') {
    // No cooldown: each blade re-ticks a body every TICK s while in contact.
    return perBody * (lp.blades || 1) * (1 / def.TICK) * SIM_TUNING.ORBIT_CONTACT;
  }
  let bodies = 1;
  if (type === 'ZAP') {
    // Primary + jumps with the live per-jump falloff — derived, not tuned.
    let sum = 0, f = 1;
    for (let j = 0; j <= (lp.jumps || def.JUMPS); j++) { sum += f; f *= def.FALLOFF; }
    bodies = sum;
  } else if (type === 'NOVA_PULSE') bodies = SIM_TUNING.NOVA_HIT;
  else if (type === 'SCYTHE') bodies = ((lp.arc || def.ARC) / (2 * Math.PI)) * SIM_TUNING.SCYTHE_RING;
  else if (type === 'SEEKER') bodies = lp.count || 1;   // homing: a missile is a hit
  else if (type === 'MINE') bodies = SIM_TUNING.MINE_HIT;
  else if (type === 'BEAM') bodies = SIM_TUNING.BEAM_HIT;
  const cycle = (def.COOLDOWN || 1) * (s.cooldown / C.WEAPON.COOLDOWN);
  // ZAP is the one mana weapon: no mana layer, so the model fires FULL bolts
  // (ZAP_DRY_MULT 1) — an honest overstatement, stated in the header.
  const dry = type === 'ZAP' ? SIM_TUNING.ZAP_DRY_MULT : 1;
  return (perBody / cycle) * bodies * dry;
}

function dpsBase(player, weapons, P) {
  let total = 0;
  for (const w of weapons) total += weaponDps(w.type, w.level || 1, player, P);
  return total;
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

// ---------- W7a: the arch layer in expectation (live cadence, REAL table) ---
// main.js spawnWaveArches drops ARCHES_PER_WAVE gates per wave, uniform over
// the five ARCH_TYPES; a gate persists on the field until the pilot walks
// under it (state.arches is only cleared at run reset) and then grants its
// buff for the table's duration. In steady state each type fires
// (ARCHES_PER_WAVE / #types) x ARCH_TRIGGER times per WAVE_SECONDS, so its
// expected uptime is triggers x duration / wave, capped at 1 (a refresh
// restarts the timer, it never stacks). Each mod's time-weighted expectation
// is 1 + uptime x (mult - 1), combined multiplicatively across the types
// that DO stack (the live rule in activeArchMods). SHIELD is not a
// multiplier: it pays shieldHits absorbs per trigger, priced at the wave's
// ambient hit in the damage funnel. MAGNET's pickupMult is an HONEST ZERO in
// this model — the sim already collects every gem it prices, so a bigger
// pickup radius buys nothing here; stated, not faked. All numbers come from
// the REAL ARCH_TYPES rows: retune arches.js and the sim moves.
export function archExpectedMods(P) {
  const out = { rateMult: 1, damageMult: 1, speedMult: 1, pickupMult: 1,
    shieldPerSec: 0, uptimes: {} };
  if (!P.arches) return out;
  const ids = Object.keys(ARCH_TYPES);
  const trigPerSec = (SIM_TUNING.ARCHES_PER_WAVE / ids.length) *
    SIM_TUNING.ARCH_TRIGGER / WAVE_SECONDS;
  for (const id of ids) {
    const def = ARCH_TYPES[id];
    const uptime = Math.min(1, trigPerSec * def.duration);
    out.uptimes[id] = uptime;
    for (const [k, v] of Object.entries(def.mods)) out[k] *= 1 + uptime * (v - 1);
    if (def.shieldHits) out.shieldPerSec += trigPerSec * def.shieldHits;
  }
  return out;
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
    const add = weaponDps(card.weapon, 1 + bonus, shadow, P);
    return { dps: base > 0 ? add / base : 1, ehp: 0 };
  }
  if (card.kind === 'wlevel') {
    const cur = card.w.level;
    // At-cap pricing: under ONE OF EACH an at-cap weapon pick converts to
    // +10% player damage (applyCard does the conversion; main.js pick() does
    // the same). Player damage feeds EVERY weapon's dps, so the marginal
    // value is exactly +0.1 relative — priced exactly, not coarse.
    if (bonus && cur >= WEAPON_MAX_LEVEL) return { dps: 0.1, ehp: 0 };
    // W7a: every archetype prices through its OWN weaponDps curve (the old
    // code priced every non-VOLLEY level-up as a boomerang).
    const a = weaponDps(card.w.type, cur, player, P);
    const b = weaponDps(card.w.type, cur + 1 + bonus, player, P);
    const f = a > 0 ? b / a : 1;
    return { dps: base > 0 ? (f - 1) * (a / base) : 0, ehp: 0 };
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
  const slotCap = patch.slotCap ?? 3;   // fresh profile = 3; purchases.slots raises it
  const nonVolley = weapons.filter(w => w.type !== 'VOLLEY').length;
  if (slotCap - 1 - nonVolley > 0) {
    // W7a: grant cards come from the run's UNLOCKED set (live: openDraft gates
    // grants on profile.unlockedWeapons) — an unlock is +1 option in this
    // pool AND the dilution that comes with it. Default = STARTER_WEAPONS,
    // the fresh profile exactly.
    for (const id of (patch.unlockedWeapons || STARTER_WEAPONS)) {
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
  // PURCHASED LOADOUT (owner 2026-09-13: "give the sim all the damage upgrades
  // and some split shot upgrades and some mana reduction buyables and 1 weapon
  // slot and unlock the cheapest weapon"). `purchases` is profile.purchased-
  // shaped and goes through the REAL applyMetaBonuses, so the sim cannot price
  // the shop differently from the game. Absent/empty = the fresh profile exactly
  // as before, so every existing cohort measurement is unchanged.
  const purchases = P.purchases || {};
  if (Object.keys(purchases).length > 0) {
    player.stats = applyMetaBonuses(player.stats, purchases);
    // A run starts at FULL pool: applyMetaBonuses returns a NEW stats object
    // (Vitality raises stats.maxHp), so the current hp must be re-pinned to
    // the new max — otherwise a Vitality arm would START 40xlevel hp down,
    // which read as the hp row having negative value.
    player.hp = player.stats.maxHp;
    // The projectile cap is DERIVED, never the bare constant: the Split Shot row
    // raises it, and a sim reading the base while the game reads the raised cap
    // is exactly the drift that made that card a fake choice.
    P.maxProj = volleyProjectileCap(player.stats);
  }
  // The live slot seam (3..6, clamped): startWeaponSlots, never a restated 3.
  P.slotCap = startWeaponSlots({ purchased: purchases });
  // W7a: the purchase rows the sim can price, read off the REAL applied stats
  // (applyMetaBonuses already emits them; an unread row measures as exactly
  // 0, which --meta-value prints as an honest zero rather than a guess):
  //   Fortune  -> the draft-weight seam (an explicit patch.luckLevel wins)
  if (!Number.isFinite(patch.luckLevel)) P.luckLevel = player.stats.luck || LIVE.luckLevel;
  //   Deadly Aim / Deadeye -> expected crit value (weapons.js critRoll is a
  //   per-hit roll; over a run the expectation is the honest price). Fixed at
  //   run start: nothing in the draft changes crit.
  const critFactor = 1 + (player.stats.crit || 0) * ((player.stats.critMult || 1) - 1);
  const xpM = player.stats.xpMult || 1;               // Scholar, on gem pickup
  const dropChance = C.POTIONS.DROP_CHANCE + (player.stats.dropBonus || 0);  // Scavenger
  const potionHeal = C.POTIONS.HP_HEAL * (player.stats.potionPower || 1);    // Alchemy
  // W7a (G5): the arch layer's expected mods for this run (identity when off).
  const arch = archExpectedMods(P);
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
  // W7a — WEAPON UNLOCKS AS +1 OPTION + POOL DILUTION (the live semantics):
  // a shop unlock does NOT start the run in the kit. main.js opens every run
  // with VOLLEY plus the equipped character's startingWeapon (not modelled —
  // the sim's pilot is classless) and gates the draft's GRANT cards on
  // profile.unlockedWeapons (openDraft). The old sim started purchased
  // weapons in the kit AND offered only STARTER_WEAPONS grants, so an unlock
  // read as a free weapon with zero dilution cost — both halves wrong.
  P.unlockedWeapons = STARTER_WEAPONS.concat(
    Object.keys(purchases)
      .filter(id => id.startsWith('weapon_') && purchases[id])
      .map(id => id.slice('weapon_'.length).toUpperCase())
      .filter(wid => WEAPONS[wid] && !STARTER_WEAPONS.includes(wid)));
  // Starting Artifact row: artifactLevels free weapon levels at run start
  // (live: random picks among under-cap weapons; sim: lowest-level-first —
  // the deterministic expectation of the live roll).
  for (let i = 0; i < (player.stats.artifactLevels || 0); i++) {
    const cands = weapons.filter(w => (w.level || 1) < WEAPON_MAX_LEVEL);
    if (cands.length === 0) break;
    cands.sort((a, b) => (a.level || 1) - (b.level || 1));
    levelUpWeapon(cands[0]);
  }
  const startMaxHp = player.stats.maxHp;    // the pool HP_PER_LEVEL is linear in
  const counts = {};
  const picks = {};
  let deadMulti = 0;
  let xp = player.xp, level = 1, xpNext = player.xpNext;
  let N = 0, kills = 0, dmgTaken = 0;
  // E1: the in-run wallet (profile.runPurse's sim mirror), credited per kill
  // through the mix's purse fold, per herald/boss through GOLD_TIER.
  let purse = 0;
  // Travel Pack / character start: the live starting potion count rides the
  // startPotionCount seam (KNIGHT = the sim's classless pilot). The auto-drink
  // funnel below is the AUTO pilot's own rule (drink at <50%).
  let healBank = startPotionCount({ equippedCharacter: 'KNIGHT', purchased: purchases });
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
      // E1: mid-run the wallet IS the purse (settlement's fixed AWARD only
      // lands at run end — see the return value).
      gold: Math.round(purse),
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
    const mix = spawnMix(w, t, P.rarity);

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
    // W7a: the arch layer (rate x damage, the live rateScale/dmgScale shape)
    // and the expected crit value ride as UNIFORM multipliers — they scale
    // every weapon and every policy together, so they never re-rank a draft
    // card, which is exactly why G5's arch fix is measurable as a power delta
    // rather than a draft distortion.
    const dps = dpsEff(player, weapons, N, P,
      held.rewrites.pierceall ? SIM_TUNING.PIERCEALL_VAL : 0) *
      arch.rateMult * arch.damageMult * critFactor;
    let dmg = dps * DT;
    if (mawHp > 0) {
      const toMaw = dmg * SIM_TUNING.BOSS_DPS_SHARE;
      mawHp -= toMaw; dmg -= toMaw;
    } else if (bossHp > 0) {
      const toBoss = dmg * SIM_TUNING.BOSS_DPS_SHARE;
      bossHp -= toBoss; dmg -= toBoss;
      if (bossHp <= 0) {
        waves++;
        xp += C.ENEMY.BASE_XP * ladderXp(w) * C.ESCALATION.BOSS.XP_KILLS * bossCount * xpM;
        // E1: the wave boss pays GOLD_TIER.BOSS per boss BODY at the kill
        // funnel (double-boss waves credit twice — the live purseCredit runs
        // per corpse).
        purse += GOLD_TIER.BOSS * bossCount;
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
        xp += C.ENEMY.BASE_XP * ladderXp(w) * C.ESCALATION.MIDBOSS.XP_KILLS * xpM;
        purse += GOLD_TIER.MID_BOSS;   // E1: "a nice drop", per the live tier
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
        killN * dropChance * SIM_TUNING.HARVEST_FRESH * blast.damage / avgHp);
      killN += harvestKills;
    }
    kills += killN; N -= killN;
    // E1: the per-kill purse credit, in expectation over the mix (the live
    // kill funnel runs purseValue per corpse).
    purse += killN * mix.purse;

    // XP -> drafts.
    xp += killN * C.ENEMY.BASE_XP * ladderXp(w) * mix.xp * xpM;
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
    // W7a: BERSERK's x0.75 / SWIFT's x1.4 ride the kite ratio through the arch
    // layer's expected speedMult (identity when the layer is off).
    const closing = clamp(avgSpd / (player.stats.speed * arch.speedMult), 0.12, 1.6);
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
    const hurtRaw = (hits * ambient + (heavy > 0 ? 0.25 * heavy : 0)) * DT * damageTakenMult(heldState);
    // W7a SHIELD arch: absorbs are whole HITS (shieldHits per grant); priced
    // at the wave's ambient hit and subtracted at the expected grant rate.
    const hurt = Math.max(0, hurtRaw - arch.shieldPerSec * ambient * DT);
    if (hurt > 0) {
      if (player.hp < 0.5 * player.stats.maxHp && healBank >= 1) {
        player.hp = Math.min(player.stats.maxHp, player.hp + potionHeal);
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
    // G10: tiered enemies carry e.dropBonus, which the live death pass adds to
    // the potion drop chance — folded here as the expected per-kill bonus over
    // the tier-eligible fraction of the mix (COLOSSUS excluded, same as the
    // hp/xp fold in spawnMix).
    healBank += killN * dropChance *
      (P.rarity ? 1 + (RARITY.RARE.chance * RARITY.RARE.dropBonus +
        RARITY.MYTHIC.chance * RARITY.MYTHIC.dropBonus) : 1);

    for (const mark of [120, 300, 600]) if (t >= mark && !checkpoints[mark]) snap(mark);
    t += DT;
  }
  if (!dead && t >= LIMIT) reachedLimit = true;
  for (const mark of [120, 300, 600]) if (!checkpoints[mark]) snap(mark);

  // E1 settlement (the live settleRunGold shape): banked = the purse
  // remainder + the fixed AWARD x goldMult. The live goldMult chain
  // (GREED x manual stakes x rampage best) multiplies the AWARD ONLY — the
  // purse banks unmultiplied, and the stakes/rampage legs are 1 in a plain
  // run (not modelled). computeRunGold is RETIRED as the payout authority.
  const award = Math.round(RUN_GOLD.AWARD * (player.stats.goldMult || 1));
  const incomePurse = Math.round(purse);
  return {
    policy: policyName,
    dead, reachedLimit,
    survivalTime: reachedLimit ? LIMIT : Math.round(t),
    wave: waveNum, wavesCleared: waves,
    killer: reachedLimit ? null : killer,
    incomePurse,
    incomeProfile: incomePurse + award,
    // E1 HONEST ZERO: chests pay NO gold post-E1 (the per-kill purse replaced
    // every in-run gold surface — src/chests.js has no gold outcome). Kept as
    // a field so readers summing incomeProfile + incomeChest keep working.
    // The pre-E1 G10 honest-zero note stands too: item drops are still not
    // modelled, so a tiered enemy's item-side dropBonus is still priced at 0
    // (the potion side IS priced, above).
    incomeChest: 0,
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
  // G6's SECOND axis (owner 2026-09-14): waves-cleared ratio — "wider and
  // far more legible to a player (bad draft = wave 2, good = wave 4)". Read
  // at the run's END, not the minute-10 checkpoint: the checkpoint freezes
  // mid-run for runs still alive, and under a strong loadout the kill funnel
  // saturates at the spawn rate (every surviving run shows the same
  // checkpoint kills/gold) — the final wave count is where the draft's
  // coherence actually expresses.
  const medWaves = c => median(c.map(r => r.wavesCleared));
  const gW = medWaves(good), bW = medWaves(bad);
  return {
    pass: b.failRate() >= 0.5 && b.survival <= 0.8 * g.survival && winCount >= 3,
    badCanFail: b.failRate() >= 0.5,
    badEarlier: b.survival <= 0.8 * g.survival,
    goodBad: b.survival > 0 ? g.survival / b.survival : Infinity,
    goodBadWaves: bW > 0 ? gW / bW : Infinity,
    finalWaves: { good: gW, bad: bW },
    metricWins: wins, winCount,
    good: g, bad: b,
  };
}

// ---------- W7a measurement cells (the tooling deliverables) ----------------
// The owner-specified expression loadout (2026-09-13, pinned by
// test_draft_sim / test_draft_luck): a green run dies at ~52s with two drafts
// and cannot express divergence, so every W7a measurement defaults to this
// fixture. Read through SHOP_BY_ID, never restated.
export const OWNER_LOADOUT = {
  dmg: SHOP_BY_ID.dmg.maxLevel,   // all damage upgrades
  split: 3,                       // some split shot
  thrifty: 2,                     // some mana reduction (an honest 0 in this
                                  // model: no mana layer — printed as such)
  slots: 1,                       // +1 weapon slot
  weapon_orbit: 1,                // the cheapest archetype (WEAPON_PRICES.ORBIT)
};

const meanOf = (rows, f) => rows.reduce((s, r) => s + f(r), 0) / Math.max(1, rows.length);

// G6 divergence, measured on BOTH axes against the post-E1 economy (the
// cohorts bank the E1 purse + AWARD through the live seams).
export function measureDivergence(seed, runs, patch = { purchases: OWNER_LOADOUT }) {
  const good = simulateCohort(seed, runs, 'GREED_DAMAGE', patch);
  const bad = simulateCohort(seed, runs, 'ADVERSARIAL_BAD', patch);
  const v = divergenceVerdict(good, bad);
  return {
    ...v,
    meanSurvival: { good: meanOf(good, r => r.survivalTime), bad: meanOf(bad, r => r.survivalTime) },
    meanWaves: { good: meanOf(good, r => r.wavesCleared), bad: meanOf(bad, r => r.wavesCleared) },
    meanBanked: { good: meanOf(good, r => r.incomeProfile), bad: meanOf(bad, r => r.incomeProfile) },
    // The owner's raised bar (2026-09-14): >= x1.6 on BOTH axes, x2.0 the
    // stretch. That target is W7b's — REPORTED here, enacted there.
    target: 1.6,
    meetsTarget: v.goodBad >= 1.6 && v.goodBadWaves >= 1.6,
  };
}

// The arch layer's measured contribution: identical cohorts, layer ON vs OFF
// (the only before/after cell where { arches: false } is legitimate).
export function measureArchImpact(seed, runs, patch = { purchases: OWNER_LOADOUT }) {
  const on = simulateCohort(seed, runs, 'GREED_DAMAGE', patch);
  const off = simulateCohort(seed, runs, 'GREED_DAMAGE', { ...patch, arches: false });
  return {
    surv: { on: meanOf(on, r => r.survivalTime), off: meanOf(off, r => r.survivalTime) },
    waves: { on: meanOf(on, r => r.wavesCleared), off: meanOf(off, r => r.wavesCleared) },
    banked: { on: meanOf(on, r => r.incomeProfile), off: meanOf(off, r => r.incomeProfile) },
    uptimes: archExpectedMods({ ...LIVE, ...patch }).uptimes,
  };
}

// W7a: rank the shop's STAT rows by MEASURED marginal value. Each row's arm
// is the expression base plus ONE more level of that row (the next purchase
// a player would make); the cost is the LIVE next-level price through
// upgradeCost. A row maxed in the base (dmg) is measured as its FIRST level
// from a stripped base, and says so. A row the model cannot see measures
// BYTE-IDENTICAL to the base (the sim is seeded and deterministic) — the
// delta is exactly 0 and the row is reported as an honest zero, never
// guessed. Weapon/elite unlock rows are not stat rows: weapons are measured
// by measureUnlockValue; elite modifiers are unmodelled (honest zero).
export function measureMetaValue(seed, runs, base = OWNER_LOADOUT) {
  const basePatch = { purchases: base };
  const baseCohort = simulateCohort(seed, runs, 'GREED_DAMAGE', basePatch);
  const baseSurv = meanOf(baseCohort, r => r.survivalTime);
  const baseGold = meanOf(baseCohort, r => r.incomeProfile);
  const rows = [];
  for (const def of SHOP_UPGRADES) {
    if (def.kind) continue;   // weapon_/elite_ unlock rows: see measureUnlockValue
    const baseLvl = base[def.id] || 0;
    let armPatch = { purchases: { ...base, [def.id]: baseLvl + 1 } };
    let cost = upgradeCost(def, baseLvl);
    let note = null;
    let armBase = baseCohort, armBaseSurv = baseSurv, armBaseGold = baseGold;
    if (baseLvl >= def.maxLevel) {
      // Maxed in the base: the marginal purchase does not exist. Measure the
      // FIRST level's value from a stripped base instead, and say so.
      const stripped = { ...base }; delete stripped[def.id];
      const sc = simulateCohort(seed, runs, 'GREED_DAMAGE', { purchases: stripped });
      armBase = sc; armBaseSurv = meanOf(sc, r => r.survivalTime);
      armBaseGold = meanOf(sc, r => r.incomeProfile);
      armPatch = { purchases: { ...stripped, [def.id]: 1 } };
      cost = upgradeCost(def, 0);
      note = `maxed in the base — measured as level 0->1 (cost ${cost}g)`;
    }
    const arm = simulateCohort(seed, runs, 'GREED_DAMAGE', armPatch);
    const dSurv = meanOf(arm, r => r.survivalTime) - armBaseSurv;
    const dGold = meanOf(arm, r => r.incomeProfile) - armBaseGold;
    // A truly unread row is byte-identical to its base — but a byte-identical
    // arm can ALSO mean "read, and worth nothing alone at this base" (crit
    // without critdmg; a 5th slot with only 2 unlocked weapons; a starting
    // potion when the drop funnel banks hundreds). Split the two cases with
    // the LIVE probes: applied-stats diff, the slot seam, the potion seam.
    const identical = JSON.stringify(arm) === JSON.stringify(armBase);
    let zeroNote = null;
    if (identical && !note) {
      const probe0 = applyMetaBonuses(makePlayer().stats, base);
      const probe1 = applyMetaBonuses(makePlayer().stats, armPatch.purchases);
      const reads = JSON.stringify(probe0) !== JSON.stringify(probe1) ||
        startWeaponSlots({ purchased: base }) !== startWeaponSlots({ purchased: armPatch.purchases }) ||
        startPotionCount({ equippedCharacter: 'KNIGHT', purchased: base }) !==
          startPotionCount({ equippedCharacter: 'KNIGHT', purchased: armPatch.purchases });
      zeroNote = reads
        ? 'reads into the model; no measurable effect ALONE at this base (honest 0)'
        : 'OUTSIDE THIS MODEL (mana / pilot-range / arcade — no layer to read it; honest 0)';
    }
    rows.push({ id: def.id, name: def.name, baseLvl, cost, dSurv, dGold,
      survPer1k: cost > 0 ? dSurv / cost * 1000 : 0,
      goldPer1k: cost > 0 ? dGold / cost * 1000 : 0,
      invisible: identical, note: note || zeroNote });
  }
  rows.sort((a, b) => b.survPer1k - a.survPer1k);
  return { base: { ...base }, baseSurv, baseGold, rows };
}

// W7a: each weapon unlock's NET value at the real slot counts — the option
// gain MINUS the pool dilution, both modelled (the unlock enters the draft
// pool as +1 grant card; nothing starts in the kit). The base is the owner
// fixture minus its own unlock row, so ORBIT is measured like every other
// archetype.
export function measureUnlockValue(seed, runs, slotCounts = [3, 4, 6]) {
  const base0 = { ...OWNER_LOADOUT };
  delete base0.weapon_orbit;
  delete base0.slots;
  const out = [];
  for (const slots of slotCounts) {
    const slotsLvl = slots - 3;   // WEAPON_SLOT_START is 3; the shop row adds
    const base = slotsLvl > 0 ? { ...base0, slots: slotsLvl } : { ...base0 };
    const baseCohort = simulateCohort(seed, runs, 'GREED_DAMAGE', { purchases: base });
    const bSurv = meanOf(baseCohort, r => r.survivalTime);
    const bWaves = meanOf(baseCohort, r => r.wavesCleared);
    const bGold = meanOf(baseCohort, r => r.incomeProfile);
    for (const [wid, price] of Object.entries(WEAPON_PRICES)) {
      const arm = simulateCohort(seed, runs, 'GREED_DAMAGE',
        { purchases: { ...base, ['weapon_' + wid.toLowerCase()]: 1 } });
      out.push({
        weapon: wid, slots, price,
        dSurv: meanOf(arm, r => r.survivalTime) - bSurv,
        dWaves: meanOf(arm, r => r.wavesCleared) - bWaves,
        dBanked: meanOf(arm, r => r.incomeProfile) - bGold,
        // How often the GREED policy actually drafts the unlocked weapon —
        // the take-rate a negative row's dilution cost is conditioned on.
        takeRate: arm.filter(r => (r.picks['grant_' + wid] || 0) > 0).length / arm.length,
      });
    }
  }
  return out;
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
  // G10: the tier rate the rarity fold is built from, MEASURED through the real
  // rollRarity (not asserted off the constants) so the printed fold and the
  // model's assumptions are the same number the game rolls.
  {
    let rngSeed = seed >>> 0;
    const rng = () => {
      rngSeed |= 0; rngSeed = (rngSeed + 0x6D2B79F5) | 0;
      let t2 = Math.imul(rngSeed ^ (rngSeed >>> 15), 1 | rngSeed);
      t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
      return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
    };
    const N = 100000;
    let rare = 0, mythic = 0;
    for (let i = 0; i < N; i++) {
      const tier = rollRarity(rng);
      if (tier === 'RARE') rare++;
      else if (tier === 'MYTHIC') mythic++;
    }
    const f = 1 + RARITY.RARE.chance * (RARITY.RARE.hpMult - 1) +
      RARITY.MYTHIC.chance * (RARITY.MYTHIC.hpMult - 1);
    console.log(`rarity fold ON: measured rollRarity N=${N} -> RARE ` +
      `${(100 * rare / N).toFixed(3)}% MYTHIC ${(100 * mythic / N).toFixed(3)}% ` +
      `(tiered ${(100 * (rare + mythic) / N).toFixed(2)}%); expected minion hp x${f.toFixed(4)}`);
  }
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
  // G6's two axes and the owner's raised bar (W7b's target — reported, not
  // enacted): survival ratio is the fresh-profile read above; BOTH-axes on
  // the owner loadout is what --divergence prints.
  console.log(`  waves-cleared ratio (G6 axis 2, fresh profile): good ${v.finalWaves.good} vs bad ${v.finalWaves.bad} final waves ` +
    `(x${Number.isFinite(v.goodBadWaves) ? v.goodBadWaves.toFixed(2) : 'n/a — no waves cleared'})`);
  console.log(`VERDICT: ${v.pass ? 'PASS' : 'FAIL'}`);
  console.log('');

  // ---- W7a measurement modes -------------------------------------------------
  if (args.includes('--divergence')) {
    const d = measureDivergence(seed, runs);
    console.log(`G6 DIVERGENCE — the owner's raised bar, post-E1 economy ` +
      `(${runs} runs/policy, seed ${seed}, owner loadout):`);
    console.log(`  survival-time ratio (axis 1): good ${Math.round(d.good.survival)}s vs bad ${Math.round(d.bad.survival)}s median ` +
      `-> x${d.goodBad.toFixed(2)}  (means ${d.meanSurvival.good.toFixed(0)}s / ${d.meanSurvival.bad.toFixed(0)}s)`);
    console.log(`  waves-cleared ratio (axis 2): good ${d.finalWaves.good} vs bad ${d.finalWaves.bad} final waves median ` +
      `-> x${d.goodBadWaves.toFixed(2)}  (means ${d.meanWaves.good.toFixed(1)} / ${d.meanWaves.bad.toFixed(1)})`);
    console.log(`  banked income (E1 purse + AWARD): good ${Math.round(d.meanBanked.good)}g vs bad ${Math.round(d.meanBanked.bad)}g mean/run`);
    console.log(`  bad can fail: ${(100 * d.bad.failRate()).toFixed(0)}% die before the limit; metric wins ${d.winCount}/5`);
    console.log(`  minute-10 metric detail: ${d.metricWins.map(([k, w]) => (w ? 'W ' : '. ') + k).join(' | ')}`);
    console.log(`  (saturation note: under a maxed-damage loadout the kill funnel caps at the spawn rate,`);
    console.log(`   so checkpoint kills/gold tie for any run still alive — divergence reads on survival + waves.)`);
    console.log(`  OWNER TARGET (W7b, reported not enacted): >= x${d.target.toFixed(1)} on BOTH axes -> ` +
      `${d.meetsTarget ? 'MET' : 'NOT MET'} (survival x${d.goodBad.toFixed(2)}, waves x${d.goodBadWaves.toFixed(2)})`);
    console.log('');
  }

  if (args.includes('--arch-impact')) {
    const a = measureArchImpact(seed, runs);
    const pc = (on, off) => `${off > 0 ? (100 * (on - off) / off).toFixed(1) : 'inf'}%`;
    console.log(`ARCH BUFF LAYER — measured contribution, ON vs OFF ` +
      `(${runs} runs/policy, seed ${seed}, owner loadout; G5's arch fix is now measurable):`);
    console.log(`  expected uptimes: ` + Object.entries(a.uptimes)
      .map(([k, u]) => `${k} ${(100 * u).toFixed(0)}%`).join('  '));
    console.log(`  mean survival ${a.surv.off.toFixed(0)}s -> ${a.surv.on.toFixed(0)}s (+${pc(a.surv.on, a.surv.off)})`);
    console.log(`  mean waves ${a.waves.off.toFixed(1)} -> ${a.waves.on.toFixed(1)}`);
    console.log(`  mean banked ${Math.round(a.banked.off)}g -> ${Math.round(a.banked.on)}g (+${pc(a.banked.on, a.banked.off)})`);
    console.log('');
  }

  if (args.includes('--meta-value')) {
    const { GREEDY_PRIORITY } = await import('./balance_sim.mjs');
    const mv = measureMetaValue(seed, Math.min(runs, 30));
    console.log(`META UPGRADES RANKED BY MEASURED MARGINAL VALUE ` +
      `(${Math.min(runs, 30)} runs/cell, seed ${seed}; base = owner loadout, ` +
      `base run ${mv.baseSurv.toFixed(0)}s / ${Math.round(mv.baseGold)}g):`);
    console.log(' rank | id        | +1 level delta survival | delta banked | per 1000g (surv / gold) | note');
    mv.rows.forEach((r, i) => {
      console.log(`  ${String(i + 1).padStart(3)} | ${r.id.padEnd(10)} | ` +
        `${(r.dSurv >= 0 ? '+' : '') + r.dSurv.toFixed(1) + 's'}`.padEnd(24) + ' | ' +
        `${(r.dGold >= 0 ? '+' : '') + Math.round(r.dGold) + 'g'}`.padEnd(13) + ' | ' +
        `${r.survPer1k.toFixed(2)}s / ${Math.round(r.goldPer1k)}g`.padEnd(24) + ' | ' +
        (r.note || ''));
    });
    console.log(`  hardcoded GREEDY_PRIORITY (balance_sim, for comparison): ${GREEDY_PRIORITY.join(' > ')}`);
    console.log(`  measured order: ${mv.rows.map(r => r.id).join(' > ')}`);
    console.log('  (weapon unlocks are not stat rows — see --unlock-value. Rows reading 0 say why:');
    console.log('   outside the model = mana/pilot/arcade layer the sim does not have; otherwise the row');
    console.log('   reads in but is worth nothing ALONE at this base — crit without critdmg, a slot with');
    console.log('   nothing to fill it, a starting potion when the drop funnel banks hundreds.)');
    console.log('');
  }

  if (args.includes('--unlock-value')) {
    const uv = measureUnlockValue(seed, Math.min(runs, 24));
    console.log(`WEAPON UNLOCK NET VALUE — +1 draft option MINUS pool dilution, at the real slot counts ` +
      `(${Math.min(runs, 24)} runs/cell, seed ${seed}; nothing starts in the kit — the live semantics):`);
    console.log(' weapon    | price  | slots | grant take-rate | delta survival | delta waves | delta banked');
    for (const r of uv) {
      console.log(` ${r.weapon.padEnd(10)} | ${String(r.price).padStart(6)} | ${r.slots}     | ` +
        `${(100 * r.takeRate).toFixed(0)}%`.padEnd(16) + '| ' +
        `${(r.dSurv >= 0 ? '+' : '') + r.dSurv.toFixed(1) + 's'}`.padEnd(15) + '| ' +
        `${(r.dWaves >= 0 ? '+' : '') + r.dWaves.toFixed(2)}`.padEnd(12) + '| ' +
        `${(r.dBanked >= 0 ? '+' : '') + Math.round(r.dBanked)}g`);
    }
    console.log('  (a NEGATIVE row is the dilution cost out-weighing the option at that slot count —');
    console.log('   exactly the net-value read W7a asks for; deltas are vs the same base without the unlock.');
    console.log('   CAVEAT: the base maxes dmg, so the kill funnel saturates at the spawn rate — added');
    console.log('   weapon dps cannot pay in kills/xp there, and the draft is zero-sum. The negative rows');
    console.log('   are the myopic-GREED read: the policy always takes the grant and the blade-doubling');
    console.log('   levels, which crowd out the compounding dmg/rate line. A player who declines the');
    console.log('   grant pays only the offer-rate dilution. Measured, stated, not a balance proposal.)');
    console.log('');
  }

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
