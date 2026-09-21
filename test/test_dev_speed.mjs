// HORDES — SLICE 8 dev-run speed control (node).
// The overlay SPEED button substeps the SIM (N update() calls per frame with
// the frame's dt UNCHANGED — never dt*N); snapshots stamp the speed used
// (schema_v 2). Determinism: seeded 1x vs 2x/4x/8x over the same sim-time is
// EXACT per sim-step (integer-ms frame clock, so the harness rAF clock is
// bitwise identical in every arm — the same control the slice proof uses).
// Run: node test/test_dev_speed.mjs
import assert from 'node:assert';
import {
  DEV_SPEEDS, devNormSpeed, devNextSpeed, SNAPSHOT_KEYS, validateSnapshot,
} from '../src/dev_telemetry.js';
import { boot } from './_harness.mjs';

// ---- pure speed helpers -------------------------------------------------------
{
  assert.deepEqual(DEV_SPEEDS, [1, 2, 4, 8], 'offered speeds are 1x/2x/4x/8x');
  for (const n of [1, 2, 4, 8]) {
    assert.equal(devNormSpeed(n), n, 'offered speed ' + n + 'x passes through');
  }
  for (const bad of [0, 3, 5, 6, 7, 99, -2, NaN, 1.5, 'x', undefined, null, {}]) {
    assert.equal(devNormSpeed(bad), 1, 'non-offered speed fails closed to 1x: ' + String(bad));
  }
  assert.deepEqual(
    [1, 2, 4, 8].map(devNextSpeed), [2, 4, 8, 1], 'SPEED cycles 1x->2x->4x->8x->1x');
  assert.equal(devNextSpeed(99), 2, 'cycle normalizes first (garbage -> 1x -> 2x)');
}

// ---- seeded lockstep across speeds --------------------------------------------
// One arm per speed over the SAME sim-time (2 sim-s: wave-1 combat, no draft
// or banner freezes this early). Integer-ms frames keep the harness clock
// bitwise identical, so every substep in every arm sees the same dt.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realRandom = Math.random;

async function arm({ variant, speed, frames }) {
  const h = await boot({ locationSearch: '?dev=1', variant });
  h.setFrameMs(16);
  Math.random = mulberry32(0xC10C);
  try {
    const T = h.T;
    T.startRun();
    assert.equal(T.dev.setSpeed(speed), speed, 'seam sets ' + speed + 'x');
    h.pump(frames);
    const s = h.state, d = T.dev.session;
    T.dev.onRunEnd(); // the REAL run-end snapshot path (mid-run values)
    await new Promise((r) => setTimeout(r, 25)); // let the offline POST settle
    return {
      speed, seed: s.choiceSeed, mode: s.mode, time: s.time, wave: s.wave.num,
      earned: s.runCounts.gold.earned, spent: s.runCounts.gold.spent,
      dmg: Math.round(d.dmg), steps: d.steps, stepDt: d.stepDt,
      snap: d.snapshot,
    };
  } finally {
    Math.random = realRandom;
  }
}

const SIM_S = 2;
const F1 = SIM_S * 60;
const got = {};
for (const n of DEV_SPEEDS) {
  got[n] = await arm({ variant: 's8t' + n, speed: n, frames: Math.round(F1 / n) });
}
{
  const base = got[1];
  assert.equal(base.mode, 'playing', 'horizon stays in live play (no freeze)');
  assert.equal(base.steps, F1, '1x steps exactly one update per frame');
  assert.ok(base.stepDt > 0 && base.stepDt <= 0.05, 'substep dt is the frame dt, never scaled');
  for (const n of [2, 4, 8]) {
    const a = got[n];
    assert.equal(a.seed, base.seed, n + 'x runs the same seed');
    assert.equal(a.mode, base.mode, n + 'x same mode');
    assert.equal(a.time, base.time, n + 'x same sim-time');
    assert.equal(a.wave, base.wave, n + 'x same wave');
    assert.equal(a.earned, base.earned, n + 'x same gold earned');
    assert.equal(a.spent, base.spent, n + 'x same gold spent');
    assert.equal(a.dmg, base.dmg, n + 'x same damage');
    assert.equal(a.steps, F1, n + 'x steps exactly frames x speed (' + a.steps + ')');
    assert.equal(a.stepDt, base.stepDt, n + 'x substep dt identical to 1x (never dt*N)');
    // Snapshot shape: the 12 required keys first, in order (slice-8 core),
    // then the slice-9 additive optionals — the FULL key set identical
    // across speeds, and the reader accepts every arm's snapshot.
    assert.deepEqual(Object.keys(a.snap).slice(0, SNAPSHOT_KEYS.length), SNAPSHOT_KEYS,
      n + 'x snapshot required keys first, in order');
    assert.deepEqual(Object.keys(a.snap), Object.keys(base.snap),
      n + 'x snapshot full key set identical to 1x');
    assert.equal(validateSnapshot(a.snap).ok, true, n + 'x snapshot validates');
    assert.deepEqual(a.snap.choices, base.snap.choices, n + 'x same choice audit');
    assert.equal(a.snap.mode, base.snap.mode, n + 'x same mode field');
    assert.deepEqual(a.snap.modifiers, base.snap.modifiers, n + 'x same modifiers');
    assert.equal(a.snap.speed, n, n + 'x snapshot stamps its speed');
    assert.equal(a.snap.seed, base.seed, n + 'x snapshot same seed');
  }
  assert.equal(base.snap.speed, 1, '1x snapshot stamps speed 1');
}

// ---- the REAL overlay SPEED button cycles the live session --------------------
{
  const h = await boot({ locationSearch: '?dev=1', variant: 's8btn' });
  h.setFrameMs(16);
  const T = h.T;
  T.startRun();
  h.pump(3);
  const box = (globalThis.document.body.children || [])
    .find((el) => el && el.id === 'dev-panel');
  assert.ok(box, 'dev overlay panel exists (?dev=1 gate)');
  const btn = (box.children || []).find((el) =>
    el && typeof el.textContent === 'string' && el.textContent.startsWith('SPEED'));
  assert.ok(btn, 'SPEED button exists in the overlay');
  assert.equal(T.dev.session.speed, 1, 'run opens at 1x');
  btn.click(); assert.equal(T.dev.session.speed, 2, 'click -> 2x');
  btn.click(); assert.equal(T.dev.session.speed, 4, 'click -> 4x');
  btn.click(); assert.equal(T.dev.session.speed, 8, 'click -> 8x');
  btn.click(); assert.equal(T.dev.session.speed, 1, 'click wraps -> 1x');
  assert.match(btn.textContent, /SPEED: 1x/, 'button label carries the live value');
}

// ---- gate OFF: no session, no speed, no steps ----------------------------------
{
  const h = await boot();
  const T = h.T;
  assert.equal(T.dev.gate, false, 'harness boot (no ?dev=1) leaves the gate off');
  assert.equal(T.dev.setSpeed(8), null, 'speed seam is null with the gate off');
  T.startRun();
  h.pump(120);
  assert.equal(T.dev.session, null, 'no dev session with the gate off');
}

console.log('test_dev_speed: all checks passed');
