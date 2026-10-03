// HORDES — the escape cinematic's picture: a chase seen from in front of the
// hero. The camera backs away down the path ahead of him, so the ground and
// its scenery recede to the crest behind him, where the horde and the boss
// come over. drawScene(g, scene, t) is a pure function of the scene and the
// time in seconds: no clock, no Math.random. Drawn in the 480x300 view.
import { blitGrid, blitPainted, actorStyle, cacheEnabled, STYLE_PLAIN, STYLE_STRUCT } from './sprite_cache.js';
import { enemySpriteFor } from './enemy_sprites.js';
import { BOSS_SPRITES } from './bosses.js';
import { characterSpriteFor } from './character_sprites.js';
import { STAGE_GROUND_PALETTES } from './world_ground.js';
import { propForStage } from './stage_props.js';
import { designsForStage } from './stage_buildings.js';
import { WRIT } from './escape_payout.js';
import { PORTAL_PALETTE, portalFrame } from './art/portal.js';

// ---- the timeline (seconds) --------------------------------------------------
export const BEATS = {
  ESTABLISH: [0, 1.5],   // the hero runs; the first enemies come over the crest
  HORDE: [1.5, 4.5],     // the wave grows and gains; lunges miss
  BOSS: [4.5, 7.0],      // the boss rises behind the horde and gains
  DIVE: [7.0, 8.0],      // the boss lunges, the hero dives through the portal, white flash
  CARD: [8.0, 9.0],      // ESCAPED +N gold
};
export const DURATION = BEATS.CARD[1];
export const GLANCE = [2.3, 2.85];          // the hero looks back
// Three enemies break from the pack and miss. side: which side they come from.
export const LUNGES = [{ t0: 3.25, side: 1 }, { t0: 4.35, side: -1 }, { t0: 5.75, side: 1 }];
export const LUNGE_S = 0.95;
export const BOSS_T = { RISE: 4.5, UP: 5.35, TELL: 6.7, LUNGE: 7.0, SLAM: 7.5 };
export const STOMPS = [4.62, 5.02, 5.4, 5.76, 6.1, 6.42, 6.72];   // the boss's footfalls
export const DIVE_T = 7.12;                 // the hero leaves the ground
export const FLASH_T = 7.45;

// ---- the camera --------------------------------------------------------------
const W = 480, H = 300, CX = 240;
export const BAR = 16;       // the film bars, top and bottom
const VPY = 118;             // the vanishing point's row
const GY = 144;              // rows below it at depth 1
const SP = 5;                // sprite scale at depth 1, where the hero runs
const RUN = 3.0;             // depth units the ground recedes each second
const D_CREST = 12;          // the crest of the rise: nothing shows beyond it
const CREST_Y = VPY + GY / D_CREST;   // 130
const D_NEAR = GY / (H - VPY);        // the depth at the bottom edge
const FLY_H = 13;            // how high a flyer hovers, in sprite pixels

const sOf = (d) => SP / d;
const yOf = (d) => VPY + GY / d;
const xOf = (X, d, sway) => CX + X * SP / d + sway * (1 - 1 / d);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, u) => a + (b - a) * u;
const span = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = (u) => { const v = clamp01(u); return v * v * (3 - 2 * v); };
const mod = (a, n) => ((a % n) + n) % n;
const tri = (u) => 1 - Math.abs(mod(u, 1) * 2 - 1);
function hash(i, salt) {
  let v = Math.imul((i | 0) ^ 0x9e3779b9, 0x27d4eb2d) ^ Math.imul((salt | 0) + 0x165667b1, 0x85ebca6b);
  v ^= v >>> 15; v = Math.imul(v, 0x2c1b3c6d); v ^= v >>> 12; v = Math.imul(v, 0x297a2d39); v ^= v >>> 15;
  return (v >>> 0) / 4294967296;
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, u) {
  const x = hexRgb(a), y = hexRgb(b);
  const c = (i) => Math.round(x[i] + (y[i] - x[i]) * u).toString(16).padStart(2, '0');
  return '#' + c(0) + c(1) + c(2);
}

// ---- the stage's sky ---------------------------------------------------------
// top/low: the sky from the top of the frame down to the crest; glow: the
// light on the horizon; ridge: the far silhouette and its shape; cap: a
// lighter tone on the ridge tops (snow, crater light), or null.
const SKIES = {
  VERDANT_HOLLOW: { top: '#0a1422', low: '#1c3a3c', glow: '#9ad08a', ridge: '#12241d', kind: 'pines', cap: null, orb: '#eef4cc', stars: true, cloud: '#2f5650' },
  ASHEN_WASTE: { top: '#120e14', low: '#3a2320', glow: '#e8823c', ridge: '#19151a', kind: 'spires', cap: '#e8823c', orb: '#ffb868', stars: false, cloud: '#2c2226' },
  SNOWFIELD: { top: '#0c1526', low: '#28425f', glow: '#b4dcf4', ridge: '#2b3f58', kind: 'peaks', cap: '#dcecfa', orb: '#f2f8ff', stars: true, cloud: '#3f5a78' },
  BLOOD_RUST: { top: '#190a0b', low: '#4c1d15', glow: '#ec7a3e', ridge: '#2a120e', kind: 'mesas', cap: null, orb: '#ffa264', stars: false, cloud: '#5a2a1c' },
  BONE_DESERT: { top: '#1c1710', low: '#5c4628', glow: '#f4dca6', ridge: '#3a2e1b', kind: 'dunes', cap: null, orb: '#fff2cc', stars: false, cloud: '#7a6238' },
  VOID_REACH: { top: '#090716', low: '#221a4a', glow: '#a488f4', ridge: '#171233', kind: 'shards', cap: '#a488f4', orb: '#dccfff', stars: true, cloud: '#34286a' },
  CINDER_MAW: { top: '#0f0907', low: '#3e1a0f', glow: '#f47226', ridge: '#1c100e', kind: 'cones', cap: '#ffb040', orb: '#ffb648', stars: false, cloud: '#2a1612' },
  WHITEOUT: { top: '#1b212b', low: '#4c5868', glow: '#e4ecf4', ridge: '#39434f', kind: 'hills', cap: '#cfd9e4', orb: '#ffffff', stars: false, cloud: '#6a7686' },
};

function paintSkyPlate(c, ox, oy, sky) {
  const N = 12, bh = 11;
  for (let i = 0; i < N; i++) {
    c.fillStyle = mix(sky.top, sky.low, Math.pow(i / (N - 1), 1.4));
    c.fillRect(ox, oy + i * bh, W, bh);
  }
  const y = oy + CREST_Y;
  c.fillStyle = mix(sky.low, sky.glow, 0.28); c.fillRect(ox, y - 22, W, 8);
  c.fillStyle = mix(sky.low, sky.glow, 0.5); c.fillRect(ox, y - 14, W, 7);
  c.fillStyle = mix(sky.low, sky.glow, 0.78); c.fillRect(ox, y - 7, W, 9);
  if (sky.stars) {
    for (let i = 0; i < 46; i++) {
      c.fillStyle = hash(i, 3) < 0.3 ? sky.orb : mix(sky.top, sky.orb, 0.5);
      c.fillRect(ox + Math.floor(hash(i, 1) * W), oy + BAR + Math.floor(hash(i, 2) * (CREST_Y - BAR - 40)), 1, 1);
    }
  }
}

// A pixel disc (the moon or the low sun), with a soft halo.
function paintOrb(c, ox, oy, sky) {
  const R = 9;
  for (let yy = -R - 4; yy <= R + 4; yy++) {
    const hw = Math.floor(Math.sqrt(Math.max(0, (R + 4) * (R + 4) - yy * yy)));
    c.fillStyle = mix(sky.low, sky.glow, 0.45);
    if (yy % 2 === 0) c.fillRect(ox - hw, oy + yy, hw * 2 + 1, 1);
  }
  for (let yy = -R; yy <= R; yy++) {
    const hw = Math.floor(Math.sqrt(R * R - yy * yy));
    c.fillStyle = sky.orb;
    c.fillRect(ox - hw, oy + yy, hw * 2 + 1, 1);
  }
  c.fillStyle = mix(sky.orb, sky.glow, 0.5);
  c.fillRect(ox - 4, oy - 3, 3, 2); c.fillRect(ox + 2, oy + 2, 3, 3);
}

// The ridge on the horizon: a 640 px strip that repeats, one silhouette per
// stage. Returns the height of the ridge at strip column x.
const STRIP = 640, RIDGE_H = 66;
function ridgeH(kind, x, salt) {
  const a = (x / STRIP) * Math.PI * 2;
  const s1 = Math.sin(a * 3 + salt * 0.9), s2 = Math.sin(a * 7 + salt * 1.7);
  switch (kind) {
    case 'pines': {
      const i = Math.floor(x / 10), c = i * 10 + 3 + Math.floor(hash(i, 40 + salt) * 5);
      const th = 8 + hash(i, 41 + salt) * 13;
      const tree = hash(i, 42 + salt) < 0.8 ? Math.max(0, th - Math.abs(x - c) * (th / 4.5)) : 0;
      return 12 + 5 * s1 + 2 * s2 + tree;
    }
    case 'spires': {
      const i = Math.floor(x / 16), x0 = i * 16 + 1 + Math.floor(hash(i, 51 + salt) * 4);
      const tw = 6 + Math.floor(hash(i, 52 + salt) * 7);
      if (hash(i, 50 + salt) < 0.55 && x >= x0 && x < x0 + tw) {
        return 14 + hash(i, 53 + salt) * 30 - (hash(x >> 1, 54 + salt) < 0.3 ? 3 : 0);
      }
      return 5 + 3 * hash(x >> 2, 55 + salt);
    }
    case 'peaks':
      return 6 + Math.max(tri(x / 160 + 0.13 + salt * 0.37) * 38, tri(x / 64 + 0.4 + salt * 0.21) * 20) +
        3 * tri(x / 16 + salt * 0.11);
    case 'mesas': {
      const i = Math.floor(x / 40), u = x - i * 40;
      const lvl = [8, 18, 27, 34][Math.floor(hash(i, 60 + salt) * 4)];
      return 5 + (u < 4 || u >= 36 ? Math.max(0, lvl - 8) : lvl);
    }
    case 'dunes':
      return 12 + 9 * s1 + 4 * s2;
    case 'shards': {
      const i = Math.floor(x / 32), c = i * 32 + 8 + Math.floor(hash(i, 70 + salt) * 16);
      const sh = 16 + hash(i, 71 + salt) * 30;
      const shard = hash(i, 72 + salt) < 0.6 ? Math.max(0, sh - Math.abs(x - c) * (sh / 5)) : 0;
      return 6 + 2 * s2 + shard;
    }
    case 'cones': {
      const i = Math.floor(x / 160), c = i * 160 + 50 + Math.floor(hash(i, 80 + salt) * 60);
      const ch = 30 + hash(i, 81 + salt) * 14;
      return 7 + 2 * s2 + Math.min(ch - 5, Math.max(0, ch - Math.abs(x - c) * (ch / 46)));
    }
    default:   // hills
      return 14 + 8 * s1 + 4 * s2;
  }
}
function paintRidge(c, ox, oy, sky, far) {
  const salt = far ? 100 : 0;
  const col = far ? mix(sky.ridge, sky.low, 0.5) : sky.ridge;
  for (let x = 0; x < STRIP; x += 2) {
    let h = ridgeH(sky.kind, x, salt);
    if (far) h = h * 0.8 + 12;
    h = Math.max(2, Math.min(RIDGE_H, Math.round(h)));
    c.fillStyle = col;
    c.fillRect(ox + x, oy - h, 2, h);
    if (!far && sky.cap) {
      // Snow on the tops, light in the craters and the windows.
      if (sky.kind === 'spires') {
        if (h > 16 && hash(x >> 1, 90) < 0.18) { c.fillStyle = sky.cap; c.fillRect(ox + x, oy - h + 4 + Math.floor(hash(x, 91) * (h - 10)), 2, 2); }
      } else if (h > 26) {
        c.fillStyle = sky.cap;
        c.fillRect(ox + x, oy - h, 2, sky.kind === 'cones' || sky.kind === 'shards' ? 2 : Math.min(6, h - 24));
      }
    }
  }
}

// ---- ground decals: small grids in the stage's ground colours ----------------
// Keys: 1 blade, 2 blade light, 3 stone, 4 stone light, 5 shadow, 6 accent.
const T = (rows) => rows.map(r => [...r].map(ch => (ch === '.' ? 0 : +ch)));
const DECALS = [
  T(['..2...1.', '.12..21.', '.12.121.', '5555555.']),          // tuft
  T(['.44.....', '4333.44.', '33333433', '.555555.']),          // pebbles
  T(['55......', '.455....', '...4555.', '......55']),          // crack
  T(['..444...', '.43333..', '4333333.', '33333335', '.555555.']),   // boulder
  T(['.6.', '666', '.6.']),                                     // glint
];

// A building as a pixel grid (its rect list painted once), so the sprite
// cache can scale it like any other sprite.
const buildingGrids = new Map();
function buildingGrid(b) {
  let gr = buildingGrids.get(b.id);
  if (!gr) {
    gr = [];
    for (let y = 0; y < b.h; y++) gr.push(new Array(b.w).fill(0));
    for (const [dx, dy, w, h, k] of b.rects) {
      for (let y = dy; y < dy + h && y < b.h; y++) for (let x = dx; x < dx + w && x < b.w; x++) gr[y][x] = k;
    }
    buildingGrids.set(b.id, gr);
  }
  return gr;
}
function drawBuilding(g, b, x, y, s) {
  if (cacheEnabled()) { blitGrid(g, buildingGrid(b), b.palette, x, y, STYLE_STRUCT, s); return; }
  for (const [dx, dy, w, h, k] of b.rects) {
    g.fillStyle = b.palette[k];
    g.fillRect(Math.round(x + dx * s), Math.round(y + dy * s), Math.ceil(w * s), Math.ceil(h * s));
  }
}

// ---- the hero looking back -----------------------------------------------------
// The face rows of each pilot's standing frame as [row, first col, last col],
// and the helm or hood colour that covers the face when the head turns. The
// step frames sit one row lower.
const FACES = {
  KNIGHT: { fill: 3, rows: [[4, 5, 8], [5, 5, 9], [6, 6, 8]] },
  WITCH: { fill: 2, rows: [[5, 5, 9], [6, 5, 9], [7, 6, 8]] },
  ROGUE: { fill: 2, rows: [[3, 6, 8], [4, 5, 9]] },
  PALADIN: { fill: 2, rows: [[4, 5, 8], [5, 5, 8], [6, 6, 7]] },
};
const glanceFrames = new Map();
// The step frames with the head turned over the shoulder: the face is kept
// only on its last columns, the rest is helm.
function glanceFor(id, spr) {
  let fr = glanceFrames.get(id);
  if (!fr) {
    const f = FACES[id];
    fr = spr.frames.map((grid, fi) => {
      const out = grid.map(r => r.slice());
      if (!f) return out;
      for (const [r, c0, c1] of f.rows) {
        const row = out[r + (fi > 0 ? 1 : 0)];
        const keep = Math.max(1, Math.min(2, c1 - c0));
        for (let c = c0; c <= c1 - keep; c++) row[c] = f.fill;
      }
      return out;
    });
    glanceFrames.set(id, fr);
  }
  return fr;
}

// ---- per-scene art (built once per scene) --------------------------------------
const CYC = 12, D_MIN = 0.7;   // scenery repeats every CYC depth units
function artOf(scene) {
  if (scene._art) return scene._art;
  const stage = STAGE_GROUND_PALETTES[scene.stage] ? scene.stage : 'VERDANT_HOLLOW';
  const pal = STAGE_GROUND_PALETTES[stage];
  const sky = SKIES[stage];
  const seed = scene.seed | 0;
  const scenery = [];
  // Props line the path; buildings stand further out; decals lie on the ground.
  const prop = propForStage(stage);
  for (let i = 0; i < 10; i++) {
    scenery.push({ kind: 'prop', ref: prop, i, x: (i % 2 ? 1 : -1) * 41, p: i * (CYC / 10) + hash(i, seed + 11) * 0.3 });
  }
  const kit = designsForStage(stage);
  for (let i = 0; i < 6; i++) {
    const b = kit[Math.floor(hash(i, seed + 21) * kit.length)];
    const side = i % 2 ? -1 : 1;
    scenery.push({ kind: 'building', ref: b, i, x: side * (92 + hash(i, seed + 22) * 44 + b.w * 0.25), p: i * (CYC / 6) + 0.9 + hash(i, seed + 23) * 0.8 });
  }
  for (let i = 0; i < 26; i++) {
    const u = hash(i, seed + 31);
    const kind = u < 0.34 ? 0 : u < 0.6 ? 1 : u < 0.8 ? 2 : u < 0.94 ? 3 : 4;
    // Off the path: the verges carry the tufts and stones.
    const side = hash(i, seed + 34) < 0.5 ? -1 : 1;
    const x = side * (PATH_W + 6 + hash(i, seed + 32) * 110);
    scenery.push({ kind: 'decal', ref: DECALS[kind], i, x, p: i * (CYC / 26) + hash(i, seed + 33) * 0.4 });
  }
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    clouds.push({ x: hash(i, seed + 41) * (W + 160), y: BAR + 6 + Math.floor(hash(i, seed + 42) * 52), w: 44 + Math.floor(hash(i, seed + 43) * 52), sp: 4 + hash(i, seed + 44) * 9 });
  }
  const pilot = characterSpriteFor(scene.character) || characterSpriteFor('KNIGHT');
  const boss = BOSS_SPRITES[scene.bossId] || BOSS_SPRITES.GRAVELMAW;
  scene._art = {
    stage, pal, sky, scenery, clouds, pilot, boss,
    glance: glanceFor(pilot.id, pilot),
    decalPal: { 1: pal.tuft, 2: pal.tuft2, 3: pal.stone, 4: pal.stoneTop, 5: pal.crack, 6: pal.accent },
    stripe: mix(pal.base, pal.crack, 0.4),
    path: mix(pal.base, pal.stone, 0.42),
    path2: mix(pal.base, pal.stone, 0.2),
    haze: mix(pal.base, sky.glow, 0.5),
    dust: mix(pal.base, pal.stoneTop, 0.7),
    edge: mix(pal.base, pal.stoneTop, 0.6),
  };
  return scene._art;
}

// ---- motion --------------------------------------------------------------------
const swayAt = (t) => 15 * Math.sin(t * 0.8 + 0.6) + 5 * Math.sin(t * 2.1);

// Screen shake in whole pixels: the boss's footfalls, the misses, the slam.
function shakeAt(t) {
  let amp = 0;
  for (const s of STOMPS) { const a = t - s; if (a >= 0 && a < 0.28) amp = Math.max(amp, 2.6 * (1 - a / 0.28)); }
  for (const L of LUNGES) { const a = t - (L.t0 + LUNGE_S * 0.7); if (a >= 0 && a < 0.2) amp = Math.max(amp, 1.6 * (1 - a / 0.2)); }
  const tell = t - BOSS_T.TELL;
  if (tell >= 0 && t < BOSS_T.LUNGE) amp = Math.max(amp, 1.2);
  const slam = t - BOSS_T.SLAM;
  if (slam >= 0 && slam < 0.45) amp = Math.max(amp, 6 * (1 - slam / 0.45));
  if (amp <= 0) return { x: 0, y: 0 };
  const k = Math.floor(t * 30);
  return { x: Math.round((hash(k, 5) * 2 - 1) * amp), y: Math.round((hash(k, 6) * 2 - 1) * amp) };
}

// How far behind the hero the front of the wave runs, in depth units.
function frontAt(t) {
  if (t < BEATS.ESTABLISH[1]) return lerp(12, 6, smooth(span(t, 0.15, BEATS.ESTABLISH[1])));
  if (t < BEATS.HORDE[1]) return lerp(6, 1.3, Math.pow(span(t, BEATS.HORDE[0], BEATS.HORDE[1]), 0.8));
  return lerp(1.3, 0.6, span(t, BEATS.BOSS[0], BEATS.BOSS[1]));
}

// The hero's sideways position (sprite pixels): a weave, and a dodge away
// from each lunge.
function heroX(t) {
  let x = 2.2 * Math.sin(t * 2.3);
  for (const L of LUNGES) {
    const u = (t - L.t0) / LUNGE_S;
    if (u > 0.25 && u < 0.95) x -= L.side * 10 * Math.sin(Math.PI * span(u, 0.25, 0.95));
  }
  return x;
}

// Where member i of the horde is at time t, or null while it is out of sight.
// d: depth; x: sideways; lift: height off the ground; state: run | leap |
// down | swoop.
export function hordePose(scene, i, t) {
  const m = scene.horde[i];
  const base = 1 + frontAt(t) + m.off + 0.1 * Math.sin(t * 1.7 + m.phase * 6.283);
  let d = base, x = m.x, lift = m.fly ? FLY_H + 2 * Math.sin(t * 6 + m.phase * 6.283) : 0, state = 'run';
  const li = scene.lungers.indexOf(i);
  if (li >= 0) {
    const L = LUNGES[li], u = (t - L.t0) / LUNGE_S;
    if (u > 0) {
      if (m.fly) {
        // A swoop: down past his head and on past the camera.
        if (u > 1.3) return null;
        const a = smooth(span(u, 0, 0.5));
        d = u < 0.5 ? lerp(base, 1.12, a) : 1.12 - (u - 0.5) * 0.8;
        x = lerp(m.x, L.side * 5, a) + (u > 0.5 ? L.side * (u - 0.5) * 30 : 0);
        lift = lerp(lift, 10, a);
        state = 'swoop';
      } else if (u < 0.4) {
        const a = smooth(u / 0.4);
        d = lerp(base, 1.3, a); x = lerp(m.x, L.side * 7, a);
      } else if (u < 0.7) {
        const v = (u - 0.4) / 0.3;
        d = lerp(1.3, 1.06, v); x = lerp(L.side * 7, L.side * 1.5, v);
        lift = Math.sin(Math.PI * v) * 15; state = 'leap';
      } else {
        // Face down where he was: the ground carries it back into the pack.
        const gone = 1.06 + RUN * (u - 0.7) * LUNGE_S;
        if (gone < base) { d = gone; x = lerp(L.side * 1.5, m.x, span(gone, 1.06, base)); state = 'down'; }
      }
    }
  }
  if (d > D_CREST || d < 0.45) return null;
  return { d, x, lift, state };
}

// The boss: null before it shows. d: depth; s: sprite scale; rise: 0 while it
// is still behind the crest, 1 once it stands on the plain.
export function bossPose(scene, t) {
  if (t < BOSS_T.RISE) return null;
  const spr = artOf(scene).boss;
  const rise = smooth(span(t, BOSS_T.RISE, BOSS_T.UP));
  let d = 10;
  if (t >= BOSS_T.UP) d = lerp(10, 4.6, smooth(span(t, BOSS_T.UP, BOSS_T.TELL)));
  const leap = span(t, BOSS_T.LUNGE, BOSS_T.SLAM);
  if (t >= BOSS_T.LUNGE) d = lerp(4.6, 1.2, leap * leap);
  const s = (5.2 * 24 / spr.box.h) * SP / d;
  const tell = t >= BOSS_T.TELL && t < BOSS_T.LUNGE + 0.08;
  return { d, s, rise, leap, tell, air: Math.sin(Math.PI * leap) * 46 };
}

// The hero: depth, scale, sideways and height, and which frame he is on.
export function heroPose(scene, t) {
  const dive = span(t, DIVE_T, DIVE_T + 0.42);
  const d = lerp(1, 0.52, dive * dive);
  const hop = Math.abs(Math.sin(t * 9 * Math.PI)) * 0.7;
  const lift = dive > 0 ? Math.sin(Math.PI * Math.min(1, dive * 1.15)) * 7 : hop;
  return { d, x: heroX(t) * (1 - dive), lift, dive, step: Math.floor(t * 9) % 2,
    glance: t >= GLANCE[0] && t < GLANCE[1] };
}

// ---- drawing ---------------------------------------------------------------------
const ST_ACTOR = actorStyle(false, false, null, false, false);
const ST_FLASH = actorStyle(true, false, null, false, false);
const ST_TELL = actorStyle(false, false, '#fff0a0', false, false);
const PORTAL = { cyan: '#9effe0', violet: '#7a58c8', gold: '#ffd54a', deep: '#1b1130' };
const GOLD = '#ffd75e';

function drawSky(g, A, t, sway) {
  const sky = A.sky;
  g.fillStyle = sky.top; g.fillRect(-8, -8, W + 16, BAR + 16);
  g.fillStyle = mix(sky.low, sky.glow, 0.78); g.fillRect(-8, CREST_Y - 12, W + 16, 20);
  blitPainted(g, 'esc-sky:' + A.stage, { x: 0, y: 0, w: W, h: 132 }, (c, ox, oy) => paintSkyPlate(c, ox, oy, sky), 0, 0);
  blitPainted(g, 'esc-orb:' + A.stage, { x: -14, y: -14, w: 29, h: 29 }, (c, ox, oy) => paintOrb(c, ox, oy, sky),
    Math.round(CX + 92 - sway * 0.25), 46);
  // Clouds (smoke on the burnt stages) drift on the wind, each at its own pace.
  g.fillStyle = sky.cloud;
  for (const c of A.clouds) {
    const x = Math.round(mod(c.x + t * c.sp - sway * 0.4, W + 160) - 110);
    g.globalAlpha = 0.55;
    g.fillRect(x, c.y, c.w, 4);
    g.fillRect(x + 7, c.y - 3, c.w - 20, 3);
    g.globalAlpha = 0.35;
    g.fillRect(x + 14, c.y + 4, c.w - 30, 2);
  }
  g.globalAlpha = 1;
  // Two ridge layers: the far one moves less.
  for (const far of [true, false]) {
    const off = Math.round(mod(sway * (far ? 0.55 : 0.85) + (far ? 210 : 0), STRIP));
    const key = 'esc-ridge:' + A.stage + (far ? ':far' : ':near');
    const paint = (c, ox, oy) => paintRidge(c, ox, oy, sky, far);
    const box = { x: 0, y: -RIDGE_H, w: STRIP, h: RIDGE_H };
    blitPainted(g, key, box, paint, off - STRIP, CREST_Y + 1);
    if (off < W + 8) blitPainted(g, key, box, paint, off, CREST_Y + 1);
  }
}

const PATH_W = 31;           // half the path's width, in sprite pixels
function drawGround(g, A, t, sway) {
  g.fillStyle = A.pal.base; g.fillRect(-8, CREST_Y, W + 16, H - CREST_Y + 8);
  // The ground is banded across, half a depth unit to a band, and the run
  // carries the bands back to the crest. Drawn in 4 px rows: each row knows
  // its depth, so the path narrows with it. Far bands are thinner than a row,
  // so the banding stops short of the crest.
  const L = 0.5, c = RUN * t, ROW = 4;
  for (let y = Math.floor(CREST_Y); y < H + 8; y += ROW) {
    const d = GY / (y + ROW / 2 - VPY);
    const odd = d < 4.8 && mod(Math.floor((c - d) / L), 2) === 1;
    if (odd) { g.fillStyle = A.stripe; g.fillRect(-8, y, W + 16, ROW); }
    const cx = xOf(0, d, sway), hw = PATH_W * SP / d;
    const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
    g.fillStyle = odd ? A.path2 : A.path;
    g.fillRect(x0, y, x1 - x0, ROW);
    if (odd) {
      // Kerb stones along both edges, one to a band.
      const w = Math.max(1, Math.round(1.6 * SP / d));
      g.fillStyle = A.edge;
      g.fillRect(x0 - w, y, w, ROW);
      g.fillRect(x1, y, w, ROW);
    }
  }
  // Haze where the ground meets the sky.
  g.fillStyle = A.haze;
  g.globalAlpha = 0.5; g.fillRect(-8, CREST_Y, W + 16, 3);
  g.globalAlpha = 0.28; g.fillRect(-8, CREST_Y + 3, W + 16, 5);
  g.globalAlpha = 0.12; g.fillRect(-8, CREST_Y + 8, W + 16, 8);
  g.globalAlpha = 1;
}

// Everything that stands on the ground, far to near.
function collect(scene, A, t) {
  const items = [];
  for (const sc of A.scenery) {
    const d = D_MIN + mod(RUN * t - sc.p, CYC);
    if (d < D_CREST) items.push({ kind: sc.kind, d, x: sc.x, ref: sc.ref, i: sc.i });
  }
  for (let i = 0; i < scene.horde.length; i++) {
    const p = hordePose(scene, i, t);
    if (p) items.push({ kind: 'enemy', d: p.d, x: p.x, lift: p.lift, state: p.state, i });
  }
  const b = bossPose(scene, t);
  if (b) items.push({ kind: 'boss', d: b.d, x: 0, pose: b });
  const h = heroPose(scene, t);
  items.push({ kind: 'hero', d: h.d, x: h.x, pose: h });
  items.sort((p, q) => q.d - p.d);
  return items;
}

const fog = (d) => (d < 7 ? 1 : lerp(1, 0.4, (d - 7) / (D_CREST - 7)));

function drawShadow(g, x, y, w, s) {
  const hw = Math.max(1, Math.round(w * s * 0.42)), hh = Math.max(1, Math.round(s * 1.1));
  g.fillStyle = '#000000';
  const a = g.globalAlpha;
  g.globalAlpha = (a === undefined ? 1 : a) * 0.34;
  g.fillRect(Math.round(x - hw), Math.round(y - hh), hw * 2, hh * 2);
  if (hw > 4) g.fillRect(Math.round(x - hw * 0.7), Math.round(y - hh * 1.6), Math.round(hw * 1.4), Math.round(hh * 3.2));
  g.globalAlpha = a === undefined ? 1 : a;
}

function drawItem(g, scene, A, it, t, sway) {
  const d = it.d, s = sOf(d), x = xOf(it.x, d, sway), y = yOf(d);
  switch (it.kind) {
    case 'decal': {
      const gr = it.ref;
      g.globalAlpha = fog(d) * 0.95;
      blitGrid(g, gr, A.decalPal, Math.round(x - gr[0].length * s / 2), Math.round(y - gr.length * s), STYLE_PLAIN, s);
      g.globalAlpha = 1;
      break;
    }
    case 'prop': {
      const p = it.ref, gr = p.frames[(Math.floor(t * 6) + it.i) % p.frameCount];
      g.globalAlpha = fog(d);
      blitGrid(g, gr, p.palette, Math.round(x - p.w * s / 2), Math.round(y - p.h * s), STYLE_STRUCT, s);
      g.globalAlpha = 1;
      break;
    }
    case 'building': {
      const b = it.ref;
      g.globalAlpha = fog(d);
      drawBuilding(g, b, Math.round(x - b.w * s / 2), Math.round(y - b.h * s), s);
      g.globalAlpha = 1;
      break;
    }
    case 'enemy': {
      const m = scene.horde[it.i], spr = enemySpriteFor(m.type);
      const down = it.state === 'down';
      const gr = spr.frames[down ? 0 : Math.floor((t + m.phase) * 8) % spr.frames.length];
      const w = gr[0].length, h = gr.length;
      const hop = it.state === 'run' && !m.fly ? Math.abs(Math.sin((t + m.phase) * 8 * Math.PI / 2)) * 0.8 : 0;
      g.globalAlpha = fog(d);
      drawShadow(g, x, y, w, s);
      blitGrid(g, gr, spr.palette, Math.round(x - w * s / 2), Math.round(y - (h + it.lift + hop) * s), ST_ACTOR, s);
      g.globalAlpha = 1;
      break;
    }
    case 'boss': {
      const b = it.pose, spr = A.boss;
      const tellGrid = spr.tell || spr.frames[1];
      let stomps = 0;
      for (const st of STOMPS) if (t >= st) stomps++;
      const gr = b.tell ? tellGrid : spr.frames[stomps % spr.frames.length];
      const w = gr[0].length, h = gr.length;
      // Still behind the crest: only what stands above its ground line shows.
      const sunk = (1 - b.rise) * h * b.s * 0.94;
      const by = y - h * b.s + sunk - b.air;
      const rising = b.rise < 1;
      if (rising) { g.save(); g.beginPath(); g.rect(-8, -8, W + 16, y + 8); g.clip(); }
      else drawShadow(g, x, y, w * 0.9, b.s);
      blitGrid(g, gr, spr.palette, Math.round(x - w * b.s / 2), Math.round(by), b.tell ? ST_TELL : ST_ACTOR, b.s);
      if (rising) g.restore();
      break;
    }
    default: {   // the hero
      const p = it.pose, spr = A.pilot;
      const frames = p.glance ? A.glance : spr.frames;
      const gr = frames[1 + p.step];
      const w = gr[0].length, h = gr.length;
      if (p.dive === 0) drawHeelDust(g, A, p, t, sway);
      if (p.dive < 0.5) drawShadow(g, x, y, w * 0.8, s);
      blitGrid(g, gr, spr.palette, Math.round(x - w * s / 2), Math.round(y - (h + p.lift) * s), p.dive > 0.55 ? ST_FLASH : ST_ACTOR, s);
    }
  }
}

// Dust off the hero's heels, left behind him as he runs.
function drawHeelDust(g, A, hero, t, sway) {
  g.fillStyle = A.dust;
  for (let i = 0; i < 6; i++) {
    const age = mod(t * 2.2 + i / 6, 1), d = hero.d + 0.1 + age * 0.9;
    const sz = Math.max(2, Math.round((1 + age * 2.2) * sOf(d)));
    g.globalAlpha = (1 - age) * 0.5;
    g.fillRect(Math.round(xOf(hero.x + (hash(i, 7) - 0.5) * 12, d, sway) - sz / 2), Math.round(yOf(d) - sz - age * 9), sz, sz);
  }
  g.globalAlpha = 1;
}

// Dust under the boss's feet and where a lunge lands.
function drawDust(g, scene, A, t, sway) {
  g.fillStyle = A.dust;
  const puff = (cx, cy, age, life, reach, size) => {
    if (age < 0 || age >= life) return;
    const u = age / life;
    g.globalAlpha = (1 - u) * 0.6;
    for (let i = 0; i < 8; i++) {
      const dir = i < 4 ? -1 : 1, k = (i % 4) + 1;
      const sz = Math.round(size * (0.6 + u));
      g.fillRect(Math.round(cx + dir * (k * reach * 0.22 + u * reach * k * 0.3) - sz / 2), Math.round(cy - sz - u * size * (1 + (k % 2))), sz, sz);
    }
  };
  const b = bossPose(scene, t);
  if (b && b.rise >= 1) {
    for (const st of STOMPS) puff(xOf(0, b.d, sway), yOf(b.d), t - st, 0.45, 26 * b.s / 5, 5);
  }
  for (let li = 0; li < LUNGES.length; li++) {
    const L = LUNGES[li];
    if (scene.horde[scene.lungers[li]] && !scene.horde[scene.lungers[li]].fly) {
      puff(xOf(L.side * 1.5, 1.06, sway), yOf(1.06), t - (L.t0 + LUNGE_S * 0.7), 0.4, 34, 6);
    }
  }
  puff(CX, yOf(1.2), t - BOSS_T.SLAM, 0.5, 120, 14);
  g.globalAlpha = 1;
}

// Speed lines: short streaks along the lines to the vanishing point, running
// inward as the world falls away behind him.
function drawStreaks(g, A, t, sway) {
  g.fillStyle = mix(A.sky.glow, '#ffffff', 0.6);
  const vx = CX + sway;
  for (let i = 0; i < 14; i++) {
    const u = mod(t * (1.1 + hash(i, 61) * 0.6) + hash(i, 62), 1);
    const ang = (i % 2 ? 0 : Math.PI) + (hash(i, 63) - 0.5) * 1.35;
    const r = lerp(310, 80, u), len = 6 + (1 - u) * 22;
    const cs = Math.cos(ang), sn = Math.sin(ang) * 0.8;
    g.globalAlpha = 0.4 * (1 - u) * (1 - u) + 0.04;
    for (let k = 0; k < 3; k++) {
      const rr = r + (len * k) / 3;
      g.fillRect(Math.round(vx + cs * rr), Math.round(VPY + sn * rr), Math.max(2, Math.round(len / 3)), u < 0.35 ? 2 : 1);
    }
  }
  g.globalAlpha = 1;
}

// The portal at the camera's back: its light spreads up the ground, then its
// rim closes round the picture.
function drawPortalLight(g, t) {
  const k = smooth(span(t, 5.9, 7.2));
  if (k <= 0) return;
  g.fillStyle = PORTAL.cyan;
  for (let b = 0; b < 8; b++) {
    g.globalAlpha = 0.55 * k * Math.pow(1 - b / 8, 1.5);
    g.fillRect(-8, H - BAR - (b + 1) * 11, W + 16, 11);
  }
  g.globalAlpha = 1;
}
function drawPortalRim(g, t) {
  const k = smooth(span(t, 5.9, 7.2));
  if (k <= 0) return;
  // Light on the picture's edges (under the top bar, over the bottom one).
  const top = BAR, th = Math.round(6 * k);
  g.fillStyle = PORTAL.cyan;
  for (let b = 0; b < 4 && th > 0; b++) {
    const o = b * th;
    g.globalAlpha = 0.3 * k * (1 - b / 4);
    g.fillRect(o, top + o, W - 2 * o, th);
    g.fillRect(o, H - o - th, W - 2 * o, th);
    g.fillRect(o, top + o + th, th, H - top - 2 * o - 2 * th);
    g.fillRect(W - o - th, top + o + th, th, H - top - 2 * o - 2 * th);
  }
  // Blocks of the portal's light march round the frame, two rows, opposite ways.
  const cols = [PORTAL.cyan, PORTAL.violet, PORTAL.cyan, PORTAL.gold];
  for (let ring = 0; ring < 2; ring++) {
    const inset = lerp(-16, ring ? 22 : 8, k), n = ring ? 26 : 46;
    const x0 = inset, y0 = top + inset, w = W - 2 * inset, h = H - top - 2 * inset;
    const per = 2 * (w + h);
    for (let j = 0; j < n; j++) {
      let u = mod(j / n + (ring ? -1 : 1) * t * 0.1, 1) * per;
      let x, y;
      if (u < w) { x = x0 + u; y = y0; } else if ((u -= w) < h) { x = x0 + w; y = y0 + u; } else if ((u -= h) < w) { x = x0 + w - u; y = y0 + h; } else { x = x0; y = y0 + h - (u - w); }
      const sz = ring ? 4 + Math.floor(hash(j, 71) * 4) : 8 + Math.floor(hash(j, 72) * 7);
      g.fillStyle = cols[(j + ring) % cols.length];
      g.globalAlpha = (ring ? 0.55 : 0.9) * k;
      g.fillRect(Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz);
    }
  }
  g.globalAlpha = 1;
}

function textW(g, s, per) {
  const m = typeof g.measureText === 'function' ? g.measureText(s) : null;
  return (m && m.width > 0) ? m.width : s.length * per;
}

// The skip label's box, top right (any key or tap skips; this says so).
export const SKIP_RECT = { x: W - 50, y: 2, w: 44, h: BAR - 4 };

const BAR_COL = '#06060b';
function drawBars(g) {
  g.fillStyle = BAR_COL;
  g.fillRect(0, 0, W, BAR);
  g.fillRect(0, H - BAR, W, BAR);
}
function drawHud(g, scene, t) {
  g.font = 'bold 9px monospace';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = '#c8c8d8';
  g.fillText('ESCAPE', 8, BAR / 2 + 0.5);
  const lead = scene.test ? 'TEST: no gold' : scene.payout > 0 ? '+' + scene.payout + ' gold' : '';
  if (lead) {
    g.fillStyle = scene.test ? '#9aa4b0' : GOLD;
    g.fillText(lead, 8 + textW(g, 'ESCAPE', 5.4) + 8, BAR / 2 + 0.5);
  }
  const r = SKIP_RECT;
  g.fillStyle = '#3a3a4c';
  g.fillRect(r.x, r.y, r.w, 1); g.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  g.fillRect(r.x, r.y, 1, r.h); g.fillRect(r.x + r.w - 1, r.y, 1, r.h);
  g.textAlign = 'center';
  g.fillStyle = '#b8b8cc';
  g.fillText('SKIP', r.x + r.w / 2, BAR / 2 + 0.5);
  if (t < 2.6) {
    g.globalAlpha = 1 - span(t, 2.0, 2.6);
    g.fillStyle = '#8a8aa0';
    g.font = 'bold 8px monospace';
    g.fillText('any key or tap skips', CX, H - BAR / 2 + 0.5);
    g.globalAlpha = 1;
  }
  g.textAlign = 'left';
}

// The whole frame at time t.
export function drawScene(g, scene, t) {
  if (t >= BEATS.CARD[0]) {
    drawCard(g, scene, t - BEATS.CARD[0], 1 - span(t, BEATS.CARD[0], BEATS.CARD[0] + 0.25));
    return;
  }
  const A = artOf(scene);
  const sway = swayAt(t), sh = shakeAt(t);
  g.save();
  g.translate(sh.x, sh.y);
  drawSky(g, A, t, sway);
  drawGround(g, A, t, sway);
  drawPortalLight(g, t);
  const items = collect(scene, A, t);
  // What has come past the hero toward the camera is drawn over the film
  // bars, with him once he dives.
  const front = (it) => it.d < 0.95 || (it.kind === 'boss' && it.pose.leap > 0.25);
  for (const it of items) if (!front(it)) drawItem(g, scene, A, it, t, sway);
  drawDust(g, scene, A, t, sway);
  drawStreaks(g, A, t, sway);
  g.restore();
  drawBars(g);
  drawPortalRim(g, t);
  g.save();
  g.translate(sh.x, sh.y);
  for (const it of items) if (front(it)) drawItem(g, scene, A, it, t, sway);
  g.restore();
  // The top bar and its text stay whole whatever comes at the camera.
  g.fillStyle = BAR_COL;
  g.fillRect(0, 0, W, BAR);
  drawHud(g, scene, t);
  const white = span(t, FLASH_T, FLASH_T + 0.18);
  if (white > 0) { g.globalAlpha = white; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
}

// The payout card. tc: seconds since it came up (the gold counts up over the
// first 0.4 s); white: how much of the flash is still over it.
export function drawCard(g, scene, tc, white = 0) {
  const A = artOf(scene);
  g.fillStyle = '#0b0a16';
  g.fillRect(0, 0, W, H);
  // The far side of the portal: its gate, and the hero safe in front of it.
  const px = 74, py = 80;
  blitGrid(g, portalFrame(Math.floor(tc * 6)), PORTAL_PALETTE, px, py, STYLE_PLAIN, 3);
  const spr = A.pilot, gr = spr.frames[0], s = 4;
  const hx = px + 72, hy = py + 146;
  drawShadow(g, hx, hy, 16 * 0.8, s);
  blitGrid(g, gr, spr.palette, hx - 32, hy - 64, ST_ACTOR, s);
  const tx = 244;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = 'bold 30px monospace';
  g.fillStyle = '#f2f2fa';
  g.fillText('ESCAPED', tx, 150);
  g.font = 'bold 18px monospace';
  if (scene.test) {
    g.fillStyle = '#9aa4b0';
    g.fillText('TEST: no gold', tx, 178);
  } else if (scene.payout > 0) {
    const k = span(tc, 0.05, 0.4);
    g.fillStyle = GOLD;
    g.fillText('+' + Math.round(scene.payout * (1 - (1 - k) * (1 - k))) + ' gold', tx, 178);
    if (scene.writ) {
      g.font = 'bold 9px monospace';
      g.fillStyle = '#8fe0a0';
      g.fillText('Escape Writ: +' + WRIT.BONUS_PCT + '%', tx, 195);
    }
  }
  if (white > 0) { g.globalAlpha = white; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
}
