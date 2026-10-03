// HORDES — src/terrain.js
//
// M5b LANDSCAPE: authored elevation per stage — plateaus with cliff faces,
// RAMPS (the walkable ways up), BRIDGES (a narrow raised path you can also
// walk under) and ONE-WAY DROPS (a cliff edge you may step off, never climb).
//
// One pure function of (seed, stage) builds the layout and rasterizes it to a
// 24 px grid; movement, enemy routing, the pilot, site placement and the
// render all read that grid (paint == query). The natural relief field
// (relief.js) still sets the speed grade; this module owns blocking.
//
// TIERS: 0 ground, 1 ramp, 2 plateau top, 3 upper ramp, 4 upper top.
// A move between neighbouring cells is legal when the tier changes by at most
// one, or when it goes DOWN from a cell flagged DROP. A bridge cell has two
// floors: tier 2 for a mover arriving from tier >= 1, tier 0 underneath.
// Movers carry their own floor (z) only so bridges know which floor they are
// on; everywhere else z is the cell's tier.
//
// Anti-sanctuary: every plateau has a ramp; enemies route to the hero through
// the ramps (a flow field shared by the whole horde); flyers and shots ignore
// tiers; spawns land on plateaus too. See docs/WORLD.md.
//
// PURITY: no DOM, no clock, no Math.random. Same (seed, stage) -> same grid.

export const TCELL = 24;              // grid cell, world px
export const TEXT = 900;              // grid half-extent (the arena rim)
export const TN = (2 * TEXT) / TCELL; // 75 cells per side
export const TNN = TN * TN;
export const F_RAMP = 1, F_DROP = 2, F_BRIDGE = 4, F_TOP = 8;
export const HIGH_TIER = 2;           // standing at >= this tier is high ground

// The flat zones every layout keeps open: the spawn clearing (the origin, the
// run-start footing at (240, 135), the first-run potion and chest) and the rim.
export const CLEAR_X = 120, CLEAR_Y = 68, CLEAR_R = 340;
export const RIM_KEEP = 110;

// ---- authored layouts ------------------------------------------------------
// Design coordinates (world px, arena centre 0,0). A plateau: rect + tier,
// ramps on its sides ({ side, at: 0..1 along the side, w, len }), drop spans
// ({ side, from, to } as fractions of the side), an optional upper tier with
// its own ramps, and an optional landmark. Bridges join plateaus by index.
const P = (x, y, w, h, o = {}) => ({ x, y, w, h, tier: 2, ramps: [], drops: [], ...o });
export const LAYOUTS = {
  // Two gentle knolls with long ramps, far from the spawn.
  VERDANT_HOLLOW: {
    note: 'two small grassy knolls with long ramps; the rest is open meadow',
    plateaus: [
      P(-720, -696, 264, 216, { ramps: [{ side: 'E', at: 0.5, w: 96, len: 144 }, { side: 'S', at: 0.4, w: 96, len: 144 }],
        drops: [{ side: 'W', from: 0.1, to: 0.9 }], mark: 'watchtower' }),
      P(528, 504, 192, 168, { ramps: [{ side: 'W', at: 0.5, w: 96, len: 120 }, { side: 'N', at: 0.5, w: 96, len: 120 }],
        drops: [{ side: 'S', from: 0.1, to: 0.9 }] }),
    ],
    bridges: [],
  },
  // Tall basalt blocks joined by bridges; one stacked to the upper tier.
  ASHEN_WASTE: {
    note: 'tall basalt blocks joined by two bridges; the west block has an upper tier',
    plateaus: [
      P(-768, -648, 240, 312, { ramps: [{ side: 'S', at: 0.5, w: 72, len: 120 }], drops: [{ side: 'W', from: 0.1, to: 0.9 }],
        upper: { x: -744, y: -624, w: 144, h: 144, ramps: [{ side: 'S', at: 0.5, w: 72, len: 72 }] }, mark: 'arch' }),
      P(-312, -720, 264, 192, { ramps: [{ side: 'S', at: 0.3, w: 72, len: 120 }], drops: [{ side: 'N', from: 0.1, to: 0.9 }] }),
      P(168, -744, 240, 216, { ramps: [{ side: 'S', at: 0.6, w: 72, len: 120 }], drops: [{ side: 'E', from: 0.2, to: 0.8 }] }),
      P(480, 384, 264, 240, { ramps: [{ side: 'W', at: 0.5, w: 72, len: 120 }, { side: 'N', at: 0.6, w: 72, len: 120 }],
        drops: [{ side: 'S', from: 0.2, to: 0.8 }] }),
    ],
    bridges: [[0, 1], [1, 2]],
  },
  // Long terraced drifts: a north terrace with a crest, an east terrace.
  SNOWFIELD: {
    note: 'long terraced drifts: a two-step north terrace and an east terrace you can slide off',
    plateaus: [
      P(-768, -768, 888, 192, { ramps: [{ side: 'S', at: 0.12, w: 96, len: 120 }, { side: 'S', at: 0.88, w: 96, len: 120 }],
        drops: [{ side: 'S', from: 0.3, to: 0.7 }],
        upper: { x: -624, y: -768, w: 504, h: 96, ramps: [{ side: 'S', at: 0.5, w: 72, len: 72 }] }, mark: 'belltower' }),
      P(504, 168, 216, 600, { ramps: [{ side: 'W', at: 0.25, w: 96, len: 120 }, { side: 'W', at: 0.85, w: 96, len: 120 }],
        drops: [{ side: 'E', from: 0.1, to: 0.9 }] }),
    ],
    bridges: [],
  },
  // Broken badlands: many small mesas, each with one ramp and one drop.
  BLOOD_RUST: {
    note: 'broken badlands: seven small mesas, each with one ramp and one drop side',
    plateaus: [
      P(-768, -768, 168, 168, { ramps: [{ side: 'E', at: 0.5, w: 72, len: 96 }], drops: [{ side: 'S', from: 0.1, to: 0.9 }] }),
      P(-432, -720, 144, 192, { ramps: [{ side: 'S', at: 0.5, w: 72, len: 96 }], drops: [{ side: 'W', from: 0.1, to: 0.9 }] }),
      P(-768, -312, 192, 144, { ramps: [{ side: 'E', at: 0.5, w: 72, len: 96 }], drops: [{ side: 'N', from: 0.1, to: 0.9 }] }),
      P(504, -720, 192, 168, { ramps: [{ side: 'W', at: 0.5, w: 72, len: 96 }], drops: [{ side: 'S', from: 0.1, to: 0.9 }],
        mark: 'spire' }),
      P(-720, 336, 168, 192, { ramps: [{ side: 'N', at: 0.5, w: 72, len: 96 }], drops: [{ side: 'E', from: 0.1, to: 0.9 }] }),
      P(552, 528, 168, 168, { ramps: [{ side: 'W', at: 0.5, w: 72, len: 96 }], drops: [{ side: 'N', from: 0.1, to: 0.9 }] }),
      P(-168, 576, 192, 144, { ramps: [{ side: 'N', at: 0.5, w: 72, len: 96 }], drops: [{ side: 'E', from: 0.1, to: 0.9 }] }),
    ],
    bridges: [],
  },
  // One big mesa ringed by ramps, a bone gate on its crown; a small outlier.
  BONE_DESERT: {
    note: 'one big mesa ringed by four ramps, a crown tier with the bone gate; one small outlier',
    plateaus: [
      P(-624, -720, 480, 432, { ramps: [{ side: 'E', at: 0.5, w: 96, len: 120 }, { side: 'S', at: 0.25, w: 96, len: 120 },
        { side: 'S', at: 0.8, w: 96, len: 120 }, { side: 'W', at: 0.6, w: 72, len: 96 }],
        drops: [{ side: 'N', from: 0.1, to: 0.9 }],
        upper: { x: -504, y: -624, w: 240, h: 192, ramps: [{ side: 'S', at: 0.5, w: 72, len: 96 }, { side: 'E', at: 0.5, w: 72, len: 96 }] },
        mark: 'bonegate' }),
      P(528, 504, 168, 168, { ramps: [{ side: 'N', at: 0.5, w: 72, len: 96 }], drops: [{ side: 'E', from: 0.1, to: 0.9 }] }),
    ],
    bridges: [],
  },
  // Floating islands strung together by bridges.
  VOID_REACH: {
    note: 'four islands strung on three bridges, one ramp down; a lone island in the far corner',
    plateaus: [
      P(-768, -768, 192, 192, { ramps: [{ side: 'S', at: 0.5, w: 72, len: 96 }], mark: 'obelisk' }),
      P(-432, -768, 168, 168, { drops: [{ side: 'N', from: 0.1, to: 0.9 }] }),
      P(-72, -768, 168, 192, { ramps: [{ side: 'E', at: 0.6, w: 72, len: 96 }], drops: [{ side: 'S', from: 0.2, to: 0.8 }] }),
      P(-768, -408, 192, 168, { ramps: [{ side: 'E', at: 0.5, w: 72, len: 96 }], drops: [{ side: 'W', from: 0.1, to: 0.9 }] }),
      P(528, 456, 192, 192, { ramps: [{ side: 'W', at: 0.5, w: 72, len: 96 }], drops: [{ side: 'S', from: 0.1, to: 0.9 }] }),
    ],
    bridges: [[0, 1], [1, 2], [0, 3]],
  },
  // Long volcanic spines with ramps at their ends.
  CINDER_MAW: {
    note: 'three long volcanic spines with ramps at the ends and drop sides',
    plateaus: [
      P(-768, -552, 120, 600, { ramps: [{ side: 'N', at: 0.5, w: 72, len: 96 }, { side: 'S', at: 0.5, w: 72, len: 96 }],
        drops: [{ side: 'E', from: 0.3, to: 0.7 }] }),
      P(-408, -768, 624, 120, { ramps: [{ side: 'W', at: 0.5, w: 72, len: 96 }, { side: 'E', at: 0.5, w: 72, len: 96 }],
        drops: [{ side: 'S', from: 0.2, to: 0.5 }], mark: 'forge' }),
      P(480, 192, 120, 552, { ramps: [{ side: 'N', at: 0.5, w: 72, len: 96 }, { side: 'W', at: 0.85, w: 72, len: 96 }],
        drops: [{ side: 'E', from: 0.1, to: 0.9 }] }),
    ],
    bridges: [],
  },
  // Two broad white hills, wide ramps, soft drop sides.
  WHITEOUT: {
    note: 'two broad white hills with wide ramps and soft drop sides; a cairn crest on the west hill',
    plateaus: [
      P(-768, -768, 360, 312, { ramps: [{ side: 'E', at: 0.5, w: 120, len: 120 }, { side: 'S', at: 0.5, w: 120, len: 120 }],
        drops: [{ side: 'N', from: 0.1, to: 0.9 }, { side: 'W', from: 0.1, to: 0.9 }],
        upper: { x: -720, y: -720, w: 144, h: 120, ramps: [{ side: 'E', at: 0.5, w: 72, len: 72 }] }, mark: 'cairn' }),
      P(432, 384, 336, 312, { ramps: [{ side: 'W', at: 0.5, w: 120, len: 120 }, { side: 'N', at: 0.5, w: 120, len: 120 }],
        drops: [{ side: 'E', from: 0.1, to: 0.9 }, { side: 'S', from: 0.1, to: 0.9 }] }),
    ],
    bridges: [],
  },
};

// ---- seeded transform ------------------------------------------------------
function hash(seed, salt) {
  let h = (seed ^ 0x2c1b3c6d ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const snap = (v) => -TEXT + TCELL * Math.round((v + TEXT) / TCELL);
const FLIPS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const FLIP_SIDE = { N: 'N', S: 'S', E: 'E', W: 'W' };

function flipRect(r, fx, fy, dx, dy) {
  const x = fx > 0 ? r.x : -(r.x + r.w);
  const y = fy > 0 ? r.y : -(r.y + r.h);
  return { x: snap(x + dx), y: snap(y + dy), w: r.w, h: r.h };
}
function flipSide(s, fx, fy) {
  if (fx < 0 && (s === 'E' || s === 'W')) return s === 'E' ? 'W' : 'E';
  if (fy < 0 && (s === 'N' || s === 'S')) return s === 'N' ? 'S' : 'N';
  return FLIP_SIDE[s];
}
// Side-relative fraction flips with the axis that runs along the side.
function flipAt(s, at, fx, fy) {
  if ((s === 'N' || s === 'S') && fx < 0) return 1 - at;
  if ((s === 'E' || s === 'W') && fy < 0) return 1 - at;
  return at;
}

// The rect a ramp occupies next to plateau rect p.
function rampRect(p, rp) {
  const { side, at, w, len } = rp;
  if (side === 'N' || side === 'S') {
    const cx = p.x + p.w * at;
    const x = snap(cx - w / 2);
    return { x, y: side === 'N' ? p.y - len : p.y + p.h, w, h: len, side };
  }
  const cy = p.y + p.h * at;
  const y = snap(cy - w / 2);
  return { x: side === 'W' ? p.x - len : p.x + p.w, y, w: len, h: w, side };
}
function dropRect(p, d) {
  const C = TCELL;
  if (d.side === 'N' || d.side === 'S') {
    const x0 = snap(p.x + p.w * d.from), x1 = snap(p.x + p.w * d.to);
    return { x: x0, y: d.side === 'N' ? p.y : p.y + p.h - C, w: Math.max(C, x1 - x0), h: C, side: d.side };
  }
  const y0 = snap(p.y + p.h * d.from), y1 = snap(p.y + p.h * d.to);
  return { x: d.side === 'W' ? p.x : p.x + p.w - C, y: y0, w: C, h: Math.max(C, y1 - y0), side: d.side };
}

function rectCircleDist(r, cx, cy) {
  const dx = Math.max(r.x - cx, 0, cx - (r.x + r.w));
  const dy = Math.max(r.y - cy, 0, cy - (r.y + r.h));
  return Math.hypot(dx, dy);
}
const inRim = (r) => r.x >= -TEXT + RIM_KEEP && r.y >= -TEXT + RIM_KEEP &&
  r.x + r.w <= TEXT - RIM_KEEP && r.y + r.h <= TEXT - RIM_KEEP;
// The spawn view (the camera's first frame, 480 x 270 around the footing at
// 240, 135) keeps its whole building cluster: no feature within 40 px of it.
const SPAWN_VIEW = { x: -40, y: -40, w: 560, h: 350 };
const clearOk = (r) => rectCircleDist(r, CLEAR_X, CLEAR_Y) >= CLEAR_R && !overlap(r, SPAWN_VIEW, 0);
const overlap = (a, b, m) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

// Place a stage's layout under one flip + jitter. Returns the resolved
// geometry, or null when some piece does not fit (the caller tries the next).
function resolve(L, fx, fy, dx, dy) {
  const plats = [];
  for (const src of L.plateaus) {
    const r = flipRect(src, fx, fy, dx, dy);
    const p = { ...r, tier: src.tier, mark: src.mark || null, ramps: [], drops: [], upper: null };
    for (const rp of src.ramps) {
      p.ramps.push({ ...rampRect(r, { ...rp, side: flipSide(rp.side, fx, fy), at: flipAt(rp.side, rp.at, fx, fy) }), tier: 1 });
    }
    for (const d of src.drops) {
      const a = flipAt(d.side, d.from, fx, fy), b = flipAt(d.side, d.to, fx, fy);
      p.drops.push(dropRect(r, { side: flipSide(d.side, fx, fy), from: Math.min(a, b), to: Math.max(a, b) }));
    }
    if (src.upper) {
      const u = flipRect(src.upper, fx, fy, dx, dy);
      // Keep the upper tier inside its base after snapping.
      u.x = Math.max(r.x, Math.min(r.x + r.w - u.w, u.x));
      u.y = Math.max(r.y, Math.min(r.y + r.h - u.h, u.y));
      u.ramps = src.upper.ramps.map(rp => ({ ...rampRect(u, { ...rp, side: flipSide(rp.side, fx, fy), at: flipAt(rp.side, rp.at, fx, fy) }), tier: 3 }));
      p.upper = u;
    }
    plats.push(p);
  }
  // Every piece inside the rim margin and out of the spawn clearing.
  for (const p of plats) {
    const parts = [p, ...p.ramps];
    for (const q of parts) if (!inRim(q) || !clearOk(q)) return null;
    if (p.upper) for (const q of p.upper.ramps) {
      // An upper ramp must sit on its base plateau's top.
      if (q.x < p.x || q.y < p.y || q.x + q.w > p.x + p.w || q.y + q.h > p.y + p.h) return null;
    }
  }
  // Plateaus (and their ramps) keep two cells apart unless bridged.
  for (let i = 0; i < plats.length; i++) {
    for (let j = i + 1; j < plats.length; j++) {
      const A = [plats[i], ...plats[i].ramps], B = [plats[j], ...plats[j].ramps];
      for (const a of A) for (const b of B) if (overlap(a, b, TCELL * 2)) return null;
    }
  }
  const bridges = [];
  for (const [i, j] of L.bridges || []) {
    const a = plats[i], b = plats[j];
    const ox0 = Math.max(a.x, b.x), ox1 = Math.min(a.x + a.w, b.x + b.w);
    const oy0 = Math.max(a.y, b.y), oy1 = Math.min(a.y + a.h, b.y + b.h);
    const W = 2 * TCELL;
    if (ox1 - ox0 >= W + 2 * TCELL) {           // stacked vertically: a N-S bridge
      const x = snap((ox0 + ox1) / 2 - TCELL);
      const top = a.y < b.y ? a : b, bot = a.y < b.y ? b : a;
      if (bot.y - (top.y + top.h) < TCELL) return null;
      bridges.push({ x, y: top.y + top.h, w: W, h: bot.y - (top.y + top.h), axis: 'NS', a: i, b: j });
    } else if (oy1 - oy0 >= W + 2 * TCELL) {    // side by side: an E-W bridge
      const y = snap((oy0 + oy1) / 2 - TCELL);
      const lf = a.x < b.x ? a : b, rt = a.x < b.x ? b : a;
      if (rt.x - (lf.x + lf.w) < TCELL) return null;
      bridges.push({ x: lf.x + lf.w, y, w: rt.x - (lf.x + lf.w), h: W, axis: 'EW', a: i, b: j });
    } else return null;
  }
  return { plateaus: plats, bridges };
}

// ---- the grid ----------------------------------------------------------------
export const cellIx = (x, y) => {
  let gx = Math.floor((x + TEXT) / TCELL), gy = Math.floor((y + TEXT) / TCELL);
  gx = gx < 0 ? 0 : gx >= TN ? TN - 1 : gx;
  gy = gy < 0 ? 0 : gy >= TN ? TN - 1 : gy;
  return gy * TN + gx;
};
export const cellCenter = (c) => [-TEXT + (c % TN) * TCELL + TCELL / 2, -TEXT + Math.floor(c / TN) * TCELL + TCELL / 2];

function paint(arr, r, v) {
  const gx0 = Math.round((r.x + TEXT) / TCELL), gy0 = Math.round((r.y + TEXT) / TCELL);
  const gx1 = Math.round((r.x + r.w + TEXT) / TCELL), gy1 = Math.round((r.y + r.h + TEXT) / TCELL);
  for (let gy = Math.max(0, gy0); gy < Math.min(TN, gy1); gy++) {
    for (let gx = Math.max(0, gx0); gx < Math.min(TN, gx1); gx++) v(gy * TN + gx);
  }
}

export function buildTerrain(seed, stageId) {
  const L = LAYOUTS[stageId];
  if (!L) return null;
  // Seeded flip order and jitter; the first placement that fits wins, so
  // every seed gets a full layout (the authored one is the last resort).
  const start = Math.floor(hash(seed, 1) * 4);
  const jx = Math.round((hash(seed, 2) * 2 - 1) * 2) * TCELL;
  const jy = Math.round((hash(seed, 3) * 2 - 1) * 2) * TCELL;
  let geo = null;
  for (let k = 0; k < 4 && !geo; k++) {
    const [fx, fy] = FLIPS[(start + k) % 4];
    geo = resolve(L, fx, fy, jx, jy) || resolve(L, fx, fy, 0, 0);
  }
  if (!geo) geo = resolve(L, 1, 1, 0, 0);
  if (!geo) return null;
  const tier = new Uint8Array(TNN), flags = new Uint8Array(TNN);
  for (const p of geo.plateaus) {
    paint(tier, p, (c) => { tier[c] = 2; flags[c] |= F_TOP; });
    for (const r of p.ramps) paint(tier, r, (c) => { tier[c] = 1; flags[c] |= F_RAMP; });
    for (const d of p.drops) paint(tier, d, (c) => { flags[c] |= F_DROP; });
    if (p.upper) {
      paint(tier, p.upper, (c) => { tier[c] = 4; });
      for (const r of p.upper.ramps) paint(tier, r, (c) => { tier[c] = 3; flags[c] |= F_RAMP; flags[c] &= ~F_DROP; });
    }
  }
  for (const b of geo.bridges) paint(tier, b, (c) => { if (tier[c] === 0) flags[c] |= F_BRIDGE | F_DROP; });
  // Landmarks: on the upper tier when there is one, else the plateau centre.
  const marks = [];
  for (const p of geo.plateaus) {
    if (!p.mark) continue;
    const r = p.upper || p;
    marks.push({ kind: p.mark, x: r.x + r.w / 2, y: r.y + r.h / 2, tier: p.upper ? 4 : 2 });
  }
  const T = { stage: stageId, seed, note: L.note, tier, flags, plateaus: geo.plateaus, bridges: geo.bridges, marks };
  T.comp = components(T);
  T.spawnNode = nodeOf(T, cellIx(240, 135), 0);
  return T;
}

const cache = new Map();
// The run's terrain (null for a stage without a layout). Cached: pure in
// (seed, stage), read every frame by movement, routing and the render.
export function terrainFor(seed, stageId) {
  const key = (seed | 0) + '|' + stageId;
  let T = cache.get(key);
  if (T === undefined) {
    T = buildTerrain(seed | 0, stageId);
    if (cache.size > 16) cache.clear();
    cache.set(key, T);
  }
  return T;
}

// ---- nodes and legal moves ---------------------------------------------------
// Node c = the cell's own floor; node TNN + c = the floor under a bridge.
export function nodeOf(T, c, z) {
  return (T.flags[c] & F_BRIDGE) && !(z >= 1) ? TNN + c : c;
}
export function nodeTier(T, n) {
  if (n >= TNN) return 0;
  return (T.flags[n] & F_BRIDGE) ? 2 : T.tier[n];
}
// The tier a mover on floor z stands on in cell c.
export function tierIn(T, c, z) {
  if (T.flags[c] & F_BRIDGE) return z >= 1 ? 2 : 0;
  return T.tier[c];
}
// The tier at a world point for a mover on floor z (no layout: 0).
export function terrainTierAt(T, x, y, z = 0) {
  return T ? tierIn(T, cellIx(x, y), z) : 0;
}
// Legal step from cell c0 on floor z0 into neighbour cell c1: the new floor, or -1.
export function stepTier(T, c0, z0, c1) {
  const t = tierIn(T, c1, z0);
  if (Math.abs(t - z0) <= 1) return t;
  if (t < z0 && (T.flags[c0] & F_DROP)) return t;
  return -1;
}

const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DY8 = [0, 0, 1, -1, 1, -1, 1, -1];

// Same-tier connected regions (ramps are their own regions). Movers in the
// same region as their target walk straight; others follow a flow field.
function components(T) {
  const comp = new Int32Array(2 * TNN).fill(-1);
  const stack = [];
  let id = 0;
  for (let n = 0; n < 2 * TNN; n++) {
    if (comp[n] >= 0) continue;
    if (n >= TNN && !(T.flags[n - TNN] & F_BRIDGE)) continue;
    const z = nodeTier(T, n);
    comp[n] = id; stack.push(n);
    while (stack.length) {
      const u = stack.pop(), c = u >= TNN ? u - TNN : u;
      const gx = c % TN, gy = (c - gx) / TN;
      for (let k = 0; k < 4; k++) {
        const nx = gx + DX8[k], ny = gy + DY8[k];
        if (nx < 0 || ny < 0 || nx >= TN || ny >= TN) continue;
        const c1 = ny * TN + nx;
        if (tierIn(T, c1, z) !== z) continue;
        const v = nodeOf(T, c1, z);
        if (comp[v] < 0) { comp[v] = id; stack.push(v); }
      }
    }
    id++;
  }
  return comp;
}
export function compAt(T, x, y, z) {
  return T.comp[nodeOf(T, cellIx(x, y), z)];
}

// Floor resync: off a bridge a mover's floor is the cell's tier.
export function floorAt(T, x, y, z) {
  const c = cellIx(x, y);
  if (T.flags[c] & F_BRIDGE) return z >= 1 ? 2 : 0;
  return T.tier[c];
}

// One legal mover step. Returns [x, y, z, blocked]. A blocked move slides
// along the axis that stays legal (cliff faces are axis-aligned). `climb`
// (big bosses) crosses any face at 40% pace instead of stopping.
function tryMove(T, x0, y0, z0, x1, y1) {
  const c0 = cellIx(x0, y0), c1 = cellIx(x1, y1);
  if (c0 === c1) return z0;
  const g0x = c0 % TN, g1x = c1 % TN;
  if (g0x !== g1x && c1 - g1x !== c0 - g0x) return diagTier(T, c0, z0, c1);
  return stepTier(T, c0, z0, c1);
}
// A diagonal cell change is legal only when both two-step paths through the
// corner cells are legal and agree (no cutting a cliff corner).
function diagTier(T, c0, z0, c1) {
  const g0x = c0 % TN, g1x = c1 % TN;
  const ca = c0 - g0x + g1x, cb = c1 - g1x + g0x;
  const za = stepTier(T, c0, z0, ca), zb = stepTier(T, c0, z0, cb);
  if (za < 0 || zb < 0) return -1;
  const z1 = stepTier(T, ca, za, c1), z2 = stepTier(T, cb, zb, c1);
  return z1 >= 0 && z1 === z2 ? z1 : -1;
}
export function terrainStep(T, x0, y0, z0, x1, y1, climb = false) {
  const z = floorAt(T, x0, y0, z0);
  let nz = tryMove(T, x0, y0, z, x1, y1);
  if (nz >= 0) return [x1, y1, nz, false];
  if (climb) {
    const mx = x0 + (x1 - x0) * 0.4, my = y0 + (y1 - y0) * 0.4;
    return [mx, my, tierIn(T, cellIx(mx, my), z >= 1 ? 2 : 0), true];
  }
  const ax = Math.abs(x1 - x0), ay = Math.abs(y1 - y0);
  const first = ax >= ay ? [x1, y0] : [x0, y1];
  const second = ax >= ay ? [x0, y1] : [x1, y0];
  for (const [sx, sy] of [first, second]) {
    if (sx === x0 && sy === y0) continue;
    nz = tryMove(T, x0, y0, z, sx, sy);
    if (nz >= 0) return [sx, sy, nz, true];
  }
  return [x0, y0, z, true];
}

// True when a straight walk from (x0, y0) to (x1, y1) stays legal (sampled
// every 12 px, carrying the floor). `maxLen` caps the probe.
export function terrainLineClear(T, x0, y0, z0, x1, y1) {
  // Exact cell walk (grid traversal): every cell the segment enters must be
  // a legal step from the one before, carrying the floor.
  let gx = Math.floor((x0 + TEXT) / TCELL), gy = Math.floor((y0 + TEXT) / TCELL);
  const ex = Math.floor((x1 + TEXT) / TCELL), ey = Math.floor((y1 + TEXT) / TCELL);
  const dx = x1 - x0, dy = y1 - y0;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? TCELL / Math.abs(dx) : Infinity, tdy = dy !== 0 ? TCELL / Math.abs(dy) : Infinity;
  const fx = (x0 + TEXT) / TCELL - gx, fy = (y0 + TEXT) / TCELL - gy;
  let tmx = dx !== 0 ? (sx > 0 ? 1 - fx : fx) * tdx : Infinity;
  let tmy = dy !== 0 ? (sy > 0 ? 1 - fy : fy) * tdy : Infinity;
  const inside = (a, b) => a >= 0 && b >= 0 && a < TN && b < TN;
  if (!inside(gx, gy)) return false;
  let c = gy * TN + gx, z = floorAt(T, x0, y0, z0);
  for (let k = 0; k < 4 * TN && (gx !== ex || gy !== ey); k++) {
    let nc;
    if (Math.abs(tmx - tmy) < 1e-9) {           // through a corner: both paths
      const ngx = gx + sx, ngy = gy + sy;
      if (!inside(ngx, ngy)) return false;
      nc = ngy * TN + ngx;
      const nz = diagTier(T, c, z, nc);
      if (nz < 0) return false;
      gx = ngx; gy = ngy; z = nz; tmx += tdx; tmy += tdy;
    } else if (tmx < tmy) {
      gx += sx; if (!inside(gx, gy)) return false;
      nc = gy * TN + gx;
      const nz = stepTier(T, c, z, nc); if (nz < 0) return false;
      z = nz; tmx += tdx;
    } else {
      gy += sy; if (!inside(gx, gy)) return false;
      nc = gy * TN + gx;
      const nz = stepTier(T, c, z, nc); if (nz < 0) return false;
      z = nz; tmy += tdy;
    }
    c = gy * TN + gx;
  }
  return true;
}

// ---- flow fields -------------------------------------------------------------
// Reverse Dijkstra over the legal-move graph from one goal node (or several):
// dist[n] = walking cost to the goal (orthogonal 2, diagonal 3), next[n] =
// the neighbour node to step to. `block` (optional, per cell) marks cells a
// mover may not enter (the pilot's building cells). ~6k nodes: about a
// millisecond, shared by every enemy.
export const FLOW_INF = 0x3fffffff;
export function flowField(T, goals, block = null) {
  const NN2 = 2 * TNN;
  const dist = new Int32Array(NN2).fill(FLOW_INF);
  const next = new Int32Array(NN2).fill(-1);
  const buckets = [];
  for (const g of goals) { dist[g] = 0; (buckets[0] || (buckets[0] = [])).push(g); }
  for (let d = 0; d < buckets.length; d++) {
    const B = buckets[d];
    if (!B) continue;
    for (let i = 0; i < B.length; i++) {
      const v = B[i];
      if (dist[v] !== d) continue;
      const cv = v >= TNN ? v - TNN : v;
      const zv = nodeTier(T, v);
      const gx = cv % TN, gy = (cv - gx) / TN;
      for (let k = 0; k < 8; k++) {
        const nx = gx + DX8[k], ny = gy + DY8[k];
        if (nx < 0 || ny < 0 || nx >= TN || ny >= TN) continue;
        const cu = ny * TN + nx;
        if (block && block[cu]) continue;
        const cost = k < 4 ? 2 : 3;
        const nodes = (T.flags[cu] & F_BRIDGE) ? [cu, TNN + cu] : [cu];
        for (const u of nodes) {
          const zu = nodeTier(T, u);
          // Does a mover on u's floor step into cv onto v's floor?
          if (nodeOf(T, cv, zu) !== v) continue;
          if (stepTier(T, cu, zu, cv) !== zv) continue;
          if (k >= 4) {
            const ca = gy * TN + nx, cb = ny * TN + gx;   // the two corner cells
            if (diagTier(T, cu, zu, cv) !== zv) continue;
            if (block && (block[ca] || block[cb])) continue;
          }
          const nd = d + cost;
          if (nd < dist[u]) {
            dist[u] = nd; next[u] = v;
            (buckets[nd] || (buckets[nd] = [])).push(u);
          }
        }
      }
    }
  }
  return { dist, next };
}

// The unit direction a mover at (x, y) on floor z should walk to follow the
// field, or null (at the goal, or no route). Aims at the next cell's centre,
// or two cells on when that line is clear (smoother paths).
export function flowDir(T, F, x, y, z) {
  const u = nodeOf(T, cellIx(x, y), floorAt(T, x, y, z));
  const v = F.next[u];
  if (v < 0) return null;
  let [tx, ty] = cellCenter(v >= TNN ? v - TNN : v);
  const w = F.next[v];
  if (w >= 0) {
    const [wx, wy] = cellCenter(w >= TNN ? w - TNN : w);
    if (terrainLineClear(T, x, y, z, wx, wy)) { tx = wx; ty = wy; }
  }
  const dx = tx - x, dy = ty - y, L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  return [dx / L, dy / L, L];
}
export function flowDist(T, F, x, y, z) {
  return F.dist[nodeOf(T, cellIx(x, y), floorAt(T, x, y, z))];
}

// The static escape field: walking cost to the nearest open ground (tier 0).
export function exitField(T) {
  if (!T.exit) {
    const goals = [];
    for (let c = 0; c < TNN; c++) {
      if (T.tier[c] === 0 && !(T.flags[c] & F_BRIDGE)) goals.push(c);
      if (T.flags[c] & F_BRIDGE) goals.push(TNN + c);
    }
    T.exit = flowField(T, goals);
  }
  return T.exit;
}

// Forward reachability from a node (BFS over legal moves): Uint8Array per node.
export function reachFrom(T, start) {
  const seen = new Uint8Array(2 * TNN);
  const q = [start]; seen[start] = 1;
  while (q.length) {
    const u = q.pop(), cu = u >= TNN ? u - TNN : u, zu = nodeTier(T, u);
    const gx = cu % TN, gy = (cu - gx) / TN;
    for (let k = 0; k < 4; k++) {
      const nx = gx + DX8[k], ny = gy + DY8[k];
      if (nx < 0 || ny < 0 || nx >= TN || ny >= TN) continue;
      const c1 = ny * TN + nx;
      const z1 = stepTier(T, cu, zu, c1);
      if (z1 < 0) continue;
      const v = nodeOf(T, c1, z1);
      if (!seen[v]) { seen[v] = 1; q.push(v); }
    }
  }
  return seen;
}
export function spawnReach(T) {
  if (!T.reach) T.reach = reachFrom(T, T.spawnNode);
  return T.reach;
}

// A standable spot for a site or a drop: flat (the 3x3 cells around share
// its tier), no ramp, no bridge, reachable from the spawn.
export function flatSpot(T, x, y) {
  if (!T) return true;
  const c = cellIx(x, y);
  const t = T.tier[c];
  if (T.flags[c] & (F_RAMP | F_BRIDGE)) return false;
  const gx = c % TN, gy = (c - gx) / TN;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= TN || ny >= TN) return false;
      const c1 = ny * TN + nx;
      if (T.tier[c1] !== t || (T.flags[c1] & (F_RAMP | F_BRIDGE))) return false;
    }
  }
  return !!spawnReach(T)[c];
}

// Does the rect touch anything but open ground (with a margin)? Buildings
// keep to the low ground.
export function rectOnFeature(T, r, m = 0) {
  if (!T) return false;
  const gx0 = Math.floor((r.x - m + TEXT) / TCELL), gy0 = Math.floor((r.y - m + TEXT) / TCELL);
  const gx1 = Math.floor((r.x + r.w + m + TEXT) / TCELL), gy1 = Math.floor((r.y + r.h + m + TEXT) / TCELL);
  for (let gy = Math.max(0, gy0); gy <= Math.min(TN - 1, gy1); gy++) {
    for (let gx = Math.max(0, gx0); gx <= Math.min(TN - 1, gx1); gx++) {
      const c = gy * TN + gx;
      if (T.tier[c] !== 0 || T.flags[c]) return true;
    }
  }
  return false;
}

// The ramp nearest to (x, y): its foot-to-top centre, for the spawn bias.
export function nearestRamp(T, x, y) {
  let best = null, bd = Infinity;
  for (const p of T.plateaus) {
    for (const r of [...p.ramps, ...(p.upper ? p.upper.ramps : [])]) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; best = { x: cx, y: cy, d }; }
    }
  }
  return best;
}

// The highest standable point of the layout (the boss altar's spot): the
// landmark on the upper tier, else on the biggest plateau.
export function crownSpot(T) {
  let best = null;
  for (const m of T.marks) if (!best || m.tier > best.tier) best = m;
  if (!best) {
    let bigA = 0;
    for (const p of T.plateaus) if (p.w * p.h > bigA) { bigA = p.w * p.h; best = { x: p.x + p.w / 2, y: p.y + p.h / 2, tier: 2 }; }
  }
  return best;
}
