// HORDES — A2 RADAR WIRING tests (the brief's acceptance item 2: "a test that
// pins the WIRING — the toggle plus at least one dot classified through
// RADAR_TIERS. A module test that never mounts the game does not count").
//
// test_radar.mjs pins the DATA layer (radar.js, pure). This file pins the
// WIRING through the REAL mounted game (test/_harness.mjs boots src/main.js):
//   1. the radar starts OFF and paints nothing;
//   2. a real keydown('r') through the game's OWN key handler turns it on
//      (state flag + the renderer's painted-frame seam);
//   3. the painted dots are EXACTLY radar.js's radarDots() output for the
//      live state — positions AND tiers (elite/boss/chaff classified by the
//      module's classifyTier, never restated here);
//   4. dot paint is tier-shaped (elite = 5px, boss = 7px, chaff = 3px) at the
//      radar-space position the data layer returned;
//   5. toggling OFF restores the previous HUD EXACTLY: the radar's paint ops
//      are the frame's tail, so the off-frame must be an exact prefix of the
//      on-frame, the seam must read null, and hudChrome must be untouched
//      (no leaked chrome, no leftover canvas — the radar owns no DOM at all);
//   6. the touch path (runAction('radar'), what the RADAR button routes
//      through) toggles mid-run and NOT while paused, and the button's lit
//      frame (class 'on') tracks the state flag;
//   7. OS key-repeat cannot strobe the toggle (REPEAT_GUARDED);
//   8. the SAME painted radar at 60Hz and 120Hz on a frozen field — nothing
//      in the paint path assumes a dt.
//
// Run: node test/test_radar_wiring.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { radarDots, RADAR_TIERS, RADAR_RADIUS } from '../src/radar.js';

const S = suite('A2 RADAR WIRING');
const h = await boot();
const { state, T, pump, key, rec, elements } = h;

// Fixed HUD geometry, mirrored from render.js's paint constants (the seam
// below is what must agree with them — a drift fails the geometry checks).
const VIEW_W = 480, VIEW_H = 300;
const R = 34, INSET = 10;
const CX = VIEW_W - INSET - R;          // 436
const CY = VIEW_H - INSET - R;          // 256
const CFG = { radius: RADAR_RADIUS, displayRadius: R };
const inBox = (r) =>
  r.x >= CX - R - 1 && r.x + r.w <= CX + R + 2 &&
  r.y >= CY - R - 1 && r.y + r.h <= CY + R + 2;

// --- boot a real run ---------------------------------------------------------
T.startRun();
for (let i = 0; i < 6 && state.mode !== 'playing'; i++) {
  if (state.mode === 'intro') key('keydown', { key: ' ' });
  pump(1);
}
assert.equal(state.mode, 'playing', 'the run must reach playing');

// The expected dot set, from the REAL data layer, for the current field.
const expectedDots = () => {
  const live = state.enemies.filter((e) => e && e.hp > 0);
  return radarDots(state.player, live, CFG);
};
// A controlled, frozen field: stats mode pauses the sim (the world keeps
// rendering), so a fixture cannot be moved/killed between pump and assert.
const freezeWith = (fixtures) => {
  T.openStats();
  assert.equal(state.mode, 'stats');
  state.enemies.length = 0;
  for (const f of fixtures) state.enemies.push(f);
  state.toasts.length = 0;            // the feed is chrome too — keep frames comparable
};
const frameRects = () => {
  rec.on = true;
  const n0 = rec.rects.length;
  pump(1);
  rec.on = false;
  // `n` is the recorder's GLOBAL sequence number — it legitimately differs
  // between two frames, so it is stripped before any cross-frame comparison.
  return rec.rects.slice(n0).map(({ x, y, w, h: hh, d }) => ({ x, y, w, h: hh, d }));
};

// --- 1. off by default, nothing painted --------------------------------------
pump(1);
S.check('radar starts OFF: flag false, seam null', () => {
  assert.equal(state.radarOn, false);
  assert.equal(T.radar.on, false);
  assert.equal(T.renderer.radar, null);
});

// --- 2. the real key toggles it on -------------------------------------------
key('keydown', { key: 'r' });
S.check('keydown r through the game handler turns the radar ON', () => {
  assert.equal(state.radarOn, true);
  assert.equal(T.radar.on, true);
});
pump(1);
S.check('the painted frame publishes the radar seam at the fixed box', () => {
  const seam = T.renderer.radar;
  assert.ok(seam, 'renderer.radar must be live while the radar is on');
  assert.equal(seam.cx, CX);
  assert.equal(seam.cy, CY);
  assert.equal(seam.r, R);
  assert.equal(seam.focusR, Math.round(100 * R / RADAR_RADIUS)); // AUTOPILOT.FOCUS_RANGE
});

// --- 3. dots are the data layer's output, tiers and all -----------------------
const p = state.player;
freezeWith([
  { x: p.x + 100, y: p.y, hp: 5, elite: true, typeId: 'BRUTE' },        // ELITE, dist 100
  { x: p.x - 200, y: p.y + 100, hp: 50, boss: true, typeId: 'ORACLE' }, // BOSS, dist ~224
  { x: p.x, y: p.y - 300, hp: 5, typeId: 'CHASER' },                    // CHAFF, dist 300
  { x: p.x + 400, y: p.y, hp: 5, typeId: 'CHASER' },                    // beyond 330: omitted
  { x: p.x + 10, y: p.y, hp: 0, elite: true, typeId: 'BRUTE' },         // dead: omitted
]);
pump(1);
S.check('painted dots equal radarDots() exactly — positions and RADAR_TIERS classes', () => {
  const seam = T.renderer.radar;
  assert.ok(seam);
  const want = expectedDots();
  assert.equal(seam.dots.length, 3, 'the beyond-radius and the dead fixture produce no dot');
  assert.equal(want.length, 3);
  for (let i = 0; i < want.length; i++) {
    assert.equal(seam.dots[i].x, CX + want[i].x, 'screen x = box centre + radar-space x');
    assert.equal(seam.dots[i].y, CY + want[i].y, 'screen y = box centre + radar-space y');
    assert.equal(seam.dots[i].tier, want[i].tier);
    assert.equal(seam.dots[i].typeId, want[i].typeId);
  }
  // The classification itself, named through the module's own constants.
  const byTier = {};
  for (const d of seam.dots) byTier[d.tier] = (byTier[d.tier] || 0) + 1;
  assert.deepEqual(byTier, { [RADAR_TIERS.ELITE]: 1, [RADAR_TIERS.BOSS]: 1, [RADAR_TIERS.CHAFF]: 1 });
  assert.deepEqual(seam.counts, { chaff: 1, elite: 1, boss: 1 });
});

// --- 4. the paint is tier-shaped at the data layer's positions ----------------
{
  const rects = frameRects();
  S.check('elite/boss/chaff dots paint as 5/7/3px rects at their seam positions', () => {
    const seam = T.renderer.radar;
    for (const d of seam.dots) {
      const size = d.tier === RADAR_TIERS.BOSS ? 7 : d.tier === RADAR_TIERS.ELITE ? 5 : 3;
      const o = Math.floor(size / 2);
      assert.ok(
        rects.some((r) => r.x === d.x - o && r.y === d.y - o && r.w === size && r.h === size),
        `no ${size}px rect at ${d.tier} dot (${d.x},${d.y})`);
    }
  });
  S.check('the radar box itself is painted (plate rows + rim pixels inside the box)', () => {
    const boxRects = rects.filter(inBox);
    assert.ok(boxRects.length > 100, `expected plate+rim+dots paint, got ${boxRects.length} rects`);
  });
}

// --- 5. toggle OFF restores the previous HUD EXACTLY ---------------------------
{
  state.toasts.length = 0;
  const onFrame = frameRects();                    // radar ON, frozen field
  const chromeOn = JSON.stringify(T.renderer.hudChrome);
  T.radar.toggle();                                // OFF (seam == the button/key path)
  assert.equal(state.radarOn, false);
  state.toasts.length = 0;                         // drain the toggle's own toast
  const offFrame = frameRects();
  S.check('off-frame is an exact PREFIX of on-frame (radar paint is the frame tail)', () => {
    assert.ok(onFrame.length > offFrame.length, 'the radar must add paint ops');
    assert.deepEqual(onFrame.slice(0, offFrame.length), offFrame);
  });
  S.check('every extra paint op lands INSIDE the radar box (nothing leaks elsewhere)', () => {
    for (const r of onFrame.slice(offFrame.length)) assert.ok(inBox(r), `leak at ${JSON.stringify(r)}`);
  });
  S.check('seam null + HUD chrome byte-identical after toggle off', () => {
    assert.equal(T.renderer.radar, null);
    assert.equal(JSON.stringify(T.renderer.hudChrome), chromeOn);
  });
  S.check('no radar DOM exists to leak (the touch button is the only radar element)', () => {
    assert.ok(elements['tc-radar'], 'the RADAR touch button registered');
    assert.equal(elements['radar'], undefined, 'no radar overlay element was ever created');
  });
}

// --- 6. the touch path: runAction gates + the button's lit frame --------------
S.check('runAction(radar) does NOT toggle while paused (stats)', () => {
  T.runAction('radar');
  assert.equal(state.radarOn, false);
});
T.closeStats();
assert.equal(state.mode, 'playing');
T.runAction('radar');                              // what the RADAR button routes through
S.check('runAction(radar) toggles mid-run and the button frame tracks the flag', () => {
  assert.equal(state.radarOn, true);
  pump(1);
  assert.equal(elements['tc-radar'].classList.contains('on'), true);
});

// --- 7. OS key-repeat cannot strobe the toggle --------------------------------
S.check('a repeat keydown(r) is swallowed (REPEAT_GUARDED)', () => {
  key('keydown', { key: 'r', repeat: true });
  assert.equal(state.radarOn, true, 'repeat must not flip the toggle back');
});

// --- 8. 60Hz vs 120Hz: the identical painted radar on the identical state -----
{
  T.openStats();                                   // freeze the field again
  state.toasts.length = 0;
  pump(1);
  const snap = () => JSON.stringify(T.renderer.radar);
  const at60 = snap();
  h.setFrameMs(1000 / 120);
  pump(4);
  const at120 = snap();
  h.setFrameMs(1000 / 60);
  S.check('the painted radar is byte-identical at 60Hz and 120Hz (no dt anywhere)', () => {
    assert.equal(at120, at60);
  });
  T.closeStats();
}

S.done();
