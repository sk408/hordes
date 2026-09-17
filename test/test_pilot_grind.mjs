// HORDES — WAVE-27 ITEM 3: THE AUTOPILOT MUST NOT GRIND AGAINST THE WALL.
//
// The bug (QA audit §5.2): no reachability test + gem stickiness committed the
// pilot BY IDENTITY to a gem beyond the rim, which can never be collected — so
// the commit was never released, reachable gems were starved, and the pilot
// parked at the boundary (probe: 6s oscillating around x=560.6 with the gem
// still on the field). The wall-steer also duplicated CONFIG.GROUND.RIM with a
// hardcoded 560.
//
// The fix (controllers.js): unreachable gifts are never candidates (the same
// predicate the spawn clamp uses), and a universal EDGE HOLD stops any branch
// accumulating outward pressure at the working boundary — so a target beyond
// the rim (legitimately walking in, or anything else out there) can no longer
// pin the pilot into the wall.
//
// Run: node test/test_pilot_grind.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONFIG as C } from '../src/config.js';
import { AutoPilotController, PlayerController } from '../src/controllers.js';
import { lootLimit, isReachableLoot } from '../src/entities.js';
import { boot, suite } from './_harness.mjs';

const S = suite('pilot wall grind (item 3)');
const { T, state, pump } = await boot({ storage: [['hordes_onboarded', '1']] });
const CFG = { KITE_DIST: C.PLAYER.KITE_DIST };
const foe = (x, y, typeId = 'CHASER') => ({ x, y, typeId, hp: 10, maxHp: 10 });
const mkState = (enemies = [], gems = []) => ({ enemies, gems });

// ---- pure: reachability gates gem selection --------------------------------
S.check('an unreachable gem is never committed, even when it is nearest', () => {
  const edge = lootLimit();
  const c = new AutoPilotController();
  // The pilot stands at the boundary: the out-of-bounds gem is the NEAREST
  // candidate (60px), a reachable one sits 200px back. Pre-fix the identity
  // commit took the nearest and starved the reachable one forever.
  const px = edge - 30;
  const unreachable = { x: edge + 30, y: 0 };
  const reachable = { x: edge - 230, y: 0 };
  assert.ok(!isReachableLoot(unreachable.x, unreachable.y), 'probe gem really is unreachable');
  assert.ok(isReachableLoot(reachable.x, reachable.y), 'probe gem really is reachable');
  const st = mkState([], [unreachable, reachable]);
  const d = c.decide({ x: px, y: 0 }, st, CFG);
  assert.equal(c.gem, reachable, 'committed to the REACHABLE gem, not the nearer unreachable one');
  assert.ok(d.moveX < 0, 'and it moves toward it (back into the arena)');
});

S.check('only unreachable loot on the field => nothing is committed', () => {
  const edge = lootLimit();
  const c = new AutoPilotController();
  const st = mkState([], [{ x: edge + 200, y: edge + 200 }, { x: -edge - 300, y: 0 }]);
  c.decide({ x: 0, y: 0 }, st, CFG);
  assert.equal(c.gem, null, 'no commit (got ' + JSON.stringify(c.gem) + ')');
  // A committed gem that somehow becomes unreachable is released.
  const gm = { x: 100, y: 0 };
  c.decide({ x: 0, y: 0 }, mkState([], [gm]), CFG);
  assert.equal(c.gem, gm, 'committed while reachable');
  gm.x = edge + 50;                       // mutated out of range
  c.decide({ x: 0, y: 0 }, mkState([], [gm]), CFG);
  assert.equal(c.gem, null, 'the stale commit is released');
});

// ---- pure: the edge hold ---------------------------------------------------
S.check('at the boundary the pilot never returns an outward vector', () => {
  const edge = lootLimit();
  const c = new AutoPilotController();
  // Flee from an enemy just inside => raw flee points OUTWARD (+x); the hold
  // must cancel it (pre-fix the wall-steer only fired past a hardcoded 560).
  const d = c.decide({ x: edge, y: 0 }, mkState([foe(edge - 30, 0)], []), CFG);
  assert.ok(d.moveX <= 0, 'no outward component at the boundary (got ' + d.moveX + ')');
  // Same for -x.
  const c2 = new AutoPilotController();
  const d2 = c2.decide({ x: -edge, y: 0 }, mkState([foe(-edge + 30, 0)], []), CFG);
  assert.ok(d2.moveX >= 0, 'no outward component at the -x boundary (got ' + d2.moveX + ')');
  // Same for y.
  const c3 = new AutoPilotController();
  const d3 = c3.decide({ x: 0, y: edge }, mkState([foe(0, edge - 30)], []), CFG);
  assert.ok(d3.moveY <= 0, 'no outward component at the +y boundary');
  // MID-ARENA the hold must not interfere: outward travel is normal.
  const c4 = new AutoPilotController();
  const d4 = c4.decide({ x: 0, y: 0 }, mkState([], [{ x: 200, y: 0 }]), CFG);
  assert.ok(d4.moveX > 0, 'mid-arena the pilot still moves outward toward loot');
});

S.check('the boundary is CONFIG-derived, not a hardcoded 560', () => {
  const src = fs.readFileSync(new URL('../src/controllers.js', import.meta.url), 'utf8');
  assert.ok(/const rim = lootLimit\(\)/.test(src), 'the wall-steer rim reads the shared limit');
  assert.ok(!/\brim = 560\b/.test(src), 'the old hardcoded 560 is gone');
  // Behaviour: shrink the arena and the boundary shrinks with it.
  const saved = C.GROUND.RIM;
  try {
    C.GROUND.RIM = 120;
    assert.equal(lootLimit(), 120 - C.GROUND.WALL - C.PLAYER.XP_PICKUP_RADIUS);
    const c = new AutoPilotController();
    const d = c.decide({ x: lootLimit(), y: 0 }, mkState([foe(lootLimit() - 20, 0)], []), CFG);
    assert.ok(d.moveX <= 0, 'the hold follows the shrunk CONFIG rim');
  } finally {
    C.GROUND.RIM = saved;
  }
});

S.check('manual movement is untouched by the hold (the human owns movement)', () => {
  const edge = lootLimit();
  const m = new PlayerController({ up: false, down: false, left: false, right: true });
  const d = m.decide({ x: edge + 10, y: 0 }, mkState(), CFG);
  assert.equal(d.moveX, 1, 'manual input still pushes outward; the position clamp stops it');
});

// ---- integration: the real loop -------------------------------------------
S.check('holding the boundary with loot beyond the rim (6s sim, no grind)', () => {
  T.startRun();
  pump(3);
  state.spawnTimer = 99999;
  state.wave.endsAt = state.time + 99999;
  state.enemies.length = 0;
  state.gems.length = 0;
  const edge = lootLimit();
  const p = state.player;
  p.x = edge - 6;
  p.y = 0;
  const beyond = { x: edge + 190, y: 0, xp: 1 };
  state.gems.push(beyond);
  let maxX = -Infinity;
  for (let i = 0; i < 360; i++) {
    pump(1);
    maxX = Math.max(maxX, p.x);
  }
  assert.ok(state.gems.includes(beyond), 'the unreachable gem is still on the field');
  assert.equal(T.controller.gem, null, 'the pilot never committed to it');
  assert.ok(maxX <= edge + 0.001,
    'the pilot never advanced past its boundary (max x ' + maxX.toFixed(2) + ' vs edge ' + edge + ')');
  assert.ok(p.x < edge, 'and it did not park ON the boundary pressing (x ' + p.x.toFixed(2) + ')');
});

S.check('an enemy still outside the rim does not grind the pilot either', () => {
  T.startRun();
  pump(3);
  state.spawnTimer = 99999;
  state.wave.endsAt = state.time + 99999;
  state.gems.length = 0;
  state.enemies.length = 0;
  const edge = lootLimit();
  const p = state.player;
  p.x = edge - 4;
  p.y = 0;
  // Legitimate: an enemy outside the wall, walking in. It must stay outside
  // (enemy spawns are not clamped) and must not pin the pilot into the wall.
  state.enemies.push({ typeId: 'CHASER', x: edge + 140, y: 0, hp: 999, maxHp: 999,
    w: 10, h: 10, speed: 0, xp: 1, age: 0 });
  let maxX = -Infinity;
  for (let i = 0; i < 240; i++) {
    pump(1);
    maxX = Math.max(maxX, p.x);
  }
  assert.ok(maxX <= edge + 0.001,
    'no wall-ward accumulation with an out-of-bounds enemy (max x ' + maxX.toFixed(2) + ')');
  assert.ok(state.enemies.length >= 1, 'the enemy is still on the field (it was not chased away)');
});

S.check('the pilot picks the reachable gem and RESOLVES (real loop)', () => {
  T.startRun();
  pump(3);
  state.spawnTimer = 99999;
  state.wave.endsAt = state.time + 99999;
  state.enemies.length = 0;
  state.gems.length = 0;
  const edge = lootLimit();
  const p = state.player;
  p.x = edge - 20;
  p.y = 0;
  const beyond = { x: edge + 190, y: 0, xp: 1 };     // unreachable
  const back = { x: edge - 300, y: 0, xp: 1 };       // reachable, farther
  state.gems.push(beyond, back);
  pump(1);
  assert.equal(T.controller.gem, back, 'the pilot committed to the reachable gem');
  let maxX = -Infinity;
  let resolved = false;
  for (let i = 0; i < 600 && !resolved; i++) {
    pump(1);
    maxX = Math.max(maxX, p.x);
    resolved = !state.gems.includes(back);
  }
  assert.ok(resolved, 'the reachable gem was collected within 10s (the old commit never resolved)');
  assert.ok(maxX <= edge + 0.001, 'never advanced past the boundary (max ' + maxX.toFixed(2) + ')');
  assert.ok(state.gems.includes(beyond), 'the unreachable gem is simply ignored, still on the field');
});

S.check('the pilot RESUMES normally when the target comes inside', () => {
  T.startRun();
  pump(3);
  state.spawnTimer = 99999;
  state.wave.endsAt = state.time + 99999;
  state.enemies.length = 0;
  state.gems.length = 0;
  const edge = lootLimit();
  const p = state.player;
  p.x = edge - 10;
  p.y = 0;
  pump(2);
  assert.equal(T.controller.gem, null, 'nothing to loot yet');
  // The target crosses inside, just behind the pilot: it must be picked up.
  const inside = { x: edge - 120, y: 0, xp: 1 };
  state.gems.push(inside);
  pump(1);
  assert.equal(T.controller.gem, inside, 'the pilot commits the moment the target is reachable');
  const x0 = p.x;
  // ARENA SCALE-UP RETARGET (was 90 straight frames): the relief grade term
  // slows the pilot on uphill stretches (bounded 0.64x), so the ~110px walk
  // to the gem can outrun a flat-speed frame budget. Bounded-wait up to 6s;
  // the movement assertion and the collection assertion are unchanged.
  let collected = false;
  for (let i = 0; i < 360 && !collected; i++) { pump(1); collected = state.gems.length === 0; }
  assert.ok(p.x < x0 - 20,
    'and moves toward it again (x ' + x0.toFixed(1) + ' -> ' + p.x.toFixed(1) + ')');
  assert.equal(state.gems.length, 0, 'it actually collected the gem');
});

S.done();
