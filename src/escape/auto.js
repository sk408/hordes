// HORDES — V1 escape AUTO controller: the goals doc's template contract made
// real. The templates author SPEED WINDOWS and exact fire lines; the
// controller's whole job is to honour them — clamp into the window at band
// entry, fire the jump ONCE there, and weave the trigger-free boss beat by
// spatial steering (the controller's home turf, per the brief).
//
// PURITY: inputFor(sim) is a pure function of the sim — no clocks, no
// randomness, no profile. Same sim state -> same decision at any frame rate
// (the 60/120Hz parity proof rides this together with sim.step's purity).
// Manual play never calls this module at all (bands are AUTO ONLY by design).
import { pressure } from './sim.js';
import { THREATS, PHYS } from './config.js';

// Free dashes are barred within this distance of an unfired trigger: a dash
// burst (340px/s) would carry the runner across a fire line mid-band.
const CLEAR_AHEAD = 260;
// The grab gauntlet's approach: dashes are barred here so the pilot always
// arrives at the claw band at the readable RUN speed, under steering.
const BOSS_APPROACH = 450;

// V1f THE GRAB GAUNTLET, as a pure function of the sim. Returns true when it
// is SAFE to run the claw band NOW: either the danger window opens only after
// the pilot would be CLEAR of it (dangerIn > timeToClear + margin), or it is
// open now but will close before the pilot REACHES the band (the remaining
// danger is shorter than the approach). Both timings are dead reckoning off
// the machine's own authored durations — no clocks, no rng, parity-safe.
function grabSafe(sim) {
  const b = sim.boss, g = b.grab, G = THREATS;
  const idleDur = G.GRAB_EVERY - (G.GRAB_WINDUP + G.GRAB_EXTEND + G.GRAB_HOLD + G.GRAB_RETRACT);
  let dangerIn, dangerFor;   // seconds until the claw is out / for how long remaining
  if (g.phase === 'idle') { dangerIn = (idleDur - g.t) + G.GRAB_WINDUP; dangerFor = G.GRAB_EXTEND + G.GRAB_HOLD; }
  else if (g.phase === 'windup') { dangerIn = G.GRAB_WINDUP - g.t; dangerFor = G.GRAB_EXTEND + G.GRAB_HOLD; }
  else if (g.phase === 'extend') { dangerIn = 0; dangerFor = (G.GRAB_EXTEND - g.t) + G.GRAB_HOLD; }
  else if (g.phase === 'hold') { dangerIn = 0; dangerFor = G.GRAB_HOLD - g.t; }
  else { /* retract */ dangerIn = (G.GRAB_RETRACT - g.t) + idleDur + G.GRAB_WINDUP; dangerFor = G.GRAB_EXTEND + G.GRAB_HOLD; }
  const p = sim.player;
  const clawL = b.x - G.GRAB_REACH - G.GRAB_R;
  const clearX = b.x - G.GRAB_REACH + G.GRAB_R + 26;   // past the band, still left of the body face
  const timeToBand = Math.max(0, (clawL - 6 - p.x) / PHYS.RUN_SPEED);
  const timeToClear = Math.max(0, (clearX - p.x) / PHYS.RUN_SPEED);
  return dangerIn > 0
    ? dangerIn > timeToClear + 0.12
    : dangerFor < timeToBand - 0.12;
}

export function inputFor(sim) {
  const p = sim.player;
  const input = { moveX: 1, jump: false, dash: false, autoClamp: null };

  // 1) Trigger bands — fire once, at band entry, on the ground, forward. The
  // clamp (a single brace, never a ramp) pins the arc's speed into the window
  // the generator's invariant was authored against. t.fired is the one-way
  // latch: a band can never fire twice, and a fired band is dead geometry.
  const t = sim.triggers.find(t => !t.fired && p.x >= t.x0 - 0.5 && p.x <= t.x1 + 0.5);
  if (t) {
    if (p.onGround) {
      t.fired = true;
      input.autoClamp = { vMin: t.vMin, vMax: t.vMax };
      input.jump = true;
      input.snapX = t.x0;   // the exact authored fire line (see sim.js snap)
    }
    return input;   // inside a live band: nothing else may fire this frame
  }

  // 2) (V1f) THE GRAB GAUNTLET: approaching the boss, brake outside the claw
  // band until dead reckoning says the run through it is safe, then commit
  // (dash if it is up — speed only shrinks the exposure). This is the same
  // dodge-by-timing a manual player reads off the wind-up tell.
  const clawL = sim.boss ? sim.boss.x - THREATS.GRAB_REACH - THREATS.GRAB_R : Infinity;
  if (sim.boss && p.x < sim.boss.x && sim.boss.x - p.x < BOSS_APPROACH && p.x < clawL - 6) {
    if (!grabSafe(sim)) {
      input.moveX = 0;   // hold the line outside the band; the wall is the clock
      return input;
    }
  }

  // 3) Speed is life: burn the dash on COOLDOWN whenever the terrain ahead is
  // clear of unfired bands (a dash burst through a fire line would break the
  // arc). Rule 2 already brakes (and returns) whenever the gauntlet is unsafe,
  // so reaching here inside the gauntlet means the run through the claw band
  // is COMMITTED — and the dash, shrinking the exposure, is its follow-through.
  if (p.onGround && p.dashCd <= 0 &&
      !sim.triggers.some(t => !t.fired && t.x0 > p.x - 64 && t.x0 - p.x < CLEAR_AHEAD)) {
    input.dash = true;
  }
  return input;
}
