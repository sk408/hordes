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

  // 2) (V1e) The finale's up-route needs NO steering rule of its own: the two
  // hops are the owner's OWN jump-box bands from the V1 brief — authored fire
  // lines with the speed-window clamp (the fudge) — so rule 1 carries the
  // pilot up and over the boss exactly as it carries every gap. The old
  // spatial-steering rule for the mid-corridor boss beat was superseded and
  // removed; no second mechanism is invented.

  // 3) Speed is life: burn the dash on COOLDOWN whenever the terrain ahead is
  // clear of unfired bands and the FINALE APPROACH (a dash burst through a
  // fire line would break the arc, and dashing into the boss's reach on the
  // ground route is the one place speed kills). Past the body the dash is
  // free again — the finale's exit stretch is dash country.
  const c = sim.corridor;
  if (p.onGround && p.dashCd <= 0 &&
      !sim.triggers.some(t => !t.fired && t.x0 > p.x - 64 && t.x0 - p.x < CLEAR_AHEAD) &&
      !(c.bossX != null && p.x < c.bossX && c.bossX - p.x < CLEAR_AHEAD + 220)) {
    input.dash = true;
  }
  return input;
}
