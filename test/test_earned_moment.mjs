// HORDES — WAVE-26 FEATURE 4: EARNED SLOW-MO + GLOW.
// Run: node test/test_earned_moment.mjs
//
// Asserts the design contract exactly:
//   (1) time dilation returns to EXACTLY 1 after the window;
//   (2) two triggers landing in the same frame do NOT stack (the scale is a
//       MIN, the window a MAX — never a product);
//   (3) the effect is FRAME-RATE INDEPENDENT: 60Hz and 120Hz spend the same
//       wall-clock seconds in slow-mo and accumulate the same scaled sim time;
//   (4) ONLY the two earned moments trigger it — an ordinary hit, a level-up
//       and a chest opening must not (checked against the real call sites);
//   (5) the flourish is integer-pixel only and never softens/occludes the HUD.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONFIG as C } from '../src/config.js';
import { boot, dtMs, suite } from './_harness.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');

const S = suite('wave-26 earned slow-mo + glow');
const { T, state, elements, rec, ctx, pump } = await boot({
  storage: [['hordes_onboarded', '1']],
});

// ---- (1) return to exactly 1 -------------------------------------------------
S.check('timeScale returns to EXACTLY 1 after the window expires', () => {
  T.dilation.trigger(0.5, 0.1);
  assert.ok(Math.abs(T.dilation.timeScale - 0.5) < 1e-9, 'scale applied');
  assert.ok(T.dilation.advance(0.05) < 1, 'still dilated mid-window');
  assert.ok(T.dilation.advance(0.04) < 1, 'still dilated at 0.09s');
  const after = T.dilation.advance(0.02);       // 0.11s > 0.1s window
  assert.equal(after, 1, 'returns exactly 1 on expiry');
  assert.equal(T.dilation.scale, 1, 'internal scale reset to exactly 1');
  assert.equal(T.dilation.remaining, 0, 'window drained to exactly 0');
  assert.equal(T.dilation.advance(1 / 60), 1, 'and stays 1 on later frames');
});

// ---- (2) no stacking ---------------------------------------------------------
S.check('two triggers in the same frame do NOT stack', () => {
  T.dilation.advance(10);                       // force back to 1
  const a = T.dilation.trigger(0.5, 0.3);
  const b = T.dilation.trigger(0.5, 0.3);       // same frame, same event
  assert.equal(a, 0.5, 'first trigger sets 0.5');
  assert.equal(b, 0.5, 'second trigger does NOT multiply (would be 0.25)');
  assert.equal(T.dilation.scale, 0.5, 'scale is the MIN, never a product');
  assert.ok(Math.abs(T.dilation.remaining - 0.3) < 1e-9, 'window is the MAX, never a sum');
});

S.check('a weaker trigger during a stronger one cannot deepen or extend it', () => {
  T.dilation.advance(10);
  T.dilation.trigger(0.2, 0.1);                 // strong, short
  T.dilation.trigger(0.8, 5);                   // weak, long — must only extend
  assert.equal(T.dilation.scale, 0.2, 'scale stays the stronger value');
  assert.ok(Math.abs(T.dilation.remaining - 5) < 1e-9, 'window takes the longer of the two');
  T.dilation.advance(10);
  assert.equal(T.dilation.timeScale, 1, 'back to normal');
});

S.check('a zero/blank duration is a no-op (cannot freeze the sim)', () => {
  T.dilation.advance(10);
  T.dilation.trigger(0.01, 0);
  assert.equal(T.dilation.timeScale, 1, 'no window -> no dilation');
});

S.check('the floor keeps even a runaway scale sane', () => {
  T.dilation.advance(10);
  T.dilation.trigger(0.0001, 0.1);
  assert.equal(T.dilation.scale, C.DILATION.FLOOR, 'clamped to CONFIG.DILATION.FLOOR');
  T.dilation.advance(10);
});

// ---- (3) frame-rate independence --------------------------------------------
// Simulate the SAME wall-clock second at 60Hz and at 120Hz and compare the
// scaled sim time both spend. A fixed-dt assumption would show up here as a
// different total (and would re-break the fire-window contract).
function scaledSimTime(hz, seconds) {
  T.dilation.advance(10);
  T.dilation.trigger(C.DILATION.EVOLUTION.SCALE, C.DILATION.EVOLUTION.DURATION);
  const dt = 1 / hz;
  const frames = Math.round(seconds * hz);
  let sim = 0;
  for (let i = 0; i < frames; i++) sim += dt * T.dilation.advance(dt);
  return { sim, scale: T.dilation.timeScale };
}
S.check('60Hz and 120Hz accumulate the SAME scaled sim time (frame-rate independent)', () => {
  const a = scaledSimTime(60, 1.0);
  const b = scaledSimTime(120, 1.0);
  assert.equal(a.scale, 1, '60Hz ends at exactly 1');
  assert.equal(b.scale, 1, '120Hz ends at exactly 1');
  assert.ok(Math.abs(a.sim - b.sim) < 0.02,
    'same wall-clock second -> same sim time (60Hz ' + a.sim.toFixed(4) +
    ' vs 120Hz ' + b.sim.toFixed(4) + ')');
});
S.check('a 30Hz frame (long frame) neither double-fires nor skips the dilation', () => {
  const c = scaledSimTime(30, 1.0);
  assert.equal(c.scale, 1, 'back to 1 at 30Hz too');
  assert.ok(Math.abs(c.sim - scaledSimTime(60, 1.0).sim) < 0.05,
    'slower frames land within one frame of the 60Hz total');
});

// ---- (4) ONLY earned moments ------------------------------------------------
S.check('the ONLY trigger sites are a weapon evolution and a boss kill', () => {
  const src = read('src/main.js');
  const calls = [...src.matchAll(/triggerEarnedMoment\(\s*'([a-z]+)'/g)].map(m => m[1]);
  assert.deepEqual([...new Set(calls)].sort(), ['boss', 'evolution', 'finale'],
    'exactly three call sites: evolution, boss, finale (got ' + calls.join(',') + ')');
  // No trigger may sit in the level-up, chest/loot or ordinary-hit paths.
  const forbidden = [
    [/function levelUp\([\s\S]{0,900}?triggerEarnedMoment/, 'level-up'],
    [/maybeSpawnChest[\s\S]{0,600}?triggerEarnedMoment/, 'chest drop'],
    [/(openChest\w*|applyContents)[\s\S]{0,600}?triggerEarnedMoment/, 'chest open'],
  ];
  for (const [re, what] of forbidden) {
    assert.ok(!re.test(src), 'no dilation on ' + what);
  }
});

S.check('render.js drives the flourish only from state.moment', () => {
  const src = read('src/render.js');
  assert.ok(/drawMoment\(g, state\)/.test(src), 'render() calls drawMoment');
  assert.ok(/const m = state\.moment;/.test(src), 'and reads state.moment');
  // INTEGER PIXELS ONLY: every fillRect in drawMoment is rounded/stepped.
  const body = src.slice(src.indexOf('drawMoment(g, state) {'), src.indexOf('// ---- WAVE-12 HUD chrome'));
  assert.ok(body.length > 200, 'drawMoment body found');
  assert.ok(!/globalAlpha\s*=\s*Math\.random|createRadialGradient|shadowBlur|filter\s*=/.test(body),
    'no gradients, no shadowBlur, no CSS filters (nothing that softens the art)');
  for (const m of body.matchAll(/fillRect\(([^)]*)\)/g)) {
    assert.ok(!/\d+\.\d+/.test(m[1]) || /Math\.(round|max|min|cos|sin)/.test(m[1]),
      'fillRect args are integer or rounded: ' + m[1]);
  }
});

// ---- (5) the live loop honours it, and the HUD stays legible ----------------
S.check('the real frame loop scales sim time and the moment decays on wall clock', () => {
  T.startRun();
  pump(3);
  assert.equal(state.mode, 'playing', 'run is live');
  const t0 = state.time;
  pump(1);
  const normalStep = state.time - t0;
  assert.ok(normalStep > 0, 'the clock advances normally');

  // Fire an earned moment, then confirm the sim is genuinely slowed.
  state.moment = null;
  T.dilation.trigger(0.5, 0.5);
  const t1 = state.time;
  pump(1);
  const slowStep = state.time - t1;
  assert.ok(slowStep < normalStep * 0.8,
    'a dilated frame advances the sim slower (' + slowStep.toFixed(5) + ' vs ' + normalStep.toFixed(5) + ')');
  assert.ok(state.timeScale < 1, 'state.timeScale is published for the renderer');

  // The flourish ran and decayed on WALL-CLOCK time.
  T.triggerEarnedMoment('evolution', state.player.x, state.player.y);
  assert.ok(state.moment && state.moment.kind === 'evolution', 'moment live');
  const ttl = state.moment.ttl;
  pump(Math.ceil((ttl + 0.2) / (dtMs / 1000)));
  assert.equal(state.moment, null, 'the moment expires instead of sticking');
  assert.equal(state.timeScale, 1, 'and the sim is back to exactly 1');

  // HUD legibility regression guard: with a flare live, the HUD chrome still
  // paints (the flare sits UNDER the chrome).
  T.triggerEarnedMoment('boss', state.player.x, state.player.y);
  rec.on = true; rec.rects.length = 0; rec.texts.length = 0;
  T.renderer.render(state, state.cam);
  rec.on = false;
  assert.ok(T.renderer.moment && T.renderer.moment.band >= 0, 'the flare painted');
  assert.ok(T.renderer.hudChrome && T.renderer.hudChrome.hpFrac >= 0,
    'the HUD chrome still painted through the flare');
  assert.ok(rec.rects.some(q => q.d === 0), 'native-depth HUD rects present');
  assert.ok(rec.texts.some(t => /^HP /.test(t.txt) || /^LV/.test(t.txt) || t.d === 0),
    'HUD text still painted');
});

S.check('a new run starts undilated with no stale flare', () => {
  T.triggerEarnedMoment('boss', 0, 0);
  T.startRun();
  assert.equal(state.timeScale, 1, 'timeScale reset on a fresh run');
  assert.equal(state.moment, null, 'no flare carried into the new run');
});

S.done();
