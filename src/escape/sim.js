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


// OWNER SPEC UPDATE (docs/briefs/V1D_ESCAPE_SPECTACLE.md, end section):
// chasers spawn SLIGHTLY OFF-SCREEN behind the camera edge (render.js
// CAM_LEAD 150 — they ENTER from outside the visible band, never pop in),
// on real ground so the pit filter never dooms a fresh body. When the wall
// itself has crowded up to the off-screen band, new chasers POUR from its
// leading edge instead (the horde spitting out its front rank — still an
// entry from outside the clear band, never a mid-screen pop). A step with
// no valid point is SKIPPED and retried next step; the PIT FILTER below is
// unchanged — a chaser led across a gap still falls (pits buy relief, the
// floor below refills, never silence).
const CAM_LEAD = 150;   // render.js: the runner's fixed screen x (keep in sync)
function chaserSpawn(sim) {
  const p = sim.player;
  const FLOOR = BAND.FLOOR_Y;
  const camL = p.x - CAM_LEAD;
  const wallEdge = sim.wall.x + WALL.WIDTH;
  // Ground = the pit filter's own predicate (a platform under x whose top is
  // within 40px above the chaser's feet). Scan a few offsets back so a gap
  // behind the camera edge cannot starve the floor.
  const groundOK = (x) => sim.plats.some(pl =>
    x >= pl.x && x <= pl.x + pl.w && pl.y >= FLOOR - 40);
  for (let k = 0; k < 12; k++) {
    const x = Math.max(wallEdge, camL - THREATS.SPAWN_OFFSCREEN - k * 14);
    if (groundOK(x)) {
      return { x, y: FLOOR, poured: x >= camL };   // poured: out of the wall's face
    }
    if (x <= wallEdge) break;                      // nothing further back exists
  }
  return null;
}

// THE HORDE FLOOR (owner spec): never fewer than CHASER_FLOOR live chasers.
// Called BEFORE the update loop (the run starts hunted) and again AFTER the
// cull filter (a pitted or shot body is replaced the same step), so the
// live count sampled at any step boundary never drops below the floor.
function maintainFloor(sim) {
  // VK9P4 THE KICK suppression: while the tail-clear window runs, the floor
  // does NOT refill — that is the whole point of the kick (a manual player
  // buys a few seconds of empty tail to take their time). The WALL never
  // pauses (the real timer keeps running), so this is bounded relief, not an
  // off switch.
  if (sim.tailT > 0) return;
  while (sim.pursuers.length < THREATS.CHASER_FLOOR) {
    const sp = chaserSpawn(sim);
    if (!sp) return;
    // Stagger same-step refills (seeded rng, purity intact) so a replenished
    // rank does not stack three bodies on one pixel: a normal spawn staggers
    // BACK (never behind the wall's leading edge), a POURED spawn staggers
    // FORWARD out of the wall's face (the horde spitting out its front rank).
    const jitter = Math.floor(sim.rng() * 36);
    const sx = sp.poured
      ? sp.x + Math.floor(sim.rng() * 30)
      : Math.max(sim.wall.x + WALL.WIDTH, sp.x - jitter);
    const gap = sim.player.x - sx;
    sim.pursuers.push({
      x: sx, y: sp.y, hp: THREATS.PURSUER_HP,
      state: 'charge', matchT: 0,
    });
    sim.spawnedPursuers++;
    if (sp.poured) sim.pouredSpawns++;
    else sim.minSpawnGap = Math.min(sim.minSpawnGap, gap);
    sim.maxSpawnGap = Math.max(sim.maxSpawnGap, gap);
  }
}

export function createSim(seed) {
  const corridor = generateCorridor(seed);
  const plats = platformsOf(corridor);
  const triggers = triggersOf(corridor).map(t => ({ ...t, fired: false }));
  const startPlat = plats.filter(pl => pl.x >= 0)[0] || plats[0];   // skip the pre-corridor floor
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
      // VK9P4: the boss's THREE appendages (config THREATS.ARMS), each its own
      // state machine on the ONE shared cadence, staggered by each arm's
      // `offset` (t starts NEGATIVE — an arm with offset 1.6 first moves 1.6s
      // into the rhythm). The `grab` getter is the CLAW row (arms[0]) BY
      // REFERENCE — the V1f seams/tests read AND write the claw through the
      // historical name; the getter keeps them on the SAME object (they
      // cannot drift apart by construction).
      arms: THREATS.ARMS.map(a => ({ ...a, phase: 'idle', t: -a.offset })),
      get grab() { return this.arms[0]; },
    } : null,
    grabbed: null,      // V1f: set the frame the claw closes on the pilot (the visible HELD beat)
    // VK9P4 THE KICK state: kickCd counts down between kicks, tailT counts
    // down the horde-floor suppression window, kickedPursuers is the ledger
    // count (reporting only). AUTO never sets input.kick (auto.js), so the
    // auto path through step() is byte-identical to before.
    kickCd: 0, tailT: 0, kickedPursuers: 0,
    outcome: null,     // null | 'complete' | 'caught' | 'fell'
    rng: mulberry32(seed ^ 0x5f3759df),
    nextFlier: Infinity, nextShot: 0,
    destroyedPlats: [],
    // V1c/owner-spec reporting ledger (pure counters, no behaviour): pursuit
    // pressure is a measured statement — spawned, removed-by-pit, closest
    // approach — plus the horde-floor readings: min/max spawn gap (the
    // off-screen entry proof), wall-pour count, settle count, the minimum
    // live-chaser count sampled every step, and shots fired (the 1/5 rate).
    spawnedPursuers: 0, pittedPursuers: 0, closestPursuit: Infinity,
    minSpawnGap: Infinity, maxSpawnGap: 0, pouredSpawns: 0, settles: 0,
    chasersMin: Infinity, shotsFired: 0,
    // V1b event ledger (pure records, no behaviour): every enemy EXIT gets an
    // event — 'pit' (no ground under it: it FELL) or 'kill' (shot damage: it
    // BURST). The render derives its fall/burst animations from these alone
    // (fx.js); nothing ever reads them back into the sim, so the purity
    // contract (step is a function of (sim, dt, input)) is untouched.
    events: [], eventSeq: 0,
  };
}

// input: { moveX: -1|0|1, jump: bool (EDGE — caller gates repeats), dash: bool,
//          autoClamp: null | {vMin, vMax} }  — autoClamp is how auto.js applies
// the template's speed window INSIDE the band (the brace), never a ramp.
export function step(sim, dt, input = {}) {
  if (sim.outcome) return sim;
  const p = sim.player;

  // ---- V1f THE HELD BEAT: the claw closed on the pilot -----------------------
  // Contact must read as CONTACT (owner: "the pilot visibly held, not clipped
  // through"): the pilot is pinned in the claw, time holds except for the wall
  // (the horde keeps coming — the pressure story), and after GRAB_HOLD_PILOT
  // seconds the soft outcome 'caught' lands. Pure timers, no rng.
  if (sim.grabbed) {
    sim.t += dt; sim.frames++;
    sim.grabbed.t += dt;
    p.x = sim.grabbed.x + 4;            // pinned INTO the closing palm
    p.y = Math.min(BAND.FLOOR_Y, sim.grabbed.y + 10);   // feet 10px under the tip: the body sits IN the grip (tipY row, config)
    p.vx = 0; p.vy = 0; p.onGround = false;
    sim.wall.x += wallSpeed(sim) * dt;
    if (sim.grabbed.t >= THREATS.GRAB_HOLD_PILOT || sim.wall.x + WALL.WIDTH >= p.x) {
      sim.outcome = 'caught';
    }
    return sim;
  }

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

  // ---- VK9P4 THE KICK (manual only — auto.js never sets input.kick) ---------
  // A stomp that clears the chase pack on the runner's tail and holds the
  // horde floor down for KICK_SUPPRESS seconds. BOUNDED by design: the
  // cooldown keeps it to a beat, the suppression is shorter than the
  // cooldown, and the WALL (the real timer) never pauses — a manual player
  // buys room to look, not an off switch.
  sim.kickCd = Math.max(0, sim.kickCd - dt);
  sim.tailT = Math.max(0, sim.tailT - dt);
  if (input.kick && sim.kickCd <= 0) {
    sim.kickCd = THREATS.KICK_CD;
    sim.tailT = THREATS.KICK_SUPPRESS;
    for (const pu of sim.pursuers) {
      const gap = p.x - pu.x;
      if (pu.hp > 0 && gap > 0 && gap <= THREATS.KICK_RANGE) {
        pu.hp = -1; sim.kickedPursuers++;
        sim.events.push({ type: 'kill', x: pu.x, y: pu.y, t: sim.t, n: sim.eventSeq++ });
      }
    }
  }

  // ---- threats --------------------------------------------------------------
  // THE HORDE (owner spec update): a hard floor of live chasers, every step.
  // They spawn slightly OFF-SCREEN behind the camera edge (or pour from the
  // wall's face when it has crowded up to the band), CHARGE at PURSUER_SPEED,
  // and — just before reaching the pilot — MATCH the pilot's run speed, so
  // they close to a hair and hang there. Contact is STRUCTURALLY impossible:
  // the matched speed never exceeds the run, and the hard MATCH_FLOOR keeps
  // the gap above twice the contact radius. Losing is the WALL, not the
  // horde. Chasers still cannot platform: a gap under one removes it (pits
  // buy relief — the floor refills, never silence).
  maintainFloor(sim);
  // Fliers spawn from ESCALATION on; they ignore gaps (the gap-kiting
  // counter). NOTE: fliers NEVER make contact — a runner mid-arc or on the
  // overpass has no vertical control, so sine-phase contact would be
  // UNAVOIDABLE damage (forbidden by acceptance #9) and a seeded-random
  // death (unprovable for parity). Their teeth are the pressure of their
  // presence and the gun's cadence: a shot or two kills any of them.
  // ELEVATED LANES (map scale-up 2026-09-17): a pilot on a raised deck
  // (p.y < FLOOR_Y - FLIER_LANE_DROP) has left the ground horde's reach
  // (chasers cannot platform, structurally), so NEW fliers spawn INTO the
  // pilot's lane instead of the sky — the vertical trade is deliberate: the
  // deck buys relief from the pack and pays for it in flier pressure. The
  // keep-clear cap below still holds (never within 22px of the runner), so
  // the no-unavoidable-damage contract is untouched; pure function of the
  // sim state, parity-safe.
  if (sim.nextFlier === Infinity && p.x > sim.corridor.length * 0.18) sim.nextFlier = 1.0;
  sim.nextFlier -= dt;
  if (sim.nextFlier <= 0) {
    sim.nextFlier = THREATS.FLIER_EVERY + sim.rng() * 1.2;
    const elevated = p.y < BAND.FLOOR_Y - THREATS.FLIER_LANE_DROP;
    const y0 = elevated ? Math.max(2, p.y - THREATS.FLIER_LANE_Y) : 60;
    sim.fliers.push({ x: p.x + 300, y: y0, lane: y0, phase: sim.rng() * Math.PI * 2, hp: THREATS.FLIER_HP });
  }
  for (const pu of sim.pursuers) {
    // CHARGE then MATCH (owner spec): far away a chaser runs PURSUER_SPEED;
    // inside MATCH_HOLD it throttles to the pilot's own pace and settles on
    // their tail (the SETTLE — counted, and given a readable tell in the
    // render). Fields default safely: probes may inject literal {x,y,hp}
    // pursuers; those simply charge.
    if (pu.state === undefined) pu.state = 'charge';
    if (pu.matchT === undefined) pu.matchT = 0;
    const gap = p.x - pu.x;
    const nextState = gap > THREATS.MATCH_HOLD ? 'charge' : 'matched';
    if (nextState === 'matched' && pu.state !== 'matched') { pu.matchT = 0; sim.settles++; }
    pu.state = nextState;
    if (pu.state === 'matched') pu.matchT += dt;
    const spd = pu.state === 'charge' ? THREATS.PURSUER_SPEED : THREATS.PURSUER_MATCH_SPEED;
    pu.x += spd * dt;
    // The hard floor: a chaser NEVER closes inside MATCH_FLOOR of the pilot
    // (> 2x the contact radius). This is the structural half of the
    // speed-match guarantee — the counter-case (match disabled) sets
    // MATCH_FLOOR negative and lets the charge run home into contact.
    if (gap > 0 && pu.x > p.x - THREATS.MATCH_FLOOR) pu.x = p.x - THREATS.MATCH_FLOOR;
    // V1e: the boss's body is SOLID to pursuers. The pack piles up behind
    // the horde's front rank instead of ghosts through it, so the runner's
    // drop off the overpass lands on clear ground — the only things that
    // can catch you past the boss's reach are the wall and the body itself
    // (a mid-fall pursuer contact would be UNAVOIDABLE damage, forbidden).
    if (sim.boss) {
      const bodyL = sim.boss.x - THREATS.BOSS_W / 2 - 6;
      if (pu.x > bodyL) pu.x = bodyL;
    }
    // Enemy filter: no ground under a pursuer -> it falls (removed).
    // V1c: counted — the pit-fall tactic is now reachable, so the ledger
    // says so (reporting only; no behaviour change).
    if (pu.hp > 0 && !sim.plats.some(pl => pu.x >= pl.x && pu.x <= pl.x + pl.w && pl.y >= pu.y - 40)) {
      pu.hp = -1;
      sim.pittedPursuers++;
      sim.events.push({ type: 'pit', x: pu.x, y: pu.y, t: sim.t, n: sim.eventSeq++ });
    }
    sim.closestPursuit = Math.min(sim.closestPursuit, Math.abs(pu.x - p.x));
    if (Math.abs(pu.x - p.x) < THREATS.CONTACT_R && Math.abs(pu.y - p.y) < THREATS.CONTACT_R + 6) { sim.outcome = 'caught'; return sim; }
  }
  sim.pursuers = sim.pursuers.filter(pu => pu.hp > 0 && pu.x < p.x + 320);
  // The floor's SECOND call (after the cull filter): a pitted or shot body is
  // replaced the SAME step, so the live count sampled at any step boundary
  // never drops below CHASER_FLOOR. chasersMin is that sample, kept every step.
  maintainFloor(sim);
  sim.chasersMin = Math.min(sim.chasersMin, sim.pursuers.length);
  for (const fl of sim.fliers) {
    fl.phase += dt * 2.4;
    fl.x -= THREATS.FLIER_SPEED * dt;
    fl.y = (fl.lane != null ? fl.lane : 90) + Math.sin(fl.phase) * 46;
    // V1d altitude keep-clear: a flier never dips within 22px of the runner's
    // CURRENT height. Their teeth are presence (they never contact by
    // construction — see above); this makes the vertical separation
    // STRUCTURAL instead of seed-luck, so the no-unavoidable-damage contract
    // holds for every rng stream (the V1d pack rolls shifted the shared
    // stream and seed 5's sine phases landed on the overpass height).
    const cap = p.y - 22;
    if (fl.y > cap) fl.y = Math.max(2, cap);
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
    if (tgt) { sim.shots.push({ x: p.x + 8, y: p.y - 8, vx: Math.sign(tgt.x - p.x) * THREATS.SHOT_SPEED }); sim.shotsFired++; }
  }
  for (const s of sim.shots) {
    s.x += s.vx * dt;
    for (const e of [...sim.pursuers, ...sim.fliers]) {
      if (e.hp > 0 && Math.abs(e.x - s.x) < 10 && Math.abs(e.y - s.y) < 12) {
        e.hp -= THREATS.SHOT_DMG;
        if (e.hp <= 0) sim.events.push({ type: 'kill', x: e.x, y: e.y, t: sim.t, n: sim.eventSeq++ });
        s.x = Infinity; break;
      }
    }
  }
  sim.shots = sim.shots.filter(s => s.x < p.x + 320 && s.x !== Infinity);

  // ---- the obstacle-boss (UNKILLABLE: hp Infinity by construction) ---------
  if (sim.boss) {
    const b = sim.boss;
    // VK9P4 THE APPENDAGES (owner: "It would be nice for the boss to have
    // multiple appendages"): THREE arms, each its own idle -> windup ->
    // extend -> hold -> retract machine on the ONE shared cadence (the cycle
    // sums to exactly GRAB_EVERY per arm), staggered by each arm's `offset`.
    // The body stays PASSABLE — the pilot sprints past at floor level — and
    // the threats are the arms. Contact is tested ONLY in extend/hold (the
    // arm is out); each arm's `high` flag picks its lane (airborne vs near
    // the floor — the claw's own predicate, one definition), so a pilot who
    // has cleared an arm's band, or arrives during idle/windup/retract, is
    // structurally safe: no invisible hitboxes, no late grabs.
    const G = THREATS;
    for (const g of b.arms) {
      const idleDur = G.GRAB_EVERY - (g.windup + g.extend + g.hold + g.retract);
      g.t += dt;
      if (g.phase === 'idle' && g.t >= idleDur) { g.phase = 'windup'; g.t = 0; }
      else if (g.phase === 'windup' && g.t >= g.windup) { g.phase = 'extend'; g.t = 0; }
      else if (g.phase === 'extend' && g.t >= g.extend) { g.phase = 'hold'; g.t = 0; }
      else if (g.phase === 'hold' && g.t >= g.hold) { g.phase = 'retract'; g.t = 0; }
      else if (g.phase === 'retract' && g.t >= g.retract) { g.phase = 'idle'; g.t = 0; }
      if (g.phase === 'extend' || g.phase === 'hold') {
        const tipX = b.x - g.reach;
        const laneOK = g.high ? p.y <= BAND.FLOOR_Y - 70 : p.y > BAND.FLOOR_Y - 70;
        if (Math.abs(p.x - tipX) < g.r && laneOK) {
          sim.grabbed = { t: 0, x: tipX, arm: g.id, y: BAND.FLOOR_Y - g.tipY };   // the held beat (pinned AT the tip's own height); the outcome lands after it
          return sim;
        }
      }
    }
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

  // Event ledger upkeep: keep only events a fall/burst animation can still be
  // rendering (fx.js caps at 0.8s; 2s is generous). Bounded, deterministic.
  if (sim.events.length && sim.t - sim.events[0].t > 2) {
    sim.events = sim.events.filter(e => sim.t - e.t <= 2);
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
