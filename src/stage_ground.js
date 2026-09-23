// HORDES — stage ground/biome identity (PORT SLICE G: original art from VS design reference;
// PORT SLICE K3: floor tile variety — multiple motifs per biome, mixed per cell).
//
// WHAT THIS FILE IS
// Eight ORIGINAL hand-authored ground-motif SETS, three per stage identity
// (24 motifs total: each slice-G motif kept as motifs[0], plus two new
// siblings per biome). They are CONCEPT ports only: the reference
// (docs/vs_port_ref/DESIGN_REFERENCE_VS.md, section 5 stage rows + section 13
// TILES + section 1 art-direction numbers, see per-motif rows below) names
// the ROLES — forest floor, chapel stone, shared filler reused across stages
// via palette swap, 32px autotile sets, 8-16 variants per motif, bulk
// transitions/edges — and documents that no ground pixels were ever extracted
// to trace (section 14 GAPS covers the missing bundles; Appendix A.3's stage
// thumbs are packed 32px tileset atlases, not ground sprites; Appendix A.4's
// 757 tile thumbs are the 32px vocabulary this variety pass mirrors). Every
// rect render.js paints for these motifs was composed fresh for HORDES.
//
// ART-DIRECTION NUMBERS (reference section 1, style guidance only):
//   * 32px grid: motifs anchor on a 64px tile (2x the decor CELL) and every
//     motif fits inside ~20px, painted 1:1 through fillRect — integer
//     scaling, no smoothing.
//   * Palette budget: motifs use ONLY the active wave theme's palette keys
//     (pal.tuft/tuft2/stone/stoneTop/crack/slab/base) — never a fixed color —
//     so the wave recolor beat survives: the STAGE sets the terrain character
//     (which cells + which motif per cell + which geometry), the WAVE sets
//     the color.
//   * Still life: no clock read anywhere — a motif repaints byte-identically
//     per (cell, seed, stage).
//
// WIRING: render.js drawGround consults stageGroundSpec(stage) for the
// overlay pass AFTER the shipped fine decor field — the fine field is
// untouched (same salts, same gates), so the wave-theme ladder and every
// landmark/building pin hold. No balance/combat/economy number lives here
// (visual-only slice). K3: the overlay picks ONE motif per picked tile via
// groundMotifFor (pure fn of cell + seed + stage, salt 34 — never the clock,
// never the wave), so a single stage reads with variety instead of one
// stamped texture.
//
// ---- motif specs -----------------------------------------------------------
// dens = chance an overlay tile carries A motif (all <= 0.30: texture, not
// carpet — the ground must stay quiet under the play pieces). motifs[0] is
// always the slice-G motif (placement geometry for that motif is unchanged);
// motifs[1..] are the K3 siblings. Every motif paints 3..7 fillRects through
// pal.* only, inside ~20px, rim-clipped by the caller.
// Reference key per motif: S5 = section 5 stage row, T13 = section 13 TILES row.
const SPECS = {
  // S5 FOREST (Mad Forest — ForestTexturePacked) + T13 Reuse filler.
  // HORDES-native: moss bedding + fern curls + pebble nests.
  VERDANT_HOLLOW: { motifs: ['MOSS', 'FERN_CURL', 'PEBBLE_NEST'], dens: 0.24,
    blurb: 'moss bedding, fern curls and pebble nests' },
  // S5 BONEZONE (BRAZIER scorch) + T13 Castle gothic floor.
  // HORDES-native: ember cracks + ash piles + cinder specks.
  ASHEN_WASTE: { motifs: ['EMBER_CRACK', 'ASH_PILE', 'CINDER_SPECK'], dens: 0.22,
    blurb: 'ember cracks, ash piles and cinder specks' },
  // S5 WHITEOUT (MoonspellTexturePacked snow) + T13 32px autotile guidance.
  // HORDES-native: drift streaks + ice chips + frost pellets.
  SNOWFIELD: { motifs: ['DRIFT_STREAK', 'ICE_CHIP', 'FROST_PELLET'], dens: 0.22,
    blurb: 'drift streaks, ice chips and frost pellets' },
  // T13 Chapel stone + S5 bloodmoon BG art.
  // HORDES-native: rust veins + rust pools + splinters.
  BLOOD_RUST: { motifs: ['RUST_VEIN', 'RUST_POOL', 'SPLINTER'], dens: 0.24,
    blurb: 'rust veins, rust pools and splinters' },
  // S5 BONEZONE + T13 Reuse shared filler.
  // HORDES-native: dune ripples + bone fragments + sand pits.
  BONE_DESERT: { motifs: ['DUNE_RIPPLE', 'BONE_FRAG', 'SAND_PIT'], dens: 0.26,
    blurb: 'dune ripples, bone fragments and sand pits' },
  // S5 CHAPEL (Cappella Magna chapel stone) + T13 chapel-stone row.
  // HORDES-native: void runes + void cracks + void pebbles.
  VOID_REACH: { motifs: ['VOID_RUNE', 'VOID_CRACK', 'VOID_PEBBLE'], dens: 0.20,
    blurb: 'void runes, void cracks and void pebbles' },
  // S5 BONEZONE scorch + T13 ReuseExtra bulk edges.
  // HORDES-native: scorched plates + cinder vents + slag lines.
  CINDER_MAW: { motifs: ['SCORCH_PLATE', 'CINDER_VENT', 'SLAG_LINE'], dens: 0.22,
    blurb: 'scorched plates, cinder vents and slag lines' },
  // S5 WHITEOUT + T13 "8-16 variants per motif" autotile note.
  // HORDES-native: snow packs + frost feathers + ice pebbles.
  WHITEOUT: { motifs: ['SNOW_PACK', 'FROST_FEATHER', 'ICE_PEBBLE'], dens: 0.24,
    blurb: 'snow packs, frost feathers and ice pebbles' },
};

export const STAGE_GROUND_IDS = Object.keys(SPECS);

const FALLBACK = 'VERDANT_HOLLOW';

// TOTAL over garbage: a missing/unknown id IS the default stage's ground. A
// caller that somehow names a stage this build deleted degrades to moss,
// never throws — same contract as stages.js stageOf. `motif` (singular) is
// the slice-G back-compat alias for motifs[0]; render.js and the K3 test read
// `motifs`, old readers keep working.
export function stageGroundSpec(stageId) {
  const s = SPECS[stageId] || SPECS[FALLBACK];
  const id = stageId && SPECS[stageId] ? stageId : FALLBACK;
  return { id, motifs: [...s.motifs], motif: s.motifs[0], dens: s.dens, blurb: s.blurb };
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

// K3 dens gate: DOES a cell carry a motif tile. Pure function of
// (cell, seed, stage) — salt 30, the overlay's gate lane (31/32 = anchor,
// 33 = flip, 34 = motif pick). render.js calls this (single source of truth
// — the test asserts picked-tile variety through it and render together).
export function groundCellPicked(cx, cy, seed, stageId) {
  const spec = stageGroundSpec(stageId);
  const salt = stageSalt(spec.id);
  let h = ((seed ^ salt) ^ 30) >>> 0;
  h = Math.imul(h ^ cx, 0x27d4eb2d);
  h = Math.imul(h ^ cy, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) < spec.dens;
}

// K3 motif pick: WHICH of the stage's motifs a cell carries. Pure function of
// (cell, seed, stage) — same triple always names the same motif; never reads
// the wave (geometry stays wave-independent) or the clock. Salt 34 is the
// overlay's free lane (30 = dens gate, 31/32 = anchor, 33 = flip). render.js
// calls this (single source of truth — the test asserts variety through it).
export function groundMotifFor(cx, cy, seed, stageId) {
  const spec = stageGroundSpec(stageId);
  const salt = stageSalt(spec.id);
  let h = ((seed ^ salt) ^ 34) >>> 0;
  h = Math.imul(h ^ cx, 0x27d4eb2d);
  h = Math.imul(h ^ cy, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  const r = (h >>> 0) / 4294967296;
  return spec.motifs[Math.floor(r * spec.motifs.length) % spec.motifs.length];
}

// Overlay tile pitch in world px (2x the fine decor CELL): coarse enough to
// read as terrain character, fine enough to land several per screen.
export const STAGE_GROUND_TILE = 64;
