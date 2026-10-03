// HORDES — src/world_ground.js (world art makeover: the ground).
//
// WHAT THIS FILE IS
// 1. Per-STAGE ground material palettes. Before this pass the floor colour
//    came only from the WAVE theme ladder, so every stage opened on the same
//    green grass (a snowfield under green turf). Now the stage owns the
//    material (grass and moss, ash and basalt, packed snow, iron-red earth,
//    sand, dark stone, scorched rock, soft drifts) and the wave keeps a beat:
//    each colour is pulled WAVE_MIX of the way toward the wave theme's colour
//    for the same key, so a new wave still reads as a change of light while
//    the place stays itself. Every patch tone is at or below the base's
//    luminance (shadow, not highlight), so actors keep their contrast.
// 2. The ground painter (the fine decor field, the stage motif overlay, the
//    weather reaction and the rim ticks), moved out of render.js and redrawn:
//    pieces carry a lit top-left and a shadowed bottom-right like the actors,
//    and the old 13x13 seamed "slab plate" (read as tiles or gravestones in a
//    grid) is now an irregular soft patch of the stage material.
// 3. A ground chunk cache: the floor is painted once into 256 px offscreen
//    chunks keyed by (stage, seed, palette, weather, chunk) with a material
//    underlay (two-octave value noise, ordered-dither edges, so patches have
//    natural borders and no grid shows), built lazily as the camera reaches
//    them, LRU-capped; a frame blits a handful of chunks instead of ~450
//    fillRects. Without a real canvas (the headless harness) the caller keeps
//    the direct fillRect path (no underlay), exactly as before.
//
// Pure in (cell, seed, stage, weather id, palette): no clock, no run state.
import { CONFIG as C } from './config.js';
import {
  stageGroundSpec, stageSalt, groundCellPicked, groundMotifFor,
  STAGE_GROUND_TILE, normGroundWeather, groundWxFor,
} from './stage_ground.js';
import { cacheEnabled, scratchCanvas } from './sprite_cache.js';

// ---- palettes ---------------------------------------------------------------
// Keys: base (floor), grid (unused by the cached path), tuft/tuft2 (blades,
// stalks, frost grass), stone/stoneTop (pebbles and their lit tops), crack
// (fissures, contact shadows), slab (soft patches), patch/patch2 (the
// underlay's two material tones), accent (a rare warm/cold glint: ember,
// crystal, ice).
export const STAGE_GROUND_PALETTES = {
  VERDANT_HOLLOW: { base: '#26382b', grid: '#2f4534', tuft: '#3c603f', tuft2: '#4c7649', stone: '#3c4844',
    stoneTop: '#5a6a60', crack: '#16211a', slab: '#2b3a24', patch: '#223326', patch2: '#2c3123', accent: '#7aa85a' },
  ASHEN_WASTE: { base: '#2c2c31', grid: '#36363d', tuft: '#46434c', tuft2: '#57535e', stone: '#3a3a44',
    stoneTop: '#5c5c6a', crack: '#141418', slab: '#25252b', patch: '#26262c', patch2: '#2b2a2c', accent: '#b0461e' },
  SNOWFIELD: { base: '#2d3a4d', grid: '#374559', tuft: '#6f86a0', tuft2: '#93aac4', stone: '#4a5a6e',
    stoneTop: '#b4c8de', crack: '#1c2534', slab: '#283447', patch: '#273246', patch2: '#2a3448', accent: '#9cc8ec' },
  BLOOD_RUST: { base: '#42251d', grid: '#4c2c23', tuft: '#5e3324', tuft2: '#74412a', stone: '#4c2e26',
    stoneTop: '#7a4c3a', crack: '#220f0b', slab: '#3a2119', patch: '#3a2119', patch2: '#3d2a1d', accent: '#c4622e' },
  BONE_DESERT: { base: '#40361f', grid: '#4a3f26', tuft: '#5c5030', tuft2: '#706240', stone: '#544830',
    stoneTop: '#8c7c58', crack: '#221b0e', slab: '#3a311c', patch: '#3a311b', patch2: '#3c351c', accent: '#e2d6b8' },
  VOID_REACH: { base: '#25213e', grid: '#2d2850', tuft: '#3a3268', tuft2: '#4a3f84', stone: '#322c58',
    stoneTop: '#4e4686', crack: '#120f24', slab: '#211d38', patch: '#1f1b36', patch2: '#2a2146', accent: '#8e7cf0' },
  CINDER_MAW: { base: '#2a201d', grid: '#33261f', tuft: '#3e2e28', tuft2: '#4c3830', stone: '#3a2c28',
    stoneTop: '#5a4640', crack: '#110b0a', slab: '#231a18', patch: '#221a18', patch2: '#2e221c', accent: '#d8581e' },
  WHITEOUT: { base: '#343b46', grid: '#3e4550', tuft: '#8a96a6', tuft2: '#aab4c4', stone: '#5a6474',
    stoneTop: '#c9d3e0', crack: '#22272f', slab: '#313742', patch: '#2f3540', patch2: '#333a46', accent: '#e4ecf6' },
};
const PAL_KEYS = ['base', 'grid', 'tuft', 'tuft2', 'stone', 'stoneTop', 'crack', 'slab'];
// How far each stage colour leans toward the wave theme's colour.
export const WAVE_MIX = 0.12;

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
function mix(a, b, t) {
  if (!b || b[0] !== '#') return a;
  const x = hexRgb(a), y = hexRgb(b);
  return rgbHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

const palCache = new Map();   // stage|theme name -> palette
// The stage's material palette under the wave theme `theme` (a
// CONFIG.GROUND.THEMES row). Unknown or missing stages are the hollow.
export function stageGroundPalette(stage, theme) {
  const id = STAGE_GROUND_PALETTES[stage] ? stage : 'VERDANT_HOLLOW';
  const t = theme || C.GROUND.THEMES[0];
  const key = id + '|' + (t.name || '') + '|' + (t.base || '');
  let p = palCache.get(key);
  if (!p) {
    const S = STAGE_GROUND_PALETTES[id];
    p = { name: t.name, tint: t.tint || null, stage: id, key };
    for (const k of PAL_KEYS) p[k] = mix(S[k], t[k], WAVE_MIX);
    // Underlay tones lean with the base so the patches keep their relation.
    p.patch = mix(S.patch, t.base, WAVE_MIX);
    p.patch2 = mix(S.patch2, t.base, WAVE_MIX);
    p.accent = S.accent;
    palCache.set(key, p);
  }
  return p;
}

// ---- the decor painter ------------------------------------------------------
function cellRand(cx, cy, seed, salt) {
  let h = (seed ^ salt) >>> 0;
  h = Math.imul(h ^ cx, 0x27d4eb2d);
  h = Math.imul(h ^ cy, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Paint the ground decor for world x in [wx0, wx1), y in [wy0, wy1) into `g`,
// with world (ox, oy) at canvas (0, 0). Returns the motifs painted (one per
// picked overlay tile), the smoke seam render.js publishes.
export function paintGroundDecor(g, seed, ox, oy, wx0, wy0, wx1, wy1, pal, stage, weather) {
  const CELL = C.GROUND.CELL, DENS = C.GROUND.DENSITY, RIM = C.GROUND.RIM;
  const c0 = Math.floor(wx0 / CELL), c1 = Math.floor(wx1 / CELL);
  const r0 = Math.floor(wy0 / CELL), r1 = Math.floor(wy1 / CELL);
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      if (cellRand(cx, cy, seed, 1) >= DENS) continue;
      const wx = cx * CELL + Math.floor(cellRand(cx, cy, seed, 2) * (CELL - 16));
      const wy = cy * CELL + Math.floor(cellRand(cx, cy, seed, 3) * (CELL - 16));
      if (wx < -RIM + 2 || wx > RIM - 14 || wy < -RIM + 2 || wy > RIM - 14) continue;
      const x = Math.round(wx - ox), y = Math.round(wy - oy);
      const kind = cellRand(cx, cy, seed, 4);
      if (kind < 0.28) {            // tuft: blades lit on the left, a soil fleck
        g.fillStyle = pal.crack;
        g.fillRect(x, y + 4, 8, 1);
        g.fillStyle = pal.tuft;
        g.fillRect(x + 2, y - 1, 1, 5); g.fillRect(x + 5, y + 1, 1, 3); g.fillRect(x + 7, y, 1, 4);
        g.fillStyle = pal.tuft2;
        g.fillRect(x + 1, y + 1, 1, 3); g.fillRect(x + 3, y, 1, 4);
      } else if (kind < 0.52) {     // pebble pair: lit top-left, shadow bottom-right
        g.fillStyle = pal.crack;
        g.fillRect(x + 1, y + 5, 6, 1); g.fillRect(x + 8, y + 5, 3, 1);
        g.fillStyle = pal.stone;
        g.fillRect(x, y + 1, 6, 4); g.fillRect(x + 7, y + 3, 3, 2);
        g.fillStyle = pal.stoneTop;
        g.fillRect(x + 1, y + 1, 3, 1); g.fillRect(x, y + 2, 1, 1); g.fillRect(x + 7, y + 3, 1, 1);
      } else if (kind < 0.68) {     // crack run: a stepping fissure with a lit lip
        g.fillStyle = pal.crack;
        g.fillRect(x, y, 3, 1); g.fillRect(x + 3, y + 1, 3, 1); g.fillRect(x + 5, y + 2, 3, 1);
        g.fillRect(x + 8, y + 3, 2, 1);
        g.fillStyle = pal.stoneTop;
        g.fillRect(x + 1, y + 1, 2, 1); g.fillRect(x + 4, y + 2, 1, 1);
      } else if (kind < 0.93) {     // soft patch: an irregular smear of the material
        const f = cellRand(cx, cy, seed, 5) < 0.5;
        g.fillStyle = pal.slab;
        g.fillRect(x + (f ? 2 : 0), y, 8, 2); g.fillRect(x, y + 2, 13, 3); g.fillRect(x + (f ? 0 : 4), y + 5, 9, 2);
        g.fillStyle = pal.crack;
        g.fillRect(x + (f ? 5 : 2), y + 3, 2, 1);
      } else {                      // boulder: lit crown, shaded flank, contact shadow
        g.fillStyle = pal.crack;
        g.fillRect(x, y + 6, 12, 1); g.fillRect(x + 2, y + 7, 8, 1);
        g.fillStyle = pal.stone;
        g.fillRect(x + 1, y + 1, 8, 5); g.fillRect(x, y + 2, 10, 3); g.fillRect(x + 3, y, 4, 1);
        g.fillStyle = pal.stoneTop;
        g.fillRect(x + 3, y, 3, 1); g.fillRect(x + 1, y + 1, 3, 1); g.fillRect(x, y + 2, 1, 2);
        g.fillStyle = pal.crack;
        g.fillRect(x + 8, y + 3, 1, 2);
      }
    }
  }
  // The stage motif overlay (PORT SLICE G/K3 geometry and picks; K4 weather).
  const spec = stageGroundSpec(stage);
  const salt = stageSalt(spec.id);
  const wxId = normGroundWeather(weather);
  const T = STAGE_GROUND_TILE;
  const t0 = Math.floor(wx0 / T), t1 = Math.floor(wx1 / T);
  const s0 = Math.floor(wy0 / T), s1 = Math.floor(wy1 / T);
  const painted = [];
  for (let cy = s0; cy <= s1; cy++) {
    for (let cx = t0; cx <= t1; cx++) {
      if (!groundCellPicked(cx, cy, seed, spec.id)) continue;
      const wx = cx * T + 8 + Math.floor(cellRand(cx, cy, seed ^ salt, 31) * (T - 28));
      const wy = cy * T + 8 + Math.floor(cellRand(cx, cy, seed ^ salt, 32) * (T - 28));
      if (wx < -RIM + 2 || wx > RIM - 22 || wy < -RIM + 2 || wy > RIM - 22) continue;
      const x = Math.round(wx - ox), y = Math.round(wy - oy);
      const flip = cellRand(cx, cy, seed ^ salt, 33) < 0.5;
      const motif = groundMotifFor(cx, cy, seed, spec.id);
      painted.push(motif);
      paintMotif(g, motif, x, y, flip, pal);
      const nwx = groundWxFor(cx, cy, seed, spec.id, wxId);
      if (nwx > 0) {
        const ox1 = Math.floor(cellRand(cx, cy, seed ^ salt, 36) * 12);
        const oy1 = 1 + Math.floor(cellRand(cx, cy, seed ^ salt, 37) * 7);
        const ox2 = (ox1 + 7) % 12;
        if (wxId === 'RAIN') {            // wet speckle: dark damp dots
          g.fillStyle = pal.crack;
          g.fillRect(x + ox1, y + oy1 + 3, 2, 1);
          if (nwx > 1) g.fillRect(x + ox2, y + 1, 2, 1);
        } else if (wxId === 'SNOW') {     // dusting: pale cap + crack settle
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + ox1, y, 3, 1);
          if (nwx > 1) g.fillRect(x + ox2, y + 8, 2, 1);
        } else if (wxId === 'WIND') {     // blown grit: thin shifted streak
          g.fillStyle = pal.stone;
          g.fillRect(x + ox1, y + oy1, 4, 1);
          if (nwx > 1) g.fillRect(x + ox2, y + oy1 + 2, 3, 1);
        } else if (wxId === 'CLOUDY') {   // passing shadow: sparse dapple
          g.fillStyle = pal.crack;
          g.fillRect(x + ox1, y + oy1 + 2, 3, 1);
          if (nwx > 1) g.fillRect(x + ox2, y + oy1, 2, 1);
        } else if (wxId === 'SUNNY') {    // sun glint: small lit catch
          g.fillStyle = pal.stoneTop;
          g.fillRect(x + ox1, y + oy1, 2, 1);
          if (nwx > 1) g.fillRect(x + ox2, y + oy1 + 3, 2, 1);
        } else {                          // MOONLIGHT mote: faint pale speck
          g.fillStyle = pal.tuft2;
          g.fillRect(x + ox1, y + oy1, 2, 1);
          if (nwx > 1) g.fillRect(x + ox2, y + oy1 + 4, 2, 1);
        }
      }
      const rimNear = RIM - Math.max(Math.abs(wx), Math.abs(wy));
      if (rimNear < 64) {
        g.fillStyle = pal.stoneTop;
        if (Math.abs(wx) >= Math.abs(wy)) g.fillRect(x + (wx > 0 ? 15 : -3), y + 3, 3, 1);
        else g.fillRect(x + 5, y + (wy > 0 ? 11 : -3), 1, 3);
      }
    }
  }
  return painted;
}

// The 24 stage motifs (names and picks from stage_ground.js), redrawn with a
// shadow side (bottom-right, pal.crack) and a lit side (top-left, stoneTop).
function paintMotif(g, motif, x, y, flip, pal) {
  const r = (c, a, b, w, h) => { g.fillStyle = c; g.fillRect(x + a, y + b, w, h); };
  switch (motif) {
    case 'EMBER_CRACK':   // ash fissure, lit lip, a smouldering fleck in it
      r(pal.crack, 0, 3, 9, 1); r(pal.crack, 6, 4, 7, 1); r(pal.crack, 10, 5, 5, 1);
      r(pal.stoneTop, 0, 2, 6, 1); r(pal.stoneTop, 7, 3, 3, 1);
      r(pal.tuft2, flip ? 3 : 11, 4, 2, 1);
      break;
    case 'ASH_PILE':      // soft ash mound, crest, contact shadow
      r(pal.crack, 2, 8, 13, 1);
      r(pal.slab, 1, 4, 12, 4); r(pal.slab, 3, 3, 8, 1);
      r(pal.stoneTop, 3, 3, 5, 1); r(pal.stoneTop, 1, 4, 2, 1);
      break;
    case 'CINDER_SPECK':  // scattered cinders with shadows
      r(pal.crack, 1, 8, 3, 1); r(pal.crack, 10, 4, 3, 1);
      r(pal.stone, flip ? 2 : 9, 1, 3, 2); r(pal.stone, flip ? 9 : 2, 6, 2, 2);
      r(pal.stoneTop, flip ? 2 : 9, 1, 1, 1); r(pal.tuft2, 6, 4, 1, 1);
      break;
    case 'DRIFT_STREAK':  // combed snow streaks with blue shadow under each
      r(pal.stoneTop, flip ? 3 : 0, 2, 14, 1); r(pal.crack, flip ? 4 : 1, 3, 13, 1);
      r(pal.stone, 2, 6, 15, 1); r(pal.stoneTop, flip ? 0 : 4, 9, 10, 1); r(pal.crack, flip ? 1 : 5, 10, 9, 1);
      break;
    case 'ICE_CHIP':      // ice shards: lit facets, shadow
      r(pal.crack, 3, 9, 12, 1);
      r(pal.stone, 2, 4, 5, 5); r(pal.stone, 9, 5, 4, 4);
      r(pal.stoneTop, 2, 4, 3, 1); r(pal.stoneTop, 2, 5, 1, 2); r(pal.stoneTop, 9, 5, 2, 1);
      break;
    case 'FROST_PELLET':  // pellet arc
      r(pal.crack, 1, 7, 3, 1); r(pal.crack, 7, 6, 3, 1); r(pal.crack, 13, 7, 3, 1);
      r(pal.stone, 0, 5, 3, 2); r(pal.stone, 6, 4, 3, 2); r(pal.stone, 12, 5, 3, 2);
      r(pal.stoneTop, 0, 5, 1, 1); r(pal.stoneTop, 6, 4, 1, 1); r(pal.stoneTop, 12, 5, 1, 1);
      break;
    case 'RUST_VEIN':     // branching rust vein with a lit edge
      r(pal.crack, 6, 0, 1, 10); r(pal.crack, 2, 4, 9, 1); r(pal.crack, 9, 6, 5, 1);
      r(pal.tuft2, 7, 1, 1, 7); r(pal.tuft2, flip ? 1 : 11, 3, 2, 1);
      break;
    case 'RUST_POOL':     // rust plate: lit rim, pitted middle
      r(pal.crack, 2, 8, 12, 1);
      r(pal.slab, 1, 3, 12, 5); r(pal.slab, 3, 2, 8, 1);
      r(pal.stoneTop, 3, 2, 6, 1); r(pal.stoneTop, 1, 3, 1, 2);
      r(pal.tuft, flip ? 4 : 7, 5, 3, 1);
      break;
    case 'SPLINTER':      // pale splinters with shadow
      r(pal.crack, 3, 6, 7, 1); r(pal.crack, 6, 7, 7, 1);
      r(pal.stone, 2, 4, 7, 1); r(pal.stone, 5, 5, 7, 1);
      r(pal.stoneTop, 2, 3, 5, 1);
      break;
    case 'DUNE_RIPPLE':   // wind ripples: lit crest, shadowed lee
      r(pal.stoneTop, 0, 0, 12, 1); r(pal.crack, 2, 1, 14, 1);
      r(pal.stoneTop, 2, 4, 12, 1); r(pal.crack, 4, 5, 14, 1);
      r(pal.stone, 1, 8, 12, 1);
      break;
    case 'BONE_FRAG':     // bone shards half-buried
      r(pal.crack, 2, 8, 11, 1); r(pal.crack, 12, 3, 3, 1);
      r(pal.stoneTop, 2, 5, 6, 2); r(pal.stone, 3, 7, 5, 1);
      r(pal.stoneTop, flip ? 9 : 11, 2, 4, 1); r(pal.accent, 2, 5, 1, 1);
      break;
    case 'SAND_PIT':      // shallow round pit: shadowed inner top-left, lit far rim
      r(pal.crack, 5, 3, 6, 1); r(pal.crack, 3, 4, 2, 1); r(pal.crack, 2, 5, 1, 2);
      r(pal.slab, 4, 5, 9, 2); r(pal.slab, 5, 4, 7, 1);
      r(pal.stoneTop, 5, 7, 7, 1); r(pal.stoneTop, 12, 5, 1, 2);
      break;
    case 'VOID_RUNE':     // a faint rune cut in the stone, crystal glint
      r(pal.crack, 5, 0, 2, 12); r(pal.crack, 0, 5, 12, 2);
      r(pal.tuft2, 5, 0, 1, 11); r(pal.tuft2, 0, 5, 11, 1);
      r(pal.tuft, flip ? 13 : -3, 4, 2, 2);
      break;
    case 'VOID_CRACK':    // star fissure with a crystal vein
      r(pal.crack, 1, 5, 13, 1); r(pal.crack, 7, 1, 1, 9); r(pal.crack, 4, 3, 1, 5);
      r(pal.tuft2, 2, 5, 4, 1); r(pal.tuft2, 7, 2, 1, 2);
      break;
    case 'VOID_PEBBLE':   // dark crystal pebbles
      r(pal.crack, 2, 9, 13, 1);
      r(pal.stone, 1, 5, 6, 4); r(pal.stone, 9, 4, 5, 5);
      r(pal.stoneTop, 1, 5, 3, 1); r(pal.stoneTop, 9, 4, 2, 1); r(pal.tuft2, flip ? 8 : 0, 1, 1, 2);
      break;
    case 'SCORCH_PLATE':  // scorched rock plate split by an ember seam
      r(pal.crack, 2, 9, 12, 1);
      r(pal.slab, 1, 0, 12, 9); r(pal.slab, 0, 1, 14, 7);
      r(pal.stoneTop, 1, 0, 5, 1); r(pal.stoneTop, 0, 1, 1, 3);
      if (flip) r(pal.tuft2, 2, 4, 10, 1); else r(pal.tuft2, 6, 1, 1, 7);
      break;
    case 'CINDER_VENT':   // vent: dark mouth, hot rim
      r(pal.slab, 0, 3, 14, 5);
      r(pal.crack, flip ? 4 : 7, 4, 4, 3);
      r(pal.stoneTop, 0, 2, 7, 1); r(pal.tuft2, flip ? 5 : 8, 6, 2, 1);
      break;
    case 'SLAG_LINE':     // slag bar with an ember seam
      r(pal.crack, 1, 7, 16, 1);
      r(pal.slab, 0, 3, 16, 4); r(pal.stoneTop, 0, 2, 9, 1);
      if (flip) r(pal.tuft2, 2, 4, 12, 1); else r(pal.tuft2, 7, 3, 1, 4);
      break;
    case 'SNOW_PACK':     // packed clumps: lit crest, blue shadow
      r(pal.crack, 1, 9, 17, 1);
      r(pal.stone, 0, 5, 8, 4); r(pal.stone, 9, 4, 7, 5);
      r(pal.stoneTop, 0, 4, 6, 1); r(pal.stoneTop, 9, 3, 5, 1);
      break;
    case 'FROST_FEATHER': // frost feather on the crust
      r(pal.stone, 7, 1, 1, 8);
      r(pal.stoneTop, flip ? 2 : 4, 3, 5, 1); r(pal.stoneTop, flip ? 9 : 7, 5, 5, 1); r(pal.stoneTop, flip ? 2 : 4, 7, 5, 1);
      r(pal.crack, 8, 2, 1, 8);
      break;
    case 'ICE_PEBBLE':    // ice pebbles
      r(pal.crack, 2, 9, 12, 1);
      r(pal.stone, 1, 5, 5, 4); r(pal.stone, 8, 6, 6, 3);
      r(pal.stoneTop, 1, 4, 4, 1); r(pal.stoneTop, 8, 5, 4, 1); r(pal.tuft2, flip ? 12 : 0, 2, 1, 1);
      break;
    case 'FERN_CURL':     // fern: stem and fronds, shadow
      r(pal.crack, 2, 9, 10, 1);
      r(pal.tuft, 6, 1, 1, 8);
      r(pal.tuft2, 2, 3, 4, 1); r(pal.tuft, 7, 5, 4, 1); r(pal.tuft2, flip ? 3 : 9, 1, 2, 1);
      break;
    case 'PEBBLE_NEST':   // pebble trio
      r(pal.crack, 2, 9, 12, 1);
      r(pal.stone, 1, 5, 5, 4); r(pal.stone, 8, 6, 5, 3);
      r(pal.stoneTop, 1, 5, 3, 1); r(pal.stoneTop, 8, 6, 2, 1);
      break;
    default:              // MOSS: a low cushion with blades
      r(pal.slab, 0, 4, 12, 3); r(pal.slab, 2, 3, 8, 1);
      r(pal.tuft, 1, 0, 1, 5); r(pal.tuft, 6, 1, 1, 4);
      r(pal.tuft2, 3, 0, 1, 4); r(pal.tuft2, 9, 2, 1, 3);
      r(pal.crack, flip ? 1 : 8, 7, 4, 1);
      break;
  }
}

// ---- the material underlay (cached path only) -------------------------------
function lattice(ix, iy, seed) {
  let h = (seed ^ 0x5bd1e995) >>> 0;
  h = Math.imul(h ^ ix, 0x27d4eb2d); h = Math.imul(h ^ iy, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed);
  const c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);

// Paint the underlay into a w x h image (world origin x0, y0): two material
// tones in noise-shaped patches with dithered edges, a sparse grain.
function paintUnderlay(g, w, h, x0, y0, pal, seed) {
  let img;
  try { img = g.getImageData(0, 0, w, h); } catch { return; }
  if (!img || !img.data) return;
  const d = img.data;
  const B = hexRgb(pal.base), P1 = hexRgb(pal.patch), P2 = hexRgb(pal.patch2), CR = hexRgb(pal.crack);
  const s1 = (seed * 7 + 13) | 0, s2 = (seed * 11 + 5) | 0;
  for (let by = 0; by < h; by += 2) {
    for (let bx = 0; bx < w; bx += 2) {
      const wx = x0 + bx, wy = y0 + by;
      const n = vnoise(wx / 88, wy / 88, s1) * 0.68 + vnoise(wx / 22, wy / 22, s1 + 1) * 0.32;
      const m = vnoise(wx / 120, wy / 120, s2) * 0.75 + vnoise(wx / 30, wy / 30, s2 + 3) * 0.25;
      for (let py = 0; py < 2; py++) {
        for (let pxx = 0; pxx < 2; pxx++) {
          const xx = bx + pxx, yy = by + py;
          const t = BAYER[((wy + py) & 3) * 4 + ((wx + pxx) & 3)] * 0.09;
          let col = B;
          if (n + t > 0.6) col = P1;
          else if (m + t < 0.34) col = P2;
          const i = (yy * w + xx) * 4;
          // grain: a rare darker fleck (never lighter than the base)
          const gr = lattice(wx + pxx, wy + py, seed ^ 0x2c1b);
          if (gr < 0.018) { d[i] = (col[0] + CR[0]) >> 1; d[i + 1] = (col[1] + CR[1]) >> 1; d[i + 2] = (col[2] + CR[2]) >> 1; }
          else { d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; }
          d[i + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
}

// ---- the chunk cache ----------------------------------------------------------
export const GROUND_CHUNK = 256;
export const GROUND_CHUNK_CAP = 24;      // LRU cap: 24 x 258^2 x 4 B = 6.4 MB
const OV = 1;                             // chunk overlap, px per side
const chunks = new Map();                 // key -> canvas (insertion order = LRU)
const gstats = { built: 0, evicted: 0, blits: 0 };
let off = false;                          // test seam: force the direct path

export function groundChunksOn() { return !off && cacheEnabled(); }
export function groundChunkStats() { return { ...gstats, live: chunks.size }; }
export const WORLD_GROUND_TEST = {
  disable() { off = true; chunks.clear(); },
  enable() { off = false; chunks.clear(); },
  clear() { chunks.clear(); },
};

// Blit the visible ground chunks (camera top-left at cam.x, cam.y; the view
// is viewW x viewH world px). Returns false when no canvas exists (the caller
// paints directly). `out.motifs` collects the motifs of freshly built chunks.
export function drawGroundChunks(g, seed, cam, viewW, viewH, pal, stage, weather) {
  if (!groundChunksOn()) return false;
  const CH = GROUND_CHUNK;
  const wxId = normGroundWeather(weather);
  const st = STAGE_GROUND_PALETTES[stage] ? stage : 'VERDANT_HOLLOW';
  const base = st + '|' + seed + '|' + pal.key + '|' + wxId + '|';
  const c0 = Math.floor(cam.x / CH), c1 = Math.floor((cam.x + viewW) / CH);
  const r0 = Math.floor(cam.y / CH), r1 = Math.floor((cam.y + viewH) / CH);
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const k = base + cx + ',' + cy;
      let img = chunks.get(k);
      if (img) { chunks.delete(k); chunks.set(k, img); }
      else {
        // Each chunk overlaps its neighbours by OV px on every side: at a
        // fractional zoom the edge pixels of a blit are partly covered, and
        // without the overlap the base under them shows as a seam line.
        const W = CH + OV * 2;
        img = scratchCanvas(W, W);
        if (!img) return false;
        const cg = img.getContext('2d');
        const x0 = cx * CH - OV, y0 = cy * CH - OV;
        cg.fillStyle = pal.base; cg.fillRect(0, 0, W, W);
        paintUnderlay(cg, W, W, x0, y0, pal, seed | 0);
        // Pieces reach up to ~22 px past their anchor: iterate a margin so a
        // piece that straddles a chunk edge paints its part in both chunks.
        paintGroundDecor(cg, seed, x0, y0, x0 - 40, y0 - 40, x0 + W + 8, y0 + W + 8, pal, st, wxId);
        chunks.set(k, img);
        gstats.built++;
        while (chunks.size > GROUND_CHUNK_CAP) {
          chunks.delete(chunks.keys().next().value);
          gstats.evicted++;
        }
      }
      g.drawImage(img, Math.round(cx * CH - cam.x) - OV, Math.round(cy * CH - cam.y) - OV);
      gstats.blits++;
    }
  }
  return true;
}
