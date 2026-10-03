// HORDES — M5b landscape: authored elevation (src/terrain.js).
//   layouts:  deterministic per (seed, stage); spawn, tutorial and rim flat
//   movement: cliff faces block, ramps climb, drop edges are one-way, bridges
//             carry an upper and a lower floor
//   routing:  ground walkers reach a hero on a plateau through the ramps; the
//             flow field stays cheap at 1,000 enemies
//   reach:    every cell reachable from the spawn and back; sites flat and
//             reachable on every stage x 3 seeds
//   live:     a chaser climbs to the hero; a SHRIKE overflies the cliff; the
//             high-ground damage bonus only applies from above; the pilot
//             walks a waypoint onto a plateau without a stall
// Run: node test/test_terrain.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import {
  terrainFor, buildTerrain, LAYOUTS, TNN, TN, TCELL, TEXT, F_RAMP, F_DROP, F_BRIDGE,
  cellIx, cellCenter, terrainStep, floorAt, flowField, flowDir, FLOW_INF,
  spawnReach, flatSpot, nodeOf, CLEAR_X, CLEAR_Y, CLEAR_R, RIM_KEEP, tierIn,
} from '../src/terrain.js';
import { placeSites } from '../src/sites.js';
import { buildingRects, buildingFixedPoints } from '../src/stage_buildings.js';
import { STAGE_IDS } from '../src/stages.js';
import { makeTypedEnemy } from '../src/enemy_types.js';
import { STALL_PERIOD_FRAMES, STALL_SPAN_PX } from '../src/controllers.js';

const s = suite('test_terrain');
const SEEDS = [11, 4242, 90210];

s.check('every stage has a layout, and it is a pure function of (seed, stage)', () => {
  for (const st of STAGE_IDS) {
    assert.ok(LAYOUTS[st], st + ' has a layout');
    for (const seed of SEEDS) {
      const a = buildTerrain(seed, st), b = buildTerrain(seed, st);
      assert.ok(a && a.plateaus.length >= 1, st + ' places plateaus');
      assert.deepEqual([...a.tier], [...b.tier]);
      assert.deepEqual([...a.flags], [...b.flags]);
      a.plateaus.forEach((p, i) => assert.ok(p.ramps.length >= 1 || a.bridges.some(q => q.a === i || q.b === i),
        'every plateau has a ramp or a bridge'));
    }
  }
  const t1 = buildTerrain(11, 'ASHEN_WASTE'), t2 = buildTerrain(4242, 'ASHEN_WASTE'), t3 = buildTerrain(90210, 'ASHEN_WASTE');
  assert.ok([t2, t3].some(t => t.tier.some((v, i) => v !== t1.tier[i])), 'seeds vary the layout');
  assert.ok(buildTerrain(11, 'VERDANT_HOLLOW').plateaus.length >= 1, 'stage 1 has a small plateau');
});

s.check('the spawn clearing, the tutorial points and the rim stay flat and open', () => {
  for (const st of STAGE_IDS) {
    for (const seed of SEEDS) {
      const T = terrainFor(seed, st);
      for (let c = 0; c < TNN; c++) {
        const [x, y] = cellCenter(c);
        const nearClear = Math.hypot(x - CLEAR_X, y - CLEAR_Y) < CLEAR_R - TCELL;
        const nearRim = Math.abs(x) > TEXT - RIM_KEEP + TCELL || Math.abs(y) > TEXT - RIM_KEEP + TCELL;
        if (nearClear || nearRim) assert.ok(T.tier[c] === 0 && T.flags[c] === 0, `${st}/${seed} open at ${x},${y}`);
      }
      for (const [x, y] of [[0, 0], ...buildingFixedPoints()]) assert.equal(T.tier[cellIx(x, y)], 0);
    }
  }
});

// Walk a mover in 3 px steps; returns its final [x, y, z].
function walk(T, x, y, z, dx, dy, n) {
  for (let i = 0; i < n; i++) [x, y, z] = terrainStep(T, x, y, z, x + dx * 3, y + dy * 3);
  return [x, y, z];
}
// A top cell on an outer edge with plain ground beyond (no ramp mouth near),
// drop-flagged or not as asked. Returns the cell and the outward direction.
function edgeCell(T, drop) {
  for (let c = 0; c < TNN; c++) {
    if (T.tier[c] !== 2 || (T.flags[c] & (F_RAMP | F_BRIDGE))) continue;
    if (!!(T.flags[c] & F_DROP) !== drop) continue;
    const gx = c % TN, gy = Math.floor(c / TN);
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const ok = [1, 2, 3].every(k => {
        const nx = gx + dx * k, ny = gy + dy * k;
        if (nx < 0 || ny < 0 || nx >= TN || ny >= TN) return false;
        const c1 = ny * TN + nx;
        return T.tier[c1] === 0 && !T.flags[c1];
      });
      const sideOk = [-2, -1, 0, 1, 2].every(k => {
        const nx = gx + (dy ? k : 0), ny = gy + (dx ? k : 0);
        if (nx < 0 || ny < 0 || nx >= TN || ny >= TN) return false;
        const c1 = ny * TN + nx;
        return T.tier[c1] === 2 && !!(T.flags[c1] & F_DROP) === drop && !(T.flags[c1] & F_RAMP);
      });
      if (ok && sideOk) return { c, dx, dy };
    }
  }
  return null;
}

s.check('cliff faces block movers both ways; drop edges are one-way down', () => {
  let faces = 0, drops = 0;
  for (const st of STAGE_IDS) {
    const T = terrainFor(4242, st);
    const f = edgeCell(T, false);
    if (f) {
      faces++;
      const [x, y] = cellCenter(f.c);
      const below = [x + f.dx * TCELL * 2, y + f.dy * TCELL * 2];
      const up = walk(T, below[0], below[1], 0, -f.dx, -f.dy, 40);
      assert.equal(floorAt(T, up[0], up[1], up[2]), 0, st + ': a face blocks the climb');
      const down = walk(T, x, y, 2, f.dx, f.dy, 40);
      assert.equal(floorAt(T, down[0], down[1], down[2]), 2, st + ': a face blocks the descent');
    }
    const d = edgeCell(T, true);
    if (d) {
      drops++;
      const [x, y] = cellCenter(d.c);
      const off = walk(T, x, y, 2, d.dx, d.dy, 30);
      assert.equal(off[2], 0, st + ': stepping off a drop edge lands on low ground');
      const back = walk(T, off[0], off[1], 0, -d.dx, -d.dy, 30);
      assert.equal(back[2], 0, st + ': no climbing back up a drop edge');
    }
  }
  assert.ok(faces >= 6 && drops >= 6, `faces ${faces}, drops ${drops} tested`);
});

s.check('ramps climb to the top; bridges carry an upper and a lower floor', () => {
  for (const st of STAGE_IDS) {
    const T = terrainFor(11, st);
    const p = T.plateaus.find(q => q.ramps.length);
    const r = p.ramps[0];
    const dir = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[r.side];
    const fx = r.x + r.w / 2 - dir[0] * (r.w / 2 + 12), fy = r.y + r.h / 2 - dir[1] * (r.h / 2 + 12);
    const end = walk(T, fx, fy, 0, dir[0], dir[1], 120);
    assert.ok(floorAt(T, end[0], end[1], end[2]) >= 2, st + ': up the ramp onto the top');
  }
  const T = terrainFor(11, 'VOID_REACH');
  assert.ok(T.bridges.length >= 2);
  const b = T.bridges[0];
  const mid = [b.x + b.w / 2, b.y + b.h / 2];
  assert.equal(tierIn(T, cellIx(mid[0], mid[1]), 2), 2, 'upper floor');
  assert.equal(tierIn(T, cellIx(mid[0], mid[1]), 0), 0, 'lower floor');
  const ax = b.axis === 'EW' ? [0, 1] : [1, 0];
  const start = [mid[0] - ax[0] * 60, mid[1] - ax[1] * 60];
  const under = walk(T, start[0], start[1], 0, ax[0], ax[1], 40);
  assert.ok(Math.hypot(under[0] - start[0], under[1] - start[1]) > 100, 'walks under the bridge');
  assert.equal(under[2], 0);
});

s.check('every cell is reachable from the spawn and leads back (no traps), every stage x 3 seeds', () => {
  for (const st of STAGE_IDS) {
    for (const seed of SEEDS) {
      const T = terrainFor(seed, st);
      const R = spawnReach(T);
      const back = flowField(T, [T.spawnNode]);
      for (let n = 0; n < 2 * TNN; n++) {
        if (n >= TNN && !(T.flags[n - TNN] & F_BRIDGE)) continue;
        assert.ok(R[n], `${st}/${seed}: node ${n} reachable`);
        assert.ok(back.dist[n] < FLOW_INF, `${st}/${seed}: node ${n} leads back`);
      }
    }
  }
});

s.check('sites stand on flat reachable ground; the altar takes the crown where it fits', () => {
  let crowned = 0, total = 0;
  for (const st of STAGE_IDS) {
    for (const seed of SEEDS) {
      const T = terrainFor(seed, st);
      const sites = placeSites(seed, st, buildingRects(seed, st), 900);
      for (const x of sites) assert.ok(flatSpot(T, x.x, x.y), `${st}/${seed} ${x.kind} at ${x.x},${x.y}`);
      const altar = sites.find(x => x.kind === 'altar');
      total++;
      if (altar && T.tier[cellIx(altar.x, altar.y)] >= 2) crowned++;
    }
  }
  assert.ok(crowned >= total * 0.6, `altar on high ground in ${crowned}/${total}`);
});

s.check('ground walkers reach a hero on a plateau through the ramps (pure routing)', () => {
  for (const st of ['ASHEN_WASTE', 'BONE_DESERT', 'VOID_REACH', 'CINDER_MAW']) {
    const T = terrainFor(4242, st);
    const p = T.plateaus[0];
    const top = p.upper || p;
    const hx = top.x + top.w / 2, hy = top.y + top.h / 2, hz = p.upper ? 4 : 2;
    const F = flowField(T, [nodeOf(T, cellIx(hx, hy), hz)]);
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const a = i * 2.39996, r = 200 + (i % 5) * 60;
      let x = Math.max(-860, Math.min(860, hx + Math.cos(a) * r));
      let y = Math.max(-860, Math.min(860, hy + Math.sin(a) * r));
      let z = floorAt(T, x, y, 0);
      n++;
      let ok = false;
      for (let k = 0; k < 4000 && !ok; k++) {
        const d = flowDir(T, F, x, y, z);
        const dx = d ? d[0] : hx - x, dy = d ? d[1] : hy - y, L = Math.hypot(dx, dy) || 1;
        [x, y, z] = terrainStep(T, x, y, z, x + dx / L * 2.5, y + dy / L * 2.5);
        ok = Math.hypot(hx - x, hy - y) < 16;
      }
      assert.ok(ok, `${st}: walker ${i} reached the hero (ended ${Math.round(x)},${Math.round(y)} z${z})`);
    }
    assert.ok(n >= 40);
  }
});

s.check('perf: one hero flow field + 1,000 enemy route reads stay cheap', () => {
  const T = terrainFor(4242, 'BLOOD_RUST');
  const pts = [];
  for (let i = 0; i < 1000; i++) pts.push([(i * 37 % 1700) - 850, (i * 91 % 1700) - 850]);
  const times = [];
  for (let rep = 0; rep < 5; rep++) {
    const t0 = performance.now();
    const F = flowField(T, [nodeOf(T, cellIx(-600 + rep * 7, -600), 0)]);
    for (const [x, y] of pts) flowDir(T, F, x, y, 0);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  console.log('    routing cost (field + 1,000 reads), median ms:', times[2].toFixed(2));
  assert.ok(times[2] < 25, 'median ' + times[2].toFixed(2) + ' ms');
});

// ------------------------------------------------------------- live
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const quiet = () => {
  st.enemies.length = 0; st.gems.length = 0; st.drops.length = 0; st.enemyShots.length = 0;
  st.spawnTimer = 999; st.wave.endsAt = st.time + 999;
};
const fresh = (stage) => { T.stages.select(stage); st.mode = 'menu'; T.startRun(); quiet(); T.setPilotMode('MANUAL'); };
const onTop = (TER) => {
  const p = TER.plateaus.find(q => q.ramps.length) || TER.plateaus[0];
  return { p, x: p.x + p.w / 2, y: p.y + p.h / 2 };
};
const godHero = () => { st.player.hp = st.player.stats.maxHp; st.player.invuln = 1; };

s.check('live: a chaser below walks the ramps up to a hero standing on a plateau', () => {
  fresh('ASHEN_WASTE');
  const TER = terrainFor(st.groundSeed, st.stage);
  const top = onTop(TER);
  st.player.x = top.x; st.player.y = top.y; st.player.tz = 2;
  const ex = top.p.x + top.p.w / 2, ey = Math.min(860, top.p.y + top.p.h + 60);
  const e = makeTypedEnemy('CHASER', ex, ey, st.time);
  e.hp = e.maxHp = 1e9;
  st.enemies.push(e);
  let reached = false;
  for (let f = 0; f < 60 * 40 && !reached; f++) {
    godHero(); st.spawnTimer = 999; st.player.x = top.x; st.player.y = top.y;
    h.pump(1);
    reached = Math.hypot(e.x - top.x, e.y - top.y) < 24;
  }
  assert.ok(reached, `chaser reached the hero (at ${Math.round(e.x)},${Math.round(e.y)} z${e.tz})`);
  assert.ok(e.tz >= 2, 'it is on the top');
});

s.check('live: a SHRIKE flies straight over a cliff face', () => {
  fresh('BONE_DESERT');
  const TER = terrainFor(st.groundSeed, st.stage);
  const f = edgeCell(TER, false);
  const [x, y] = cellCenter(f.c);
  st.player.x = x - f.dx * 40; st.player.y = y - f.dy * 40; st.player.tz = 2;
  const e = makeTypedEnemy('SHRIKE', x + f.dx * 120, y + f.dy * 120, st.time);
  e.hp = e.maxHp = 1e9;
  st.enemies.push(e);
  let best = Infinity;
  const hx = st.player.x, hy = st.player.y;
  for (let fr = 0; fr < 60 * 8; fr++) {
    godHero(); st.spawnTimer = 999; st.player.x = hx; st.player.y = hy;
    h.pump(1);
    best = Math.min(best, Math.hypot(e.x - hx, e.y - hy));
  }
  assert.ok(best < 40, 'the flyer closed to ' + Math.round(best) + ' px across the cliff');
});

s.check('live: the high-ground damage bonus applies only from above', () => {
  fresh('ASHEN_WASTE');
  const e = makeTypedEnemy('CHASER', 0, 0, st.time);
  const p = st.player;
  p.highGround = false; p.tz = 0; e.tz = 0;
  const base = T.heroHitMult(st, e);
  p.highGround = true; p.tz = 2;
  assert.ok(Math.abs(T.heroHitMult(st, e) - base * 1.15) < 1e-9, 'hero above: +15%');
  e.tz = 2;
  assert.equal(T.heroHitMult(st, e), base, 'same level: no bonus');
  e.tz = 0; e.flying = true;
  assert.equal(T.heroHitMult(st, e), base, 'flyers: no bonus');
  p.highGround = false; p.tz = 0; e.flying = false;
  assert.equal(T.heroHitMult(st, e), base, 'hero below: no bonus');
});

s.check('live: the pilot walks a waypoint onto a plateau through a ramp, no stall', () => {
  for (const stage of ['VERDANT_HOLLOW', 'ASHEN_WASTE', 'SNOWFIELD', 'BONE_DESERT', 'VOID_REACH', 'CINDER_MAW']) {
    fresh(stage);
    const TER = terrainFor(st.groundSeed, st.stage);
    const top = onTop(TER);
    const site = st.sites.find(x => x.kind === 'fountain');
    let fx = top.x, fy = top.y;
    if (!flatSpot(TER, fx, fy)) { fx = top.p.x + 40; fy = top.p.y + 40; }
    site.x = Math.round(fx); site.y = Math.round(fy);
    // The hero starts where the run puts it (the footing clears the buildings).
    T.setPilotMode('AUTO_ALL');
    T.sites.setWaypoint(site);
    let arrived = false, ax = st.player.x, ay = st.player.y, stalls = 0;
    for (let f = 1; f <= 60 * 50 && !arrived; f++) {
      quiet(); godHero();
      h.pump(1);
      arrived = Math.hypot(st.player.x - site.x, st.player.y - site.y) < 36;
      if (f % STALL_PERIOD_FRAMES === 0) {
        if (Math.hypot(st.player.x - ax, st.player.y - ay) < STALL_SPAN_PX) stalls++;
        ax = st.player.x; ay = st.player.y;
      }
    }
    assert.ok(arrived, `${stage}: arrived (at ${Math.round(st.player.x)},${Math.round(st.player.y)} tz${st.player.tz}, goal ${site.x},${site.y}, mode ${st.mode}, pilot ${st.pilotMode}, wp ${!!st.waypoint}, act ${st.stanceAct}, prologue ${!!st.prologue}, stalled ${!!st.pilotGoalStalled}, used ${site.state})`);
    assert.equal(stalls, 0, stage + ': no stall window');
    assert.ok(st.player.tz >= 2, stage + ': on the top');
  }
});

s.check('live: a portal across a cliff corner is entered (regression: WHITEOUT seed 950626055 livelock)', () => {
  fresh('WHITEOUT');
  st.groundSeed = 950626055;
  T.setPilotMode('AUTO_ALL');
  st.player.x = -636; st.player.y = 441; st.player.tz = 1;
  st.portal = { x: -655, y: 455, age: 0 };
  let gone = false;
  for (let f = 0; f < 60 * 20 && !gone; f++) {
    st.enemies.length = 0; st.spawnTimer = 999;
    h.pump(1);
    gone = !st.portal || st.portal.entering;
  }
  assert.ok(gone, 'the pilot reached the portal');
  st.mode = 'menu';
});

s.check('live: a portal parked above a cliff face is reached via the ramps on every stage', () => {
  for (const stage of STAGE_IDS) {
    fresh(stage);
    T.setPilotMode('AUTO_ALL');
    const TER = terrainFor(st.groundSeed, st.stage);
    const f = edgeCell(TER, false) || edgeCell(TER, true);
    if (!f) continue;
    const [x, y] = cellCenter(f.c);
    st.player.x = x + f.dx * 30; st.player.y = y + f.dy * 30; st.player.tz = 0;
    st.portal = { x: x - f.dx * 2, y: y - f.dy * 2, age: 0 };
    let gone = false;
    for (let fr = 0; fr < 60 * 45 && !gone; fr++) {
      st.enemies.length = 0; st.spawnTimer = 999; godHero();
      h.pump(1);
      gone = !st.portal || st.portal.entering;
    }
    assert.ok(gone, stage + ': the pilot reached the portal (at ' + Math.round(st.player.x) + ',' + Math.round(st.player.y) + ')');
    st.mode = 'menu';
  }
});

s.done();
