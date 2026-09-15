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

// Free dashes are barred within this distance of an unfired trigger: a dash
// burst (340px/s) would carry the runner across a fire line mid-band.
const CLEAR_AHEAD = 260;

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

  // 2) The boss beat has NO triggers — steering only. Authored route: floor ->
  // approach terrace (a plain-jump 42px step) -> overpass OVER the body ->
  // drop past. Both hops are stepped at authored offsets (see generator.js);
  // the body itself is never touched (contact is the soft fail 'caught').
  const c = sim.corridor;
  if (c.bossX != null && p.x > c.bossSegX0 - 200 && p.x < c.bossX && p.onGround) {
    if (p.y > c.bossApproachY + 0.5) {
      // ON THE FLOOR (below the terrace top): hop onto the approach terrace
      // just before it. Strictly-below-the-top matters — standing ON the
      // terrace (y === approachY) must fall through to the hop below.
      if (p.x >= c.bossApproachX - 40 && p.x < c.bossApproachX + c.bossApproachW - 60) {
        input.jump = true;
        input.snapX = c.bossApproachX - 40;
      }
    } else if (Math.abs(p.y - c.bossApproachY) < 1 && p.x >= c.bossOverpassX - 30) {
      // ON THE TERRACE ONLY (y matches its top): hop onto the overpass before
      // the body arrives. The exact-height match matters — a looser test also
      // fires from the overpass itself (a spurious hop mid-crossing).
      input.jump = true;
      input.snapX = c.bossOverpassX - 30;
    }
    return input;   // no clamp through the boss beat; the dash waits for rule 3
  }

  // 3) Speed is life: burn the dash on COOLDOWN whenever the terrain ahead is
  // clear of unfired bands and the boss's HOP WINDOWS (a dash burst through a
  // fire line or an authored hop offset would break the arc). Past the body
  // the dash is free again — the boss beat's exit stretch is dash country.
  if (p.onGround && p.dashCd <= 0 &&
      !sim.triggers.some(t => !t.fired && t.x0 > p.x - 64 && t.x0 - p.x < CLEAR_AHEAD) &&
      !(c.bossX != null && p.x < c.bossX && c.bossX - p.x < CLEAR_AHEAD + 220)) {
    input.dash = true;
  }
  return input;
}
