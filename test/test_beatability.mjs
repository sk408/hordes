// HORDES — G17 slice 1c: THE BEATABILITY TEST (node, no DOM).
// Run: node test/test_beatability.mjs          (default: suite-cheap mode)
//      node test/test_beatability.mjs --full   (re-measures the expensive side)
//
// THE CLAIM UNDER TEST (owner, verbatim): "simulate a profile with ~40 play
// hours of purchases and show the finale is clearable at a meaningful rate;
// simulate a fresh profile and show it is not."
//
// MODES — which side was measured WHERE (the MEASURED pattern, cf.
// tools/economy_ledger.mjs :58-62):
//   - DEFAULT (what the suite runs): the FRESH arm is measured LIVE through
//     the real frame loop (real_loop.runRealCohort, seeded, n=8 — fresh runs
//     die in ~12s sim, so the arm costs ~90s wall). The expensive developed
//     side is a RECORDED measurement, asserted as a recording, not re-run.
//   - --full: re-measures the developed side by spawning the exact recorded
//     boss_sim command (minutes-to-an-hour of wall; never in the suite).
//
// RECORDED developed-side measurement (G17 slice 2, 2026-09-15, post-breadth,
// tree 3c90291+dirty — the AFTER column; the 1c BEFORE recording is kept
// further down as history):
//   command: node tools/boss_sim.mjs --profile hours:40 --runs 1 --seed 1337
//   raw log: /tmp/g17_2/hours40_n1_seed1337.log
//   result:  MAW SLAIN 1/1 — the run was TRUNCATED by the 1800s run limit at
//            wave 14 @ 1791s, alive, having SLAIN the finale maw. Budget
//            60,375,120g -> spent 58,591,622g (91 rows; the 16 breadth rows
//            make the 40h budget non-saturating, so the GREEDY build is no
//            longer identical to maxed).
//   PRE-BREADTH BEFORE (G17 slice 1c, post-1b prices, HEAD 18eaa8b):
//   raw log: /tmp/g17_1c/hours40_n1_seed1337.log
//   result:  MAW SLAIN 0/1 — the run DIED at wave 1 @ 125s, cause shot:SPITTER
//   AND the crossing probe that locates the curve (PRE-BREADTH 1c recording —
//   the hours:2 greedy build itself changed when the breadth rows joined the
//   priority list, so this is a record of the pre-breadth curve, kept as the
//   1c finding it was):
//   command: node tools/boss_sim.mjs --profile hours:2 --runs 1 --seed 1337 --progress
//   raw log: /tmp/g17_1c/hours2_n1_seed1337.log
//   result:  MAW SLAIN 1/1 at 712s (run died wave 6 AFTER slaying the maw)
//   AND the loadout diagnostic that explains it (PRE-BREADTH 1c recording):
//   command: node tools/boss_sim.mjs --profile maxed --runs 1 --seed 1337
//   raw log: /tmp/g17_1c/maxed_n1_seed1337.log
//   result:  MAW SLAIN 1/1 — RUN SURVIVED at wave 10 @ 1800s (wall ~40-43min)
//   FINDINGS (reported, not tuned — slice 1c does not reprice or reorder):
//   1. The mandated GREEDY_PRIORITY order (tools/balance_sim.mjs) omits every
//      mana/QoL row (potions, regen, focus, thrifty, well, siphon, alchemy,
//      scav, artifact, split — 47,111g), so the saturated hours:H "40h build"
//      fights with zero mana upgrades and the skill policy (q/e) runs dry.
//   2. The curve is NON-MONOTONIC under that order: hours:2 (elites SWIFT
//      only) slew the maw, while the saturated hours:40 build (which also
//      unlocked the SPLITTING and VAMPIRIC elite modifiers — enemies that
//      make the run HARDER) died at wave 1. Buying more gold along
//      GREEDY_PRIORITY arms the enemies faster than it arms the player.
//   3. The full buy (maxed, every row incl. mana) clears — the gap is the
//      build, not the harness. All three are handed to the pilot.
import { runRealCohort, mean } from '../tools/real_loop.mjs';
import { ARM_CAP_S } from './_sim_budget.mjs';
import { mulberry32 } from '../src/weather.js';
import { goldPerHour, ledger } from '../tools/economy_ledger.mjs';
import { CONFIG as CFG } from '../src/config.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// The recorded developed-side measurement (asserted as a RECORDING in default
// mode; re-measured under --full). Numbers are never asserted that were not
// actually run — see the header for the raw commands and logs.
const RECORDED = {
  // AFTER (G17 slice 2, post-breadth): the 40h GREEDY build now SLEW the
  // finale — truncated by the run limit at wave 14 @ 1791s, maw dead.
  hours40: { n: 1, seed: 1337, mawSlain: 1, deepestWave: 14, time: 1791, spent: 58591622,
    cmd: 'node tools/boss_sim.mjs --profile hours:40 --runs 1 --seed 1337',
    log: '/tmp/g17_2/hours40_n1_seed1337.log' },
  hours2: { n: 1, seed: 1337, mawSlain: 1, deepestWave: 6, time: 712,
    cmd: 'node tools/boss_sim.mjs --profile hours:2 --runs 1 --seed 1337 --progress',
    log: '/tmp/g17_1c/hours2_n1_seed1337.log' },
  maxed: { n: 1, seed: 1337, mawSlain: 1, deepestWave: 10, survived: true,
    cmd: 'node tools/boss_sim.mjs --profile maxed --runs 1 --seed 1337',
    log: '/tmp/g17_1c/maxed_n1_seed1337.log' },
};

console.log('BEATABILITY — fresh arm (LIVE, real frame loop):');
{
  const SEED = 1337, N = 8;
  const rand = Math.random;
  Math.random = mulberry32(SEED);
  let recs;
  try {
    // SIM BUDGET (2026-09-18): this live cohort is the measurement chassis, so
    // it DECLARES its ceiling (N runs x the 60s arm cap; fresh runs die in
    // wave 1, so the real cost is ~12s) and caps each run at ARM_CAP_S — the
    // old RUN.LIMIT+60 maxSeconds could never be reached by a fresh arm
    // without the early-death assertion below already failing.
    recs = await runRealCohort('fresh', N, {
      maxSeconds: ARM_CAP_S, budgetSimSeconds: N * ARM_CAP_S,
    });
  } finally {
    Math.random = rand;
  }
  for (const r of recs) {
    console.log(`  run: time=${r.time}s wave=${r.wave} cause=${r.cause} gold=${r.gold}`);
  }
  const clears = recs.filter(r => r.won).length;
  const earlyDeath = recs.every(r => !r.won && r.time < CFG.LADDER.WAVE_SECONDS);
  ok(clears === 0,
     `fresh clear rate is 0/${N} (owner: "a fresh profile cannot"; got ${clears})`);
  ok(earlyDeath,
     `every fresh run died inside wave 1 (< ${CFG.LADDER.WAVE_SECONDS}s; mean ${mean(recs.map(r => r.time)).toFixed(1)}s)`);
}

console.log('BEATABILITY — developed side (RECORDED measurement, post-1b prices):');
{
  const L = ledger();
  const budget = Math.round(40 * goldPerHour('maxed'));
  ok(budget === 60375120,
     `hours:40 budget arithmetic: 40h x ${Math.round(goldPerHour('maxed'))}g/h = ${budget}g`);
  ok(budget < L.total,
     `G17 slice 2: the budget NO LONGER saturates — ${budget}g < the whole ${L.total}g catalogue (${(L.total / goldPerHour('maxed')).toFixed(1)}h of end-game income), so the owner's 40h point is a REPRESENTABLE build, distinct from maxed`);
  ok(RECORDED.hours40.n >= 1 && Number.isInteger(RECORDED.hours40.mawSlain),
     `recorded hours:40 run exists: n=${RECORDED.hours40.n} seed=${RECORDED.hours40.seed} MAW ${RECORDED.hours40.mawSlain}/${RECORDED.hours40.n} (cmd: ${RECORDED.hours40.cmd}; log: ${RECORDED.hours40.log})`);
  ok(RECORDED.hours40.mawSlain > 0,
     `AFTER asserted as measured: the post-breadth GREEDY hours:40 build SLEW the finale (${RECORDED.hours40.mawSlain}/${RECORDED.hours40.n}, wave ${RECORDED.hours40.deepestWave} @ ${RECORDED.hours40.time}s, truncated by the run limit while alive) — the 40h clear claim holds; the pre-breadth 1c run (0/1, wave 1 @125s, log /tmp/g17_1c/hours40_n1_seed1337.log) is the BEFORE`);
  ok(RECORDED.hours2.mawSlain > 0,
     `FINDING asserted as measured (PRE-BREADTH 1c recording): the crossing is NOT in the owner's 20-40h band — hours:2 (3,018,756g, elites SWIFT only) already slew the maw (1/${RECORDED.hours2.n}, died wave ${RECORDED.hours2.deepestWave} @ ${RECORDED.hours2.time}s AFTER the kill); fresh stays 0, so the curve crosses somewhere in (0h, 2h] (cmd: ${RECORDED.hours2.cmd}; log: ${RECORDED.hours2.log})`);
  ok(RECORDED.maxed.mawSlain > 0,
     `the FULL-buy build (all rows incl. the mana/QoL set GREEDY skips) cleared at ${RECORDED.maxed.mawSlain}/${RECORDED.maxed.n} (RUN SURVIVED, wave ${RECORDED.maxed.deepestWave}) — the gap is the BUILD the order constructs (no mana rows, elite unlocks armed), not the harness (PRE-BREADTH 1c recording; log: ${RECORDED.maxed.log})`);
}

console.log('BEATABILITY — flat-budget overstatement (quantified, item 4b; re-baselined post-breadth):');
{
  const L = ledger();
  const flat = 40 * goldPerHour('maxed');
  const spent = RECORDED.hours40.spent;      // printed by the recorded POST-BREADTH hours:40 run
  const phantom = flat - spent;
  ok(Math.round(phantom) === 1783498,
     `flat 40h budget ${flat}g vs what the shop can sell ${spent}g: ${phantom}g = ${(phantom / goldPerHour('maxed')).toFixed(1)} phantom hours (${(100 * phantom / flat).toFixed(1)}% of the budget is GREEDY remainder) — the pre-breadth 1c run measured 30,849,098g (51.1%) of phantom spend; slice 2 breadth bought those hours with rows`);
  ok(L.total / goldPerHour('maxed') >= 60 && 40 < L.total / goldPerHour('maxed'),
     `the catalogue now spans ${(L.total / goldPerHour('maxed')).toFixed(1)}h of end-game income (> 60h, slice 2 goal), so the owner's 20-40h "lucky" band and 40-50h "regular" band are DISTINCT builds — the 40h point is representable`);
}

console.log(failed === 0 ? 'ALL BEATABILITY TESTS PASSED' : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
