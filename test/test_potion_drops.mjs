// HORDES — G33 ADAPTIVE POTION DROPS (owner directive, 2026-09-16, verbatim:
// "we should have adaptive potion drops as the enemies killed per second
// increases, potion drop rate should drop in a somewhat inverse pattern").
//
// Pins, per docs/briefs/ADAPTIVE_POTION_DROPS.md:
//   - the curve (loot.js adaptiveDropFactor): EXACTLY 1 at kps = 0 and at every
//     low rate (early game byte-identical, BASE untouched); monotonically
//     non-increasing above REF_KPS; the FLOOR holds as kps grows without bound;
//     derived income kps*BASE*factor is linear below the reference and FLAT
//     above it (the asymptote asserted NUMERICALLY: BASE*min(kps, REF_KPS))
//     through the whole measured swarm band (max observed 93 <= REF/FLOOR=100).
//   - the estimator (loot.js ewmaKillRate): dt-driven (dt=0 is a frozen no-op),
//     converges on a constant kill stream, and DECAYS back down when kills stop.
//   - the wiring (real loop, tools/real_loop.mjs bootReal): update() ticks the
//     EWMA from the p.kills delta every frame; the drop roll multiplies the
//     factor (with DROP_CHANCE forced to 1: every corpse drops at rate 0, and a
//     swarm-rate run drops strictly fewer than the corpses); MAX_CARRIED still
//     bounds storage at the pickup gate.
// Run: node test/test_potion_drops.mjs
import assert from 'node:assert/strict';
import { adaptiveDropFactor, ewmaKillRate } from '../src/loot.js';
import { CONFIG as C } from '../src/config.js';
import { bootReal } from '../tools/real_loop.mjs';

let passed = 0;
function ok(name, cond, detail) {
  if (!cond) { console.error('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); }
  passed++;
  console.log('  ok - ' + name);
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const { REF_KPS, FLOOR_FRAC, TAU } = C.POTIONS.ADAPTIVE;
const BASE = C.POTIONS.DROP_CHANCE;
const factor = (kps) => adaptiveDropFactor(kps, REF_KPS, FLOOR_FRAC);
const income = (kps) => kps * BASE * factor(kps);   // potions/second the curve pays

// ---- 1. the low-rate end is byte-identical ------------------------------------
ok('config: ADAPTIVE knobs present, TAU in the 5-10s band',
  REF_KPS > 0 && FLOOR_FRAC >= 0.2 && FLOOR_FRAC <= 0.3 && TAU >= 5 && TAU <= 10,
  { REF_KPS, FLOOR_FRAC, TAU });
ok('kps = 0: factor is EXACTLY 1 (fresh save, measured 0.2-0.3 kps)', factor(0) === 1);
ok('measured ordinary rates (0.3, 0.6, 6.9 kps): factor EXACTLY 1',
  factor(0.3) === 1 && factor(0.6) === 1 && factor(6.9) === 1);
ok('at kps === REF_KPS: factor EXACTLY 1 (the bend starts strictly above)',
  factor(REF_KPS) === 1);
ok('BASE itself is untouched (0.03, was the flat per-kill chance)', BASE === 0.03);

// ---- 2. above the reference: monotone, floored, income FLAT --------------------
let mono = true;
for (let k = REF_KPS; k <= 200; k += 5) if (factor(k + 5) > factor(k) + 1e-12) mono = false;
ok('monotonically non-increasing from REF_KPS to 200 kps', mono);
ok('the floor holds as kps grows large', factor(1e6) === FLOOR_FRAC && factor(1e9) === FLOOR_FRAC);
ok('just above the reference the curve bends (REF+1 < 1)', factor(REF_KPS + 1) < 1);
let flat = true;
for (const k of [REF_KPS, 25, 30, 50, 66.8, 80, 93, 100]) {   // 66.8/93 = measured p90/max
  if (!near(income(k), BASE * Math.min(k, REF_KPS), 1e-6)) flat = false;
}
ok('income = BASE*min(kps,REF) NUMERICALLY through the whole measured swarm band (flat at 0.6/s)',
  flat, [income(66.8), income(93)]);
ok('linear below the reference: income(10) == BASE*10 exactly', income(10) === BASE * 10);

// ---- 3. the estimator -----------------------------------------------------------
ok('dt = 0 is a frozen no-op (never wall-clock)', ewmaKillRate(7.5, 5, 0, TAU) === 7.5);
{ // constant stream converges on the true rate
  let r = 0;
  for (let i = 0; i < 60 * 48; i++) r = ewmaKillRate(r, 1, 1 / 60, TAU);   // 1 kill/frame = 60/s
  ok('a constant 60 kps stream converges (>= 59.9 after 8 tau)', r > 59.9, r);
}
{ // burst then quiet: the rate must come back DOWN
  let r = 0;
  for (let i = 0; i < 60 * 2; i++) r = ewmaKillRate(r, 2, 1 / 60, TAU);   // 120/s for 2s
  const peaked = r;
  for (let i = 0; i < 60 * 30; i++) r = ewmaKillRate(r, 0, 1 / 60, TAU);  // 30s quiet
  ok('after a burst, 30s of quiet decays the rate to under 1% of peak',
    r < peaked * 0.01, { peaked, r });
}

// ---- 4. the wiring (real loop) ---------------------------------------------------
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
// out of 'playing' mid-probe — a draft overlay would freeze the death pass and
// the estimator with it (that was a real suite red, not a hypothetical).
st.enemies.length = 0; st.drops.length = 0; st.gems.length = 0;
st.spawnTimer = 999; st.wave.endsAt = st.time + 9999; st.wave.midAt = st.time + 9999;
for (let i = 0; i < 30; i++) frame();   // a quiet second and a half: rate stays 0
ok('the live estimator sits at 0 with no kills', st.killRateEwma === 0);
st.player.kills += 120;                 // one swarm frame's worth of kills
frame();
ok('a kill burst registers in the SAME frame (>= 19 of the 20 it should jump to)',
  st.killRateEwma >= 19, st.killRateEwma);
const st0 = st.killRateEwma;   // the burst peak, for the decay check below
for (let i = 0; i < 60 * 30; i++) frame();   // 30s: decays (nothing to kill)
ok('30s later the live rate is under a quarter of the burst peak (decay, not latch)',
  st.killRateEwma < st0 / 4, st.killRateEwma);

// the drop roll multiplies the factor: DROP_CHANCE forced to 1, so at rate 0
// EVERY corpse drops; at a swarm rate strictly fewer do. Wave 1 keeps CHASER
// non-chaff (E2's chaff discount starts at C.E2.WAVE). Corpses sit 200px out —
// beyond pickup radius — so nothing is collected out from under the count.
//
// FIXTURE REPAIR (blocking-elevation suite run, 2026-09-17, disclosed): the
// old corpse shape carried no `speed`, so the enemy move seam computed
// spd = undefined*... = NaN and EVERY corpse teleported to (NaN, NaN) before
// the death pass — every drop clamped to (NaN, NaN), where pushGroundCapped's
// nearest-same-kind merge FAILS (NaN peer distances), so all 3000 drops
// bypassed DROP_CAP and st.drops.length equalled the raw winning rolls. The
// old count assertion passed BY EXPLOITING that NaN cap-evasion. The wall's
// cliff rule (reliefStep) double-blocks the NaN-target move for a corpse
// standing at level 0 and returns its FINITE origin, so part of the batch
// stayed finite, merged at cap 48, and the count became terrain-dependent
// (measured 274..557 across runs — the suite red). The repair: corpses carry
// speed: 0 (no NaN anywhere; behaviour a real kill actually has) and the
// pilot is pinned MANUAL at (0,0) so no pickup can siphon value mid-frame;
// the assertion counts TOTAL POTION VALUE (merged drops carry count) — the
// same 3000-roll 0.2-floor statistics, now measured through the cap instead
// of around it.
ok('probe runs in the live play loop', st.mode === 'playing', st.mode);
const savedChance = C.POTIONS.DROP_CHANCE;
st.pilotMode = 'MANUAL'; st.player.x = 0; st.player.y = 0;   // pin: drop line stays 200px+ away
const dropValue = () => st.drops.reduce((s, d) => s + (d.count || 1), 0);
const corpses = (n) => { for (let i = 0; i < n; i++) st.enemies.push(
  { x: st.player.x + 200, y: st.player.y + i, hp: 0, typeId: 'CHASER', xp: 0, speed: 0 }); };
try {
  C.POTIONS.DROP_CHANCE = 1;
  st.killRateEwma = 0; st.killsAtRateTick = st.player.kills;
  corpses(30); frame();
  ok('rate 0 + chance 1: all 30 corpses drop (factor 1, byte-identical low end)',
    dropValue() === 30, dropValue());
  st.drops.length = 0;
  st.killRateEwma = 1000; st.killsAtRateTick = st.player.kills;   // deep-swarm rate
  // 3000 corpses, not 30: at rate 1000 the FLOOR binds (factor = clamp(20/1000,
  // 0.2, 1) = 0.2), so a 30-corpse batch expects just 6 drops and the old
  // "> 0" half was a lottery (0.1% zero-odds, and it did fail in a G36 suite
  // run). A 3000-roll batch expects 600: assert the 0.16..0.24 factor band
  // (480..720, ~4 sigma) — a MUCH tighter pin of the floor than before.
  // Counted as VALUE: past DROP_CAP (48) the overflow merges same-kind drops
  // into counts, so the floor is pinned through the merge, not by evading it.
  corpses(3000); frame();
  const v = dropValue();
  ok('rate 1000: the floor binds — drops at the 0.2 factor band (480..720 of 3000)',
    v >= 480 && v <= 720, v);
} finally {
  C.POTIONS.DROP_CHANCE = savedChance;
}

// MAX_CARRIED still bounds storage: a full inventory leaves the potion on the ground
st.drops.length = 0; st.enemies.length = 0;
st.player.potions.hp = C.POTIONS.MAX_CARRIED;
st.drops.push({ x: st.player.x, y: st.player.y, kind: 'hp' });
frame();
ok('MAX_CARRIED bounds storage: a full flask leaves the drop un-consumed',
  st.player.potions.hp === C.POTIONS.MAX_CARRIED && st.drops.length === 1);

console.log(`test_potion_drops: all ${passed} checks passed`);
