// The first-run walk to the prologue potion routes around a building that
// stands across the spawn -> potion line (it used to press its face until the
// phase timed out).
// Run: node test/test_prologue_route.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { buildingRects } from '../src/stage_buildings.js';
import { straightClear } from '../src/pilot_nav.js';

const s = suite('test_prologue_route');
const sx = C.VIEW_W / 2, sy = C.VIEW_H / 2;
// Fields where the old straight walk (corner-steer + slide) never arrived.
const blocked = [43, 63, 79, 239, 262, 270];
for (const seed of blocked) {
  assert.equal(straightClear(buildingRects(seed, 'VERDANT_HOLLOW'), sx, sy,
    sx + C.PROLOGUE.POTION_DX, sy + C.PROLOGUE.POTION_DY), false, 'fixture: seed ' + seed + ' blocks the line');
}

const h = await boot({ prologue: true, variant: 'prologue-route' });
const T = h.T, st = h.state;
s.check('skipped tutorial: the pilot reaches and drinks the potion on 6 blocked fields', () => {
  for (const seed of blocked) {
    T.banners.suppressAll();
    T.stages.select('VERDANT_HOLLOW');
    T.startRun();
    st.groundSeed = seed;
    assert.ok(st.prologue && !st.prologue.drunk, 'the phase is live');
    T.prologue.skip(); T.prologue.skip();   // two-tap skip: straight to the potion walk
    assert.equal(st.prologue.skipped, true);
    let frames = 0;
    while (st.prologue && !st.prologue.drunk && frames < 60 * 20) { h.pump(1); frames++; }
    assert.ok(!st.prologue || st.prologue.drunk,
      'seed ' + seed + ': potion not reached in 20s; pilot at (' + st.player.x.toFixed(1) + ',' + st.player.y.toFixed(1) + ')');
  }
});
s.done();
