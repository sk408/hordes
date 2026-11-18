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
import { buildingRects, clearOfBuildings, BUILDING_MOVER_R } from './stage_buildings.js';
import { makeNav, navDirection, navRemaining, straightClear, NAV_PAD } from './pilot_nav.js';
import { stageRelief } from './stages.js';
import { reliefRampRoute } from './relief.js';
import {
  terrainFor, floorAt, terrainLineClear, flowField, flowDir, nodeOf, cellIx,
  exitField, TNN, TCELL, FLOW_INF, HIGH_TIER,
} from './terrain.js';
import { VAULT, gateOutside } from './vault.js';

// M5b LANDSCAPE: the pilot's per-cell building mask (cells a route may not
// enter), cached on the terrain object per building field. A building grows
// by the mover's ring. A yard wall (vault.js) is thinner than a cell: it
// grows half a cell across, so a row of cells always covers it, and not at
// all along its length, so a cell always stands in the open gate.
export function pilotBlock(T, rects) {
  if (T.blockFor === rects) return T.block;
  const b = new Uint8Array(TNN);
  const N = Math.round(Math.sqrt(TNN)), H = (N * TCELL) / 2;
  for (const r of rects) {
    let mx = BUILDING_MOVER_R, my = BUILDING_MOVER_R;
    if (r.yard) { mx = r.w < r.h ? TCELL / 2 : 0; my = r.w < r.h ? 0 : TCELL / 2; }
    for (let gy = 0; gy < N; gy++) {
      const cy = -H + gy * TCELL + TCELL / 2;
      if (cy < r.y - my || cy > r.y + r.h + my) continue;
      for (let gx = 0; gx < N; gx++) {
        const cx = -H + gx * TCELL + TCELL / 2;
        if (cx >= r.x - mx && cx <= r.x + r.w + mx) b[gy * N + gx] = 1;
      }
    }
  }
  T.blockFor = rects; T.block = b;
  return b;
}

// The walled yard's outer box (vault.js), or null. Open, it is a dead end to
// the flee; shut, nothing inside it can be reached.
function yardBox(state) {
  const y = state.poi && state.poi.yard;
  if (!y) return null;
  const hw = VAULT.YARD_W / 2, hh = VAULT.YARD_H / 2;
  return { x0: y.x - hw, y0: y.y - hh, x1: y.x + hw, y1: y.y + hh, yard: y };
}
const inBox = (b, x, y) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
// Inside the yard, or on the step just outside its gate (so the walk out
// carries clear of the walls before the plain flee takes over).
const YARD_PORCH = 12;
function inYardDeadEnd(b, x, y) {
  if (inBox(b, x, y)) return true;
  const g = b.yard.gateSide, ns = g === 'n' || g === 's';
  const side = ns ? Math.abs(x - b.yard.x) : Math.abs(y - b.yard.y);
  const out = g === 'n' ? b.y0 - y : g === 's' ? y - b.y1 : g === 'w' ? b.x0 - x : x - b.x1;
  return side < VAULT.GATE_W / 2 && out >= 0 && out < YARD_PORCH;
}
// Does the walk from (x, y) along (dx, dy) for `look` px come within the
// mover's ring of the box?
function entersBox(b, x, y, dx, dy, look) {
  const m = BUILDING_MOVER_R;
  for (let t = look / 4; t <= look; t += look / 4) {
    const qx = x + dx * t, qy = y + dy * t;
    if (qx > b.x0 - m && qx < b.x1 + m && qy > b.y0 - m && qy < b.y1 + m) return true;
  }
  return false;
}

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

// Stall detection while the pilot walks at a goal (gem / chest / portal), in
// decide() frames. A goal is stalled when the pilot's net displacement over
// one period stays under STALL_SPAN_PX, or when the distance left has not
// improved by STALL_GAIN_PX for STALL_NO_GAIN_FRAMES.
export const STALL_PERIOD_FRAMES = 180;
export const STALL_SPAN_PX = 6;
export const STALL_NO_GAIN_FRAMES = 900;
export const STALL_GAIN_PX = 8;
// Patrol looks this far ahead for a building before routing around it.
const PATROL_LOOK = 24;

// Nearest live enemy scan (shared by both controllers — pickTarget wants it
// as its NEAREST-doctrine fallback). hp<=0 means "already dead, not yet
// reaped": main.js reaps in the same frame but a COLOSSUS death shockwave can
// leave victims at hp<=0 until the next frame, and a corpse is not a target
// (weapons.js nearestEnemy filters the same way). An enemy with no hp field at
// all (probe stubs) still counts as alive.
function alive(e) {
  return !(e.hp <= 0);
}

// R1 PILOT STEERING (2026-11-18). Steve, playing on galaxy.click: "the pathing is causing
// the hero to jitter a bit too much ... and it shakes the screen around", then "maybe you
// should look at improving pilot pathing overall".
//
// The flee used to be one vector: straight away from the NEAREST enemy. Measured over 48
// real runs it reversed 10 times a second (between two threats a step away from one made
// the other the nearest, and the next frame stepped back; pressed into a building corner it
// bounced in and out; its escape sweep took alternate sides on alternate frames), and a flee
// that did work ran straight to the rim and ground along the wall.
//
// Now the flee scores HEADS candidate headings every frame and walks the best open one:
//   + away from the threats: every live enemy inside the kite band, nearer ones heavier;
//   - a heading that points AT a nearby enemy (so between threats the gaps win);
//   + toward the arena centre, more the nearer the rim (the flee bends round the horde);
//   - outward inside WALL_W of a wall (it turns along the wall before it reaches it);
//   + toward a gem that is on its way (BALANCED only);
//   + the heading it already has (no dithering between two equal ways out).
// Nothing here changes WHEN the pilot flees (the kite line) or what it shoots.
export const STEER = {
  DANGER: 1.0,     // weight of "this heading points at a nearby enemy"
  CENTER: 0.9,     // pull toward the arena centre, x (distance from centre / rim)^2
  WALL: 2.0,       // cost of heading outward at the working rim, fading over WALL_W
  WALL_W: 180,     // px from the working rim where that cost starts
  GEM_R: 110,      // a gem this close, in a safe direction, draws the flee to it
  GEM_W: 0.45,     // how hard (BALANCED; SAFE never, GREEDY has its own LOOT_WEIGHT blend)
  STICK: 0.15,     // preference for the heading already taken
  LEAN: 1.0,       // on high ground far from a way down: toward the nearest ramp or drop edge
  TURN: 10,        // the flee heading turns at most this fast, rad/s (a half turn takes 0.3 s)
  TRY: 48,         // how many of the best headings are checked for a clear line (all of them:
                   // cornered between buildings and the horde, the 17th best may be the way out)
  CALM_R: 1.5,     // calm moves (gem drift, patrol) mind threats within this x the kite band
  CALM_K: 3,       // how hard a calm move bends away from a heading that points at one
  HEAD_S: 0.1,     // a heading older than this (s) no longer limits the next turn
};

// Turn the unit heading `prev` toward (x, y) by at most maxA radians.
function turnToward(prev, x, y, maxA) {
  const ang = Math.atan2(prev[0] * y - prev[1] * x, prev[0] * x + prev[1] * y);
  if (Math.abs(ang) <= maxA) return [x, y];
  const a = Math.sign(ang) * maxA, c = Math.cos(a), sn = Math.sin(a);
  return [prev[0] * c - prev[1] * sn, prev[0] * sn + prev[1] * c];
}
export const HEADS = 48;
const HX = new Float64Array(HEADS), HY = new Float64Array(HEADS);
for (let i = 0; i < HEADS; i++) { const a = i * 2 * Math.PI / HEADS; HX[i] = Math.cos(a); HY[i] = Math.sin(a); }
HX[0] = 1; HY[0] = 0; HX[HEADS / 4] = 0; HY[HEADS / 4] = 1;                  // the axes, exactly
HX[HEADS / 2] = -1; HY[HEADS / 2] = 0; HX[3 * HEADS / 4] = 0; HY[3 * HEADS / 4] = -1;

// The threats around p: unit directions TO every live enemy within R and their weights
// (1 - d/R)^2, continuous in position. With none inside R, the nearest alone.
export function fleeThreats(p, state, nearest, R) {
  const th = { x: [], y: [], w: [], sum: 0 };
  const add = (e, w) => {
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    th.x.push(d > 1e-6 ? dx / d : 1); th.y.push(d > 1e-6 ? dy / d : 0); th.w.push(w); th.sum += w;
  };
  for (const e of state.enemies) {
    if (!alive(e)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < R) { const k = 1 - d / R; add(e, k * k); }
  }
  if (!(th.sum > 0) && nearest) add(nearest, 1);
  return th;
}
// What the threats say of heading (hx, hy): [away, danger]. away is 1 straight away from all
// of them and -1 straight at them (near 0 when they cancel); danger is the weighted share of
// them the heading points at.
export function threatAt(th, hx, hy) {
  if (!(th.sum > 0)) return [0, 0];
  let away = 0, danger = 0;
  for (let i = 0; i < th.w.length; i++) {
    const c = hx * th.x[i] + hy * th.y[i];
    away -= th.w[i] * c;
    if (c > 0) danger += th.w[i] * c * c;
  }
  return [away / th.sum, danger / th.sum];
}
// The score of every heading. `L` is the working rim (lootLimit); o: { gem, prev, lean },
// unit vectors or null.
export function fleeScores(p, th, L, o = {}) {
  const s = new Float64Array(HEADS);
  const cl = Math.hypot(p.x, p.y);
  const kC = cl > 1 ? STEER.CENTER * Math.min(1, Math.max(Math.abs(p.x), Math.abs(p.y)) / L) ** 2 : 0;
  const cx = cl > 1 ? -p.x / cl : 0, cy = cl > 1 ? -p.y / cl : 0;
  const wx = p.x >= 0 ? 1 : -1, wy = p.y >= 0 ? 1 : -1;           // the nearer walls' outward normals
  const nX = Math.max(0, 1 - Math.max(0, L - Math.abs(p.x)) / STEER.WALL_W);
  const nY = Math.max(0, 1 - Math.max(0, L - Math.abs(p.y)) / STEER.WALL_W);
  for (let i = 0; i < HEADS; i++) {
    const hx = HX[i], hy = HY[i];
    const [away, danger] = threatAt(th, hx, hy);
    let v = away - STEER.DANGER * danger + kC * (hx * cx + hy * cy);
    if (nX > 0) v -= STEER.WALL * Math.max(0, hx * wx) * nX * nX;
    if (nY > 0) v -= STEER.WALL * Math.max(0, hy * wy) * nY * nY;
    if (o.gem) v += STEER.GEM_W * Math.max(0, hx * o.gem[0] + hy * o.gem[1]);
    if (o.prev) v += STEER.STICK * (hx * o.prev[0] + hy * o.prev[1]);
    if (o.lean) v += STEER.LEAN * (hx * o.lean[0] + hy * o.lean[1]);
    s[i] = v;
  }
  return s;
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
  let r = (typeof v === 'number' && Number.isFinite(v) && v > 0) ? v : back;
  if (p && p.highGround) r *= C.TERRAIN.HIGH_RANGE_MULT;   // M5b: high ground reaches farther
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
    this.head = null;      // the heading of the last steered move (the turn limit, the stick)
    this.headT = null;     // state.time of that move
    this.fleeGem = null;   // the gem the flee is bending to
    this.dropGem = false;  // a flee just ended: re-pick the calm gem
    this.gem = null;
    // Building navigation: the current route, the goal-progress tracker, and
    // the goals given up on as unreachable.
    this.nav = makeNav();
    this.prog = { key: null, tick: -1 };
    this.tick = 0;
    this.skipGems = new WeakSet();
    this.skipChest = null;
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

  // Progress watchdog for the goal `key` (an object identity). `left` is the
  // walking distance remaining. Returns true when the goal has stalled.
  stalled(key, p, left) {
    const g = this.prog;
    if (g.key !== key || g.tick !== this.tick - 1) {
      this.prog = { key, tick: this.tick, ax: p.x, ay: p.y, n: 0, best: left, since: 0 };
      return false;
    }
    g.tick = this.tick;
    if (left < g.best - STALL_GAIN_PX) { g.best = left; g.since = 0; }
    else if (++g.since >= STALL_NO_GAIN_FRAMES) { g.key = null; return true; }
    if (++g.n >= STALL_PERIOD_FRAMES) {
      const span = Math.hypot(p.x - g.ax, p.y - g.ay);
      g.n = 0; g.ax = p.x; g.ay = p.y;
      if (span < STALL_SPAN_PX) { g.key = null; return true; }
    }
    return false;
  }

  // Returns { moveX, moveY, target } — moveX/moveY normalized direction,
  // target = enemy to fire at (or null to hold fire). A move that follows a
  // building route also carries routed: true and stepCap (px to the waypoint
  // being walked at; the motion seam must not step past it).
  decide(p, state, cfg) {
    this.tick++;
    // The clock of the steering: with one, a heading older than HEAD_S is forgotten; a
    // probe with no clock (unit tests, tools) counts every call as the next frame.
    const now = typeof state.time === 'number' ? state.time : null;
    const headAge = now !== null && this.headT !== null ? now - this.headT : 1 / 60;
    const lastHead = this.head && headAge >= 0 && headAge <= STEER.HEAD_S ? this.head : null;
    const maxTurn = STEER.TURN * (headAge > 0 && headAge <= 0.05 ? headAge : 1 / 60);
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
    //
    // PORT SLICE F (building collision, owner-ruled 2026-09-22): a gem deep
    // inside a building footprint is the same shape — the pilot can press
    // the wall forever without the pickup radius ever reaching it. The field
    // is queried ONCE per frame (pure in seed/stage, a couple dozen boxes) and the
    // interior test rides the same commit/drop shape as the rim test above.
    const bRects = buildingRects(state.groundSeed || 0, state.stage);
    // The walled yard: shut, a gem inside it has no way in either.
    const yardB = yardBox(state);
    const yb = yardB && yardB.yard.open ? yardB : null;
    const inBricks = (x, y) => {
      for (const r of bRects) {
        if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
      }
      return !!yardB && !yb && inBox(yardB, x, y);
    };
    if (this.dropGem) { this.gem = null; this.dropGem = false; }
    if (!state.gems.includes(this.gem)) this.gem = null;
    if (this.gem && !isReachableLoot(this.gem.x, this.gem.y)) this.gem = null;
    if (this.gem && inBricks(this.gem.x, this.gem.y)) this.gem = null;
    if (!this.gem && state.gems.length > 0) {
      // R1 PILOT STEERING: the nearest gem that no live enemy stands within the kite line
      // of; only when there is none, the nearest of all (as before). Walking at a gem in
      // the middle of the pack turned the pilot round again a moment later.
      const safeR2 = (kite * 2) ** 2;
      const crowded = (gm) => {
        for (const e of state.enemies) if (alive(e) && (e.x - gm.x) ** 2 + (e.y - gm.y) ** 2 < safeR2) return true;
        return false;
      };
      let gd = Infinity, anyD = Infinity, any = null;
      for (const gm of state.gems) {
        if (!isReachableLoot(gm.x, gm.y)) continue;
        if (inBricks(gm.x, gm.y)) continue;
        if (this.skipGems.has(gm)) continue;
        const d = (gm.x - p.x) ** 2 + (gm.y - p.y) ** 2;
        if (d < anyD) { anyD = d; any = gm; }
        if (d < gd && !crowded(gm)) { gd = d; this.gem = gm; }
      }
      if (!this.gem) this.gem = any;
    }
    const g = this.gem;
    let gx = 0, gy = 0;
    let gemRamp = false;   // the gem vector is a relief ramp route
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
        gemRamp = true;
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
    // Building route toward (tx, ty): null while the straight walk is clear
    // (the caller keeps its own vector and passes it through direct()) or
    // when no route is known; otherwise the move along the route at `mag`.
    // The route ends at the nearest standable point to the goal. `left` is
    // the walking distance remaining.
    let left = 0;
    let lineClear = false;
    // A straight move the planner found clear is final too: flag it routed so
    // the motion seam's stateless corner-steer cannot second-guess it.
    const direct = (m) => {
      if (lineClear) { m.routed = true; m.stepCap = Infinity; }
      return m;
    };
    // M5b LANDSCAPE: a goal across a cliff is walked through the ramps — a
    // flow field from the goal (a few kept per pilot), buildings masked.
    const TER = terrainFor(state.groundSeed || 0, state.stage);
    const pz = TER ? floorAt(TER, p.x, p.y, p.tz || 0) : 0;
    const terrainRoute = (tx, ty, mag) => {
      if (!TER || terrainLineClear(TER, p.x, p.y, pz, tx, ty)) return null;
      const gn = nodeOf(TER, cellIx(tx, ty), floorAt(TER, tx, ty, 0));
      // The kept fields belong to one mask: a new one (the gate opened) drops them.
      const blk = pilotBlock(TER, bRects);
      if (!this.tflows || this.tflows.T !== TER || this.tflows.blk !== blk) this.tflows = { T: TER, blk, list: [] };
      let F = null;
      for (const f of this.tflows.list) if (f.node === gn) F = f.F;
      if (!F) {
        F = flowField(TER, [gn], blk);
        this.tflows.list.unshift({ node: gn, F });
        if (this.tflows.list.length > 4) this.tflows.list.pop();
      }
      const un = nodeOf(TER, cellIx(p.x, p.y), pz);
      if (F.dist[un] >= FLOW_INF) return null;
      const d = flowDir(TER, F, p.x, p.y, pz);
      if (!d) return null;
      left = F.dist[un] * (TCELL / 2);
      const m = put(d[0] * mag, d[1] * mag, C.GROUND.RIM);
      m.routed = true;
      m.stepCap = Infinity;
      return m;
    };
    const routeTo = (tx, ty, mag) => {
      const tr = terrainRoute(tx, ty, mag);
      if (tr) { lineClear = false; return tr; }
      left = Math.hypot(tx - p.x, ty - p.y);
      lineClear = straightClear(bRects, p.x, p.y, tx, ty);
      if (lineClear) { this.nav.path = null; return null; }
      const s = clearOfBuildings(bRects, tx, ty, BUILDING_MOVER_R + NAV_PAD, C.GROUND.RIM);
      const d = navDirection(this.nav, bRects, p.x, p.y, s[0], s[1]);
      if (!d) return null;
      left = navRemaining(this.nav, p.x, p.y, s[0], s[1]);
      const m = put(d[0] * mag, d[1] * mag, C.GROUND.RIM);
      m.routed = true;
      m.stepCap = d[2];
      return m;
    };

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
      // ADDENDUM 3 (owner 2026-09-18 — focus/stance/scripted draft): with
      // seven explaining banners the accumulated walk windows now carry the
      // pilot to the potion BEFORE the lessons finish, ending the phase
      // mid-tutorial. The choreography therefore homes on the potion only
      // once the DRINK banner is the current card (or the phase is skipped,
      // which has nothing left to explain); until then the pilot HOLDS
      // between cards too. The cadence is TIME-driven (walkT accrues by wall
      // clock in main.js), so the banners still rise on schedule.
      if (!state.prologue.skipped &&
          (banners[state.prologue.bannerIdx] || {}).action !== 'drink') {
        this.act = 'PROLOGUE_HOLD';
        return put(0, 0);
      }
      const dx = state.prologue.potion.x - p.x;
      const dy = state.prologue.potion.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        this.act = 'PROLOGUE';
        // A footprint can stand across the spawn -> potion line: walk round it.
        return routeTo(state.prologue.potion.x, state.prologue.potion.y, 1) ||
          direct(put(dx / len, dy / len));
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
      // The open walled yard is a dead end: inside it, flee out through the gate.
      if (yb && inYardDeadEnd(yb, p.x, p.y)) {
        const [ox, oy] = gateOutside(yb.yard);
        const ol = Math.hypot(ox - p.x, oy - p.y) || 1;
        return routeTo(ox, oy, 1) || direct(put((ox - p.x) / ol, (oy - p.y) / ol));
      }
      // R1 PILOT STEERING (see STEER above): score every heading, walk the best open one.
      const prevFlee = lastHead;
      const rimL = lootLimit();
      const th = fleeThreats(p, state, nearest, Math.sqrt(exitR2));
      // A gem on the way (BALANCED): near, reachable, and in a direction the threats leave
      // free. One gem is kept until it is taken or stops being safe (no weaving between two).
      let gemDir = null;
      if (this.stance === 'BALANCED' && STEER.GEM_W > 0 && state.gems.length > 0) {
        const ok = (gm, slack) => {
          const dx = gm.x - p.x, dy = gm.y - p.y, d = Math.hypot(dx, dy) || 1;
          if (d > STEER.GEM_R * slack) return 0;
          const [aw, dg] = threatAt(th, dx / d, dy / d);
          return aw > (slack > 1 ? -0.25 : -0.1) && dg < (slack > 1 ? 0.25 : 0.15) ? d : 0;
        };
        let fg = this.fleeGem;
        if (fg && !(state.gems.includes(fg) && ok(fg, 1.3))) fg = null;
        if (!fg) {
          let bd = Infinity;
          for (const gm of state.gems) {
            const d = ok(gm, 1);
            if (d && d < bd && isReachableLoot(gm.x, gm.y) && !inBricks(gm.x, gm.y) && !this.skipGems.has(gm)) { bd = d; fg = gm; }
          }
        }
        this.fleeGem = fg;
        if (fg) {
          const d = Math.hypot(fg.x - p.x, fg.y - p.y) || 1;
          gemDir = [(fg.x - p.x) / d, (fg.y - p.y) / d];
        }
      } else this.fleeGem = null;
      // M5b LANDSCAPE: on high ground far from a way down, lean toward the nearest ramp
      // or drop edge (never kite into a dead-end plateau).
      let lean = null;
      if (TER && pz >= HIGH_TIER) {
        const ex = exitField(TER);
        const ed = ex.dist[nodeOf(TER, cellIx(p.x, p.y), pz)] * (TCELL / 2);
        const xd = flowDir(TER, ex, p.x, p.y, pz);
        if (xd && ed > 72) lean = xd;
      }
      const scores = fleeScores(p, th, rimL, { gem: gemDir, prev: prevFlee, lean });
      // A heading is open when no cliff blocks it, it does not run into the open yard (the
      // way back into the dead end), and no building stands in it (a flee pressed into a
      // corner of footprints bounced in and out of it on every frame).
      const LOOK = 40;
      const fleeOpen = (rx, ry) =>
        (!TER || terrainLineClear(TER, p.x, p.y, pz, p.x + rx * LOOK, p.y + ry * LOOK)) &&
        !(yb && entersBox(yb, p.x, p.y, rx, ry, LOOK)) &&
        straightClear(bRects, p.x, p.y, p.x + rx * LOOK, p.y + ry * LOOK);
      let fx = 0, fy = 0, pick = -1;
      {
        const used = new Uint8Array(HEADS);
        for (let k = 0; k < STEER.TRY && pick < 0; k++) {
          let bi = -1;
          for (let i = 0; i < HEADS; i++) if (!used[i] && (bi < 0 || scores[i] > scores[bi])) bi = i;
          used[bi] = 1;
          if (k === 0) { fx = HX[bi]; fy = HY[bi]; }             // nothing open: the best anyway
          if (fleeOpen(HX[bi], HY[bi])) pick = bi;
        }
      }
      if (pick >= 0) {
        // Between this heading and its neighbours: the top of the parabola through the three
        // scores, so the walk is not quantised to 7.5 degree steps.
        const s0 = scores[pick], sm = scores[(pick + HEADS - 1) % HEADS], sp = scores[(pick + 1) % HEADS];
        const den = sm - 2 * s0 + sp;
        const off = den < -1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5 * (sm - sp) / den)) : 0;
        fx = HX[pick]; fy = HY[pick];
        if (Math.abs(off) > 1e-6) {
          const a = (pick + off) * 2 * Math.PI / HEADS;
          const rx = Math.cos(a), ry = Math.sin(a);
          if (fleeOpen(rx, ry)) { fx = rx; fy = ry; }
        }
      } else if (TER) {
        const xd = flowDir(TER, exitField(TER), p.x, p.y, pz);
        if (xd) { fx = xd[0]; fy = xd[1]; }
      }
      // The heading turns at a limited rate: direction changes are arcs, not snaps, and
      // no rule above can make the hero step back and forth on alternate frames.
      if (prevFlee && STEER.TURN > 0) [fx, fy] = turnToward(prevFlee, fx, fy, maxTurn);
      this.head = [fx, fy]; this.headT = now;
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
    if (this.fleeing) this.dropGem = true;   // the calm gem is picked afresh once the threat has passed
    this.fleeing = false;
    this.fleeGem = null;
    if (now === null) this.head = null;   // no clock: a flee always starts fresh
    // R1 PILOT STEERING: a calm move (gem drift, patrol, a site walk). A straight one bends
    // away from threats that are near but outside the kite line (walking straight at them
    // only turned the pilot round again a moment later). Every one turns at the flee's
    // rate, so leaving a flee is an arc and not a reversal; a move along a building route
    // (bend false) is only turned, and is handed on untouched once the heading has come round.
    const calm = (m, bend = true) => {
      const ml = Math.hypot(m.moveX, m.moveY);
      if (now === null || !(ml > 0)) return m;
      let hx = m.moveX / ml, hy = m.moveY / ml, bent = false;
      const Rc = Math.sqrt(exitR2) * STEER.CALM_R;
      if (bend && nearest && nd < Rc * Rc) {
        const th = fleeThreats(p, state, null, Rc);
        // Here a threat weighs sqrt of its flee weight, 1 - d/Rc: the bend starts well
        // before the kite line, not at it.
        const cost = (x, y) => {
          let dg = 0;
          for (let i = 0; i < th.w.length; i++) { const c = x * th.x[i] + y * th.y[i]; if (c > 0) dg += Math.sqrt(th.w[i]) * c * c; }
          return dg;
        };
        if (cost(hx, hy) > 0.02) {
          let bi = -1, bs = -Infinity;
          for (let i = 0; i < HEADS; i++) {
            const v = HX[i] * hx + HY[i] * hy - STEER.CALM_K * cost(HX[i], HY[i]) +
              (lastHead ? STEER.STICK * (HX[i] * lastHead[0] + HY[i] * lastHead[1]) : 0);
            if (v > bs) { bs = v; bi = i; }
          }
          hx = HX[bi]; hy = HY[bi]; bent = true;
        }
      }
      if (lastHead && STEER.TURN > 0) {
        const t = turnToward(lastHead, hx, hy, maxTurn);
        if (t[0] !== hx || t[1] !== hy) { hx = t[0]; hy = t[1]; bent = true; }
      }
      this.head = [hx, hy]; this.headT = now;
      return bent ? put(hx * ml, hy * ml) : m;
    };

    // RUN-COUNT MILESTONE CHEST (owner 2026-09-17: "a big chest on the screen
    // that pilot collects"): the pilot beelines for the milestone chest. It
    // sits BELOW the flee branch on purpose — the celebration must not walk
    // the player through a horde (and if the run dies short of the chest,
    // nothing is lost: the claim is at collection, so the next run re-offers
    // it). Above LOOT/PATROL for the same reason as the portal: banking gems
    // while the reward waits would stall the moment. The chest is clamped
    // INSIDE the loot edge at spawn (main.js), so the default put() edge is
    // the right boundary and the direct line always converges.
    if (state.runChest && state.runChest !== this.skipChest) {
      const cdx = state.runChest.x - p.x;
      const cdy = state.runChest.y - p.y;
      const clen = Math.hypot(cdx, cdy);
      if (clen > 1) {
        const routed = routeTo(state.runChest.x, state.runChest.y, 1);
        if (this.stalled(state.runChest, p, left)) {
          this.skipChest = state.runChest;   // unreachable: stop walking at it
        } else {
          this.act = 'CHEST';
          return routed || direct(put(cdx / clen, cdy / clen));
        }
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
      const routed = routeTo(state.portal.x, state.portal.y, 1);
      if (this.stalled(state.portal, p, left)) this.nav.path = null;   // re-plan
      return routed || direct(put(pdx / plen, pdy / plen, rim));
    }

    // M5b SITE GOAL (explore.js): EXPLORE's calm-field site pick, or a map
    // waypoint (AUTO and EXPLORE). Below the flee and portal branches, so a
    // threat or an open portal always wins. Stand-in sites (shrine, fountain)
    // hold inside the ring; the rest walk onto the spot. A goal the pilot
    // makes no progress toward is reported back (state.pilotGoalStalled).
    const goal = state.pilotGoal;
    if (goal) {
      const gdx = goal.x - p.x, gdy = goal.y - p.y;
      const glen = Math.hypot(gdx, gdy);
      if (goal.hold > 0 && glen <= goal.hold) {
        this.act = 'SITE';
        return put(0, 0);
      }
      if (glen > 2) {
        const routed = routeTo(goal.x, goal.y, 1);
        if (this.stalled(goal.site || goal.key || goal, p, left)) {
          this.nav.path = null;
          state.pilotGoalStalled = goal;
        } else {
          this.act = 'SITE';
          return calm(routed || direct(put(gdx / glen, gdy / glen, C.GROUND.RIM)), false);
        }
      }
    }

    // Calm: drift toward the nearest XP gem (SAFE drifts slower).
    if (g) {
      lineClear = false;
      const routed = gemRamp ? null : routeTo(g.x, g.y, st.XP_SPEED);
      if (this.stalled(g, p, left)) {
        // No progress toward this gem: give it up and take another next frame.
        this.skipGems.add(g);
        this.gem = null;
        this.nav.path = null;
      } else if (routed) {
        this.act = 'LOOT';
        return calm(routed, false);
      }
    }
    if (this.gem) {
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
        return calm(direct(put(gx * st.XP_SPEED, gy * st.XP_SPEED)));
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
      // A building in the way: route to a point further round the orbit
      // instead of pressing its face.
      const ml = Math.hypot(mx, my);
      lineClear = ml > 0 && straightClear(bRects, p.x, p.y,
        p.x + (mx / ml) * PATROL_LOOK, p.y + (my / ml) * PATROL_LOOK) &&
        (!TER || terrainLineClear(TER, p.x, p.y, pz,
          p.x + (mx / ml) * PATROL_LOOK, p.y + (my / ml) * PATROL_LOOK));
      if (ml > 0 && !lineClear) {
        const r = Math.min(400, Math.max(80, len));
        const a = Math.atan2(dy, dx) + 0.6;
        const tx = Math.cos(a) * r, ty = Math.sin(a) * r;
        const routed = routeTo(tx, ty, ml);
        if (routed) return routed;
        if (lineClear) {   // the orbit point is in plain sight: walk at it
          const tl = Math.hypot(tx - p.x, ty - p.y) || 1;
          return calm(direct(put(((tx - p.x) / tl) * ml, ((ty - p.y) / tl) * ml)));
        }
      }
      return calm(direct(put(mx, my)));
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
