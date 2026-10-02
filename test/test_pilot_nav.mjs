// Pilot navigation around building footprints (src/pilot_nav.js): geometry,
// path planning, and a walk matrix where every walk must arrive.
// Run: node test/test_pilot_nav.mjs
import assert from 'node:assert/strict';
import { suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { STAGE_IDS } from '../src/stages.js';
import {
  buildingRects, slideMove, buildingTouchesDisc, clearOfBuildings, BUILDING_MOVER_R as R,
} from '../src/stage_buildings.js';
import {
  makeNav, navDirection, navRemaining, planPath, segmentClear, straightClear, clearanceAt,
  NAV_PAD, NAV_CLEAR,
} from '../src/pilot_nav.js';
import { AutoPilotController, STALL_PERIOD_FRAMES } from '../src/controllers.js';

const s = suite('test_pilot_nav');
const RIM = C.GROUND.RIM;
const BOX = [{ x: 100, y: 100, w: 60, h: 40 }];

s.check('segmentClear: crossing, grazing and clear segments', () => {
  assert.equal(segmentClear(BOX, 0, 120, 300, 120, 7), false, 'through the box');
  assert.equal(segmentClear(BOX, 0, 95, 300, 95, 7), false, 'passes 5px above the top face');
  assert.equal(segmentClear(BOX, 0, 92, 300, 92, 7), true, 'passes 8px above the top face');
  assert.equal(segmentClear(BOX, 95, 95, 0, 0, 7), true, 'leaves the corner diagonally (7.07px off it)');
  assert.equal(segmentClear([], 0, 0, 9, 9, 7), true);
  assert.equal(clearanceAt(BOX, 100, 90), 10);
  assert.equal(clearanceAt([], 0, 0), Infinity);
});

s.check('planPath: straight when clear, around the nearer corner when blocked', () => {
  assert.deepEqual(planPath(BOX, 0, 0, 50, 50), [[50, 50]]);
  const path = planPath(BOX, 50, 110, 220, 110);
  assert.equal(path.length, 3, JSON.stringify(path));
  assert.deepEqual(path[0], [100 - R - NAV_PAD, 100 - R - NAV_PAD], 'top-left corner (the short way)');
  assert.deepEqual(path[2], [220, 110]);
  let x = 50, y = 110;
  for (const [wx, wy] of path) {
    assert.ok(segmentClear(BOX, x, y, wx, wy, NAV_CLEAR), 'every leg keeps its clearance');
    x = wx; y = wy;
  }
});

s.check('a mover touching a wall can still plan away from it', () => {
  // Exactly R off the left face: legal footing, zero slack.
  assert.ok(planPath(BOX, 100 - R, 120, 220, 120), 'path exists from wall contact');
  assert.equal(straightClear(BOX, 100 - R, 120, 0, 120), true, 'walking straight off the wall is clear');
});

function walk(rects, sx, sy, mx, my, spd, dt, reach, maxT) {
  let x = sx, y = sy;
  const nav = makeNav();
  const [tx, ty] = clearOfBuildings(rects, mx, my, R + NAV_PAD, RIM);
  const maxF = maxT / dt;
  let last = Infinity;
  for (let f = 0; f < maxF; f++) {
    const d = Math.hypot(mx - x, my - y);
    if (d <= reach) return { ok: true, t: f * dt };
    const dir = navDirection(nav, rects, x, y, tx, ty) || [(mx - x) / d, (my - y) / d, d];
    const st = Math.min(spd * dt, dir[2]);
    const sl = slideMove(x, y, x + dir[0] * st, y + dir[1] * st, rects, R);
    x = Math.max(-RIM, Math.min(RIM, sl[0])); y = Math.max(-RIM, Math.min(RIM, sl[1]));
    last = navRemaining(nav, x, y, tx, ty);
  }
  return { ok: false, x, y, last };
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const inBox = (rects, x, y) => rects.some(r => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);

s.check('walk matrix: every stage x 3 fields x 40 walks arrives, at 60Hz and at a 10px stride', () => {
  let total = 0, slow = 0;
  for (const [spd, hz] of [[60, 60], [200, 20]]) {
    for (const stage of STAGE_IDS) for (let seed = 1; seed <= 3; seed++) {
      const rects = buildingRects(seed * 7919, stage);
      const rng = mulberry32(seed * 31 + stage.length);
      for (let k = 0; k < 40; k++) {
        let sx, sy, mx, my, t = 0;
        do { sx = (rng() * 2 - 1) * RIM; sy = (rng() * 2 - 1) * RIM; }
        while (buildingTouchesDisc(rects, sx, sy, R) && ++t < 99);
        do { mx = (rng() * 2 - 1) * RIM; my = (rng() * 2 - 1) * RIM; } while (inBox(rects, mx, my));
        const res = walk(rects, sx, sy, mx, my, spd, 1 / hz, 18, 120);
        assert.ok(res.ok, `${stage} seed ${seed * 7919} (${sx.toFixed(0)},${sy.toFixed(0)})->(${mx.toFixed(0)},${my.toFixed(0)}) ` +
          `at ${spd}px/s ${hz}Hz ended at (${res.x},${res.y})`);
        total++;
        if (res.t > 1.6 * Math.hypot(mx - sx, my - sy) / spd + 2) slow++;
      }
    }
  }
  assert.equal(slow, 0, 'no walk took more than 1.6x its straight-line time (+2s)');
  console.log('    ' + total + ' walks arrived');
});

// The controller on its own (no game loop): decide() + the motion rules.
function pilotWalk(ctl, state, frames, per) {
  const p = state.player;
  const rects = buildingRects(state.groundSeed, state.stage);
  for (let f = 0; f < frames; f++) {
    const d = ctl.decide(p, state, C.PLAYER);
    let st = C.PLAYER.SPEED / 60;
    const ml = Math.hypot(d.moveX, d.moveY);
    if (d.routed && ml * st > d.stepCap) st = d.stepCap / ml;
    const sl = slideMove(p.x, p.y, p.x + d.moveX * st, p.y + d.moveY * st, rects, R);
    p.x = sl[0]; p.y = sl[1];
    if (per && per(f, d) === false) return f;
  }
  return frames;
}
const mkState = (seed, x, y, gems) => ({
  groundSeed: seed, stage: 'VERDANT_HOLLOW', enemies: [], gems, portal: null, runChest: null,
  player: { x, y, stats: {} },
});

s.check('controller: a routed move is flagged, capped at its waypoint, and banks the 7919 mark', () => {
  const gem = { x: 738, y: 386, xp: 1 };
  const state = mkState(7919, -4, 11, [gem]);
  const ctl = new AutoPilotController();
  let routedFrames = 0;
  const frames = pilotWalk(ctl, state, 60 * 40, (f, d) => {
    if (d.routed && Number.isFinite(d.stepCap)) {
      routedFrames++;
      assert.ok(d.stepCap > 0, 'stepCap is a distance');
    }
    return Math.hypot(gem.x - state.player.x, gem.y - state.player.y) > C.PLAYER.XP_PICKUP_RADIUS;
  });
  assert.ok(frames < 60 * 40, 'reached the gem (pickup radius) in ' + (frames / 60).toFixed(1) + 's');
  assert.ok(routedFrames > 0, 'the walk used building routes');
});

s.check('controller: open field keeps the plain vector', () => {
  const state = mkState(7919, 0, 0, [{ x: 30, y: 0, xp: 1 }]);
  state.stage = 'VERDANT_HOLLOW';
  const rects = buildingRects(7919, 'VERDANT_HOLLOW');
  assert.ok(straightClear(rects, 0, 0, 30, 0), 'fixture: the lane is clear');
  const d = new AutoPilotController().decide(state.player, state, C.PLAYER);
  assert.equal(d.routed, true, 'a clear straight move is final (no corner-steer)');
  assert.equal(d.stepCap, Infinity);
  assert.deepEqual([d.moveX, d.moveY], [1, 0]);
});

s.check('controller: a gem it cannot make progress on is given up, and the next one is taken', () => {
  // A wall the planner does not know about (the walk below never moves the
  // pilot): no progress for one stall period drops the gem.
  const far = { x: 300, y: 0, xp: 1 }, near = { x: 120, y: 0, xp: 1 };
  const state = mkState(7919, 0, 0, [near, far]);
  const ctl = new AutoPilotController();
  for (let f = 0; f < STALL_PERIOD_FRAMES + 2; f++) ctl.decide(state.player, state, C.PLAYER);
  assert.equal(ctl.skipGems.has(near), true, 'the stuck gem is on the skip list');
  ctl.decide(state.player, state, C.PLAYER);
  assert.equal(ctl.gem, far, 'the pilot moved on to the other gem');
});
s.done();
