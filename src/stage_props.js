// HORDES — stage prop objects (PORT SLICE A: original art from VS design reference).
//
// WHAT THIS FILE IS
// Six ORIGINAL hand-authored pixel props for the arena floor, one per stage
// identity. They are CONCEPT ports only: the reference
// (docs/vs_port_ref/DESIGN_REFERENCE_VS.md, sections 5-6 + 13, see GAPS) names
// the ROLES — breakable fire bowls, lamp posts, candelabra, carts, statues,
// marker nodes — and documents that the prop sprite bundle was NEVER
// extracted (section 14 GAPS: "Props sprites empty", zero thumbs). There was
// nothing to trace; every grid below was drawn fresh for HORDES.
//
// ART-DIRECTION NUMBERS (reference section 1, style guidance only):
//   * 32px grid: every prop fits inside one 32px decor cell (largest is
//     16x10), painted 1:1 through drawGrid — integer scaling, no smoothing.
//   * Palette budget: heroes stay tight (~32-48 colors); each prop uses 4-5
//     keys (1..9, 0 = transparent), the same convention as src/sprites.js.
//   * Animation policy: actors walk, decor sits still. Flame tongues carry a
//     2-frame flicker, but the frame is chosen per CELL (propFrame hashes
//     cx/cy), never by the clock — the ground field stays a pure function
//     of (cell, seed), so repaints are byte-identical (the determinism the
//     decor tests pin).
//
// WIRING: render.js drawLandmarks consults propForStage(stage) for the tail
// landmark of a picked cell — one landmark per cell either way, so density
// and rim rules are untouched. No balance/combat/economy number lives here
// (visual-only slice).
// PORT SLICE D (owner-ruled 2026-09-22): drawLandmarks turns the density
// knobs (LANDMARK_DENSITY, the CAMP/CAIRN pick bounds, the prop hash gate)
// and force-paints the stage's prop at one spawn-near cell per run — all in
// render.js. This file is unchanged: same six props, same palettes.

// ---- EMBER_BRAZIER (12x14, 2 frames) ---------------------------------------
// Reference: section 6 rows BRAZIER / BRAZIER2 / GOTHIC_BRAZIER — the
// breakable fire-bowl light source. HORDES-native: ember light for the fire
// stages (ASHEN_WASTE, CINDER_MAW). Iron bowl on splayed legs, flame tongue
// leaning left (A) / right (B).
const EMBER_BRAZIER_A = [
  [0,0,0,0,3,3,0,0,0,0,0,0],
  [0,0,0,0,3,4,4,0,0,0,0,0],
  [0,0,0,3,3,4,4,0,0,0,0,0],
  [0,0,0,3,4,4,4,3,0,0,0,0],
  [0,0,3,3,4,4,4,3,3,0,0,0],
  [0,2,2,2,2,2,2,2,2,2,2,0],
  [0,1,3,3,3,3,3,3,3,3,1,0],
  [0,0,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,0,1,1,0,0,0,0,0],
  [0,0,0,0,1,0,0,1,0,0,0,0],
  [0,0,0,1,0,0,0,0,1,0,0,0],
  [0,0,0,1,0,0,0,0,1,0,0,0],
  [0,0,1,1,0,0,0,0,1,1,0,0],
];
const EMBER_BRAZIER_B = [
  [0,0,0,0,0,3,3,0,0,0,0,0],
  [0,0,0,0,4,4,3,0,0,0,0,0],
  [0,0,0,0,4,4,3,3,0,0,0,0],
  [0,0,0,3,4,4,4,3,0,0,0,0],
  [0,0,3,3,4,4,4,3,3,0,0,0],
  [0,2,2,2,2,2,2,2,2,2,2,0],
  [0,1,3,3,3,3,3,3,3,3,1,0],
  [0,0,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,0,1,1,0,0,0,0,0],
  [0,0,0,0,1,0,0,1,0,0,0,0],
  [0,0,0,1,0,0,0,0,1,0,0,0],
  [0,0,0,1,0,0,0,0,1,0,0,0],
  [0,0,1,1,0,0,0,0,1,1,0,0],
];
const EMBER_BRAZIER_PALETTE = { 1: '#3a3f4a', 2: '#6a7382', 3: '#e8481e', 4: '#ffd54a' };

// ---- TRAIL_LANTERN (8x16, 2 frames) ----------------------------------------
// Reference: section 6 rows LAMPOST / LAMPOST_SINGLE / LANTERN /
// LANTERN_INVERSE — the path-marker lamp. HORDES-native: trail lights for
// the snow stages (SNOWFIELD, WHITEOUT) and the default path (VERDANT_HOLLOW
// and unset stage). Wooden post, capped lamp box, warm glass that swaps its
// hot cell between frames.
const TRAIL_LANTERN_A = [
  [0,0,1,1,1,1,0,0],
  [0,2,1,1,1,1,2,0],
  [0,0,5,5,5,5,0,0],
  [0,0,5,4,3,5,0,0],
  [0,0,5,3,3,5,0,0],
  [0,0,5,5,5,5,0,0],
  [0,0,0,1,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,5,5,5,5,5,5,0],
];
const TRAIL_LANTERN_B = [
  [0,0,1,1,1,1,0,0],
  [0,2,1,1,1,1,2,0],
  [0,0,5,5,5,5,0,0],
  [0,0,5,3,4,5,0,0],
  [0,0,5,4,3,5,0,0],
  [0,0,5,5,5,5,0,0],
  [0,0,0,1,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,0,2,1,0,0,0],
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,5,5,5,5,5,5,0],
];
const TRAIL_LANTERN_PALETTE = { 1: '#4a3826', 2: '#7c603c', 3: '#ffd54a', 4: '#fff2b0', 5: '#2e3136' };

// ---- VOID_CANDELABRA (14x14, 2 frames) -------------------------------------
// Reference: section 6 rows CANDELABRA / CANDLE — the standing multi-candle.
// HORDES-native: gothic ember for VOID_REACH. Three candles on a crossbar,
// flame tips stepping right between frames.
const VOID_CANDELABRA_A = [
  [0,0,4,0,0,0,0,4,0,0,0,4,0,0],
  [0,0,4,0,0,0,0,4,0,0,0,4,0,0],
  [0,0,5,0,0,0,0,5,0,0,0,5,0,0],
  [0,3,3,0,0,0,3,3,0,0,0,3,3,0],
  [0,3,3,0,0,0,3,3,0,0,0,3,3,0],
  [0,2,2,0,0,0,2,2,0,0,0,2,2,0],
  [0,2,2,2,2,2,2,2,2,2,2,2,2,0],
  [0,1,1,1,1,1,2,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,2,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,2,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,2,1,0,0,0,0,0,0],
  [0,0,0,0,0,2,2,2,0,0,0,0,0,0],
  [0,0,0,0,2,2,2,2,2,0,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,0,0,0,0],
];
const VOID_CANDELABRA_B = [
  [0,0,0,4,0,0,0,0,4,0,0,0,4,0],
  [0,0,4,4,0,0,0,4,4,0,0,4,4,0],
  [0,0,5,0,0,0,0,5,0,0,0,5,0,0],
  [0,3,3,0,0,0,3,3,0,0,0,3,3,0],
  [0,3,3,0,0,0,3,3,0,0,0,3,3,0],
  [0,2,2,0,0,0,2,2,0,0,0,2,2,0],
  [0,2,2,2,2,2,2,2,2,2,2,2,2,0],
  [0,1,1,1,1,1,2,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,2,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,2,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,2,1,0,0,0,0,0,0],
  [0,0,0,0,0,2,2,2,0,0,0,0,0,0],
  [0,0,0,0,2,2,2,2,2,0,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,0,0,0,0],
];
const VOID_CANDELABRA_PALETTE = { 1: '#3d2a52', 2: '#6a5a8a', 3: '#e8d8c0', 4: '#ffd54a', 5: '#1a1426' };

// ---- DUNE_CART (16x10, static) ----------------------------------------------
// Reference: section 6 row CART (maxHp=4 — the sturdy prop). HORDES-native:
// a broken supply cart for BONE_DESERT. Torn canopy, plank bed, iron axle,
// one sound wheel and one chipped wheel, a fallen plank beside it.
const DUNE_CART_GRID = [
  [4,4,0,0,4,4,4,0,0,0,0,0,0,0,0,0],
  [4,4,4,4,4,4,0,0,0,0,0,0,0,0,0,0],
  [0,2,2,2,2,2,2,2,2,2,2,2,2,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,1,5,1,1,5,1,1,1,5,1,1,1,0,0,0],
  [0,0,3,3,3,3,3,3,3,3,3,3,0,0,0,0],
  [0,3,3,3,0,0,0,0,0,0,3,3,3,0,0,0],
  [0,3,5,3,0,0,0,0,0,0,3,5,3,0,0,0],
  [0,3,3,3,0,0,0,0,0,0,3,3,0,1,1,1],
  [0,0,3,0,0,0,0,0,0,0,0,3,0,0,1,0],
];
const DUNE_CART_PALETTE = { 1: '#6b4a2a', 2: '#a87f4a', 3: '#3a3f4a', 4: '#8a2a2a', 5: '#c8b088' };

// ---- RUST_IDOL (12x16, static) ----------------------------------------------
// Reference: section 6 rows EX_TOHILSTATUE / KUJATASTATUE (the heavy maxHp
// statue). HORDES-native: a rust-red standing stone marking the elite arena
// (BLOOD_RUST). World art makeover: the old idol (blocky head, two glowing
// eyes, a body) read as a small creature, i.e. as an enemy; it is now a
// pointed obelisk with a glowing zigzag rune on a stepped plinth.
const RUST_IDOL_GRID = [
  [0,0,0,0,0,3,2,0,0,0,0,0],
  [0,0,0,0,3,2,2,2,0,0,0,0],
  [0,0,0,0,3,2,2,2,0,0,0,0],
  [0,0,0,3,2,2,2,2,2,0,0,0],
  [0,0,0,3,2,4,2,2,2,0,0,0],
  [0,0,0,3,2,2,4,2,2,0,0,0],
  [0,0,0,3,2,4,2,2,2,0,0,0],
  [0,0,0,3,2,2,4,2,2,0,0,0],
  [0,0,3,2,2,4,2,2,2,2,0,0],
  [0,0,3,2,2,2,2,2,2,2,0,0],
  [0,0,3,2,2,2,2,2,5,2,0,0],
  [0,0,3,2,2,2,2,2,2,2,0,0],
  [0,3,3,3,3,3,3,3,3,3,3,0],
  [0,2,2,2,2,2,2,2,2,2,2,0],
  [2,2,5,2,2,2,2,2,5,2,2,2],
  [5,5,5,5,5,5,5,5,5,5,5,5],
];
const RUST_IDOL_PALETTE = { 1: '#2e1a14', 2: '#6a3226', 3: '#a8583c', 4: '#ffd54a', 5: '#1c0e0a' };

// ---- STORM_VANE (10x16, static) ----------------------------------------------
// Reference: section 6 row WEATHERNODE — the marker node. HORDES-native: a
// storm-arrow vane for WHITEOUT's white hills (a waymark in low contrast).
// Copper arrow over an iron pole with a pale glint tip.
const STORM_VANE_GRID = [
  [0,0,0,0,4,0,0,0,0,0],
  [0,0,0,0,3,0,0,0,0,0],
  [0,3,3,3,3,3,3,3,0,0],
  [3,0,0,0,0,0,0,3,3,3],
  [0,0,0,0,2,2,0,0,0,0],
  [0,0,2,2,2,2,2,2,0,0],
  [0,0,0,0,2,1,0,0,0,0],
  [0,0,0,0,2,1,0,0,0,0],
  [0,0,0,0,2,1,0,0,0,0],
  [0,0,0,0,2,1,0,0,0,0],
  [0,0,0,0,2,1,0,0,0,0],
  [0,0,0,0,2,1,0,0,0,0],
  [0,0,0,2,2,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1,1],
];
const STORM_VANE_PALETTE = { 1: '#2e3440', 2: '#6a7688', 3: '#b0783c', 4: '#9effe0' };

function boxOf(frames) {
  return { w: frames[0][0].length, h: frames[0].length };
}

function makeProp(id, name, blurb, frames, palette) {
  const box = boxOf(frames);
  return {
    id, name, blurb, frames, palette,
    frameCount: frames.length,
    w: box.w, h: box.h,
    anchor: { x: Math.floor(box.w / 2), y: Math.floor(box.h / 2) },
  };
}

export const STAGE_PROPS = {
  EMBER_BRAZIER: makeProp('EMBER_BRAZIER', 'ember brazier',
    'a fire bowl for the scorched stages', [EMBER_BRAZIER_A, EMBER_BRAZIER_B], EMBER_BRAZIER_PALETTE),
  TRAIL_LANTERN: makeProp('TRAIL_LANTERN', 'trail lantern',
    'a lamp post marking the paths', [TRAIL_LANTERN_A, TRAIL_LANTERN_B], TRAIL_LANTERN_PALETTE),
  VOID_CANDELABRA: makeProp('VOID_CANDELABRA', 'void candelabra',
    'a three-candle stand for the dark reach', [VOID_CANDELABRA_A, VOID_CANDELABRA_B], VOID_CANDELABRA_PALETTE),
  DUNE_CART: makeProp('DUNE_CART', 'dune cart',
    'a broken supply cart in the sand', [DUNE_CART_GRID], DUNE_CART_PALETTE),
  RUST_IDOL: makeProp('RUST_IDOL', 'rust idol',
    'a rust standing stone with a glowing rune', [RUST_IDOL_GRID], RUST_IDOL_PALETTE),
  STORM_VANE: makeProp('STORM_VANE', 'storm vane',
    'a storm arrow waymark for the white hills', [STORM_VANE_GRID], STORM_VANE_PALETTE),
};

export const STAGE_PROP_IDS = Object.keys(STAGE_PROPS);

// Stage identity each prop serves (src/stages.js ids). Unlisted / unset
// stages read the trail lantern — every arena keeps path lights.
const PROP_BY_STAGE = {
  ASHEN_WASTE: 'EMBER_BRAZIER',
  CINDER_MAW: 'EMBER_BRAZIER',
  SNOWFIELD: 'TRAIL_LANTERN',
  WHITEOUT: 'STORM_VANE',
  VOID_REACH: 'VOID_CANDELABRA',
  BONE_DESERT: 'DUNE_CART',
  BLOOD_RUST: 'RUST_IDOL',
  VERDANT_HOLLOW: 'TRAIL_LANTERN',
};

export function propForStage(stageId) {
  return STAGE_PROPS[PROP_BY_STAGE[stageId] || 'TRAIL_LANTERN'];
}

// Deterministic flicker frame for a landmark cell: 0/1 from the cell hash,
// never the clock (the ground field must repaint identically per seed).
export function propFrame(prop, cx, cy) {
  if (prop.frameCount < 2) return 0;
  return (Math.abs(cx + cy) % 2 + 2) % 2;
}

// Paint one prop through a drawGrid-shaped painter:
// paintStageProp(g, drawGrid, 'EMBER_BRAZIER', 0, x, y).
// Returns the painted pixel count (one fillRect per pixel — the number the
// landmarks seam reports as `rects`, so a prop always reads COMPOSED).
export function paintStageProp(g, drawGrid, id, frame, x, y) {
  const prop = STAGE_PROPS[id];
  if (!prop) return 0;
  const grid = prop.frames[((frame | 0) % prop.frameCount + prop.frameCount) % prop.frameCount];
  drawGrid(g, grid, prop.palette, x, y);
  let n = 0;
  for (const row of grid) for (const v of row) if (v) n++;
  return n;
}
