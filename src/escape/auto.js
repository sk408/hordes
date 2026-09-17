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

// VK9P4 THE APPENDAGE GAUNTLET, as a pure function of the sim. The pilot runs
// the boss beat ON THE GROUND, so only the GROUND arms matter (a `high` arm
// contacts an airborne pilot — the overpass drop is authored to clear it).
// Returns true when it is SAFE to run the ground band NOW: the pilot is clear
// of the danger intervals by the same two-way test the single claw used — a
// window must open only after the pilot would be CLEAR of the whole band
// (start > timeToClear + margin), or be open now but close before the pilot
// REACHES it (end < timeToBand - margin). Both timings are dead reckoning off
// each arm's OWN authored durations plus the GRAB_EVERY recurrence — no
// clocks, no rng, parity-safe. One cycle ahead is sufficient: the per-arm
// cadence is exactly GRAB_EVERY (2.4s), far longer than any crossing.
function gauntletSafe(sim) {
  const b = sim.boss, G = THREATS, p = sim.player;
  const grounds = b.arms.filter(a => !a.high);
  if (!grounds.length) return true;
  // The band the grounded pilot must cross: the union of the ground arms'
  // reach spans, padded like the old claw test (6 in, r + 26 out per arm).
  const bandL = Math.min(...grounds.map(a => b.x - a.reach - a.r));
  const clearX = Math.max(...grounds.map(a => b.x - a.reach + a.r)) + 26;
  const timeToBand = Math.max(0, (bandL - 6 - p.x) / PHYS.RUN_SPEED);
  const timeToClear = Math.max(0, (clearX - p.x) / PHYS.RUN_SPEED);
  for (const g of grounds) {
    const idleDur = G.GRAB_EVERY - (g.windup + g.extend + g.hold + g.retract);
    const dangerSpan = g.extend + g.hold;
    // The next danger interval [s, e] in seconds from NOW (the one the run
    // through the band would meet), per phase, plus the cycle AFTER it (a
    // slow approach may straddle two cycles; two intervals bound it).
    const intervals = [];
    let s, e;
    if (g.phase === 'idle') { s = (idleDur - g.t) + g.windup; e = s + dangerSpan; }
    else if (g.phase === 'windup') { s = g.windup - g.t; e = s + dangerSpan; }
    else if (g.phase === 'extend') { s = 0; e = (g.extend - g.t) + g.hold; }
    else if (g.phase === 'hold') { s = 0; e = g.hold - g.t; }
    else { /* retract */ s = (g.retract - g.t) + idleDur + g.windup; e = s + dangerSpan; }
    intervals.push([s, e], [s + G.GRAB_EVERY, e + G.GRAB_EVERY]);
    for (const [is, ie] of intervals) {
      // UNSAFE iff the danger overlaps the pilot's crossing window [reach
      // band, clear band] — exactly the old claw test, unioned over arms.
      if (is < timeToClear + 0.12 && ie > timeToBand - 0.12) return false;
    }
  }
  return true;
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

  // 2) (VK9P4) THE APPENDAGE GAUNTLET: approaching the boss, brake outside
  // the ground arms' band until dead reckoning says the run through it is
  // safe, then commit (dash if it is up — speed only shrinks the exposure).
  // This is the same dodge-by-timing a manual player reads off the staggered
  // wind-up tells. `high` arms are airborne-only and the pilot is grounded.
  const bandL = sim.boss
    ? Math.min(...sim.boss.arms.filter(a => !a.high).map(a => sim.boss.x - a.reach - a.r))
    : Infinity;
  if (sim.boss && p.x < sim.boss.x && sim.boss.x - p.x < BOSS_APPROACH && p.x < bandL - 6) {
    if (!gauntletSafe(sim)) {
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
