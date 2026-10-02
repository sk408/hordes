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
//   * The same geometry for both sides. Cliffs block the PLAYER and every
//     walking ENEMY through one function (reliefStep below) at the same
//     movement seams, and a blocked mover SLIDES along the face toward the
//     nearest ramp — the horde climbs the ramps exactly as the pilot would,
//     so an upper path is a route, never a sanctuary. Height below the cliff
//     threshold costs SPEED only (the grade term), identical for both sides.
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
  // ELEVATION v2: the grade reads the COMPOSITE level (authored terrace
  // included), so climbing a ramp grades exactly like climbing the natural
  // ridge it sits on — the symmetry holds.
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

// ---- ELEVATION v2 (2026-09-18) — GRADE + CLIFF, THE UPPER PATH ----------------
//
// THE OWNER'S SHAPE (msg: "It should be a gradient upward/downward that would
// create a separate path blocked off by a cliff. If possible form our view").
// Two primitives replace the 2026-09-17 rim-wall prototype's step rule:
//
//   * GRADE — a continuous walkable slope: ground whose composite level
//     changes by < CLIFF_STEP between adjacent positions. The mover crosses
//     it and the GRADE TERM above rides it (climbing costs, descending pays).
//     A RAMP is an authored grade: the terrace's angular ends step
//     topLevel -> natural ground in whole 1-level staircases.
//   * CLIFF — a height discontinuity >= CONFIG.RELIEF.CLIFF_STEP levels
//     between adjacent positions. It BLOCKS the move; you route around it
//     (the ramps) or you do not cross. Everything flatter is walkable.
//
// WHY THE NATURAL FIELD CAN NEVER TRAP (the no-trap half of the proof): the
// bilinear lattice is Lipschitz with constant ~1.5/CELL over the smoothstep,
// so a single mover step (a few px at 60Hz or 120Hz) changes the smooth
// height by << 1/LEVELS — the quantized level can cross at most ONE boundary
// per step. Cliffs therefore exist ONLY at the authored terrace's radial
// edges, and those edges are arc spans whose only graded breaks are the two
// ramps. The arena decomposes into open connected regions (floor, ramp
// corridors, path top) joined at the ramps — test_blocking_elevation.mjs
// pins this with a flood fill over the composite field, cliff set included.
function angDist(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// The authored APRON — the flattened shelf the terrace stands on. Without it
// the natural field's own terraces (often level 1-2 at this radius) would
// merge into the path top almost everywhere and the "separate path blocked
// off by a cliff" would leak (measured: only 0-53% of the band edges cliff).
// The apron pins the wedge of ground around the band to level 0, feathered
// angularly over T.feather radians so the shelf itself never cliffs — the
// only >= CLIFF_STEP faces left are the terrace's own radial edges, and the
// only ways up are the ramps. Returns null off the apron (natural field).
export function apronLevelAt(x, y, seed, rel) {
  const T = rel && rel.TERRACE;
  if (!T) return null;
  const r = Math.hypot(x, y);
  if (r < T.r0 - T.apron || r > T.r1 + T.apron) return null;
  const theta = Math.atan2(y, x);
  // Angular distance beyond the ramps' foot line ([A0-2rampW, A1+2rampW]).
  const footA = T.A0 - 2 * T.rampW, footB = T.A1 + 2 * T.rampW;
  let dd = 0;
  const d0 = angDist(theta, footA), d1 = angDist(theta, footB);
  if (d0 < 0) dd = -d0;
  else if (d1 > 0) dd = d1;
  if (dd >= T.feather) return null;                  // off the wedge: natural
  const t = 1 - dd / T.feather;                      // 1 in the core, eased to 0
  const e = t * t * (3 - 2 * t);
  const natural = reliefLevel(x, y, seed, rel);
  return Math.round(natural * (1 - e));
}

// The authored terrace's level at a point, or null when the point is off the
// band (apron/natural field) — or when the stage ships no terrace. Seed-aware:
// the ramps grade toward the GROUND under them (apron-pinned to 0 at the
// foot), so a ramp never ends in a cliff of its own making.
export function terraceLevelAt(x, y, seed, rel) {
  const T = rel && rel.TERRACE;
  if (!T) return null;
  const r = Math.hypot(x, y);
  if (r < T.r0 || r > T.r1) return null;
  const theta = Math.atan2(y, x);
  // Angular distance BEYOND the top span [A0, A1] (0 inside the span).
  let dd = 0;
  const d0 = angDist(theta, T.A0), d1 = angDist(theta, T.A1);
  if (d0 < 0) dd = -d0;          // CCW-shorter side: theta sits before A0
  else if (d1 > 0) dd = d1;      // theta sits past A1
  if (dd <= 0) return T.topLevel;                    // the upper path itself
  if (dd >= 2 * T.rampW) return null;                // past the ramps: apron field
  // THE RAMP — a graded slope from topLevel at the span end (t=0) easing to
  // the ground at the ramp foot (t=1), quantized to whole levels. Each step
  // is one level (a legal GRADE, never a cliff): the blend's rate is <=
  // topLevel levels over 2*rampW radians (~>=300px of arc), and the ground
  // under it is itself Lipschitz.
  const t = dd / (2 * T.rampW);
  const ground = apronLevelAt(x, y, seed, rel) ?? reliefLevel(x, y, seed, rel);
  const e = t * t * (3 - 2 * t);                     // smoothstep easing
  const v = T.topLevel + (ground - T.topLevel) * e;
  return Math.max(0, Math.min(T.topLevel, Math.round(v)));
}

// THE COMPOSITE LEVEL — one quantization, one truth: the authored terrace
// overrides the apron inside its band, the apron overrides the lattice in
// its wedge, the lattice rules everywhere else. Movement, blocking, the
// render tints and the level reads all go through THIS function, so the
// cliff the player SEES and the cliff the mover FEELS are one structure.
export function reliefLevelAt(x, y, seed, rel) {
  const t = terraceLevelAt(x, y, seed, rel);
  if (t !== null) return t;
  const a = apronLevelAt(x, y, seed, rel);
  return a !== null ? a : reliefLevel(x, y, seed, rel);
}

// THE CLIFF RULE — true when the move (x0,y0)->(x1,y1) crosses a height
// discontinuity at or above CONFIG.RELIEF.CLIFF_STEP levels. Pure; read at
// the same seam for the pilot and for every enemy.
export function reliefBlocked(x0, y0, x1, y1, seed, rel) {
  if (!(rel && rel.TERRACE)) return false;
  const l0 = reliefLevelAt(x0, y0, seed, rel);
  const l1 = reliefLevelAt(x1, y1, seed, rel);
  return Math.abs(l1 - l0) >= C.RELIEF.CLIFF_STEP;
}

// THE ROUTE BIAS — the INTENT half of the funnel, and the fix for the
// tangential-shadow orbit (the Megabonk stuck-on-a-ledge defect this model
// exists to avoid). A blocked frame can only reroute the mover when the
// geometry refuses the step; but a greedy walker whose target stands on the
// terrace has a whole band of positions BELOW the face where its direct
// intent is perfectly LEGAL (pointing tangentially under the target, never
// crossing the cliff) — it free-runs back under the target and regains every
// stride the blocked-frame slide won, orbiting in the target's tangential
// shadow forever (measured: a chaser parked at r 560, ang 78°, for 60s
// against a pilot standing on the top). No blocked-frame rule can break
// that — the fix must bias the INTENT itself:
//
//   When the walker's target is ON the terrace band at >= CLIFF_STEP above
//   the walker, the walker routes to the NEAREST RAMP DOOR (aimed at the
//   door's mid-band point, so the face crossing lands inside the door's
//   graded staircase). The bias RELEASES the moment the walker steps onto
//   the grade (level rises, the gap falls under CLIFF_STEP) — from the ramp,
//   greedy intent walks the band to the target legally.
//
// A PURE function of (walker, target): no state, no timer, same answer at
// 60Hz and 120Hz. The caller gates it on the mover actually PURSUING (an
// intent pointed at the target), so kiters, stationary turrets and latched
// ticks keep their own doctrine. Read at BOTH intent seams — the enemy move
// seam (main.js) and the AUTO pilot — so the horde paths the ramps exactly
// as the pilot would. Two phases:
//   BELOW  (walker off the band, >= CLIFF_STEP under the target): waypoint
//          is the ramp DOOR — chosen by the SHORTEST ARC through to the
//          target's side of the band, so the final approach is short — at
//          mid-band radius, where the face crossing lands inside the door's
//          graded staircase.
//   ON THE BAND (target and walker both on it): waypoint hops the ARC
//          toward the target's angle in chords short enough that the chord
//          cannot dip inside r0 (a long chord cuts the hollow and steps off
//          the inner cliff — the exact oscillation the raw greedy shows at
//          the ramp mouth: climb, dip, re-route, forever).
// Returns a unit [dx, dy], or null when no bias applies.
export function reliefRampRoute(x, y, tx, ty, seed, rel) {
  const T = rel && rel.TERRACE;
  if (!T) return null;
  const tLv = terraceLevelAt(tx, ty, seed, rel);
  if (tLv === null || tLv < 1) return null;    // target not on the upper path
  const onBand = terraceLevelAt(x, y, seed, rel) !== null;
  const mLv = reliefLevelAt(x, y, seed, rel);
  if (!onBand && tLv - mLv < C.RELIEF.CLIFF_STEP) return null;  // a grade reaches it
  const r = Math.hypot(x, y);
  if (r < 1e-6) return null;
  const thW = Math.atan2(y, x), thT = Math.atan2(ty, tx);
  let wx, wy;
  if (!onBand) {
    const ramps = [T.A0 - T.rampW, T.A1 + T.rampW];   // the ramp CENTRES
    let door = ramps[0], best = Infinity;
    for (const g of ramps) {
      const cost = Math.abs(angDist(thW, g)) + Math.abs(angDist(g, thT));
      if (cost < best) { best = cost; door = g; }
    }
    const rr = (T.r0 + T.r1) / 2;                 // the door's mid-band point
    wx = Math.cos(door) * rr; wy = Math.sin(door) * rr;
  } else {
    // The arc hop: at most the chord whose dip just grazes r0+4 (chord dip
    // between two radius-r points separated by phi is r*cos(phi/2)). The
    // waypoint's radius is the TARGET's (clamped into the band): at angular
    // alignment the waypoint IS the target, so the walker closes radially
    // along the band instead of circling it forever at its own radius.
    const rr = Math.max(T.r0 + 8, Math.min(T.r1 - 8, Math.hypot(tx, ty)));
    const hopMax = 2 * Math.acos(Math.min(1, (T.r0 + 4) / Math.min(r, rr)));
    const hop = Math.max(-hopMax, Math.min(hopMax, angDist(thT, thW)));
    const theta = thW + hop;
    wx = Math.cos(theta) * rr; wy = Math.sin(theta) * rr;
  }
  const dx = wx - x, dy = wy - y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  return [dx / L, dy / L];
}

// THE LEGAL STEP. An unblocked move passes through untouched; a blocked one
// is REROUTED — two layers, in order:
//   1. THE RAMP DOOR: step at the mover's own speed toward the nearest
//      ramp door (the ramp's centre angle at the mover's OWN radius — a
//      same-radius chord can never cross the cliff face it hugs). The door
//      direction always AGREES in angular sign with any legal retreat the
//      mover's intent can take, so the two can never cancel: pressed
//      against the face, a walker advances toward the ramp whether the
//      frame's step is its own intent or the reroute, and at the door the
//      intent's radial component crosses legally (the blend is <= 1 level
//      from the floor there) and carries it up the grade. This is the fix
//      for the orbit defect: a naive face-tangent slide is exactly opposed
//      by legal micro-retreats below a target standing above the edge
//      (net = P - ceil(P) <= 0 for ANY slide pace P — measured), leaving a
//      greedy chaser parked in the target's tangential shadow, the v1
//      wall-top 0%-contact sanctuary in new clothes.
//   2. THE ROTATION SLIDE (fallback when even the door chord is blocked):
//      rotate EXACTLY at the mover's own radius along the cliff face toward
//      the nearest ramp. A tangent projection drifts outward by mag^2/2r per
//      step and a mover that creeps onto the exact band edge finds the slide
//      itself blocked and stalls there forever (measured: seekers stuck at
//      r=560.0 mid-span); exact rotation cannot cross the face it hugs. No
//      radial drift term: a drift AWAY from the face widens the band the
//      intent's legal micro-retreats can play in (each drift-rupee buys a
//      extra legal frame pulling the mover back — measured orbit), and the
//      door chord already wins the angular budget: a legal retreat spends
//      only its tangential fraction of the step on angular motion, the
//      reroute spends the WHOLE step, so every blocked+legal pair nets
//      rampward. That is the funnel's guarantee.
// Returns [x, y].
// ONE function, BOTH sides (main.js's pilot and enemy seams call this and
// nothing else) — no cliff-hacks for either side, pinned in
// test_blocking_elevation.mjs.
export function reliefStep(x0, y0, x1, y1, seed, rel) {
  if (!reliefBlocked(x0, y0, x1, y1, seed, rel)) return [x1, y1];
  const T = rel.TERRACE;
  const r = Math.hypot(x0, y0);
  if (r < 1e-6) return [x0, y0];
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 0;
  const theta = Math.atan2(y0, x0);
  const ramps = [T.A0 - T.rampW, T.A1 + T.rampW];   // the ramp CENTRES
  let door = ramps[0], bestD = Infinity, toward = 0;
  for (const g of ramps) {
    const d = angDist(theta, g);            // + : the ramp lies CW of us
    if (Math.abs(d) < bestD) { bestD = Math.abs(d); door = g; toward = d >= 0 ? -1 : 1; }
  }
  // Layer 1 — the door chord at the mover's own pace.
  const wx = Math.cos(door) * r, wy = Math.sin(door) * r;
  const dwx = wx - x0, dwy = wy - y0;
  const dw = Math.hypot(dwx, dwy);
  if (dw > 1e-6) {
    const sx = x0 + dwx / dw * len, sy = y0 + dwy / dw * len;
    if (!reliefBlocked(x0, y0, sx, sy, seed, rel)) return [sx, sy];
  }
  // Layer 2 — the exact rotation slide.
  const tx = -y0 / r, ty = x0 / r;          // the cliff-face tangent at (x0, y0)
  const mag = Math.max(len, Math.abs(dx * tx + dy * ty));
  const dth = toward * mag / r;
  const cos = Math.cos(dth), sin = Math.sin(dth);
  const sx = x0 * cos - y0 * sin, sy = x0 * sin + y0 * cos;
  if (!reliefBlocked(x0, y0, sx, sy, seed, rel)) return [sx, sy];
  return [x0, y0];
}

