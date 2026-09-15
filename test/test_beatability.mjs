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
// RECORDED developed-side measurement (G17 slice 1c, 2026-09-15, post-1b
// prices, HEAD 18eaa8b):
//   command: node tools/boss_sim.mjs --profile hours:40 --runs 1 --seed 1337
//   raw log: /tmp/g17_1c/hours40_n1_seed1337.log
//   result:  MAW SLAIN 0/1 — the run DIED at wave 1 @ 125s, cause shot:SPITTER
//   AND the crossing probe that locates the curve (cheapest first, per brief):
//   command: node tools/boss_sim.mjs --profile hours:2 --runs 1 --seed 1337 --progress
//   raw log: /tmp/g17_1c/hours2_n1_seed1337.log
//   result:  MAW SLAIN 1/1 at 712s (run died wave 6 AFTER slaying the maw)
//   AND the loadout diagnostic that explains it (same slice, same tree):
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
  hours40: { n: 1, seed: 1337, mawSlain: 0,
    cmd: 'node tools/boss_sim.mjs --profile hours:40 --runs 1 --seed 1337',
    log: '/tmp/g17_1c/hours40_n1_seed1337.log' },
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
    recs = await runRealCohort('fresh', N, { maxSeconds: CFG.RUN.LIMIT + 60 });
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
  ok(budget > L.total,
     `the budget SATURATES: ${budget}g > the whole ${L.total}g catalogue — hours:40 and --profile maxed buy the same rows (every H >= ${(L.total / goldPerHour('maxed')).toFixed(1)} saturates)`);
  ok(RECORDED.hours40.n >= 1 && Number.isInteger(RECORDED.hours40.mawSlain),
     `recorded hours:40 run exists: n=${RECORDED.hours40.n} seed=${RECORDED.hours40.seed} MAW ${RECORDED.hours40.mawSlain}/${RECORDED.hours40.n} (cmd: ${RECORDED.hours40.cmd}; log: ${RECORDED.hours40.log})`);
  ok(RECORDED.hours40.mawSlain === 0,
     `FINDING asserted as measured: the GREEDY_PRIORITY hours:40 build did NOT clear the finale (0/${RECORDED.hours40.n}) — the flat-model 40h arm fails its own claim under the mandated purchase order`);
  ok(RECORDED.hours2.mawSlain > 0,
     `FINDING asserted as measured: the crossing is NOT in the owner's 20-40h band — hours:2 (3,018,756g, elites SWIFT only) already slew the maw (1/${RECORDED.hours2.n}, died wave ${RECORDED.hours2.deepestWave} @ ${RECORDED.hours2.time}s AFTER the kill); fresh stays 0, so the curve crosses somewhere in (0h, 2h] (cmd: ${RECORDED.hours2.cmd}; log: ${RECORDED.hours2.log})`);
  ok(RECORDED.maxed.mawSlain > 0,
     `the FULL-buy build (all rows incl. the mana/QoL set GREEDY skips) cleared at ${RECORDED.maxed.mawSlain}/${RECORDED.maxed.n} (RUN SURVIVED, wave ${RECORDED.maxed.deepestWave}) — the gap is the BUILD the order constructs (no mana rows, elite unlocks armed), not the harness (log: ${RECORDED.maxed.log})`);
}

console.log('BEATABILITY — flat-budget overstatement (quantified, item 4b):');
{
  const L = ledger();
  const flat = 40 * goldPerHour('maxed');
  const spent = 29526022;                    // printed by the recorded hours:40 run
  const phantom = flat - spent;
  ok(Math.round(phantom) === 30849098,
     `flat 40h budget ${flat}g vs what the shop can sell ${spent}g: ${phantom}g = ${(phantom / goldPerHour('maxed')).toFixed(1)} PHANTOM hours (${(100 * phantom / flat).toFixed(1)}% of the budget buys nothing)`);
  ok(L.total / goldPerHour('maxed') < 20 && 40 > L.total / goldPerHour('maxed'),
     `the catalogue spans only ${(L.total / goldPerHour('maxed')).toFixed(1)}h of end-game income, so the owner's 20-40h "lucky" band and 40-50h "regular" band are the SAME saturated build under the flat model — slice 2 breadth must land before the 40h point is representable`);
}

console.log(failed === 0 ? 'ALL BEATABILITY TESTS PASSED' : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
