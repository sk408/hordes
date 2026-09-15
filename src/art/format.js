// HORDES — art format kit (A1 ART TRACK, new file).
//
// THE FORMAT, in one place. It is the game's existing sprite format, unchanged:
//
//   grid    : number[][]  — rows of palette indices; 0 = transparent, 1..9 = keys
//   palette : { '1'..'9': '#rrggbb' }
//   consume : renderer.drawGrid(g, asset.grid, asset.palette, x, y)
//
// Every asset exported from src/art/* carries the SAME two fields plus derived
// metadata, so no adapter is needed anywhere:
//
//   id      : stable string id (achievement / character / shop-row id)
//   name    : display name where one exists
//   grid    : the pixel data (see above)          [frames[0] on framed assets]
//   palette : the colour map (see above)
//   rows    : grid as digit STRINGS ('0' = transparent) — DERIVED, never authored
//   w, h    : pixel box, derived from the grid
//   frames  : framed assets only — array of grids (2+ for anything animated)
//   frameCount : framed assets only — frames.length
//
// `rows` exists because the brief for this track describes grids as "digit
// strings"; the renderer indexes a grid numerically, so the numeric array is
// authoritative and the string form is generated from it. One source of truth,
// two views, impossible to drift (test/test_art_lint.mjs asserts the equality).

// Documented dimension contract per art family. The lint test holds its own
// copy of this table and fails if the two ever disagree, so a widening here
// cannot silently relax the test.
export const ART_LIMITS = {
  TROPHY: { w: [32, 32], h: [32, 32] },
  PORTRAIT: { w: [32, 32], h: [32, 32] },
  SHOP_ICON: { w: [12, 16], h: [12, 16] },
  PORTAL: { w: [48, 48], h: [48, 48] },
  TITLE_LAYER: { w: [1, 480], h: [1, 300] },
  // V1b escape sprites (src/escape/sprites.js): side-view actors in the mode's
  // 480x300 virtual view — 2-3x the shop icon's box, well under a portrait's.
  ESCAPE: { w: [8, 32], h: [8, 32] },
};

// { w, h } of a pixel grid.
export function box(grid) {
  return { w: grid[0].length, h: grid.length };
}

// Digit-string view of a grid: ['00110', ...]. '0' means transparent.
export function digitRows(grid) {
  return grid.map(row => row.join(''));
}

// Build one flat asset. Metadata (rows/w/h) is computed here so it can never
// disagree with the pixels.
export function makeAsset(spec) {
  const b = box(spec.grid);
  const a = { id: spec.id, grid: spec.grid, palette: spec.palette, rows: digitRows(spec.grid), w: b.w, h: b.h };
  if (spec.name !== undefined) a.name = spec.name;
  if (spec.desc !== undefined) a.desc = spec.desc;
  return a;
}

// Build one framed (animated) asset.
export function makeFrames(spec) {
  const b = box(spec.frames[0]);
  const a = {
    id: spec.id,
    frames: spec.frames,
    palette: spec.palette,
    rows: spec.frames.map(digitRows),
    frameCount: spec.frames.length,
    w: b.w,
    h: b.h,
  };
  if (spec.name !== undefined) a.name = spec.name;
  if (spec.desc !== undefined) a.desc = spec.desc;
  return a;
}

// Integer upscale of a grid by n (used by the title composition). Pure; the
// result is an ordinary grid, so it still paints with drawGrid.
export function scaleGrid(grid, n) {
  const k = Math.max(1, Math.floor(n));
  if (k === 1) return grid;
  const out = [];
  for (const row of grid) {
    const wide = [];
    for (const v of row) for (let i = 0; i < k; i++) wide.push(v);
    for (let i = 0; i < k; i++) out.push(wide.slice());
  }
  return out;
}
