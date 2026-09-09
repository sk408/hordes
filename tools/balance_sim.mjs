// HORDES — WAVE-11 BALANCE SIM: headless Monte-Carlo economy simulator.
// Sk408 directive: "another balancing sim runs for gold per run to shop
// items... account for cumulative impact of upgrades increasing survival as
// well as increasing gold."
//
// Run: node tools/balance_sim.mjs [--runs N] [--seed S]
//   --runs N   number of simulated CAREERS (default 200; each career plays
//              until 30 good runs or 600 total runs)
//   --seed S   rng seed (default 1337; deterministic given the seed)
//
// WHAT IT SIMULATES: each career starts from makeProfile() (fresh) and plays
// run after run. Purchases go through the REAL meta.js code path
// (buyUpgrade/unlockWeapon/unlockElite) with a greedy priority order, so
// prices, ladders, and caps exercised here are the live ones — there is no
// duplicated price table anywhere in this file.
//
// ============================ MODEL ASSUMPTIONS ============================
// Every anchor comes from meta.js GOLD_MODEL or config.js ESCALATION (the
// same constants the game runs on — asserted by test_meta.mjs's SIM SYNC
// block). Sim-only tuning knobs live in SIM_TUNING and are documented here:
//
// RUN STRUCTURE
//   * A run is a sequence of boss waves b = 1..ESCALATION.END_WAVE. Clearing
//     a wave means killing its boss; the wave AFTER the last cleared one is
//     where the run ends. GOOD RUN = surviving into the END_WAVE finale
//     (dying to the maw counts — it is unbeatable this phase).
//   * Difficulty ratio D(b) = hpScale(b) / hpScale(1) using config's live
//     ESCALATION.HP curve (fresh wave b vs wave 1).
//
// SURVIVAL (the compounding Sk408 asked for)
//   * Build power P(purchases) multiplies out the REAL per-level values from
//     SHOP_BY_ID (dmg, crit x critdmg expected-value, +8% per unlocked
//     non-starter weapon, +12% per weapon slot, +5% per artifact level).
//   * HP-ish lines (hp, regen) add a survival MARGIN instead of power.
//   * Per-wave clear probability = logistic(P * margin / D(b)) with knobs
//     LOGI_K / LOGI_M0: M=0.9 is the 50% point, K=3 the steepness. Fresh
//     profiles usually die around wave 2-3 (matches RUN1); built-out builds
//     reach the finale reliably (matches LATE).
//
// KILLS / LEVEL / TIME (calibrated to GOLD_MODEL, not independent numbers)
//   * Wave b yields GOOD_RUN.kills-shaped trash: K0 * (1 + KILL_RAMP*(b-1))
//     where K0 = GOOD_RUN.kills / sum-of-ramp — so a full 5-wave good run
//     totals ~GOOD_RUN.kills (3000) before jitter.
//   * Dying mid-wave banks PARTIAL_KILL_FRAC of that wave's kills and
//     PARTIAL_TIME_FRAC of its duration.
//   * Level is PIECEWISE-LERPED from cumulative kills through the GOLD_MODEL
//     anchors (RUN1 1000->14, GOOD 3000->25, LATE 4800->34) — the XP curve
//     is the analytic model's curve, single source of truth.
//   * Wave duration = (GOOD_RUN.time / END_WAVE) * D(b) / P, clamped to
//     [30, WAVE_LENGTH*0.92]: stronger builds clear faster, escalation
//     drags fights out; a fresh 3-wave run lands near RUN1.time (~200s).
//
// INCOME
//   * Profile gold is credited ONLY via computeRunGold({kills, level, time,
//     goldMult: greed}) — the meta.js integrator contract. Greed levels
//     compound income exactly like the live shop line.
//   * Chest income is modeled for reporting only (in-run currency): each
//     cleared boss wave drops ESCALATION.BOSS.CHESTS chests (x2 bosses on
//     DOUBLE_EVERY waves), worth U(CHEST_MIN, CHEST_MAX) each, multiplied by
//     heat.js goldMult(manuals) where manuals = floor(bosses cleared / 2).
//
// TARGETS CHECKED (must hold in sim AND analytically)
//   (a) ~10 good runs buys ~50% of the mid-tier catalog. Verdict metric:
//       cumulative GOOD-RUN payout (profile gold from good runs alone — the
//       same standard as the analytic test's (catalogCost/2)/goodRun check)
//       divided by mid-tier catalog cost, at the 10-good-run milestone,
//       tolerance [35%, 65%]. The table ALSO prints the cost-weighted OWNED
//       fraction (all income, greedy shopper) — the real-player pace, which
//       runs ahead of the good-run-only standard because average runs pay too.
//   (b) any single top-tier item costs >= GOLD_MODEL.TOP_TIER_MIN_GOOD_RUNS
//       good-run equivalents. The SIM verdict uses the compounding-aware
//       standard Sk408 asked for (cumulative impact): cost divided by the
//       observed late-career good-run GROSS income (payout incl. greed +
//       in-run chest gold). The un-compounded reference
//       computeRunGold(GOLD_MODEL.GOOD_RUN) is printed alongside — both must
//       clear the bar, which is what forces the top-tier prices up.
// ==========================================================================

import { pathToFileURL } from 'node:url';
import { CONFIG as C } from '../src/config.js';
import { goldMult as heatGoldMult } from '../src/heat.js';
import {
  makeProfile, buyUpgrade, computeRunGold, catalogCost,
  SHOP_UPGRADES, SHOP_BY_ID, STARTER_WEAPONS, WEAPON_PRICES,
  ELITE_MODIFIERS, GOLD_MODEL,
} from '../src/meta.js';

// ---------- Sim-only tuning knobs (assumptions, not game constants) --------
export const SIM_TUNING = {
  LOGI_K: 3.0,          // logistic steepness for per-wave survival
  LOGI_M0: 0.9,         // margin ratio at the 50% survival point
  KILL_RAMP: 0.25,      // extra kills per wave index (wave b = K0*(1+ramp*(b-1)))
  PARTIAL_KILL_FRAC: 0.4,   // kills banked when dying mid-wave
  PARTIAL_TIME_FRAC: 0.6,   // time survived when dying mid-wave
  CHEST_MIN: 20, CHEST_MAX: 45,  // gold per opened chest (in-run currency)
  GOOD_RUN_TARGET: 30,  // good runs per career (milestones every 5)
  RUN_CAP: 600,         // hard cap on total runs per career
  MID_TIER_TOL: [0.35, 0.65],  // tolerance around the ~50% directive
};

// ---------- Single-source-of-truth assumptions (asserted by test_meta.mjs) --
// Everything here is DERIVED from meta.js / config.js at import time — the
// test suite asserts the derivation stays locked to those modules.
function hpScaleRaw(w) {
  const { LINEAR, COMPOUND_FROM, COMPOUND } = C.ESCALATION.HP;
  return (1 + LINEAR * w) * Math.pow(COMPOUND, Math.max(0, w - COMPOUND_FROM));
}

const WAVE_COUNT = C.ESCALATION.END_WAVE;
const RAMP_SUM = Array.from({ length: WAVE_COUNT }, (_, i) => 1 + SIM_TUNING.KILL_RAMP * i)
  .reduce((s, x) => s + x, 0);
const K0 = GOLD_MODEL.GOOD_RUN.kills / RAMP_SUM;
const TW0 = GOLD_MODEL.GOOD_RUN.time / WAVE_COUNT;
const D = Array.from({ length: WAVE_COUNT }, (_, i) => hpScaleRaw(i + 1) / hpScaleRaw(1));

export const SIM_ASSUMPTIONS = {
  END_WAVE: C.ESCALATION.END_WAVE,
  WAVE_LENGTH: C.ESCALATION.WAVE_LENGTH,
  hpScale: hpScaleRaw,
  killsPerFullRun: GOLD_MODEL.GOOD_RUN.kills,
  K0, TW0,
  MID_TIER_IDS: GOLD_MODEL.MID_TIER_IDS,
  TOP_TIER_IDS: GOLD_MODEL.TOP_TIER_IDS,
  TOP_TIER_MIN_GOOD_RUNS: GOLD_MODEL.TOP_TIER_MIN_GOOD_RUNS,
  goodRunGold: computeRunGold(GOLD_MODEL.GOOD_RUN),
  midTierCost: catalogCost(GOLD_MODEL.MID_TIER_IDS),
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

// ---------- Build power (reads the REAL purchased/unlock state) ------------
function buildPower(profile) {
  const L = id => profile.purchased[id] || 0;
  let p = 1;
  p *= 1 + SHOP_BY_ID.dmg.perLevel * L('dmg');
  const crit = SHOP_BY_ID.crit.perLevel * L('crit');
  const critMult = 1 + SHOP_BY_ID.critdmg.perLevel * L('critdmg');
  p *= 1 + crit * (critMult - 1);                      // expected crit value
  p *= 1 + 0.08 * Math.max(0, profile.unlockedWeapons.length - STARTER_WEAPONS.length);
  p *= 1 + 0.12 * L('slots');
  p *= 1 + 0.05 * L('artifact');
  const margin = 1 + 0.04 * L('hp') + 0.02 * L('regen');
  return { p, margin };
}

// ---------- Greedy purchase priority (documented strategy) -----------------
// Survival first (dmg/hp keep runs alive), then income lines (crit/greed/xp),
// then coverage (weapons cheap->expensive, elites, luck), slots last. Built
// from the live catalogs so price re-tunes flow through automatically.
const GREEDY_PRIORITY = [
  'dmg', 'hp', 'crit', 'critdmg', 'greed', 'xp',
  ...SHOP_UPGRADES.filter(u => u.kind === 'weapon' && u.id !== 'weapon_beam')
    .sort((a, b) => a.baseCost - b.baseCost).map(u => u.id),
  ...SHOP_UPGRADES.filter(u => u.kind === 'elite')
    .sort((a, b) => a.baseCost - b.baseCost).map(u => u.id),
  'luck', 'slots',
  'weapon_beam', 'arcade',   // top tier last: they must NOT be trivially hit
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

// ---------- Level from kills (piecewise through GOLD_MODEL anchors) --------
function levelForKills(k) {
  const pts = [
    [GOLD_MODEL.RUN1.kills, GOLD_MODEL.RUN1.level],
    [GOLD_MODEL.GOOD_RUN.kills, GOLD_MODEL.GOOD_RUN.level],
    [GOLD_MODEL.LATE.kills, GOLD_MODEL.LATE.level],
  ];
  if (k <= pts[0][0]) {
    return Math.max(1, Math.round(k / pts[0][0] * pts[0][1]));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [kA, lA] = pts[i], [kB, lB] = pts[i + 1];
    if (k <= kB) return Math.round(lA + (lB - lA) * (k - kA) / (kB - kA));
  }
  const [kA, lA] = pts[pts.length - 1];
  return Math.round(lA + (k - kA) / kA * lA * 0.1);   // gentle extrapolation
}

// ---------- One run ---------------------------------------------------------
// Returns { good, kills, level, time, payout, chestGold, waves }
function simulateRun(profile, rng) {
  const { p, margin } = buildPower(profile);
  let kills = 0, time = 0, waves = 0, bosses = 0, chestGold = 0;
  let good = false;

  for (let b = 1; b <= WAVE_COUNT; b++) {
    const M = p * margin / D[b - 1];
    const pClear = 1 / (1 + Math.exp(-SIM_TUNING.LOGI_K * (M - SIM_TUNING.LOGI_M0)));
    const waveKills = K0 * (1 + SIM_TUNING.KILL_RAMP * (b - 1));
    const waveTime = Math.min(C.ESCALATION.WAVE_LENGTH * 0.92,
      Math.max(30, TW0 * D[b - 1] / Math.max(0.2, p)));

    if (b === WAVE_COUNT && rng() < pClear) {
      // Reached the finale: the maw is unbeatable — bank most of wave 5 and
      // the finale seconds, then die to it. This IS the good run.
      good = true;
      kills += waveKills * 0.85 * (0.9 + 0.2 * rng());
      time += waveTime + 20 * (0.5 + rng());
      bosses++;
      chestGold += chestDrop(b, rng);
      break;
    }
    if (rng() >= pClear) {
      // Died mid-wave b.
      kills += waveKills * SIM_TUNING.PARTIAL_KILL_FRAC * (0.8 + 0.4 * rng());
      time += waveTime * SIM_TUNING.PARTIAL_TIME_FRAC;
      break;
    }
    // Cleared wave b (boss down).
    kills += waveKills * (0.9 + 0.2 * rng());
    time += waveTime * (0.9 + 0.2 * rng());
    waves++;
    bosses++;
    chestGold += chestDrop(b, rng);
  }

  kills = Math.round(kills);
  const level = levelForKills(kills);
  const greedMult = 1 + SHOP_BY_ID.greed.perLevel * (profile.purchased.greed || 0);
  const payout = computeRunGold({ kills, level, time, goldMult: greedMult });
  // heat.js gold multiplier applies to in-run pickups (chests), not the
  // end-of-run payout: manuals earned scale with bosses defeated.
  chestGold *= heatGoldMult(Math.floor(bosses / 2));
  return { good, kills, level, time: Math.round(time), payout, chestGold, waves, bosses };
}

function chestDrop(wave, rng) {
  // ESCALATION.BOSS.CHESTS per boss; DOUBLE_EVERY waves spawn two bosses.
  const n = C.ESCALATION.BOSS.CHESTS * (wave % C.ESCALATION.BOSS.DOUBLE_EVERY === 0 ? 2 : 1);
  let gold = 0;
  for (let i = 0; i < n; i++) {
    gold += SIM_TUNING.CHEST_MIN + (SIM_TUNING.CHEST_MAX - SIM_TUNING.CHEST_MIN) * rng();
  }
  return gold;
}

// Mid-tier catalog: cost-weighted owned fraction (the greedy shopper owns
// what they can afford, so owned ≈ affordable).
function midTierOwnedFrac(profile) {
  let owned = 0;
  for (const id of GOLD_MODEL.MID_TIER_IDS) {
    const def = SHOP_BY_ID[id];
    if (!def || shopRowDone(profile, def)) {
      if (def) owned += fullRowCost(def);
      continue;
    }
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
// Plays to GOOD_RUN_TARGET good runs (or RUN_CAP total). Milestone snapshots
// at every 5 good runs; also tracks late-career good-run gross income.
// Exported so test_meta.mjs can smoke-run a single deterministic career.
export function simulateCareer(seed) {
  const rng = mulberry32(seed);
  const profile = makeProfile();
  const milestones = [];
  const purchaseOrder = [];
  let goodRuns = 0, totalRuns = 0, payoutSum = 0, chestSum = 0, goodPayoutSum = 0;
  let lateGoodPayouts = [], lateGoodGross = [];

  while (goodRuns < SIM_TUNING.GOOD_RUN_TARGET && totalRuns < SIM_TUNING.RUN_CAP) {
    totalRuns++;
    const run = simulateRun(profile, rng);
    profile.gold += run.payout;
    payoutSum += run.payout;
    chestSum += run.chestGold;
    for (const id of greedyShop(profile)) purchaseOrder.push(id);

    if (run.good) {
      goodRuns++;
      goodPayoutSum += run.payout;
      if (goodRuns > SIM_TUNING.GOOD_RUN_TARGET * 0.6) {   // "late career"
        lateGoodPayouts.push(run.payout);
        lateGoodGross.push(run.payout + run.chestGold);
      }
      if (goodRuns % 5 === 0) {
        milestones.push({
          goodRuns, totalRuns,
          gold: profile.gold,
          midFrac: midTierOwnedFrac(profile),
          goodFrac: goodPayoutSum / SIM_ASSUMPTIONS.midTierCost,
          greed: profile.purchased.greed || 0,
        });
      }
    }
  }

  const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  return {
    milestones, purchaseOrder, totalRuns,
    goodFracAt10: milestones.length >= 2 ? milestones[1].goodFrac : null,
    lateGoodPayout: avg(lateGoodPayouts),
    lateGoodGross: avg(lateGoodGross),
    avgRunPayout: payoutSum / Math.max(1, totalRuns),
    avgRunChest: chestSum / Math.max(1, totalRuns),
    hitTarget: goodRuns >= SIM_TUNING.GOOD_RUN_TARGET,
  };
}

// ---------- main -------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const flag = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : dflt;
  };
  const careers = Math.max(1, Math.floor(flag('--runs', 200)));
  const seed = Math.max(1, Math.floor(flag('--seed', 1337)));

  console.log(`HORDES WAVE-11 BALANCE SIM — ${careers} careers, seed ${seed}`);
  console.log(`assumptions: END_WAVE ${SIM_ASSUMPTIONS.END_WAVE}, GOOD_RUN ref ` +
    `${SIM_ASSUMPTIONS.goodRunGold}g, mid-tier catalog ${SIM_ASSUMPTIONS.midTierCost}g`);
  console.log('');

  const results = [];
  for (let i = 0; i < careers; i++) results.push(simulateCareer(seed + i * 7919));

  // Aggregate milestone table (mean across careers).
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
  console.log('');

  const at10 = results.filter(r => r.goodFracAt10 !== null);
  const good10Mean = at10.length
    ? at10.reduce((s, r) => s + r.goodFracAt10, 0) / at10.length : 0;
  const latePayout = results.reduce((s, r) => s + r.lateGoodPayout, 0) / careers;
  const lateGross = results.reduce((s, r) => s + r.lateGoodGross, 0) / careers;
  const avgPayout = results.reduce((s, r) => s + r.avgRunPayout, 0) / careers;
  const avgChest = results.reduce((s, r) => s + r.avgRunChest, 0) / careers;
  const avgTotalRuns = results.reduce((s, r) => s + r.totalRuns, 0) / careers;
  const hitRate = results.filter(r => r.hitTarget).length;

  console.log(`avg run payout           ${Math.round(avgPayout)}g  (+${Math.round(avgChest)}g in-run chest gold, not profile income)`);
  console.log(`avg good-run payout (late career) ${Math.round(latePayout)}g  (gross incl chests ${Math.round(lateGross)}g)`);
  console.log(`runs to ${SIM_TUNING.GOOD_RUN_TARGET} good runs: avg ${Math.round(avgTotalRuns)}  (${hitRate}/${careers} careers reached the target)`);
  console.log('');

  // Top-tier good-run equivalents.
  const ref = SIM_ASSUMPTIONS.goodRunGold;
  const topRefs = SIM_ASSUMPTIONS.TOP_TIER_IDS.map(id => {
    const cost = catalogCost([id]);
    return { id, cost, refRuns: cost / ref, grossRuns: cost / lateGross };
  });
  console.log('top-tier item  cost       good-run equiv (ref)  (compounding-aware: late-career gross)');
  for (const t of topRefs) {
    console.log(`  ${t.id.padEnd(12)} ${String(t.cost).padStart(6)}g   ` +
      `${t.refRuns.toFixed(1).padStart(18)}     ${t.grossRuns.toFixed(1).padStart(18)}`);
  }
  console.log('');

  // Greedy purchase order (career 1, first 24 buys — enough to show shape).
  console.log('greedy purchase order (career 1, first 24):');
  console.log('  ' + results[0].purchaseOrder.slice(0, 24).join(' -> '));
  console.log('');

  // Target verdicts. (a): good-run-funded fraction of the mid-tier catalog at
  // the 10-good-run milestone. (b): BOTH the un-compounded reference AND the
  // compounding-aware late-career gross standards must clear the bar.
  const [lo, hi] = SIM_TUNING.MID_TIER_TOL;
  const passA = good10Mean >= lo && good10Mean <= hi;
  const passB = topRefs.every(t => t.refRuns >= SIM_ASSUMPTIONS.TOP_TIER_MIN_GOOD_RUNS
    && t.grossRuns >= SIM_ASSUMPTIONS.TOP_TIER_MIN_GOOD_RUNS);
  console.log(`TARGET (a) ~10 good runs buys ~50% of mid-tier (good-run gold standard): ` +
    `${(100 * good10Mean).toFixed(1)}% at 10 good runs ` +
    `[tolerance ${(100 * lo).toFixed(0)}%-${(100 * hi).toFixed(0)}%] -> ${passA ? 'PASS' : 'FAIL'}`);
  console.log(`TARGET (b) top-tier costs ${SIM_ASSUMPTIONS.TOP_TIER_MIN_GOOD_RUNS}+ good runs, ref AND compounding-aware: ` +
    topRefs.map(t => `${t.id} ${t.refRuns.toFixed(1)}/${t.grossRuns.toFixed(1)}`).join(', ') +
    ` -> ${passB ? 'PASS' : 'FAIL'}`);

  if (!passA || !passB) process.exit(1);
}

// Only auto-run when invoked directly (test_meta.mjs imports this module for
// the SIM_SYNC assertions — importing must NOT trigger a simulation).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
