// HORDES — src/radar.js
//
// A2 THE RADAR (owner-suggested 2026-09-14, docs/HORDES_GOALS_2026-09-12.md
// §"A2 — THE RADAR (circular minimap with enemy dots)").
//
// This module is the RADAR'S DATA LAYER ONLY: pure maths, no DOM, no canvas,
// no timers, no globals, no Math.random, no dt. The renderer keeps the drawing;
// this file only answers "which enemies are within the radar radius, where do
// they sit in radar space, and what tier are they". That is what lets a
// headless test drive the whole thing.
//
// 60Hz and 120Hz safety: the function has no time term at all, so a frame
// budget cannot change its answer. It allocates exactly one small object per
// returned dot and never grows or mutates any input, so calling it every frame
// is a bounded, GC-light read of `state.enemies`.

// ---------------------------------------------------------------------------
// RADIUS — the radar must cover the SPAWN RING
// ---------------------------------------------------------------------------
// THE ARITHMETIC, explicitly (owner's words: "enough to see all the enemies
// within the spawn radius"):
//
//   spawn distance = SPAWN_DIST * (0.85 + Math.random() * 0.3)   [main.js]
//                  = 280 * [0.85 .. 1.15]                        [config.js:118, ENEMY.SPAWN_DIST]
//                  = [238 .. 322] world px
//   max spawn ring = 280 * 1.15 = 322
//   radar radius   = 330  (>= 322, so the whole ring is covered)
//
// The 8px headroom over 322 is deliberate: it keeps the ring strictly INSIDE
// the radar rather than exactly on its edge, so an enemy that has just spawned
// at the far ring still reads as an interior dot with room to move.
//
// MIRRORED, NOT IMPORTED (temporary): these constants live here on purpose —
// config.js is owned by a parallel lane right now, and A2 is a render-only
// read that must not create a merge seam on that file. The mirror is pinned by
// test/test_radar.mjs ("RADIUS covers the spawn ring" block, which reads the
// real CONFIG.ENEMY.SPAWN_DIST and the real jitter bounds), so drift is caught
// by the suite rather than by a comment. Fold these into config.js later, when
// the file is free, and the drift guard goes with them.
export const SPAWN_DIST = 280;        // mirror of CONFIG.ENEMY.SPAWN_DIST
export const SPAWN_JITTER_MIN = 0.85; // mirror of the main.js spawn draw
export const SPAWN_JITTER_MAX = 1.15;
export const SPAWN_RING_MAX = SPAWN_DIST * SPAWN_JITTER_MAX;   // 322

export const RADAR_RADIUS = 330;      // world px; >= SPAWN_RING_MAX (322)

// The radar's default drawing config. `radius` is in WORLD px (that is what
// containment is measured in); `displayRadius` is the radius of the radar's
// drawn circle in HUD px, and defines the mapping's scale factor.
//
//   scale = displayRadius / radius   (default 1 => 1 radar px per world px)
//
// HUD geometry (corner inset, outer ring, panel size) is NOT here: the radar
// must not reflow anything (see the H1 no-reflow contract), so its box is the
// renderer's fixed-geometry problem, not the data layer's.
export const DEFAULT_RADAR = {
  radius: RADAR_RADIUS,
  displayRadius: RADAR_RADIUS,
};

// ---------------------------------------------------------------------------
// TIERS — chaff vs elite vs boss must be distinguishable
// ---------------------------------------------------------------------------
// The renderer draws these differently (colour/size); the data layer only names
// them. Priority is strict and total: BOSS beats ELITE beats CHAFF, so an elite
// boss (or an elite-stamped boss cast) can never be downgraded to a weaker tag.
export const RADAR_TIERS = {
  CHAFF: 'chaff',
  ELITE: 'elite',
  BOSS: 'boss',
};

// Classify one enemy. Reads only `boss`/`elite`, both of which the sim already
// stamps at the spawn sites (main.js sets `boss = true` on boss casts; the
// elite roll sets `elite`).
export function classifyTier(enemy) {
  if (enemy && enemy.boss) return RADAR_TIERS.BOSS;
  if (enemy && enemy.elite) return RADAR_TIERS.ELITE;
  return RADAR_TIERS.CHAFF;
}

// ---------------------------------------------------------------------------
// radarDots(player, enemies, config) -> the dot set to draw
// ---------------------------------------------------------------------------
// RADAR SPACE (the contract the renderer and the test both stand on):
//   - Player-relative: the player's own position is (0, 0) — the centre. The
//     caller translates to the radar box centre; this function never needs to
//     know where the box is.
//   - y-DOWN, SAME HANDEDNESS AS THE WORLD (canvas is y-down too): +x is east
//     / right, +y is south / down, -y is north / up. There is NO mirror flip,
//     so an enemy directly north of the player (smaller world y) maps to a
//     NEGATIVE radar y and the renderer draws it above the centre.
//   - PIXEL-MAPPED, not radius-normalised: each axis is scaled by
//     `config.displayRadius / config.radius` (default 1:1) and rounded to an
//     INTEGER px. Integer output is what keeps the radar composed with the
//     pixel-art / resolution modes (no half-pixel, no blur). A normalised form
//     was rejected because every consumer would immediately re-multiply it by
//     a pixel radius — the same rounding, one indirection later.
//
// BOUNDARY RULE — INCLUSIVE: an enemy at EXACTLY the radar radius
// (dist === radius) IS included. "Within the radius" reads as <=, and the
// spawn ring tops out at 322 < 330, so including an exact-radius dot can never
// be a spawn the radar failed to show. The test pins a dot exactly on the
// radius (198/264 -> hypot 330) as INCLUDED.
//
// BEYOND THE RADIUS — OMITTED, never clamped: an enemy farther than the radius
// produces NO dot. The owner asked for "enough to see all the enemies within
// the spawn radius", and a dot clamped to the rim would lie about both
// distance and (after clamping) direction — a rim-welded blob reads as an
// enemy that is not there. Omission is the honest reading; the test asserts
// that a dot beyond the radius does not exist.
//
// ORDER — deterministic and total: ascending world distance from the player,
// ties broken by ascending index in the input array. Two different enemies at
// identical distance still get a stable, reproducible order, so the output is
// byte-for-byte comparable across calls.
//
// PURITY: `player` and `enemies` (and every enemy inside) are read only. The
// returned objects are freshly allocated; nothing is written back. Safe to
// call at 60Hz and 120Hz.
//
// Each dot: { x, y, tier, typeId, dist, index }
//   x, y   integer RADAR-SPACE px relative to the player centre
//   tier   RADAR_TIERS.CHAFF | ELITE | BOSS
//   typeId the enemy's type id (pass-through, so the renderer can colour it)
//   dist   world-px distance from the player (unscaled, > 0 comparison basis)
//   index  the enemy's index in the input array (stable tie-break / debug)
export function radarDots(player, enemies, config = DEFAULT_RADAR) {
  const radius = (config && config.radius) || DEFAULT_RADAR.radius;
  const displayRadius = (config && config.displayRadius) || DEFAULT_RADAR.displayRadius;
  const scale = displayRadius / radius;

  const list = enemies || [];
  const out = [];
  for (let index = 0; index < list.length; index++) {
    const e = list[index];
    if (!e) continue;
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (!(dist <= radius)) continue;   // NaN-safe: a dot must PROVE it is inside
    out.push({
      x: Math.round(dx * scale),
      y: Math.round(dy * scale),
      tier: classifyTier(e),
      typeId: e.typeId,
      dist,
      index,
    });
  }
  // Total order: nearest first, input order breaks ties. Array.prototype.sort
  // is stable in modern V8, but the index tie-break makes the contract
  // explicit rather than dependent on that stability.
  out.sort((a, b) => (a.dist - b.dist) || (a.index - b.index));
  return out;
}
