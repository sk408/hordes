// HORDES — menu card 9-slice pixel frame (U1b, owner 2026-09-14: "custom
// somewhat like this.. like it is part of the screen").
//
// The title/menu cards were CSS-approximated plaques: a stepped clip-path cut
// the corners and, being a clip, it also clipped the card's own 0-blur
// drop-shadow, so the cards could not cast onto the screen art. This module is
// the real answer: an AUTHORED pixel-art frame, drawn through the renderer's
// own drawGrid seam onto a canvas layer inside each card. The canvas is the
// card's box PLUS the shadow offset, so the cast shadow is real painted pixels
// OUTSIDE the card box — the plaque finally sits on the screen, not in it.
//
// GRID CONVENTION (load-bearing, same trap as the header coin): every grid
// here is an INTEGER array where 0 is the transparent cell — drawGrid does a
// truthy test (`if (v)`), so a string grid ('.' for empty) is truthy in every
// cell, palette['.'] is undefined, the invalid fillStyle assignment is
// silently ignored and the previous colour paints every pixel. Integers only.
//
// THE 9-SLICE: corners are fixed 12x12 authored tiles (the top-left one is
// authored literally below; the other three are MIRRORS of it with the lit
// lips remapped to the shaded tone — one light source, top-left). Edges tile
// horizontally/vertically, the centre tiles both ways. composeMenuFrame(w, h)
// expands the slices to the card's exact pixel box and adds the cast shadow:
// the plaque silhouette offset by (dx, dy), painted first so the plaque
// covers it everywhere except the bottom-right spill — which lands outside
// the card box, over whatever the screen shows there.
//
// The frame is STATIC: nothing here reads a clock or a frame delta, so 60Hz
// and 120Hz are trivially identical (states repaint the same grid with a
// swapped palette — the silhouette can never jump).

// Palette keys 1..9, shared by every tile below:
//   1 keyline (also the inner keyline)   2 lip, LIT top      3 lip, lit left
//   4 frame tan                          5 frame shade step  6 plank
//   7 plank, lit band (top gradient)     8 plank, shade band (bottom / right lip)
//   9 cast shadow (semi-transparent: the screen art shows through it)
export const MENU_FRAME_PALETTES = {
  base: {
    1: '#0a0603', 2: '#f0d79a', 3: '#c79a5e', 4: '#d8b06a', 5: '#8a5a2a',
    6: '#2b1c12', 7: '#3d2818', 8: '#1d1209', 9: 'rgba(6,4,2,0.55)',
  },
  // Hover / keyboard focus: the plank brightens exactly like the old CSS
  // hover gradient and the frame goes crimson (the old ::after ring) — a
  // COLOUR swap on the same grid, never a geometry change.
  hot: {
    1: '#0a0603', 2: '#ffd75e', 3: '#e0a44a', 4: '#d94a4a', 5: '#8a2a2a',
    6: '#35220f', 7: '#4a3220', 8: '#241608', 9: 'rgba(6,4,2,0.55)',
  },
  // The equipped pilot's card: a gold frame (the dead --hi/--lo custom props
  // the CSS carried but never consumed said gold was the intent).
  sel: {
    1: '#0a0603', 2: '#fff2b0', 3: '#e8c05a', 4: '#ffd75e', 5: '#8a5a2a',
    6: '#2b1c12', 7: '#3d2818', 8: '#1d1209', 9: 'rgba(6,4,2,0.55)',
  },
};

// The cast shadow's offset in pixels (the old CSS drop-shadow was 5px 6px).
export const MENU_FRAME_SHADOW = { dx: 5, dy: 6 };

// Slice size: corners are 12x12, edge bands are 12 deep (6px frame + a 6px
// plank margin that carries the top/bottom gradient), the centre is 8x8.
export const MENU_FRAME_K = 12;

// THE AUTHORED TOP-LEFT CORNER. Stepped silhouette (a sawn sign edge: three
// 2px steps), then the bands mitred at 45 degrees: keyline, lit lip (brighter
// on top than on the left — one light source), 2px tan frame, shade step,
// inner keyline, plank with the lit top band and a single rivet.
export const MENU_FRAME_CORNER_TL = [
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2],
  [0, 0, 0, 0, 0, 0, 1, 3, 4, 4, 4, 4],
  [0, 0, 0, 0, 1, 1, 4, 4, 4, 4, 4, 4],
  [0, 0, 0, 0, 1, 2, 4, 4, 5, 5, 5, 5],
  [0, 0, 0, 0, 1, 3, 4, 4, 5, 1, 1, 1],
  [0, 0, 1, 1, 4, 4, 5, 1, 7, 7, 7, 7],
  [0, 0, 1, 2, 4, 4, 5, 1, 7, 7, 7, 7],
  [0, 0, 1, 3, 4, 4, 5, 1, 6, 6, 6, 6],
  [1, 1, 4, 4, 5, 1, 6, 6, 6, 4, 1, 6],
  [1, 2, 4, 4, 5, 1, 6, 6, 6, 1, 5, 6],
  [1, 3, 4, 4, 5, 1, 6, 6, 6, 6, 6, 6],
];

// THE AUTHORED TOP EDGE (8 wide, tiles horizontally): the same bands top to
// bottom — keyline, lit lip, frame, shade step, inner keyline, lit plank
// band, then plank with two grain flecks.
const MENU_FRAME_EDGE_TOP = [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2, 2, 2, 2],
  [4, 4, 4, 4, 4, 4, 4, 4],
  [4, 4, 4, 4, 4, 4, 4, 4],
  [5, 5, 5, 5, 5, 5, 5, 5],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [7, 7, 7, 7, 7, 7, 7, 7],
  [7, 7, 7, 7, 7, 7, 7, 7],
  [6, 6, 6, 6, 6, 6, 6, 6],
  [6, 6, 5, 6, 6, 6, 6, 6],
  [6, 6, 6, 6, 6, 6, 6, 6],
  [6, 6, 6, 6, 6, 6, 5, 6],
];

// THE AUTHORED LEFT EDGE (12 wide, 8 tall, tiles vertically): the same bands
// left to right — keyline, lit lip, frame, shade step, inner keyline — then
// plank with two grain flecks (no vertical gradient on the sides).
const MENU_FRAME_EDGE_LEFT = [
  [1, 3, 4, 4, 5, 1, 6, 6, 6, 6, 6, 6],
  [1, 3, 4, 4, 5, 1, 6, 6, 6, 6, 6, 6],
  [1, 3, 4, 4, 5, 1, 6, 6, 5, 6, 6, 6],
  [1, 3, 4, 4, 5, 1, 6, 6, 6, 6, 6, 6],
  [1, 3, 4, 4, 5, 1, 6, 6, 6, 6, 6, 6],
  [1, 3, 4, 4, 5, 1, 6, 6, 6, 6, 5, 6],
  [1, 3, 4, 4, 5, 1, 6, 6, 6, 6, 6, 6],
  [1, 3, 4, 4, 5, 1, 6, 6, 6, 6, 6, 6],
];

// THE AUTHORED CENTRE (8x8, tiles both ways): plank with sparse grain flecks.
const MENU_FRAME_CENTRE = [
  [6, 6, 6, 6, 6, 6, 6, 6],
  [6, 6, 6, 5, 6, 6, 6, 6],
  [6, 6, 6, 6, 6, 6, 6, 6],
  [6, 6, 6, 6, 6, 6, 6, 5],
  [6, 6, 6, 6, 6, 6, 6, 6],
  [6, 5, 6, 6, 6, 6, 6, 6],
  [6, 6, 6, 6, 6, 6, 6, 6],
  [6, 6, 6, 6, 6, 5, 6, 6],
];

// Mirror / recolour helpers (pure). The derived corners and edges stay in the
// SAME integer format, so everything still paints with one drawGrid call.
function mirrorH(grid) { return grid.map(row => row.slice().reverse()); }
function mirrorV(grid) { return grid.slice().reverse(); }
function remap(grid, map) {
  return grid.map(row => row.map(v => map[v] === undefined ? v : map[v]));
}

// The other three corners: mirrored silhouettes, lit lips (2 top / 3 left)
// swapped to the shaded tone (8) wherever the light does not reach, and the
// lit plank band (7) swapped to the shade band (8) on the bottom half.
const CORNER_TR = remap(mirrorH(MENU_FRAME_CORNER_TL), { 3: 8 });
const CORNER_BL = remap(mirrorV(MENU_FRAME_CORNER_TL), { 2: 8, 7: 8 });
const CORNER_BR = remap(mirrorV(mirrorH(MENU_FRAME_CORNER_TL)), { 2: 8, 3: 8, 7: 8 });

const EDGE_BOTTOM = remap(mirrorV(MENU_FRAME_EDGE_TOP), { 2: 8, 7: 8 });
const EDGE_RIGHT = remap(mirrorH(MENU_FRAME_EDGE_LEFT), { 3: 8 });

// Compose the full frame for a card of w x h CSS pixels. Returns an integer
// grid of (w + dx) x (h + dy): the 9-sliced plaque at (0,0)..(w-1,h-1) and
// the cast shadow spilling dx/dy past the bottom-right. A cell is the plaque
// pixel where the plaque is opaque, the shadow where the offset silhouette
// shows past it, 0 (transparent) everywhere else.
export function composeMenuFrame(w, h) {
  w = Math.floor(w); h = Math.floor(h);
  const { dx, dy } = MENU_FRAME_SHADOW;
  const W = w + dx, H = h + dy;
  const K = MENU_FRAME_K;
  // Degenerate boxes (never a real card) get a plain keyline + plank slab.
  if (w < 2 * K + 4 || h < 2 * K + 4) {
    const slabAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0
      : (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 1 : 6);
    const slab = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) row.push(slabAt(x, y) || (slabAt(x - dx, y - dy) ? 9 : 0));
      slab.push(row);
    }
    return { grid: slab, w: W, h: H };
  }
  const plaqueAt = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    if (x < K && y < K) return MENU_FRAME_CORNER_TL[y][x];
    if (x >= w - K && y < K) return CORNER_TR[y][x - (w - K)];
    if (x < K && y >= h - K) return CORNER_BL[y - (h - K)][x];
    if (x >= w - K && y >= h - K) return CORNER_BR[y - (h - K)][x - (w - K)];
    if (y < K) return MENU_FRAME_EDGE_TOP[y][(x - K) % 8];
    if (y >= h - K) return EDGE_BOTTOM[y - (h - K)][(x - K) % 8];
    if (x < K) return MENU_FRAME_EDGE_LEFT[(y - K) % 8][x];
    if (x >= w - K) return EDGE_RIGHT[(y - K) % 8][x - (w - K)];
    return MENU_FRAME_CENTRE[(y - K) % 8][(x - K) % 8];
  };
  const grid = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      const p = plaqueAt(x, y);
      // The shadow is the plaque silhouette shifted (dx, dy), showing only
      // where the plaque itself is not opaque — i.e. the bottom-right spill.
      row.push(p || (plaqueAt(x - dx, y - dy) ? 9 : 0));
    }
    grid.push(row);
  }
  return { grid, w: W, h: H };
}
