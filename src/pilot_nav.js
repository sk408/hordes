// HORDES — pilot navigation around building footprints.
// Pure geometry + a small follower state. The AutoPilot asks navDirection()
// for the direction to walk toward a goal; when the straight line is blocked
// it follows the shortest path over the footprints' inflated corners
// (visibility graph + A*). No clock, no rng, no DOM.
import { CONFIG as C } from './config.js';
import { BUILDING_MOVER_R as R } from './stage_buildings.js';

// Corner waypoints stand R + PAD off both faces of their box. Kept footprints
// stand >= 16px apart, so PAD 1 keeps the middle of the narrowest lane legal.
export const NAV_PAD = 1;
// Clearance every planned segment keeps from every footprint.
export const NAV_CLEAR = R + 0.25;
// A goal that moves further than this from the planned goal forces a re-plan.
export const NAV_GOAL_DRIFT = 24;
// Frames to wait before planning again after a failed plan.
export const NAV_RETRY_FRAMES = 20;

function distToRect(x, y, q) {
  const dx = Math.max(q.x - x, 0, x - (q.x + q.w));
  const dy = Math.max(q.y - y, 0, y - (q.y + q.h));
  return Math.hypot(dx, dy);
}

// Distance from (x, y) to the nearest footprint (Infinity with none).
export function clearanceAt(rects, x, y) {
  let best = Infinity;
  for (const q of rects) {
    const d = distToRect(x, y, q);
    if (d < best) best = d;
  }
  return best;
}

function distPointSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function segCrossesRect(ax, ay, bx, by, q) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const clip = (p, d) => {
    if (p === 0) return d >= 0;
    const t = d / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, ax - q.x) && clip(dx, q.x + q.w - ax) &&
    clip(-dy, ay - q.y) && clip(dy, q.y + q.h - ay);
}

// True when the segment a->b keeps at least `c` clear of every footprint.
export function segmentClear(rects, ax, ay, bx, by, c) {
  const x0 = Math.min(ax, bx) - c, x1 = Math.max(ax, bx) + c;
  const y0 = Math.min(ay, by) - c, y1 = Math.max(ay, by) + c;
  for (const q of rects) {
    if (q.x > x1 || q.x + q.w < x0 || q.y > y1 || q.y + q.h < y0) continue;
    if (segCrossesRect(ax, ay, bx, by, q)) return false;
    const d = Math.min(
      distToRect(ax, ay, q), distToRect(bx, by, q),
      distPointSeg(q.x, q.y, ax, ay, bx, by),
      distPointSeg(q.x + q.w, q.y, ax, ay, bx, by),
      distPointSeg(q.x, q.y + q.h, ax, ay, bx, by),
      distPointSeg(q.x + q.w, q.y + q.h, ax, ay, bx, by));
    if (d < c) return false;
  }
  return true;
}

// The corner graph for one footprint list (cached on the array identity; the
// list itself is cached per (seed, stage) by stage_buildings.buildingRects).
const graphs = new WeakMap();
function graphFor(rects) {
  let g = graphs.get(rects);
  if (g) return g;
  const rim = C.GROUND.RIM, m = R + NAV_PAD;
  const nodes = [];
  for (const q of rects) {
    for (const [x, y] of [[q.x - m, q.y - m], [q.x + q.w + m, q.y - m],
      [q.x - m, q.y + q.h + m], [q.x + q.w + m, q.y + q.h + m]]) {
      if (Math.abs(x) > rim || Math.abs(y) > rim) continue;
      if (clearanceAt(rects, x, y) < NAV_CLEAR) continue;
      nodes.push([x, y]);
    }
  }
  g = { nodes, vis: new Map() };
  graphs.set(rects, g);
  return g;
}

function visible(g, rects, i, j) {
  const key = i < j ? i * g.nodes.length + j : j * g.nodes.length + i;
  let v = g.vis.get(key);
  if (v === undefined) {
    const a = g.nodes[i], b = g.nodes[j];
    v = segmentClear(rects, a[0], a[1], b[0], b[1], NAV_CLEAR);
    g.vis.set(key, v);
  }
  return v;
}

// The clearance a segment leaving (x, y) is held to: the planning clearance,
// relaxed to the point's own when it already stands closer than that (a
// mover touching a wall must still be able to leave it).
function startClearance(rects, x, y) {
  return Math.max(0, Math.min(NAV_CLEAR, clearanceAt(rects, x, y)) - 1e-4);
}

// Shortest walkable path from (sx, sy) to (gx, gy): an array of [x, y]
// waypoints ending at the goal, or null when no path exists.
export function planPath(rects, sx, sy, gx, gy) {
  const c0 = startClearance(rects, sx, sy);
  if (segmentClear(rects, sx, sy, gx, gy, c0)) return [[gx, gy]];
  const g = graphFor(rects);
  const n = g.nodes.length, GOAL = n;
  const cg = startClearance(rects, gx, gy);
  const cost = new Float64Array(n + 1).fill(Infinity);
  const prev = new Int32Array(n + 1).fill(-1);
  const done = new Uint8Array(n + 1);
  const h = (i) => (i === GOAL ? 0 : Math.hypot(g.nodes[i][0] - gx, g.nodes[i][1] - gy));
  for (let i = 0; i < n; i++) {
    const a = g.nodes[i];
    if (segmentClear(rects, sx, sy, a[0], a[1], c0)) cost[i] = Math.hypot(a[0] - sx, a[1] - sy);
  }
  for (;;) {
    let cur = -1, best = Infinity;
    for (let i = 0; i <= n; i++) {
      if (done[i] || cost[i] === Infinity) continue;
      const f = cost[i] + h(i);
      if (f < best) { best = f; cur = i; }
    }
    if (cur < 0) return null;
    if (cur === GOAL) break;
    done[cur] = 1;
    const a = g.nodes[cur];
    const toGoal = cost[cur] + Math.hypot(a[0] - gx, a[1] - gy);
    if (toGoal < cost[GOAL] && segmentClear(rects, a[0], a[1], gx, gy, cg)) {
      cost[GOAL] = toGoal; prev[GOAL] = cur;
    }
    for (let j = 0; j < n; j++) {
      if (done[j]) continue;
      const b = g.nodes[j];
      const c = cost[cur] + Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (c < cost[j] && visible(g, rects, cur, j)) { cost[j] = c; prev[j] = cur; }
    }
  }
  const path = [[gx, gy]];
  for (let i = prev[GOAL]; i >= 0; i = prev[i]) path.unshift(g.nodes[i]);
  return path;
}

// True when the straight walk from (px, py) to (gx, gy) is clear.
export function straightClear(rects, px, py, gx, gy) {
  return rects.length === 0 ||
    segmentClear(rects, px, py, gx, gy, startClearance(rects, px, py));
}

export function makeNav() {
  return { path: null, gx: 0, gy: 0, wait: 0 };
}

// Where to walk from (px, py) toward (gx, gy): [ux, uy, dist] — the unit
// direction and the distance to the point being walked at (the next waypoint
// while nav.path routes around footprints, else the goal). A mover should not
// step further than dist, or a long stride overshoots the corner. Returns
// null when no route is known this frame (caller falls back to the straight
// line). nav.path is null while the straight line is clear.
export function navDirection(nav, rects, px, py, gx, gy) {
  const unit = (x, y) => {
    const l = Math.hypot(x - px, y - py);
    return l > 1e-9 ? [(x - px) / l, (y - py) / l, l] : null;
  };
  const c0 = startClearance(rects, px, py);
  if (rects.length === 0 || segmentClear(rects, px, py, gx, gy, c0)) {
    nav.path = null; nav.wait = 0;
    return unit(gx, gy);
  }
  let path = nav.path;
  if (path && Math.hypot(gx - nav.gx, gy - nav.gy) > NAV_GOAL_DRIFT) path = null;
  if (path) {
    path[path.length - 1] = [gx, gy];
    // Drop waypoints already reached or passed, and cut the corner as soon
    // as the next leg is in sight.
    while (path.length > 1) {
      const a = path[0], b = path[1];
      const near = Math.hypot(a[0] - px, a[1] - py);
      const passed = near < 6 && (px - a[0]) * (b[0] - a[0]) + (py - a[1]) * (b[1] - a[1]) >= 0;
      if (near < 1.5 || passed || segmentClear(rects, px, py, b[0], b[1], c0)) path.shift();
      else break;
    }
    if (!segmentClear(rects, px, py, path[0][0], path[0][1], c0)) path = null;
  }
  if (!path) {
    if (nav.wait > 0) { nav.wait--; nav.path = null; return null; }
    path = planPath(rects, px, py, gx, gy);
    if (!path) { nav.wait = NAV_RETRY_FRAMES; nav.path = null; return null; }
    nav.gx = gx; nav.gy = gy;
  }
  nav.path = path;
  return unit(path[0][0], path[0][1]);
}

// Walking distance left along the current route (straight distance when the
// line is clear).
export function navRemaining(nav, px, py, gx, gy) {
  if (!nav.path) return Math.hypot(gx - px, gy - py);
  let d = 0, x = px, y = py;
  for (const [wx, wy] of nav.path) { d += Math.hypot(wx - x, wy - y); x = wx; y = wy; }
  return d;
}
