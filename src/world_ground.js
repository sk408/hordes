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
// R6 STAGE VALUE KEYS (2026-11, Steve's decision 5: muted dark fantasy, light
// snow stages, a warm Bone Desert). Each stage owns a value key (how light or
// dark the floor is overall) and a hue, so no two stages look alike even as a
// thumbnail. From dark to light: Void Reach, Cinder Maw, Blood Rust, Verdant
// Hollow (mid green), Ashen Waste (grey ash), Bone Desert (warm sand),
// Snowfield (pale blue snow), Whiteout (white). On the five light floors
// (Verdant Hollow up) the actors read by their dark outline; on the three dark
// floors by their body colour (test/test_stage_keys.mjs holds both rules).
export const STAGE_GROUND_PALETTES = {
  VERDANT_HOLLOW: { base: '#5b7e4e', grid: '#608353', tuft: '#3d6331', tuft2: '#749c5a', stone: '#5d6659',
    stoneTop: '#9aa395', crack: '#2f4328', slab: '#557345', patch: '#55774c', patch2: '#6a8251', accent: '#9ac360' },
  ASHEN_WASTE: { base: '#7a7a7c', grid: '#828284', tuft: '#5e5c60', tuft2: '#69676c', stone: '#5c5c62',
    stoneTop: '#a4a4aa', crack: '#3a3a3e', slab: '#6c6c70', patch: '#727274', patch2: '#807e7a', accent: '#8e4a2a' },
  SNOWFIELD: { base: '#98bada', grid: '#9ebfde', tuft: '#7494b8', tuft2: '#8eaacb', stone: '#86a4c4',
    stoneTop: '#eaf3fb', crack: '#52729a', slab: '#90b2d4', patch: '#92b4d4', patch2: '#a2c2df', accent: '#ffffff' },
  BLOOD_RUST: { base: '#4e2115', grid: '#55261a', tuft: '#5e3324', tuft2: '#7a432c', stone: '#503028',
    stoneTop: '#80503c', crack: '#200d09', slab: '#3c1f17', patch: '#3c1e15', patch2: '#4a2216', accent: '#b0582c' },
  BONE_DESERT: { base: '#b49a70', grid: '#baa076', tuft: '#857248', tuft2: '#9c885c', stone: '#94805e',
    stoneTop: '#e2d4b0', crack: '#6a5434', slab: '#a68e66', patch: '#a98f66', patch2: '#bea67c', accent: '#f2ead2' },
  VOID_REACH: { base: '#1a1532', grid: '#201a3c', tuft: '#2c2454', tuft2: '#3a2f6c', stone: '#262046',
    stoneTop: '#40387a', crack: '#08060f', slab: '#141029', patch: '#140f28', patch2: '#1a1438', accent: '#a466ec' },
  CINDER_MAW: { base: '#1c1a1a', grid: '#22201f', tuft: '#2e2826', tuft2: '#3c3430', stone: '#2c2725',
    stoneTop: '#4e403a', crack: '#0a0706', slab: '#181413', patch: '#171312', patch2: '#201b16', accent: '#b04818' },
  WHITEOUT: { base: '#dde3ea', grid: '#e2e7ed', tuft: '#a0adbe', tuft2: '#b8c2d0', stone: '#b0bccb',
    stoneTop: '#fbfcfe', crack: '#8392a6', slab: '#cdd5df', patch: '#d0d8e1', patch2: '#ebeff3', accent: '#ffffff' },
};
// R6 GROUND FEATURES: the larger shapes drawn into the cached underlay, one
// kind per stage, flat (no effect on movement, terrain relief stays off):
//   patches  noise-shaped light and dark areas (meadow, ash banks)
//   pools    dark pools with a lighter rim (rust pools)
//   drifts   long mounds lying along `angle` (stretched noise), lit, each
//            with a shadow falling to the bottom right (snow drifts, dunes)
//   cracks   thin lines with a dark lip and a dim glowing core (embers, rifts)
// light/dark are the two feature tones; glow and hot the line core and its
// rare brightest spots. scale is the feature size in world px, cover how much
// of the floor carries features (0..1); drifts: stretch (the across/along
// ratio of a mound), cut (the noise level a mound starts at) and shadow (how
// far, in world px, its shadow falls).
export const STAGE_GROUND_FEATURES = {
  VERDANT_HOLLOW: { kind: 'patches', light: '#719659', dark: '#4d6e47', scale: 150, cover: 0.75 },
  ASHEN_WASTE: { kind: 'patches', light: '#a0a0a2', dark: '#646467', scale: 120, cover: 0.8 },
  SNOWFIELD: { kind: 'drifts', light: '#c5daed', dark: '#749dc3', scale: 120, stretch: 0.3, cut: 0.6, shadow: 5, angle: -0.3 },
  BLOOD_RUST: { kind: 'pools', light: '#542c1e', dark: '#30130d', scale: 110, cover: 0.6 },
  BONE_DESERT: { kind: 'drifts', light: '#c4ab80', dark: '#9e8560', scale: 90, stretch: 0.22, cut: 0.58, shadow: 4, angle: 0.45 },
  VOID_REACH: { kind: 'cracks', light: '#62309f', dark: '#05030b', glow: '#62309f', hot: '#9a58e0', scale: 72, cover: 0.62 },
  CINDER_MAW: { kind: 'cracks', light: '#8a3212', dark: '#060403', glow: '#8a3212', hot: '#a8461a', scale: 64, cover: 0.66 },
  WHITEOUT: { kind: 'drifts', light: '#f3f6f9', dark: '#bfcad8', scale: 160, stretch: 0.35, cut: 0.62, shadow: 6, angle: 0.15 },
};
// A LIGHT floor (relative luminance of the base at or above LIGHT_FLOOR): the
// actors read by their dark outline there, and the hero wears a dark keyline
// outside its warm-white ring (render.js). Verdant Hollow, Ashen Waste, Bone
// Desert, Snowfield and Whiteout.
export const LIGHT_FLOOR = 0.15;
export function relLum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
export function groundIsLight(stage) {
  const P = STAGE_GROUND_PALETTES[stage] || STAGE_GROUND_PALETTES.VERDANT_HOLLOW;
  return relLum(P.base) >= LIGHT_FLOOR;
}
const PAL_KEYS = ['base', 'grid', 'tuft', 'tuft2', 'stone', 'stoneTop', 'crack', 'slab'];
// How far each stage colour leans with the wave theme. R6: the lean is the
// wave theme's OFFSET from the mean of all wave themes (12% of it), not a pull
// toward the theme itself: the themes are all dark, so a pull would grey the
// snow. A new wave still reads as a change of light; a light stage stays light.
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
let themeMean = null;   // per palette key: the mean [r, g, b] of the wave themes
function meanOf(k) {
  if (!themeMean) {
    themeMean = {};
    const T = C.GROUND.THEMES;
    for (const key of PAL_KEYS) {
      const m = [0, 0, 0];
      for (const t of T) { const c = hexRgb(t[key]); m[0] += c[0] / T.length; m[1] += c[1] / T.length; m[2] += c[2] / T.length; }
      themeMean[key] = m;
    }
  }
  return themeMean[k];
}
// Lean stage colour `a` by the wave theme's offset from the mean theme.
function lean(a, b, k, t) {
  if (!b || b[0] !== '#') return a;
  const x = hexRgb(a), y = hexRgb(b), m = meanOf(k);
  return rgbHex(x[0] + (y[0] - m[0]) * t, x[1] + (y[1] - m[1]) * t, x[2] + (y[2] - m[2]) * t);
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
    for (const k of PAL_KEYS) p[k] = lean(S[k], t[k], k, WAVE_MIX);
    // Underlay tones lean with the base so the patches keep their relation.
    p.patch = lean(S.patch, t.base, 'base', WAVE_MIX);
    p.patch2 = lean(S.patch2, t.base, 'base', WAVE_MIX);
    p.accent = S.accent;
    // The feature tones lean with the base too; a glowing core does not.
    const F = STAGE_GROUND_FEATURES[id];
    p.feat = { ...F, light: lean(F.light, t.base, 'base', WAVE_MIX), dark: lean(F.dark, t.base, 'base', WAVE_MIX) };
    if (F.kind === 'cracks') p.feat.light = F.light;
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
// R6 LIGHT: `emit` (optional, cracks only) collects the glowing core of the
// cracks at a quarter of the size, { w, h, n: Uint8Array } (counts per 4x4
// block); the ground picture itself is the same with or without it.
function paintUnderlay(g, w, h, x0, y0, pal, seed, emit = null) {
  let img;
  try { img = g.getImageData(0, 0, w, h); } catch { return; }
  if (!img || !img.data) return;
  const d = img.data;
  const B = hexRgb(pal.base), P1 = hexRgb(pal.patch), P2 = hexRgb(pal.patch2), CR = hexRgb(pal.crack);
  const s1 = (seed * 7 + 13) | 0, s2 = (seed * 11 + 5) | 0;
  const feat = pal.feat || null;
  const FL = feat ? hexRgb(feat.light) : null, FD = feat ? hexRgb(feat.dark) : null;
  const FH = feat && feat.hot ? hexRgb(feat.hot) : null;
  const s3 = (seed * 13 + 29) | 0, s4 = (seed * 17 + 3) | 0;
  // R6 features are sampled on a coarse grid (every FG world px, read back
  // bilinear), so a chunk costs about what it did before the features: the
  // shapes are tens of px wide, and the crack test below reads its slope from
  // the same smooth field.
  const fk = feat ? feat.kind : null;
  // Grid step: 6 px for the cracks (their distance field is smooth), 8 px for
  // the broad shapes; the margin (in steps) covers a drift's shadow, read up
  // to 6 px back.
  const FG = fk === 'cracks' ? 6 : 8, FM = 2;
  const gx0 = x0 - FM * FG, gy0 = y0 - FM * FG;
  const gw = Math.ceil(w / FG) + FM * 2 + 2, gh = Math.ceil(h / FG) + FM * 2 + 2;
  let shape = null, gather = null;
  if (fk) {
    shape = new Float32Array(gw * gh);
    if (fk !== 'drifts') gather = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const x = gx0 + i * FG, y = gy0 + j * FG;
        shape[j * gw + i] = fk === 'drifts' ? driftNoise(feat, x, y, s3)
          : vnoise(x / feat.scale, y / feat.scale, s3) * 0.8 + vnoise(x / (feat.scale * 0.3), y / (feat.scale * 0.3), s3 + 7) * 0.2;
        if (gather) gather[j * gw + i] = vnoise(x / 220, y / 220, s4);
      }
    }
    if (fk === 'cracks') {
      // A crack is where the field crosses its middle. Each node keeps its
      // signed distance in px from that line (the offset over the slope), so
      // every crack is the same width and a flat spot never swells into a
      // round blob. Read back bilinear, the distance stays smooth.
      const sd = new Float32Array(gw * gh);
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          const k = j * gw + i;
          const il = Math.max(0, i - 1), ir = Math.min(gw - 1, i + 1), ju = Math.max(0, j - 1), jd = Math.min(gh - 1, j + 1);
          const gxv = (shape[j * gw + ir] - shape[j * gw + il]) / ((ir - il) * FG);
          const gyv = (shape[jd * gw + i] - shape[ju * gw + i]) / ((jd - ju) * FG);
          sd[k] = (shape[k] - 0.5) / Math.max(Math.hypot(gxv, gyv), 1e-5);
        }
      }
      shape = sd;
    }
  }
  const sample = (F, x, y) => {
    const fx = (x - gx0) / FG, fy = (y - gy0) / FG;
    const i = Math.max(0, Math.min(gw - 2, Math.floor(fx))), j = Math.max(0, Math.min(gh - 2, Math.floor(fy)));
    const u = fx - i, v = fy - j, k = j * gw + i;
    const a = F[k] + (F[k + 1] - F[k]) * u, b = F[k + gw] + (F[k + gw + 1] - F[k + gw]) * u;
    return a + (b - a) * v;
  };
  for (let by = 0; by < h; by += 2) {
    for (let bx = 0; bx < w; bx += 2) {
      const wx = x0 + bx, wy = y0 + by;
      const n = vnoise(wx / 88, wy / 88, s1) * 0.68 + vnoise(wx / 22, wy / 22, s1 + 1) * 0.32;
      const m = vnoise(wx / 120, wy / 120, s2) * 0.75 + vnoise(wx / 30, wy / 30, s2 + 3) * 0.25;
      // R6 features: one field for the shape, one for where they gather.
      let fq = 0, fq2 = 0, fm = 0;
      if (fk === 'drifts') {
        fq = sample(shape, wx, wy);
        fq2 = sample(shape, wx - feat.shadow * 0.6, wy - feat.shadow);
      } else if (fk === 'cracks') {
        fq = Math.abs(sample(shape, wx, wy));   // px from the crack's middle line
        fm = sample(gather, wx, wy);
      } else if (fk) {
        fq = sample(shape, wx, wy);
        fm = sample(gather, wx, wy);
      }
      for (let py = 0; py < 2; py++) {
        for (let pxx = 0; pxx < 2; pxx++) {
          const xx = bx + pxx, yy = by + py;
          const t = BAYER[((wy + py) & 3) * 4 + ((wx + pxx) & 3)] * 0.09;
          let col = B;
          if (n + t > 0.6) col = P1;
          else if (m + t < 0.34) col = P2;
          if (fk) {
            const f = featureAt(feat, fk, fq, fk === 'drifts' ? fq2 : fm, t);
            if (f === 1) col = FL; else if (f === 2) col = FD; else if (f === 3) col = FH;
            if (emit && (f === 1 || f === 3)) emit.n[(yy >> 2) * emit.w + (xx >> 2)] += f === 3 ? 2 : 1;
          }
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

// The drift field: two octaves of value noise in coordinates turned to the
// drift's angle and squeezed across it, so the mounds lie long and low.
function driftNoise(F, x, y, seed) {
  const ca = Math.cos(F.angle || 0), sa = Math.sin(F.angle || 0);
  const u = (x * ca + y * sa) / F.scale, v = (y * ca - x * sa) / (F.scale * F.stretch);
  return vnoise(u, v, seed) * 0.8 + vnoise(u * 3.3, v * 3.3, seed + 7) * 0.2;
}

// Which feature tone a pixel takes: 0 none, 1 light, 2 dark, 3 hot.
// q is the shape noise (for cracks: the distance from the crack line), m the
// gathering noise (for drifts: the shape noise
// one shadow length up and to the left), t the dither.
export function featureAt(F, kind, q, m, t) {
  if (kind === 'drifts') {
    if (q + t * 0.4 > F.cut) return 1;      // the mound, lit
    if (m + t * 0.4 > F.cut) return 2;      // its shadow, down and to the right
    return 0;
  }
  const on = m + t * 0.5 > 1 - F.cover;
  if (kind === 'patches') {
    if (!on) return 0;
    if (q + t > 0.6) return 1;
    if (q + t < 0.4) return 2;
    return 0;
  }
  if (kind === 'pools') {
    if (!on) return 0;
    if (q + t > 0.6) return 2;
    if (q + t > 0.555) return 1;
    return 0;
  }
  if (kind === 'cracks') {
    if (!on) return 0;
    // q is the distance in world px from the crack's middle line.
    if (q < 1.1) return m > 0.62 ? 3 : 1;     // the core, hottest where the cracks gather
    if (q < 2.6) return 2;                    // the dark lip
    return 0;
  }
  return 0;
}

// ---- the chunk cache ----------------------------------------------------------
export const GROUND_CHUNK = 256;
export const GROUND_CHUNK_CAP = 24;      // LRU cap: 24 x 258^2 x 4 B = 6.4 MB
const OV = 1;                             // chunk overlap, px per side
const chunks = new Map();                 // key -> canvas (insertion order = LRU)
const gstats = { built: 0, evicted: 0, blits: 0 };
let off = false;                          // test seam: force the direct path

export function groundChunksOn() { return !off && cacheEnabled(); }
// R6 LIGHT: the glowing cracks of the chunks blitted by the last
// drawGroundChunks call, in the same screen coordinates: [{ img, x, y, w, h }].
const emits = [];
export function groundEmits() { return groundChunksOn() ? emits : []; }
// The crack mask as a small canvas: the glow colour, as opaque as the block
// is full of glowing core (a hot spot counts twice).
// The light a crack throws, when it is not the crack's own hot colour: the
// Cinder Maw's embers glow amber, well away from the red-orange that means
// danger (their hot paint is only 7 degrees of hue from an enemy shot).
export const EMIT_LIGHT = { CINDER_MAW: '#c87a2a' };
function emitCanvas(em, feat, col) {
  const cv = scratchCanvas(em.w, em.h);
  if (!cv) return null;
  const c = cv.getContext('2d');
  let img;
  try { img = c.createImageData(em.w, em.h); } catch { return null; }
  const G = hexRgb(col || feat.hot || feat.glow || feat.light);
  const d = img.data;
  let any = 0;
  for (let i = 0; i < em.n.length; i++) {
    const v = em.n[i];
    if (!v) continue;
    any++;
    d[i * 4] = G[0]; d[i * 4 + 1] = G[1]; d[i * 4 + 2] = G[2];
    d[i * 4 + 3] = Math.min(255, v * 22);
  }
  if (!any) return null;
  c.putImageData(img, 0, 0);
  return cv;
}
export function groundChunkStats() { return { ...gstats, live: chunks.size }; }
export const WORLD_GROUND_TEST = {
  disable() { off = true; chunks.clear(); },
  enable() { off = false; chunks.clear(); },
  clear() { chunks.clear(); },
  paintUnderlay,   // test seam: paint one underlay into a fake 2D context
};

// integ3: the first floor of a stage whose feature kind (cracks, drifts,
// pools, patches) had not been painted yet in this session cost 2x a warm
// one (the painters' first run is slow). This paints a small square of every
// stage once, off screen, while the menus are up, so a run's first frame
// costs what a later one does. Pure drawing into a throwaway canvas: no game
// state, no random numbers, no cached chunk.
let warmed = false;
export function warmGroundPainters(size = 160) {
  if (warmed || !groundChunksOn()) return false;
  const img = scratchCanvas(size, size);
  if (!img) return false;
  warmed = true;
  const cg = img.getContext('2d');
  for (const st of Object.keys(STAGE_GROUND_PALETTES)) {
    const pal = stageGroundPalette(st, null);
    cg.fillStyle = pal.base; cg.fillRect(0, 0, size, size);
    paintUnderlay(cg, size, size, 0, 0, pal, 1);
    paintGroundDecor(cg, 1, 0, 0, -40, -40, size + 8, size + 8, pal, st, normGroundWeather(null));
  }
  return true;
}
export function groundPaintersWarm() { return warmed; }

// Blit the visible ground chunks (camera top-left at cam.x, cam.y; the view
// is viewW x viewH world px). Returns false when no canvas exists (the caller
// paints directly). `out.motifs` collects the motifs of freshly built chunks.
export function drawGroundChunks(g, seed, cam, viewW, viewH, pal, stage, weather) {
  if (!groundChunksOn()) return false;
  const CH = GROUND_CHUNK;
  const wxId = normGroundWeather(weather);
  const st = STAGE_GROUND_PALETTES[stage] ? stage : 'VERDANT_HOLLOW';
  const base = st + '|' + seed + '|' + pal.key + '|' + wxId + '|';
  emits.length = 0;
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
        const em = pal.feat && pal.feat.kind === 'cracks' ? { w: Math.ceil(W / 4), h: Math.ceil(W / 4), n: null } : null;
        if (em) em.n = new Uint8Array(em.w * em.h);
        paintUnderlay(cg, W, W, x0, y0, pal, seed | 0, em);
        if (em) img.emit = emitCanvas(em, pal.feat, EMIT_LIGHT[st]);
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
      if (img.emit) emits.push({ img: img.emit, x: Math.round(cx * CH - cam.x) - OV, y: Math.round(cy * CH - cam.y) - OV, w: img.emit.width * 4, h: img.emit.height * 4 });
      gstats.blits++;
    }
  }
  return true;
}
