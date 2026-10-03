// HORDES — the walled yard as a place to walk: its walls stop walkers, the
// pilot's flee leaves it through the gate, the pilot's cell mask keeps the
// open gate open, a key that falls past the rim lands inside the floor, and
// AUTO leaves gems inside the shut yard alone.
// Run: node test/test_yard_paths.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import * as CTL from '../src/controllers.js';
import * as VY from '../src/vault.js';
import { placeSites } from '../src/sites.js';
import { buildingRects, setExtraRects, buildingTouchesDisc } from '../src/stage_buildings.js';
import {
  terrainFor, flowField, flowDir, nodeOf, cellIx, floorAt, terrainLineClear, terrainStep, rectOnFeature,
  FLOW_INF, TN, TCELL, TEXT,
} from '../src/terrain.js';
import { makeTypedEnemy } from '../src/enemy_types.js';
import { lootLimit } from '../src/entities.js';
import { STAGE_IDS } from '../src/stages.js';
import { CONFIG as C } from '../src/config.js';

const { placeVaultYard, yardRects, gateOutside, tickVaultYard, VAULT } = VY;
const s = suite('test_yard_paths');
const HW = VAULT.YARD_W / 2, HH = VAULT.YARD_H / 2;
const inYard = (Y, x, y) => Math.abs(x - Y.x) < HW && Math.abs(y - Y.y) < HH;
// px off the gate's axis
const offGate = (Y, x, y) => (Y.gateSide === 'n' || Y.gateSide === 's') ? Math.abs(x - Y.x) : Math.abs(y - Y.y);

// The yard of (seed, stage), placed as the run places it.
function yardOf(seed, stage) {
  setExtraRects(seed, stage, null);
  const rects = buildingRects(seed, stage);
  const sites = placeSites(seed, stage, rects, C.GROUND.RIM);
  return { rects, yard: placeVaultYard(seed, stage, rects, sites, C.GROUND.RIM).yard };
}

// ------------------------------------------------------------ the pilot's mask
// Can a route walk from cell a to cell b? The flow field's own rule: 8 ways,
// a diagonal only between two open corner cells.
function cellsJoin(blk, a, b) {
  const seen = new Uint8Array(TN * TN), q = [a];
  seen[a] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], gx = c % TN, gy = (c - gx) / TN;
    if (c === b) return true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= TN || ny >= TN) continue;
      const u = ny * TN + nx;
      if (seen[u] || blk[u]) continue;
      if (dx && dy && (blk[gy * TN + nx] || blk[ny * TN + gx])) continue;
      seen[u] = 1; q.push(u);
    }
  }
  return false;
}

s.check('mask: at every grid offset the open gate holds a cell and the shut yard is sealed', () => {
  assert.equal(typeof CTL.pilotBlock, 'function', 'pilotBlock is exported');
  assert.equal(TN * TCELL, 2 * TEXT);
  let open = 0, shut = 0, n = 0;
  for (const gateSide of ['n', 's', 'e', 'w']) {
    for (let ox = 0; ox < TCELL; ox++) for (let oy = 0; oy < TCELL; oy++) {
      const Y = { x: 96 + ox, y: -120 + oy, gateSide };
      const centre = cellIx(Y.x, Y.y), far = cellIx(Y.x + 240, Y.y + 240);
      n++;
      if (cellsJoin(CTL.pilotBlock({}, yardRects(Y, true)), centre, far)) open++;
      if (!cellsJoin(CTL.pilotBlock({}, yardRects(Y, false)), centre, far)) shut++;
    }
  }
  assert.equal(open, n, `the open yard is reachable in ${open} of ${n} placements`);
  assert.equal(shut, n, `the shut yard is sealed in ${shut} of ${n} placements`);
});

s.check('mask: the open yard is reachable in the masked flow field, 8 stages x 40 seeds; shut it is not', () => {
  assert.ok(STAGE_IDS.length >= 8);
  let n = 0;
  for (const stage of STAGE_IDS) {
    for (let seed = 1; seed <= 40; seed++) {
      const { rects, yard } = yardOf(seed, stage);
      if (!yard) continue;
      n++;
      const T = terrainFor(seed, stage);
      const gn = nodeOf(T, cellIx(yard.x, yard.y), floorAt(T, yard.x, yard.y, 0));
      const blk = CTL.pilotBlock(T, rects.concat(yardRects(yard, true)));
      const F = flowField(T, [gn], blk);
      const [gx, gy] = gateOutside(yard);
      const tag = `${stage}/${seed}`;
      assert.ok(F.dist[nodeOf(T, cellIx(gx, gy), 0)] < FLOW_INF, tag + ': from outside the gate');
      const top = T.plateaus[0];
      assert.ok(F.dist[nodeOf(T, cellIx(top.x + top.w / 2, top.y + top.h / 2), 2)] < FLOW_INF, tag + ': from a plateau top');
      // From the spawn too, unless a building's own mask covers the spawn cell.
      const sc = T.spawnNode % (TN * TN);
      if (!blk[sc]) assert.ok(F.dist[T.spawnNode] < FLOW_INF, tag + ': from the spawn');
      const Fs = flowField(T, [gn], CTL.pilotBlock(T, rects.concat(yardRects(yard, false))));
      assert.ok(Fs.dist[nodeOf(T, cellIx(gx, gy), 0)] >= FLOW_INF, tag + ': shut, no route in');
    }
  }
  assert.ok(n >= 300, n + ' yards placed');
});

// Does a mover walking straight at (tx, ty) get stuck on the way (a cliff
// face it cannot slide past)?
function straightWalkStuck(T, x, y, z, tx, ty) {
  for (let i = 0; i < 1500; i++) {
    const d = Math.hypot(tx - x, ty - y);
    if (d < 40) return false;
    [x, y, z] = terrainStep(T, x, y, z, x + ((tx - x) / d) * 2, y + ((ty - y) / d) * 2);
  }
  return true;
}
// The mask as it was: every footprint grown by the mover's ring.
function oldMask(rects) {
  const b = new Uint8Array(TN * TN), m = 7;
  for (const r of rects) {
    for (let c = 0; c < TN * TN; c++) {
      const cx = -TEXT + (c % TN) * TCELL + TCELL / 2, cy = -TEXT + Math.floor(c / TN) * TCELL + TCELL / 2;
      if (cx >= r.x - m && cx <= r.x + r.w + m && cy >= r.y - m && cy <= r.y + r.h + m) b[c] = 1;
    }
  }
  return b;
}
// A case the old mask got wrong: it sealed the open yard, and the hero
// starts on a plateau top a cliff cuts off from the yard (the straight walk
// sticks on the cliff; only the ramps lead there).
function sealedCase(stage) {
  for (let seed = 1; seed <= 40; seed++) {
    const { rects, yard } = yardOf(seed, stage);
    if (!yard) continue;
    const T = terrainFor(seed, stage);
    const gn = nodeOf(T, cellIx(yard.x, yard.y), floorAt(T, yard.x, yard.y, 0));
    const F = flowField(T, [gn], oldMask(rects.concat(yardRects(yard, true))));
    for (const p of T.plateaus) {
      for (let fx = 0.2; fx <= 0.8; fx += 0.1) for (let fy = 0.2; fy <= 0.8; fy += 0.1) {
        const x = p.x + p.w * fx, y = p.y + p.h * fy;
        if (T.tier[cellIx(x, y)] !== 2 || F.dist[nodeOf(T, cellIx(x, y), 2)] < FLOW_INF) continue;
        if (terrainLineClear(T, x, y, 2, yard.x, yard.y) || !straightWalkStuck(T, x, y, 2, yard.x, yard.y)) continue;
        return { seed, stage, rects, yard, T, start: [x, y] };
      }
    }
  }
  return null;
}

s.check('route: a flow field built while the gate was shut is not reused once it opens', () => {
  const k = sealedCase('VERDANT_HOLLOW');
  assert.ok(k, 'a seed with a cliff between a plateau top and the yard');
  const { seed, stage, yard, T, start } = k;
  const ctl = new CTL.AutoPilotController();
  const p = { x: start[0], y: start[1], tz: 2 };
  const state = { enemies: [], gems: [], groundSeed: seed, stage, pilotGoal: { x: yard.x, y: yard.y, hold: 0, site: yard } };
  setExtraRects(seed, stage, yardRects(yard, false));
  ctl.decide(p, state, C.PLAYER);
  setExtraRects(seed, stage, yardRects(yard, true));
  const m = ctl.decide(p, state, C.PLAYER);
  const gn = nodeOf(T, cellIx(yard.x, yard.y), floorAt(T, yard.x, yard.y, 0));
  const want = flowDir(T, flowField(T, [gn], CTL.pilotBlock(T, buildingRects(seed, stage))), p.x, p.y, 2);
  assert.ok(want, 'the open yard has a route from the plateau top');
  assert.ok(Math.hypot(m.moveX - want[0], m.moveY - want[1]) < 1e-6,
    `the pilot follows the fresh route (${m.moveX.toFixed(2)}, ${m.moveY.toFixed(2)}) vs (${want[0].toFixed(2)}, ${want[1].toFixed(2)})`);
  setExtraRects(seed, stage, null);
});

// ------------------------------------------------------------ AUTO and gems
s.check('AUTO: a gem inside the shut yard is not a goal; once the gate opens it is', () => {
  const stage = 'VERDANT_HOLLOW', seed = 2;
  const { yard } = yardOf(seed, stage);
  assert.ok(yard);
  const [gx, gy] = gateOutside(yard);
  const inside = { x: yard.x, y: yard.y, xp: 5 }, outside = { x: gx, y: gy + 0.5, xp: 5 };
  const p = { x: gx, y: gy };
  yard.open = false;
  setExtraRects(seed, stage, yardRects(yard, false));
  const ctl = new CTL.AutoPilotController();
  const state = { enemies: [], gems: [inside], groundSeed: seed, stage, poi: { yard } };
  ctl.decide(p, state, C.PLAYER);
  assert.equal(ctl.gem, null, 'shut: the gem inside is left alone');
  assert.notEqual(ctl.act, 'LOOT');
  state.gems.push(outside);
  ctl.decide(p, state, C.PLAYER);
  assert.equal(ctl.gem, outside, 'a gem outside is still taken');
  state.gems.pop();
  yard.open = true;
  setExtraRects(seed, stage, yardRects(yard, true));
  ctl.decide(p, state, C.PLAYER);
  assert.equal(ctl.gem, inside, 'open: the gem inside is a goal');
  setExtraRects(seed, stage, null);
});

// ------------------------------------------------------------ walkers: the way round
s.check('walkers: round a corner when the yard is in the way, through the gate only for a hero inside', () => {
  assert.equal(typeof VY.yardWay, 'function', 'yardWay is exported');
  const Y = { x: 0, y: 0, gateSide: 'n' }, m = VAULT.WALK_R + 6;
  const open = yardRects(Y, true), shut = yardRects(Y, false);
  // way(walls, hero, walker, chase): the point a walker heads for, or null (its own way).
  const way = (walls, [hx, hy], [wx, wy], chase = true) =>
    VY.yardWay(VY.yardForWalkers(Y, walls, hx, hy), wx, wy, hx, hy, chase);
  // The hero outside (gate open or shut): the yard is a block to walk round.
  for (const walls of [open, shut]) {
    assert.equal(way(walls, [80, -100], [-80, -100]), null, 'a clear line: its own way');
    assert.deepEqual(way(walls, [200, 0], [-70, 10]), [-HW - m, HH + m], 'west of it, hero east: the nearer west corner');
    assert.deepEqual(way(walls, [200, 0], [-70, -10]), [-HW - m, -HH - m]);
    assert.deepEqual(way(walls, [200, 0], [-HW - 9, -HH - 9]), [HW + m, -HH - m], 'at the corner: on along the north side');
    assert.equal(way(walls, [200, 0], [-70, 10], false), null, 'not walking at the hero: its own way');
  }
  // The hero inside the open yard: to the point outside the gate, then in.
  assert.deepEqual(way(open, [0, 0], [0, 80]), [-HW - m, HH + m], 'behind it: round a back corner to the gate');
  assert.deepEqual(way(open, [0, 0], [30, 80]), [HW + m, HH + m], 'the nearer back corner');
  assert.deepEqual(way(open, [0, 0], [60, -HH - m]), [0, -HH - m], 'on the gate side: the point outside the gate');
  assert.deepEqual(way(open, [0, 10], [3, -HH - m]), [0, -HH + VAULT.WALL + m], 'in the gate lane: the point just inside');
  assert.equal(way(open, [0, 10], [20, 5]), null, 'both inside: straight at him');
  // A walker inside, the hero outside: to the gate, then out (whatever it was doing).
  assert.deepEqual(way(open, [0, 200], [30, 20], false), [0, -HH + VAULT.WALL + m], 'off the gate axis: the point just inside');
  assert.deepEqual(way(open, [0, 200], [2, 0], false), [0, -HH - m], 'on the axis: out through the gate');
  assert.deepEqual(way(open, [0, 200], [2, -HH - 3], false), [0, -HH - m], 'in the gateway: on out');
  // The walls that hold a walker: the open gate counts as shut for one outside while the hero is outside.
  const gateHeld = (walls, hero) => (VY.yardWallsFor(VY.yardForWalkers(Y, walls, hero[0], hero[1]), 0, -HH - 10) || []).some(r => r.gate);
  assert.equal(gateHeld(open, [0, 200]), true, 'hero outside: a walker at the open gate meets a wall');
  assert.equal(gateHeld(open, [0, 0]), false, 'hero inside: the gate is open to it');
  const v = VY.yardForWalkers(Y, shut, 0, 200);
  assert.equal(VY.yardWallsFor(v, 0, 0), null, 'inside the shut yard: nothing holds it (it walks out)');
  assert.equal(VY.yardWallsFor(v, -HW - 3, 0), null, 'caught in a wall: nothing holds it');
  assert.equal(VY.yardWallsFor(v, -HW - 200, 0), null, 'far from the yard: not asked');
  assert.equal(VY.yardWallsFor(v, -HW - 10, 0), shut, 'by the wall: held');
  assert.equal(VY.yardForWalkers(Y, [], 0, 0), null, 'no walls: no yard');
});

// ------------------------------------------------------------ the key
s.check('key: a carrier that dies past the rim drops the key inside the floor the hero can reach', () => {
  const w = { vault: { x: 0, y: 0, state: 'unused' }, hasKey: false, keyDrop: null, carrier: { x: 1080, y: -1200, hp: 0 } };
  const ev = tickVaultYard(w, { player: { x: 300, y: 300 } });
  assert.equal(ev[0].kind, 'keyDropped');
  assert.ok(Math.abs(w.keyDrop.x) <= lootLimit() && Math.abs(w.keyDrop.y) <= lootLimit(),
    `the key lies at (${w.keyDrop.x}, ${w.keyDrop.y}), inside ${lootLimit()}`);
  assert.deepEqual([ev[0].x, ev[0].y], [w.keyDrop.x, w.keyDrop.y], 'the event carries the same spot');
  const w2 = { vault: w.vault, hasKey: false, keyDrop: null, carrier: { x: 120, y: -40, hp: 0 } };
  tickVaultYard(w2, { player: { x: 300, y: 300 } });
  assert.deepEqual(w2.keyDrop, { x: 120, y: -40 }, 'a key inside the floor lies where the carrier fell');
});

// ------------------------------------------------------------- live
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const quiet = () => {
  st.enemies.length = 0; st.gems.length = 0; st.drops.length = 0; st.enemyShots.length = 0;
  st.spawnTimer = 999; st.wave.endsAt = st.time + 999;
};
// The first seed of a stage whose yard stands on open ground (no cliff,
// ramp or rim within 250 px), so the walks below are about the yard alone.
function plainYard(stage) {
  for (let seed = 1; seed <= 40; seed++) {
    const { yard } = yardOf(seed, stage);
    if (!yard || Math.abs(yard.x) > C.GROUND.RIM - 300 || Math.abs(yard.y) > C.GROUND.RIM - 300) continue;
    if (!rectOnFeature(terrainFor(seed, stage), { x: yard.x - 250, y: yard.y - 250, w: 500, h: 500 }, 0)) return seed;
  }
  assert.fail(stage + ': no yard on open ground in seeds 1-40');
}
const PLAIN = ['VERDANT_HOLLOW', 'BONE_DESERT'].map(stage => [stage, plainYard(stage)]);
// A run on (stage, seed) with its sites, vault, yard and lever placed.
function run(stage, seed) {
  T.stages.select(stage); st.mode = 'menu'; T.startRun(); quiet();
  T.setPilotMode('MANUAL');
  st.groundSeed = seed; T.sites.seed();
  return st.poi.yard;
}
function openYard(Y) {
  Y.open = true; Y.state = 'spent'; st.poi.lever.state = 'spent';
  setExtraRects(st.groundSeed, st.stage, yardRects(Y, true));
}
// Chasers that cannot die, `n` on a ring of radius `r` round (cx, cy) from angle a0.
function ring(n, cx, cy, r, a0, spread) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (spread ? (i - (n - 1) / 2) * spread : (i / n) * Math.PI * 2);
    const e = makeTypedEnemy('CHASER', cx + Math.cos(a) * r, cy + Math.sin(a) * r, st.time);
    e.hp = e.maxHp = 1e9;
    st.enemies.push(e); out.push(e);
  }
  return out;
}
// One frame with the hero kept alive and nothing else spawning.
function frame() {
  st.spawnTimer = 999; st.wave.endsAt = st.time + 999;
  st.player.hp = st.player.stats.maxHp; st.player.invuln = 1;
  h.pump(1);
  assert.equal(st.mode, 'playing');
}

s.check('live: the shut yard stops walkers; they come round it to the hero', () => {
  for (const [stage, seed] of PLAIN) {
    const Y = run(stage, seed);
    assert.ok(Y && !Y.open);
    const walls = yardRects(Y, false);
    const g = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[Y.gateSide];
    // The hero stands behind the yard; the chasers start on the gate side.
    st.player.x = Y.x - g[0] * 120; st.player.y = Y.y - g[1] * 120; st.player.tz = 0;
    st.weapons.length = 0;
    const foes = ring(8, Y.x + g[0] * 60, Y.y + g[1] * 60, 170, 0.2);
    const born = makeTypedEnemy('CHASER', Y.x, Y.y, st.time);   // one spawned inside the shut yard
    born.hp = born.maxHp = 1e9; st.enemies.push(born);
    const reached = new Set();
    let bornOut = false;
    for (let f = 0; f < 60 * 10; f++) {
      frame();
      for (const e of foes) {
        assert.ok(!inYard(Y, e.x, e.y), `${stage}/${seed}: a walker is inside the shut yard at frame ${f}`);
        assert.ok(!buildingTouchesDisc(walls, e.x, e.y, 6), `${stage}/${seed}: a walker is in a wall at frame ${f}`);
        if (Math.hypot(e.x - st.player.x, e.y - st.player.y) < 20) reached.add(e);
      }
      if (!inYard(Y, born.x, born.y)) bornOut = true;
    }
    assert.equal(reached.size, foes.length, `${stage}/${seed}: ${reached.size} of ${foes.length} walkers came round`);
    assert.ok(bornOut, 'a walker spawned inside the shut yard walks out');
  }
});

s.check('live: the open yard lets walkers in through the gate only', () => {
  for (const [stage, seed] of PLAIN) {
    const Y = run(stage, seed);
    openYard(Y);
    const walls = yardRects(Y, true);
    st.player.x = Y.x; st.player.y = Y.y; st.player.tz = 0;
    st.weapons.length = 0;
    const foes = ring(8, Y.x, Y.y, 170, 0.2);
    const reached = new Set(), wasIn = new Set();
    for (let f = 0; f < 60 * 10; f++) {
      frame();
      for (const e of foes) {
        assert.ok(!buildingTouchesDisc(walls, e.x, e.y, 6), `${stage}/${seed}: a walker is in a wall at frame ${f}`);
        if (inYard(Y, e.x, e.y) && !wasIn.has(e)) {
          wasIn.add(e);
          assert.ok(offGate(Y, e.x, e.y) < VAULT.GATE_W / 2, `${stage}/${seed}: a walker came in through a wall`);
        }
        if (Math.hypot(e.x - st.player.x, e.y - st.player.y) < 20) reached.add(e);
      }
    }
    assert.equal(reached.size, foes.length, `${stage}/${seed}: ${reached.size} of ${foes.length} walkers came in`);
  }
});

s.check('live: with the hero outside, walkers do not wander into the open yard; one inside walks out through the gate', () => {
  for (const [stage, seed] of PLAIN) {
    const Y = run(stage, seed);
    openYard(Y);
    const g = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[Y.gateSide];
    // The hero stands behind the yard; the chasers come at him across the gate side.
    st.player.x = Y.x - g[0] * 120; st.player.y = Y.y - g[1] * 120; st.player.tz = 0;
    st.weapons.length = 0;
    const foes = ring(8, Y.x + g[0] * 60, Y.y + g[1] * 60, 170, 0.2);
    const born = makeTypedEnemy('CHASER', Y.x - g[0] * 20, Y.y - g[1] * 20, st.time);   // one left inside
    born.hp = born.maxHp = 1e9; st.enemies.push(born);
    const reached = new Set();
    let bornOut = null;
    for (let f = 0; f < 60 * 10; f++) {
      frame();
      for (const e of foes) {
        assert.ok(!inYard(Y, e.x, e.y), `${stage}/${seed}: a walker went into the yard at frame ${f}`);
        if (Math.hypot(e.x - st.player.x, e.y - st.player.y) < 20) reached.add(e);
      }
      if (bornOut == null && !inYard(Y, born.x, born.y)) bornOut = offGate(Y, born.x, born.y);
      if (Math.hypot(born.x - st.player.x, born.y - st.player.y) < 20) reached.add(born);
    }
    assert.ok(bornOut != null && bornOut < VAULT.GATE_W / 2, `${stage}/${seed}: the one inside left through the gate`);
    assert.equal(reached.size, foes.length + 1, `${stage}/${seed}: ${reached.size} of ${foes.length + 1} walkers reached the hero`);
  }
});

s.check('live: the hero at the open yard\'s centre leaves through the gate within 3 s and stays out', () => {
  for (const [stage, seed] of PLAIN) {
    for (const mode of ['AUTO_ALL', 'EXPLORE']) {
      for (const [where, turn] of [['the gate side', 0], ['a side', Math.PI / 2], ['the back', Math.PI]]) {
        const Y = run(stage, seed);
        openYard(Y);
        st.player.x = Y.x; st.player.y = Y.y; st.player.tz = 0;
        const g = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[Y.gateSide];
        ring(8, Y.x, Y.y, 170, Math.atan2(g[1], g[0]) + turn, 0.3);
        T.setPilotMode(mode);
        const tag = `${stage}/${seed} ${mode}, chasers on ${where}`;
        let out = null, wasIn = true;
        for (let f = 0; f < 60 * 6; f++) {
          frame();
          const now = inYard(Y, st.player.x, st.player.y);
          if (!now && wasIn && out == null) {
            out = f / 60;
            assert.ok(offGate(Y, st.player.x, st.player.y) < VAULT.GATE_W / 2, tag + ': out through the gate');
          }
          if (out != null) assert.ok(!now, `${tag}: back inside the yard at ${(f / 60).toFixed(1)} s`);
          wasIn = now;
        }
        assert.ok(out != null && out <= 3, `${tag}: left the yard at ${out == null ? 'never' : out.toFixed(1) + ' s'}`);
      }
    }
  }
  T.setPilotMode('AUTO_ALL');
});

s.check('live: a waypoint on the open yard across a cliff is walked, down the ramp and in through the gate', () => {
  const k = sealedCase('VERDANT_HOLLOW');
  assert.ok(k);
  const Y = run(k.stage, k.seed);
  assert.deepEqual([Y.x, Y.y, Y.gateSide], [k.yard.x, k.yard.y, k.yard.gateSide]);
  const L = st.poi.lever;
  st.player.x = L.x; st.player.y = L.y;
  T.world.tick(st.player, 1 / 60);
  assert.equal(Y.open, true, 'the lever opened the gate');
  st.player.x = k.start[0]; st.player.y = k.start[1]; st.player.tz = 2;
  T.setPilotMode('AUTO_ALL');
  T.sites.setWaypoint(Y);
  for (let f = 0; f < 60 * 45 && Y.state !== 'spent' && st.waypoint; f++) { quiet(); frame(); }
  assert.equal(Y.state, 'spent', `seed ${k.seed}: the pilot reached the yard (hero at ${Math.round(st.player.x)}, ${Math.round(st.player.y)}, waypoint ${st.waypoint ? 'still set' : 'given up'})`);
});

s.check('live: EXPLORE picks up a key whose carrier died past the rim', () => {
  run('VERDANT_HOLLOW', 2);
  const w = st.poi;
  st.player.x = 600; st.player.y = 40; st.player.tz = 0;
  const e = makeTypedEnemy('CHASER', 1080, 40, st.time, { elite: true });
  e.keyCarrier = true; w.carrier = e;
  e.hp = 0; T.world.onDeath(e);
  T.world.tick(st.player, 1 / 60);
  assert.ok(w.keyDrop && w.keyDrop.x <= lootLimit(), 'the key fell inside the floor');
  T.setPilotMode('EXPLORE');
  for (let f = 0; f < 60 * 20 && !w.hasKey; f++) { quiet(); frame(); }
  assert.equal(w.hasKey, true, `the hero holds the key (hero at ${Math.round(st.player.x)}, ${Math.round(st.player.y)})`);
  T.setPilotMode('AUTO_ALL');
});

s.done();
