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

export const FOCUS_MODES = ['NEAREST', 'TOUGHEST', 'SWARM', 'RANGED'];
export const STANCES = ['SAFE', 'BALANCED', 'GREEDY'];

// RANGED doctrine: enemy types with fire capability get shot FIRST (Sk408
// playtest — the volleys ignored spitters/warlocks while they chipped the
// player down from off-screen).
export const RANGED_TYPES = new Set(['SPITTER', 'WARLOCK']);

export class AutoPilotController {
  constructor() {
    this.focus = 'NEAREST';
    this.stance = 'BALANCED';
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
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d > r2) continue;
      let count = 0;
      for (const o of state.enemies) {
        if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= cr2) count++;
      }
      if (count > bc || (count === bc && d < bd)) { bc = count; bd = d; best = e; }
    }
    return best ?? nearest;
  }

  // Returns { moveX, moveY, target } — moveX/moveY normalized direction,
  // target = enemy to fire at (or null to hold fire).
  decide(p, state, cfg) {
    let nearest = null, nd = Infinity;
    for (const e of state.enemies) {
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < nd) { nd = d; nearest = e; }
    }

    const target = this.pickTarget(p, state, cfg, nearest);
    const st = C.AUTOPILOT.STANCES[this.stance];
    const kite = cfg.KITE_DIST * st.KITE_MULT;

    // Nearest XP gem (loot vector).
    let g = null, gd = Infinity;
    for (const gm of state.gems) {
      const d = (gm.x - p.x) ** 2 + (gm.y - p.y) ** 2;
      if (d < gd) { gd = d; g = gm; }
    }
    let gx = 0, gy = 0;
    if (g) {
      const len = Math.sqrt(gd) || 1;
      gx = (g.x - p.x) / len;
      gy = (g.y - p.y) / len;
    }

    // Threat response: flee the nearest enemy when it crosses the stance's
    // kite line. GREEDY keeps a foot pointed at the loot even while fleeing.
    if (nearest && nd < (kite * 2) ** 2) {
      const len = Math.sqrt(nd) || 1;
      let fx = (p.x - nearest.x) / len;
      let fy = (p.y - nearest.y) / len;
      // Wall steer (Sk408 bug: pinned at the ±600 clamp with the horde on one
      // side, the raw flee vector points INTO the wall and the player dies in
      // the corner). Cancel the component pushing further outside the rim and
      // keep the tangential part — the player skims along the wall instead.
      const rim = 560;
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
        return { moveX: fx * (1 - w) + gx * w, moveY: fy * (1 - w) + gy * w, target };
      }
      return { moveX: fx, moveY: fy, target };
    }

    // Calm: drift toward the nearest XP gem (SAFE drifts slower).
    if (g) {
      return { moveX: gx * st.XP_SPEED, moveY: gy * st.XP_SPEED, target };
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
      return { moveX: mx, moveY: my, target };
    }
  }
}
