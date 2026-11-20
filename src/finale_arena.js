// R7 THE FINALE ARENA (drawing only).
//
// When the Maw's fight begins, the stage's floor fades to the void (near black
// with deep violet, as the Void Reach is keyed) and the light layer goes to
// the deepest night, whatever stage the run is on. Buildings and props stay
// but fall into the dark. Cracks in the floor run out from the Maw, so on any
// part of the screen they point at it, and light pulses along them toward it,
// brighter and faster while it winds up an attack.
//
// Rules this module keeps:
//   * It reads state and writes none, and draws no random number: a seed
//     plays the same with the arena shown or not. Phases come from sim time
//     (and, while the Maw's arrival sting holds the sim, from the sting's own
//     clock), so 60 Hz and 120 Hz draw the same picture.
//   * Reduced motion: no pulse (a steady glow that rises with the wind-up).
//   * Cost: two fills over the view for the floor (no ground chunk is painted
//     again), a few strokes for the cracks, and a few glows in the light
//     layer's one glow canvas.
//   * The cracks are VOID violet floor paint, thin, never the red-orange of a
//     threat: the Maw's own telegraph stays the clearest danger on screen.
import { CONFIG as C } from './config.js';
import { FINAL_BOSS_PHASES } from './final_boss.js';

export const ARENA = {
  FADE_S: 1.5,          // the floor fades over this many sim seconds
  STING_FROM: 0.9,      // in the Maw's arrival sting the fade starts with the Maw's rise
  TINT: '#1a1532',      // the Void Reach's floor
  TINT_A: 0.55,         // laid over the dimmed floor, so every stage turns the same violet
  DARK_OFF: 0.5,        // past this share of the fade the actors draw as on a dark floor
};
// The multiply that dims each stage's floor (a grey, as a share of white) so
// that, with the tint, its lightest tone is no lighter than the Void Reach's
// (worked out from tools/stage_keys_measure.mjs floorTones and pinned by
// test/test_finale_arena.mjs). The stage's own texture stays, faintly.
export const ARENA_DIM = {
  VERDANT_HOLLOW: 0.197, ASHEN_WASTE: 0.164, SNOWFIELD: 0.125, BLOOD_RUST: 0.501,
  BONE_DESERT: 0.154, VOID_REACH: 0.999, CINDER_MAW: 0.948, WHITEOUT: 0.107,
};

// ---- when the arena shows ------------------------------------------------------
// The fight and the screens laid over it (a pause, a draft, the death movie and
// the end of a run that died in it). A win, the Maw withdrawing and a new run
// all clear state.finalBoss, and the arena goes with it.
export const ARENA_MODES = new Set(['finale', 'death-cine', 'dead', 'stats', 'settings', 'draft', 'evolve', 'burst', 'chest']);
export function arenaOn(state) {
  return !!(state && state.finalBoss) && ARENA_MODES.has(state.mode);
}
// The sim time the fight began (main.js startFinale sets the Maw's deadline).
export function arenaStart(state) {
  return (Number(state.mawDeadline) || 0) - C.RUN.MAW_WINDOW;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// How far the arena has faded in (0..1), from sim time; `stingT` is the Maw's
// arrival sting's clock while it holds the sim (null otherwise).
export function arenaFade(state, stingT = null) {
  if (!arenaOn(state)) return 0;
  const sim = clamp01(((state.time || 0) - arenaStart(state)) / ARENA.FADE_S);
  const st = stingT == null ? 0 : clamp01((stingT - ARENA.STING_FROM) / ARENA.FADE_S);
  return Math.max(sim, st);
}
// The fade drawn: it never steps back within one fight (the sting's clock
// stops when it ends and the sim clock starts again from the same moment).
export class ArenaMemo {
  constructor() { this.key = null; this.k = 0; }
  at(state, stingT = null) {
    if (!arenaOn(state)) { this.key = null; this.k = 0; return 0; }
    const key = arenaStart(state);
    if (key !== this.key) { this.key = key; this.k = 0; }
    this.k = Math.max(this.k, arenaFade(state, stingT));
    return this.k;
  }
}
// The eased share shown.
export const ease = (k) => k * k * (3 - 2 * k);

// ---- the floor -------------------------------------------------------------------
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// The floor colour the arena makes of a floor tone (what the two fills do).
export function arenaTone(stage, tone, k = 1) {
  const f = 1 - (1 - (ARENA_DIM[stage] ?? 1)) * k, a = ARENA.TINT_A * k;
  const t = hexRgb(tone), v = hexRgb(ARENA.TINT);
  return '#' + t.map((c, i) => Math.round(c * f * (1 - a) + v[i] * a)).map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}
// Lay the void over the floor drawn so far (the floor, the buildings, the
// props). `view` is the renderer's world view; a margin covers screen shake.
export function drawArenaFloor(g, view, stage, k) {
  if (!(k > 0) || !g || typeof g.fillRect !== 'function') return false;
  const f = 1 - (1 - (ARENA_DIM[stage] ?? 1)) * k;
  const x = view.x0 - 10, y = view.y0 - 10, w = view.x1 - view.x0 + 20, h = view.y1 - view.y0 + 20;
  g.save();
  if (f < 0.999) {
    const c = Math.round(255 * f);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')';
    g.fillRect(x, y, w, h);
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = ARENA.TINT_A * k;
  g.fillStyle = ARENA.TINT;
  g.fillRect(x, y, w, h);
  g.restore();
  return true;
}

// ---- the cracks ------------------------------------------------------------------
// A fracture tree round the Maw: ROOTS cracks leave its body and fork at each
// FORKS distance, so far from it the floor is crossed by many cracks, all
// running toward it. Laid out once, in the Maw's own frame (it drags them with
// it as it moves), by a fixed hash: no random draw.
export const CRACK = {
  ROOTS: 8, R0: 52, FORKS: [110, 220, 360], LEN: 620, STEP: 16, JAG: 0.8, SPREAD: [0.3, 0.18, 0.1],
  WAVE: 120,            // px between two pulses along a crack
  HZ: 0.7, HZ_TELE: 2.2, // pulses a second, at rest and at the end of a wind-up
};
// The VOID ramp of src/palette.js, dark to light (its lightest step only in a
// wind-up). Never a reserved family.
export const CRACK_COLS = ['#3a2654', '#6c4c94', '#8c6cb4', '#9a7cc8', '#b49ad4'];
export const CRACK_EDGE = '#0b0912';
export const CRACK_GLOW = '#8c6cb4';
function hash(i) {
  let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
let CRACKS = null;
// Every segment: { x0, y0, x1, y1, d } relative to the Maw; d is its distance
// from the Maw along the crack (its far end).
export function crackSegments() {
  if (CRACKS) return CRACKS;
  const segs = [];
  let id = 1;
  const grow = (x, y, ang, d, lvl) => {
    const my = id++;
    const end = lvl < CRACK.FORKS.length ? CRACK.FORKS[lvl] : CRACK.LEN;
    let px = x, py = y, n = 0;
    while (d < end) {
      const step = Math.min(CRACK.STEP, end - d);
      d += step; n++;
      const wob = ang + (hash(my * 97 + n) - 0.5) * CRACK.JAG;
      const nx = px + Math.cos(wob) * step, ny = py + Math.sin(wob) * step;
      segs.push({ x0: px, y0: py, x1: nx, y1: ny, d });
      px = nx; py = ny;
    }
    if (lvl < CRACK.FORKS.length) {
      const s = CRACK.SPREAD[lvl] * (0.7 + hash(my * 31) * 0.6);
      grow(px, py, ang - s, d, lvl + 1);
      grow(px, py, ang + s, d, lvl + 1);
    }
  };
  for (let r = 0; r < CRACK.ROOTS; r++) {
    const ang = (r / CRACK.ROOTS) * Math.PI * 2 + (hash(r + 7) - 0.5) * 0.45;
    grow(Math.cos(ang) * CRACK.R0, Math.sin(ang) * CRACK.R0, ang, CRACK.R0, 0);
  }
  CRACKS = segs;
  return segs;
}
// How far into a wind-up the Maw is (0 none, 1 the barrage's moment), from its
// own age: the same rule final_boss.js keeps.
export function windupOf(b) {
  if (!b || !b.telegraph) return 0;
  const P = FINAL_BOSS_PHASES;
  const age = Math.max(0, (b.age || 0) - P.GRACE);
  const ph = age % P.CYCLE;
  return clamp01((ph - (P.CYCLE - P.TELEGRAPH)) / P.TELEGRAPH);
}
// The brightness (0..1) of a crack at distance d from the Maw: brighter near
// it; a pulse runs in toward it; a wind-up lifts it and quickens the pulse.
// Reduced motion: no pulse.
export function crackLevel(d, time, wind, reduced, k = 1) {
  const reach = CRACK.LEN * ease(k);
  if (d > reach) return 0;
  const tip = clamp01((reach - d) / 60);
  const near = 1 - clamp01((d - CRACK.R0) / (CRACK.LEN - CRACK.R0));
  let v = 0.1 + 0.32 * near * near + 0.4 * wind * near;
  if (!reduced) {
    // A phase that holds at a distance that shrinks with time: the pulse
    // travels inward. Its speed rises with the wind-up (the phase integrates
    // the rate over the wind-up, so it never jumps backward).
    const ph = d / CRACK.WAVE + time * CRACK.HZ + windPhase(wind);
    const s = Math.sin(ph * Math.PI * 2);
    v += (0.18 + 0.3 * wind) * (0.4 + 0.6 * near) * (s > 0 ? s * s * s * s : 0);
  }
  return clamp01(v) * tip;
}
// The extra phase a wind-up has run up so far (the integral of the faster
// rate over its 0.8 s): continuous, 0 at rest.
function windPhase(w) {
  return (CRACK.HZ_TELE - CRACK.HZ) * FINAL_BOSS_PHASES.TELEGRAPH * w * w / 2;
}
const LEVELS = CRACK_COLS.length;
// Draw the cracks round the Maw (world layer, its screen coordinates). Returns
// what it drew (the test seam).
export function drawCracks(g, state, cam, view, k, reduced) {
  const out = { segs: 0, wind: 0 };
  const b = state.finalBoss;
  if (!(k > 0) || !b || !g || typeof g.stroke !== 'function') return out;
  const bx = b.x - cam.x, by = b.y - cam.y;
  const wind = windupOf(b);
  out.wind = wind;
  const t = state.time || 0;
  const vis = [];
  const m = 4;
  for (const s of crackSegments()) {
    const x0 = bx + s.x0, y0 = by + s.y0, x1 = bx + s.x1, y1 = by + s.y1;
    if (Math.max(x0, x1) < view.x0 - m || Math.min(x0, x1) > view.x1 + m ||
        Math.max(y0, y1) < view.y0 - m || Math.min(y0, y1) > view.y1 + m) continue;
    const v = crackLevel(s.d, t, wind, reduced, k);
    if (v <= 0.02) continue;
    // The palest step only in a wind-up.
    vis.push([x0, y0, x1, y1, Math.min(LEVELS - (wind > 0.5 ? 1 : 2), Math.floor(v * (LEVELS + 1)))]);
  }
  if (!vis.length) return out;
  // Cost: the segments of one crack follow each other in the list, so each
  // path is drawn as joined runs (one moveTo per run, not per segment), with
  // flat caps: round caps on every segment were most of the cost on a phone.
  const run = (lv) => {
    let lx = NaN, ly = NaN, any = false;
    g.beginPath();
    for (const s of vis) {
      if (lv >= 0 && s[4] !== lv) continue;
      if (s[0] !== lx || s[1] !== ly) g.moveTo(s[0], s[1]);
      g.lineTo(s[2], s[3]);
      lx = s[2]; ly = s[3]; any = true;
    }
    return any;
  };
  g.save();
  g.lineCap = 'butt';
  g.lineJoin = 'bevel';
  // The crack itself: a dark split in the floor.
  g.globalAlpha = 0.7 * ease(k);
  g.strokeStyle = CRACK_EDGE;
  g.lineWidth = 3;
  run(-1);
  g.stroke();
  // Its light: a thin core, one path per step of brightness.
  g.lineWidth = 1.5;
  for (let i = 0; i < LEVELS; i++) {
    if (!run(i)) continue;
    g.globalAlpha = Math.min(1, 0.4 + 0.5 * (i / LEVELS)) * ease(k);
    g.strokeStyle = CRACK_COLS[i];
    g.stroke();
  }
  g.restore();
  out.segs = vis.length;
  return out;
}
// The cracks' light for the light layer's glow canvas: soft violet pools along
// the brighter stretches (at most CAP), [{ x, y, r, col, a, op, pool }].
export const CRACK_LIGHT_CAP = 24;
export function crackLights(state, cam, view, k, reduced) {
  const out = [];
  const b = state.finalBoss;
  if (!(k > 0) || !b) return out;
  const bx = b.x - cam.x, by = b.y - cam.y;
  const wind = windupOf(b), t = state.time || 0;
  const segs = crackSegments();
  for (let i = 0; i < segs.length && out.length < CRACK_LIGHT_CAP; i += 3) {
    const s = segs[i];
    const x = bx + s.x1, y = by + s.y1;
    if (x < view.x0 - 20 || x > view.x1 + 20 || y < view.y0 - 20 || y > view.y1 + 20) continue;
    const v = crackLevel(s.d, t, wind, reduced, k);
    if (v < 0.3) continue;
    out.push({ x, y, r: 20 + 10 * wind, col: CRACK_GLOW, a: 0.4 * v, op: 'lighter', pool: true });
  }
  return out;
}
