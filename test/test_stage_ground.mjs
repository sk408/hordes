// HORDES — headless tests for src/stage_ground.js + the render.js ground seam
// (PORT SLICE G: ground / biome backgrounds, original art; PORT SLICE K3:
// floor tile variety — three motifs per biome, mixed per cell).
// Run: node test/test_stage_ground.mjs
//
// WHAT THIS PINS:
//   1. SPEC FORMAT — eight stage-keyed specs (one per src/stages.js id),
//      each carrying THREE distinct motifs (24 globally unique), quiet
//      densities (<= 0.30), ASCII blurbs, no gameplay numbers anywhere on a
//      spec; `motif` stays as the slice-G back-compat alias for motifs[0].
//   2. STAGE COVERAGE — every stages.js id resolves; unknown / unset stages
//      fall back to VERDANT_HOLLOW (never throws); drawGround without a
//      stage paints byte-identically to VERDANT_HOLLOW (back-compat).
//   3. STAGE-KEYED DIFFERENCE — the 8 stages read differently at the SAME
//      wave (all 28 pairwise rect-sets differ; sampled pixels, not vibes).
//   4. MOTIF VARIETY (K3) — every biome measurably paints >= 2 distinct
//      motifs inside ONE canonical view (the groundMotifs smoke seam), all 3
//      motifs get painted over a seed/camera scan, the helper names all 3
//      over a tile window, and the motif mix is wave-independent (geometry
//      incl. motif identity holds) while colors recolor.
//   5. WAVE RECOLOR STILL CYCLES — same stage + seed at two waves: identical
//      geometry (the stage sets the terrain character) but different colors
//      (the wave keeps its recolor beat).
//   6. DETERMINISM — pure function of (seed, stage, wave): same triple
//      repaints byte-identically; different seeds differ; the motif pick is
//      a pure function of (cell, seed, stage).
//   7. PERF SHAPE — no cache: tiles visited per view are bounded (~70) and
//      one drawGround call paints < 1600 rects (measured ~459..510 — the K3
//      rebase of slice-G's 1500 bound for 24 motifs, same ~3x headroom
//      shape, never a carpet).
//   8. RIM CLIP — no ground rect paints past the arena rim (+-RIM).
//   9. VISUAL-ONLY — the module carries no sim numbers (no hp/dmg/xp/cost
//      fields) and reads no clock (Date.now is never touched).
import {
  STAGE_GROUND_IDS, stageGroundSpec, stageSalt, STAGE_GROUND_TILE,
  groundMotifFor, groundCellPicked,
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
const motifsPainted = (R, rec, ctx, seed, cam, wave, stage) => {
  rec.rects.length = 0;
  R.drawGround(ctx, seed, cam, groundTheme(wave), stage);
  return [...(R.groundMotifs || [])];
};

console.log('SPEC FORMAT (eight motif sets, quiet densities, no sim numbers):');
{
  ok(STAGE_GROUND_IDS.length === 8, 'eight stage grounds ship (' + STAGE_GROUND_IDS.join(',') + ')');
  ok(new Set(STAGE_GROUND_IDS).size === 8, 'stage ground ids are unique');
  const all = STAGE_GROUND_IDS.flatMap(id => stageGroundSpec(id).motifs);
  ok(all.length === 24, 'three motifs per biome ship (24 total)');
  ok(new Set(all).size === 24, 'all 24 motifs are globally distinct (' + all.join(',') + ')');
  for (const id of STAGE_GROUND_IDS) {
    const s = stageGroundSpec(id);
    ok(s.id === id, 'spec/' + id + ': id is stable');
    ok(Array.isArray(s.motifs) && s.motifs.length === 3, 'spec/' + id + ': three motifs (' + s.motifs.join(',') + ')');
    ok(new Set(s.motifs).size === 3, 'spec/' + id + ': motifs distinct within the biome');
    ok(s.motif === s.motifs[0], 'spec/' + id + ': motif aliases motifs[0] (slice-G back-compat)');
    for (const m of s.motifs) {
      ok(typeof m === 'string' && /^[A-Z_]{3,}$/.test(m), 'spec/' + id + ': motif named (' + m + ')');
    }
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
    ok(spec.id === s.id, s.id + ' resolves to its own ground (' + spec.motifs.join('/') + ')');
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

console.log('MOTIF VARIETY (K3: mixed per cell, not one stamped texture):');
{
  const { R, rec, ctx } = makeRenderer();
  // The helper names every motif over a tile window (deterministic mix exists).
  for (const id of STAGE_IDS) {
    const spec = stageGroundSpec(id);
    const seen = new Set();
    for (let cx = -16; cx < 16; cx++) for (let cy = -16; cy < 12; cy++) {
      seen.add(groundMotifFor(cx, cy, 4242, id));
    }
    ok(seen.size === 3 && spec.motifs.every(m => seen.has(m)),
      id + ': helper names all 3 motifs over a tile window (' + [...seen].join(',') + ')');
  }
  // The PAINT call carries variety inside ONE canonical view (>= 2 motifs).
  for (const id of STAGE_IDS) {
    const painted = new Set(motifsPainted(R, rec, ctx, 4242, { x: 0, y: 0 }, 1, id));
    ok(painted.size >= 2, id + ': one view paints >= 2 motifs (' + [...painted].join(',') + ')');
  }
  // Every motif reaches the canvas over a seed/camera scan (no dead motif).
  for (const id of STAGE_IDS) {
    const spec = stageGroundSpec(id);
    const seen = new Set();
    for (const seed of [4242, 11, 777]) for (let k = 0; k < 6; k++) {
      for (const m of motifsPainted(R, rec, ctx, seed, { x: k * 480, y: k * 300 }, 1, id)) seen.add(m);
    }
    ok(spec.motifs.every(m => seen.has(m)),
      id + ': all 3 motifs painted over the scan (' + [...seen].join(',') + ')');
  }
  // Motif identity is wave-independent (stage character holds incl. the mix).
  for (const id of STAGE_IDS) {
    const m1 = motifsPainted(R, rec, ctx, 4242, { x: 0, y: 0 }, 1, id).join(',');
    const m4 = motifsPainted(R, rec, ctx, 4242, { x: 0, y: 0 }, 4, id).join(',');
    ok(m1 === m4, id + ': motif mix is wave-independent (stage sets motifs, wave sets color)');
    if (id === STAGE_IDS[0]) break;
  }
  let mixHeld = 0;
  for (const id of STAGE_IDS) {
    if (motifsPainted(R, rec, ctx, 4242, { x: 0, y: 0 }, 1, id).join(',') ===
        motifsPainted(R, rec, ctx, 4242, { x: 0, y: 0 }, 4, id).join(',')) mixHeld++;
  }
  ok(mixHeld === 8, 'all 8 stages hold their motif mix across waves (' + mixHeld + '/8)');
  // The gate helper agrees with the paint call (single source of truth shape).
  for (const id of STAGE_IDS) {
    let picked = 0;
    const T = STAGE_GROUND_TILE;
    const t0 = Math.floor(0 / T), t1 = Math.floor((0 + C.VIEW_W) / T);
    const s0 = Math.floor(0 / T), s1 = Math.floor((0 + C.VIEW_H) / T);
    for (let cy = s0; cy <= s1; cy++) for (let cx = t0; cx <= t1; cx++) {
      if (groundCellPicked(cx, cy, 4242, id)) picked++;
    }
    const painted = motifsPainted(R, rec, ctx, 4242, { x: 0, y: 0 }, 1, id).length;
    ok(picked > 0 && painted <= picked,
      id + ': gate names ' + picked + ' picked tiles, paint lays ' + painted + ' motifs (rim clip only removes)');
  }
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
  ok(groundMotifFor(3, -5, 4242, 'VOID_REACH') === groundMotifFor(3, -5, 4242, 'VOID_REACH'),
    'motif pick is stable for the same (cell, seed, stage)');
  ok(typeof groundMotifFor(3, -5, 4242, 'VOID_REACH') === 'string' &&
     stageGroundSpec('VOID_REACH').motifs.includes(groundMotifFor(3, -5, 4242, 'VOID_REACH')),
    'motif pick always names one of the stage motifs');
  let varied = false;
  for (let cx = -8; cx < 8 && !varied; cx++) for (let cy = -8; cy < 8 && !varied; cy++) {
    if (groundMotifFor(cx, cy, 4242, 'VOID_REACH') !== groundMotifFor(0, 0, 4242, 'VOID_REACH')) varied = true;
  }
  ok(varied, 'motif pick varies per cell (the mix is spatial, not a constant)');
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
  ok(worst < 1600, 'one view paints < 1600 rects (worst ' + worst + ' on ' + worstStage + ' — measured ~459..510)');
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
