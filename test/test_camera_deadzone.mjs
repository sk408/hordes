// HORDES — WAVE-27 ITEM 4: CAMERA DEADZONE (decouple from perfect centre).
//
// Owner: "It would actually give a nice movement feel to the pilot if they
// became disconnected from center camera near walls." Pre-fix the camera lerped
// to `player - VIEW/2` (main.js:1575/3488), so the player was PINNED to screen
// centre and the arena scrolled behind a fixed point.
//
// The fix: main.js updateCamera — the player roams free inside a SCREEN-px box
// around the view centre, the view follows with a small lead in the direction
// of travel, and an asymmetric arena clamp stops the view near a wall so the
// player drifts toward the safe screen edge.
//
// CRITICAL: the tour coachmark projects world -> screen through the same
// transform (worldRegion). This file proves the projection still lands on the
// pixel the world layer actually drew, after the camera has moved.
//
// Run: node test/test_camera_deadzone.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONFIG as C } from '../src/config.js';
import { boot, suite } from './_harness.mjs';

const S = suite('camera deadzone (item 4)');
const { T, state, pump, handlers, rec, setFrameMs } = await boot({
  storage: [['hordes_onboarded', '1']],
});
const CAM = C.CAMERA;
const VW = C.VIEW_W, VH = C.VIEW_H;
const RIM = C.GROUND.RIM;

// The player's position on screen, through the render transform.
const screenOf = (x, y) => {
  const Z = T.renderer.worldView.zoom;
  return {
    x: VW / 2 + (x - state.cam.x - VW / 2) * Z,
    y: VH / 2 + (y - state.cam.y - VH / 2) * Z,
  };
};
const clearField = () => {
  state.enemies.length = 0;
  state.gems.length = 0;
  state.itemDrops.length = 0;
  state.drops.length = 0;
  state.projectiles.length = 0;
};
const park = (x, y) => {
  state.player.x = x;
  state.player.y = y;
  state.cam.x = x - VW / 2;
  state.cam.y = y - VH / 2;
  state.camBase.x = x - VW / 2;
  state.camBase.y = y - VH / 2;
  state.camLead.x = 0;
  state.camLead.y = 0;
  state.camPrev.x = x;
  state.camPrev.y = y;
};

// A known, quiet run with the human owning movement.
T.startRun();
pump(3);
state.spawnTimer = 99999;
state.wave.endsAt = state.time + 99999;
handlers.keydown({ key: 'm' });
clearField();
park(0, 0);
pump(2);

// ---- the deadzone itself ---------------------------------------------------
S.check('the player is free inside the box; the view does not track 1:1', () => {
  park(0, 0);
  pump(1);
  const cam0 = { ...state.cam };
  // Walk 40 world px in +x in 1px steps (inside the box: DEADZONE_W = 64).
  for (let i = 0; i < 40; i++) { state.player.x += 1; pump(1); clearField(); }
  const camMoved = state.cam.x - cam0.x;
  assert.ok(Math.abs(camMoved) <= CAM.LEAD + 1,
    'inside the box the view moves at most the LEAD (' + camMoved.toFixed(2) + ')');
  const s = screenOf(state.player.x, state.player.y);
  assert.ok(Math.abs(s.x - VW / 2) <= CAM.DEADZONE_W + 1,
    'and the player stays inside the deadzone box (screen off ' + (s.x - VW / 2).toFixed(1) + ')');
  // Keep walking: past the box edge the view follows, holding the box edge.
  for (let i = 0; i < 120; i++) { state.player.x += 1; pump(1); clearField(); }
  const s2 = screenOf(state.player.x, state.player.y);
  assert.ok(Math.abs(s2.x - VW / 2) <= CAM.DEADZONE_W + 1,
    'past the box the view tracks the box edge (off ' + (s2.x - VW / 2).toFixed(1) + ')');
  assert.ok(state.cam.x > cam0.x + 100, 'the view really did travel');
});

S.check('the lead points in the direction of travel', () => {
  park(0, 0);
  pump(1);
  // Settle the lead at zero, then travel east.
  state.player.x = 0; state.player.y = 0;
  for (let i = 0; i < 90; i++) { pump(1); clearField(); }
  park(0, 0);
  for (let i = 0; i < 90; i++) { state.player.x += 0.5; pump(1); clearField(); }
  const sEast = screenOf(state.player.x, state.player.y).x - VW / 2;
  assert.ok(state.camLead.x > CAM.LEAD * 0.5,
    'moving east builds an eastward lead (' + state.camLead.x.toFixed(2) + ')');
  assert.ok(sEast < CAM.DEADZONE_W, 'the player sits LEFT of centre (view leads the way)');
  // Reverse: the lead flips.
  for (let i = 0; i < 120; i++) { state.player.x -= 0.5; pump(1); clearField(); }
  assert.ok(state.camLead.x < -CAM.LEAD * 0.5,
    'moving west flips the lead (' + state.camLead.x.toFixed(2) + ')');
  // A stationary player: the lead decays to zero.
  for (let i = 0; i < 120; i++) { pump(1); clearField(); }
  assert.ok(Math.abs(state.camLead.x) < 0.5 && Math.abs(state.camLead.y) < 0.5,
    'a parked player has no lead (' + state.camLead.x.toFixed(2) + ')');
});

// ---- the safe screen region, every wall + corner, every zoom ---------------
S.check('pressed against every wall and corner, the player never leaves the safe region', () => {
  const dirs = [
    ['E', { right: true }], ['W', { left: true }],
    ['S', { down: true }], ['N', { up: true }],
    ['SE', { right: true, down: true }], ['NW', { left: true, up: true }],
  ];
  const PI = T.pilotInput;
  const reset = () => { PI.up = PI.down = PI.left = PI.right = false; };
  for (const z of T.zoom.ladder) {
    T.zoom.set(z);
    pump(1);
    for (const [name, keys] of dirs) {
      reset();
      park(0, 0);
      clearField();
      pump(2);
      Object.assign(PI, keys);
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (let i = 0; i < 900; i++) {
        pump(1);
        if (i % 10 === 0) clearField();
        const s = screenOf(state.player.x, state.player.y);
        minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
      }
      reset();
      const lo = CAM.SAFE - 0.01, hi = VW - CAM.SAFE + 0.01;
      const loY = CAM.SAFE - 0.01, hiY = VH - CAM.SAFE + 0.01;
      assert.ok(minX >= lo && maxX <= hi && minY >= loY && maxY <= hiY,
        `zoom ${z} ${name}: player left the safe screen region ` +
        `(x ${minX.toFixed(0)}..${maxX.toFixed(0)}, y ${minY.toFixed(0)}..${maxY.toFixed(0)})`);
    }
  }
  T.zoom.set(1);
  pump(1);
});

S.check('near a wall the view STOPS and the player drifts to the screen edge', () => {
  const PI = T.pilotInput;
  PI.up = PI.down = PI.left = PI.right = false;
  T.zoom.set(1);
  park(0, 0);
  clearField();
  pump(2);
  PI.right = true;
  for (let i = 0; i < 900; i++) { pump(1); clearField(); }
  PI.right = false;
  pump(2);
  const s = screenOf(state.player.x, state.player.y);
  assert.ok(state.player.x >= RIM - 0.001, 'the player is at the clamp (x ' + state.player.x.toFixed(1) + ')');
  // The deadzone box alone would keep them at <= DEADZONE_W; being at the wall
  // proves the camera stopped following and the player moved within the view.
  assert.ok(s.x - VW / 2 > CAM.DEADZONE_W + 20,
    'the player left the deadzone box near the wall (screen off ' + (s.x - VW / 2).toFixed(1) + ')');
  assert.ok(VW - s.x >= CAM.SAFE - 0.01, 'but never entered the unsafe edge strip');
});

// ---- the projection still lands (the coachmark contract) -------------------
S.check('worldRegion agrees with the pixel the world layer actually draws', () => {
  // Walk to a wall so the camera is at its clamp, then to each zoom, and check
  // the projection against a gem recovered from the real render recorder.
  const PI = T.pilotInput;
  PI.up = PI.down = PI.left = PI.right = false;
  park(0, 0);
  clearField();
  pump(2);
  PI.right = true;
  for (let i = 0; i < 400; i++) { pump(1); clearField(); }
  PI.right = false;
  pump(2);

  const ZsToCheck = [1, 2, 4];
  let checks = 0;
  for (const z of ZsToCheck) {
    T.zoom.set(z);
    pump(1);
    // A gem right beside the player, so it is inside the zoomed view.
    const gx = state.player.x - 30, gy = state.player.y + 10;
    state.gems.length = 0;
    state.gems.push({ x: gx, y: gy, xp: 1 });
    rec.on = true;
    rec.rects.length = 0;
    pump(1);
    rec.on = false;
    // The gem pass paints fillRect(x-1, y-2, 3, 4) at depth 1 with x = gem.x -
    // cam.x (unrounded), inside the zoom transform.
    const r = rec.rects.find(q => q.d === 1 && q.w === 3 && q.h === 4);
    assert.ok(r, 'the gem was painted through the real frame path at zoom ' + z);
    const drawX = r.x + 1, drawY = r.y + 2;      // pre-transform view coords
    const Z = T.renderer.worldView.zoom;
    assert.equal(Z, z, 'the renderer zoom factor is the published one');
    // Device position of the drawn point under render.js's transform.
    const devX = VW / 2 + (drawX - VW / 2) * Z;
    const devY = VH / 2 + (drawY - VH / 2) * Z;
    // The coachmark projection for the SAME world point.
    const box = T.camera.region(gx, gy, 0).getBoundingClientRect();
    assert.ok(Math.abs(box.left - devX) < 0.001 && Math.abs(box.top - devY) < 0.001,
      `zoom ${z}: coachmark projection (${box.left.toFixed(2)},${box.top.toFixed(2)}) ` +
      `must land on the drawn pixel (${devX.toFixed(2)},${devY.toFixed(2)})`);
    // And the drawn pixel must be where the camera puts the world point.
    const s = screenOf(gx, gy);
    assert.ok(Math.abs(box.left - s.x) < 0.001, 'and on the camera-projected screen position');
    checks++;
  }
  assert.equal(checks, ZsToCheck.length);
  state.gems.length = 0;
  T.zoom.set(1);
});

// ---- frame-rate independence ----------------------------------------------
S.check('60Hz and 120Hz produce the same camera (nothing assumes a fixed dt)', () => {
  const PI = T.pilotInput;
  const run = (frameMs, frames) => {
    setFrameMs(frameMs);
    PI.up = PI.down = PI.left = PI.right = false;
    T.zoom.set(1);
    park(0, 0);
    clearField();
    pump(2);
    PI.right = true;
    for (let i = 0; i < frames; i++) { pump(1); clearField(); }
    PI.right = false;
    const out = { x: state.player.x, camX: state.cam.x, lead: state.camLead.x,
                  scr: screenOf(state.player.x, state.player.y).x };
    return out;
  };
  const a = run(1000 / 60, 300);      // 5s at 60Hz
  const b = run(1000 / 120, 600);     // 5s at 120Hz
  assert.ok(Math.abs(a.x - b.x) < 0.5, `player position matched (${a.x.toFixed(2)} vs ${b.x.toFixed(2)})`);
  assert.ok(Math.abs(a.camX - b.camX) < 0.5, `camera matched (${a.camX.toFixed(2)} vs ${b.camX.toFixed(2)})`);
  assert.ok(Math.abs(a.lead - b.lead) < 0.5, `lead matched (${a.lead.toFixed(2)} vs ${b.lead.toFixed(2)})`);
  assert.ok(Math.abs(a.scr - b.scr) < 0.5, `screen position matched (${a.scr.toFixed(2)} vs ${b.scr.toFixed(2)})`);
  setFrameMs(1000 / 60);
});

S.check('one camera: main.js owns the follow and render.js reads state.cam', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const render = fs.readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.ok(/function updateCamera\(p, dt\)/.test(main), 'one follow function');
  // Both the run and the finale call the SAME follow (no second copy).
  const calls = (main.match(/^\s+updateCamera\(p, dt\);/gm) || []).length;
  assert.equal(calls, 2, 'update() and updateFinale() both delegate to it (got ' + calls + ')');
  assert.ok(!/state\.cam\.x \+= \(\(p\.x/.test(main), 'the old hard-centre lerp is gone');
  assert.ok(!/state\.cam\.x \+=/.test(main), 'no direct camera writes outside the follow');
  assert.ok(/state\.zoomScale/.test(render), 'the renderer takes the zoom from the published field');
  assert.ok(/cam\.x/.test(render), 'and the camera from state.cam');
});

S.done();
