// HORDES — character controllers (ARCHITECTURE MANDATE: swappable seam).
// ALL character decisions (movement, attacking) route through a Controller.
// AutoPilot is the phase-one implementation; a PlayerInputController can be
// dropped in later without touching horde/wave/upgrade systems.
//
// Doctrine levers (the "general vs. pilot" controls): the AutoPilot exposes a
// FOCUS POLICY (which enemy the volleys target) and a STANCE DIAL (risk
// appetite for kiting vs. looting). Both are plain controller state, cycled
// from main.js key handling — the controller itself never touches input.
import { CONFIG as C } from './config.js';
import { isReachableLoot, lootLimit } from './entities.js';
import { stageRelief } from './stages.js';
import { reliefRampRoute } from './relief.js';

export const FOCUS_MODES = ['NEAREST', 'TOUGHEST', 'SWARM', 'RANGED'];
export const STANCES = ['SAFE', 'BALANCED', 'GREEDY'];

// AUDIT ROUND 2 (2026-09-16): the SWARM picker's exact O(n^2) density scan is
// kept BYTE-IDENTICAL at or below this horde size (every shipped pick is a
// small-horde pick); above it the grid-scored path takes over (see pickTarget).
export const SWARM_EXACT_MAX = 256;

// RANGED doctrine: enemy types with fire capability get shot FIRST (Sk408
// playtest — the volleys ignored spitters/warlocks while they chipped the
// player down from off-screen).
export const RANGED_TYPES = new Set(['SPITTER', 'WARLOCK']);

// Nearest live enemy scan (shared by both controllers — pickTarget wants it
// as its NEAREST-doctrine fallback). hp<=0 means "already dead, not yet
// reaped": main.js reaps in the same frame but a COLOSSUS death shockwave can
// leave victims at hp<=0 until the next frame, and a corpse is not a target
// (weapons.js nearestEnemy filters the same way). An enemy with no hp field at
// all (probe stubs) still counts as alive.
function alive(e) {
  return !(e.hp <= 0);
}

function nearestEnemy(p, state) {
  let nearest = null, nd = Infinity;
  for (const e of state.enemies) {
    if (!alive(e)) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < nd) { nd = d; nearest = e; }
  }
  return nearest;
}

// A1 ENGAGEMENT RADIUS (the ONE definition lives in config: AUTOPILOT.FOCUS_RANGE
// = owner-set base 100, raised by the 'focus' shop row). EVERY target-selection
// path below is gated on it: beyond the radius the pilot returns NO target, and
// main.js's existing null-target seam holds fire. p.stats.focusRange is the
// per-run value meta.js computes from the purchased levels; a stats-less probe
// point (unit tests, tools) falls back to the config base.
//
// OFFENSE ONLY. This is read by pickTarget and NOTHING else: decide()'s threat
// response (the stance kite line below) deliberately keeps its own radii — a
// threat out past the engagement radius is still walking toward the player, so
// dodging must stay unconditional.
function engagementR2(p) {
  const v = p && p.stats ? p.stats.focusRange : undefined;
  const back = C.AUTOPILOT.FOCUS_RANGE;
  const r = (typeof v === 'number' && Number.isFinite(v) && v > 0) ? v : back;
  return r * r;
}

export class AutoPilotController {
  constructor() {
    this.focus = 'NEAREST';
    this.stance = 'BALANCED';
    // WAVE-19 anti-oscillation state. Both fields self-correct within one
    // frame of a fresh run (a stale gem identity is never in the new run's
    // state.gems => re-pick; no threat near => fleeing clears), so a new
    // controller per page load is reset enough — no reset hooks.
    this.fleeing = false;
    this.gem = null;
    // WAVE-26 ("stance that bites"): the LIVE activity of the pilot this frame,
    // published by main.js as state.stanceAct and printed in the canvas HUD
    // next to the stance name. It is observation only — it never feeds back
    // into movement — but it makes the dial's effect visible moment to moment
    // ('FLEE' = the stance's kite line is doing work, 'LOOT' = it is banking
    // gems, 'PATROL' = neither, 'MANUAL' = the human owns movement).
    this.act = 'PATROL';
  }

  cycleFocus() {
    this.focus = FOCUS_MODES[(FOCUS_MODES.indexOf(this.focus) + 1) % FOCUS_MODES.length];
    return this.focus;
  }

  cycleStance() {
    this.stance = STANCES[(STANCES.indexOf(this.stance) + 1) % STANCES.length];
    return this.stance;
  }

  // Target doctrine: WHICH enemy the auto-attack volleys at. Never manual
  // aim — it only ranks candidates within the engagement radius of the player
  // (A1: AUTOPILOT.FOCUS_RANGE / the 'focus' shop row, via engagementR2), on
  // EVERY path: an enemy beyond it is not a candidate, and if nothing is a
  // candidate the result is null (main.js holds fire).
  pickTarget(p, state, cfg, nearest) {
    const r2 = engagementR2(p);
    // A1 THE OFF-SCREEN FIX. `nearest` is the nearest LIVE enemy, so testing it
    // is enough to know whether ANY enemy is in range (it is the minimum
    // distance); if it fails, every `best` below fails too. NEAREST is the
    // DEFAULT focus, and this early return used to hand back `nearest`
    // unconditionally — which is why the radius was a lie on the path the
    // player actually plays while every enemy spawns at SPAWN_DIST 280 (far
    // outside the 240x150 visible half-extents).
    const near = (nearest && (nearest.x - p.x) ** 2 + (nearest.y - p.y) ** 2 <= r2)
      ? nearest : null;
    if (state.enemies.length === 0) return null;
    if (this.focus === 'NEAREST') return near;

    if (this.focus === 'TOUGHEST') {
      // Highest max-hp enemy in range (kill the big ones first).
      let best = null, bh = -1, bd = Infinity;
      for (const e of state.enemies) {
        if (!alive(e)) continue;
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        if (d > r2) continue;
        if (e.maxHp > bh || (e.maxHp === bh && d < bd)) { bh = e.maxHp; bd = d; best = e; }
      }
      return best ?? near;
    }

    if (this.focus === 'RANGED') {
      // Nearest FIRE-CAPABLE enemy (SPITTER / WARLOCK) — silence the shooters
      // before they whittle the player down. A1 RETARGET: this path used to
      // ignore the radius on purpose ("RANGED targets are valid at ANY range" —
      // a WAVE-era fix for off-screen warlocks free-firing). That contract is
      // gone: the owner's engagement radius is the rule on every focus policy,
      // so a shooter beyond it is NOT targeted (the volley holds fire and the
      // pilot closes the distance / flees under the stance instead). Shooters
      // INSIDE the radius are still shot first, which is what that fix died for.
      let best = null, bd = Infinity;
      for (const e of state.enemies) {
        if (!alive(e)) continue;
        if (!RANGED_TYPES.has(e.typeId)) continue;
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        if (d > r2) continue;
        if (d < bd) { bd = d; best = e; }
      }
      return best ?? near;
    }

    // SWARM: enemy in the densest cluster (most enemies within SWARM_CLUSTER_R
    // of the candidate) — point the volley where the horde is thickest.
    // AUDIT ROUND 2 (2026-09-16): this picker was O(n^2) — every candidate
    // rescanned the whole field — which the benchmark (tools/swarm_bench.mjs)
    // measures in the tens of ms at a 10k horde. HYBRID now: small hordes
    // (<= SWARM_EXACT_MAX) keep the EXACT scan below byte-for-byte, so every
    // shipped pick is unchanged; above it the density score becomes a
    // uniform-grid cell-count sum (cell = SWARM_CLUSTER_R, 3x3 neighbourhood).
    // DISCLOSED APPROXIMATION: the 3x3 sum is an L-infinity superset of the
    // exact L2 disc, so cluster-edge scores can differ from the exact count —
    // only reachable past 256 enemies, where "which dense blob" (not "which
    // member of it") is the decision that matters. O(n) either way; the
    // tie-break comparator is the same on both paths.
    const cr = C.AUTOPILOT.SWARM_CLUSTER_R;
    const cr2 = cr ** 2;
    const enemies = state.enemies;
    let scores = null;
    if (enemies.length > SWARM_EXACT_MAX) {
      const cells = new Map();
      for (const o of enemies) {
        if (!alive(o)) continue;
        const k = Math.floor(o.x / cr) + ',' + Math.floor(o.y / cr);
        cells.set(k, (cells.get(k) || 0) + 1);
      }
      scores = new Map();
      for (const e of enemies) {
        if (!alive(e)) continue;
        const cx = Math.floor(e.x / cr), cy = Math.floor(e.y / cr);
        const key = cx + ',' + cy;
        if (!scores.has(key)) {
          let s = 0;
          for (let gx = cx - 1; gx <= cx + 1; gx++)
            for (let gy = cy - 1; gy <= cy + 1; gy++)
              s += cells.get(gx + ',' + gy) || 0;
          scores.set(key, s);
        }
      }
    }
    let best = null, bc = -1, bd = Infinity;
    for (const e of enemies) {
      if (!alive(e)) continue;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d > r2) continue;
      let count;
      if (scores) {
        count = scores.get(Math.floor(e.x / cr) + ',' + Math.floor(e.y / cr));
      } else {
        count = 0;
        for (const o of enemies) {
          if (!alive(o)) continue;
          if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= cr2) count++;
        }
      }
      if (count > bc || (count === bc && d < bd)) { bc = count; bd = d; best = e; }
    }
    return best ?? near;
  }

  // Returns { moveX, moveY, target } — moveX/moveY normalized direction,
  // target = enemy to fire at (or null to hold fire).
  decide(p, state, cfg) {
    const nearest = nearestEnemy(p, state);
    const nd = nearest
      ? (nearest.x - p.x) ** 2 + (nearest.y - p.y) ** 2
      : Infinity;

    const target = this.pickTarget(p, state, cfg, nearest);
    const st = C.AUTOPILOT.STANCES[this.stance];
    const kite = cfg.KITE_DIST * st.KITE_MULT;

    // Nearest XP gem (loot vector). WAVE-19 STICKINESS: gems sit where enemies
    // died — two at near-equal distances on opposite sides flipped the nearest
    // pick every frame (direction flip-flop). Commit to ONE gem (by identity)
    // and keep chasing it while it is still on the field; re-pick only when it
    // is collected (or a new run brings a field it is not in).
    //
    // WAVE-27 REACHABILITY: an UNREACHABLE gem is never a candidate. Because
    // the commit is by identity, one gem beyond the wall used to hold the
    // pilot for its whole lifetime AND starve every reachable gem behind it —
    // the visible "grinding into the wall" bug. Drops are spawned clamped now
    // (entities.clampLootToArena), so this is defence in depth: the pilot uses
    // the SAME predicate the clamp guarantees.
    if (!state.gems.includes(this.gem)) this.gem = null;
    if (this.gem && !isReachableLoot(this.gem.x, this.gem.y)) this.gem = null;
    if (!this.gem && state.gems.length > 0) {
      let gd = Infinity;
      for (const gm of state.gems) {
        if (!isReachableLoot(gm.x, gm.y)) continue;
        const d = (gm.x - p.x) ** 2 + (gm.y - p.y) ** 2;
        if (d < gd) { gd = d; this.gem = gm; }
      }
    }
    const g = this.gem;
    let gx = 0, gy = 0;
    if (g) {
      // ELEVATION v2 (reliefRampRoute): a gem on the upper path is reached
      // through the RAMPS, not the cliff face — the same route bias the
      // enemy move seam reads, so pilot and horde path the terrain alike.
      // Without it the pilot orbits in the gem's tangential shadow below
      // the face (the stuck-on-a-ledge defect). Null when the direct line
      // is already walkable, so flat-terrain looting is byte-identical.
      const route = reliefRampRoute(p.x, p.y, g.x, g.y,
        state.groundSeed || 0, stageRelief(state.stage));
      if (route) {
        gx = route[0]; gy = route[1];
      } else {
        const gd = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
        const len = Math.sqrt(gd) || 1;
        gx = (g.x - p.x) / len;
        gy = (g.y - p.y) / len;
      }
    }

    // WAVE-27 EDGE HOLD (the grind fix). Every branch below routes its vector
    // through put(): once the pilot is at the working boundary — the arena rim
    // minus the wall band minus the pickup radius, i.e. exactly the limit loot
    // clamps to — it never accumulates OUTWARD pressure. A subject beyond the
    // rim (an enemy still walking in from outside is legitimate and unaffected
    // in every other way, or anything else out there) can therefore no longer
    // pin the pilot into the wall: it holds on the boundary, still fires, and
    // resumes normally the moment the subject comes inside. Manual movement is
    // untouched (PlayerController never routes through here — the human owns
    // movement and the position clamp stops them).
    const lootEdge = lootLimit();
    // P1b: `edge` is a parameter now. The loot edge (lootLimit) is the right
    // boundary for STATIC subjects (a gem/enemy can sit out past it forever,
    // so outward pressure there is a grind). The portal is NOT static — its
    // one-way drift (main.js) re-parks it at STANDOFF of wherever the player
    // stands — so the portal branch below passes the physical rim instead:
    // outward pressure toward the portal always converges, and the loot edge
    // was what pinned the approach (measured: portal forced to x=900 with the
    // player at x=400 froze the pilot at x=566, d=24.0 for 20s, never
    // reaching RADIUS 16 — /tmp probe, 2026-09-14; the orchestrator's own
    // probe measured the same freeze).
    const put = (mx, my, edge = lootEdge) => ({
      moveX: (p.x >= edge && mx > 0) || (p.x <= -edge && mx < 0) ? 0 : mx,
      moveY: (p.y >= edge && my > 0) || (p.y <= -edge && my < 0) ? 0 : my,
      target,
    });

    // FIRST-RUN PROLOGUE (owner 2026-09-18): the auto pilot's FIRST ACT is
    // the walk — straight to the prologue potion. It outranks everything
    // below by necessity: no enemies exist (spawn-suppressed), no gems have
    // dropped, and no portal can open, so every other branch is inert anyway
    // during the phase. The potion sits 100wu above the spawn on flat floor
    // (inside the hollow), so the direct line is always walkable — no relief
    // routing needed. Pickup runs in main.js's drop loop (same pickR as an
    // ordinary potion).
    // ADDENDUM (owner 2026-09-18: the pilot PAUSES for banners — "we haven't
    // given the player any control yet"): while a banner is up (bannerIdx
    // still has one AND the walk clock since the last OK has reached
    // C.PROLOGUE.BANNER_WALK_S — the same gate main.js's prologueBanner()
    // reads) the pilot HOLDS position. Choreography: walk -> banner -> OK ->
    // walk ... -> potion -> drink -> effect.
    if (state.prologue && !state.prologue.drunk) {
      const banners = state.prologue.banners || [];
      // SKIPPED (owner 2026-09-18: "No, potion exists for the skipped
      // tutorial too"): a skipped phase has nothing left to hold for — the
      // walk to the potion runs as normal (main.js's prologueBanner() reads
      // the same skipped flag).
      const bannerUp = !state.prologue.skipped &&
        state.prologue.bannerIdx < banners.length &&
        (state.prologue.walkT || 0) >= C.PROLOGUE.BANNER_WALK_S &&
        // DEFECT (c) completeness: the POTION banner's action is the walk-in
        // itself — a card that freezes the choreography would make its own
        // ask impossible for an idle pilot. Only the EXPLAINING banners hold.
        (banners[state.prologue.bannerIdx] || {}).action !== 'drink';
      if (bannerUp) {
        this.act = 'PROLOGUE_HOLD';
        return put(0, 0);
      }
      const dx = state.prologue.potion.x - p.x;
      const dy = state.prologue.potion.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        this.act = 'PROLOGUE';
        return put(dx / len, dy / len);
      }
    }

    // Threat response: flee the nearest enemy when it crosses the stance's
    // kite line. GREEDY keeps a foot pointed at the loot even while fleeing.
    // A1: this reads `nearest` and its OWN kite radii (enterR2/exitR2 below) and
    // deliberately NOT the engagement radius — the range gates OFFENSE only. A
    // threat beyond the volleys' radius is still coming for the player, so the
    // dodge stays unconditional.
    // WAVE-19 HYSTERESIS: the branch switch used to be a knife-edge positional
    // threshold — at the boundary the flee vector and the calm gem-drift
    // vector (gems cluster where enemies died, i.e. TOWARD enemies) flipped
    // sign every frame: the pilot vibrated in place. Enter flee inside
    // (kite*2)^2; once fleeing, hold until the threat clears (kite*2*1.3)^2 —
    // a commitment band, not a toggle.
    const enterR2 = (kite * 2) ** 2;
    const exitR2 = (kite * 2 * 1.3) ** 2;
    // P1 PORTAL OVERRIDES THE KITE (owner directive 2026-09-14: "Pilot should
    // ignore flee status during the portal sequence. That's why we made it
    // invulnerability."). While state.portal is open and the pilot is steering,
    // main.js refreshes p.invuln to C.PORTAL.INVULN every frame (P1 R3, AUTO
    // only) — kiting buys nothing and costs the run. Measured on the P1
    // acceptance scenario: a lost chest gamble rings the pilot with
    // GAMBLE_HORDE_COUNT CHASERs at GAMBLE_HORDE_RADIUS (90px — well inside the
    // kite line), and the old ordering parked the pilot on the portal's 24px
    // STANDOFF ring (d 21-23) for 30-50s, past the tool's 45s flow budget,
    // because PORTAL.RADIUS is 16 and the FLEE branch never takes that last
    // step in. Evidence: 6-chaser horde -> act=FLEE on EVERY sample for 30s at
    // d=23, PORTAL never re-entered; clearing the same horde -> entry in ~1s.
    // The pilot now walks in and fires on the way; the invuln grant protects.
    if (nearest && !state.portal && (this.fleeing ? nd < exitR2 : nd < enterR2)) {
      this.fleeing = true;
      this.act = 'FLEE';
      const len = Math.sqrt(nd) || 1;
      let fx = (p.x - nearest.x) / len;
      let fy = (p.y - nearest.y) / len;
      // Wall steer (Sk408 bug: pinned at the ±600 clamp with the horde on one
      // side, the raw flee vector points INTO the wall and the player dies in
      // the corner). Cancel the component pushing further outside the rim and
      // keep the tangential part — the player skims along the wall instead.
      // WAVE-27: the rim is the CONFIG-derived working boundary (the old
      // hardcoded 560 duplicated CONFIG.GROUND.RIM by hand and could not know
      // about the wall band or the pickup radius); put() below holds the same
      // edge for every branch.
      const rim = lootLimit();
      if (Math.abs(p.x) > rim && fx * Math.sign(p.x) > 0) fx = 0;
      if (Math.abs(p.y) > rim && fy * Math.sign(p.y) > 0) fy = 0;
      if (fx === 0 && fy === 0) {
        // Corner pin: BOTH components canceled (enemy diagonally inward at
        // the rim corner) — steer straight for the arena center instead of
        // freezing at the clamp while the horde closes.
        fx = -Math.sign(p.x) * 0.7071;
        fy = -Math.sign(p.y) * 0.7071;
      }
      const fl = Math.hypot(fx, fy) || 1;
      fx /= fl; fy /= fl;
      if (this.stance === 'GREEDY' && g) {
        const w = st.LOOT_WEIGHT;
        const bx = fx * (1 - w) + gx * w;
        const by = fy * (1 - w) + gy * w;
        // WAVE-19 MIN VECTOR: opposed flee/gem vectors can collapse the blend
        // to a sub-pixel crawl — a stall while a threat is INSIDE the kite
        // line. Below a real vector, commit to the pure flee vector instead.
        if (Math.hypot(bx, by) >= 0.25) {
          return put(bx, by);
        }
      }
      return put(fx, fy);
    }
    this.fleeing = false;

    // RUN-COUNT MILESTONE CHEST (owner 2026-09-17: "a big chest on the screen
    // that pilot collects"): the pilot beelines for the milestone chest. It
    // sits BELOW the flee branch on purpose — the celebration must not walk
    // the player through a horde (and if the run dies short of the chest,
    // nothing is lost: the claim is at collection, so the next run re-offers
    // it). Above LOOT/PATROL for the same reason as the portal: banking gems
    // while the reward waits would stall the moment. The chest is clamped
    // INSIDE the loot edge at spawn (main.js), so the default put() edge is
    // the right boundary and the direct line always converges.
    if (state.runChest) {
      const cdx = state.runChest.x - p.x;
      const cdy = state.runChest.y - p.y;
      const clen = Math.hypot(cdx, cdy);
      if (clen > 1) {
        this.act = 'CHEST';
        return put(cdx / clen, cdy / clen);
      }
    }

    // P1 PORTAL — the ONE exception to PILOT-BLIND (owner directive
    // 2026-09-14: "the auto pathing heads toward it automatically"). The
    // chase that used to guarantee AUTO entry is deleted, so the pilot must
    // close the last gap itself: while the boss portal is open, steer
    // straight at it. Shrines/chests/arches stay invisible (the
    // src/shrines.js:12 contract is unchanged — this branch reads
    // state.portal and NOTHING else). Priority, stated: the portal OUTRANKS
    // the kite — the flee branch above is gated on !state.portal, because the
    // approach invuln (P1 R3) is the protection and kiting short of the ring
    // is what stranded the pilot; the portal also outranks gem LOOT and PATROL
    // — the corridor is spawn-suppressed and banking gems while the wave waits
    // would stall progression. Already inside STANDOFF? The straight line
    // IS the final step — no orbit logic needed.
    //
    // P1b RIM-PIN (the unwinnable-run fix). Two reachability holes made a
    // legal portal unenterable on AUTO, both measured frozen at d = STANDOFF:
    //   1. The portal opens where the boss fell, UNCLAMPED, while put() held
    //      the pilot at the loot edge (lootLimit() = RIM - WALL - pickup = 566)
    //      — a portal parking past ~590 froze the approach at 24 > RADIUS 16.
    //      The fix is "make the rim reachable", NOT "clamp the spawn": the
    //      portal's own one-way drift already brings it to STANDOFF of
    //      wherever the player stands, so the ONLY missing capability was the
    //      last outward step — and clamping the spawn would move the portal
    //      away from the boss's corpse, which the fiction ("the PORTAL opens
    //      where the boss fell") and the render both promise. So this branch
    //      steers with edge = GROUND.RIM (the physical clamp): outward motion
    //      toward the portal is legal all the way to the wall.
    //   2. A boss can DIE outside the rim entirely (enemy motion is not
    //      rim-clamped — only the player is), parking the portal past
    //      RIM + RADIUS, where NO legal standing spot is close enough to
    //      enter. Then the pilot walks toward the arena center instead: the
    //      drift chases the player and re-parks at STANDOFF of the new
    //      position, i.e. stepping inside lures the portal back into reach.
    //      While the portal drifts toward a player inside the square its
    //      distance to the square is non-increasing, so this hand-off flips
    //      at most once — no oscillation band to tune.
    if (state.portal) {
      const pdx = state.portal.x - p.x, pdy = state.portal.y - p.y;
      const plen = Math.hypot(pdx, pdy) || 1;
      this.act = 'PORTAL';
      const rim = C.GROUND.RIM;
      const outX = Math.max(0, Math.abs(state.portal.x) - rim);
      const outY = Math.max(0, Math.abs(state.portal.y) - rim);
      if (Math.hypot(outX, outY) >= C.PORTAL.RADIUS) {
        // Past every legal standing spot: lure it inward (see hole 2 above).
        const clen = Math.hypot(p.x, p.y) || 1;
        return put(-p.x / clen, -p.y / clen);
      }
      // ELEVATION v2: a portal on the upper path is entered through the
      // ramps (same bias as the gem drift above); the approach invuln is
      // unchanged and the portal's drift re-parks it at STANDOFF regardless.
      const route = reliefRampRoute(p.x, p.y, state.portal.x, state.portal.y,
        state.groundSeed || 0, stageRelief(state.stage));
      if (route) return put(route[0], route[1], rim);
      return put(pdx / plen, pdy / plen, rim);
    }

    // Calm: drift toward the nearest XP gem (SAFE drifts slower).
    if (g) {
      // Same wall-steer as the flee path: a gem at/outside the rim would
      // park the player against the ±600 clamp chasing it (idle-player
      // regression — smoke caught a 3.1s stall at x=561).
      // WAVE-27: CONFIG-derived boundary (see the flee path); unreachable gems
      // are already excluded above, so this is the last line of defence.
      const rim = lootLimit();
      if (Math.abs(p.x) > rim && gx * Math.sign(p.x) > 0) gx = 0;
      if (Math.abs(p.y) > rim && gy * Math.sign(p.y) > 0) gy = 0;
      // A near-axis outward gem leaves an arbitrarily small tangential
      // component after cancellation — sub-pixel crawls read as a stall
      // (smoke caught 3.0s at x=560.1). Below a real vector, patrol instead.
      if (Math.hypot(gx, gy) >= 0.25) {
        this.act = 'LOOT';
        return put(gx * st.XP_SPEED, gy * st.XP_SPEED);
      }
      // Gem dead-ahead (or a crawl) outside the rim — fall through to patrol.
    }
    // Idle fallback (Sk408 bug: no gems + no threat inside the kite line used
    // to park the player center-screen eating ranged chip until death). Slow
    // deterministic patrol: orbit the arena center counter-clockwise, biasing
    // inward past 400px so the orbit never hugs the clamp rim. No randomness.
    {
      const dx = p.x, dy = p.y;                    // arena center is (0,0)
      const len = Math.hypot(dx, dy) || 1;
      const inward = len > 400 ? 0.6 : 0;
      const mx = (-dy / len - (dx / len) * inward) * 0.5;
      const my = (dx / len - (dy / len) * inward) * 0.5;
      this.act = 'PATROL';
      return put(mx, my);
    }
  }
}

// WAVE-13 MANUAL PILOT: the player IS the movement authority. Same interface
// and doctrine levers as AutoPilot (constructor / cycleFocus / cycleStance /
// pickTarget / decide -> { moveX, moveY, target }) — volleys STAY auto-aimed
// via the inherited pickTarget (manual is MOVEMENT ONLY, per the build task).
// WAVE-15 ANALOG: the input object carries BOTH a digital keyboard state
// ({ up, down, left, right } booleans) and a joystick vector ({ x, y, mag } —
// x/y the unit drag direction, mag the deflection fraction 0..1). The stick
// wins whenever it is deflected past JOY_DEAD_ZONE (a light thumb rests on
// the knob without drifting); below that (or released to mag 0) the digital
// keys apply. Partial deflection = partial speed; full tilt in ANY direction
// equals full keyboard speed. Opposite keys cancel; no input at all = {0,0},
// NOT the AutoPilot's kite/patrol logic: manual means manual.
export const JOY_DEAD_ZONE = 0.15;

export class PlayerController extends AutoPilotController {
  constructor(input = {
    up: false, down: false, left: false, right: false,
    x: 0, y: 0, mag: 0,
  }) {
    super();
    this.input = input;
  }

  decide(p, state, cfg) {
    // PROLOGUE ADDENDUM (owner 2026-09-18: "we haven't given the player any
    // control yet"): the MANUAL pilot is inert through the whole first-run
    // phase — the choreography owns the walk (the AUTO branch above), the
    // banners own the screen, and the pilot-mode switch itself is disabled,
    // so a fresh profile cannot even reach MANUAL mid-phase. Held input is
    // swallowed, never queued.
    if (state.prologue) {
      this.act = 'PROLOGUE_HOLD';
      return { moveX: 0, moveY: 0, target: null };
    }
    const target = this.pickTarget(p, state, cfg, nearestEnemy(p, state));
    // WAVE-26: manual movement means the STANCE's kite/XP-drift behaviour is
    // inert (by design — manual means manual). The HUD says so ('MANUAL')
    // instead of claiming a live kite; the stance's loot magnetism still bites.
    this.act = 'MANUAL';
    const i = this.input || {};
    let mx = 0, my = 0;
    const mag = Math.min(1, Math.max(0, i.mag || 0));
    if (mag > JOY_DEAD_ZONE) {
      // Analog stick: re-normalize the direction defensively, scale by the
      // deflection fraction (0..1).
      const len = Math.hypot(i.x || 0, i.y || 0) || 1;
      mx = ((i.x || 0) / len) * mag;
      my = ((i.y || 0) / len) * mag;
    } else {
      // Digital keyboard (WASD/arrows are inherently mag 1).
      mx = (i.right ? 1 : 0) - (i.left ? 1 : 0);
      my = (i.down ? 1 : 0) - (i.up ? 1 : 0);
      if (mx !== 0 && my !== 0) {
        mx *= Math.SQRT1_2;
        my *= Math.SQRT1_2;
      }
    }
    return { moveX: mx, moveY: my, target };
  }
}
