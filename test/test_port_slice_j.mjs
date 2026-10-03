// HORDES — PORT SLICE J: map-layout composition + uncapped building variety.
// (Owner directives 2026-09-23: whole-map study + no limit on structures.)
//
// WHAT THIS PINS:
//   1. GRAMMAR — the MAP_LAYOUT_STUDY.md composition rules where they are
//      code-expressible: 8-design kits per biome (order-of-magnitude past
//      one-in-a-field), anchor+satellite clusters (never singletons),
//      full coverage (no density gate), the 16px separation floor, the
//      spawn-view cluster.
//   2. PERF BUDGET (binding, slice-G method: rects/view + tiles visited) —
//      budget = 14 structures/view at 1100 rects; the test FAILS past it.
//      Measured at ship: max 12 structures/view, worst 697 rects/view on
//      the coarse grid (816 on the fine grid) — the bound is headroom, not
//      a wish. Tiles visited per view are unchanged (<= 120).
//   3. COMPOSITION FLOOR — the mean structures/view across the arena stays
//      >= 2.0 (anti-regression toward one-building-in-a-field).
//
// Run: node test/test_port_slice_j.mjs
import { suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { STAGES } from '../src/stages.js';
import {
  STAGE_BUILDINGS, designsForStage, buildingPlacements,
} from '../src/stage_buildings.js';
import { STAGE_GROUND_TILE } from '../src/stage_ground.js';
import { Renderer, groundTheme } from '../src/render.js';

const S = suite('port slice J: composition + uncapped variety');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }

// THE STATED BUDGET (grammar G7 — numbers, not vibes).
const BUDGET_STRUCTURES_PER_VIEW = 14;
const BUDGET_RECTS_PER_VIEW = 1100;
const COMPOSITION_FLOOR_MEAN = 2.0;

S.check('GRAMMAR kits: every biome ships 8 distinct designs (3 anchors + 5 satellites)', () => {
  for (const s of STAGES) {
    const kit = designsForStage(s.id);
    assert(kit.length === 8, 'stage ' + s.id + ': 8 designs (got ' + kit.length + ')');
    assert(new Set(kit.map(b => b.id)).size === 8, 'stage ' + s.id + ': kit ids distinct');
    assert(kit.filter(b => b.role !== 'satellite').length === 3, 'stage ' + s.id + ': 3 anchors');
    assert(kit.filter(b => b.role === 'satellite').length === 5, 'stage ' + s.id + ': 5 satellites');
  }
  // The floor beats "one in a field" by an order of magnitude: 8x the
  // slice-E one-design-per-biome, with the count bound by measured perf
  // (below) and the pilot-fit separation floor — never a preset.
});

S.check('GRAMMAR clusters: cells compose anchor + satellites, never singletons', () => {
  for (const s of STAGES) {
    for (const seed of [1, 4242, 99999]) {
      const pl = buildingPlacements(seed, s.id);
      const anchors = pl.filter(p => STAGE_BUILDINGS[p.id].role !== 'satellite');
      const sats = pl.filter(p => STAGE_BUILDINGS[p.id].role === 'satellite');
      // M5b landscape: buildings keep to the low ground, so plateaus take
      // some cells (was >= 12 on a flat arena).
      assert(anchors.length >= 6, 'stage ' + s.id + ' seed ' + seed +
        ': >= 6 anchors/arena (got ' + anchors.length + ')');
      assert(sats.length >= anchors.length,
        'stage ' + s.id + ' seed ' + seed + ': satellites outnumber anchors (' +
        sats.length + ' vs ' + anchors.length + ' — clusters, not sprinkles)');
    }
  }
});

S.check('GRAMMAR spawn: the initial view shows the biome composition (anchor + satellite)', () => {
  for (const s of STAGES) {
    for (const seed of [1, 7, 11, 12, 4242, 99999]) {
      const pl = buildingPlacements(seed, s.id);
      const cluster = pl.filter(p => p.spawn && p.x >= 0 && p.y >= 0 &&
        p.x + p.w <= C.VIEW_W && p.y + p.h <= C.VIEW_H);
      assert(cluster.some(p => STAGE_BUILDINGS[p.id].role !== 'satellite'),
        'stage ' + s.id + ' seed ' + seed + ': spawn-view anchor');
      assert(cluster.some(p => STAGE_BUILDINGS[p.id].role === 'satellite'),
        'stage ' + s.id + ' seed ' + seed + ': spawn-view satellite beside it');
    }
  }
});

S.check('PERF budget: rects/view and structures/view stay inside the stated budget', () => {
  const mk = () => {
    const rec = { rects: [] };
    const ctx = {
      canvas: null, fillStyle: '#000', globalAlpha: 1, font: '10px monospace',
      textAlign: 'left', textBaseline: 'top', imageSmoothingEnabled: true,
      setTransform() {}, translate() {}, save() {}, restore() {}, clearRect() {},
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {},
      fillRect(x, y, w, h) { rec.rects.push({ x, y, w, h }); },
      fillText() {},
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 0, height: 0 }) };
    ctx.canvas = canvas;
    return { R: new Renderer(canvas), rec, ctx };
  };
  let worst = 0, worstAt = '', maxS = 0, maxSAt = '', totS = 0, n = 0;
  for (const s of STAGES) {
    for (const seed of [1, 4242, 99999]) {
      for (let cx = -900; cx <= 900; cx += 240) {
        for (let cy = -900; cy <= 900; cy += 200) {
          const { R, ctx, rec } = mk();
          R.drawLandmarks(ctx, seed, { x: cx, y: cy }, groundTheme(1), s.id);
          const ns = R.landmarks.filter(l => STAGE_BUILDINGS[l.kind]).length;
          totS += ns; n++;
          if (ns > maxS) { maxS = ns; maxSAt = s.id + ' seed ' + seed + ' cam ' + cx + ',' + cy; }
          if (rec.rects.length > worst) {
            worst = rec.rects.length;
            worstAt = s.id + ' seed ' + seed + ' cam ' + cx + ',' + cy + ' structs ' + ns;
          }
        }
      }
    }
  }
  assert(maxS <= BUDGET_STRUCTURES_PER_VIEW,
    'structures/view inside budget: max ' + maxS + ' at ' + maxSAt +
    ' (budget ' + BUDGET_STRUCTURES_PER_VIEW + ')');
  assert(worst <= BUDGET_RECTS_PER_VIEW,
    'rects/view inside budget: worst ' + worst + ' at ' + worstAt +
    ' (budget ' + BUDGET_RECTS_PER_VIEW + ')');
  assert(totS / n >= COMPOSITION_FLOOR_MEAN,
    'composition actually shows up: mean ' + (totS / n).toFixed(2) +
    ' structures/view (floor ' + COMPOSITION_FLOOR_MEAN + ')');
});

S.check('PERF shape: tiles visited per view are bounded (O(view), unchanged)', () => {
  // Buildings are not tiles: the overlay cull window is untouched by this
  // slice — same formula as test_stage_ground.mjs PERF SHAPE.
  const T = STAGE_GROUND_TILE;
  const t0 = Math.floor(0 / T), t1 = Math.floor((0 + C.VIEW_W) / T);
  const s0 = Math.floor(0 / T), s1 = Math.floor((0 + C.VIEW_H) / T);
  const visited = (t1 - t0 + 1) * (s1 - s0 + 1);
  assert(visited <= 120, 'overlay cull visits <= 120 tiles per view (got ' + visited + ' — O(view))');
});

S.done();
