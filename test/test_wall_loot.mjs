// HORDES — WAVE-27 ITEM 2: LOOT MUST NEVER SPAWN UNREACHABLE.
//
// The bug (QA audit §5.1): drops took the killed enemy's exact (x,y) with NO
// clamp anywhere. Enemies spawn on a ring around the PLAYER and are never
// rim-clamped, so a kill out past the wall dropped loot on the wall's inner
// face (600-612) or beyond it — uncollectible, and the pilot ground against
// the wall chasing it.
//
// The fix: entities.clampLootToArena (ONE shared helper, rim minus the wall
// band minus the base pickup radius) applied at every drop source — gems
// (makeGem), potion drops, rare item drops and chests.
//
// Run: node test/test_wall_loot.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONFIG as C } from '../src/config.js';
import { makeGem, lootLimit, clampLootToArena, isReachableLoot } from '../src/entities.js';
import { maybeSpawnChest } from '../src/chests.js';
import { boot, suite } from './_harness.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');

const S = suite('wall loot clamp (item 2)');
const { T, state, pump } = await boot({ storage: [['hordes_onboarded', '1']] });

const RIM = C.GROUND.RIM;
const LIMIT = lootLimit();
const inside = (o) => Math.abs(o.x) <= LIMIT && Math.abs(o.y) <= LIMIT;

// ---- the limit itself ------------------------------------------------------
S.check('the loot limit accounts for the wall band AND the pickup radius', () => {
  assert.equal(LIMIT, RIM - C.GROUND.WALL - C.PLAYER.XP_PICKUP_RADIUS,
    'limit = rim - wall band - base pickup radius (got ' + LIMIT + ')');
  assert.ok(LIMIT < RIM, 'loot stops short of the clamp edge, not on it');
  // The wall band is REAL geometry, not a magic number here: render.js draws
  // RIM..RIM+WALL from the same CONFIG knob.
  const render = read('src/render.js');
  assert.ok(/T = C\.GROUND\.WALL/.test(render),
    'render.js draws the wall band from CONFIG.GROUND.WALL (one definition)');
  // A drop at the limit is still collectible from a legal standing position:
  // the player may stand anywhere in +-RIM, so the gap to the limit is smaller
  // than the pickup radius (with room to spare on top of the wall band).
  assert.ok(RIM - LIMIT >= C.PLAYER.XP_PICKUP_RADIUS,
    'the nearest legal standing position can always reach a clamped drop');
});

// ---- the shared helper / factory ------------------------------------------
S.check('makeGem clamps every gem into the reachable region (boundary sweep)', () => {
  let checked = 0;
  for (let x = -900; x <= 900; x += 25) {
    for (let y = -900; y <= 900; y += 25) {
      const g = makeGem(x, y, 1);
      assert.ok(inside(g), `gem at (${x},${y}) landed outside the reachable region: (${g.x},${g.y})`);
      assert.ok(isReachableLoot(g.x, g.y), 'and the shared predicate agrees');
      checked++;
    }
  }
  assert.ok(checked > 4000, 'swept a large sample (' + checked + ' spawns)');
  // Inside the region nothing moves.
  const g = makeGem(10, -20, 7);
  assert.deepEqual({ x: g.x, y: g.y, xp: g.xp }, { x: 10, y: -20, xp: 7 });
  // Exactly at the rim / on the wall band gets pulled in.
  assert.equal(makeGem(RIM, RIM, 1).x, LIMIT, 'a drop at the clamp edge lands at the limit');
  assert.equal(clampLootToArena(RIM + C.GROUND.WALL, -RIM).y, -LIMIT, 'and past the wall band too');
});

// ---- chests ----------------------------------------------------------------
S.check('maybeSpawnChest clamps a kill outside the wall (audit probe)', () => {
  const st = { chests: [], player: { x: 0, y: 0 } };
  const chest = maybeSpawnChest(st, { x: 700, y: -640, elite: true }, () => 0);
  assert.ok(chest, 'the elite kill dropped a chest');
  assert.ok(inside(chest), 'chest must be reachable (got ' + chest.x + ',' + chest.y + ')');
  assert.ok(isReachableLoot(chest.x, chest.y));
});

// ---- through the REAL kill path -------------------------------------------
S.check('the live kill path clamps gems, item drops and chests', () => {
  T.startRun();
  pump(3);
  state.spawnTimer = 99999;
  state.wave.endsAt = state.time + 99999;
  const clearDrops = () => {
    state.enemies.length = 0;
    state.gems.length = 0;
    state.itemDrops.length = 0;
    state.drops.length = 0;
    state.chests.length = 0;
  };
  clearDrops();
  // An elite outside the east rim with a guaranteed item drop + chest.
  state.enemies.push({
    typeId: 'CHASER', x: 780, y: -700, hp: 0, maxHp: 500, w: 10, h: 10,
    speed: 0, xp: 5, age: 0, elite: true, eliteMod: 'SWIFT', guaranteesChest: true,
  });
  pump(2);
  assert.equal(state.gems.length, 1, 'the gem dropped');
  assert.ok(inside(state.gems[0]), 'gem clamped (' + state.gems[0].x + ',' + state.gems[0].y + ')');
  assert.ok(state.itemDrops.length >= 1, 'the elite-mod kill dropped an item');
  assert.ok(inside(state.itemDrops[0]), 'item drop clamped');
  assert.ok(state.chests.length >= 1, 'the guaranteed chest dropped');
  assert.ok(inside(state.chests[0]), 'chest clamped');

  // Potion drops: force every kill to drop one, at an out-of-bounds kill.
  const savedChance = C.POTIONS.DROP_CHANCE;
  try {
    C.POTIONS.DROP_CHANCE = 1;
    for (let i = 0; i < 5; i++) {
      clearDrops();
      state.enemies.push({
        typeId: 'CHASER', x: -820, y: 900, hp: 0, maxHp: 12, w: 10, h: 10,
        speed: 0, xp: 1, age: 0,
      });
      pump(1);
      assert.equal(state.drops.length, 1, 'a potion dropped');
      assert.ok(inside(state.drops[0]), 'potion clamped');
    }
  } finally {
    C.POTIONS.DROP_CHANCE = savedChance;
  }

  // Boss payout: guaranteed chest pair + an up-tier item, plus the portal-clear
  // scatter that turns the remaining horde into gems.
  clearDrops();
  state.enemies.push({
    typeId: 'CHASER', x: 900, y: 900, hp: 5, maxHp: 5, w: 10, h: 10,
    speed: 0, xp: 3, age: 0,
  });
  state.enemies.push({
    typeId: 'BRUTE', x: -900, y: -880, hp: 0, maxHp: 900, w: 10, h: 10,
    speed: 0, xp: 9, age: 0, boss: true, name: 'PROBE BOSS',
  });
  state.wave.bosses = [];
  pump(3);
  assert.ok(state.itemDrops.length >= 1, 'the boss dropped an item');
  assert.ok(state.itemDrops.every(inside), 'boss item drop clamped');
  assert.ok(state.chests.length >= 1 && state.chests.every(inside), 'boss chests clamped');
  assert.ok(state.gems.length >= 1, 'the portal-clear scatter produced gems');
  assert.ok(state.gems.every(inside), 'scattered gems clamped too');
});

// ---- enemies from OUTSIDE the rim are intended -----------------------------
S.check('enemy spawns are NOT clamped (arriving from outside is intended)', () => {
  T.startRun();
  pump(3);
  state.enemies.length = 0;
  // ARENA SCALE-UP RETARGET: park 100px inside the rim (was the literal 500,
  // which sat past the old 600 rim) — the min-radius spawn ring at angle 0
  // still lands beyond the rim at any unit count.
  state.player.x = RIM - 100;
  state.player.y = 0;
  state.spawnTimer = 0;
  const savedRnd = Math.random;
  Math.random = () => 0;      // deterministic: ring angle 0, full min radius
  try {
    pump(1);
  } finally {
    Math.random = savedRnd;
  }
  const outside = state.enemies.filter(e => Math.abs(e.x) > RIM || Math.abs(e.y) > RIM);
  assert.ok(outside.length > 0,
    'an enemy must still be able to spawn beyond the rim (got ' +
    state.enemies.map(e => e.x.toFixed(0)).join(',') + ')');
  assert.ok(state.gems.every(inside) && state.itemDrops.every(inside),
    'and any loot that follows is still clamped');
});

S.done();
