// HORDES — tier-2 named-find item icons (2026-09-23, NEW file).
//
// One ORIGINAL 8x8 integer-grid icon per tier-2 affix in loot.js AFFIX_POOL
// (ids ironbrand..redtithe). FORMAT is the house format unchanged
// (src/art/format.js makeAsset: grid + palette + derived rows/w/h, 0 =
// transparent, 1..9 = palette keys; consume with renderer.drawGrid).
// A2 HOUSE RULES followed: 1 dark outline ink, 2 base, 3 rim light, 4 shade,
// 5 hot accent; five palette keys maximum.
//
// NOT enumerated in src/art/index.js ART_SECTIONS (the chest-art precedent):
// the belt painter resolves art per item at draw time via itemIconFor, so a
// find shipping without art yet falls back to the generic gem — the game
// never gates content on this table, and test_art_lint counts stay green.
//
// SEAM: itemIconFor(item) -> asset | null (first affix carrying art wins;
// legacy items resolve null and paint the generic gem exactly as before) and
// paintItemIcon(drawGrid, g, art, x, y, scale) — the belt in render.js and
// tools/capture_tier2_items.mjs share this painter, so the captures are the
// real seam, not a redraw.
import { makeAsset } from './format.js';

const INK = '#14141c';   // shared dark outline ink (the shop-icon 1-ink look)

export const ITEM_AFFIX_ART = {
  // IRONBRAND (damage): a branding iron, ember core in the head.
  'ironbrand': makeAsset({
    id: 'ironbrand',
    palette: { 1: INK, 2: '#7a8098', 5: '#ff9a3c' },
    grid: [
      [0,0,1,1,1,1,0,0],
      [0,0,1,5,5,1,0,0],
      [0,0,1,5,5,1,0,0],
      [0,0,1,2,2,1,0,0],
      [0,0,0,1,1,0,0,0],
      [0,0,0,1,1,0,0,0],
      [0,0,0,1,1,0,0,0],
      [0,0,0,1,1,0,0,0],
    ],
  }),
  // SUNDER (damage): a heavy maul, gold rune sparking on the haft.
  'sunder': makeAsset({
    id: 'sunder',
    palette: { 1: INK, 2: '#8a93ad', 3: '#d8def0', 4: '#464b60', 5: '#ffd75e' },
    grid: [
      [0,1,1,2,2,2,1,0],
      [0,1,3,2,2,2,1,0],
      [0,1,1,2,2,4,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,1,1,0,0,0],
      [0,0,0,1,1,0,0,0],
      [0,0,0,1,5,0,0,0],
      [0,0,0,1,1,0,0,0],
    ],
  }),
  // TRUESIGHT (crit): an eye, blue iris on pale white.
  'truesight': makeAsset({
    id: 'truesight',
    palette: { 1: INK, 2: '#c8e8ff', 5: '#4a8cff' },
    grid: [
      [0,0,1,1,1,1,0,0],
      [0,1,2,2,2,2,1,0],
      [1,2,2,1,1,2,2,1],
      [1,2,1,5,5,1,2,1],
      [1,2,1,5,5,1,2,1],
      [1,2,2,1,1,2,2,1],
      [0,1,2,2,2,2,1,0],
      [0,0,1,1,1,1,0,0],
    ],
  }),
  // WITCHMARK (crit): a violet hex rune with a pale spark.
  'witchmark': makeAsset({
    id: 'witchmark',
    palette: { 1: INK, 2: '#8a5cc8', 5: '#e8d8ff' },
    grid: [
      [0,0,0,1,1,0,0,0],
      [0,0,1,2,2,1,0,0],
      [0,1,2,2,5,2,1,0],
      [1,2,2,5,5,2,2,1],
      [0,1,2,2,5,2,1,0],
      [0,0,1,2,2,1,0,0],
      [0,0,0,1,1,0,0,0],
      [0,0,0,0,0,0,0,0],
    ],
  }),
  // HEARTSEEKER (crit damage): a red heart pierced by a gold shaft.
  'heartseeker': makeAsset({
    id: 'heartseeker',
    palette: { 1: INK, 2: '#c23b3b', 3: '#ff5566', 5: '#ffd75e' },
    grid: [
      [0,1,1,0,0,1,1,0],
      [1,2,2,1,1,2,2,1],
      [1,3,2,2,2,2,2,1],
      [5,5,2,2,2,2,2,1],
      [0,1,2,2,2,2,1,0],
      [0,0,1,2,2,1,0,0],
      [0,0,0,1,1,0,0,0],
      [0,0,0,0,0,0,0,0],
    ],
  }),
  // ALLEGRO (attack rate): a fast-forward arrow, solid cyan bars.
  'allegro': makeAsset({
    id: 'allegro',
    palette: { 1: INK, 2: '#6fd8ff' },
    grid: [
      [0,0,0,0,0,0,2,0],
      [2,2,2,2,0,2,2,2],
      [0,0,0,0,0,2,2,2],
      [2,2,2,2,2,2,2,2],
      [0,0,0,0,0,2,2,2],
      [2,2,2,2,0,2,2,2],
      [0,0,0,0,0,0,2,0],
      [0,0,0,0,0,0,0,0],
    ],
  }),
  // MINTMARK (gold): a gold ingot, pale stamp on the face.
  'mintmark': makeAsset({
    id: 'mintmark',
    palette: { 1: INK, 2: '#dcae38', 3: '#ffe9a8', 4: '#8a6420', 5: '#fff2b0' },
    grid: [
      [0,0,0,0,0,0,0,0],
      [0,0,1,1,1,1,0,0],
      [0,1,3,3,3,3,1,0],
      [0,1,3,5,5,3,1,0],
      [1,2,2,2,2,2,2,1],
      [1,2,2,4,4,2,2,1],
      [0,1,1,1,1,1,1,0],
      [0,0,0,0,0,0,0,0],
    ],
  }),
  // BLACKLEDGER (gold): a dark ledger with a gold coin clasp.
  'blackledger': makeAsset({
    id: 'blackledger',
    palette: { 1: INK, 2: '#2a3a32', 3: '#4a5a50', 5: '#ffd75e' },
    grid: [
      [0,1,1,1,1,1,0,0],
      [0,1,2,2,2,2,1,0],
      [0,1,3,1,1,2,1,0],
      [0,1,2,1,5,2,1,0],
      [0,1,2,1,1,2,1,0],
      [0,1,2,2,2,2,1,0],
      [0,1,2,2,2,2,1,0],
      [0,1,1,1,1,1,0,0],
    ],
  }),
  // ARCHIVIST (xp): a parchment folio with a red seal.
  'archivist': makeAsset({
    id: 'archivist',
    palette: { 1: INK, 2: '#d8cfa8', 5: '#c23b3b' },
    grid: [
      [0,0,0,0,0,0,0,0],
      [0,1,1,0,0,1,1,0],
      [0,1,2,1,1,2,1,0],
      [0,1,2,2,2,2,1,0],
      [0,1,2,5,5,2,1,0],
      [0,1,2,2,2,2,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,0,0,0,0,0,0],
    ],
  }),
  // STRIDER (speed): a leather boot in profile, dark sole.
  'strider': makeAsset({
    id: 'strider',
    palette: { 1: INK, 2: '#8a5a32', 3: '#d8a86a', 4: '#3a2418' },
    grid: [
      [0,0,0,0,0,0,0,0],
      [0,0,1,1,0,0,0,0],
      [0,0,1,2,1,0,0,0],
      [0,0,1,2,2,1,1,0],
      [0,1,2,2,2,2,2,1],
      [0,1,3,2,2,2,4,1],
      [0,1,1,1,1,1,1,1],
      [0,0,0,0,0,0,0,0],
    ],
  }),
  // TAILWIND (speed): a sky-blue pennant flying from a pole.
  'tailwind': makeAsset({
    id: 'tailwind',
    palette: { 1: INK, 2: '#8ab0e8', 3: '#d8e8ff' },
    grid: [
      [0,0,0,0,0,0,0,0],
      [1,0,0,0,0,0,0,0],
      [1,2,2,1,0,0,0,0],
      [1,2,2,2,2,1,0,0],
      [1,2,3,2,3,2,2,1],
      [1,2,2,2,2,1,0,0],
      [1,2,2,1,0,0,0,0],
      [1,0,0,0,0,0,0,0],
    ],
  }),
  // DRAGNET (pickup): a rope-mesh dragnet with a gold sinker.
  'dragnet': makeAsset({
    id: 'dragnet',
    palette: { 1: '#7a7a98', 5: '#ffd75e' },
    grid: [
      [1,0,1,0,1,0,1,0],
      [0,1,0,1,0,1,0,1],
      [1,0,1,0,1,0,1,0],
      [0,1,0,1,0,1,0,1],
      [1,0,1,0,1,0,1,0],
      [0,1,0,1,0,1,0,1],
      [0,0,1,0,1,0,5,0],
      [0,0,0,1,1,1,0,0],
    ],
  }),
  // THISTLECOAT (thorns): a spiked burr ball, green thorns.
  'thistlecoat': makeAsset({
    id: 'thistlecoat',
    palette: { 1: '#1c2a1c', 2: '#3f7a3f', 3: '#7ac87a' },
    grid: [
      [0,0,0,1,1,0,0,0],
      [0,1,0,1,1,0,1,0],
      [0,0,1,2,2,1,0,0],
      [1,1,2,2,3,2,1,1],
      [1,1,2,3,2,2,1,1],
      [0,0,1,2,2,1,0,0],
      [0,1,0,1,1,0,1,0],
      [0,0,0,1,1,0,0,0],
    ],
  }),
  // REDTITHE (lifesteal): a blood drop with a pale fang core.
  'redtithe': makeAsset({
    id: 'redtithe',
    palette: { 1: INK, 2: '#c23b3b', 3: '#ff5566', 5: '#f4f4f8' },
    grid: [
      [0,0,0,1,1,0,0,0],
      [0,0,1,2,2,1,0,0],
      [0,0,1,2,3,1,0,0],
      [0,1,2,2,2,2,1,0],
      [0,1,2,2,2,2,1,0],
      [0,1,2,5,5,2,1,0],
      [0,0,1,5,5,1,0,0],
      [0,0,0,1,1,0,0,0],
    ],
  }),
};

export const ITEM_AFFIX_ART_IDS = Object.keys(ITEM_AFFIX_ART);

// First affix carrying art wins (an item's portrait is its lead affix — the
// same affix whose noun names it, loot.js rollItemOfRarity). Legacy affix ids
// resolve null: those items keep the generic rarity-tinted gem, byte-identical.
export function artForAffix(affixId) {
  return ITEM_AFFIX_ART[affixId] || null;
}

export function itemIconFor(item) {
  if (!item || !Array.isArray(item.affixes)) return null;
  for (const a of item.affixes) {
    if (!a) continue;
    const art = artForAffix(a.id);
    if (art) return art;
  }
  return null;
}

// The shared painter: game belt (render.js) and the capture tool call THIS,
// never a private copy. drawGrid-shaped: (g, grid, palette, x, y, scale).
export function paintItemIcon(drawGrid, g, art, x, y, scale = 1) {
  drawGrid(g, art.grid, art.palette, x, y, scale);
}
