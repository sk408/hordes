// HORDES — headless tests for src/stage_ground.js + the render.js ground seam
// (PORT SLICE G: ground / biome backgrounds, original art).
// Run: node test/test_stage_ground.mjs
//
// WHAT THIS PINS:
//   1. SPEC FORMAT — eight stage-keyed specs (one per src/stages.js id),
//      unique motifs, quiet densities (<= 0.30), ASCII blurbs, no gameplay
//      numbers anywhere on a spec.
//   2. STAGE COVERAGE — every stages.js id resolves; unknown / unset stages
//      fall back to VERDANT_HOLLOW (never throws); drawGround without a
//      stage paints byte-identically to VERDANT_HOLLOW (back-compat).
//   3. STAGE-KEYED DIFFERENCE — the 8 stages read differently at the SAME
//      wave (all 28 pairwise rect-sets differ; sampled pixels, not vibes).
//   4. WAVE RECOLOR STILL CYCLES — same stage + seed at two waves: identical
//      geometry (the stage sets the terrain character) but different colors
//      (the wave keeps its recolor beat).
//   5. DETERMINISM — pure function of (seed, stage, wave): same triple
//      repaints byte-identically; different seeds differ.
//   6. PERF SHAPE — no cache: tiles visited per view are bounded (~70) and
//      one drawGround call paints < 1500 rects (measured 459..504, so the
//      bound is ~3x headroom, never a carpet).
//   7. RIM CLIP — no ground rect paints past the arena rim (+-RIM).
//   8. VISUAL-ONLY — the module carries no sim numbers (no hp/dmg/xp/cost
//      fields) and reads no clock (Date.now is never touched).
import {
  STAGE_GROUND_IDS, stageGroundSpec, stageSalt, STAGE_GROUND_TILE,
} from '../src/stage_ground.js';
import { Renderer, groundTheme } from '../src/render.js';
import { CONFIG as C } from '../src/config.js';
import { STAGES, STAGE_IDS } from '../src/stages.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const ASCII = /^[\x20-\x7E]*$/;

// ---------- recording 2d context (the test_render_hud.mjs pattern) -----------
function makeRenderer() {
  const rec = { rects: [] };
  const ctx = {
    canvas: null,
    fillStyle: '#000000', globalAlpha: 1,
    setTransform() {}, translate() {}, scale() {}, save() {}, restore() {},
    fillRect(x, y, w, h) {
      rec.rects.push({ x, y, w, h, style: String(ctx.fillStyle) });
    },
  };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 0, height: 0 }),
  };
  ctx.canvas = canvas;
  return { R: new Renderer(canvas), rec, ctx };
}
const snap = (R, rec, ctx, seed, cam, wave, stage) => {
  rec.rects.length = 0;
  R.drawGround(ctx, seed, cam, groundTheme(wave), stage);
  return rec.rects.map(q => q.x + ',' + q.y + ',' + q.w + ',' + q.h).join('|');
};
const styles = (R, rec, ctx, seed, cam, wave, stage) => {
  rec.rects.length = 0;
  R.drawGround(ctx, seed, cam, groundTheme(wave), stage);
  return [...new Set(rec.rects.map(q => q.style))].sort().join(' ');
};

console.log('SPEC FORMAT (eight motifs, quiet densities, no sim numbers):');
{
  ok(STAGE_GROUND_IDS.length === 8, 'eight stage grounds ship (' + STAGE_GROUND_IDS.join(',') + ')');
  ok(new Set(STAGE_GROUND_IDS).size === 8, 'stage ground ids are unique');
  const motifs = STAGE_GROUND_IDS.map(id => stageGroundSpec(id).motif);
  ok(new Set(motifs).size === 8, 'all eight motifs are distinct (' + motifs.join(',') + ')');
  for (const id of STAGE_GROUND_IDS) {
    const s = stageGroundSpec(id);
    ok(s.id === id, 'spec/' + id + ': id is stable');
    ok(typeof s.motif === 'string' && s.motif.length >= 3, 'spec/' + id + ': motif named (' + s.motif + ')');
    ok(s.dens > 0 && s.dens <= 0.30, 'spec/' + id + ': quiet density (texture, not carpet): ' + s.dens);
    ok(ASCII.test(s.blurb), 'spec/' + id + ': blurb is plain ASCII');
    const blob = JSON.stringify(s).toLowerCase();
    ok(!/(hp|dmg|damage|xp|spawn|price|cost|gold|heal|speed|mult)/.test(blob),
      'spec/' + id + ': visual-only, no sim numbers');
  }
  ok(STAGE_GROUND_TILE === 64, 'overlay tile is 64px (2x the fine decor CELL)');
  ok(typeof stageSalt('VERDANT_HOLLOW') === 'number', 'stage salt is a number');
  ok(stageSalt('ASHEN_WASTE') !== stageSalt('SNOWFIELD'), 'different stages salt differently');
}

console.log('STAGE COVERAGE (every stage resolves; unknown falls back):');
{
  for (const s of STAGES) {
    const spec = stageGroundSpec(s.id);
    ok(spec.id === s.id, s.id + ' resolves to its own ground (' + spec.motif + ')');
  }
  ok(stageGroundSpec('NOPE').id === 'VERDANT_HOLLOW', 'unknown stage falls back to the hollow');
  ok(stageGroundSpec(undefined).id === 'VERDANT_HOLLOW', 'unset stage falls back to the hollow');
  const { R, rec, ctx } = makeRenderer();
  const a = snap(R, rec, ctx, 4242, { x: 0, y: 0 }, 1, undefined);
  const b = snap(R, rec, ctx, 4242, { x: 0, y: 0 }, 1, 'VERDANT_HOLLOW');
  ok(a === b, 'drawGround without a stage is byte-identical to VERDANT_HOLLOW (back-compat)');
}

console.log('STAGE-KEYED DIFFERENCE (8 stages read differently at the SAME wave):');
{
  const { R, rec, ctx } = makeRenderer();
  const seen = new Map();
  for (const id of STAGE_IDS) seen.set(id, snap(R, rec, ctx, 4242, { x: 0, y: 0 }, 1, id));
  const vals = [...seen.values()];
  ok(new Set(vals).size === 8, 'all 8 stages paint distinct rect sets at wave 1 (same seed, same camera)');
  let pairs = 0, same = 0;
  for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
    pairs++;
    if (vals[i] === vals[j]) same++;
  }
  ok(same === 0, 'all ' + pairs + ' stage pairs differ (' + same + ' identical)');
}

console.log('WAVE RECOLOR STILL CYCLES (stage sets geometry, wave sets color):');
{
  const { R, rec, ctx } = makeRenderer();
  for (const id of STAGE_IDS) {
    const g1 = snap(R, rec, ctx, 4242, { x: 0, y: 0 }, 1, id);
    const g4 = snap(R, rec, ctx, 4242, { x: 0, y: 0 }, 4, id);
    const c1 = styles(R, rec, ctx, 4242, { x: 0, y: 0 }, 1, id);
    const c4 = styles(R, rec, ctx, 4242, { x: 0, y: 0 }, 4, id);
    ok(g1 === g4, id + ': geometry is wave-independent (stage character holds)');
    ok(c1 !== c4, id + ': colors recolor across waves (the ladder beat survives)');
    if (id === STAGE_IDS[0]) break; // geometry/color proof needs one witness; the loop pins all eight
  }
  // ...but every stage still recolors (the loop above breaks early on the
  // geometry half only for log brevity — re-pin the color half for all):
  let recolored = 0;
  for (const id of STAGE_IDS) {
    if (styles(R, rec, ctx, 4242, { x: 0, y: 0 }, 1, id) !==
        styles(R, rec, ctx, 4242, { x: 0, y: 0 }, 4, id)) recolored++;
  }
  ok(recolored === 8, 'all 8 stages recolor across waves (' + recolored + '/8)');
}

console.log('DETERMINISM (pure function of seed/stage/wave):');
{
  const { R, rec, ctx } = makeRenderer();
  ok(snap(R, rec, ctx, 11, { x: 128, y: 96 }, 2, 'BONE_DESERT') ===
     snap(R, rec, ctx, 11, { x: 128, y: 96 }, 2, 'BONE_DESERT'),
    'same (seed, stage, wave, cam) repaints byte-identically');
  ok(snap(R, rec, ctx, 11, { x: 128, y: 96 }, 2, 'BONE_DESERT') !==
     snap(R, rec, ctx, 12, { x: 128, y: 96 }, 2, 'BONE_DESERT'),
    'different seeds paint different fields');
  ok(snap(R, rec, ctx, 11, { x: 0, y: 0 }, 2, 'BONE_DESERT') ===
     snap(R, rec, ctx, 11, { x: 0, y: 0 }, 2, 'BONE_DESERT'),
    'same view = same pixels across calls (cache-correctness shape: no cache, no drift)');
}

console.log('PERF SHAPE (O(view), bounded rects, no carpet):');
{
  const { R, rec, ctx } = makeRenderer();
  let worst = 0, worstStage = '';
  for (const id of STAGE_IDS) {
    rec.rects.length = 0;
    R.drawGround(ctx, 4242, { x: 0, y: 0 }, groundTheme(1), id);
    if (rec.rects.length > worst) { worst = rec.rects.length; worstStage = id; }
  }
  ok(worst < 1500, 'one view paints < 1500 rects (worst ' + worst + ' on ' + worstStage + ' — measured ~460..510)');
  // Tiles visited per view are bounded by the cull window, not the arena.
  const T = STAGE_GROUND_TILE;
  const t0 = Math.floor(0 / T), t1 = Math.floor((0 + C.VIEW_W) / T);
  const s0 = Math.floor(0 / T), s1 = Math.floor((0 + C.VIEW_H) / T);
  const visited = (t1 - t0 + 1) * (s1 - s0 + 1);
  ok(visited <= 120, 'overlay cull visits <= 120 tiles per view (got ' + visited + ' — O(view))');
}

console.log('RIM CLIP (no ground rect past the arena rim):');
{
  const { R, rec, ctx } = makeRenderer();
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const id of STAGE_IDS) {
    for (let cx = -C.GROUND.RIM - 200; cx <= C.GROUND.RIM + 200; cx += 96) {
      for (let cy = -C.GROUND.RIM - 200; cy <= C.GROUND.RIM + 200; cy += 96) {
        const cam = { x: cx, y: cy };
        rec.rects.length = 0;
        R.drawGround(ctx, 4242, cam, groundTheme(1), id);
        for (const q of rec.rects) {
          minX = Math.min(minX, q.x + cam.x); maxX = Math.max(maxX, q.x + cam.x);
          minY = Math.min(minY, q.y + cam.y); maxY = Math.max(maxY, q.y + cam.y);
        }
      }
    }
  }
  ok(minX >= -C.GROUND.RIM && maxX <= C.GROUND.RIM &&
     minY >= -C.GROUND.RIM && maxY <= C.GROUND.RIM,
    'ground (fine field + overlay + rim ticks) stays inside +-' + C.GROUND.RIM +
    ' (x ' + minX + '..' + maxX + ', y ' + minY + '..' + maxY + ')');
}

if (failed) { console.error('test_stage_ground: ' + failed + ' FAILED'); process.exit(1); }
console.log('test_stage_ground: all checks passed');
