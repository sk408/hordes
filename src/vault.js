// HORDES — src/vault.js
//
// M5b slice 3: the LOCKED VAULT and the LEVER-AND-GATE YARD.
//
//   vault  one per stage, on a plateau when one fits. One elite per run
//          (after VAULT.CARRIER_AFTER_S) carries the key; it drops on the
//          kill, the hero picks it up, and touching the vault with it pays
//          the vault's stated reward (a joker offer or a rare chest).
//   yard   one walled yard per stage with a chest inside. Its gate is a wall
//          until the lever (a site elsewhere on the map) is pulled; then it
//          stays open for the run.
//
// Pure rules + data: no DOM, no Math.random. Placement is a pure function of
// (seed, stage, building rects, the sites already placed) on its own stream,
// so the existing sites never move. The yard's walls join the building
// footprints (stage_buildings.js setExtraRects), so the hero's movement and
// the pilot's planner treat them as walls; walkers slide against them at the
// enemy move (main.js), big bosses and flyers cross them.

import { planPath } from './pilot_nav.js';
import { terrainFor, flatSpot, rectOnFeature, TCELL, cellIx } from './terrain.js';
import { mulberry32, siteSeed, spawnDist } from './sites.js';
import { clampLootToArena } from './entities.js';
import { buildingTouchesDisc } from './stage_buildings.js';

export const VAULT = {
  R: 16,                   // touch radius of the vault, the lever, the yard chest
  PROMPT_R: 90,            // the vault's card shows inside this range
  KEY_R: 16,               // the hero picks the key up inside this
  CARRIER_AFTER_S: 150,    // the key carrier is the first elite after this
  MIN_GAP: 200,            // px from any major site
  YARD_W: 104, YARD_H: 88, // outer size of the yard
  WALL: 8,                 // wall thickness
  GATE_W: 32,              // the gate's opening
  YARD_GAP: 150,           // px from any site
  LEVER_MIN_D: 480,        // the lever stands at least this far from the yard
  SPAWN_KEEP: 360,         // px kept from the hero's start (spawnDist)
  LEVER_SPAWN_KEEP: 200,   // the lever's own, smaller keep
  WALK_R: 7,               // a walker's ring against the yard's walls
  WALK_NEAR: 24,           // a walker this close to the walls minds them
};

// The vault's reward, stated on approach.
export const VAULT_REWARDS = [
  { id: 'joker', label: 'A JOKER' },
  { id: 'chest', label: 'A RARE CHEST' },
];

export const POI_HINTS = {
  vault: 'A marked elite carries the vault key: kill it, grab the key, touch the vault.',
  lever: 'Pull the lever to open the walled yard and its chest for the rest of the run.',
};

function inRects(rects, x, y, m) {
  for (const q of rects) {
    if (x > q.x - m && x < q.x + q.w + m && y > q.y - m && y < q.y + q.h + m) return true;
  }
  return false;
}

// The yard's wall rects. The gate sits in the middle of the side named by
// yard.gateSide ('s' | 'n' | 'e' | 'w'); `open` leaves it out.
export function yardRects(y, open = false) {
  const W = VAULT.WALL, G = VAULT.GATE_W;
  const x0 = y.x - VAULT.YARD_W / 2, y0 = y.y - VAULT.YARD_H / 2;
  const w = VAULT.YARD_W, h = VAULT.YARD_H;
  const out = [];
  const side = (sx, sy, sw, sh, gated, horiz) => {
    if (!gated) { out.push({ x: sx, y: sy, w: sw, h: sh, yard: true }); return; }
    if (horiz) {
      const a = (sw - G) / 2;
      out.push({ x: sx, y: sy, w: a, h: sh, yard: true });
      out.push({ x: sx + a + G, y: sy, w: a, h: sh, yard: true });
      if (!open) out.push({ x: sx + a, y: sy, w: G, h: sh, yard: true, gate: true });
    } else {
      const a = (sh - G) / 2;
      out.push({ x: sx, y: sy, w: sw, h: a, yard: true });
      out.push({ x: sx, y: sy + a + G, w: sw, h: a, yard: true });
      if (!open) out.push({ x: sx, y: sy + a, w: sw, h: G, yard: true, gate: true });
    }
  };
  side(x0, y0, w, W, y.gateSide === 'n', true);
  side(x0, y0 + h - W, w, W, y.gateSide === 's', true);
  side(x0, y0 + W, W, h - 2 * W, y.gateSide === 'w', false);
  side(x0 + w - W, y0 + W, W, h - 2 * W, y.gateSide === 'e', false);
  return out;
}

// The point just outside the gate (where the pilot walks before going in).
export function gateOutside(y) {
  const dx = { e: 1, w: -1 }[y.gateSide] || 0, dy = { s: 1, n: -1 }[y.gateSide] || 0;
  return [y.x + dx * (VAULT.YARD_W / 2 + 18), y.y + dy * (VAULT.YARD_H / 2 + 18)];
}

// Does the segment a-b cross the inside of the box?
function segHitsBox(ax, ay, bx, by, x0, y0, x1, y1) {
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay) && t0 < t1;
}

// ---- walkers and the yard's walls (the enemy move, main.js) -----------------
// The walls stop walkers. While the gate is open and the hero is outside, a
// walker outside meets the yard as if it were shut (it does not wander into
// the dead end) and one inside walks out through the gate; with the hero
// inside, walkers come in through the gate.

// The shut-gate rects of the run's yard (kept: the yard never moves).
let solidOf = null, solidRects = null;
function solidWalls(y) {
  if (solidOf !== y) { solidOf = y; solidRects = yardRects(y, false); }
  return solidRects;
}

// The yard as one frame's walkers meet it, or null without walls. `walls` =
// the run's extra rects, `yard` the site (null: the walls only stop), (hx, hy)
// the hero.
export function yardForWalkers(yard, walls, hx, hy) {
  if (!walls || !walls.length) return null;
  const v = { yard: yard || null, walls, solid: walls, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity,
    shut: false, heroIn: false };
  for (const q of walls) {
    v.x0 = Math.min(v.x0, q.x); v.y0 = Math.min(v.y0, q.y);
    v.x1 = Math.max(v.x1, q.x + q.w); v.y1 = Math.max(v.y1, q.y + q.h);
    if (q.gate) v.shut = true;
  }
  v.heroIn = hx > v.x0 && hx < v.x1 && hy > v.y0 && hy < v.y1;
  if (yard && !v.shut && !v.heroIn) v.solid = solidWalls(yard);
  return v;
}

// px off the gate's axis, and px outside the gated face (negative: inside it).
function gateOffsets(y, px, py) {
  const ns = y.gateSide === 'n' || y.gateSide === 's';
  const sg = y.gateSide === 'n' || y.gateSide === 'w' ? -1 : 1;
  return ns ? [Math.abs(px - y.x), (py - y.y) * sg - VAULT.YARD_H / 2]
    : [Math.abs(py - y.y), (px - y.x) * sg - VAULT.YARD_W / 2];
}

// Is the walker inside the yard: in its box, or still in the open gateway on
// its way out?
function walkerIn(v, x, y) {
  if (x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1) return true;
  if (v.shut || !v.yard) return false;
  const [side, out] = gateOffsets(v.yard, x, y);
  return side < VAULT.GATE_W / 2 && out >= 0 && out < VAULT.WALK_R;
}

// The rects that hold a walker standing at (x, y), or null when none do: far
// from the yard, inside the shut yard or caught in a wall (spawned or
// knocked there: it walks out).
export function yardWallsFor(v, x, y) {
  const m = VAULT.WALK_NEAR;
  if (x < v.x0 - m || x > v.x1 + m || y < v.y0 - m || y > v.y1 + m) return null;
  if (v.shut && x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1) return null;
  const rects = walkerIn(v, x, y) ? v.walls : v.solid;
  return buildingTouchesDisc(rects, x, y, VAULT.WALK_R) ? null : rects;
}

// Where a walker held by the walls heads, or null to keep its own way. One
// inside while the hero is outside walks out through the gate. One walking
// straight at the hero at (tx, ty) (`chase`) walks round the walls, or in
// through the gate when the hero is inside. The walls still stop it (the
// slide); this only picks the way. Pure: returns [x, y] or null.
export function yardWay(v, wx, wy, tx, ty, chase) {
  const y = v.yard;
  if (!y) return null;
  const wIn = walkerIn(v, wx, wy);
  if (wIn && (v.heroIn || v.shut)) return null;
  if (!wIn && !chase) return null;
  const r = VAULT.WALK_R, m = r + 6;   // m: clearance of the points it walks at
  let gx = tx, gy = ty;
  if (wIn || v.heroIn) {
    // The gate: on-axis points just outside and just inside it.
    const ns = y.gateSide === 'n' || y.gateSide === 's';
    const sg = y.gateSide === 'n' || y.gateSide === 'w' ? -1 : 1;
    const half = ns ? VAULT.YARD_H / 2 : VAULT.YARD_W / 2;
    const out = ns ? [y.x, y.y + sg * (half + m)] : [y.x + sg * (half + m), y.y];
    const inn = ns ? [y.x, y.y + sg * (half - VAULT.WALL - m)] : [y.x + sg * (half - VAULT.WALL - m), y.y];
    const [side, off] = gateOffsets(y, wx, wy);
    const lane = side < VAULT.GATE_W / 2 - r;
    if (wIn) return lane ? out : inn;
    if (lane && off >= 0) return inn;
    gx = out[0]; gy = out[1];
  }
  // Outside, going round: straight when the walls (grown by the ring) are
  // not in the way, else the nearer way round by the corners.
  const k = r - 0.5;
  const hit = (ax, ay, bx, by) => segHitsBox(ax, ay, bx, by, v.x0 - k, v.y0 - k, v.x1 + k, v.y1 + k);
  if (!hit(wx, wy, gx, gy)) return v.heroIn ? [gx, gy] : null;
  const C = [[v.x0 - m, v.y0 - m], [v.x1 + m, v.y0 - m], [v.x1 + m, v.y1 + m], [v.x0 - m, v.y1 + m]];   // NW NE SE SW
  // The two corners on the walker's skyline, each with the way on round.
  const L = wx < v.x0, R = wx > v.x1, U = wy < v.y0, D = wy > v.y1;
  const [a, b] = L && U ? [[1, 1], [3, -1]] : R && U ? [[0, -1], [2, 1]]
    : R && D ? [[1, -1], [3, 1]] : L && D ? [[0, 1], [2, -1]]
    : L ? [[0, 1], [3, -1]] : R ? [[1, -1], [2, 1]] : U ? [[0, -1], [1, 1]] : [[3, 1], [2, -1]];
  const cost = ([i, d]) => {
    let c = C[i], sum = Math.hypot(c[0] - wx, c[1] - wy);
    for (let n = 0; n < 2 && hit(c[0], c[1], gx, gy); n++) {
      i = (i + d + 4) % 4;
      sum += Math.hypot(C[i][0] - c[0], C[i][1] - c[1]);
      c = C[i];
    }
    return sum + Math.hypot(gx - c[0], gy - c[1]);
  };
  return cost(a) <= cost(b) ? C[a[0]] : C[b[0]];
}

// Place the vault, the yard and its lever for (seed, stage). `rects` = the
// stage's building footprints; `sites` = the sites already placed. Returns
// { vault, lever, yard } (each null when nothing fits).
export function placeVaultYard(seed, stageId, rects = [], sites = [], rim = 900) {
  const rng = mulberry32(siteSeed(seed, stageId) ^ 0x7a017);
  const T = terrainFor(seed, stageId);
  const half = rim - 110;
  const majors = sites.filter(s => s.kind !== 'brazier');
  const taken = [];
  const farFrom = (x, y, list, gap) => list.every(o => Math.hypot(o.x - x, o.y - y) >= gap);
  const okSpot = (x, y, gap) => Math.abs(x) <= half && Math.abs(y) <= half &&
    spawnDist(x, y) >= VAULT.SPAWN_KEEP && (!T || flatSpot(T, x, y)) && !inRects(rects, x, y, 26) &&
    farFrom(x, y, majors, gap) && farFrom(x, y, taken, gap) && !!planPath(rects, 0, 0, x, y);

  // ---- the vault: a plateau top first (the highest tier), else open ground.
  let vault = null;
  if (T && T.plateaus && T.plateaus.length) {
    const cands = [];
    for (const p of T.plateaus) {
      for (const tp of p.upper ? [p.upper, p] : [p]) {
        for (let k = 0; k < 9; k++) {
          const x = Math.round(tp.x + tp.w * (0.25 + 0.25 * (k % 3)));
          const y = Math.round(tp.y + tp.h * (0.25 + 0.25 * Math.floor(k / 3)));
          if ((T.tier[cellIx(x, y)] | 0) >= 2) cands.push([x, y]);
        }
      }
    }
    // Shuffle on the stream, then keep the first that fits.
    for (let i = cands.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]];
    }
    for (const [x, y] of cands) if (okSpot(x, y, VAULT.MIN_GAP)) { vault = { x, y, high: true }; break; }
  }
  for (let t = 0; !vault && t < 120; t++) {
    const x = Math.round((rng() * 2 - 1) * half), y = Math.round((rng() * 2 - 1) * half);
    if (okSpot(x, y, VAULT.MIN_GAP)) vault = { x, y, high: false };
  }
  if (vault) {
    vault = { id: 900, kind: 'vault', x: vault.x, y: vault.y, high: vault.high, state: 'unused',
      reward: VAULT_REWARDS[Math.floor(rng() * VAULT_REWARDS.length)].id };
    taken.push(vault);
  }

  // ---- the yard: a flat ground box clear of buildings, sites and features.
  let yard = null;
  const SIDES = ['s', 'n', 'e', 'w'];
  for (let t = 0; !yard && t < 160; t++) {
    const x = Math.round((rng() * 2 - 1) * (half - 60)), y = Math.round((rng() * 2 - 1) * (half - 60));
    const box = { x: x - VAULT.YARD_W / 2, y: y - VAULT.YARD_H / 2, w: VAULT.YARD_W, h: VAULT.YARD_H };
    if (spawnDist(x, y) < VAULT.SPAWN_KEEP + 60) continue;
    if (T && rectOnFeature(T, box, TCELL)) continue;
    if (rects.some(q => box.x < q.x + q.w + 40 && box.x + box.w > q.x - 40 &&
      box.y < q.y + q.h + 40 && box.y + box.h > q.y - 40)) continue;
    if (!farFrom(x, y, sites, VAULT.YARD_GAP + 50) || !farFrom(x, y, taken, VAULT.YARD_GAP + 50)) continue;
    // The gate faces the spawn (roughly), so the way in is the near side.
    const gateSide = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'w' : 'e') : (y > 0 ? 'n' : 's');
    const cand = { x, y, gateSide };
    const closed = rects.concat(yardRects(cand, false));
    const opened = rects.concat(yardRects(cand, true));
    const [gx, gy] = gateOutside(cand);
    if (T && !flatSpot(T, gx, gy)) continue;
    if (!planPath(closed, 0, 0, gx, gy)) continue;
    if (!planPath(opened, 0, 0, x, y)) continue;
    if (planPath(closed, gx, gy, x, y)) continue;   // the closed gate must really block
    yard = cand;
    void SIDES;
  }
  let lever = null;
  if (yard) {
    yard = { id: 901, kind: 'yard', x: yard.x, y: yard.y, gateSide: yard.gateSide, state: 'unused', open: false };
    const withYard = rects.concat(yardRects(yard, false));
    for (let t = 0; !lever && t < 160; t++) {
      const x = Math.round((rng() * 2 - 1) * half), y = Math.round((rng() * 2 - 1) * half);
      if (Math.hypot(x - yard.x, y - yard.y) < VAULT.LEVER_MIN_D) continue;
      if (spawnDist(x, y) < VAULT.LEVER_SPAWN_KEEP || (T && !flatSpot(T, x, y)) || inRects(withYard, x, y, 26)) continue;
      if (!farFrom(x, y, majors, 160) || !farFrom(x, y, taken, 160)) continue;
      if (!planPath(withYard, 0, 0, x, y)) continue;
      lever = { id: 902, kind: 'lever', x, y, state: 'unused', yard: 901 };
    }
    if (!lever) yard = null;
  }
  return { vault, lever, yard };
}

// Should this new elite carry the key? The first elite after
// CARRIER_AFTER_S while the vault is shut and nobody holds or carries a key.
export function wantsCarrier(st, time) {
  return !!st && !!st.vault && st.vault.state !== 'spent' && !st.hasKey && !st.keyDrop &&
    !st.carrier && time >= VAULT.CARRIER_AFTER_S;
}

// One frame of the vault and yard rules. `w` is the run's world block
// { vault, lever, yard, hasKey, keyDrop, carrier }; ctx: { player, deliberate (site)
// => bool }. Returns events: keyPicked · vaultOpen · vaultLocked · leverPulled
// · yardLoot.
export function tickVaultYard(w, ctx) {
  const ev = [];
  if (!w || !ctx || !ctx.player) return ev;
  const p = ctx.player;
  const near = (o, r) => (o.x - p.x) ** 2 + (o.y - p.y) ** 2 <= r * r;
  if (w.carrier && !(w.carrier.hp > 0) && !w.carrier.keyDropped) {
    // The carrier died: its key lies where it fell, kept inside the floor
    // the hero can reach (a carrier can die past the rim).
    w.carrier.keyDropped = true;
    w.keyDrop = clampLootToArena(w.carrier.x, w.carrier.y);
    w.carrier = null;
    ev.push({ kind: 'keyDropped', x: w.keyDrop.x, y: w.keyDrop.y });
  }
  if (w.keyDrop && near(w.keyDrop, VAULT.KEY_R)) {
    w.hasKey = true; w.keyDrop = null;
    ev.push({ kind: 'keyPicked' });
  }
  const v = w.vault;
  if (v && v.state !== 'spent' && near(v, VAULT.R)) {
    if (w.hasKey) { v.state = 'spent'; w.hasKey = false; ev.push({ kind: 'vaultOpen', site: v }); }
    else if (!v.lockedShown) { v.lockedShown = true; ev.push({ kind: 'vaultLocked', site: v }); }
  } else if (v && !near(v, VAULT.R + 20)) v.lockedShown = false;
  const L = w.lever, Y = w.yard;
  if (L && L.state === 'unused' && near(L, VAULT.R)) {
    L.state = 'spent';
    if (Y) { Y.open = true; Y.state = 'active'; }
    ev.push({ kind: 'leverPulled', site: L, yard: Y });
  }
  if (Y && Y.open && Y.state !== 'spent' && near(Y, VAULT.R)) {
    Y.state = 'spent';
    ev.push({ kind: 'yardLoot', site: Y });
  }
  return ev;
}
