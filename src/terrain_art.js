// HORDES — src/terrain_art.js
//
// M5b LANDSCAPE art: plateaus (lit top edge, shadowed south face, a drop
// shadow on the low ground), ramps (step stripes), bridges (deck and rails),
// one-way drop edges (a dashed lip with chevrons) and each stage's landmark
// structures. Everything reads the same terrain object movement reads
// (src/terrain.js), so what you see is what blocks.
//
// Cost: the terrain is painted once per run into 240 px chunk canvases (only
// chunks that hold a feature); a frame blits the visible ones. Landmarks go
// through the sprite cache. Without a real canvas (headless) nothing draws.
import { blitPainted, cacheEnabled, STYLE_STRUCT } from './sprite_cache.js';
import { TEXT } from './terrain.js';

const CH = 240;              // chunk size, world px
const FACE = 14;             // south cliff face height, px
const SHADOW_X = 8, SHADOW_Y = 12;

// Per-stage palette: top, upper top, cliff face, face streaks, lit edge,
// ramp, ramp step, bridge deck, rail.
export const TERRAIN_PALETTES = {
  VERDANT_HOLLOW: { top: '#36553a', top2: '#44683f', face: '#2b2a20', streak: '#1d1c15', lit: '#86b06c', ramp: '#6a6a48', step: '#3a3a26', deck: '#6b5434', rail: '#3a2a18', speck: '#4f7a48' },
  ASHEN_WASTE: { top: '#41414c', top2: '#4f4f5c', face: '#1c1c23', streak: '#121217', lit: '#a2a2b8', ramp: '#4d4740', step: '#34302b', deck: '#5a4a3a', rail: '#2a2018', speck: '#5a5a66' },
  SNOWFIELD: { top: '#4f6075', top2: '#627690', face: '#273240', streak: '#1b232e', lit: '#d6e6f6', ramp: '#56677c', step: '#3c4a5a', deck: '#6a5a48', rail: '#3a3026', speck: '#8ea4bc' },
  BLOOD_RUST: { top: '#5e3226', top2: '#70402e', face: '#2a1410', streak: '#1b0c09', lit: '#c4704a', ramp: '#56382c', step: '#3a241c', deck: '#5c4030', rail: '#2a1a12', speck: '#7a4430' },
  BONE_DESERT: { top: '#73633f', top2: '#8a774c', face: '#30271a', streak: '#211a10', lit: '#dccb94', ramp: '#5a4d32', step: '#3e3422', deck: '#6e5e3e', rail: '#3a301e', speck: '#7a6a48' },
  VOID_REACH: { top: '#3d3474', top2: '#4b4090', face: '#151029', streak: '#0c0919', lit: '#a898ff', ramp: '#38316a', step: '#262050', deck: '#5a4cb8', rail: '#2a2360', speck: '#5a4eaa' },
  CINDER_MAW: { top: '#3f3230', top2: '#4c3c38', face: '#170f0d', streak: '#0d0807', lit: '#ff8a4a', ramp: '#45362f', step: '#2c221d', deck: '#4a3428', rail: '#24160f', speck: '#5a3a30' },
  WHITEOUT: { top: '#5a6a7c', top2: '#6c7e92', face: '#2a3440', streak: '#1d252e', lit: '#f2f8ff', ramp: '#5e6e80', step: '#445262', deck: '#6a5c4a', rail: '#3a3028', speck: '#9aaabc' },
};
const PAL_DEFAULT = TERRAIN_PALETTES.VERDANT_HOLLOW;

function hash(x, y, s) {
  let h = (s ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

// ---- painting (world coords shifted by ox, oy) ----------------------------------
// World art makeover: plateaus read as the stage's own rock. Each stage has a
// cliff-face material (FACE_STYLE), the top carries the ground's dithered
// patches and small pebbles/tufts, every block has a 1px dark outline, a lit
// north-west lip and a shaded east edge (light from the top left, like the
// actors), and ramps/bridges get lit step edges and outlines.
const OUTLINE = '#0b0912';
const FACE_STYLE = {
  VERDANT_HOLLOW: 'earth', ASHEN_WASTE: 'columns', SNOWFIELD: 'ice', BLOOD_RUST: 'strata',
  BONE_DESERT: 'strata', VOID_REACH: 'veins', CINDER_MAW: 'embers', WHITEOUT: 'ice',
};
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixHex(a, b, t) {
  const x = hexRgb(a), y = hexRgb(b);
  const c = (i) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return '#' + c(0) + c(1) + c(2);
}

function paintFace(g, r, P, x, y, seed, style) {
  const fy = y + r.h;
  g.fillStyle = P.face; g.fillRect(x, fy, r.w, FACE);
  const face2 = mixHex(P.face, P.top, 0.22);
  if (style === 'columns') {            // basalt columns: joints with a lit left edge
    for (let i = 2; i < r.w - 1; i += 5) {
      const k = hash(r.x + i, r.y, seed);
      g.fillStyle = P.streak; g.fillRect(x + i, fy + 1, 1, FACE - 2);
      g.fillStyle = face2; g.fillRect(x + i + 1, fy + 2 + Math.floor(k * 3), 1, FACE - 6);
    }
  } else if (style === 'strata') {      // layered rock: alternating bands
    g.fillStyle = face2; g.fillRect(x, fy + 4, r.w, 3);
    g.fillStyle = P.streak; g.fillRect(x, fy + 7, r.w, 1); g.fillRect(x, fy + 3, r.w, 1);
    for (let i = 0; i < r.w; i += 9) {
      const k = hash(r.x + i, r.y, seed);
      g.fillRect(x + i + Math.floor(k * 5), fy + 8 + Math.floor(k * 2), 1 + Math.floor(k * 3), 1);
    }
  } else if (style === 'ice') {         // ice face: pale cap with drips, cold streaks
    g.fillStyle = face2;
    for (let i = 0; i < r.w; i += 6) {
      const k = hash(r.x + i, r.y, seed);
      g.fillRect(x + i + Math.floor(k * 3), fy + 3, 1, FACE - 6 - Math.floor(k * 4));
    }
    g.fillStyle = P.lit;
    for (let i = 1; i < r.w - 1; i += 4) {
      const k = hash(r.x + i, r.y + 5, seed);
      g.fillRect(x + i, fy, 2, 1);
      if (k < 0.55) g.fillRect(x + i + (k < 0.3 ? 0 : 1), fy + 1, 1, 1 + Math.floor(k * 5));
    }
  } else if (style === 'veins') {       // dark stone with crystal veins
    g.fillStyle = P.streak;
    for (let i = 0; i < r.w; i += 7) g.fillRect(x + i + Math.floor(hash(r.x + i, r.y, seed) * 4), fy + 2, 1, FACE - 5);
    g.fillStyle = P.lit;
    for (let i = 5; i < r.w - 4; i += 19) {
      const k = hash(r.x + i, r.y + 9, seed);
      if (k < 0.6) { g.fillRect(x + i, fy + 3 + Math.floor(k * 4), 1, 3); g.fillRect(x + i + 1, fy + 6 + Math.floor(k * 4), 1, 2); }
    }
  } else if (style === 'embers') {      // scorched rock split by ember cracks
    g.fillStyle = P.streak;
    for (let i = 0; i < r.w; i += 6) g.fillRect(x + i + Math.floor(hash(r.x + i, r.y, seed) * 3), fy + 2, 1, FACE - 5);
    for (let i = 4; i < r.w - 6; i += 17) {
      const k = hash(r.x + i, r.y + 3, seed);
      if (k > 0.65) continue;
      const cy = fy + 3 + Math.floor(k * 5);
      g.fillStyle = P.lit; g.fillRect(x + i, cy, 2, 1); g.fillRect(x + i + 2, cy + 1, 2, 1); g.fillRect(x + i + 4, cy + 2, 1, 1);
    }
  } else {                              // earth: streaks, roots hanging off the lip
    g.fillStyle = P.streak;
    for (let i = 0; i < r.w; i += 6) {
      const k = hash(r.x + i, r.y, seed);
      g.fillRect(x + i + Math.floor(k * 3), fy + 2 + Math.floor(k * 4), 1, FACE - 4 - Math.floor(k * 4));
    }
    g.fillStyle = P.speck;
    for (let i = 1; i < r.w - 1; i += 5) {
      const k = hash(r.x + i, r.y + 7, seed);
      if (k < 0.6) g.fillRect(x + i, fy, 1, 1 + Math.floor(k * 4));
    }
  }
  // An overhang shadow under the lip and a dark foot.
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, fy, r.w, 1);
  g.fillStyle = P.streak; g.fillRect(x, fy + FACE - 2, r.w, 2);
}

function paintBlock(g, r, P, top, ox, oy, drops, seed, style) {
  const x = r.x - ox, y = r.y - oy;
  // Silhouette outline (top and face together).
  g.fillStyle = OUTLINE; g.fillRect(x - 1, y - 1, r.w + 2, r.h + FACE + 2);
  paintFace(g, r, P, x, y, seed, style);
  // The top, with small pebbles and tufts (lit top-left, shadow bottom-right).
  g.fillStyle = top; g.fillRect(x, y, r.w, r.h);
  // Quiet: about one mark per 36 x 36 px, in tones close to the top.
  const n = Math.floor((r.w * r.h) / 1300);
  const peb = mixHex(top, P.speck, 0.55), pebLit = mixHex(top, P.lit, 0.3), dent = mixHex(top, P.face, 0.45);
  for (let i = 0; i < n; i++) {
    const a = hash(r.x + i, r.y - i, seed + 7), b = hash(r.x - i, r.y + i, seed + 9);
    const px0 = x + 4 + Math.floor(a * (r.w - 10)), py0 = y + 4 + Math.floor(b * (r.h - 9));
    if ((i & 1) === 0) {            // pebble
      g.fillStyle = dent; g.fillRect(px0 + 1, py0 + 2, 3, 1);
      g.fillStyle = peb; g.fillRect(px0, py0, 3, 2);
      g.fillStyle = pebLit; g.fillRect(px0, py0, 1, 1);
    } else {                        // tuft / crack fleck
      g.fillStyle = peb; g.fillRect(px0, py0, 1, 3); g.fillRect(px0 + 2, py0 + 1, 1, 2);
      g.fillStyle = dent; g.fillRect(px0 - 1, py0 + 3, 5, 1);
    }
  }
  // Edges: a lit north and west lip, a dark east edge, a pale south lip.
  g.fillStyle = P.lit;
  g.fillRect(x, y, r.w, 1);
  g.fillRect(x, y, 1, r.h);
  g.fillStyle = mixHex(top, P.lit, 0.45);
  g.fillRect(x + 1, y + 1, r.w - 2, 1);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(x + r.w - 2, y, 2, r.h + FACE);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x, y + r.h - 1, r.w, 1);
  // One-way drop edges: a dashed lit lip and outward chevrons.
  for (const d of drops || []) {
    const dx = d.x - ox, dy = d.y - oy;
    g.fillStyle = P.lit;
    if (d.side === 'N' || d.side === 'S') {
      const ly = d.side === 'N' ? dy : dy + d.h - 2;
      for (let i = 0; i < d.w; i += 8) g.fillRect(dx + i, ly, 4, 2);
      for (let i = 8; i < d.w - 4; i += 24) chevron(g, dx + i, d.side === 'N' ? dy - 6 : dy + d.h + 4, d.side, P);
    } else {
      const lx = d.side === 'W' ? dx : dx + d.w - 2;
      for (let i = 0; i < d.h; i += 8) g.fillRect(lx, dy + i, 2, 4);
      for (let i = 8; i < d.h - 4; i += 24) chevron(g, d.side === 'W' ? dx - 6 : dx + d.w + 4, dy + i, d.side, P);
    }
  }
}

function chevron(g, x, y, side, P) {
  g.fillStyle = P.lit;
  const pts = side === 'S' ? [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]]
    : side === 'N' ? [[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]]
      : side === 'E' ? [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]]
        : [[2, 0], [1, 1], [0, 2], [1, 3], [2, 4]];
  for (const [a, b] of pts) g.fillRect(x + a, y + b, 1, 1);
}

function paintRamp(g, r, P, ox, oy) {
  const x = r.x - ox, y = r.y - oy;
  g.fillStyle = P.ramp; g.fillRect(x, y, r.w, r.h);
  const lip = mixHex(P.ramp, P.lit, 0.35);
  // Steps run across the climb direction: a shadowed riser, a lit tread edge.
  if (r.side === 'N' || r.side === 'S') {
    for (let i = 3; i < r.h; i += 7) {
      g.fillStyle = P.step; g.fillRect(x + 2, y + i, r.w - 4, 2);
      g.fillStyle = lip; g.fillRect(x + 2, y + i + 2, r.w - 4, 1);
    }
  } else {
    for (let i = 3; i < r.w; i += 7) {
      g.fillStyle = P.step; g.fillRect(x + i, y + 2, 2, r.h - 4);
      g.fillStyle = lip; g.fillRect(x + i + 2, y + 2, 1, r.h - 4);
    }
  }
  // Side walls of the ramp, outlined.
  g.fillStyle = 'rgba(0,0,0,0.5)';
  if (r.side === 'N' || r.side === 'S') { g.fillRect(x, y, 2, r.h); g.fillRect(x + r.w - 2, y, 2, r.h); }
  else { g.fillRect(x, y, r.w, 2); g.fillRect(x, y + r.h - 2, r.w, 2); }
  g.fillStyle = OUTLINE;
  if (r.side === 'N' || r.side === 'S') { g.fillRect(x - 1, y, 1, r.h); g.fillRect(x + r.w, y, 1, r.h); }
  else { g.fillRect(x, y - 1, r.w, 1); g.fillRect(x, y + r.h, r.w, 1); }
}

function paintBridge(g, b, P, ox, oy) {
  const x = b.x - ox, y = b.y - oy;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x + SHADOW_X, y + SHADOW_Y, b.w, b.h);
  g.fillStyle = OUTLINE; g.fillRect(x - 1, y - 1, b.w + 2, b.h + 2);
  g.fillStyle = P.deck; g.fillRect(x, y, b.w, b.h);
  const plankLit = mixHex(P.deck, P.lit, 0.25);
  if (b.axis === 'EW') {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 0; i < b.w; i += 6) g.fillRect(x + i, y, 1, b.h);
    g.fillStyle = plankLit;
    for (let i = 1; i < b.w; i += 6) g.fillRect(x + i, y + 3, 1, b.h - 6);
    g.fillStyle = P.rail;
    g.fillRect(x, y, b.w, 3); g.fillRect(x, y + b.h - 3, b.w, 3);
    g.fillStyle = P.lit;
    for (let i = 0; i < b.w; i += 16) { g.fillRect(x + i, y - 2, 2, 4); g.fillRect(x + i, y + b.h - 3, 2, 4); }
    g.fillStyle = P.face; g.fillRect(x, y + b.h, b.w, 4);
  } else {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 0; i < b.h; i += 6) g.fillRect(x, y + i, b.w, 1);
    g.fillStyle = plankLit;
    for (let i = 1; i < b.h; i += 6) g.fillRect(x + 3, y + i, b.w - 6, 1);
    g.fillStyle = P.rail;
    g.fillRect(x, y, 3, b.h); g.fillRect(x + b.w - 3, y, 3, b.h);
    g.fillStyle = P.lit;
    for (let i = 0; i < b.h; i += 16) { g.fillRect(x - 1, y + i, 4, 2); g.fillRect(x + b.w - 3, y + i, 4, 2); }
  }
}

// The plateau tops share the ground's dithered material patches: one pixel
// pass per chunk recolours top pixels (exact top colours) by two noise octaves.
function lat(ix, iy, s) {
  let h = (s ^ 0x5bd1e995) >>> 0;
  h = Math.imul(h ^ ix, 0x27d4eb2d); h = Math.imul(h ^ iy, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function vn(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lat(ix, iy, s), b = lat(ix + 1, iy, s), c = lat(ix, iy + 1, s), d = lat(ix + 1, iy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
function textureTops(g, P, ox, oy, seed) {
  let img;
  try { img = g.getImageData(0, 0, CH, CH); } catch { return; }
  if (!img || !img.data) return;
  const d = img.data;
  const T1 = hexRgb(P.top), T2 = hexRgb(P.top2);
  const D1 = hexRgb(mixHex(P.top, P.face, 0.22)), D2 = hexRgb(mixHex(P.top2, P.face, 0.22));
  for (let yy = 0; yy < CH; yy++) {
    for (let xx = 0; xx < CH; xx++) {
      const i = (yy * CH + xx) * 4;
      let D = null;
      if (d[i] === T1[0] && d[i + 1] === T1[1] && d[i + 2] === T1[2]) D = D1;
      else if (d[i] === T2[0] && d[i + 1] === T2[1] && d[i + 2] === T2[2]) D = D2;
      if (!D) continue;
      const wx = xx + ox, wy = yy + oy;
      const n = vn(wx / 40, wy / 40, seed) * 0.7 + vn(wx / 12, wy / 12, seed + 1) * 0.3;
      const t = BAYER4[(wy & 3) * 4 + (wx & 3)] * 0.1;
      if (n + t > 0.62 || lat(wx, wy, seed + 5) < 0.02) { d[i] = D[0]; d[i + 1] = D[1]; d[i + 2] = D[2]; }
    }
  }
  g.putImageData(img, 0, 0);
}

function paintChunk(g, T, cx, cy) {
  const P = TERRAIN_PALETTES[T.stage] || PAL_DEFAULT;
  const style = FACE_STYLE[T.stage] || 'earth';
  const ox = cx * CH - TEXT, oy = cy * CH - TEXT;
  const seed = T.seed | 0;
  // Drop shadows first, on the low ground.
  g.fillStyle = 'rgba(0,0,0,0.26)';
  for (const p of T.plateaus) g.fillRect(p.x - ox + SHADOW_X, p.y - oy + FACE + SHADOW_Y - 6, p.w, p.h);
  for (const p of T.plateaus) {
    paintBlock(g, p, P, P.top, ox, oy, p.drops, seed, style);
    for (const r of p.ramps) paintRamp(g, r, P, ox, oy);
    if (p.upper) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(p.upper.x - ox + 5, p.upper.y - oy + FACE + 4, p.upper.w, p.upper.h);
      paintBlock(g, p.upper, P, P.top2, ox, oy, null, seed + 3, style);
      for (const r of p.upper.ramps) paintRamp(g, r, P, ox, oy);
    }
  }
  for (const b of T.bridges) paintBridge(g, b, P, ox, oy);
  textureTops(g, P, ox, oy, seed);
}

// Which chunks hold something (feature bounds plus shadow and face reach).
function chunksFor(T) {
  const set = new Set();
  const add = (r) => {
    const x0 = Math.floor((r.x + TEXT - 4) / CH), x1 = Math.floor((r.x + r.w + TEXT + SHADOW_X + 8) / CH);
    const y0 = Math.floor((r.y + TEXT - 8) / CH), y1 = Math.floor((r.y + r.h + TEXT + FACE + SHADOW_Y + 8) / CH);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set.add(x + ',' + y);
  };
  for (const p of T.plateaus) { add(p); for (const r of p.ramps) add(r); }
  for (const b of T.bridges) add(b);
  return set;
}

let runKey = null, chunks = null, used = null;
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  return null;
}

// Draw the visible terrain chunks (camera top-left at cam.x, cam.y; the
// view is viewW x viewH world px).
export function drawTerrain(g, T, cam, viewW, viewH) {
  if (!T || !cacheEnabled()) return 0;
  const key = T.seed + '|' + T.stage;
  if (runKey !== key) { runKey = key; chunks = new Map(); used = chunksFor(T); }
  const c0 = Math.floor((cam.x + TEXT) / CH), c1 = Math.floor((cam.x + viewW + TEXT) / CH);
  const r0 = Math.floor((cam.y + TEXT) / CH), r1 = Math.floor((cam.y + viewH + TEXT) / CH);
  let n = 0;
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const k = cx + ',' + cy;
      if (!used.has(k)) continue;
      let img = chunks.get(k);
      if (img === undefined) {
        img = makeCanvas(CH, CH);
        if (img) paintChunk(img.getContext('2d'), T, cx, cy);
        chunks.set(k, img);
      }
      if (!img) continue;
      g.drawImage(img, Math.round(cx * CH - TEXT - cam.x), Math.round(cy * CH - TEXT - cam.y));
      n++;
    }
  }
  return n;
}

// ---- landmarks ---------------------------------------------------------------
// Each stage's signature structure on its plateau. Painted once per kind
// into the sprite cache; the origin is the structure's foot (centre bottom).
const MARK_BOX = { x: -28, y: -60, w: 56, h: 64 };
const px = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const MARK_PAINT = {
  watchtower: (g, x, y) => {
    px(g, 'rgba(0,0,0,0.35)', x - 14, y - 2, 30, 5);
    px(g, '#5b5f58', x - 10, y - 40, 20, 40);
    px(g, '#727a70', x - 10, y - 40, 3, 40);
    for (let i = 0; i < 5; i++) px(g, '#454941', x - 10, y - 36 + i * 8, 20, 1);
    px(g, '#5b5f58', x - 12, y - 46, 4, 6); px(g, '#5b5f58', x - 4, y - 48, 5, 8); px(g, '#5b5f58', x + 6, y - 44, 5, 4);
    px(g, '#1a1c18', x - 3, y - 30, 6, 9);
    px(g, '#ffd27a', x - 1, y - 27, 2, 3);
    px(g, '#6b4a2a', x - 16, y - 18, 32, 3);
    px(g, '#4a3220', x - 15, y - 15, 2, 6); px(g, '#4a3220', x + 13, y - 15, 2, 6);
  },
  arch: (g, x, y) => {
    px(g, 'rgba(0,0,0,0.35)', x - 24, y - 2, 50, 5);
    px(g, '#26262e', x - 22, y - 38, 12, 38); px(g, '#26262e', x + 10, y - 38, 12, 38);
    px(g, '#30303a', x - 24, y - 48, 48, 12);
    px(g, '#8a8aa0', x - 24, y - 48, 48, 2);
    px(g, '#3c3c48', x - 22, y - 38, 2, 38); px(g, '#3c3c48', x + 10, y - 38, 2, 38);
    px(g, '#ff6a2a', x - 2, y - 44, 4, 3);
    for (let i = 0; i < 4; i++) px(g, '#1a1a20', x - 20 + i * 2, y - 30 + i * 7, 6, 1);
  },
  belltower: (g, x, y) => {
    px(g, 'rgba(0,0,0,0.3)', x - 14, y - 2, 30, 5);
    px(g, '#9aaec4', x - 9, y - 44, 18, 44);
    px(g, '#d8e6f4', x - 9, y - 44, 3, 44);
    px(g, '#6a7e94', x - 12, y - 52, 24, 8);
    px(g, '#e8f2ff', x - 12, y - 54, 24, 3);
    px(g, '#2a3442', x - 5, y - 38, 10, 12);
    px(g, '#e8c25a', x - 3, y - 36, 6, 7); px(g, '#b8902a', x - 4, y - 30, 8, 2);
    for (let i = 0; i < 4; i++) px(g, '#e8f6ff', x - 11 + i * 7, y - 44, 1, 3 + (i % 2) * 3);
  },
  spire: (g, x, y) => {
    px(g, 'rgba(0,0,0,0.35)', x - 12, y - 2, 26, 5);
    for (let i = 0; i < 52; i++) {
      const w = Math.max(2, Math.round(16 * (1 - i / 52)));
      px(g, i % 9 < 4 ? '#7a3a22' : '#8e4a2a', x - (w >> 1), y - i - 1, w, 1);
    }
    px(g, '#c8704a', x - 1, y - 52, 2, 30);
    for (let i = 0; i < 4; i++) px(g, '#2a1410', x - 3, y - 10 - i * 10, 2, 2);
  },
  bonegate: (g, x, y) => {
    px(g, 'rgba(0,0,0,0.3)', x - 24, y - 2, 50, 5);
    for (let i = 0; i < 40; i++) {
      const o = Math.round(18 - (i * i) / 110);
      px(g, '#e8dcc0', x - 4 - o, y - i - 1, 5, 1);
      px(g, '#e8dcc0', x + o, y - i - 1, 5, 1);
    }
    px(g, '#bfb08c', x - 22, y - 8, 5, 8); px(g, '#bfb08c', x + 18, y - 8, 5, 8);
    px(g, '#efe6d0', x - 7, y - 54, 14, 12);
    px(g, '#2a2216', x - 5, y - 50, 4, 4); px(g, '#2a2216', x + 1, y - 50, 4, 4);
    px(g, '#2a2216', x - 3, y - 44, 6, 2);
  },
  obelisk: (g, x, y) => {
    px(g, 'rgba(0,0,0,0.35)', x - 12, y - 2, 26, 5);
    for (let i = 0; i < 54; i++) {
      const w = i > 46 ? Math.max(1, 12 - (i - 46) * 2) : 12;
      px(g, '#1e1838', x - (w >> 1), y - i - 1, w, 1);
    }
    px(g, '#3a3070', x - 6, y - 46, 2, 46);
    px(g, '#b8a8ff', x - 2, y - 34, 4, 4); px(g, '#b8a8ff', x - 1, y - 24, 2, 6); px(g, '#8a7aff', x - 2, y - 14, 4, 2);
  },
  forge: (g, x, y) => {
    // World art makeover: a forge, not a box — a stepped stone hearth with a
    // glowing mouth, a tall flue with a lit cap, an anvil and a slag spill.
    px(g, 'rgba(0,0,0,0.4)', x - 24, y - 2, 50, 5);
    px(g, '#2a201c', x - 20, y - 22, 34, 22);             // hearth body
    px(g, '#3a2c26', x - 20, y - 22, 34, 3);              // lit coping
    px(g, '#4a3830', x - 20, y - 22, 2, 22);              // lit west edge
    px(g, '#1e1614', x - 22, y - 6, 38, 6);               // plinth
    px(g, '#30241f', x - 22, y - 6, 38, 1);
    px(g, '#140e0c', x - 12, y - 17, 18, 11);             // mouth
    px(g, '#ff7a2a', x - 11, y - 14, 16, 8);
    px(g, '#ffd04a', x - 7, y - 11, 8, 4);
    px(g, '#fff0b0', x - 5, y - 10, 3, 2);
    px(g, '#2a201c', x + 4, y - 50, 9, 28);               // flue
    px(g, '#3e302a', x + 4, y - 50, 2, 28);
    px(g, '#1a1210', x + 2, y - 54, 13, 4);               // flue cap
    px(g, '#ff9a4a', x + 6, y - 58, 3, 3); px(g, '#ff7a2a', x + 9, y - 62, 2, 2);
    px(g, '#4a4a54', x + 16, y - 12, 10, 3);              // anvil
    px(g, '#6a6a78', x + 16, y - 12, 10, 1);
    px(g, '#3a3a44', x + 19, y - 9, 4, 7);
    px(g, '#ff7a2a', x - 18, y - 2, 6, 1); px(g, '#c4501e', x - 13, y - 1, 4, 1);   // slag spill
  },
  cairn: (g, x, y) => {
    px(g, 'rgba(0,0,0,0.3)', x - 16, y - 2, 34, 5);
    px(g, '#6c7a88', x - 14, y - 10, 28, 10); px(g, '#7e8c9a', x - 10, y - 20, 20, 10);
    px(g, '#6c7a88', x - 7, y - 28, 14, 8); px(g, '#7e8c9a', x - 4, y - 34, 8, 6);
    px(g, '#f2f8ff', x - 10, y - 21, 20, 2); px(g, '#f2f8ff', x - 4, y - 35, 8, 2);
    px(g, '#4a3a2a', x + 1, y - 56, 1, 22);
    px(g, '#d84a3a', x + 2, y - 56, 9, 5);
  },
};

export function drawTerrainMarks(g, T, cam, cull) {
  if (!T) return;
  for (const m of T.marks) {
    const x = Math.round(m.x - cam.x), y = Math.round(m.y - cam.y + 10);
    if (cull && cull(x, y - 30, 40)) continue;
    const paint = MARK_PAINT[m.kind];
    if (paint) blitPainted(g, 'tmark:' + m.kind, MARK_BOX, paint, x, y, STYLE_STRUCT);
  }
}
