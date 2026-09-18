// HORDES — ELEVATION ROLLBACK (2026-09-18, owner directive: "We need to
// rollback elevation for the time being. It needs more work before we put it
// back. The mechanic can be left in, just equalize the elevation so it's all
// equal").
//
// INVERTED, NOT DELETED. The shipped VERDANT HOLLOW relief is FLAT — no
// gradient, no cliffs, no terraces, nothing that blocks or grades a mover —
// while EVERY hook of the elevation mechanic stays present and reachable in
// src/relief.js. The authored elevation lives on as the FIXTURE below
// (verbatim from stages.js's rollback comment): handing it to the pure
// functions must still produce the whole v2 behaviour — cliffs, ramps,
// apron, the funnel, no-trap connectivity. That pair is the contract:
//
//   FLAT (shipped)   reliefLevelAt is 0 everywhere; reliefBlocked false for
//                    any move on any stage; the grade is exactly 1; no
//                    BASIN, no TERRACE in any stage's shipped data
//   MECHANIC (live)  the same functions, fed the authored values, still
//                    cliff / ramp / funnel / connect — so re-enabling is a
//                    DATA RESTORE (paste the block back), never a
//                    re-implementation
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { STAGES, stageRelief } from '../src/stages.js';
import { buyUpgrade, SHOP_UPGRADES } from '../src/meta.js';
import {
  reliefLevel, reliefLevelAt, terraceLevelAt, apronLevelAt,
  reliefBlocked, reliefStep, reliefGrade,
} from '../src/relief.js';

const S = suite('test_elevation_rollback');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }

const h = await boot();
const T = h.T, st = h.state;
const rel = stageRelief('VERDANT_HOLLOW');

// THE AUTHORED ELEVATION, verbatim (stages.js's rollback comment) — the
// data-restore fixture. Everything in the MECHANIC section runs against THIS.
const AUTHORED = {
  CELL: 480, LEVELS: 3, BASIN: 560,
  TERRACE: {
    r0: 560, r1: 700,
    A0: Math.PI / 2 - 0.75,
    A1: Math.PI / 2 + 0.75,
    rampW: 0.30,
    topLevel: 2,
    apron: 120,
    feather: 0.35,
  },
};
const TER = AUTHORED.TERRACE;
const angDistTo = (theta, g) => Math.atan2(Math.sin(theta - g), Math.cos(theta - g));
const P = (ang, r) => [Math.cos(ang) * r, Math.sin(ang) * r];
const SPAN_MID = (TER.A0 + TER.A1) / 2;

function quietField() {
  st.enemies.length = 0; st.gems.length = 0; st.itemDrops.length = 0;
  st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  st.wave.bosses = []; st.wave.boss = null; st.portal = null;
}

// ---------------------------------------------------------------------------
// FLAT (the shipped field) — the inversion of every wall assertion.
// ---------------------------------------------------------------------------
S.check('the shipped field is FLAT: level 0 everywhere, every seed (rollback scope: VERDANT)', () => {
  // SCOPE: the rollback equalizes THE STARTING ARENA (VERDANT_HOLLOW) — the
  // other seven keep their authored graded characters (LEVELS 2-4, graded,
  // never blocking). But NO stage ships a TERRACE block anywhere, so the
  // blocking rule is inert on every field — that half IS universal.
  for (const stage of STAGES) {
    assert(!stageRelief(stage.id).TERRACE, stage.id + ' ships no TERRACE (nothing can block)');
  }
  for (const seed of [1, 42, 4242, 20260918]) {
    let maxLv = 0;
    for (let y = -880; y <= 880; y += 48) {
      for (let x = -880; x <= 880; x += 48) {
        if (Math.hypot(x, y) > C.GROUND.RIM) continue;
        maxLv = Math.max(maxLv, reliefLevelAt(x, y, seed, rel));
      }
    }
    assert(maxLv === 0, 'VERDANT seed ' + seed + ': max level ' + maxLv + ' (want 0)');
  }
  // VERDANT's own character is the authored CELL with LEVELS 1 — flat but
  // still a declared relief (the data-restore seam reads the same key).
  assert(rel.CELL === 480 && rel.LEVELS === 1 && rel.BASIN === undefined,
    'the verdant rollback block: ' + JSON.stringify(rel));
});
S.check('nothing blocks a mover anywhere: long jumps, band crossings, every stage', () => {
  for (const stage of STAGES) {
    const r = stageRelief(stage.id);
    for (const [x0, y0, x1, y1] of [
      [-800, 0, 800, 0], [0, -800, 0, 800], [-800, -800, 800, 800],
      [0, 520, 0, 700],   // the old terrace band crossing, inner edge
      [0, 700, 0, 520],   // ...and back
    ]) {
      assert(!reliefBlocked(x0, y0, x1, y1, 4242, r),
        stage.id + ': a crossing move is never blocked (the cliff rule is inert)');
      const step = reliefStep(x0, y0, x1, y1, 4242, r);
      assert(step[0] === x1 && step[1] === y1,
        stage.id + ': reliefStep passes an unblocked move through untouched');
    }
  }
});
S.check('the grade is exactly 1 everywhere on the rolled-back stage (no mover is graded)', () => {
  // The other seven stages still grade (their authored characters) — the
  // rollback claim is VERDANT's alone.
  for (let y = -880; y <= 880; y += 97) {
    for (let x = -880; x <= 880; x += 89) {
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 1]]) {
        assert(reliefGrade(x, y, dx, dy, 4242, rel) === 1,
          'flat ground never grades a mover at (' + x + ',' + y + ')');
      }
    }
  }
});
S.check('connectivity is trivial: the flat flood fill reaches every sample', () => {
  // The old no-trap flood fill, inverted: with no cliff set the whole disc is
  // one region BY CONSTRUCTION — assert it (a future re-enable that forgets
  // the ramps would break this the moment a TERRACE block returns).
  const N = 24, R = 890, seed = 4242;
  const idx = (i, j) => (i + 64) * 200 + (j + 64);
  const walk = new Set();
  const lim = Math.ceil(R / N);
  for (let j = -lim; j <= lim; j++) for (let i = -lim; i <= lim; i++) {
    if (Math.hypot(i * N - R, j * N - R) <= R) walk.add(idx(i, j));
  }
  const c = Math.round(R / N);
  const seen = new Set([idx(c, c)]);
  const q = [[c, c]];
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, k = idx(ni, nj);
      if (seen.has(k) || !walk.has(k)) continue;
      if (reliefBlocked(i * N - R, j * N - R, ni * N - R, nj * N - R, seed, rel)) continue;
      seen.add(k); q.push([ni, nj]);
    }
  }
  assert(seen.size === walk.size,
    'every sample reachable (' + seen.size + '/' + walk.size + ') — trivially connected');
});
S.check('the render paints nothing: drawRelief and drawTerrace both stand down on the flat stage', () => {
  T.banners.suppressAll();
  T.startRun();
  h.pump(2);
  assert(st.stage === 'VERDANT_HOLLOW', 'the default run is on the rolled-back stage');
  h.pump(1);
  assert(T.renderer.terraceDrawn !== true, 'drawTerrace painted nothing (no TERRACE block)');
  // LEVELS <= 1: the relief tint pass early-returns ("flat is a character").
  T.renderer.reliefCells = -1;
  T.renderer.drawRelief(h.ctx, { stage: 'VERDANT_HOLLOW', groundSeed: 1 }, { x: 0, y: 0 }, null);
  assert(T.renderer.reliefCells === -1, 'drawRelief early-returned without touching a cell');
});

// ---------------------------------------------------------------------------
// THE MECHANIC STAYS (dormant, not deleted) — the same functions, fed the
// authored values from the rollback comment, still produce the whole v2
// behaviour. A future cleanup that deletes relief.js fails HERE.
// ---------------------------------------------------------------------------
S.check('MECHANIC PRESENT: every elevation export still exists and is callable', () => {
  const fns = { reliefLevel, reliefLevelAt, terraceLevelAt, apronLevelAt,
    reliefBlocked, reliefStep, reliefGrade };
  for (const [name, fn] of Object.entries(fns)) {
    assert(typeof fn === 'function', name + ' is still exported and callable');
  }
});
S.check('MECHANIC LIVE on the authored values: the cliff, the threshold, the ramps', () => {
  const seed = 4242;
  assert(C.RELIEF.CLIFF_STEP === 2, 'the threshold constant is untouched');
  // The cliff is real on the authored data: floor 0 -> top 2 across the band.
  assert(reliefBlocked(...P(SPAN_MID, TER.r0 - 4), ...P(SPAN_MID, TER.r0 + 2), seed, AUTHORED),
    'the authored inner edge still cliffs (the blocking rule works)');
  // The ramp staircase still grades 2 -> 1 -> 0.
  const seen = [];
  for (let a = TER.A0 + 0.05; a >= TER.A0 - 0.65; a -= 0.01) {
    const lv = reliefLevelAt(...P(a, 630), seed, AUTHORED);
    if (!seen.length || seen[seen.length - 1] !== lv) seen.push(lv);
  }
  assert(seen.join(',') === '2,1,0',
    'the authored ramp still descends in 1-level steps (got ' + seen.join(',') + ')');
  // The apron and terrace seams still answer.
  assert(terraceLevelAt(...P(SPAN_MID, 630), seed, AUTHORED) === 2, 'the band top is authored level 2');
  assert(apronLevelAt(...P(SPAN_MID, 520), seed, AUTHORED) === 0, 'the apron still pins the floor');
});
S.check('MECHANIC LIVE: the funnel and the rampward slide still route around the face', () => {
  const seed = 4242;
  // A radial press at the face does not stall; it slides toward a ramp.
  const [x0, y0] = P(SPAN_MID, TER.r0 - 2), [nx, ny] = P(SPAN_MID, TER.r0 + 2);
  const [sx, sy] = reliefStep(x0, y0, nx, ny, seed, AUTHORED);
  assert(!(sx === x0 && sy === y0), 'the authored slide never stalls');
  assert(!reliefBlocked(x0, y0, sx, sy, seed, AUTHORED), 'the slide step is legal');
  // Sustained pressing still crosses the band via a ramp (the v2 walk, verbatim
  // — it does NOT stop at r1; it records the crossing and keeps pressing, so
  // the max level reflects the whole circuit, climb included).
  let x, y; [x, y] = P(SPAN_MID, 520);
  let crossed = null, maxLv = 0;
  for (let i = 0; i < 12000; i++) {
    const r = Math.hypot(x, y);
    const [ux, uy] = reliefStep(x, y, ...P(Math.atan2(y, x), r + 3), seed, AUTHORED);
    if (ux === x && uy === y) break;
    x = ux; y = uy;
    maxLv = Math.max(maxLv, reliefLevelAt(x, y, seed, AUTHORED));
    if (!crossed && r > TER.r1) crossed = { ang: Math.atan2(y, x) };
  }
  assert(crossed, 'an inner radial presser circuits to a ramp and crosses the band');
  assert(maxLv === 2, 'the crossing touches the path top (max level ' + maxLv + ') — it CLIMBED');
  // And from outside pressing in: reaches the hollow floor.
  let ox = Math.cos(SPAN_MID) * 820, oy = Math.sin(SPAN_MID) * 820, hitHollow = false;
  for (let i = 0; i < 12000 && !hitHollow; i++) {
    const r = Math.hypot(ox, oy);
    const [ux, uy] = reliefStep(ox, oy, ...P(Math.atan2(oy, ox), r - 3), seed, AUTHORED);
    if (ux === ox && uy === oy) break;
    ox = ux; oy = uy;
    if (Math.hypot(ox, oy) < 520) hitHollow = true;
  }
  assert(hitHollow, 'an outside mover pressing in circuits to a ramp and enters the hollow');
});
S.check('MECHANIC LIVE: no-trap connectivity still holds on the authored field', () => {
  // The v2 flood fill, kept exactly — against the FIXTURE relief, so the
  // guarantee is proven for the day the data returns.
  const N = 24, R = 890, seed = 4242;
  const idx = (i, j) => (i + 64) * 200 + (j + 64);
  const walk = new Set();
  const lim = Math.ceil(R / N);
  for (let j = -lim; j <= lim; j++) for (let i = -lim; i <= lim; i++) {
    if (Math.hypot(i * N - R, j * N - R) <= R) walk.add(idx(i, j));
  }
  const c = Math.round(R / N);
  const seen = new Set([idx(c, c)]);
  const q = [[c, c]];
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, k = idx(ni, nj);
      if (seen.has(k) || !walk.has(k)) continue;
      if (reliefBlocked(i * N - R, j * N - R, ni * N - R, nj * N - R, seed, AUTHORED)) continue;
      seen.add(k); q.push([ni, nj]);
    }
  }
  assert(seen.size === walk.size,
    'authored field: every sample still reachable (' + seen.size + '/' + walk.size + ')');
});

// ---------------------------------------------------------------------------
// THE LIVE GAME ON THE FLAT FIELD — nothing reroutes, nothing stalls.
// ---------------------------------------------------------------------------
S.check('LIVE: a walker beelines across the old band — no terrain reroute anywhere', () => {
  const realRandom = Math.random;
  Math.random = ((a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(0x6a7e1);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    quietField();
    const seed = st.groundSeed || 0;
    const p = st.player;
    p.x = 0; p.y = 300; p.invuln = 1e9;
    st.enemies.push({ typeId: 'CHASER', x: 0, y: 700,
      w: 10, hp: 1000, maxHp: 1000, speed: 60, mx: 0, my: 0, age: 0, elite: false });
    let minDist = 1e9;
    const px = 0, py = 300;
    for (let i = 0; i < 60 * 10; i++) {
      h.pump(1);
      st.bannerHold = 0;
      st.spawnTimer = 999;
      p.invuln = 1e9; p.x = px; p.y = py;
      const e = st.enemies[0];
      if (!e || e.hp <= 0) break;
      minDist = Math.min(minDist, Math.hypot(e.x - px, e.y - py));
      if (minDist < 30) break;
    }
    assert(minDist < 30, 'the walker crossed the old band STRAIGHT (min dist ' +
      minDist.toFixed(0) + ') — nothing funnels it');
    // And the field under the whole crossing is flat.
    for (let y = 300; y <= 700; y += 20) {
      assert(reliefLevelAt(0, y, seed, stageRelief(st.stage)) === 0,
        'level 0 all along the old cliff line (y=' + y + ')');
    }
  } finally { Math.random = realRandom; }
});
S.check('NIGHT: a flat run still clears the wave and auto-continues, unattended', () => {
  while (!T.night.on) T.night.press();
  T.startRun();
  h.pump(2);
  assert(st.nightRun === true, 'the night stamp is live');
  const prof = T.getProfile();
  prof.gold = 100_000_000;
  for (const def of SHOP_UPGRADES) {
    for (let i = 0; i < def.maxLevel; i++) if (!buyUpgrade(prof, def.id)) break;
  }
  T.startRun();                          // re-arm: stats are computed at startRun
  h.pump(2);
  let sawIntermission = false, guard = 0;
  st.wave.endsAt = st.time;              // fast-forward to the boss
  while (guard++ < 60 * 240) {
    h.pump(1);
    st.bannerHold = 0;
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c0 = h.elements['ov-cards'].children[0]; c0 && c0.click();
    }
    if (st.mode === 'intermission') { sawIntermission = true; break; }
    if (st.mode === 'dead' || st.mode === 'death-cine') break;
  }
  assert(sawIntermission, 'the night run reached the intermission unattended (mode ' + st.mode + ')');
  while (T.night.on) T.night.press();
  st.mode = 'menu';
});
S.check('the camera still holds the pilot on screen at the old floor, ramp and top spots', () => {
  T.banners.suppressAll();
  T.startRun();
  h.pump(2);
  const p = st.player;
  const hold = (x, y, label) => {
    for (let i = 0; i < 180; i++) {
      p.x = x; p.y = y; p.invuln = 1e9;
      h.pump(1); st.bannerHold = 0;
    }
    p.x = x; p.y = y;
    const m = C.CAMERA.SAFE;
    const sx = p.x - st.cam.x, sy = p.y - st.cam.y;
    assert(sx >= m && sx <= C.VIEW_W - m && sy >= m && sy <= C.VIEW_H - m,
      label + ': the pilot is on screen with safe margin');
  };
  hold(0, 0, 'the hollow floor');
  hold(...P(TER.A0 - TER.rampW, 630), 'the old west-ramp spot');
  hold(...P(SPAN_MID, 630), 'the old path-top spot');
});

S.done();
