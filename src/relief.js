// HORDES — src/relief.js
//
// ARENA ELEVATED PATHS (scale-up 2026-09-17, owner directive msg_01M2R90M:
// "we need some dynamic aspect to it. Elevated paths, like a megabonk map").
//
// THE RELIEF is a deterministic per-run HEIGHT FIELD, the ground-decor hash
// pattern (render.js cellRand) turned into terrain: every world point hashes
// to a height through a smoothstep-interpolated lattice seeded by the run's
// groundSeed — no stored arrays, same seed -> same field, cells outside the
// camera view are never visited. The height is QUANTIZED to integer LEVELS
// whose grain (CELL) and height (LEVELS) are the STAGE's relief character
// (stages.js `relief`) — per-arena elevation identity, declarative like the
// rest of a stage.
//
// ANTI-SANCTUARY, by construction (the Megabonk lesson — their community's
// two standing complaints are enemies stuck on ledges and camp-the-high-
// ground safe spots):
//   * Nothing blocks enemy motion. The arena has no collision; height costs
//     SPEED, and the grade term below applies to the PLAYER and to every
//     ENEMY through the same pure function at the same movement seams. A
//     chaser climbs the ridge at exactly the grade the pilot would.
//   * Standing high is a TRADE, not a haven: the radar's world reach widens
//     on high ground (VISION_MULT — you see farther) while the horde's spawn
//     AZIMUTH biases toward the uphill side (EXPOSURE_BIAS — the pressure
//     takes the ridge with you). Spawn COUNT, cadence and ring distance are
//     untouched, so the pacing invariants hold by construction.
//
// PURITY: no DOM, no game state, no Math.random, no dt. Every function is a
// pure function of its arguments, so 60Hz and 120Hz read the same terrain at
// the same position, and tests replay fields exactly.
import { CONFIG as C } from './config.js';

// The lattice hash — same shape as render.js's cellRand, independent salt
// space (a different finalizer constant) so decor and relief never alias.
function h2(cx, cy, seed) {
  let h = (seed ^ 0x5bd1e995) >>> 0;
  h = Math.imul(h ^ cx, 0x27d4eb2d);
  h = Math.imul(h ^ cy, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const lerp = (a, b, t) => a + (b - a) * t;

// Smooth (unquantized) height in [0, 1). Bilinear over the stage's CELL
// lattice with smoothstep easing, so contours are round, not diamond-shaped.
export function reliefHeight(x, y, seed, rel) {
  const fx = x / rel.CELL, fy = y / rel.CELL;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  return lerp(
    lerp(h2(x0, y0, seed), h2(x0 + 1, y0, seed), sx),
    lerp(h2(x0, y0 + 1, seed), h2(x0 + 1, y0 + 1, seed), sx),
    sy);
}

// The quantized LEVEL at a world point: 0 (floor) .. LEVELS-1 (the stage's
// tallest ground). This is what movement, spawn bias, vision and the render
// all read — ONE quantization, one truth.
export function reliefLevel(x, y, seed, rel) {
  return Math.min(rel.LEVELS - 1, Math.floor(reliefHeight(x, y, seed, rel) * rel.LEVELS));
}

// THE GRADE TERM — the one dynamic the relief adds to movement. A mover
// heading somewhere samples the level at its position and at GRADE_LOOK px
// along its direction: climbing costs GRADE_COST per level, descending pays
// the same, bounded by GRADE_CAP either way. Read at the SAME seam for the
// player and for every enemy (main.js), so it can never be a one-sided
// advantage. Returns a plain multiplier on speed.
export function reliefGrade(x, y, dirX, dirY, seed, rel) {
  const R = C.RELIEF;
  const len = Math.hypot(dirX, dirY);
  if (len <= 0) return 1;
  const ux = dirX / len, uy = dirY / len;
  const dh = reliefLevel(x + ux * R.GRADE_LOOK, y + uy * R.GRADE_LOOK, seed, rel)
    - reliefLevel(x, y, seed, rel);
  if (dh === 0) return 1;
  const f = 1 - dh * R.GRADE_COST;
  return Math.max(1 - R.GRADE_CAP, Math.min(1 + R.GRADE_CAP, f));
}

// The uphill azimuth at a point (the direction of steepest ascent), off the
// SMOOTH height so the gradient is continuous. Pure; used by the exposure
// bias and free for the render/tests.
export function reliefUphillAzimuth(x, y, seed, rel) {
  const d = C.RELIEF.GRADE_LOOK;
  const gx = reliefHeight(x + d, y, seed, rel) - reliefHeight(x - d, y, seed, rel);
  const gy = reliefHeight(x, y + d, seed, rel) - reliefHeight(x, y - d, seed, rel);
  return Math.atan2(gy, gx);
}

// EXPOSURE BIAS — the risk half of high ground. A pilot standing at >=
// HIGH_LEVEL draws the horde's spawn azimuth partway toward the uphill side:
// the pressure spawns over the ridge with them instead of paying the climb.
// A PURE transform of the angle the spawn loop already drew (no extra rng
// draw — the seeded stream cannot shift), shortest-path circular blend.
export function reliefBiasAngle(angle, playerLevel, uphillAzimuth) {
  const R = C.RELIEF;
  if (playerLevel < R.HIGH_LEVEL) return angle;
  let d = uphillAzimuth - angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return angle + d * R.EXPOSURE_BIAS;
}

// VISION — the reward half. The radar's WORLD reach widens on high ground;
// the drawn radius never changes (the HUD box is fixed geometry), the dots
// simply map more world into the same disc.
export function reliefVisionRadius(baseRadius, playerLevel) {
  return playerLevel >= C.RELIEF.HIGH_LEVEL ? baseRadius * C.RELIEF.VISION_MULT : baseRadius;
}
