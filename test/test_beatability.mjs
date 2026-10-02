// HORDES — the beatability floor (node, no DOM).
// Run: node test/test_beatability.mjs
//
// A fresh profile must not clear the run: every fresh run dies inside wave 1.
// Measured live through the real frame loop (real_loop.runRealCohort, seeded,
// n=8). The developed side of the curve (what a bought-out profile reaches) is
// measured with tools/progression_sim.mjs --fixed-build and recorded in
// docs/BALANCE_M1.md; it is too long for the suite.
import { runRealCohort, mean } from '../tools/real_loop.mjs';
import { ARM_CAP_S } from './_sim_budget.mjs';
import { mulberry32 } from '../src/weather.js';
import { CONFIG as CFG } from '../src/config.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

console.log('BEATABILITY — fresh arm (LIVE, real frame loop):');
{
  const SEED = 1337, N = 8;
  const rand = Math.random;
  Math.random = mulberry32(SEED);
  let recs;
  try {
    // Sim budget: the cohort declares its ceiling (N runs x the 60s arm cap).
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
     `fresh clear rate is 0/${N} (got ${clears})`);
  ok(earlyDeath,
     `every fresh run died inside wave 1 (< ${CFG.LADDER.WAVE_SECONDS}s; mean ${mean(recs.map(r => r.time)).toFixed(1)}s)`);
}

console.log(failed === 0 ? 'ALL BEATABILITY TESTS PASSED' : `${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
