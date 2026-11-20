// HORDES - how a character moves on screen: which way it faces, the walk bob,
// the pop when it spawns, the squash when it is hit and the collapse before
// its death puff. Drawing only. Nothing here moves a body, changes a hit box
// or draws a random number: a fixed seed plays the same run with this on or
// off. Every phase comes from sim state (the body's age, its hit flash, the
// feel observer's per-body record, which steps on sim dt), never from the
// wall clock, so 60 Hz and 120 Hz draw the same pose at the same sim time.
//
// The art faces right (a hero holds the weapon on the right): a body walking
// left is drawn mirrored.

export const ANIM = {
  FACE_V: 6,          // px/s of sideways walk before a body turns
  FACE_TAU: 0.08,     // s: smoothing of that sideways speed (no flicker in a shove)
  MOVE_V: 3,          // px/s of walk before the bob starts
  POP_S: 0.18,        // s: the spawn pop
  POP_FROM: 0.3,      // the pop starts at this size
  SQUASH_X: 0.22,     // a hit widens the body this much...
  SQUASH_Y: 0.18,     // ...and flattens it this much, at the hit's peak
  HIT_FLASH: 0.08,    // the sim's hit flash length (e.flash on a hit)
  BIG_WEIGHT: 0.5,    // bosses and elites squash and pop half as much
  COLLAPSE_S: 0.14,   // s: the body folds down, then the puff
};

let enabled = true;
// The test seam and the capture tool's "before" switch: off draws every
// actor exactly as before this module (no flip, no bob, no pop, no squash).
export function setActorAnim(on) { enabled = !!on; }
export function actorAnimOn() { return enabled; }

// The smoothing weight of one step of `dt` s (the same smoothing per second
// at any step size). Worked out once per step, not once per body.
export function facingWeight(dt) {
  return dt > 0 ? 1 - Math.exp(-dt / ANIM.FACE_TAU) : 0;
}

// Smooth the sideways speed and turn when it is clear. `rec` holds
// { face, vxs, spd }; `dx` is the sim's own move this step (no shove);
// `k` is facingWeight(dt).
export function stepFacing(rec, dx, dy, dt, k = facingWeight(dt)) {
  if (!(dt > 0)) return;
  rec.vxs += (dx / dt - rec.vxs) * k;
  rec.spd += (Math.sqrt(dx * dx + dy * dy) / dt - rec.spd) * k;
  if (rec.vxs > ANIM.FACE_V) rec.face = 1;
  else if (rec.vxs < -ANIM.FACE_V) rec.face = -1;
}

// easeOutBack on 0..1: a small overshoot, then rest at 1.
function easeOutBack(t) {
  const c1 = 1.4, c3 = c1 + 1, u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

// The pose of a live enemy. `rec` is its feel record (or null before the
// first sim step). Returns { flip, kx, ky, lift }: mirror, the width and
// height factors about the feet, and px lifted (the bob).
const POSE = { flip: false, kx: 1, ky: 1, lift: 0 };
export function enemyPose(e, rec, reduced, frameCount) {
  const p = POSE;
  p.flip = false; p.kx = 1; p.ky = 1; p.lift = 0;
  if (!enabled) return p;
  p.flip = !!rec && rec.face < 0;
  if (reduced) return p;
  const big = e.boss || e.elite;
  const w = big ? ANIM.BIG_WEIGHT : 1;
  const age = e.age || 0;
  if (age < ANIM.POP_S && age >= 0) {
    const s = ANIM.POP_FROM + (1 - ANIM.POP_FROM) * easeOutBack(age / ANIM.POP_S);
    const sw = 1 + (s - 1) * w;
    p.kx = sw; p.ky = sw;
  }
  const hit = Math.max(0, Math.min(1, (e.flash || 0) / ANIM.HIT_FLASH));
  if (hit > 0) {
    p.kx *= 1 + ANIM.SQUASH_X * hit * w;
    p.ky *= 1 - ANIM.SQUASH_Y * hit * w;
  }
  // The bob rides the walk frames: up a pixel on every other frame.
  if (!e.flying && rec && rec.spd > ANIM.MOVE_V && frameCount > 1) {
    p.lift = Math.floor(age * 6) % 2;
  }
  return p;
}

// The pose of a body in its collapse, `t` = 0..1 through it.
export function collapsePose(t, reduced) {
  const p = POSE;
  p.lift = 0;
  if (reduced) { p.kx = 1; p.ky = 1; return p; }
  const u = Math.max(0, Math.min(1, t));
  p.kx = 1 + 0.35 * u;
  p.ky = 1 - 0.8 * u * u * (3 - 2 * u) - 0.05 * u;
  return p;
}

// The hero's bob: up a pixel on every other step (steps come from distance
// walked, so a still hero never bobs).
export function heroLift(step, moving, reduced) {
  if (!enabled || reduced || !moving) return 0;
  return step % 2;
}
