// HORDES — THE SIM BUDGET REGISTRY (2026-09-18, owner directive: "The agent
// wouldn't limit them on its own without my hard rule. It kept bypassing the
// guidance to keep testing to minimal.").
//
// Soft guidance was tried and bypassed, so the budget is ENFORCED BY CODE
// THAT THROWS. This module is the ONE home of the accounting:
//   * every pumped frame charges its simulated seconds to the CURRENT ARM
//     segment and to the PROCESS TOTAL;
//   * an ARM is whatever the harness caller says it is (by default one whole
//     boot(); a multi-run measurement tool marks a new arm per run via
//     markArm());
//   * ARM_CAP_S (60) is the owner's hard per-arm cap — enforced ALWAYS, no
//     opt-out, for tests and tools alike;
//   * a measurement PROCESS must DECLARE its total budget via
//     declareSimBudget(s) before driving frames past it; over-budget and
//     undeclared-but-measuring (real_loop cohorts) throw.
//
// The guard that pins all of this is test/test_sim_budget.mjs; its file:line
// is quoted in PACING.md §0 so no future agent mistakes the cap for advice.
//
// Import-safe from any context (no DOM, no game imports): _harness.mjs and
// tools/real_loop.mjs both charge through here, so a frame cannot be pumped
// anywhere in this repo without being counted.

export const ARM_CAP_S = 60;

// One registry per PROCESS (a suite test file, or one measurement tool run).
export const REG = (globalThis.__HORDES_SIM_REGISTRY ?? (globalThis.__HORDES_SIM_REGISTRY = {
  totalS: 0,
  arms: [],          // { label, seconds } — completed + live segments
  budgetS: null,     // declared process budget (measurement processes only)
}));

/** Open a new arm segment (the previous one is closed, not deleted).
 *  markArm = a MEASUREMENT arm: capped at ARM_CAP_S (and, in a process with
 *  a declared budget, the budget applies too). The lazy default segment a
 *  plain boot() charges into is a FUNCTIONAL session — counted for the
 *  report, not arm-capped, because the game's own gameplay tests legitimately
 *  drive one continuous session past 60s (night navigation, cooldown
 *  windows, horde cohorts). The owner's cap targets MEASUREMENT sims
 *  ("running a full real time simulation of dozens or more runs"), and the
 *  moment a process declares a budget it is a measurement process and EVERY
 *  arm in it is capped — measured or not. */
export function markArm(label = 'arm', measured = true) {
  REG.arms.push({ label: String(label), seconds: 0, measured });
  return REG.arms[REG.arms.length - 1];
}

/** The live arm segment frames charge into (last marked; lazily a plain
 *  un-capped functional boot segment). */
export function currentArm() {
  if (REG.arms.length === 0) {
    REG.arms.push({ label: 'boot', seconds: 0, measured: false });
  }
  return REG.arms[REG.arms.length - 1];
}

/** Declare the process-wide sim budget (simulated seconds). Measurement
 *  processes call this BEFORE driving frames; throwing on breach is the
 *  point. Returns the registry so callers can chain reads. */
export function declareSimBudget(s) {
  if (!(s > 0)) throw new Error('declareSimBudget: budget must be > 0 sim-seconds');
  REG.budgetS = s;
  return REG;
}

/** Charge `seconds` of simulated time to the current arm and the process
 *  total. THE ENFORCEMENT POINT — throws loudly on breach:
 *    (a) a MEASURED arm (markArm) — or ANY arm in a process that declared a
 *        budget — over ARM_CAP_S: no measurement arm may exceed 60s;
 *    (b) process total over a declared budget -> the task's stated budget.
 *  Functional gameplay tests (no markArm, no budget) are COUNTED but not
 *  arm-capped — that lane is deliberate and pinned by the guard. There is
 *  deliberately NO switch to turn any of this off: the 2026-09-18 red run
 *  (see test/test_sim_budget.mjs header) showed a silent 61s measurement
 *  arm is exactly the bypass this module exists to make impossible. */
export function chargeSimSeconds(seconds) {
  if (!(seconds > 0)) return;
  const arm = currentArm();
  arm.seconds += seconds;
  REG.totalS += seconds;
  const capped = arm.measured || REG.budgetS != null;
  if (capped && arm.seconds > ARM_CAP_S + 1e-9) {
    throw new Error(`SIM BUDGET EXCEEDED: arm '${arm.label}' reached ${arm.seconds.toFixed(1)}s ` +
      `(cap ${ARM_CAP_S}s). The 60s cap is MACHINE-ENFORCED, not guidance ` +
      `(test/test_sim_budget.mjs; owner 2026-09-17: guidance was bypassed).`);
  }
  if (REG.budgetS != null && REG.totalS > REG.budgetS + 1e-9) {
    throw new Error(`SIM BUDGET EXCEEDED: process total ${REG.totalS.toFixed(1)}s over the ` +
      `declared budget ${REG.budgetS}s (test/test_sim_budget.mjs). Declare a real ` +
      `budget or report the limitation — a longer run is never the answer.`);
  }
}

/** Read-only snapshot for reports: total, per-arm table, budget. */
export function simStats() {
  return {
    totalS: +REG.totalS.toFixed(3),
    budgetS: REG.budgetS,
    arms: REG.arms.map(a => ({ label: a.label, seconds: +a.seconds.toFixed(3), measured: !!a.measured })),
  };
}
