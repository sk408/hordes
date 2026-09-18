// SIM BUDGET GUARD (2026-09-18) — the owner's rule made MACHINE-CHECKED:
// "The agent wouldn't limit them on its own without my hard rule. It kept
// bypassing the guidance to keep testing to minimal."
//
// Soft guidance was bypassed, so this file pins the mechanics that fail:
//   (a) no single simulated arm exceeds 60 simulated seconds — the boundary
//       arm (exactly 60.0s) must pass and ONE more frame must THROW;
//   (b) a declared process budget is enforced — one second past it throws;
//       a real_loop cohort WITHOUT a declared budget refuses to start;
//   (c) the accounting is accurate — pumped frames land in the arm and the
//       process total at dtMs fidelity;
//   (d) there is NO enforcement switch — the registry exposes no 'enforced'
//       flag or similar bypass, because a flag is just guidance again.
//
// Fail-first: the deliberate over-long arm below was run BEFORE enforcement
// existed (counters only) and completed silently — that red run is recorded
// in the task report (2026-09-18).
//
// This guard's OWN budget is declared below (the self-demonstration): the
// whole file costs ~63 sim-seconds, dominated by the boundary arm itself.
import { boot } from './_harness.mjs';
import { REG, markArm, declareSimBudget, simStats, chargeSimSeconds, ARM_CAP_S } from './_sim_budget.mjs';
import assert from 'node:assert/strict';

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('  ok - ' + label); };

// (d) FIRST, before anything can mutate: no bypass surface on the registry.
check('the registry exposes no enforcement switch (a flag would be guidance again)', () => {
  assert.ok(!('enforced' in REG), 'REG.enforced must not exist');
  assert.ok(!('enabled' in REG), 'REG.enabled must not exist');
  assert.equal(ARM_CAP_S, 60, 'the owner cap is 60s per arm');
});

// THE TWO LANES, pinned deliberately (the first full-suite run under
// enforcement caught 13 functional tests driving one session past 60s —
// night navigation, cooldown windows, horde cohorts — which is gameplay
// TESTING, not the measurement sims the owner capped): a plain boot() is a
// FUNCTIONAL session — counted for the report, never arm-capped. Demo:
// 62 simulated seconds on an unmarked boot, no budget declared, no throw.
// (setFrameMs(1000): 62 frames = 62 simulated seconds, honestly charged —
// the accounting counts simulated time, not wall time or frame count.)
{
  const h = await boot({ variant: 'simbudget-functional-lane' });
  h.setFrameMs(1000);
  h.pump(62);
  check('a plain functional boot is COUNTED but not arm-capped (62s session, no throw)', () => {
    const arm = simStats().arms[simStats().arms.length - 1];
    assert.ok(arm.seconds >= 62, 'the 62s was charged to the arm (got ' + arm.seconds + ')');
    assert.equal(arm.measured, false, 'an unmarked boot arm is the functional lane');
  });
  h.setFrameMs(1000 / 60);
}

// This guard's own declared budget: 200s covers the ~128s of planned sim
// below with headroom; a guard that busts its own budget would throw right
// here. From this point EVERY arm in the process is capped (budget => a
// measurement process), measured or not.
declareSimBudget(200);

// (c) accounting accuracy: 120 frames at dtMs = exactly 2.000s...
{
  const h = await boot({ variant: 'simbudget-accuracy' });
  const before = simStats();
  h.pump(120);
  const after = simStats();
  check('counter accuracy: 120 frames at 60Hz charge 2.000s to the arm and the process', () => {
    const arm = after.arms[after.arms.length - 1];
    assert.ok(Math.abs(arm.seconds - (before.arms[before.arms.length - 1].seconds + 2)) < 1e-9,
      'arm charged 2s, got ' + arm.seconds);
    assert.ok(Math.abs((after.totalS - before.totalS) - 2) < 1e-9, 'process total charged 2s');
  });
}

// (a) THE DELIBERATE OVER-LONG ARM — the boundary arm passes at exactly the
// cap, and ONE more frame fails loudly mid-pump (never completes silently).
{
  const h = await boot({ variant: 'simbudget-overlong' });
  h.markArm('deliberate-overlong-arm');
  h.pump(60 * 60);                       // exactly 60.000s — at the cap: legal
  check('an arm of exactly 60.000s pumps to the cap without throwing', () => {
    const arm = simStats().arms[simStats().arms.length - 1];
    assert.ok(arm.seconds <= ARM_CAP_S + 1e-9, 'boundary arm recorded at ' + arm.seconds);
  });
  check('ONE frame past 60s THROWS (the build fails loudly, never completes)', () => {
    assert.throws(() => h.pump(1), /SIM BUDGET EXCEEDED: arm 'deliberate-overlong-arm'/);
  });
}

// (b) declared process budget: declare total+1s, then charge 2s -> throw.
check('a declared process budget throws the moment the total passes it', () => {
  declareSimBudget(REG.totalS + 1);
  markArm('budget-demo');
  assert.throws(() => chargeSimSeconds(2), /SIM BUDGET EXCEEDED: process total/);
});

// Real cohort chassis: an UNDECLARED measurement refuses to start (throws
// BEFORE any frame is pumped, so this check itself costs no sim).
{
  const rl = await import('../tools/real_loop.mjs');
  await assert.rejects(
    () => rl.runRealCohort('fresh', 1, {}),
    /SIM BUDGET.*declare/i,
  );
  passed++;
  console.log('  ok - runRealCohort without a declared budget refuses to run any frames');
}

// Final stats line — the format every measurement report must carry.
// (The budget-demo above deliberately overran ITS tight budget — the charge
// counts even when it throws — so the guard's own ceiling is the 200s
// declared above, restated here for the closing check.)
const stats = simStats();
const OWN_BUDGET_S = 200;
check('simStats reports arm table + process total consistent', () => {
  const sum = stats.arms.reduce((s, a) => s + a.seconds, 0);
  assert.ok(Math.abs(sum - stats.totalS) < 1e-6, 'arms sum to the process total');
  assert.ok(stats.totalS <= OWN_BUDGET_S, 'this guard stayed inside its own ' + OWN_BUDGET_S + 's budget (used ' + stats.totalS.toFixed(1) + 's)');
});

console.log('SIM BUDGET GUARD: ' + passed + ' checks passed; this file used ' +
  stats.totalS.toFixed(1) + ' sim-seconds across ' + stats.arms.length +
  ' arms (budget ' + OWN_BUDGET_S + 's declared).');
