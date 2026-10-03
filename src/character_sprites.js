// HORDES — per-character in-run sprites (PORT SLICE C: original art for the
// EXISTING four pilots).
//
// WHAT THIS FILE IS
// Four ORIGINAL hand-authored 12x12 pixel sprites — one per meta.js
// CHARACTERS id (KNIGHT, WITCH, ROGUE, PALADIN) — plus the ONE roster-wide
// lookup the renderer and the tests share. They are CONCEPT ports only: the
// reference (docs/vs_port_ref/DESIGN_REFERENCE_VS.md, section 4) names the
// ROLES — starter brawler, chain-lightning witch, knife thief, cross-bearing
// support — and every grid below was drawn fresh for HORDES. No VS pixels,
// palettes, or traced silhouettes appear here (RED LINE).
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
// ART-DIRECTION NUMBERS (reference section 1, style guidance only):
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
// REFERENCE DERIVATION (doc section 4 roles -> hordes pilot):
//   * KNIGHT   <- ANTONIO (starter hero, melee brawler stance, free). Steel
//     helm with a red crest ridge, bright pauldrons, crest-cross tabard.
//   * WITCH    <- PORTA (LIGHTNING start, the chain-lightning witch) +
//     IMELDA (MAGIC_MISSILE start, the frail caster). Violet robe, amber
//     clasp, shadowed eyes under the hood brim.
//   * ROGUE    <- GENNARO (KNIFE start, the projectile thief) + PUGNALA
//     (GUNS skirmisher). Green hood, sand scarf wrap, dark leathers.
//   * PALADIN  <- GERMANA (HOLYWATER + max-HP support role, Clerici) +
//     CROCI (CROSS start, the cross bearer). Gold helm, white-gold plate,
//     gold cross down the chest.
// The menu busts (src/art/portraits.js CHARACTER_PORTRAITS) are drawn from
// the 16x16 pilots below: same colours, same gear. intro.js / portal_cine.js
// keep their adapted PLAYER_SPRITE copies (slice-b boss-chain precedent). No balance/combat/economy
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
  1: '#e8b890',  // skin (the bust's face tone)
  2: '#8a93ad',  // steel plate
  3: '#d5dbe8',  // bright steel (pauldrons, helm light)
  4: '#3a3f52',  // dark steel (eyeslit, greaves)
  5: '#c03038',  // crest red (ridge + tabard cross)
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
  1: '#e8c8e0',  // pale caster skin
  2: '#a070f0',  // violet robe
  3: '#d0b0ff',  // robe light (sleeves, hem)
  4: '#3a2452',  // shadow (hair, eyes, hem)
  5: '#ffb63c',  // amber clasp
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
  1: '#e8c890',  // skin (the bust's face tone)
  2: '#2fa85a',  // hood green
  3: '#8ff0a0',  // hood light
  4: '#6a9a4a',  // olive leathers (shadow, boots)
  5: '#d8b060',  // sand scarf + buckle
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
  1: '#f0d0a8',  // skin (the bust's face tone)
  2: '#c89a2a',  // blessed gold
  3: '#ffe07a',  // gold light (helm, pauldrons)
  4: '#5a3f14',  // dark gold (eyeslit, boots)
  5: '#f4f0e4',  // white plate
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
const KNIGHT_PALETTE16 = { 1: '#f2c9a0', 2: '#dfe6ef', 3: '#8e9bad', 4: '#454e5e', 5: '#d8403a', 6: '#ffd24a', 7: '#5b3a24', 8: '#f4fbff' };
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
const WITCH_PALETTE16 = { 1: '#f0d2b8', 2: '#a276f4', 3: '#d2b6ff', 4: '#2e1f52', 5: '#ffb347', 6: '#c9a06a', 7: '#aef6ff', 8: '#1a1030' };
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
const ROGUE_PALETTE16 = { 1: '#e8c09a', 2: '#3f9a4c', 3: '#7fd068', 4: '#173d1f', 5: '#d9c08a', 6: '#4a3426', 7: '#eef4ff', 8: '#101810' };
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
const PALADIN_PALETTE16 = { 1: '#f2cfa6', 2: '#e0aa2e', 3: '#ffe28a', 4: '#f6f2e6', 5: '#c9c2ae', 6: '#5a3f14', 7: '#2a1d08', 8: '#8a5a2a', 9: '#b8c2cc' };

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
