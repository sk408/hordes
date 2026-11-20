// HORDES — per-character in-run sprites (PORT SLICE C: original art for the
// EXISTING four pilots).
//
// WHAT THIS FILE IS
// Four ORIGINAL hand-authored 12x12 pixel sprites — one per meta.js
// CHARACTERS id (KNIGHT, WITCH, ROGUE, PALADIN) — plus the ONE roster-wide
// lookup the renderer and the tests share. Each pilot has a ROLE (starter
// brawler, chain-lightning witch, knife thief, cross-bearing support) and
// every grid below was drawn fresh for HORDES: no pixels, palettes or traced
// silhouettes from any other game appear here (RED LINE).
//
// WHY THESE FOUR GRIDS
// Character identity currently shows ONLY in the menus: the CHARACTERS screen
// paints each pilot's authored 32x32 idle bust (src/art/portraits.js, via
// main.js paintCharPortraits/renderCharSelector) and the title header paints
// the equipped pilot's bust (main.js paintTitleHeader). In-run, render.js
// paints the SAME generic PLAYER_SPRITE / PLAYER_SPRITE_WALK for every pilot
// (render.js player branch), so the four kits are indistinguishable on the
// field. This module authors one 2-frame look per pilot in the SAME 12x12
// box, and render.js picks the equipped pilot's frames through
// characterSpriteFor — the generic pair stays as the fallback (unknown /
// unset character id), never a pilot's look.
//
// ART-DIRECTION NUMBERS (style guidance only):
//   * 32px grid: every sprite is 12x12, the PLAYER_SPRITE box — painted 1:1
//     through drawGrid: integer scaling, no smoothing. Geometry, hitbox and
//     cull margins are byte-identical to before (the render seam keeps the
//     same -6 anchor offset and the same w/h-agnostic box paint).
//   * Palette budget: each sprite uses 4-5 keys (1..9, 0 = transparent), the
//     same convention as src/sprites.js; hues follow the pilot's menu bust
//     (steel Knight, violet Witch, green Rogue, gold Paladin) so the field
//     sprite reads as the SAME pilot, only smaller.
//   * Animation policy: two frames each — frame A idle, frame B the walk
//     step — the SAME moved-gate rule render.js already uses (B only while
//     actually moving, ~6/s sim-clock pace), so frames are deterministic per
//     sim state, never wall-clock (the slice (a) contract). Only the two leg
//     rows differ between frames, exactly like PLAYER_SPRITE vs
//     PLAYER_SPRITE_WALK.
//
// THE FOUR LOOKS (role -> what the grid shows):
//   * KNIGHT   the starter, a melee brawler. Steel helm with a red crest
//     ridge, bright pauldrons, crest-cross tabard.
//   * WITCH    the chain-lightning caster, frail. Violet robe, amber clasp,
//     shadowed eyes under the hood brim.
//   * ROGUE    the knife thrower, a skirmisher. Green hood, sand scarf wrap,
//     dark leathers.
//   * PALADIN  the cross bearer, a support with more health. Gold helm,
//     white-gold plate, gold cross down the chest.
// The menu busts (src/art/portraits.js CHARACTER_PORTRAITS) are drawn from
// the 16x16 pilots below: same colours, same gear. intro.js
// keeps its adapted PLAYER_SPRITE copy (slice-b boss-chain precedent). No balance/combat/economy
// number lives here (visual-only slice).

// ---- KNIGHT (12x12, 2 frames: idle / walk-step) -----------------------------
// Frame B splays only the leg rows (10-11); rows 0-9 are identical.
const KNIGHT_A = [
  [0,0,0,4,5,5,5,5,4,0,0,0],
  [0,0,4,3,3,5,5,3,3,4,0,0],
  [0,0,4,3,1,1,1,1,3,4,0,0],
  [0,0,4,3,1,4,4,1,3,4,0,0],
  [0,0,0,4,3,1,1,3,4,0,0,0],
  [0,0,0,4,3,2,2,3,4,0,0,0],
  [0,0,0,4,3,2,2,3,4,0,0,0],
  [0,0,3,3,2,2,2,2,3,3,0,0],
  [0,3,3,2,2,5,5,2,2,3,3,0],
  [0,3,2,2,2,5,5,2,2,2,3,0],
  [0,0,3,2,2,0,0,2,2,3,0,0],
  [0,0,0,4,4,0,0,4,4,0,0,0],
];
const KNIGHT_B = [
  [0,0,0,4,5,5,5,5,4,0,0,0],
  [0,0,4,3,3,5,5,3,3,4,0,0],
  [0,0,4,3,1,1,1,1,3,4,0,0],
  [0,0,4,3,1,4,4,1,3,4,0,0],
  [0,0,0,4,3,1,1,3,4,0,0,0],
  [0,0,0,4,3,2,2,3,4,0,0,0],
  [0,0,0,4,3,2,2,3,4,0,0,0],
  [0,0,3,3,2,2,2,2,3,3,0,0],
  [0,3,3,2,2,5,5,2,2,3,3,0],
  [0,3,2,2,2,5,5,2,2,2,3,0],
  [0,3,2,2,0,0,0,0,2,2,3,0],
  [0,0,4,4,0,0,0,0,4,4,0,0],
];
const KNIGHT_PALETTE = {
  1: '#cc9a78',  // skin (the bust's face tone)
  2: '#b4c4dc',  // steel plate
  3: '#e4e2ea',  // bright steel (pauldrons, helm light)
  4: '#304464',  // dark steel (eyeslit, greaves)
  5: '#b83a4e',  // crest red (ridge + tabard cross)
};

// ---- WITCH (12x12, 2 frames: idle / walk-step) -------------------------------
const WITCH_A = [
  [0,0,0,0,2,2,2,2,0,0,0,0],
  [0,0,0,2,2,2,2,2,2,0,0,0],
  [0,0,2,2,2,2,2,2,2,2,0,0],
  [0,0,4,4,1,1,1,1,4,4,0,0],
  [0,0,0,4,1,4,4,1,4,0,0,0],
  [0,0,0,4,3,1,1,3,4,0,0,0],
  [0,0,0,4,3,2,2,3,4,0,0,0],
  [0,0,3,3,2,5,5,2,3,3,0,0],
  [0,3,3,2,2,5,5,2,2,3,3,0],
  [0,3,2,2,2,2,2,2,2,2,3,0],
  [0,0,3,2,2,0,0,2,2,3,0,0],
  [0,0,0,4,4,0,0,4,4,0,0,0],
];
const WITCH_B = [
  [0,0,0,0,2,2,2,2,0,0,0,0],
  [0,0,0,2,2,2,2,2,2,0,0,0],
  [0,0,2,2,2,2,2,2,2,2,0,0],
  [0,0,4,4,1,1,1,1,4,4,0,0],
  [0,0,0,4,1,4,4,1,4,0,0,0],
  [0,0,0,4,3,1,1,3,4,0,0,0],
  [0,0,0,4,3,2,2,3,4,0,0,0],
  [0,0,3,3,2,5,5,2,3,3,0,0],
  [0,3,3,2,2,5,5,2,2,3,3,0],
  [0,3,2,2,2,2,2,2,2,2,3,0],
  [0,3,2,2,0,0,0,0,2,2,3,0],
  [0,0,4,4,0,0,0,0,4,4,0,0],
];
const WITCH_PALETTE = {
  1: '#cc9a78',  // pale caster skin
  2: '#b49ad4',  // violet robe
  3: '#e4e2ea',  // robe light (sleeves, hem)
  4: '#160e24',  // shadow (hair, eyes, hem)
  5: '#e2aa38',  // amber clasp
};

// ---- ROGUE (12x12, 2 frames: idle / walk-step) -------------------------------
const ROGUE_A = [
  [0,0,0,2,2,2,2,2,2,0,0,0],
  [0,0,2,2,3,3,3,3,2,2,0,0],
  [0,0,2,3,1,1,1,1,3,2,0,0],
  [0,0,2,3,1,4,4,1,3,2,0,0],
  [0,0,0,2,3,1,1,3,2,0,0,0],
  [0,0,0,2,5,5,5,5,2,0,0,0],
  [0,0,0,2,5,4,4,5,2,0,0,0],
  [0,0,3,3,4,4,4,4,3,3,0,0],
  [0,3,3,4,4,5,5,4,4,3,3,0],
  [0,3,4,4,4,4,4,4,4,4,3,0],
  [0,0,3,4,4,0,0,4,4,3,0,0],
  [0,0,0,4,4,0,0,4,4,0,0,0],
];
const ROGUE_B = [
  [0,0,0,2,2,2,2,2,2,0,0,0],
  [0,0,2,2,3,3,3,3,2,2,0,0],
  [0,0,2,3,1,1,1,1,3,2,0,0],
  [0,0,2,3,1,4,4,1,3,2,0,0],
  [0,0,0,2,3,1,1,3,2,0,0,0],
  [0,0,0,2,5,5,5,5,2,0,0,0],
  [0,0,0,2,5,4,4,5,2,0,0,0],
  [0,0,3,3,4,4,4,4,3,3,0,0],
  [0,3,3,4,4,5,5,4,4,3,3,0],
  [0,3,4,4,4,4,4,4,4,4,3,0],
  [0,3,4,4,0,0,0,0,4,4,3,0],
  [0,0,4,4,0,0,0,0,4,4,0,0],
];
const ROGUE_PALETTE = {
  1: '#cc9a78',  // skin (the bust's face tone)
  2: '#86a062',  // hood green
  3: '#acc084',  // hood light
  4: '#46663a',  // olive leathers (shadow, boots)
  5: '#e2aa38',  // sand scarf + buckle
};

// ---- PALADIN (12x12, 2 frames: idle / walk-step) -----------------------------
const PALADIN_A = [
  [0,0,0,2,3,3,3,3,2,0,0,0],
  [0,0,2,3,5,5,5,5,3,2,0,0],
  [0,0,2,5,1,1,1,1,5,2,0,0],
  [0,0,2,5,1,4,4,1,5,2,0,0],
  [0,0,0,2,5,1,1,5,2,0,0,0],
  [0,0,0,2,3,5,5,3,2,0,0,0],
  [0,0,0,2,3,5,5,3,2,0,0,0],
  [0,0,3,3,5,2,2,5,3,3,0,0],
  [0,3,3,5,5,2,2,5,5,3,3,0],
  [0,3,5,5,5,2,2,5,5,5,3,0],
  [0,0,3,5,5,0,0,5,5,3,0,0],
  [0,0,0,4,4,0,0,4,4,0,0,0],
];
const PALADIN_B = [
  [0,0,0,2,3,3,3,3,2,0,0,0],
  [0,0,2,3,5,5,5,5,3,2,0,0],
  [0,0,2,5,1,1,1,1,5,2,0,0],
  [0,0,2,5,1,4,4,1,5,2,0,0],
  [0,0,0,2,5,1,1,5,2,0,0,0],
  [0,0,0,2,3,5,5,3,2,0,0,0],
  [0,0,0,2,3,5,5,3,2,0,0,0],
  [0,0,3,3,5,2,2,5,3,3,0,0],
  [0,3,3,5,5,2,2,5,5,3,3,0],
  [0,3,5,5,5,2,2,5,5,5,3,0],
  [0,3,5,5,0,0,0,0,5,5,3,0],
  [0,0,4,4,0,0,0,0,4,4,0,0],
];
const PALADIN_PALETTE = {
  1: '#cc9a78',  // skin (the bust's face tone)
  2: '#e2aa38',  // blessed gold
  3: '#f0c860',  // gold light (helm, pauldrons)
  4: '#523208',  // dark gold (eyeslit, boots)
  5: '#f8e098',  // white plate
};


// ---- 16x16 pilots (October 2026 redraw): a clear head, shoulders, arms,
// body and legs, each holding their weapon. Frame A stands; B and C are the
// two steps of the walk (body bobs a pixel, one knee lifts).
const KNIGHT_A16 = [
  [0,0,0,0,0,0,5,5,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,5,5,5,5,0,0,0,0,0,0,0],
  [0,0,0,0,3,3,2,2,3,4,0,0,0,0,0,0],
  [0,0,0,3,3,2,2,2,2,2,3,4,0,0,0,0],
  [0,0,0,3,3,4,4,4,4,3,3,4,0,0,8,0],
  [0,0,0,3,3,1,1,1,1,1,3,4,0,0,8,0],
  [0,0,0,0,3,3,1,1,1,3,4,0,0,0,8,0],
  [0,0,3,2,2,2,3,3,3,2,2,4,0,0,8,0],
  [0,3,2,3,5,5,6,5,5,3,2,4,0,7,7,7],
  [0,3,3,2,5,6,6,6,5,2,3,4,1,1,0,0],
  [0,0,3,3,5,5,6,5,5,3,4,0,0,0,0,0],
  [0,0,0,3,5,5,6,5,5,4,0,0,0,0,0,0],
  [0,0,0,3,3,3,3,3,3,4,0,0,0,0,0,0],
  [0,0,0,3,3,0,4,0,3,4,0,0,0,0,0,0],
  [0,0,0,3,3,0,0,0,3,4,0,0,0,0,0,0],
  [0,0,7,7,7,0,0,0,7,7,7,0,0,0,0,0],
];
const KNIGHT_B16 = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,5,5,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,5,5,5,5,0,0,0,0,0,0,0],
  [0,0,0,0,3,3,2,2,3,4,0,0,0,0,0,0],
  [0,0,0,3,3,2,2,2,2,2,3,4,0,0,0,0],
  [0,0,0,3,3,4,4,4,4,3,3,4,0,0,8,0],
  [0,0,0,3,3,1,1,1,1,1,3,4,0,0,8,0],
  [0,0,0,0,3,3,1,1,1,3,4,0,0,0,8,0],
  [0,0,3,2,2,2,3,3,3,2,2,4,0,0,8,0],
  [0,3,2,3,5,5,6,5,5,3,2,4,0,7,7,7],
  [0,3,3,2,5,6,6,6,5,2,3,4,1,1,0,0],
  [0,0,3,3,5,5,6,5,5,3,4,0,0,0,0,0],
  [0,0,0,3,5,5,6,5,5,4,0,0,0,0,0,0],
  [0,0,0,3,3,3,3,3,3,4,0,0,0,0,0,0],
  [0,0,7,7,7,0,0,0,3,4,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,7,7,7,0,0,0,0,0],
];
const KNIGHT_C16 = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,5,5,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,5,5,5,5,0,0,0,0,0,0,0],
  [0,0,0,0,3,3,2,2,3,4,0,0,0,0,0,0],
  [0,0,0,3,3,2,2,2,2,2,3,4,0,0,0,0],
  [0,0,0,3,3,4,4,4,4,3,3,4,0,0,8,0],
  [0,0,0,3,3,1,1,1,1,1,3,4,0,0,8,0],
  [0,0,0,0,3,3,1,1,1,3,4,0,0,0,8,0],
  [0,0,3,2,2,2,3,3,3,2,2,4,0,0,8,0],
  [0,3,2,3,5,5,6,5,5,3,2,4,0,7,7,7],
  [0,3,3,2,5,6,6,6,5,2,3,4,1,1,0,0],
  [0,0,3,3,5,5,6,5,5,3,4,0,0,0,0,0],
  [0,0,0,3,5,5,6,5,5,4,0,0,0,0,0,0],
  [0,0,0,3,3,3,3,3,3,4,0,0,0,0,0,0],
  [0,0,0,3,3,0,0,0,7,7,7,0,0,0,0,0],
  [0,0,7,7,7,0,0,0,0,0,0,0,0,0,0,0],
];
const KNIGHT_PALETTE16 = { 1: '#cc9a78', 2: '#a8d0f4', 3: '#b4c4dc', 4: '#433e4e', 5: '#b83a4e', 6: '#e2aa38', 7: '#4e3f2a', 8: '#ffffff' };
const WITCH_A16 = [
  [0,0,0,0,0,0,0,4,2,0,0,0,0,0,7,0],
  [0,0,0,0,0,0,4,2,2,4,0,0,0,7,7,7],
  [0,0,0,0,0,4,2,3,2,4,0,0,0,0,6,0],
  [0,0,0,0,4,2,3,2,2,2,4,0,0,0,6,0],
  [0,0,4,4,2,2,2,2,2,2,2,4,4,0,6,0],
  [0,0,0,4,2,1,1,1,1,1,2,4,0,0,6,0],
  [0,0,0,0,4,1,8,1,8,1,4,0,0,0,6,0],
  [0,0,0,0,4,2,1,1,1,2,4,0,0,1,6,0],
  [0,0,0,4,2,2,2,5,2,2,2,4,0,4,6,0],
  [0,0,4,2,3,2,2,5,2,2,3,2,4,2,6,0],
  [0,0,4,2,3,2,2,2,2,2,3,2,4,0,6,0],
  [0,0,4,2,2,3,2,2,2,3,2,2,4,0,6,0],
  [0,0,4,2,2,2,2,2,2,2,2,2,4,0,0,0],
  [0,0,0,4,2,2,2,2,2,2,2,4,0,0,0,0],
  [0,0,0,0,4,4,0,0,0,4,4,0,0,0,0,0],
  [0,0,0,0,8,8,0,0,0,8,8,0,0,0,0,0],
];
const WITCH_B16 = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,4,2,0,0,0,0,0,7,0],
  [0,0,0,0,0,0,4,2,2,4,0,0,0,7,7,7],
  [0,0,0,0,0,4,2,3,2,4,0,0,0,0,6,0],
  [0,0,0,0,4,2,3,2,2,2,4,0,0,0,6,0],
  [0,0,4,4,2,2,2,2,2,2,2,4,4,0,6,0],
  [0,0,0,4,2,1,1,1,1,1,2,4,0,0,6,0],
  [0,0,0,0,4,1,8,1,8,1,4,0,0,0,6,0],
  [0,0,0,0,4,2,1,1,1,2,4,0,0,1,6,0],
  [0,0,0,4,2,2,2,5,2,2,2,4,0,4,6,0],
  [0,0,4,2,3,2,2,5,2,2,3,2,4,2,6,0],
  [0,0,4,2,3,2,2,2,2,2,3,2,4,0,6,0],
  [0,0,4,2,2,3,2,2,2,3,2,2,4,0,6,0],
  [0,0,4,2,2,2,2,2,2,2,2,2,4,0,0,0],
  [0,0,0,0,8,8,0,0,0,4,4,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,8,8,0,0,0,0,0],
];
const WITCH_C16 = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,4,2,0,0,0,0,0,7,0],
  [0,0,0,0,0,0,4,2,2,4,0,0,0,7,7,7],
  [0,0,0,0,0,4,2,3,2,4,0,0,0,0,6,0],
  [0,0,0,0,4,2,3,2,2,2,4,0,0,0,6,0],
  [0,0,4,4,2,2,2,2,2,2,2,4,4,0,6,0],
  [0,0,0,4,2,1,1,1,1,1,2,4,0,0,6,0],
  [0,0,0,0,4,1,8,1,8,1,4,0,0,0,6,0],
  [0,0,0,0,4,2,1,1,1,2,4,0,0,1,6,0],
  [0,0,0,4,2,2,2,5,2,2,2,4,0,4,6,0],
  [0,0,4,2,3,2,2,5,2,2,3,2,4,2,6,0],
  [0,0,4,2,3,2,2,2,2,2,3,2,4,0,6,0],
  [0,0,4,2,2,3,2,2,2,3,2,2,4,0,6,0],
  [0,0,4,2,2,2,2,2,2,2,2,2,4,0,0,0],
  [0,0,0,0,4,4,0,0,0,8,8,0,0,0,0,0],
  [0,0,0,0,8,8,0,0,0,0,0,0,0,0,0,0],
];
const WITCH_PALETTE16 = { 1: '#cc9a78', 2: '#b49ad4', 3: '#ece0c0', 4: '#160e24', 5: '#e2aa38', 6: '#887352', 7: '#a8d0f4', 8: '#3a2654' };
const ROGUE_A16 = [
  [0,0,0,0,0,4,2,2,4,0,0,0,0,0,0,0],
  [0,0,0,0,4,2,3,3,2,4,0,0,0,0,0,0],
  [0,0,0,4,2,3,2,2,2,2,4,0,0,0,0,0],
  [0,0,0,4,2,4,1,1,1,4,2,4,0,0,0,0],
  [0,0,0,4,2,1,8,1,8,1,2,4,0,0,0,0],
  [0,0,0,4,2,5,5,5,5,5,2,4,0,0,0,0],
  [0,0,0,0,4,5,5,5,5,5,4,0,0,0,0,0],
  [0,0,0,4,2,2,6,6,2,2,4,0,0,0,0,0],
  [0,0,4,2,3,2,6,6,6,2,3,2,4,0,0,0],
  [0,7,0,1,2,6,6,5,6,6,6,2,1,0,7,0],
  [0,7,4,2,2,6,6,6,6,6,2,2,4,7,0,0],
  [0,0,4,2,2,6,6,5,6,6,2,2,4,0,0,0],
  [0,0,0,4,2,6,6,6,6,6,2,4,0,0,0,0],
  [0,0,0,4,6,6,0,4,0,6,6,4,0,0,0,0],
  [0,0,0,4,6,0,0,0,0,6,4,0,0,0,0,0],
  [0,0,8,8,8,0,0,0,0,8,8,8,0,0,0,0],
];
const ROGUE_B16 = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,4,2,2,4,0,0,0,0,0,0,0],
  [0,0,0,0,4,2,3,3,2,4,0,0,0,0,0,0],
  [0,0,0,4,2,3,2,2,2,2,4,0,0,0,0,0],
  [0,0,0,4,2,4,1,1,1,4,2,4,0,0,0,0],
  [0,0,0,4,2,1,8,1,8,1,2,4,0,0,0,0],
  [0,0,0,4,2,5,5,5,5,5,2,4,0,0,0,0],
  [0,0,0,0,4,5,5,5,5,5,4,0,0,0,0,0],
  [0,0,0,4,2,2,6,6,2,2,4,0,0,0,0,0],
  [0,0,4,2,3,2,6,6,6,2,3,2,4,0,0,0],
  [0,7,0,1,2,6,6,5,6,6,6,2,1,0,7,0],
  [0,7,4,2,2,6,6,6,6,6,2,2,4,7,0,0],
  [0,0,4,2,2,6,6,5,6,6,2,2,4,0,0,0],
  [0,0,0,4,2,6,6,6,6,6,2,4,0,0,0,0],
  [0,0,8,8,8,0,0,0,0,6,4,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,8,8,8,0,0,0,0],
];
const ROGUE_C16 = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,4,2,2,4,0,0,0,0,0,0,0],
  [0,0,0,0,4,2,3,3,2,4,0,0,0,0,0,0],
  [0,0,0,4,2,3,2,2,2,2,4,0,0,0,0,0],
  [0,0,0,4,2,4,1,1,1,4,2,4,0,0,0,0],
  [0,0,0,4,2,1,8,1,8,1,2,4,0,0,0,0],
  [0,0,0,4,2,5,5,5,5,5,2,4,0,0,0,0],
  [0,0,0,0,4,5,5,5,5,5,4,0,0,0,0,0],
  [0,0,0,4,2,2,6,6,2,2,4,0,0,0,0,0],
  [0,0,4,2,3,2,6,6,6,2,3,2,4,0,0,0],
  [0,7,0,1,2,6,6,5,6,6,6,2,1,0,7,0],
  [0,7,4,2,2,6,6,6,6,6,2,2,4,7,0,0],
  [0,0,4,2,2,6,6,5,6,6,2,2,4,0,0,0],
  [0,0,0,4,2,6,6,6,6,6,2,4,0,0,0,0],
  [0,0,0,4,6,0,0,0,0,8,8,8,0,0,0,0],
  [0,0,8,8,8,0,0,0,0,0,0,0,0,0,0,0],
];
const ROGUE_PALETTE16 = { 1: '#cc9a78', 2: '#86a062', 3: '#acc084', 4: '#2e4a2c', 5: '#887352', 6: '#4e3f2a', 7: '#e4e2ea', 8: '#1e3220' };
const PALADIN_A16 = [
  [0,0,3,0,0,0,2,2,0,0,0,3,0,0,0,0],
  [0,0,3,3,0,2,2,2,6,0,3,3,0,0,0,0],
  [0,0,0,3,2,2,3,3,2,6,3,0,0,0,0,0],
  [0,0,0,2,2,3,3,3,3,2,6,0,0,0,0,0],
  [0,0,0,2,2,7,7,7,7,2,6,0,0,9,9,9],
  [0,0,0,2,2,1,1,1,1,2,6,0,0,9,9,9],
  [0,0,0,0,2,2,1,1,2,6,0,0,0,0,8,0],
  [0,0,2,3,4,4,4,4,4,4,3,6,0,0,8,0],
  [0,2,3,4,4,4,2,2,4,4,4,3,6,0,8,0],
  [0,2,5,4,4,2,2,2,2,4,4,5,6,1,8,0],
  [0,0,2,5,4,4,2,2,4,4,5,6,0,0,0,0],
  [0,0,0,2,4,4,2,2,4,4,6,0,0,0,0,0],
  [0,0,0,2,5,5,5,5,5,5,6,0,0,0,0,0],
  [0,0,0,2,5,5,0,5,5,6,0,0,0,0,0,0],
  [0,0,0,2,5,5,0,0,0,5,5,6,0,0,0,0],
  [0,0,8,8,8,8,0,0,0,8,8,8,8,0,0,0],
];
const PALADIN_B16 = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,3,0,0,0,2,2,0,0,0,3,0,0,0,0],
  [0,0,3,3,0,2,2,2,6,0,3,3,0,0,0,0],
  [0,0,0,3,2,2,3,3,2,6,3,0,0,0,0,0],
  [0,0,0,2,2,3,3,3,3,2,6,0,0,0,0,0],
  [0,0,0,2,2,7,7,7,7,2,6,0,0,9,9,9],
  [0,0,0,2,2,1,1,1,1,2,6,0,0,9,9,9],
  [0,0,0,0,2,2,1,1,2,6,0,0,0,0,8,0],
  [0,0,2,3,4,4,4,4,4,4,3,6,0,0,8,0],
  [0,2,3,4,4,4,2,2,4,4,4,3,6,0,8,0],
  [0,2,5,4,4,2,2,2,2,4,4,5,6,1,8,0],
  [0,0,2,5,4,4,2,2,4,4,5,6,0,0,0,0],
  [0,0,0,2,4,4,2,2,4,4,6,0,0,0,0,0],
  [0,0,0,2,5,5,5,5,5,5,6,0,0,0,0,0],
  [0,0,8,8,8,8,0,0,0,5,5,2,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,8,8,8,8,0,0,0],
];
const PALADIN_C16 = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,3,0,0,0,2,2,0,0,0,3,0,0,0,0],
  [0,0,3,3,0,2,2,2,6,0,3,3,0,0,0,0],
  [0,0,0,3,2,2,3,3,2,6,3,0,0,0,0,0],
  [0,0,0,2,2,3,3,3,3,2,6,0,0,0,0,0],
  [0,0,0,2,2,7,7,7,7,2,6,0,0,9,9,9],
  [0,0,0,2,2,1,1,1,1,2,6,0,0,9,9,9],
  [0,0,0,0,2,2,1,1,2,6,0,0,0,0,8,0],
  [0,0,2,3,4,4,4,4,4,4,3,6,0,0,8,0],
  [0,2,3,4,4,4,2,2,4,4,4,3,6,0,8,0],
  [0,2,5,4,4,2,2,2,2,4,4,5,6,1,8,0],
  [0,0,2,5,4,4,2,2,4,4,5,6,0,0,0,0],
  [0,0,0,2,4,4,2,2,4,4,6,0,0,0,0,0],
  [0,0,0,2,5,5,5,5,5,5,6,6,0,0,0,0],
  [0,0,0,2,5,5,0,0,0,8,8,8,8,0,0,0],
  [0,0,8,8,8,8,0,0,0,0,0,0,0,0,0,0],
];
const PALADIN_PALETTE16 = { 1: '#cc9a78', 2: '#e2aa38', 3: '#ece0c0', 4: '#b4c4dc', 5: '#a46a16', 6: '#523208', 7: '#1e1810', 8: '#7a4c0e', 9: '#b4c4dc' };

function makeCharacterSprite(id, name, blurb, frames, palette) {
  return {
    id, name, blurb, frames, palette,
    frameCount: frames.length,
    w: frames[0][0].length, h: frames[0].length,
    anchor: { x: Math.floor(frames[0][0].length / 2), y: Math.floor(frames[0].length / 2) },
    box: { w: frames[0][0].length, h: frames[0].length },
  };
}

export const CHARACTER_SPRITES = {
  KNIGHT: makeCharacterSprite('KNIGHT', 'knight pilot',
    'steel helm and crest-cross tabard for the sturdy starter', [KNIGHT_A16, KNIGHT_B16, KNIGHT_C16], KNIGHT_PALETTE16),
  WITCH: makeCharacterSprite('WITCH', 'witch pilot',
    'violet robe and amber clasp for the frail caster', [WITCH_A16, WITCH_B16, WITCH_C16], WITCH_PALETTE16),
  ROGUE: makeCharacterSprite('ROGUE', 'rogue pilot',
    'green hood and sand scarf for the fast thief', [ROGUE_A16, ROGUE_B16, ROGUE_C16], ROGUE_PALETTE16),
  PALADIN: makeCharacterSprite('PALADIN', 'paladin pilot',
    'gold helm and white plate for the blessed support', [PALADIN_A16, PALADIN_B16, PALADIN_C16], PALADIN_PALETTE16),
};

export const CHARACTER_SPRITE_IDS = Object.keys(CHARACTER_SPRITES);

// characterSpriteFor(characterId) -> sprite object or null. Pure, total, never
// throws: an unknown / unset id returns null (the renderer keeps the generic
// PLAYER_SPRITE fallback), so a missing pilot entry reads as a NAMED test
// failure, not a crash.
export function characterSpriteFor(characterId) {
  return Object.prototype.hasOwnProperty.call(CHARACTER_SPRITES, characterId)
    ? CHARACTER_SPRITES[characterId]
    : null;
}

// Deterministic frame picker: floor(age*6) % frameCount — the SAME 6/s pace
// the render.js player branch paints with (stationary reads frame 0, the
// idle; moving steps), so the phase is a pure function of sim time: identical
// at 60Hz and 120Hz, never the wall clock.
export function characterSpriteFrame(sprite, age) {
  if (!sprite || !sprite.frames || !sprite.frames.length) return 0;
  const a = Number(age) || 0;
  return Math.floor(a * 6) % sprite.frames.length;
}
