// HORDES — V1 escape SIM: the mode's OWN movement layer (gravity, jump arc,
// land-from-above ledges, lethal-by-soft-fail gaps) plus its threats. It
// NEVER touches the shared overhead movement, p.stats, the draft, loot or
// meta bonuses — self-containment is a design rule (brief HOUSE RULES), so
// no assist and no stat can leak either way.
//
// PURITY CONTRACT (what the 60/120Hz parity proof rides): step() is a pure
// function of (sim, dt, input). All randomness is consumed from the sim's
// OWN seeded rng, spawned on fixed schedules — never Math.random, never a
// wall clock. Failure is ALWAYS SOFT (owner directive): outcome 'caught' or
// 'fell' ends the ESCAPE with no payout; the run itself continues. There is
// no lethal path out of this module.
import { PHYS, BAND, WALL, THREATS, EXIT, PACING } from './config.js';
import { generateCorridor, platformsOf, triggersOf, mulberry32 } from './generator.js';

// The highest platform top under the runner at x (the sim resolves overlaps
// by height — an overlapping higher ledge wins, which is exactly the
// land-from-above rule the generator authors against).
export function groundAt(plats, x, feetY) {
  let best = null;
  for (const p of plats) {
    if (x < p.x || x > p.x + p.w) continue;
    if (p.y > feetY + 0.001) continue;          // top below the feet: not landable from above
    if (!best || p.y < best.y) best = p;        // HIGHEST top wins (smaller y = higher)
  }
  return best;
}

// The act ramp for the wall's pressure: 0..3 by progress fraction.
function wallSpeed(sim) {
  const f = Math.min(1, sim.player.x / sim.corridor.length);
  const v = f < 0.18 ? WALL.V0
    : f < 0.42 ? WALL.V0 + (WALL.V3 - WALL.V0) * ((f - 0.18) / 0.24) * 0.5
      : f < 0.66 ? WALL.V0 + (WALL.V3 - WALL.V0) * (0.5 + ((f - 0.42) / 0.24) * 0.3)
        : WALL.V3;
  return v;
}

export function createSim(seed) {
  const corridor = generateCorridor(seed);
  const plats = platformsOf(corridor);
  const triggers = triggersOf(corridor).map(t => ({ ...t, fired: false }));
  const startPlat = plats[0];
  return {
    seed, corridor, plats, triggers,
    t: 0, frames: 0,
    player: {
      x: startPlat.x + 40, y: startPlat.y, vx: 0, vy: 0,
      onGround: true, dir: 1, dashT: 0, dashCd: 0, clamp: null,
    },
    wall: { x: startPlat.x + 40 - WALL.START_GAP },
    shots: [], pursuers: [], fliers: [],
    boss: corridor.bossX != null ? {
      x: corridor.bossX, plat: corridor.bossPlat,
      destroyT: THREATS.BOSS_DESTROY_EVERY, telegraph: 0, destroyed: 0,
    } : null,
    outcome: null,     // null | 'complete' | 'caught' | 'fell'
    rng: mulberry32(seed ^ 0x5f3759df),
    nextPursuer: 2.2, nextFlier: Infinity, nextShot: 0,
    destroyedPlats: [],
  };
}

// input: { moveX: -1|0|1, jump: bool (EDGE — caller gates repeats), dash: bool,
//          autoClamp: null | {vMin, vMax} }  — autoClamp is how auto.js applies
// the template's speed window INSIDE the band (the brace), never a ramp.
export function step(sim, dt, input = {}) {
  if (sim.outcome) return sim;
  const p = sim.player;
  sim.t += dt; sim.frames++;

  // ---- the escape's own movement layer (never the shared one) --------------
  const wantVx = input.autoClamp
    ? Math.min(input.autoClamp.vMax, Math.max(input.autoClamp.vMin, PHYS.RUN_SPEED * Math.max(0, p.dir)))
    : PHYS.RUN_SPEED * input.moveX;
  if (input.moveX !== undefined && input.moveX !== 0) p.dir = input.moveX;
  // The dash: the ONE verb. A short burst; the wall punishes hesitation.
  if (input.dash && p.dashCd <= 0 && p.dashT <= 0) { p.dashT = PHYS.DASH_TIME; p.dashCd = PHYS.DASH_COOLDOWN; }
  p.dashCd = Math.max(0, p.dashCd - dt);
  if (p.dashT > 0) { p.dashT -= dt; p.vx = PHYS.DASH_SPEED * p.dir; }
  else p.vx = p.dashT > 0 ? p.vx : wantVx;
  if (input.jump && p.onGround) {
    // Snap-to-fire-line: an AUTHORED jump (trigger band or boss hop) carries
    // its exact fire x; the runner snaps to it before leaving the ground (the
    // overshoot is under one frame of travel). Every arc therefore starts at
    // the SAME x at ANY frame rate — this is what makes the 60/120Hz outcome
    // parity hold despite threshold-crossing sampling. The sanity bound keeps
    // a bogus snapX from ever teleporting the runner.
    if (Number.isFinite(input.snapX) && Math.abs(p.x - input.snapX) < 6) p.x = input.snapX;
    p.vy = -PHYS.JUMP_VY; p.onGround = false;
  }

  const prevY = p.y;
  p.vy += PHYS.GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // Land-from-above, with CROSSING semantics (sufficient for ledges by
  // design): a platform top is landed on only when the feet CROSSED it
  // downward during this step (prevY <= top <= p.y). Anything else — a runner
  // who fell PAST a ledge over a gap and drifted sideways into its span —
  // must NOT snap up onto it; those feet keep falling (the teleport-up was a
  // real bug: it materialised runners onto overpasses from below).
  if (p.vy >= 0) {
    let g = null;
    for (const pl of sim.plats) {
      if (p.x < pl.x || p.x > pl.x + pl.w) continue;
      if (prevY <= pl.y + 0.001 && p.y >= pl.y) {
        if (!g || pl.y < g.y) g = pl;    // highest crossed top wins
      }
    }
    if (g) { p.y = g.y; p.vy = 0; p.onGround = true; }
    else p.onGround = false;
  }
  if (p.y > BAND.KILL_Y) { sim.outcome = 'fell'; return sim; }

  // ---- the horde wall (the real timer; visible, never invisible) -----------
  sim.wall.x += wallSpeed(sim) * dt;
  if (sim.wall.x + WALL.WIDTH >= p.x) { sim.outcome = 'caught'; return sim; }

  // ---- threats --------------------------------------------------------------
  // Ground pursuers: spawn from the wall's edge on a fixed schedule, run
  // faster than it, and CANNOT platform — a gap under them removes them
  // (gaps double as enemy filters, the free mechanic the goals doc loves).
  sim.nextPursuer -= dt;
  if (sim.nextPursuer <= 0) {
    sim.nextPursuer = THREATS.PURSUER_EVERY + sim.rng() * 0.7;
    sim.pursuers.push({ x: sim.wall.x, y: BAND.FLOOR_Y, hp: THREATS.PURSUER_HP });
  }
  // Fliers spawn from ESCALATION on; they ignore gaps (the gap-kiting
  // counter). NOTE: fliers NEVER make contact — a runner mid-arc or on the
  // overpass has no vertical control, so sine-phase contact would be
  // UNAVOIDABLE damage (forbidden by acceptance #9) and a seeded-random
  // death (unprovable for parity). Their teeth are the pressure of their
  // presence and the gun's cadence: a shot or two kills any of them.
  if (sim.nextFlier === Infinity && p.x > sim.corridor.length * 0.18) sim.nextFlier = 1.0;
  sim.nextFlier -= dt;
  if (sim.nextFlier <= 0) {
    sim.nextFlier = THREATS.FLIER_EVERY + sim.rng() * 1.2;
    sim.fliers.push({ x: p.x + 300, y: 60, phase: sim.rng() * Math.PI * 2, hp: THREATS.FLIER_HP });
  }
  for (const pu of sim.pursuers) {
    pu.x += THREATS.PURSUER_SPEED * dt;
    // Enemy filter: no ground under a pursuer -> it falls (removed).
    if (!sim.plats.some(pl => pu.x >= pl.x && pu.x <= pl.x + pl.w && pl.y >= pu.y - 40)) pu.hp = -1;
    if (Math.abs(pu.x - p.x) < THREATS.CONTACT_R && Math.abs(pu.y - p.y) < THREATS.CONTACT_R + 6) { sim.outcome = 'caught'; return sim; }
  }
  sim.pursuers = sim.pursuers.filter(pu => pu.hp > 0 && pu.x < p.x + 320);
  for (const fl of sim.fliers) {
    fl.phase += dt * 2.4;
    fl.x -= THREATS.FLIER_SPEED * dt;
    fl.y = 90 + Math.sin(fl.phase) * 46;
  }
  sim.fliers = sim.fliers.filter(fl => fl.hp > 0 && fl.x > sim.wall.x - 40);

  // ---- auto-fire (cosmetic-plus: flat, no stat read anywhere) --------------
  // Bidirectional: pursuers attack from BEHIND (they run faster than the
  // runner), so an ahead-only gun would make the final act unwinnable. The
  // nearest threat within range, either side; a shot or two kills any of them.
  // The gun is hip-height (no elevation): only threats within ~60px of the
  // runner's own height are targeted — a shot fired at an un-hittable flier
  // high overhead would be a wasted cadence tick.
  sim.nextShot -= dt;
  if (sim.nextShot <= 0) {
    sim.nextShot = THREATS.SHOT_EVERY;
    const tgt = [...sim.pursuers, ...sim.fliers]
      .filter(e => e.hp > 0 && Math.abs(e.x - p.x) < 260 && Math.abs(e.y - p.y) < 60)
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    if (tgt) sim.shots.push({ x: p.x + 8, y: p.y - 8, vx: Math.sign(tgt.x - p.x) * THREATS.SHOT_SPEED });
  }
  for (const s of sim.shots) {
    s.x += s.vx * dt;
    for (const e of [...sim.pursuers, ...sim.fliers]) {
      if (e.hp > 0 && Math.abs(e.x - s.x) < 10 && Math.abs(e.y - s.y) < 12) { e.hp -= THREATS.SHOT_DMG; s.x = Infinity; break; }
    }
  }
  sim.shots = sim.shots.filter(s => s.x < p.x + 320 && s.x !== Infinity);

  // ---- the obstacle-boss (UNKILLABLE: hp Infinity by construction) ---------
  if (sim.boss) {
    const b = sim.boss;
    const bossTop = BAND.FLOOR_Y - THREATS.BOSS_H;
    const onBody = p.x > b.x - THREATS.BOSS_W / 2 && p.x < b.x + THREATS.BOSS_W / 2;
    if (onBody && p.y > bossTop + 4) { sim.outcome = 'caught'; return sim; }   // walk into the body: soft
    // Terrain destruction: TELEGRAPHED, and only the route BEHIND THE RUNNER —
    // the pass ahead never closes (fairness rule: no unavoidable fail). Note
    // "behind the boss" would be WRONG here: the player approaches the boss
    // from behind, so the whole corridor so far is behind the boss — the boss
    // would tear out the floor under the player's feet from afar. Behind the
    // RUNNER means already-passed terrain: pure retreat-cutting pressure.
    b.destroyT -= dt;
    if (b.destroyT <= 0) {
      b.destroyT = THREATS.BOSS_DESTROY_EVERY;
      const behind = sim.plats.filter(pl => pl.x + pl.w < p.x - 60 && pl.w > 100 && !pl.approach)
        .sort((a, c) => c.x - a.x)[0];
      if (behind) { b.telegraph = THREATS.BOSS_DESTROY_LEAD; b.target = behind; }
    }
    if (b.telegraph > 0) {
      b.telegraph -= dt;
      if (b.telegraph <= 0 && b.target) {
        const i = sim.plats.indexOf(b.target);
        if (i >= 0) { sim.plats.splice(i, 1); sim.destroyedPlats.push(b.target); b.destroyed++; }
        b.target = null;
      }
    }
  }

  // ---- the exit (P1's portal rules): contact ENDS the sequence immediately -
  if (p.x >= sim.corridor.portalX - EXIT.RADIUS && Math.abs(p.y - BAND.FLOOR_Y) < 120) {
    sim.outcome = 'complete';
  }
  return sim;
}

// Pressure readout (replaces the radar): how far the wall is behind, in px.
export function pressure(sim) {
  return Math.max(0, sim.player.x - (sim.wall.x + WALL.WIDTH));
}

// Duration estimate at NOMINAL speed (the deterministic bound the pacing
// target asserts; the measured reading is deferred under the freeze).
export function nominalSeconds(corridor) {
  return corridor.length / PACING.NOMINAL_SPEED;
}
