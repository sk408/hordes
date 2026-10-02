// HORDES — playing-card renderer (CARD ART track, NEW FILE, unwired by design).
//
// drawCard(g, id, x, y, scale) paints one card from src/art/cards.js through
// the drawGrid seam: INTEGER pixel blocks, palette[v] per truthy cell,
// 0 = transparent — the exact contract of Renderer.drawGrid
// (src/render.js:207). Callers that hold the game renderer should pass its
// painter as the optional 6th arg (renderer.drawGrid.bind(renderer)) so the
// wired path and this file's default painter are provably the same pixels;
// the default exists so headless tests and standalone previews need no canvas
// or game boot. `scale` is an INTEGER block size — sub-pixel scaling is
// refused, per the house pixel-art rule.
import { cardArt, CARD_W, CARD_H } from './art/cards.js';

// 1:1 mirror of Renderer.drawGrid (src/render.js:207). Kept byte-identical in
// behaviour: truthy test, palette lookup, one fillRect per cell, integer block.
function paintGrid(g, grid, palette, x, y, scale = 1) {
  const s = Math.max(1, Math.floor(scale));
  for (let ry = 0; ry < grid.length; ry++) {
    const row = grid[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const v = row[rx];
      if (v) { g.fillStyle = palette[v]; g.fillRect(x + rx * s, y + ry * s, s, s); }
    }
  }
}

// Paint card `id` at (x, y). Returns false (paints nothing) for an unknown id,
// so a draft offer the art track has not seen yet fails safe, never loud.
export function drawCard(g, id, x, y, scale = 1, drawGridFn = null) {
  const art = cardArt(id);
  if (!art) return false;
  (drawGridFn || paintGrid)(g, art.grid, art.palette, x, y, scale);
  return true;
}

// Painted size of a card at a given integer scale — for sizing backing stores.
export function cardBox(scale = 1) {
  const s = Math.max(1, Math.floor(scale));
  return { w: CARD_W * s, h: CARD_H * s };
}
