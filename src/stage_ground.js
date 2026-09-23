// HORDES — stage ground/biome identity (PORT SLICE G: original art from VS design reference).
//
// WHAT THIS FILE IS
// Eight ORIGINAL hand-authored ground-motif specs, one per stage identity.
// They are CONCEPT ports only: the reference
// (docs/vs_port_ref/DESIGN_REFERENCE_VS.md, section 5 stage rows + section 13
// TILES + section 1 art-direction numbers, see per-motif rows below) names
// the ROLES — forest floor, chapel stone, shared filler reused across stages
// via palette swap, 32px autotile sets — and documents that no ground pixels
// were ever extracted to trace (section 14 GAPS covers the missing bundles;
// Appendix A.3's stage thumbs are packed 32px tileset atlases, not ground
// sprites). Every rect render.js paints for these motifs was composed fresh
// for HORDES.
//
// ART-DIRECTION NUMBERS (reference section 1, style guidance only):
//   * 32px grid: motifs anchor on a 64px tile (2x the decor CELL) and every
//     motif fits inside ~20px, painted 1:1 through fillRect — integer
//     scaling, no smoothing.
//   * Palette budget: motifs use ONLY the active wave theme's palette keys
//     (pal.tuft/tuft2/stone/stoneTop/crack/slab/base) — never a fixed color —
//     so the wave recolor beat survives: the STAGE sets the terrain character
//     (which cells + which geometry), the WAVE sets the color.
//   * Still life: no clock read anywhere — a motif repaints byte-identically
//     per (cell, seed, stage).
//
// WIRING: render.js drawGround consults stageGroundSpec(stage) for the
// overlay pass AFTER the shipped fine decor field — the fine field is
// untouched (same salts, same gates), so the wave-theme ladder and every
// landmark/building pin hold. No balance/combat/economy number lives here
// (visual-only slice).

// ---- motif specs -----------------------------------------------------------
// dens = chance an overlay tile carries the motif (all <= 0.30: texture, not
// carpet — the ground must stay quiet under the play pieces).
const SPECS = {
  // Reference: section 5 row FOREST (Mad Forest — ForestTexturePacked, the
  // wooded core stage) + section 13's "reuse via palette swap" filler note.
  // HORDES-native: moss bedding — a low slab blotch with tuft blades.
  VERDANT_HOLLOW: { motif: 'MOSS', dens: 0.24, blurb: 'moss bedding under the groves' },
  // Reference: section 5 row BONEZONE (The Bone Zone — BRAZIER scorch) +
  // section 13 row TP_Tileset_Refactor_1_Castle (gothic floor/wall motif).
  // HORDES-native: ember-cracked ash — a stepping fissure with a lit lip.
  ASHEN_WASTE: { motif: 'EMBER_CRACK', dens: 0.22, blurb: 'ember-cracked ash runs' },
  // Reference: section 5 row WHITEOUT (MoonspellTexturePacked, the snow
  // stage) + section 13's 32px autotile guidance. HORDES-native: wind-packed
  // drift streaks — three horizontal combed lines.
  SNOWFIELD: { motif: 'DRIFT_STREAK', dens: 0.22, blurb: 'wind-combed drift streaks' },
  // Reference: section 13 row TP_Tileset_Refactor_2_Chapel (chapel stone —
  // same pitch, different palette family) + section 5's bloodmoon BG art.
  // HORDES-native: rust veins — a branching dark vein with a lit edge.
  BLOOD_RUST: { motif: 'RUST_VEIN', dens: 0.24, blurb: 'branching rust veins' },
  // Reference: section 5 row BONEZONE + section 13 row
  // TP_Tileset_Refactor_3_Reuse (shared filler across stages). HORDES-native:
  // dune ripples — three parallel wind ripples.
  BONE_DESERT: { motif: 'DUNE_RIPPLE', dens: 0.26, blurb: 'parallel dune ripples' },
  // Reference: section 5 row CHAPEL (Cappella Magna — ChapelTexturePacked +
  // CANDELABRA, the dark-stone stage) + section 13's chapel-stone row.
  // HORDES-native: void runes — small cross/plus marks in theme stone.
  VOID_REACH: { motif: 'VOID_RUNE', dens: 0.20, blurb: 'small void rune marks' },
  // Reference: section 5 row BONEZONE (BRAZIER scorch) + section 13 row
  // TP_Tileset_Refactor_4_ReuseExtra (bulk transitions/edges).
  // HORDES-native: scorched plates — a dark plate split by a crack seam.
  CINDER_MAW: { motif: 'SCORCH_PLATE', dens: 0.22, blurb: 'scorched split plates' },
  // Reference: section 5 row WHITEOUT + section 13's "8-16 variants per
  // motif" autotile note. HORDES-native: packed snow clumps — 2x2 blocks
  // with a windlit crest and a contact shadow.
  WHITEOUT: { motif: 'SNOW_PACK', dens: 0.24, blurb: 'packed snow clumps' },
};

export const STAGE_GROUND_IDS = Object.keys(SPECS);

const FALLBACK = 'VERDANT_HOLLOW';

// TOTAL over garbage: a missing/unknown id IS the default stage's ground. A
// caller that somehow names a stage this build deleted degrades to moss,
// never throws — same contract as stages.js stageOf.
export function stageGroundSpec(stageId) {
  const s = SPECS[stageId] || SPECS[FALLBACK];
  return { id: stageId && SPECS[stageId] ? stageId : FALLBACK, ...s };
}

// A small integer salt mixed into the overlay hash so each stage picks a
// DIFFERENT subset of overlay cells (placement differs per stage even where
// two motifs share geometry). Pure string hash — deterministic per stage id,
// never the clock.
export function stageSalt(stageId) {
  const s = String(stageId || FALLBACK);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h | 0;
}

// Overlay tile pitch in world px (2x the fine decor CELL): coarse enough to
// read as terrain character, fine enough to land several per screen.
export const STAGE_GROUND_TILE = 64;
