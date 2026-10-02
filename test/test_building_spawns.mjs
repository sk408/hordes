// Chests, shrines, arches and item/potion drops never rest inside a building
// footprint (where the pilot cannot stand).
// Run: node test/test_building_spawns.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import {
  buildingRects, buildingFootprints, clearOfBuildings, buildingTouchesDisc, BUILDING_MOVER_R,
} from '../src/stage_buildings.js';
import { maybeSpawnChest, CHESTS } from '../src/chests.js';
import { lootLimit } from '../src/entities.js';
import { STAGE_IDS } from '../src/stages.js';

const s = suite('test_building_spawns');
const inside = (rects, x, y, m = 0) => rects.some(q =>
  x > q.x - m && x < q.x + q.w + m && y > q.y - m && y < q.y + q.h + m);
// Some legal standing point within `reach` of (x, y)?
function reachable(rects, x, y, reach) {
  for (let a = 0; a < 32; a++) {
    for (const d of [0, reach * 0.5, reach * 0.95]) {
      const px = x + Math.cos(a * Math.PI / 16) * d, py = y + Math.sin(a * Math.PI / 16) * d;
      if (!buildingTouchesDisc(rects, px, py, BUILDING_MOVER_R)) return true;
    }
  }
  return false;
}

s.check('buildingRects caches per (seed, stage) and equals buildingFootprints', () => {
  const a = buildingRects(7919, 'VERDANT_HOLLOW');
  assert.equal(buildingRects(7919, 'VERDANT_HOLLOW'), a, 'same array on a repeat call');
  assert.deepEqual(a, buildingFootprints(7919, 'VERDANT_HOLLOW'));
  assert.notEqual(buildingRects(7920, 'VERDANT_HOLLOW'), a);
  assert.deepEqual(buildingRects(7919, 'VERDANT_HOLLOW'), a);
});

s.check('clearOfBuildings: every interior point leaves, inside the limit; clear points stay put', () => {
  const lim = lootLimit();
  let n = 0;
  for (const stage of STAGE_IDS) for (const seed of [1, 7919, 15838, 104729]) {
    const rects = buildingFootprints(seed, stage);
    for (const q of rects) {
      for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.9], [0.9, 0.2], [0.02, 0.5], [0.5, 0.98]]) {
        const x = q.x + q.w * fx, y = q.y + q.h * fy;
        for (const m of [0, 4, 14]) {
          const [cx, cy] = clearOfBuildings(rects, x, y, m, lim);
          assert.ok(!inside(rects, cx, cy, m), `${stage}/${seed} (${x},${y}) m${m} -> (${cx},${cy}) still inside`);
          assert.ok(Math.abs(cx) <= lim && Math.abs(cy) <= lim, 'inside the loot clamp');
          n++;
        }
      }
    }
    const [ox, oy] = clearOfBuildings(rects, 1e6, -1e6, 4, lim);
    assert.ok(Math.abs(ox) <= lim && Math.abs(oy) <= lim && !inside(rects, ox, oy, 4));
  }
  assert.ok(n > 1000, 'covered ' + n + ' points');
  assert.deepEqual(clearOfBuildings([{ x: 0, y: 0, w: 10, h: 10 }], 50, 50, 4, 500), [50, 50]);
});

s.check('maybeSpawnChest: a kill inside a footprint drops a reachable chest', () => {
  for (const seed of [7919, 15838]) {
    const rects = buildingFootprints(seed, 'VERDANT_HOLLOW');
    for (const q of rects) {
      const state = { groundSeed: seed, stage: 'VERDANT_HOLLOW', chests: [] };
      const c = maybeSpawnChest(state, { x: q.x + q.w / 2, y: q.y + q.h / 2, elite: true }, () => 0);
      assert.ok(c && !inside(rects, c.x, c.y), 'chest left the footprint');
      assert.ok(reachable(rects, c.x, c.y, CHESTS.PICKUP_RADIUS), 'a legal footing can open it');
    }
  }
});

const h = await boot();
const st = h.state;
s.check('real run: shrines and wave arches stand outside every footprint', () => {
  for (let run = 0; run < 12; run++) {
    h.T.startRun();
    h.pump(2);
    const rects = buildingRects(st.groundSeed || 0, st.stage);
    assert.ok(st.shrines.length > 0 && st.arches.length > 0);
    for (const sh of st.shrines) assert.ok(!inside(rects, sh.x, sh.y), 'shrine inside a building');
    for (const a of st.arches) assert.ok(!inside(rects, a.x, a.y), 'arch inside a building');
  }
});

s.check('real kill inside a building: item drop and chest land outside it', () => {
  h.T.startRun();
  h.pump(2);
  const rects = buildingRects(st.groundSeed || 0, st.stage);
  const q = rects.reduce((a, b) => (a.w * a.h > b.w * b.h ? a : b));
  st.enemies.length = 0; st.spawnTimer = 1e9; st.itemDrops.length = 0; st.chests = [];
  st.enemies.push({ typeId: 'CHASER', x: q.x + q.w / 2, y: q.y + q.h / 2, hp: 0, maxHp: 500,
    w: 10, h: 10, speed: 0, xp: 1, age: 0, elite: true, eliteMod: 'TEST', guaranteesChest: true });
  h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
  assert.equal(st.itemDrops.length, 1, 'the elite dropped its item');
  assert.equal(st.chests.length, 1, 'and its chest');
  for (const o of [st.itemDrops[0], st.chests[0]]) {
    assert.ok(!inside(rects, o.x, o.y), 'drop left the footprint: ' + JSON.stringify([o.x, o.y]));
  }
});
s.done();
