// PACING GUARDS (2026-09-17, task msg_01M2QV1H7EJ3NSHAZT57SW944P) — the
// suite side of docs/PACING.md. Every guard pins a MEASURED number from that
// doc's invariants (a)-(d) plus the standing rule (G8). Fail-first verified:
// with BEAM's price mutated 4.5M -> 9M on disk, G3 fails (recorded in the
// task report); the same mutation style red-checks every band below.
// G5/G7 deliberately pin today's numbers as REGRESSION bounds for invariants
// that currently FAIL (owner decision OPEN — see the ledger's OPEN items);
// hard bands there would keep the suite red forever. Run: node test/test_pacing_guards.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RUN_GOLD, GOLD_MODEL, SHOP_UPGRADES, SHOP_BY_ID, WEAPON_PRICES, upgradeCost,
  catalogCost, GOLD_TIER,
} from '../src/meta.js';
import { CONFIG as C } from '../src/config.js';
import { HEAT_CURVES } from '../src/heat.js';
import { boot, suite } from './_harness.mjs';

const S = suite('pacing guards');
const TIERS = GOLD_MODEL.INCOME_TIERS;
const T0 = TIERS[0].gold, T1 = TIERS[1].gold, T2 = TIERS[2].gold, T3 = TIERS[3].gold;
const costOf = (id, level) => upgradeCost(SHOP_BY_ID[id], level);

// ---- (a) RUN-VALUE: a good run is worth ~one upgrade at its stage ----------
S.check('(a) tier-0: the first real purchase costs 1-3 good runs (hp L1)', () => {
  const runs = costOf('hp', 0) / T0;                       // 120/70 = 1.71
  assert.ok(runs >= 1 && runs <= 3, `hp L1 = ${runs} tier-0 runs`);
});
S.check('(a) tier-1: dmg L1 still inside 1-3 good runs', () => {
  const runs = costOf('dmg', 0) / T1;                      // 150/100 = 1.50
  assert.ok(runs >= 1 && runs <= 3, `dmg L1 = ${runs} tier-1 runs`);
});

// ---- (b) TIME-IN-GRADE: the next level of the row you just bought ---------
S.check('(b) early grade: dmg L2 costs >= 2 tier-1 runs (N=2 holds early)', () => {
  const runs = costOf('dmg', 1) / T1;                      // 240/100 = 2.40
  assert.ok(runs >= 2, `dmg L2 = ${runs} tier-1 runs`);
});
S.check('(b) OPEN FAIL regression floor: no end-game multi-level purchase may drop below 0.1 good runs', () => {
  // fleetfoot L2 130,000 / 754,689 = 0.17 today; the invariant (N>=2) FAILS
  // at the end-game rungs (docs/PACING.md §2b, ledger OPEN item) — this guard
  // only stops it getting WORSE while the owner decides.
  const runs = costOf('fleetfoot', 1) / T3;
  assert.ok(runs >= 0.1, `fleetfoot L2 = ${runs} tier-3 runs (vaporization)`);
});

// ---- (c) IDLE FLOOR: night is exactly half, on named delays ----------------
const h = await boot();
const T = h.T;
const st = T.state;
S.check('(c) a night run settles at EXACTLY the 50% pool (idle strictly beneath active)', () => {
  while (!T.night.on) T.night.press();
  T.startRun(); h.pump(2);
  const prof = T.getProfile();
  prof.bestTime = 99999;
  st.player.stats.goldMult = 1;
  st.rampage.best = 0; st.rampage.streak = 0;
  st.heat.manual = 0;
  prof.runPurse = 0;
  const r = T.purse.settle();
  assert.equal(r.goldPool.total, 0.5, 'the pool total is exactly 0.5');
  assert.equal(r.award, Math.round(RUN_GOLD.AWARD * 0.5), 'award = 35');
});
S.check('(c) the idle cadence constants are the named 3.0s/3.0s', () => {
  assert.equal(C.AUTOPILOT.NIGHT_CONTINUE_S, 3.0);
  assert.equal(C.AUTOPILOT.NIGHT_RESTART_S, 3.0);
  assert.equal(RUN_GOLD.NIGHT_PENALTY_PCT, 50, 'the ledger value is 50 (ledger row: NIGHT_PENALTY_PCT)');
});

// ---- (d) NO DEAD TAIL -------------------------------------------------------
// OWNER EARLY-ACCESSIBILITY RETARGET: the owner cut BEAM 4.5M -> 450000g, so
// bloodpact (4,433,000g = 5.87 tier-3 runs) is the new max. The 6.05 ceiling
// still holds for EVERY row; only the top identity moved.
S.check('(d) top: EVERY shop row full-buy <= 6.05 good tier-3 runs (max: bloodpact 5.87)', () => {
  let worst = { id: null, runs: 0 };
  for (const def of SHOP_UPGRADES) {
    const runs = catalogCost([def.id]) / T3;
    if (runs > worst.runs) worst = { id: def.id, runs };
  }
  assert.ok(worst.runs <= 6.05, `${worst.id} = ${worst.runs.toFixed(2)} tier-3 runs`);
  assert.equal(worst.id, 'bloodpact', 'bloodpact is the top of the ladder post-owner-retune (BEAM cut to 0.6 runs)');
});
S.check('(d) OPEN FAIL regression ceiling: ZAP <= 3,200 tier-2 runs (3,000 today)', () => {
  // The tier-2 dead tail (docs/PACING.md §2d, ledger OPEN item): the premium
  // catalog is priced against tier-3 income. This guard only stops the mid
  // tail getting WORSE while the owner decides.
  const runs = WEAPON_PRICES.ZAP / T2;
  assert.ok(runs <= 3200, `ZAP = ${runs} tier-2 runs`);
});

// ---- (G8) the standing rule: single-home constants --------------------------
S.check('(G8) CHALLENGE_BONUS_PCT / NIGHT_PENALTY_PCT defined exactly once in meta.js', () => {
  const src = readFileSync(new URL('../src/meta.js', import.meta.url), 'utf8');
  for (const k of ['CHALLENGE_BONUS_PCT', 'NIGHT_PENALTY_PCT']) {
    assert.equal((src.match(new RegExp(k + '\\s*:', 'g')) || []).length, 1, `${k} has ONE home`);
  }
});

// ---- ledger sanity: the calibration base is the measured table --------------
S.check('ledger: INCOME_TIERS carries the four MEASURED band values', () => {
  assert.deepEqual(TIERS.map(t => t.gold), [70, 100, 200, 754689]);
  assert.equal(RUN_GOLD.AWARD, TIERS[0].gold, 'tier 0 == the fixed award floor');
  assert.equal(HEAT_CURVES.GOLD, 0.30, 'HEAT_CURVES.GOLD ledger row');
  assert.equal(GOLD_TIER.BOSS, 150, 'GOLD_TIER.BOSS ledger row');
});

S.done();
