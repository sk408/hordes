// HORDES — BALANCE SIM v2 (SURVIVAL-GAP wave, 2026-09-12).
//
// ⚠️ READ THIS FIRST: v1 of this file modelled the RETIRED run unit (5 boss
// waves, a ~270s "good run", an unbeatable finale). Every number it printed was
// an artifact of a structure the game no longer has. This is a rebuild, not a
// retune: the run model below is the LIVE bounded ladder
// (CONFIG.RUN.LIMIT = 1800s, CONFIG.LADDER: 15 waves x 120s, a knee at
// tick 8 / 4:00 below which the curves are bit-identical to the shipped ones).
//
// WHAT THIS SIM IS FOR
//   1. the ECONOMY: careers of real runs, greedy shopping through the REAL
//      meta.js API, so the reprice wave gets income-per-run by stage;
//   2. the SURVIVAL SHAPE: per-stage (fresh / partial / maxed) run length,
//      where runs die (wave + killer), and how many reach the limit;
//   3. the GAP: build POWER vs the ladder's DEMAND, tick by tick, as numbers.
//
// ============================ MODEL (and its honest limits) =================
// The run model is ANALYTIC (it must be: 200 careers x 30 runs of real frames
// is hours), so it is CALIBRATED to the real loop and VALIDATED against it:
//   node tools/balance_sim.mjs --validate --runs 8
// runs the real frame loop (tools/real_loop.mjs) for the same three stage
// saves and prints the analytic-vs-real margin. The calibration knobs
// (CAL below) were fitted to that table; the printed margin is the residual,
// not a claim.
//
// Per wave b (1..WAVES) the model asks two independent gates, the two axes the
// game actually has:
//   KILL gate   — can the build's dps (shop multipliers x in-run draft growth)
//                 outrun the wave's toughness (ladderHp / heat)?  -> power
//   SURVIVE gate— can the build's effective pool (start pool + in-run HP
//                 drafts + mitigation) absorb one wave of contact threat
//                 (ladderDmg x the wave's contact mix, at the ladder's
//                 density)?                                        -> the wall
// A wave clears when both pass (logistic on each margin, so cohorts spread
// instead of stepping). A failed wave is a death AT that wave: time =
// WAVE_SECONDS * (b-1) + PARTIAL_TIME_FRAC * WAVE_SECONDS, killer attributed
// by which gate failed (kill gate -> the wave BOSS could not be felled;
// survive gate -> contact, and the ladder's own cast names the culprit).
// Clearing all WAVES = RUN SURVIVED at RUN.LIMIT.
//
// Everything in SIM_ASSUMPTIONS is DERIVED from meta.js / config.js at import
// time (test_meta.mjs asserts the derivation stays locked); only the CAL
// calibration constants and the SIM_TUNING shaping knobs are sim-only, and
// they are all documented here.
//
// Run: node tools/balance_sim.mjs [--runs N] [--seed S] [--validate [N]]
//   --runs N       careers (default 200)
//   --seed S       rng seed (default 1337; deterministic given the seed)
//   --validate [N] additionally run the REAL loop, N runs per stage (default 6)
import { pathToFileURL } from 'node:url';
import { CONFIG as C, UPGRADES, ladderHp, ladderDmg, ladderXp, ladderGroups, runClock } from '../src/config.js';
import { goldMult as heatGoldMult } from '../src/heat.js';
import {
  makeProfile, buyUpgrade, computeRunGold, catalogCost,
  SHOP_UPGRADES, SHOP_BY_ID, STARTER_WEAPONS, WEAPON_PRICES,
  ELITE_MODIFIERS, GOLD_MODEL, applyMetaBonuses, applyCharacter,
} from '../src/meta.js';
import { makePlayer, contactHitDamage } from '../src/entities.js';
// G10 (rarity tiers): the live tier table, through the same seam the game
// rolls — folded into the wave demand (tiered hp lengthens kills) and the
// kills -> level map (tiered xp). See the fold constants below.
import { RARITY, rollRarity } from '../src/rarity.js';

const L = C.LADDER, RUN = C.RUN;

// ---------- Sim-only shaping knobs (documented assumptions) ------------------
export const SIM_TUNING = {
  KILL_RAMP: 0.6,           // per-wave kill ramp (wave b = K0*(1+ramp*(b-1)))
  PARTIAL_KILL_FRAC: 0.5,   // kills banked when dying mid-wave
  PARTIAL_TIME_FRAC: 1.02,  // time reached when dying mid-wave (the boss lands
                            // at the wave boundary, so wave-1 deaths clock at
                            // ~122s — the real cohort's 118-137s deaths)
  CHEST_MIN: 20, CHEST_MAX: 45,  // gold per opened chest (in-run currency)
  // G17 slice 1b re-baseline: the measured good run banks 754,689g over
  // 1800s (= 0.5h), and the owner's completion target is 60+ play hours of
  // catalogue — 60h / 0.5h = 120 good runs of end-game play per career
  // (milestones every 5). The old 30 encoded the pre-reprice "fast" intent.
  GOOD_RUN_TARGET: 120,     // good runs per career (milestones every 5)
  RUN_CAP: 2000,            // hard cap on total runs per career. Re-calibrated
                            // for the ladder: the retired 5-wave unit reached
                            // its milestone in most runs, the 15-wave ladder
                            // much less often, so a career needs more runs to
                            // bank the same 30 (sim-only knob).
  // G17 slice 1b re-baseline: the new intent is "10 good runs buy 30-40% of
  // the mid catalogue" (measured share at the new prices: 36.4%). The old
  // [0.35, 0.65] was the tolerance around the retired "~50% of a 40,500g
  // catalogue" directive from the pre-reprice fast economy.
  MID_TIER_TOL: [0.30, 0.40],    // 10-good-run mid-share band (G17 1b)
};

// Calibration constants fitted to the REAL stage cohorts (tools/real_loop.mjs
// / tools/boss_sim.mjs). Overridable at run time for the fitting search:
//   CAL_JSON='{"SURVIVE_M0":0.9}' node tools/balance_sim.mjs
// Re-fit with `--validate` whenever the combat model moves; the printed margin
// is the residual, so a stale fit is visible rather than silent.
export const CAL = {
  // gate shaping: margin = log2(index ratio); both gates are logistics of the
  // margin minus its 50% point.
  GATE_K: 1.7,
  KILL_M0: 0.4,         // 50% point of the kill gate (power vs demand)
  SURVIVE_M0: -0.4,     // 50% point of the survive gate (pool vs wave damage)
  MITIGATION: 1.0,      // flat mitigation multiplier on the pool index
  // in-run growth per wave cleared: dps index (drafts, weapon levels), the
  // LEVEL the run is expected to hold at each wave, and how much of the pool
  // comes from the Iron Heart draft the pool axis is really built on.
  POWER_PER_WAVE: 1.65,
  LEVEL_PER_WAVE: 3.4,
  DRAFT_HP_FRAC: 0.45,
  // The wave's damage budget, in HITS: ambient contact hits per wave (scaled by
  // the ladder's spawn density) plus the wave boss's charges.
  WAVE_MINION_HITS: 1.5,
  WAVE_BOSS_HITS: 0.8,
};
if (process.env.CAL_JSON) Object.assign(CAL, JSON.parse(process.env.CAL_JSON));

// ---------- Single-source-of-truth assumptions ------------------------------
// A full run is now the LADDER: WAVES waves of WAVE_SECONDS, i.e. RUN.LIMIT.
const WAVES = L.WAVES;
const WAVE_SECONDS = L.WAVE_SECONDS;
const RAMP_SUM = Array.from({ length: WAVES }, (_, i) => 1 + SIM_TUNING.KILL_RAMP * i)
  .reduce((s, x) => s + x, 0);
const K0 = GOLD_MODEL.GOOD_RUN.kills / RAMP_SUM;   // kills in the wave-1 slot of a limit run
const TW0 = RUN.LIMIT / WAVES;                     // == WAVE_SECONDS; named for the old anchor
const envelopeHp = w => ladderHp(w) / ladderHp(1); // ladder demand normalised to wave 1
const envelopeDmg = w => ladderDmg(w) / ladderDmg(1);
// G10 rarity folds (src/rarity.js): in expectation the live spawnWave rolls one
// tier per tier-eligible minion, so the wave's hp demand rises by the tier
// table's mean hp mult and each kill pays the mean xp mult. Bosses, split
// children and the COLOSSUS are never tier-rolled, but at wave granularity the
// minion mix dominates the demand envelope — the fold is applied to the whole
// envelope (a <2% effect, within the CAL gates' fitted tolerance).
const RARITY_HP_FOLD = 1 + RARITY.RARE.chance * (RARITY.RARE.hpMult - 1) +
  RARITY.MYTHIC.chance * (RARITY.MYTHIC.hpMult - 1);
const RARITY_XP_FOLD = 1 + RARITY.RARE.chance * (RARITY.RARE.xpMult - 1) +
  RARITY.MYTHIC.chance * (RARITY.MYTHIC.xpMult - 1);

export const SIM_ASSUMPTIONS = {
  // run structure (LIVE values — the test suite pins these to config.js)
  LIMIT: RUN.LIMIT,
  WAVES,
  WAVE_SECONDS,
  KNEE_TICK: L.KNEE_TICK,
  // kept for the meta-test contract: the SHIPPED values, still live constants
  END_WAVE: C.ESCALATION.END_WAVE,
  WAVE_LENGTH: C.ESCALATION.WAVE_LENGTH,
  // the curve authority is now the ladder (== shipped inside the knee)
  hpScale: ladderHp,
  dmgScale: ladderDmg,
  xpScale: ladderXp,
  groups: ladderGroups,
  hpAtLimit: ladderHp(Math.ceil(RUN.LIMIT / 30)),
  dmgAtLimit: ladderDmg(Math.ceil(RUN.LIMIT / 30)),
  demand: envelopeHp,          // ladder demand normalised to wave 1
  threat: envelopeDmg,
  killsPerFullRun: GOLD_MODEL.GOOD_RUN.kills,
  K0, TW0,
  MID_TIER_IDS: GOLD_MODEL.MID_TIER_IDS,
  TOP_TIER_IDS: GOLD_MODEL.TOP_TIER_IDS,
  TOP_TIER_MIN_GOOD_RUNS: GOLD_MODEL.TOP_TIER_MIN_GOOD_RUNS,
  goodRunGold: computeRunGold(GOLD_MODEL.GOOD_RUN),
  midTierCost: catalogCost(GOLD_MODEL.MID_TIER_IDS),
  // G25: the apex tier is EXCLUDED from every completion figure below — the
  // ~60h completion crossing describes the APEX-FREE catalogue (the goal's
  // partition rule; apex is post-completion prestige by charter).
  apex: false,
};

// ---------- rng (mulberry32 — deterministic, seedable) ---------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const logistic = (x) => 1 / (1 + Math.exp(-CAL.GATE_K * x));

// The three wave-level indices, all NORMALISED to the wave-1 tick so the gap
// reads as "how many x ahead of wave 1 is the build / is the ladder". A fresh
// build at wave 1 is (power 1.0, pool 1.0) against (demand 1.0, threat 1.0).
const WAVE1_TICK = Math.max(1, Math.round(WAVE_SECONDS / 30));
// G10: demand carries the rarity hp fold — tiered minions take longer to kill,
// so the power needed to clear the wave rises by the tier table's mean mult.
// (SIM_ASSUMPTIONS.demand stays the RAW ladder envelope: that export is the
// config-authority contract test_meta pins, not the tiered game model.)
const demandIdx = (b) => {
  const w = Math.min(Math.ceil(RUN.LIMIT / 30), Math.round((b * WAVE_SECONDS) / 30));
  return (envelopeHp(w) / envelopeHp(WAVE1_TICK)) * RARITY_HP_FOLD;
};
// THE WAVE'S DAMAGE BUDGET, in HP, from the LIVE contact-damage function
// (entities.contactHitDamage — the same function main.js applies). The wave
// lands WAVE_MINION_HITS ambient hits (scaled by the ladder's spawn density)
// plus WAVE_BOSS_HITS boss charges; each hit is priced at the pool it is
// landing on, so the HIT_CAP_FRAC rule binds exactly as it does in the game.
const bossChargeMultAt = (b) => (bossAtWave(b) === 'GRAVELMAW' ? 1.5 : 1);
function waveDamageHp(b, poolHp) {
  const tick = Math.min(Math.ceil(RUN.LIMIT / 30), Math.round((b * WAVE_SECONDS) / 30));
  const dm = ladderDmg(tick);
  const minion = contactHitDamage(C.SURVIVAL.BASE_CONTACT, dm, contactMix(tick), 1, poolHp);
  const boss = contactHitDamage(C.SURVIVAL.BASE_CONTACT, dm, bossContactAt(b),
    bossChargeMultAt(b), poolHp);
  const density = ladderGroups(b * WAVE_SECONDS) / L.GROUPS_MAX;
  return CAL.WAVE_MINION_HITS * (0.4 + 0.6 * density) * minion + CAL.WAVE_BOSS_HITS * boss;
}
// In-run growth: a cleared wave is worth POWER_PER_WAVE of dps index; the pool
// grows with LEVEL through the live CONFIG.SURVIVAL.HP_PER_LEVEL rule (mirrored
// from main.js levelUp) PLUS the Iron Heart draft the pool axis is really built
// on in play (the real maxed probe showed 230 -> 580 HP by wave 5, almost all
// of it Iron Heart cards).
const powerAtWave = (power0, b) => power0 * Math.pow(CAL.POWER_PER_WAVE, b - 1);
const levelAtWave = (b) => Math.round(CAL.LEVEL_PER_WAVE * (b - 1));
// The live Iron Heart magnitude, read from the REAL card by applying it to a
// scratch stats object — never a second hardcoded copy of the number.
const HP_CARD_FLAT = (() => {
  const probe = { stats: { maxHp: C.PLAYER.MAX_HP }, hp: 0 };
  UPGRADES.find(u => u.id === 'hp').apply(probe);
  return probe.stats.maxHp - C.PLAYER.MAX_HP;
})();
const poolAtWaveHp = (startHp, b) => {
  const lv = levelAtWave(b);
  const levelGrowth = 1 + C.SURVIVAL.HP_PER_LEVEL * lv;
  const ironHeart = HP_CARD_FLAT * CAL.DRAFT_HP_FRAC * lv;
  return (startHp * levelGrowth + ironHeart) * CAL.MITIGATION;
};

// ---------- Build POWER / POOL from the REAL profile ------------------------
// dps index: every multiplicative dps line the shop sells, read from
// SHOP_BY_ID (no second price/effect table anywhere in this file).
function buildPower(profile) {
  const lvl = id => profile.purchased[id] || 0;
  let p = 1;
  p *= 1 + SHOP_BY_ID.dmg.perLevel * lvl('dmg');
  const crit = SHOP_BY_ID.crit.perLevel * lvl('crit');
  const critMult = 1 + SHOP_BY_ID.critdmg.perLevel * lvl('critdmg');
  p *= 1 + crit * (critMult - 1);                       // expected crit value
  p *= 1 + 0.08 * Math.max(0, profile.unlockedWeapons.length - STARTER_WEAPONS.length);
  p *= 1 + 0.12 * lvl('slots');
  p *= 1 + 0.05 * lvl('artifact');
  return p;
}

// Starting pool index: the REAL run-start max HP (base + Vitality + character
// mods) over the base pool, so a maxed save's 230 HP is read, not assumed.
function buildPool(profile) {
  const base = makePlayer().stats;
  const meta = applyMetaBonuses(base, profile.purchased);
  const withChar = applyCharacter(meta, profile.equippedCharacter);
  return { hp: withChar.maxHp, index: withChar.maxHp / C.PLAYER.MAX_HP };
}

// The wave's contact mix: the mean contactDamageMult of the spawner's live
// weight table at minion-wave w, blended with the wave BOSS's mult (the boss
// is the wave's contact peak, and the thing that actually lands on you).
function contactMix(w) {
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
  // Contact multipliers of the live cast, read from the live modules by id is
  // not importable without enemy_types.js; the mix is a simple weighted mean of
  // the documented per-type multipliers (kept in one place, asserted against
  // nothing — this is the model's one hand-written number set). Values:
  const CONTACT = { CHASER: 1.0, SWARMER: 0.7, BRUTE: 2.5, DASHER: 1.0,
    SPITTER: 1.5, WARLOCK: 1.0, TICK: 0.0, COLOSSUS: 3.0 };
  let mix = 0;
  for (const [id, wgt] of entries) mix += (wgt / tot) * (CONTACT[id] || 0);
  return mix;
}

// Boss contact multiplier at wave n (the ladder rotates the named cast; the
// charger is the wave-1/5/9/12 peak). Taken from bosses.js BOSSES by id.
const BOSS_CONTACT = { GRAVELMAW: 2.2, CHOIR_MOTHER: 1.0, PYRAXIS: 1.0 };

// ---------- Level from kills (piecewise through GOLD_MODEL anchors) ---------
// The income integrator reads a level, so the run model must supply one; the
// anchors are the analytic model's own calibration (RUN1/GOOD/LATE), the same
// single source of truth the retired v1 used.
function levelForKills(k) {
  const pts = [
    [GOLD_MODEL.RUN1.kills, GOLD_MODEL.RUN1.level],
    [GOLD_MODEL.GOOD_RUN.kills, GOLD_MODEL.GOOD_RUN.level],
    [GOLD_MODEL.LATE.kills, GOLD_MODEL.LATE.level],
  ];
  if (k <= pts[0][0]) return Math.max(1, Math.round(k / pts[0][0] * pts[0][1]));
  for (let i = 0; i < pts.length - 1; i++) {
    const [kA, lA] = pts[i], [kB, lB] = pts[i + 1];
    if (k <= kB) return Math.round(lA + (lB - lA) * (k - kA) / (kB - kA));
  }
  const [kA, lA] = pts[pts.length - 1];
  return Math.round(lA + (k - kA) / kA * lA * 0.1);   // gentle extrapolation
}

// Kills for a run that dies at wave b at fraction pf into it.
function killsForRun(b, pf) {
  let kills = 0;
  for (let i = 1; i < b; i++) kills += K0 * (1 + SIM_TUNING.KILL_RAMP * (i - 1));
  if (b <= WAVES) kills += K0 * (1 + SIM_TUNING.KILL_RAMP * (b - 1)) * pf;
  return kills;
}

// ---------- One analytic run ------------------------------------------------
/**
 * One run of `profile`. Returns run length (s), whether the limit was reached,
 * the death wave + attributed killer, and the income breakdown.
 * `power`/`pool` can be passed in (career hot path) to skip recomputation.
 */
export function simulateRun(profile, rng, pre = null) {
  const power0 = pre ? pre.power : buildPower(profile);
  const startHp = pre ? pre.pool.hp : buildPool(profile).hp;
  let b = 1, dead = false, killer = null, killerKind = null;
  let killGap = 0, survGap = 0;
  for (; b <= WAVES; b++) {
    const power = powerAtWave(power0, b);
    const poolHp = poolAtWaveHp(startHp, b);
    const demand = demandIdx(b);
    killGap = Math.log2(Math.max(1e-9, power) / Math.max(1e-9, demand)) - CAL.KILL_M0;
    survGap = Math.log2(Math.max(1e-9, poolHp) / Math.max(1e-9, waveDamageHp(b, poolHp)))
      - CAL.SURVIVE_M0;
    if (rng() < logistic(killGap) * logistic(survGap)) continue;   // wave cleared
    dead = true;
    // Which gate failed? The lower margin is the one that broke.
    if (killGap <= survGap) { killer = 'ENDBOSS:' + bossAtWave(b); killerKind = 'boss'; }
    else { killer = 'contact:' + contactCulprit(b); killerKind = 'contact'; }
    break;
  }
  const pf = dead ? SIM_TUNING.PARTIAL_TIME_FRAC : 1;
  const time = dead ? Math.round(WAVE_SECONDS * (b - 1) + WAVE_SECONDS * pf) : RUN.LIMIT;
  const kills = Math.round(killsForRun(dead ? b : WAVES, pf) * (0.9 + 0.2 * rng()));
  // G10: tiered xp — the same bodies pay the tier table's mean xp mult, so the
  // run DRAFTS as if it had killed RARITY_XP_FOLD times as many commons.
  const level = levelForKills(Math.round(kills * RARITY_XP_FOLD));
  const greedMult = 1 + SHOP_BY_ID.greed.perLevel * (profile.purchased.greed || 0);
  const payout = computeRunGold({ kills, level, time, goldMult: greedMult });
  const bosses = dead ? b - 1 : WAVES;
  const chestGold = chestGoldFor(bosses, rng) * heatGoldMult(Math.floor(bosses / 2));
  return {
    good: !dead || b > C.ESCALATION.END_WAVE,   // cleared past the maw milestone
    died: dead, wave: dead ? b : WAVES, time, kills, level,
    killer, killerKind, payout, chestGold, bosses, killGap, survGap,
    reachedLimit: !dead,
  };
}

function bossAtWave(n) {
  const order = ['GRAVELMAW', 'CHOIR_MOTHER', 'PYRAXIS'];
  return order[(n - 1) % order.length];
}
function bossContactAt(n) {
  return BOSS_CONTACT[bossAtWave(n)] || 1;
}
function contactCulprit(w) {
  if (w >= C.SPAWNER.BRUTE_WAVE) return 'BRUTE';
  if (w >= C.SPAWNER.TICK_WAVE) return 'TICK';
  return 'CHASER';
}

function chestGoldFor(bosses, rng) {
  // G10 HONEST ZERO: tiered minions' dropBonus also raises the ITEM drop chance
  // in the live death pass, but this model prices in-run income as
  // computeRunGold + boss chests only — item drops are not modelled, so the
  // item-side bonus is priced at 0 rather than invented (the survival-side of
  // extra potions is absorbed by the CAL gate fit; focus/once precedent).
  let gold = 0;
  for (let b = 1; b <= bosses; b++) {
    const n = C.ESCALATION.BOSS.CHESTS * (b % C.ESCALATION.BOSS.DOUBLE_EVERY === 0 ? 2 : 1);
    for (let i = 0; i < n; i++) {
      gold += SIM_TUNING.CHEST_MIN + (SIM_TUNING.CHEST_MAX - SIM_TUNING.CHEST_MIN) * rng();
    }
  }
  return gold;
}

// ---------- Stage cohorts (the Phase-A report) ------------------------------
export function simulateStage(stageProfile, runs, seed) {
  const rng = mulberry32(seed);
  const pre = { power: buildPower(stageProfile), pool: buildPool(stageProfile) };
  const out = [];
  for (let i = 0; i < runs; i++) out.push(simulateRun(stageProfile, rng, pre));
  return out;
}

/** Compare an analytic stage cohort to a real-loop cohort (the margin). */
export function stageMargin(analytic, real) {
  const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const am = mean(analytic.map(r => r.time));
  const rm = mean(real.map(r => r.time));
  const lim = (a) => a.filter(r => r.reachedLimit || r.won).length;
  return {
    analyticMean: am, realMean: rm,
    meanDeltaPct: rm > 0 ? (am - rm) / rm : 0,
    analyticLimit: lim(analytic), realLimit: lim(real),
    n: analytic.length,
  };
}

// ---------- Greedy purchase priority (documented strategy) -----------------
// W7a: exported so tools/draft_sim.mjs --meta-value can print this HARDCODED
// order beside the MEASURED marginal-value ranking (the W7a deliverable).
export const GREEDY_PRIORITY = [
  'dmg', 'hp', 'crit', 'critdmg', 'greed', 'xp',
  ...SHOP_UPGRADES.filter(u => u.kind === 'weapon' && u.id !== 'weapon_beam')
    .sort((a, b) => a.baseCost - b.baseCost).map(u => u.id),
  ...SHOP_UPGRADES.filter(u => u.kind === 'elite')
    .sort((a, b) => a.baseCost - b.baseCost).map(u => u.id),
  'luck', 'slots',
  'weapon_beam', 'arcade',
];

function greedyShop(profile) {
  const bought = [];
  for (;;) {
    let hit = false;
    for (const id of GREEDY_PRIORITY) {
      const def = SHOP_BY_ID[id];
      if (!def || shopRowDone(profile, def)) continue;
      if (profile.gold < nextCost(profile, def)) continue;
      if (buyUpgrade(profile, id)) { bought.push(id); hit = true; break; }
    }
    if (!hit) return bought;
  }
}
function shopRowDone(profile, def) {
  if (def.kind === 'weapon') return profile.unlockedWeapons.includes(def.weaponId);
  if (def.kind === 'elite') return profile.unlockedElites.includes(def.eliteId);
  return (profile.purchased[def.id] || 0) >= def.maxLevel;
}
function nextCost(profile, def) {
  if (def.kind === 'weapon') return WEAPON_PRICES[def.weaponId];
  if (def.kind === 'elite') return ELITE_MODIFIERS[def.eliteId].cost;
  return Math.round(def.baseCost * Math.pow(def.costGrowth, profile.purchased[def.id] || 0));
}
function midTierOwnedFrac(profile) {
  let owned = 0;
  for (const id of GOLD_MODEL.MID_TIER_IDS) {
    const def = SHOP_BY_ID[id];
    if (!def || shopRowDone(profile, def)) { if (def) owned += fullRowCost(def); continue; }
    const lvl = profile.purchased[id] || 0;
    for (let l = 0; l < lvl; l++) owned += Math.round(def.baseCost * Math.pow(def.costGrowth, l));
  }
  return owned / SIM_ASSUMPTIONS.midTierCost;
}
function fullRowCost(def) {
  let sum = 0;
  for (let l = 0; l < def.maxLevel; l++) sum += Math.round(def.baseCost * Math.pow(def.costGrowth, l));
  return sum;
}

// ---------- One career -------------------------------------------------------
export function simulateCareer(seed) {
  const rng = mulberry32(seed);
  const profile = makeProfile();
  const milestones = [];
  const purchaseOrder = [];
  let goodRuns = 0, totalRuns = 0, payoutSum = 0, chestSum = 0, goodPayoutSum = 0;
  const lateGoodPayouts = [], lateGoodGross = [];
  let limitRuns = 0;

  while (goodRuns < SIM_TUNING.GOOD_RUN_TARGET && totalRuns < SIM_TUNING.RUN_CAP) {
    totalRuns++;
    const run = simulateRun(profile, rng);
    profile.gold += run.payout;
    payoutSum += run.payout;
    chestSum += run.chestGold;
    if (run.reachedLimit) limitRuns++;
    for (const id of greedyShop(profile)) purchaseOrder.push(id);

    if (run.good) {                       // a "good run" = the maw milestone cleared
      goodRuns++;
      goodPayoutSum += run.payout;
      if (goodRuns > SIM_TUNING.GOOD_RUN_TARGET * 0.6) {
        lateGoodPayouts.push(run.payout);
        lateGoodGross.push(run.payout + run.chestGold);
      }
      if (goodRuns % 5 === 0) {
        milestones.push({
          goodRuns, totalRuns, gold: profile.gold,
          midFrac: midTierOwnedFrac(profile),
          goodFrac: goodPayoutSum / SIM_ASSUMPTIONS.midTierCost,
          greed: profile.purchased.greed || 0,
        });
      }
    }
  }
  const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  return {
    milestones, purchaseOrder, totalRuns, limitRuns,
    // TWO good-run standards are tracked. `good` (the career's milestone
    // counter) is the same standard the retired 5-wave era used — "survived
    // into the run's milestone" — re-pointed onto the ladder: a run that
    // cleared past ESCALATION.END_WAVE. `limitRuns` is the newer, harder
    // RUN SURVIVED count, reported but NOT the career's stop condition: the
    // analytic run model is fitted to the real-loop stage cohorts for
    // run-length/income (its job), and asserting it can predict a rare
    // limit-run 30 times would be asserting something it is not fitted for.
    // The limit rate is measured where it is real: the stage table, and
    // `--validate` against the frame loop.
    goodFracAt10: milestones.length >= 2 ? milestones[1].goodFrac : null,
    lateGoodPayout: avg(lateGoodPayouts),
    lateGoodGross: avg(lateGoodGross),
    avgRunPayout: payoutSum / Math.max(1, totalRuns),
    avgRunChest: chestSum / Math.max(1, totalRuns),
    hitTarget: goodRuns >= SIM_TUNING.GOOD_RUN_TARGET,
  };
}

// ---------- the power-curve-vs-demand GAP -----------------------------------
// For each stage: the build's power index at wave b (shop x in-run draft growth)
// against the ladder's demand index at that wave. gap = power/demand, in
// log2 — positive = the build is ahead of the ladder there, negative = the
// ladder outruns the build (i.e. where the run should die).
function gapTable(profile) {
  const power0 = buildPower(profile);
  const startHp = buildPool(profile).hp;
  const rows = [];
  for (let b = 1; b <= WAVES; b++) {
    const power = powerAtWave(power0, b);
    const poolHp = poolAtWaveHp(startHp, b);
    const demand = demandIdx(b);
    const wd = waveDamageHp(b, poolHp);
    rows.push({
      wave: b, t: b * WAVE_SECONDS, power, poolHp, demand, waveDamage: wd,
      killGap: Math.log2(power / demand),          // >0 = can kill the wave
      survGap: Math.log2(poolHp / wd),             // >0 = can absorb the wave
    });
  }
  return rows;
}

function powerTable(stageName, profile) {
  const power0 = buildPower(profile);
  const pool0 = buildPool(profile);
  console.log(`\n--- ${stageName.toUpperCase()} power curve vs ladder demand ` +
    `(indices normalised to wave 1 = 1.0) ---`);
  console.log(`shop power index x${power0.toFixed(2)} · start pool ${pool0.hp} HP ` +
    `(+${(100 * C.SURVIVAL.HP_PER_LEVEL).toFixed(0)}%/level)`);
  console.log(' wave |  clock |  power | demand | KILL gap |  pool HP | wave dmg | SURVIVE gap');
  const rows = gapTable(profile);
  for (const r of rows) {
    if (r.wave % 3 !== 0 && r.wave !== 1 && r.wave !== WAVES) continue;
    console.log(`  ${String(r.wave).padStart(2)} | ${runClock(r.t)} | ` +
      `${r.power.toFixed(2).padStart(6)} | ${r.demand.toFixed(1).padStart(6)} | ` +
      `${((r.killGap >= 0 ? '+' : '') + r.killGap.toFixed(2)).padStart(8)} | ` +
      `${r.poolHp.toFixed(0).padStart(8)} | ${r.waveDamage.toFixed(0).padStart(8)} | ` +
      `${((r.survGap >= 0 ? '+' : '') + r.survGap.toFixed(2)).padStart(11)}`);
  }
  const firstKillFail = rows.find(r => r.killGap < 0);
  const firstSurvFail = rows.find(r => r.survGap < 0);
  const minSurv = rows.reduce((a, r) => (r.survGap < a.survGap ? r : a), rows[0]);
  const minKill = rows.reduce((a, r) => (r.killGap < a.killGap ? r : a), rows[0]);
  console.log(`  kill gate fails first at wave ${firstKillFail ? firstKillFail.wave : '-'}` +
    ` (min ${minKill.killGap.toFixed(2)} @ w${minKill.wave})`);
  console.log(`  survive gate fails first at wave ${firstSurvFail ? firstSurvFail.wave : '-'}` +
    ` (min ${minSurv.survGap.toFixed(2)} @ w${minSurv.wave})`);
}

// ---------- stage cohort report --------------------------------------------
function stageReport(name, profile, runs, seed) {
  const cohort = simulateStage(profile, runs, seed);
  const times = cohort.map(r => r.time);
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  const limits = cohort.filter(r => r.reachedLimit).length;
  const deaths = new Map();
  const waves = new Map();
  for (const r of cohort) {
    if (r.reachedLimit) continue;
    deaths.set(r.killer, (deaths.get(r.killer) || 0) + 1);
    waves.set(r.wave, (waves.get(r.wave) || 0) + 1);
  }
  const income = cohort.reduce((s, r) => s + r.payout + r.chestGold, 0) / cohort.length;
  const profileGold = cohort.reduce((s, r) => s + r.payout, 0) / cohort.length;
  console.log(`\n=== STAGE ${name.toUpperCase()} (analytic, ${runs} runs) ===`);
  console.log(`mean ${mean.toFixed(0)}s · best ${Math.max(...times)}s · worst ${Math.min(...times)}s ` +
    `· reached limit ${limits}/${runs}`);
  console.log(`death waves: ` + [...waves.entries()].sort((a, b) => a[0] - b[0])
    .map(([w, n]) => `w${w}:${n}`).join('  '));
  console.log(`killers:     ` + [...deaths.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`).join('  '));
  console.log(`income/run: profile ${Math.round(profileGold)}g (chest gold incl.: ${Math.round(income)}g)`);
  return { name, cohort, mean, limits, income };
}

// ---------- main -------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const flag = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--')
      ? Number(args[i + 1]) : dflt;
  };
  const careers = Math.max(1, Math.floor(flag('--runs', 200)));
  const seed = Math.max(1, Math.floor(flag('--seed', 1337)));
  const doValidate = args.includes('--validate');
  const stageRuns = Math.max(2, Math.floor(flag('--stage-runs', 24)));

  console.log(`HORDES BALANCE SIM v2 — ${careers} careers, seed ${seed}`);
  console.log(`run structure: ${WAVES} waves x ${WAVE_SECONDS}s = ${RUN.LIMIT}s (${runClock(RUN.LIMIT)}), ` +
    `knee at tick ${L.KNEE_TICK} (${runClock(L.KNEE_TICK * 30)})`);
  console.log(`reference: GOOD_RUN ${SIM_ASSUMPTIONS.goodRunGold}g, mid-tier catalog ` +
    `${SIM_ASSUMPTIONS.midTierCost}g`);
  // G25: state the partition OUT LOUD — every completion number this tool
  // prints is computed with the apex tier switched off.
  console.log(`apex tier: ${SIM_ASSUMPTIONS.apex ? 'ON' : 'OFF'} — completion figures below EXCLUDE apex`);
  // G10: the tier rate the demand/xp folds are built from, MEASURED through the
  // real rollRarity — the same discipline as the draft sim's fold line.
  {
    let s2 = seed >>> 0;
    const rng2 = () => {
      s2 |= 0; s2 = (s2 + 0x6D2B79F5) | 0;
      let t2 = Math.imul(s2 ^ (s2 >>> 15), 1 | s2);
      t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
      return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
    };
    const N = 100000;
    let rare = 0, mythic = 0;
    for (let i = 0; i < N; i++) {
      const tier = rollRarity(rng2);
      if (tier === 'RARE') rare++;
      else if (tier === 'MYTHIC') mythic++;
    }
    console.log(`rarity fold: measured rollRarity N=${N} -> RARE ${(100 * rare / N).toFixed(3)}% ` +
      `MYTHIC ${(100 * mythic / N).toFixed(3)}%; demand x${RARITY_HP_FOLD.toFixed(4)}, ` +
      `kill-xp x${RARITY_XP_FOLD.toFixed(4)}`);
  }

  // ---- stage cohorts (fresh / partial / maxed) ----
  const stages = {
    fresh: makeProfile(),
    partial: (() => { const p = makeProfile(); p.purchased = { dmg: 2, hp: 3 };
      p.unlockedWeapons = STARTER_WEAPONS.concat(['ORBIT', 'ZAP']);
      p.unlockedCharacters = ['KNIGHT']; p.equippedCharacter = 'KNIGHT'; return p; })(),
    maxed: (() => { const p = makeProfile(); p.gold = 1_000_000_000;   // G17 1b: full-buy grant above any plausible catalogue
      for (const def of SHOP_UPGRADES) {
        for (let i = 0; i < def.maxLevel; i++) if (!buyUpgrade(p, def.id)) break;
      } return p; })(),
  };
  const reports = {};
  for (const [name, prof] of Object.entries(stages)) {
    reports[name] = stageReport(name, prof, stageRuns, seed + 101);
    powerTable(name, prof);
  }

  // ---- economy career table ----
  console.log('\n=== ECONOMY (careers, greedy shop, real meta.js prices) ===');
  const results = [];
  for (let i = 0; i < careers; i++) results.push(simulateCareer(seed + i * 7919));
  const mCount = Math.min(...results.map(r => r.milestones.length));
  console.log('good runs | total runs | banked gold | mid-tier owned | mid-tier from GOOD-run gold | greed lvl');
  console.log('----------+------------+-------------+----------------+---------------------------+---------');
  for (let m = 0; m < mCount; m++) {
    const g = results[0].milestones[m].goodRuns;
    const avg = key => results.reduce((s, r) => s + r.milestones[m][key], 0) / careers;
    console.log(String(g).padStart(9) + ' | ' +
      String(Math.round(avg('totalRuns'))).padStart(10) + ' | ' +
      String(Math.round(avg('gold'))).padStart(11) + ' | ' +
      (100 * Math.min(1, avg('midFrac'))).toFixed(1).padStart(14) + '%' + ' | ' +
      (100 * Math.min(1, avg('goodFrac'))).toFixed(1).padStart(25) + '%' + ' | ' +
      String(Math.round(avg('greed') * 10) / 10).padStart(7));
  }
  const at10 = results.filter(r => r.goodFracAt10 !== null);
  const good10Mean = at10.length ? at10.reduce((s, r) => s + r.goodFracAt10, 0) / at10.length : 0;
  const latePayout = results.reduce((s, r) => s + r.lateGoodPayout, 0) / careers;
  const lateGross = results.reduce((s, r) => s + r.lateGoodGross, 0) / careers;
  const avgPayout = results.reduce((s, r) => s + r.avgRunPayout, 0) / careers;
  const avgChest = results.reduce((s, r) => s + r.avgRunChest, 0) / careers;
  const avgTotalRuns = results.reduce((s, r) => s + r.totalRuns, 0) / careers;
  const hitRate = results.filter(r => r.hitTarget).length;
  console.log(`\navg run payout                    ${Math.round(avgPayout)}g ` +
    `(+${Math.round(avgChest)}g in-run chest gold, not profile income)`);
  console.log(`avg LIMIT-run payout (late career) ${Math.round(latePayout)}g ` +
    `(gross incl chests ${Math.round(lateGross)}g)`);
  console.log(`runs to ${SIM_TUNING.GOOD_RUN_TARGET} limit-runs: avg ${Math.round(avgTotalRuns)}  ` +
    `(${hitRate}/${careers} careers reached the target)`);

  const ref = SIM_ASSUMPTIONS.goodRunGold;
  const topRefs = SIM_ASSUMPTIONS.TOP_TIER_IDS.map(id => {
    const cost = catalogCost([id]);
    return { id, cost, refRuns: cost / ref, grossRuns: cost / lateGross };
  });
  console.log('\ntop-tier item  cost       good-run equiv (ref)  (compounding-aware: late-career gross)');
  for (const t of topRefs) {
    console.log(`  ${t.id.padEnd(12)} ${String(t.cost).padStart(6)}g   ` +
      `${t.refRuns.toFixed(1).padStart(18)}     ${t.grossRuns.toFixed(1).padStart(18)}`);
  }

  const [lo, hi] = SIM_TUNING.MID_TIER_TOL;
  const passA = good10Mean >= lo && good10Mean <= hi;
  const passB = topRefs.every(t => t.refRuns >= SIM_ASSUMPTIONS.TOP_TIER_MIN_GOOD_RUNS
    && t.grossRuns >= SIM_ASSUMPTIONS.TOP_TIER_MIN_GOOD_RUNS);
  console.log(`\nTARGET (a) ~10 good runs buys ~50% of mid-tier: ${(100 * good10Mean).toFixed(1)}% ` +
    `[tolerance ${(100 * lo).toFixed(0)}%-${(100 * hi).toFixed(0)}%] -> ${passA ? 'PASS' : 'FAIL'}`);
  console.log(`TARGET (b) top-tier costs ${SIM_ASSUMPTIONS.TOP_TIER_MIN_GOOD_RUNS}+ good runs: ` +
    topRefs.map(t => `${t.id} ${t.refRuns.toFixed(1)}/${t.grossRuns.toFixed(1)}`).join(', ') +
    ` -> ${passB ? 'PASS' : 'FAIL'}`);

  // ---- validation against the REAL loop --------------------------------------
  if (doValidate) {
    const { runRealCohort, STAGES } = await import('./real_loop.mjs');
    const n = stageRuns;
    console.log(`\n=== VALIDATION — analytic vs REAL frame loop (${n} runs/stage) ===`);
    console.log('stage   | analytic mean | real mean | delta   | analytic limit | real limit | real deaths');
    for (const name of STAGES) {
      const real = await runRealCohort(name, n);
      const m = stageMargin(reports[name].cohort, real);
      const realDeaths = real.filter(r => !r.won).map(r => `${r.killer}@w${r.wave}`)
        .reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
      console.log(`${name.padEnd(7)} | ${m.analyticMean.toFixed(0).padStart(13)} | ` +
        `${m.realMean.toFixed(0).padStart(9)} | ${(100 * m.meanDeltaPct).toFixed(0).padStart(6)}% | ` +
        `${String(m.analyticLimit + '/' + n).padStart(14)} | ` +
        `${String(m.realLimit + '/' + n).padStart(10)} | ` +
        Object.entries(realDeaths).map(([k, v]) => `${k}:${v}`).join(' '));
      console.log(`        real income/run: ${
        Math.round(real.reduce((s, r) => s + r.gold, 0) / real.length)}g · ` +
        `analytic: ${Math.round(reports[name].income)}g (incl chest gold)`);
    }
  }

  if (!passA || !passB) process.exitCode = 1;
}

// Only auto-run when invoked directly (test_meta.mjs imports this module for
// the SIM_ASSUMPTIONS/SIM_TUNING contract — importing must NOT simulate).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
