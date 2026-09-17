// HORDES — M1: the per-run atlas (docs/briefs/M1_MAP_SCREEN.md +
// docs/HORDES_GOALS_2026-09-12.md "M1 — THE PER-RUN MAP SCREEN").
//
// The contract under test:
//   R3  GRID CORRECTNESS (pure): the index rule c = clamp(floor((w+600)/40),
//       0..29); a synthetic straight-line walk marks exactly the expected
//       cell SET (asserted as a set, not a count); a rim path clamps and
//       never writes out of bounds; a cell outside VISIT_RADIUS is NOT
//       marked; re-visiting is idempotent; the array never grows.
//   R4  DISCOVERY: a landmark flips exactly at DISCOVER_RADIUS (both sides
//       of the boundary), one-way; an undiscovered landmark is drawn NOWHERE
//       (renderer seam + paint recorder).
//   R5  THE SHRINE SEAM: startRun registers exactly S1's seeded shrine
//       positions as the run's landmarks — one registration path, no re-roll.
//   R2  ZERO RNG DRAWS: a seeded 60s run's summary + spawn-stream hash are
//       IDENTICAL with the atlas enabled and disabled.
//   R7  NO PAUSE: state.time advances while the map is open.
// Run: node test/test_atlas.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import {
  createAtlas, atlasGridSide, atlasCell, atlasMarkVisited,
  atlasRegisterLandmark, atlasDiscover, atlasUpdate,
  atlasVisitedCount, atlasDiscoveredCount,
} from '../src/atlas.js';
import { CONFIG as C } from '../src/config.js';
import { mulberry32 } from '../src/weather.js';

const s = suite('test_atlas');
const RIM = C.GROUND.RIM, CELL = C.ATLAS.MAP_CELL, VR = C.ATLAS.VISIT_RADIUS, DR = C.ATLAS.DISCOVER_RADIUS;
const SIDE = atlasGridSide(RIM, CELL);

// ---------------------------------------------------------------- pure grid
// ARENA SCALE-UP (2026-09-17) RETARGET: the extent pins read the units-based
// GROUND.RIM (was the literal 600 -> 30x30/900); the exact-division invariant
// is stated, not a hardcoded side.
s.check('config + geometry: 40px cells divide the +-RIM arena EXACTLY (side = 2*RIM/40)', () => {
  assert.equal(CELL, 40, 'MAP_CELL (C3: 40 divides the arena axis exactly)');
  assert.equal((2 * RIM) % CELL, 0, 'the cell divides the arena EXACTLY (no partial edge cell)');
  assert.equal(SIDE, (2 * RIM) / CELL, 'grid side derived from RIM');
  assert.equal(VR, 300, 'VISIT_RADIUS >= the 480x300 half-diagonal (~283)');
  assert.equal(DR, 120, 'DISCOVER_RADIUS');
});

s.check('index rule: c = clamp(floor((w + RIM) / 40), 0, side-1), both axes', () => {
  const a = createAtlas(RIM, CELL);
  assert.deepEqual(atlasCell(a, -RIM, -RIM), { cx: 0, cy: 0 }, 'rim corner -> (0,0)');
  assert.deepEqual(atlasCell(a, RIM - 0.1, RIM - 0.1), { cx: SIDE - 1, cy: SIDE - 1 }, 'far corner -> (side-1,side-1)');
  assert.deepEqual(atlasCell(a, 0, 0), { cx: Math.floor(SIDE / 2), cy: Math.floor(SIDE / 2) }, 'origin -> centre cell');
  assert.deepEqual(atlasCell(a, -RIM - 100, RIM + 100), { cx: 0, cy: SIDE - 1 }, 'past the rim clamps, never out of bounds');
});

s.check('R3: a straight-line walk marks EXACTLY the expected cell SET', () => {
  const a = createAtlas(RIM, CELL);
  // Walk (-400,-400) -> (400,400) in 1px steps (the per-frame call shape).
  const samples = [];
  for (let i = 0; i <= 1131; i++) {
    const w = -400 + (800 * i) / 1131;
    samples.push([w, w]);
    atlasMarkVisited(a, w, w, VR);
  }
  // The expected set, derived INDEPENDENTLY (brute force: every cell x every
  // sample, hypot — the module uses a bbox + squared distance).
  const want = new Set();
  for (let cy = 0; cy < SIDE; cy++) {
    for (let cx = 0; cx < SIDE; cx++) {
      const wx = cx * CELL - RIM + CELL / 2, wy = cy * CELL - RIM + CELL / 2;
      for (const [px, py] of samples) {
        if (Math.hypot(wx - px, wy - py) <= VR) { want.add(cy * SIDE + cx); break; }
      }
    }
  }
  const got = new Set();
  for (let i = 0; i < a.visited.length; i++) if (a.visited[i]) got.add(i);
  assert.deepEqual(got, want, 'the marked SET is exactly the radius rule, cell by cell');
  console.log('    straight walk marked ' + got.size + ' / ' + SIDE * SIDE + ' cells');
});

s.check('R3: rim path clamps at the edge cells and never writes out of bounds', () => {
  const a = createAtlas(RIM, CELL);
  for (let i = 0; i <= 500; i++) {           // walk far PAST the rim
    const w = RIM - 10 + (310 * i) / 500;    // RIM-10 -> RIM+300
    atlasMarkVisited(a, w, w, VR);
  }
  assert.equal(a.visited.length, SIDE * SIDE, 'the array never grows');
  assert.equal(a.visited[(SIDE - 1) * SIDE + (SIDE - 1)], 1, 'the corner cell is marked');
  for (let i = 0; i < SIDE * SIDE; i++) assert.ok(a.visited[i] === 0 || a.visited[i] === 1, 'only 0/1 writes');
});

s.check('R3: a cell outside VISIT_RADIUS is NOT marked; idempotent; never grows', () => {
  const a = createAtlas(RIM, CELL);
  // Player on a row CENTRE (y equals a cell centre), x = 3*CELL*2.5 so the
  // same-row cell centres sit at EXACT x distances (260, 300, 340) — clean
  // boundaries. RETARGET (arena scale-up): the row/y are derived from RIM,
  // not the old hardcoded row 15 at (0,20).
  const cy0 = Math.floor(SIDE / 2);
  const py = cy0 * CELL - RIM + CELL / 2;
  const px = 300;
  atlasMarkVisited(a, px, py, VR);
  const at = (wx) => { const c = atlasCell(a, wx, py); return c.cy * SIDE + c.cx; };
  assert.equal(a.visited[at(px - 40)], 1, 'cell centre 260 away: marked (< 300)');
  assert.equal(a.visited[at(px - 300)], 1, 'cell centre exactly 300 away: marked (inclusive boundary)');
  assert.equal(a.visited[at(px - 340)], 0, 'cell centre 340 away: NOT marked (> 300)');
  const n0 = atlasVisitedCount(a);
  const again = atlasMarkVisited(a, px, py, VR);
  assert.equal(again, 0, 're-visit marks nothing new (idempotent)');
  assert.equal(atlasVisitedCount(a), n0, 'count unchanged on re-visit');
  assert.equal(a.visited.length, SIDE * SIDE, 'the array never grows');
});

s.check('zero rng: no atlas call touches Math.random', () => {
  const real = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return 0.5; };
  try {
    const a = createAtlas(RIM, CELL);
    atlasRegisterLandmark(a, { kind: 'shrine', x: 10.4, y: -20.6 });
    atlasUpdate(a, 0, 0, VR, DR);
    atlasUpdate(a, 100, 100, VR, DR);
    assert.equal(draws, 0, 'ZERO rng draws (R2 module half)');
  } finally { Math.random = real; }
});

// ------------------------------------------------------------ pure discovery
s.check('R4: discovery flips EXACTLY at DISCOVER_RADIUS, one-way, integer px', () => {
  const a = createAtlas(RIM, CELL);
  const lm = atlasRegisterLandmark(a, { kind: 'shrine', x: 100.4, y: 0 });
  assert.equal(lm.x, 100, 'registration rounds to integer px');
  assert.equal(lm.discovered, false, 'registers undiscovered');
  assert.deepEqual(atlasDiscover(a, 100 + DR + 1, 0, DR), [], 'outside by 1px: NOT discovered');
  assert.equal(lm.discovered, false);
  const far = atlasUpdate(a, 100 + DR + 0.5, 0, 0, DR);   // VR 0 isolates discovery
  assert.equal(far.discovered.length, 0, 'outside by 0.5: NOT discovered');
  const at = atlasUpdate(a, 100 + DR, 0, 0, DR);          // boundary INCLUSIVE (radar rule)
  assert.equal(at.discovered.length, 1, 'exactly at the radius: discovered');
  assert.equal(lm.discovered, true);
  assert.deepEqual(atlasDiscover(a, 100, 0, DR), [], 'one-way: never re-fires');
  assert.equal(atlasDiscoveredCount(a), 1);
});

// ------------------------------------------------------------ live (harness)
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();

const freshRun = (safe = false) => {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.startRun();
  if (safe) {
    // Shrine placement is rolled per run (choiceSeed), so "no landmark within
    // DISCOVER_RADIUS of the player" is LUCK unless the player is parked where
    // that is guaranteed — the lattice point farthest from every shrine. Must
    // happen BEFORE the first pump: atlasUpdate runs every frame. (The suite
    // caught a seed where a shrine sat 120px from the origin.)
    let bx = 0, by = 0, bd = -1;
    const bnd = C.GROUND.RIM - 40;
    for (let x = -bnd; x <= bnd; x += 40) {
      for (let y = -bnd; y <= bnd; y += 40) {
        let d = Infinity;
        for (const sh of st.shrines) d = Math.min(d, Math.hypot(x - sh.x, y - sh.y));
        if (d > bd) { bd = d; bx = x; by = y; }
      }
    }
    st.player.x = bx; st.player.y = by;
  }
  h.pump(2);
  st.spawnTimer = 999;
  st.wave.midAt = st.time + 1e9;
  st.wave.endsAt = st.time + 1e9;
  st.wave.midBossDone = true;
  return st.player;
};

s.check('R5: startRun registers EXACTLY S1s seeded shrines — one path, no re-roll', () => {
  freshRun(true);
  assert.ok(st.atlas, 'the atlas exists at run start');
  assert.equal(st.atlas.side, atlasGridSide(C.GROUND.RIM, CELL), 'units-derived grid over the real arena');
  assert.equal(st.mapOpen, false, 'C6: every run boots map-CLOSED');
  assert.equal(st.atlas.landmarks.length, st.shrines.length, 'one landmark per S1 shrine');
  for (let i = 0; i < st.shrines.length; i++) {
    assert.equal(st.atlas.landmarks[i].kind, 'shrine');
    assert.equal(st.atlas.landmarks[i].x, st.shrines[i].x, 'READS the seeded x (no re-roll)');
    assert.equal(st.atlas.landmarks[i].y, st.shrines[i].y, 'READS the seeded y');
    assert.equal(st.atlas.landmarks[i].discovered, false, 'starts undiscovered');
  }
});

s.check('R4 live: an undiscovered landmark is drawn NOWHERE; discovery paints it', () => {
  const p = freshRun(true);                             // parked far from every shrine
  T.map.toggle();                                   // open via the ONE toggle
  assert.equal(st.mapOpen, true);
  h.pump(1);
  const seam0 = T.renderer.atlasMap;
  assert.ok(seam0, 'the map paints while open');
  assert.equal(seam0.landmarks.length, 0, 'undiscovered landmark: drawn NOWHERE (map)');
  // ARENA SCALE-UP RETARGET: the box geometry is derived (the cell shrinks so
  // the whole arena fits the view at any unit count) — was the 30-cell
  // literals 120/30/240.
  {
    const cellPx = Math.max(2, Math.floor(240 / st.atlas.side));
    const sizePx = cellPx * st.atlas.side;
    assert.equal(seam0.cell, cellPx, 'map cell derived from the grid side');
    assert.equal(seam0.size, sizePx, 'the whole arena inside a <=240px box');
    assert.ok(seam0.size <= 240 && seam0.x >= 0 && seam0.y >= 0 &&
      seam0.x + seam0.size <= 480 && seam0.y + seam0.size <= 300,
      'the map box fits the 480x300 view');
    assert.equal(seam0.x, Math.round((480 - sizePx) / 2), 'centred integer geometry x');
    assert.equal(seam0.y, Math.round((300 - sizePx) / 2), 'centred integer geometry y');
  }
  // Walk onto the first shrine: discovery flips through the real update.
  // FIXTURE, not a goalpost move: shrine placement is a per-run roll
  // (choiceSeed), so two of the three world-seeded altars can land inside
  // DISCOVER_RADIUS of each other (measured 2/40 fresh processes: neighbour
  // pairs at 96px and 82px, and 70px). Walking onto shrine[0] then
  // legitimately discovers BOTH and paints 2 landmarks — correct behaviour,
  // under-isolated fixture. Isolate the target: park every OTHER landmark (and
  // its shrine) at the arena corner farthest from shrine[0], which is >= 560px
  // away, so exactly ONE discovery is possible here. No assertion changed.
  {
    const p0x = st.shrines[0].x, p0y = st.shrines[0].y;
    const fx = p0x < 0 ? RIM - 40 : -(RIM - 40);
    const fy = p0y < 0 ? RIM - 40 : -(RIM - 40);
    for (let i = 1; i < st.shrines.length; i++) {
      st.shrines[i].x = fx; st.shrines[i].y = fy;
      st.atlas.landmarks[i].x = Math.round(fx); st.atlas.landmarks[i].y = Math.round(fy);
    }
  }
  p.x = st.shrines[0].x; p.y = st.shrines[0].y;
  h.pump(2);
  const seam1 = T.renderer.atlasMap;
  assert.equal(st.atlas.landmarks[0].discovered, true, 'crossing DISCOVER_RADIUS flipped it');
  assert.equal(seam1.landmarks.length, 1, 'discovered landmark paints on the map');
  assert.equal(seam1.landmarks[0].kind, 'shrine');
  T.map.toggle();                                   // close: the restore proof
  h.pump(1);
  assert.equal(T.renderer.atlasMap, null, 'closed: zero map paint (atlasMap === null)');
});

s.check('R7: the sim KEEPS RUNNING while the map is open (no pause)', () => {
  freshRun();
  T.map.toggle();
  const t0 = st.time;
  h.pump(60);
  assert.ok(st.time - t0 > 50 * (1 / 60), 'state.time advanced ~1s with the map open, not a frame delta');
  T.map.toggle();
});

// R2: identical seeded runs, atlas ON vs OFF. Each arm runs in its OWN
// process (test/_atlas_det_probe.mjs): within one process, kill/achievement
// UNLOCKS persist across startRun and change later runs' draft pools —
// measured: seeded run 2 vs run 3 in-process diverge 94 kills vs 4 kills
// (process state, not the atlas). In fresh processes the summary + rolling
// spawn/position hash must be byte-identical. The probe runs UNPINNED (real
// spawns, real pilot, real drafts) for 3600 frames with a disclosed
// p.invuln = 1e9 pin (stretches the stream; both arms identical).
{
  const { execFileSync } = await import('node:child_process');
  const probe = new URL('./_atlas_det_probe.mjs', import.meta.url).pathname;
  const on = execFileSync(process.execPath, [probe, 'on'], { encoding: 'utf8' }).trim();
  const off = execFileSync(process.execPath, [probe, 'off'], { encoding: 'utf8' }).trim();
  s.check('R2: ZERO RNG DRAWS — the seeded run is IDENTICAL with the atlas on and off', () => {
    assert.equal(off, on, 'summary + spawn-stream hash diverged:\n  on:  ' + on + '\n  off: ' + off);
    console.log('    seeded 60s summary (both arms): ' + on);
  });
}

s.done();
console.log('ALL ATLAS TESTS PASSED');
