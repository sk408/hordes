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
//
// STARTING ARENA IMPROVE (2026-09-17): `rel.BASIN` (world px radius) is an
// authored HOLLOW — a radial flatten at the arena heart. Inside the inner
// third the field is pinched to ~12% of its height (quantizes to LEVEL 0:
// a genuinely flat clearing), then eases back to the untouched field by the
// BASIN radius, so the terraces the stage name promises actually read: calm
// clearing at the centre, rim climbing outward. Pure and per-run like the
// rest of the field; a stage without BASIN is byte-identical to before.
export function reliefHeight(x, y, seed, rel) {
  const fx = x / rel.CELL, fy = y / rel.CELL;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  let h = lerp(
    lerp(h2(x0, y0, seed), h2(x0 + 1, y0, seed), sx),
    lerp(h2(x0, y0 + 1, seed), h2(x0 + 1, y0 + 1, seed), sx),
    sy);
  if (rel.BASIN) {
    const d = Math.hypot(x, y);
    const inner = rel.BASIN * 0.35;
    let t = (d - inner) / (rel.BASIN - inner);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    h *= 0.12 + 0.88 * (t * t * (3 - 2 * t));
  }
  return h;
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
  // BLOCKING ELEVATION: the grade reads the COMPOSITE level (authored band
  // included), so climbing toward a gate terrace or a rampart grades exactly
  // like climbing the natural ridge it sits on — the symmetry holds.
  const dh = reliefLevelAt(x + ux * R.GRADE_LOOK, y + uy * R.GRADE_LOOK, seed, rel)
    - reliefLevelAt(x, y, seed, rel);
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

// ---- BLOCKING ELEVATION (prototype 2026-09-17, msg_01M2RK5B) ------------------
//
// THE OWNER'S DEFINITION: elevation has to BLOCK A MOVER or it is not
// elevation. The prototype's shape, composable with the pure lattice above:
//
//   * an AUTHORED WALL BAND — a ring at [W.r0, W.r1] raised to W.topLevel
//     (the stage's tallest ground), standing on the natural field;
//   * GATES — angular sectors (W.gaps, half-width W.gapHalf) where the band
//     drops to W.gapLevel, a TERRACE: one level above the hollow floor, one
//     below the rampart top. A gate is a standable ramp THROUGH the wall, so
//     every crossing is a choke point.
//
// THE ONE RULE (shared by the pilot and every walking enemy, no exceptions):
// a mover may not step up or down MORE THAN ONE LEVEL in a single move. A
// >=2-level step is a cliff and blocks; a 1-level step is a ramp and climbs.
// Everything else — grade, spawn cadence, counts — is untouched.
//
// WHY THE NATURAL FIELD CAN NEVER TRAP (the no-trap proof, V1): the bilinear
// lattice is Lipschitz with constant ~1.5/CELL over the smoothstep, so a
// single mover step (a few px at 60Hz or 120Hz) changes the smooth height by
// << 1/LEVELS — the quantized level can cross at most ONE boundary per step.
// A 2-level step therefore only ever occurs at an AUTHORED band edge, and the
// band is a closed ring whose only interior boundaries are its two edges,
// bridged at the four gates. The arena decomposes into three open connected
// regions (hollow disc, rampart ring, outer field) joined at the gates —
// no dead ends exist. test_blocking_elevation.mjs pins this with a flood
// fill over the composite field.
function angDist(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// The authored band's level at a point, or null when the point is off the
// band (natural field) — or when the stage ships no wall.
export function wallLevelAt(x, y, rel) {
  const W = rel && rel.WALL;
  if (!W) return null;
  const r = Math.hypot(x, y);
  if (r < W.r0 || r > W.r1) return null;
  for (const gap of W.gaps) {
    if (Math.abs(angDist(Math.atan2(y, x), gap)) <= W.gapHalf) return W.gapLevel;
  }
  return W.topLevel;
}

// THE COMPOSITE LEVEL — one quantization, one truth: the authored band
// overrides the lattice inside the ring, the lattice rules everywhere else.
// Movement, blocking, the render tints and the level reads all go through
// THIS function, so the wall can never disagree with the map the player sees.
export function reliefLevelAt(x, y, seed, rel) {
  const w = wallLevelAt(x, y, rel);
  return w !== null ? w : reliefLevel(x, y, seed, rel);
}

// THE CLIFF RULE — true when the move (x0,y0)->(x1,y1) steps more than one
// level. Pure; read at the same seam for the pilot and for every enemy.
export function reliefBlocked(x0, y0, x1, y1, seed, rel) {
  if (!(rel && rel.WALL)) return false;
  const l0 = reliefLevelAt(x0, y0, seed, rel);
  const l1 = reliefLevelAt(x1, y1, seed, rel);
  return Math.abs(l1 - l0) > 1;
}

// THE LEGAL STEP. An unblocked move passes through untouched; a blocked one
// SLIDES — the step is projected onto the local tangent of the wall ring, so
// a mover pressed against a cliff walks along it (and a ring walked along
// always reaches a gate; that is the choke funnel). Returns [x, y].
// ONE function, BOTH sides (main.js's pilot and enemy seams call this and
// nothing else) — no wall-hacks for either side, pinned in
// test_blocking_elevation.mjs.
export function reliefStep(x0, y0, x1, y1, seed, rel) {
  if (!reliefBlocked(x0, y0, x1, y1, seed, rel)) return [x1, y1];
  const W = rel.WALL;
  const r = Math.hypot(x0, y0);
  if (r < 1e-6) return [x0, y0];
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 0;
  const tx = -y0 / r, ty = x0 / r;          // the ring tangent at (x0, y0)
  // GATEWARD SLIDE (probe findings 2026-09-17, two defects in the naive
  // intent-projection slide):
  //   * A pressed-RADIAL move projects to ZERO tangent — the mover stalls at
  //     the cliff face forever (with the pilot at the arena heart, every
  //     outer enemy's intent is exactly antiradial: the whole horde freezes).
  //   * Worse, an attractor ON the wall top makes the projection OSCILLATE:
  //     enemies cluster at the inner edge directly below it, sliding toward
  //     its angle from both sides and never leaving — the wall top measured a
  //     perfect 0% contact sanctuary against 91% on flat ground.
  // The fix is the funnel itself: a blocked mover slides toward the NEAREST
  // GATE along the ring tangent, at its own move speed, regardless of intent.
  // Pure (a function of position + the wall block), stateless, identical for
  // pilot and horde — and a ring slid gateward always crosses a gate edge,
  // where the terrace's 1-level steps are ramps. That is the choke: crossing
  // the wall means walking to a gate.
  const theta = Math.atan2(y0, x0);
  let toward = 0, bestD = Infinity;
  for (const g of W.gaps) {
    const d = angDist(theta, g);            // + : the gate lies CW of us
    if (Math.abs(d) < bestD) { bestD = Math.abs(d); toward = d >= 0 ? -1 : 1; }
  }
  const mag = Math.max(len, Math.abs(dx * tx + dy * ty));
  const sx = x0 + tx * toward * mag, sy = y0 + ty * toward * mag;
  if (!reliefBlocked(x0, y0, sx, sy, seed, rel)) return [sx, sy];
  return [x0, y0];
}

