// HORDES - the death movie: "the escape that fails" (R2).
//
// Seen at the end of almost every run, so it is short and it says what killed
// you. Four shots, about 3.5 s:
//   FREEZE  the real battlefield, frozen on the last frame before the death
//           (main.js hands in a copy of the canvas): dimmed, with the real
//           killer lit and boxed in red-orange (danger) and the hero ringed in
//           warm white. The caption names the killer and how it killed.
//   ROAD    cut to the escape's road camera (src/escape_cine_art.js ROAD): the
//           pilot runs, the horde of the run behind him, the killer leading.
//   LUNGE   the killer lunges (a shooter fires, a boss or the Maw leaps) ...
//   HIT     ... and this time it connects: a flash, a red-orange burst, a jolt.
//   SLUMP   the run stops; the pilot drops to his knees, then falls.
//   CLOSE   the horde closes in round him; the film bars close to black.
// main.js then reveals the end card that die() composed before the movie.
//
// A first viewing holds the freeze 0.7 s longer (time to read the caption);
// a repeat viewing plays straight through. Reduced motion gets the freeze as
// a still card, 1.5 s.
//
// render(g, t, cause, opts) is a pure function of the wall time t (ms since
// the movie began) and its inputs: no clock, no Math.random, no DOM.
// Public API (main.js and the tests): CINE_DURATION, PHASES, REPEAT_DURATION,
// REPEAT_PHASES, STILL_DURATION, durationOf, phasesOf, phaseAt, isDone,
// sceneOf, render, heroPoses, DEATH_CUE_PHASES, DEATH_CINE_TEST.
// opts (all optional):
//   hero     pilotLook(id) (src/movie_cast.js): the pilot of the run
//   killer   killerLook(deathBy): the enemy, boss or Maw whose hit killed him
//   road     { seed, stage, met, bossId }: the escape's scene inputs (the
//            run's stage and the enemy types it met make the horde)
//   freeze   { snap, scale, hero: {x, y}, killer: {x, y} | null }: the frozen
//            frame (a canvas, or null) and where the hero and the killer
//            stood on it, in view pixels; scale is the world's zoom
//   repeat   seen before: no held freeze
//   reduced  reduced motion: the still card
import { pilotLook } from './movie_cast.js';
import { ROAD } from './escape_cine_art.js';
import { buildScene } from './escape_cine.js';
import { blitGrid, actorStyle } from './sprite_cache.js';
import { enemySpriteFor } from './enemy_sprites.js';

// ---- the timeline (scene ms; a repeat viewing plays it as wall ms) ----------
const SCENE = {
  FREEZE: [0, 600],
  ROAD: [600, 1500],
  LUNGE: [1500, 1950],
  HIT: [1950, 2100],
  SLUMP: [2100, 2800],
  CLOSE: [2800, 3500],
};
const ORDER = ['FREEZE', 'ROAD', 'LUNGE', 'HIT', 'SLUMP', 'CLOSE'];
const SCENE_DURATION = SCENE.CLOSE[1];          // 3500
export const HOLD_MS = 700;                      // the first viewing's held freeze
const HOLD_AT = SCENE.FREEZE[1];
export const CINE_DURATION = SCENE_DURATION + HOLD_MS;   // 4200, first viewing
export const REPEAT_DURATION = SCENE_DURATION;           // 3500
export const STILL_DURATION = 1500;                      // reduced motion

const shift = (v) => (v >= HOLD_AT ? v + HOLD_MS : v);
export const PHASES = Object.fromEntries(ORDER.map(k => [k, k === 'FREEZE'
  ? [0, SCENE.FREEZE[1] + HOLD_MS] : [shift(SCENE[k][0]), shift(SCENE[k][1])]]));
export const REPEAT_PHASES = Object.fromEntries(ORDER.map(k => [k, [...SCENE[k]]]));
const STILL_PHASES = { FREEZE: [0, STILL_DURATION] };
// Every phase has its own sound cue (src/audio.js DEATH_CUES).
export const DEATH_CUE_PHASES = ORDER.slice();

export function durationOf(opts) {
  const o = opts || {};
  return o.reduced ? STILL_DURATION : o.repeat ? REPEAT_DURATION : CINE_DURATION;
}
export function phasesOf(opts) {
  const o = opts || {};
  return o.reduced ? STILL_PHASES : o.repeat ? REPEAT_PHASES : PHASES;
}
export function isDone(t, opts) { return t >= durationOf(opts); }
export function phaseAt(t, opts) {
  if (t >= durationOf(opts)) return 'DONE';
  const P = phasesOf(opts);
  let out = 'FREEZE';
  for (const k of ORDER) if (P[k] && t >= P[k][0]) out = k;
  return out;
}
// The scene time a wall time shows: the first viewing holds the freeze.
export function sceneOf(t, opts) {
  const o = opts || {};
  const w = Math.max(0, Math.min(Number(t) || 0, durationOf(o)));
  if (o.reduced) return SCENE.FREEZE[1];
  if (o.repeat) return w;
  return w < HOLD_AT ? w : w < HOLD_AT + HOLD_MS ? HOLD_AT : w - HOLD_MS;
}

// ---- colours ------------------------------------------------------------------
// Decision 5: red-orange is danger (the killer), warm white is the hero.
const DANGER = '#ff5a1f', DANGER_HOT = '#ffc890', DANGER_DARK = '#8a2208';
const HERO_WARM = '#ffd8c4';                 // render.js HERO_WARM
const INK = '#06060b', GREY = '#a8a4b8';
const ST_KILLER = actorStyle(false, false, DANGER, false, false);
const ST_HERO = actorStyle(false, false, HERO_WARM, false, false);
const ST_HIT = actorStyle(true, false, null, false, false);
const ST_HORDE = actorStyle(false, false, null, false, false);

const { W, H, BAR, D_CREST, D_MIN, CYC, RUN, SP } = ROAD;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, u) => a + (b - a) * u;
const span = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = (u) => { const v = clamp01(u); return v * v * (3 - 2 * v); };
const mod = (a, n) => ((a % n) + n) % n;

// ---- the pilot's poses ------------------------------------------------------------
// stand: the pilot's own standing frame. kneel: the leg rows dropped, the body
// sunk to the ground. fallen: the standing frame turned on its side (head to
// the right) and trimmed, lying on the ground. Integer pixels, no new art.
function sinkRows(grid, keep) {
  const w = grid[0].length, out = [];
  for (let i = 0; i < grid.length - keep.length; i++) out.push(new Array(w).fill(0));
  for (const r of keep) out.push(grid[r].slice());
  return out;
}
function trim(grid) {
  const rows = grid.filter(r => r.some(v => v));
  if (!rows.length) return [[0]];
  let c0 = rows[0].length, c1 = -1;
  for (const r of rows) r.forEach((v, c) => { if (v) { c0 = Math.min(c0, c); c1 = Math.max(c1, c); } });
  return rows.map(r => r.slice(c0, c1 + 1));
}
function onSide(grid) {
  // out[x][n-1-y] = grid[y][x]: a quarter turn, the top of the head ends on
  // the right.
  const n = grid.length, w = grid[0].length, out = [];
  for (let x = 0; x < w; x++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(grid[n - 1 - c][x]);
    out.push(row);
  }
  return trim(out);
}
const POSES = new WeakMap();
export function heroPoses(hero) {
  if (POSES.has(hero)) return POSES.get(hero);
  const stand = hero.frames[0], n = stand.length;
  const legA = Math.floor(n * 0.62), legB = Math.floor(n * 0.88);
  const kneelRows = [];
  for (let r = 0; r < n; r++) if (r < legA || r >= legB) kneelRows.push(r);
  const p = {
    stand, run: hero.frames.length > 2 ? [hero.frames[1], hero.frames[2]] : [stand, stand],
    kneel: sinkRows(stand, kneelRows), fallen: onSide(stand), palette: hero.palette,
  };
  POSES.set(hero, p);
  return p;
}
const KNIGHT = pilotLook(null);

// ---- the road scene (built once per movie) -----------------------------------------
const SCENES = new WeakMap();
function roadScene(o) {
  const key = o.road || o;
  let s = SCENES.get(key);
  if (!s) {
    const r = o.road || {};
    s = buildScene({ seed: r.seed || 1, stage: r.stage, met: r.met, bossId: r.bossId,
      character: (o.hero && o.hero.id) || 'KNIGHT' });
    SCENES.set(key, s);
  }
  return s;
}
// The killer the road shows: the one handed in, else the first of the horde.
function roadKiller(o, scene) {
  if (o.killer && o.killer.frames && o.killer.frames.length) return o.killer;
  const id = scene.horde[0] && scene.horde[0].type;
  const e = id ? enemySpriteFor(id) : null;
  return e ? { kind: 'enemy', id, name: null, frames: e.frames, palette: e.palette, box: { w: e.w, h: e.h } } : null;
}

// ---- the caption ---------------------------------------------------------------------
const HOW = { contact: 'in melee', shot: 'at range', drain: 'latched on and drained you' };
// gone: the killer died before its shot landed (it has no box on the freeze).
export function captionOf(cause, killer, gone = false) {
  const name = (killer && killer.name) || 'THE HORDE';
  let how = killer && killer.kind === 'maw' ? 'swallowed you' : (killer && HOW[cause]) || '';
  if (gone && killer && how) how += ', now dead';
  return { name, how };
}
function textW(g, s, per) {
  const m = typeof g.measureText === 'function' ? g.measureText(s) : null;
  return (m && m.width > 0) ? m.width : s.length * per;
}

// ---- the freeze ---------------------------------------------------------------------------
// Corner brackets round (x, y) at half-size r: the killer's box.
function brackets(g, x, y, r, col, arm) {
  const L = Math.round(x - r), R = Math.round(x + r), T = Math.round(y - r), B = Math.round(y + r);
  for (const [c, o] of [[INK, 1], [col, 0]]) {
    g.fillStyle = c;
    g.fillRect(L + o, T + o, arm, 2); g.fillRect(L + o, T + o, 2, arm);
    g.fillRect(R - arm + o, T + o, arm, 2); g.fillRect(R - 2 + o, T + o, 2, arm);
    g.fillRect(L + o, B - 2 + o, arm, 2); g.fillRect(L + o, B - arm + o, 2, arm);
    g.fillRect(R - arm + o, B - 2 + o, arm, 2); g.fillRect(R - 2 + o, B - arm + o, 2, arm);
  }
}
// A flat ring under the hero (the game's hero ring, larger).
function heroRing(g, x, y, r) {
  for (let a = 0; a < 48; a++) {
    const u = (a / 48) * Math.PI * 2;
    const px = Math.round(x + Math.cos(u) * r), py = Math.round(y + Math.sin(u) * r * 0.38);
    g.fillStyle = INK; g.fillRect(px, py + 1, 2, 1);
    g.fillStyle = HERO_WARM; g.fillRect(px, py, 2, 1);
  }
}
const BACK = '#0d0b14';
// Where the hero and the killer stood on the frozen frame (view pixels), and
// the radius of each one's mark. With no frozen frame they stand side by side.
function freezeLayout(o, killer) {
  const f = o.freeze || {};
  const z = Math.max(1, Number(f.scale) || 2);
  const hero = f.hero ? { x: f.hero.x, y: f.hero.y } : { x: W / 2 - 46, y: 150 };
  let k = null;
  if (killer) {
    const at = f.killer ? { x: f.killer.x, y: f.killer.y } : (f.hero ? null : { x: W / 2 + 54, y: 150 });
    if (at) {
      const bw = (killer.box && killer.box.w) || killer.frames[0][0].length;
      const bh = (killer.box && killer.box.h) || killer.frames[0].length;
      k = { x: at.x, y: at.y, r: Math.max(12, Math.max(bw, bh) / 2 + 5) * z };
    }
  }
  return { z, hero, killer: k, heroR: 12 * z };
}
// The freeze's camera: it pushes in on the hero and the killer together (up
// to 2.2x, less when they stand far apart), over the first 0.4 s.
const PUSH_MS = 400, PUSH_MAX = 2.2, CAP_H = 34;
// The caption's size. o.capScale: CSS px per view px (main.js). A phone held
// upright shows the view below 1:1, and the caption's 9 px label read at about
// 7 px; it grows there (up to 1.8x) so the label reads at about 10 px.
export function captionScale(o) {
  const sc = Number(o && o.capScale);
  return sc > 0 ? Math.max(1, Math.min(1.8, 1.25 / sc)) : 1;
}
function freezeCam(L, ts, capH = CAP_H) {
  let cx = L.hero.x, cy = L.hero.y, kT = 2;
  if (L.killer) {
    const dx = Math.abs(L.killer.x - L.hero.x) + 2 * L.killer.r, dy = Math.abs(L.killer.y - L.hero.y) + 2 * L.killer.r;
    kT = Math.max(1, Math.min(PUSH_MAX, (W * 0.8) / dx, ((H - BAR - capH) * 0.8) / dy));
    cx = (L.hero.x + L.killer.x) / 2; cy = (L.hero.y + L.killer.y) / 2;
  }
  const k = lerp(1, kT, smooth(span(ts, 0, PUSH_MS)));
  // The view's middle, between the film bar and the caption.
  const mid = (BAR + H - capH) / 2;
  const x0 = Math.max(0, Math.min(W - W / k, cx - W / (2 * k)));
  const y0 = Math.max(0, Math.min(H - H / k, cy - mid / k));
  return { k, x0, y0 };
}
// The marks on screen at scene time ts: where each one is after the push-in;
// a killer off the screen (a shooter far away) is boxed at the edge.
function freezeMarks(o, killer, ts) {
  const capH = Math.round(CAP_H * captionScale(o));
  const L = freezeLayout(o, killer), cam = freezeCam(L, ts, capH);
  const P = (q) => ({ x: (q.x - cam.x0) * cam.k, y: (q.y - cam.y0) * cam.k });
  const hero = { ...P(L.hero), r: L.heroR * cam.k };
  let k = null;
  if (L.killer) {
    const at = P(L.killer), r = L.killer.r * cam.k, m = Math.min(r, 40) + 4;
    k = { x: Math.max(m, Math.min(W - m, at.x)), y: Math.max(BAR + m, Math.min(H - capH - m, at.y)), r };
  }
  return { L, cam, hero, killer: k };
}
function drawFreeze(g, ts, tw, cause, o, killer) {
  const f = o.freeze || {};
  const M = freezeMarks(o, killer, ts), cam = M.cam;
  const dim = 0.62 * smooth(span(ts, 0, 260));
  if (f.snap) {
    const sx = (f.snap.width || W) / W, sy = (f.snap.height || H) / H;
    const shot = () => g.drawImage(f.snap, cam.x0 * sx, cam.y0 * sy, (W / cam.k) * sx, (H / cam.k) * sy, 0, 0, W, H);
    const smooth0 = g.imageSmoothingEnabled;
    g.imageSmoothingEnabled = false;   // the frozen pixels stay crisp as it pushes in
    shot();
    g.fillStyle = 'rgba(6,5,12,' + dim.toFixed(3) + ')';
    g.fillRect(0, 0, W, H);
    // The killer and the hero stay lit: the frozen frame again, inside them.
    if (dim > 0 && typeof g.clip === 'function') {
      g.save();
      g.beginPath();
      if (M.killer) { g.moveTo(M.killer.x + M.killer.r, M.killer.y); g.arc(M.killer.x, M.killer.y, M.killer.r, 0, Math.PI * 2); }
      g.moveTo(M.hero.x + M.hero.r, M.hero.y); g.arc(M.hero.x, M.hero.y, M.hero.r, 0, Math.PI * 2);
      g.clip();
      shot();
      g.restore();
    }
    g.imageSmoothingEnabled = smooth0 === undefined ? true : smooth0;
    // A killer standing on the hero (a contact death) is mostly hidden behind
    // the hero, who is drawn last in play. The frame is a still: its cut-out
    // goes on top, so the boxed enemy can be seen. Not the Maw: its whole body
    // is in the frame already (it is far larger than the hero), and a second,
    // small Maw on top of it read as a mistake.
    if (killer && killer.kind !== 'maw' && M.killer && Math.hypot(M.killer.x - M.hero.x, M.killer.y - M.hero.y) < M.killer.r + M.hero.r) {
      const z = Math.max(1, Math.round(M.L.z * cam.k)), kf = killer.frames[0];
      blitGrid(g, kf, killer.palette, Math.round(M.killer.x - kf[0].length * z / 2), Math.round(M.killer.y - kf.length * z / 2), ST_KILLER, z);
      f.cutout = true;
    }
  } else {
    // No frozen frame (a test, a canvas that cannot be copied): the actors on
    // a dark field where they stood.
    g.fillStyle = BACK; g.fillRect(0, 0, W, H);
    g.fillStyle = '#16131f';
    for (let i = 0; i < 40; i++) g.fillRect(Math.floor(ROAD.hash(i, 3) * W), Math.floor(ROAD.hash(i, 4) * H), 2, 2);
    const z = Math.max(1, Math.round(M.L.z * cam.k)), ps = heroPoses(o.hero || KNIGHT);
    blitGrid(g, ps.stand, ps.palette, Math.round(M.hero.x - ps.stand[0].length * z / 2), Math.round(M.hero.y - ps.stand.length * z / 2), ST_HERO, z);
    if (killer && M.killer) {
      const kf = killer.frames[0];
      blitGrid(g, kf, killer.palette, Math.round(M.killer.x - kf[0].length * z / 2), Math.round(M.killer.y - kf.length * z / 2), ST_KILLER, z);
    }
  }
  // The marks come in fast and settle: the killer's box closes on it.
  const inK = smooth(span(ts, 60, 300));
  heroRing(g, M.hero.x, M.hero.y + M.hero.r * 0.7, M.hero.r * 0.9);
  if (M.killer && inK > 0) {
    const pulse = 1 + 0.06 * Math.sin(tw / 90);
    brackets(g, M.killer.x, M.killer.y, M.killer.r * lerp(1.8, 1, inK) * pulse, DANGER, Math.max(6, Math.round(M.killer.r * 0.45)));
  }
  // Film bars, and the caption on the lower one.
  const cs = captionScale(o), CAPH = Math.round(CAP_H * cs);
  const capH = Math.round(lerp(0, CAPH, smooth(span(ts, 80, 220))));
  g.fillStyle = INK;
  g.fillRect(0, 0, W, BAR);
  if (capH > 0) g.fillRect(0, H - capH, W, capH);
  if (capH >= CAPH) drawCaption(g, cause, killer, H - CAPH, cs, !!f.killerGone);
}
function drawCaption(g, cause, killer, y0, s = 1, gone = false) {
  const c = captionOf(cause, killer, gone);
  const px = (n) => Math.round(n * s);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = 'bold ' + px(9) + 'px monospace';
  g.fillStyle = GREY;
  g.fillText('KILLED BY', 12, y0 + px(12));
  g.font = 'bold ' + px(14) + 'px monospace';
  g.fillStyle = DANGER;
  g.fillText(c.name, 12, y0 + px(28));
  if (c.how) {
    const x = 12 + textW(g, c.name, 8.4 * s) + 8;
    g.font = 'bold ' + px(10) + 'px monospace';
    g.fillStyle = GREY;
    g.fillText(c.how, x, y0 + px(28));
  }
}

// ---- the road ------------------------------------------------------------------------------
// The seconds of running the ground shows: it runs at the escape's pace and
// stops in the slump.
function runOf(ts) {
  const run = 2 + (Math.min(ts, SCENE.SLUMP[0]) - SCENE.ROAD[0]) / 1000;
  if (ts <= SCENE.SLUMP[0]) return run;
  const u = span(ts, SCENE.SLUMP[0], SCENE.SLUMP[0] + 600);
  return run + 0.3 * (1 - (1 - u) * (1 - u));
}
// The horde behind him: it gains through the road and closes round him.
function hordeAt(m, i, ts) {
  const front = lerp(3.4, 1.05, smooth(span(ts, SCENE.ROAD[0], SCENE.SLUMP[1])));
  let d = 1 + front + m.off * 0.55 + 0.08 * Math.sin(ts / 1000 * 1.7 + m.phase * 6.283);
  let x = m.x;
  const k = smooth(span(ts, SCENE.SLUMP[0] + 200, SCENE.CLOSE[1] - 200));
  if (k > 0) {
    const side = i % 2 ? 1 : -1;
    d = lerp(d, 1.1 + (i % 7) * 0.06, k);
    x = lerp(x, side * (9 + (i % 5) * 6), k);
  }
  return d < D_CREST ? { d, x } : null;
}
// The killer on the road. kind boss / maw: it looms behind and leaps; a
// shooter stands back and fires; anything else runs at the front and lunges.
const big = (k) => k && (k.kind === 'boss' || k.kind === 'maw');
const BIG_TOP = BAR + 4;   // a boss's outline never goes higher than this
function killerPose(ts, by, killer) {
  const u = span(ts, SCENE.LUNGE[0], SCENE.HIT[0]);
  const near = smooth(span(ts, SCENE.ROAD[0], SCENE.LUNGE[0]));
  if (big(killer)) {
    let d = lerp(7, 3.4, near);
    if (ts >= SCENE.LUNGE[0]) d = lerp(3.4, 1.7, u * u);
    return { d, x: 0, lift: 0, air: Math.sin(Math.PI * u) * 46, rise: smooth(span(ts, SCENE.ROAD[0], SCENE.ROAD[0] + 450)) };
  }
  if (by === 'shot') return { d: lerp(3.8, 2.3, near), x: 14, lift: 0, air: 0, rise: 1 };
  let d = lerp(2.9, 1.6, near), x = 9, lift = 0;
  // It lands in front of him and to his side, so the hit is seen to connect.
  if (ts >= SCENE.LUNGE[0]) { d = lerp(1.6, 0.9, smooth(u)); x = lerp(9, 7, u); lift = Math.sin(Math.PI * u) * 16; }
  // Then it steps off to his side and stands over him, so the fall is seen.
  const off = smooth(span(ts, SCENE.HIT[1], SCENE.SLUMP[0] + 300));
  if (off > 0) { d = lerp(0.9, 1.08, off); x = lerp(7, 15, off); }
  return { d, x, lift, air: 0, rise: 1 };
}

function drawRoad(g, ts, cause, o, killer) {
  const scene = roadScene(o);
  const A = ROAD.artOf(scene);
  const by = cause || 'unknown';
  const run = runOf(ts), tA = ts / 1000;
  const closeU = span(ts, SCENE.CLOSE[0], SCENE.CLOSE[1]);
  const sway = ROAD.swayAt(run) * (1 - 0.6 * smooth(span(ts, SCENE.SLUMP[0], SCENE.CLOSE[1])));
  // The jolt when the hit lands.
  const a = ts - SCENE.HIT[0];
  const amp = a >= 0 && a < 320 ? 5 * (1 - a / 320) : 0;
  const k = Math.floor(ts / 33);
  const sh = amp > 0 ? { x: Math.round((ROAD.hash(k, 5) * 2 - 1) * amp), y: Math.round((ROAD.hash(k, 6) * 2 - 1) * amp) } : { x: 0, y: 0 };
  g.save();
  g.translate(sh.x, sh.y);
  ROAD.drawSky(g, A, tA, sway);
  ROAD.drawGround(g, A, run, sway);
  const items = [];
  for (const sc of A.scenery) {
    const d = D_MIN + mod(RUN * run - sc.p, CYC);
    if (d < D_CREST) items.push({ kind: sc.kind, d, x: sc.x, ref: sc.ref, i: sc.i });
  }
  for (let i = 0; i < scene.horde.length; i++) {
    const p = hordeAt(scene.horde[i], i, ts);
    if (p) items.push({ kind: 'enemy', d: p.d, x: p.x, lift: scene.horde[i].fly ? 13 : 0, state: 'run', i });
  }
  const kp = killer ? killerPose(ts, by, killer) : null;
  if (kp) items.push({ kind: 'killer', d: kp.d, x: kp.x, pose: kp });
  // The pilot.
  const ps = heroPoses(o.hero || KNIGHT);
  const slump = span(ts, SCENE.SLUMP[0], SCENE.SLUMP[0] + 700);
  const hd = lerp(1, 0.94, smooth(slump));
  items.push({ kind: 'hero', d: hd, x: 2.2 * Math.sin(runOf(Math.min(ts, SCENE.SLUMP[0])) * 2.3) });
  items.sort((p, q) => q.d - p.d);
  for (const it of items) {
    if (it.kind === 'hero') drawHero(g, ts, run, it, ps, sway);
    else if (it.kind === 'killer') drawKiller(g, ts, it, killer, sway, tA);
    else ROAD.drawItem(g, scene, A, it, tA, sway);
  }
  if (by === 'shot' && kp && !big(killer)) drawShot(g, ts, kp, killer, sway);
  drawImpact(g, ts, sway);
  g.restore();
  // The hit's flash, red-orange at the edges of the frame.
  const fl = a >= 0 && a < 180 ? 1 - a / 180 : 0;
  if (fl > 0) {
    g.globalAlpha = 0.28 * fl; g.fillStyle = DANGER; g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
  }
  // The close: the picture darkens and the film bars shut.
  const dark = smooth(closeU) * 0.88;
  if (dark > 0) { g.globalAlpha = dark; g.fillStyle = INK; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  const bh = Math.round(lerp(BAR, H / 2, smooth(span(ts, SCENE.CLOSE[0] + 150, SCENE.CLOSE[1]))));
  g.fillStyle = INK;
  g.fillRect(0, 0, W, bh);
  g.fillRect(0, H - Math.max(BAR, bh), W, Math.max(BAR, bh));
  // The top bar says who did it, as the escape's says ESCAPE.
  if (bh <= BAR + 2) {
    const c = captionOf(by, o.killer);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = 'bold 9px monospace';
    g.fillStyle = GREY; g.fillText('KILLED BY', 8, BAR / 2 + 0.5);
    g.fillStyle = DANGER; g.fillText(c.name, 8 + textW(g, 'KILLED BY', 5.4) + 6, BAR / 2 + 0.5);
  }
}
function drawHero(g, ts, run, it, ps, sway) {
  const s = ROAD.sOf(it.d), x = ROAD.xOf(it.x, it.d, sway), y = ROAD.yOf(it.d);
  const slump = span(ts, SCENE.SLUMP[0], SCENE.SLUMP[0] + 700);
  let gr, lift = 0;
  if (ts < SCENE.HIT[0]) { gr = ps.run[Math.floor(run * 9) % 2]; lift = Math.abs(Math.sin(run * 9 * Math.PI)) * 0.7; }
  else if (ts < SCENE.SLUMP[0]) gr = ps.run[0];
  else gr = slump < 0.4 ? ps.kneel : ps.fallen;
  const w = gr[0].length, h = gr.length;
  ROAD.drawShadow(g, x, y, Math.min(w, 16) * 0.8, s);
  const hit = ts >= SCENE.HIT[0] && ts < SCENE.HIT[0] + 110;
  blitGrid(g, gr, ps.palette, Math.round(x - w * s / 2), Math.round(y - (h + lift) * s), hit ? ST_HIT : ST_HORDE, s);
}
function drawKiller(g, ts, it, killer, sway, tA) {
  const p = it.pose;
  const x = ROAD.xOf(it.x, it.d, sway), y = ROAD.yOf(it.d);
  const gr = killer.frames[Math.floor(tA * 8) % killer.frames.length];
  const w = gr[0].length, h = gr.length;
  if (big(killer)) {
    // It looms, but its head (and the red-orange outline round it, two art
    // pixels out) stays under the top film bar, so the killer is known when
    // the blow lands: no taller than the ground below the bar, and its leap
    // stops at the bar.
    const s = Math.min((3.6 * 24 / ((killer.box && killer.box.h) || h)) * SP / it.d, (y - BIG_TOP) / (h + 2));
    const sunk = (1 - p.rise) * h * s * 0.94;
    const rising = p.rise < 1;
    if (rising) { g.save(); g.beginPath(); g.rect(-8, -8, W + 16, y + 8); g.clip(); }
    else ROAD.drawShadow(g, x, y, w * 0.9, s);
    const top = Math.max(BIG_TOP + 2 * s, y - h * s + sunk - p.air);
    blitGrid(g, gr, killer.palette, Math.round(x - w * s / 2), Math.round(top), ST_KILLER, s);
    if (rising) g.restore();
    return;
  }
  const s = ROAD.sOf(it.d);
  ROAD.drawShadow(g, x, y, w, s);
  blitGrid(g, gr, killer.palette, Math.round(x - w * s / 2), Math.round(y - (h + p.lift) * s), ST_KILLER, s);
}
// A shooter's shot: a red-orange orb from the killer to the pilot's chest,
// growing as it comes at the camera.
function drawShot(g, ts, kp, killer, sway) {
  const u = span(ts, SCENE.LUNGE[0], SCENE.HIT[0]);
  if (ts < SCENE.LUNGE[0] || ts >= SCENE.HIT[0]) return;
  const kh = killer.frames[0].length;
  const x0 = ROAD.xOf(kp.x, kp.d, sway), y0 = ROAD.yOf(kp.d) - kh * ROAD.sOf(kp.d) * 0.55;
  const x1 = ROAD.xOf(0, 1, sway), y1 = ROAD.yOf(1) - 9 * SP;
  for (let j = 4; j >= 0; j--) {
    const v = clamp01(u - j * 0.05);
    const r = Math.round(lerp(4, 11, v) * (1 - j * 0.16));
    const x = Math.round(lerp(x0, x1, v)), y = Math.round(lerp(y0, y1, v) - Math.sin(Math.PI * v) * 10);
    g.fillStyle = j ? DANGER_DARK : DANGER;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    if (!j) { g.fillStyle = DANGER_HOT; g.fillRect(x - Math.ceil(r / 2), y - Math.ceil(r / 2), Math.ceil(r / 1.4), Math.ceil(r / 1.4)); }
  }
}
// Where the hit lands: a red-orange burst on the pilot's chest.
function drawImpact(g, ts, sway) {
  const a = ts - SCENE.HIT[0];
  if (a < 0 || a >= 260) return;
  const u = a / 260;
  const cx = ROAD.xOf(0, 1, sway), cy = ROAD.yOf(1) - 9 * SP;
  for (let i = 0; i < 10; i++) {
    const ang = ROAD.hash(i, 51) * Math.PI * 2, r = 6 + u * 46;
    const sz = Math.max(2, Math.round(6 * (1 - u)));
    g.fillStyle = i % 3 ? DANGER : DANGER_HOT;
    g.fillRect(Math.round(cx + Math.cos(ang) * r - sz / 2), Math.round(cy + Math.sin(ang) * r * 0.8 - sz / 2), sz, sz);
  }
}

// ---- render ---------------------------------------------------------------------------------
export function render(g, tRaw, cause, opts = {}) {
  const o = opts || {};
  const dur = durationOf(o);
  const tw = Math.max(0, Math.min(Number(tRaw) || 0, dur));
  const by = cause || 'unknown';
  if (tRaw >= dur) { g.fillStyle = '#000000'; g.fillRect(0, 0, W, H); return; }
  const killer = o.killer && o.killer.frames && o.killer.frames.length ? o.killer : null;
  if (o.reduced) {
    // The still card: the freeze, settled, then a short fade.
    drawFreeze(g, SCENE.FREEZE[1], 0, by, o, killer);
    const f = span(tw, STILL_DURATION - 300, STILL_DURATION);
    if (f > 0) { g.globalAlpha = f; g.fillStyle = '#000000'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    return;
  }
  const ts = sceneOf(tw, o);
  if (ts < SCENE.ROAD[0]) { drawFreeze(g, ts, tw, by, o, killer); return; }
  drawRoad(g, ts, by, o, roadKiller(o, roadScene(o)));
}

// Get the movie ready when it starts: build the road scene and bake the first
// road frame's sprites, drawn into nothing, so the cut to the road does not
// cost a frame. Reduced motion never shows the road.
const NOWHERE = new Proxy({}, {
  get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
  set: (o, k, v) => { o[k] = v; return true; },
});
export function prepare(opts) {
  const o = opts || {};
  if (o.reduced) return;
  try { drawRoad(NOWHERE, SCENE.ROAD[0], 'contact', o, roadKiller(o, roadScene(o))); } catch { /* drawn again on the road */ }
}

// ---- test seam (read only) --------------------------------------------------------------------
export const DEATH_CINE_TEST = {
  SCENE, HOLD_MS, COLORS: { DANGER, HERO_WARM, INK }, freezeLayout, freezeMarks, PUSH_MS, runOf, killerPose, hordeAt,
  CAUSES: ['contact', 'shot', 'drain', 'unknown'],
  sceneBuilt: (o) => SCENES.has((o && o.road) || o),
  BIG_TOP, BAR, H,
};
