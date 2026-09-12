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

export const FOCUS_MODES = ['NEAREST', 'TOUGHEST', 'SWARM', 'RANGED'];
export const STANCES = ['SAFE', 'BALANCED', 'GREEDY'];

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
  // aim — it only ranks candidates within FOCUS_RANGE of the player.
  pickTarget(p, state, cfg, nearest) {
    if (this.focus === 'NEAREST' || state.enemies.length === 0) return nearest;
    const r2 = C.AUTOPILOT.FOCUS_RANGE ** 2;

    if (this.focus === 'TOUGHEST') {
      // Highest max-hp enemy in range (kill the big ones first).
      let best = null, bh = -1, bd = Infinity;
      for (const e of state.enemies) {
        if (!alive(e)) continue;
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        if (d > r2) continue;
        if (e.maxHp > bh || (e.maxHp === bh && d < bd)) { bh = e.maxHp; bd = d; best = e; }
      }
      return best ?? nearest;
    }

    if (this.focus === 'RANGED') {
      // Nearest FIRE-CAPABLE enemy (SPITTER / WARLOCK) — silence the shooters
      // before they whittle the player down. RANGED targets are valid at ANY
      // range (Sk408 bug: FOCUS_RANGE 260 left off-screen warlocks free-firing
      // while the volley ignored them); other doctrines keep the 260 cap.
      let best = null, bd = Infinity;
      for (const e of state.enemies) {
        if (!alive(e)) continue;
        if (!RANGED_TYPES.has(e.typeId)) continue;
        const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best ?? nearest;
    }

    // SWARM: enemy in the densest cluster (most enemies within SWARM_CLUSTER_R
    // of the candidate) — point the volley where the horde is thickest.
    const cr2 = C.AUTOPILOT.SWARM_CLUSTER_R ** 2;
    let best = null, bc = -1, bd = Infinity;
    for (const e of state.enemies) {
      if (!alive(e)) continue;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d > r2) continue;
      let count = 0;
      for (const o of state.enemies) {
        if (!alive(o)) continue;
        if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= cr2) count++;
      }
      if (count > bc || (count === bc && d < bd)) { bc = count; bd = d; best = e; }
    }
    return best ?? nearest;
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
      const gd = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
      const len = Math.sqrt(gd) || 1;
      gx = (g.x - p.x) / len;
      gy = (g.y - p.y) / len;
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
    const edge = lootLimit();
    const put = (mx, my) => ({
      moveX: (p.x >= edge && mx > 0) || (p.x <= -edge && mx < 0) ? 0 : mx,
      moveY: (p.y >= edge && my > 0) || (p.y <= -edge && my < 0) ? 0 : my,
      target,
    });

    // Threat response: flee the nearest enemy when it crosses the stance's
    // kite line. GREEDY keeps a foot pointed at the loot even while fleeing.
    // WAVE-19 HYSTERESIS: the branch switch used to be a knife-edge positional
    // threshold — at the boundary the flee vector and the calm gem-drift
    // vector (gems cluster where enemies died, i.e. TOWARD enemies) flipped
    // sign every frame: the pilot vibrated in place. Enter flee inside
    // (kite*2)^2; once fleeing, hold until the threat clears (kite*2*1.3)^2 —
    // a commitment band, not a toggle.
    const enterR2 = (kite * 2) ** 2;
    const exitR2 = (kite * 2 * 1.3) ** 2;
    if (nearest && (this.fleeing ? nd < exitR2 : nd < enterR2)) {
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
