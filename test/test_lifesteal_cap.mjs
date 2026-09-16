// HORDES — G34 LIFESTEAL HEAL RATE CAP (owner 2026-09-16: "Ok let's fix that
// issue" — the G32 invincibility finding: uncapped lifesteal heal throughput x
// the compounding damage shop made death arithmetically impossible).
//
// G36 NOTE: the G34 bucket became the SHARED sustained-healing budget
// (src/heal.js refillHealBudget/healFromBudget, CONFIG.HEAL_BUDGET) that also
// covers the GRAVE HARVEST heal — the shared-budget assertions live in
// test_heal_budget.mjs; this file pins the LIFESTEAL side of the seam.
//
// Pins, per docs/briefs/LIFESTEAL_RATE_CAP.md:
//   - the helpers (heal.js): the bucket refills at EXACTLY the cap rate
//     (linear, step-size independent), never accumulates beyond one second's
//     budget, dt=0 is a frozen no-op, and a below-cap heal is IDENTICAL to the
//     old uncapped formula.
//   - the wiring (real loop, tools/real_loop.mjs bootReal): the bucket starts
//     each run FULL (one second's budget, so a first-second burst lands in
//     full); an absurd dmg*lifesteal heals EXACTLY one budget on the first hit
//     and then EXACTLY the cap rate every second after (never more); a quiet
//     second clamps the bucket at one budget; a below-cap hit heals EXACTLY
//     dmg*lifesteal; the bucket resets per run.
//   - the derivation (config.js): the cap sits BELOW the inbound a heavy swarm
//     can deliver (HIT_CAP_FRAC / i-frame window ~= 0.83 x maxHp/s ceiling,
//     measured sustained inbound ~0.27), or death would stay impossible.
// Run: node test/test_lifesteal_cap.mjs
import assert from 'node:assert/strict';
import { refillHealBudget, healFromBudget } from '../src/heal.js';
import { CONFIG as C } from '../src/config.js';
import { bootReal } from '../tools/real_loop.mjs';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const CAP = C.HEAL_BUDGET.CAP_FRAC;

// ---- 1. the shipped cap and its derivation -------------------------------------
ok('config: HEAL_BUDGET.CAP_FRAC present and equals 0.25 (shipped derivation)',
  CAP === 0.25, CAP);
ok('derivation: the cap sits BELOW the burst ceiling (HIT_CAP/iframe = 0.833/s)',
  CAP < C.SURVIVAL.HIT_CAP_FRAC / 0.6, { cap: CAP, ceiling: C.SURVIVAL.HIT_CAP_FRAC / 0.6 });
ok('derivation: the cap sits at/below the measured sustained inbound (0.27/s)',
  CAP <= 0.27, CAP);

// ---- 2. the spend helper (PURE) ------------------------------------------------
ok('below the cap the heal is IDENTICAL to the uncapped formula (exact ===)',
  healFromBudget(1e9, 40 * 0.02) === 40 * 0.02, healFromBudget(1e9, 40 * 0.02));
ok('small builds too: 7.5 dmg x 0.02 heals EXACTLY 0.15',
  healFromBudget(25, 7.5 * 0.02) === 7.5 * 0.02);
ok('above the cap the bucket binds: heal === bucket', healFromBudget(3, 1e5 * 1000) === 3);
ok('an empty bucket heals NOTHING', healFromBudget(0, 1e5 * 1000) === 0);
ok('want <= 0 heals nothing (guard)', healFromBudget(25, 0) === 0);

// ---- 3. the refill helper (PURE) -----------------------------------------------
const budget = (maxHp) => CAP * maxHp;
ok('refills at EXACTLY the cap rate: 1s in one step from empty === budget',
  refillHealBudget(0, 1, 100, CAP) === budget(100));
ok('never accumulates beyond one second: full bucket + dt=5 stays budget',
  refillHealBudget(budget(100), 5, 100, CAP) === budget(100));
ok('dt = 0 is a frozen no-op (never wall-clock)',
  refillHealBudget(7.3, 0, 100, CAP) === 7.3);
{ // unequal dt steps: the RATE holds regardless of step sizes (assert rate, not count)
  let b = 0;
  for (const dt of [0.25, 0.1, 0.05, 0.6]) b = refillHealBudget(b, dt, 100, CAP);
  ok('unequal steps totaling 1.0s refill to exactly one budget (linear, dt-driven)',
    near(b, budget(100), 1e-9), b);
  let c = 0;
  for (let i = 0; i < 10; i++) c = refillHealBudget(c, 0.1, 100, CAP);
  ok('the same 1.0s in equal steps gives the SAME bucket (step-size independent)',
    near(c, budget(100), 1e-9), c);
}
ok('the budget scales with maxHp (Vitality/level-ups grow the cap)',
  refillHealBudget(0, 1, 287, CAP) === budget(287));
ok('a negative bucket (bug elsewhere) is corrected, not amplified',
  refillHealBudget(-50, 0.5, 100, CAP) === budget(100) * 0.5);

// ---- 4. the wiring (real loop) -------------------------------------------------
const h = await bootReal('fresh');
const st = h.state;
h.startRun();
const frame = () => {
  h.dom.advance(1000 / 60);
  const cb = h.dom.rafQueue.shift();
  if (!cb) throw new Error('raf died');
  cb(performance.now());
};
// Quiet the run (the smoke.mjs idiom) so no spawn/wave event can take the loop
// out of 'playing' mid-probe.
st.enemies.length = 0; st.drops.length = 0; st.gems.length = 0;
st.spawnTimer = 999; st.wave.endsAt = st.time + 9999; st.wave.midAt = st.time + 9999;
ok('probe runs in the live play loop', st.mode === 'playing', st.mode);

const P = st.player;
const B = CAP * P.stats.maxHp;                       // this run's one-second budget
// A tanky CHASER parked 300px out (beyond focus range: no auto-volley, no
// contact) with speed 0 — only the probe's own projectiles ever hit it.
const tank = { typeId: 'CHASER', elite: false, x: P.x + 300, y: P.y, hp: Infinity,
  maxHp: Infinity, speed: 0, xp: 0, w: 10, h: 10, contactDamageMult: 1,
  variant: 0, packSize: 1, minWave: 0, age: 0, attached: false, flash: 0, slow: 0, z: 0 };
st.enemies.push(tank);
const pushShot = (damage) => st.projectiles.push(
  { x: tank.x, y: tank.y, vx: 0, vy: 0, damage, hit: new Set(), pierce: 0, age: 0 });

ok('the bucket starts each run FULL (one second\'s budget)', st.healBudget === B,
  { bucket: st.healBudget, budget: B });

// No potions: AUTO_DRINK must not confound the HP ledger.
P.potions.hp = 0; P.potions.mp = 0;
P.stats.lifesteal = 1000;                            // absurd: want always >> budget
P.hp = 1;
const hp0 = P.hp;
pushShot(100); frame();
ok('an absurd first hit heals in FULL up to one second\'s budget (burst preserved)',
  near(P.hp - hp0, B, 1e-9), P.hp - hp0);
ok('...and the burst DRAINS the bucket to zero', st.healBudget < 1e-9, st.healBudget);

// Sustained: one hit per frame for 120 frames (2s). Every frame the refill
// adds budget*dt and the hit takes it all — the delivered rate is EXACTLY cap.
let healedSec1 = 0, healedSec2 = 0;
for (let i = 0; i < 120; i++) {
  const before = P.hp;
  pushShot(100); frame();
  const got = P.hp - before;
  if (i < 60) healedSec1 += got; else healedSec2 += got;
}
ok('absurd stream, second 1: healed <= HEAL_CAP_FRAC*maxHp (the cap, asserted)',
  healedSec1 <= B + 1e-9, healedSec1);
ok('absurd stream, second 1: healed is the cap rate EXACTLY (not starved either)',
  near(healedSec1, B, 1e-7), healedSec1);
ok('absurd stream, second 2: same rate again — sustained, not a one-off',
  near(healedSec2, B, 1e-7), healedSec2);

// Quiet: no hits for 2s. The bucket refills to one budget and CLAMPS there.
for (let i = 0; i < 120; i++) frame();
ok('a quiet second refills to exactly one budget (and never beyond)',
  near(st.healBudget, B, 1e-9), st.healBudget);

// Below the cap: a modest hit is byte-identical to the old formula (the same
// fp op the uncapped code performed: p.hp + dmg*lifesteal, bit for bit).
P.stats.lifesteal = 0.02;
P.hp = 50;
const before = P.hp;
pushShot(40); frame();
ok('below the cap the healed HP is BIT-IDENTICAL to p.hp + dmg*lifesteal',
  P.hp === before + 40 * P.stats.lifesteal, { got: P.hp, want: before + 40 * P.stats.lifesteal });

// Per-run reset: drain, restart the run, the bucket is full again.
P.stats.lifesteal = 1000;
pushShot(100); frame();                              // drain whatever refilled
h.startRun();
ok('the bucket RESETS per run (fresh run = full budget)',
  st.healBudget === CAP * st.player.stats.maxHp,
  { bucket: st.healBudget, budget: CAP * st.player.stats.maxHp });

console.log(`test_lifesteal_cap: all ${passed} checks passed`);
