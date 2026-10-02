// HORDES — enemy sprite roster (PORT SLICE B: original art for the EXISTING roster).
//
// WHAT THIS FILE IS
// Two ORIGINAL hand-authored pixel sprites closing the roster gap, plus the
// ONE roster-wide lookup the renderer and the tests share. They are CONCEPT
// ports only: the reference (docs/vs_port_ref/DESIGN_REFERENCE_VS.md,
// section 3 + appendix A) names the ROLES — chaser swarm, fast chaser, tank
// frontliner, boss/elite gatekeeper, stationary elite, winged diver — and
// every grid below was drawn fresh for HORDES. No VS pixels, palettes, or
// traced silhouettes appear here (RED LINE).
//
// WHY ONLY TWO NEW GRIDS
// src/sprites.js already ships eight typed sprites (CHASER, SWARMER, BRUTE,
// SPITTER, WARLOCK, TICK, COLOSSUS, DASHER); src/bosses.js ships the four
// named-boss sprites; src/final_boss.js ships the maw. The two roster types
// with NO art — PILLAR (WAVE-20 herald turret) and SHRIKE (E2 flying heavy) —
// fell through to the render.js typed-shape fallback (resolveLook shapes).
// This module authors those two and re-exports the full ten-type map, so
// every ENEMY_TYPES id resolves to hand art and the fallback stays a
// fallback (unknown ids), never a roster member's look.
//
// ART-DIRECTION NUMBERS (reference section 1, style guidance only):
//   * 32px grid: PILLAR is 12x16 (tall turret, the PILLAR LOOK tall shape),
//     SHRIKE is 14x10 (wide diver, the SHRIKE LOOK wide shape) — both painted
//     1:1 through drawGrid: integer scaling, no smoothing.
//   * Palette budget: each sprite uses 4-5 keys (1..9, 0 = transparent), the
//     same convention as src/sprites.js; hues stay on the type's existing
//     LOOK identity (stone/ember for PILLAR, storm-blue for SHRIKE) so the
//     sprites read as the SAME enemies, only sharper.
//   * Animation policy: two walk frames each, frame chosen by
//     enemySpriteFrame(sprite, age) = floor(age*6) % frameCount — the SAME
//     age-phase rule render.js already uses (floor((e.age||0)*6) % len), so
//     frames are deterministic per entity, never wall-clock (the slice (a)
//     contract). PILLAR's pair throbs its rune eye (it never walks — it is
//     stationary by speedMult 0); SHRIKE's pair beats its wings (up/down).
//
// REFERENCE DERIVATION (doc section 3 roles -> hordes type):
//   * PILLAR  <- EX_BATDRAKELET_STATIONARY (spd10 stationary elite,
//     boss/elite gatekeeper role) + the sturdy-prop solidity concept
//     (section 6 CART maxHp=4). A planted runic obelisk: cap stone, ember
//     eye band, tapered column, stepped base. Static by design.
//   * SHRIKE  <- BOSS_HARPY (winged boss/elite gatekeeper) + BAT1-6 wing
//     vocabulary (chaser-swarm bat rows) + ANGEL1-3 winged-frontliner mass.
//     A swept-wing diver: horned head, pale eye slits, broad wings that beat
//     between the two frames, forked tail.
// Elites keep the EXISTING gold-outline presentation (render.js elite branch
// + ELITE_LOOK); bosses keep BOSS_SPRITES / BOSS_SPRITE / FINAL_BOSS_SPRITE
// (bosses.js / sprites.js / final_boss.js) — this slice changes no boss art,
// it only documents the presentation chain. No balance/combat/economy number
// lives here (visual-only slice).

import { SPRITES, spriteBox } from './sprites.js';

// ---- PILLAR (12x16, 2 frames: rune eye hot / banked) ------------------------
// Frame B swaps the eye cells (4 hot -> 3 ember) and the lower rune band
// (3 -> 4): the obelisk throbs instead of walking.
const PILLAR_A = [
  [0,0,0,0,1,1,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,0,0,0],
  [0,0,0,1,2,2,2,2,1,0,0,0],
  [0,0,0,1,2,4,4,2,1,0,0,0],
  [0,0,0,1,2,4,4,2,1,0,0,0],
  [0,0,0,1,2,2,2,2,1,0,0,0],
  [0,0,0,1,1,3,3,1,1,0,0,0],
  [0,0,0,1,2,1,1,2,1,0,0,0],
  [0,0,0,1,2,1,1,2,1,0,0,0],
  [0,0,0,1,2,3,3,2,1,0,0,0],
  [0,0,0,1,2,1,1,2,1,0,0,0],
  [0,0,0,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,0,0],
  [0,0,1,2,2,2,2,2,2,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,0],
  [0,5,5,5,5,5,5,5,5,5,5,0],
];
const PILLAR_B = [
  [0,0,0,0,1,1,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,0,0,0],
  [0,0,0,1,2,2,2,2,1,0,0,0],
  [0,0,0,1,2,3,3,2,1,0,0,0],
  [0,0,0,1,2,3,3,2,1,0,0,0],
  [0,0,0,1,2,2,2,2,1,0,0,0],
  [0,0,0,1,1,3,3,1,1,0,0,0],
  [0,0,0,1,2,1,1,2,1,0,0,0],
  [0,0,0,1,2,1,1,2,1,0,0,0],
  [0,0,0,1,2,4,4,2,1,0,0,0],
  [0,0,0,1,2,1,1,2,1,0,0,0],
  [0,0,0,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,0,0],
  [0,0,1,2,2,2,2,2,2,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,0],
  [0,5,5,5,5,5,5,5,5,5,5,0],
];
const PILLAR_PALETTE = {
  1: '#a89a80',  // weathered stone (PILLAR LOOK body)
  2: '#6a5e4a',  // stone shadow (PILLAR LOOK trim)
  3: '#ff5a3c',  // ember rune (PILLAR LOOK accent)
  4: '#ffd75e',  // hot eye (elite-gold heat, turret only)
  5: '#241c18',  // socket shadow
};

// ---- SHRIKE (14x10, 2 frames: wings raised / lowered) -----------------------
const SHRIKE_A = [
  [0,2,0,0,0,0,0,0,0,0,0,0,2,0],
  [0,2,2,0,0,1,1,1,1,0,0,2,2,0],
  [0,0,2,2,1,1,1,1,1,1,2,2,0,0],
  [0,0,0,2,1,3,1,1,3,1,2,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,1,1,2,2,2,2,1,1,0,0,0],
  [0,0,1,1,0,2,1,1,2,0,1,1,0,0],
  [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,1,1,0,0,0,0],
  [0,0,0,0,0,4,0,0,4,0,0,0,0,0],
];
const SHRIKE_B = [
  [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,0,1,3,1,1,3,1,0,0,0,0],
  [0,0,2,2,1,1,1,1,1,1,2,2,0,0],
  [0,2,2,2,1,1,1,1,1,1,2,2,2,0],
  [2,2,0,2,1,2,2,2,2,1,2,0,2,2],
  [2,0,0,0,1,2,1,1,2,1,0,0,0,2],
  [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,1,1,0,0,0,0],
  [0,0,0,0,0,4,0,0,4,0,0,0,0,0],
];
const SHRIKE_PALETTE = {
  1: '#7888ff',  // storm body (SHRIKE LOOK body)
  2: '#34409a',  // deep trim (SHRIKE LOOK trim)
  3: '#d8ecff',  // pale eye slits (SHRIKE LOOK accent)
  4: '#a8b4ff',  // wing glints
};

function makeEnemySprite(id, name, blurb, frames, palette) {
  const box = spriteBox(frames[0]);
  return {
    id, name, blurb, frames, palette,
    frameCount: frames.length,
    w: box.w, h: box.h,
    anchor: { x: Math.floor(box.w / 2), y: Math.floor(box.h / 2) },
    box: { w: box.w, h: box.h },
  };
}

export const NEW_ENEMY_SPRITES = {
  PILLAR: makeEnemySprite('PILLAR', 'herald pillar',
    'a planted runic turret left by the herald', [PILLAR_A, PILLAR_B], PILLAR_PALETTE),
  SHRIKE: makeEnemySprite('SHRIKE', 'storm shrike',
    'a swept-wing diver that hunts from above', [SHRIKE_A, SHRIKE_B], SHRIKE_PALETTE),
};

// The FULL roster map: the eight legacy sprites.js entries plus the two new
// ones. Shape matches SPRITES entries ({ frames, palette, anchor, box } plus
// slice-b id/name/blurb on the new two), so render.js can use either source.
export const ENEMY_SPRITES = { ...SPRITES, ...NEW_ENEMY_SPRITES };

export const ENEMY_SPRITE_IDS = Object.keys(ENEMY_SPRITES);

// enemySpriteFor(typeId) -> sprite object or null. Pure, total, never throws:
// an unknown id returns null (the caller keeps the typed-shape fallback), so
// a missing roster entry reads as a NAMED test failure, not a crash.
export function enemySpriteFor(typeId) {
  return Object.prototype.hasOwnProperty.call(ENEMY_SPRITES, typeId)
    ? ENEMY_SPRITES[typeId]
    : null;
}

// Deterministic walk-frame picker: floor(age*6) % frameCount — the SAME rule
// render.js paints with (floor((e.age||0)*6) % spr.frames.length), so the art
// phase is a pure function of entity age: identical at 60Hz and 120Hz, never
// the wall clock.
export function enemySpriteFrame(sprite, age) {
  if (!sprite || !sprite.frames || !sprite.frames.length) return 0;
  const a = Number(age) || 0;
  return Math.floor(a * 6) % sprite.frames.length;
}
