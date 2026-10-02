// HORDES — title intro cinematic (WAVE-7/D, Sk408: "a large title and a horde
// overtaking a hero, zoomed in to show more detail than normal gameplay").
//
// Timeline-driven and PURE: render(ctx, t) is a deterministic function of t
// (ms since intro start) — no stored state, no randomness, no DOM. Every draw
// is a fillRect (house rule). hb1 calls this from the title flow before the
// menu and owns the rAF clock + skip wiring; audio keys stingers off PHASES /
// phaseAt(t). Grids are reused from sprites.js; the hero grids are adapted
// copies of render.js's PLAYER_SPRITE pair so this module stays self-contained.
//
// Public API (FROZEN for hb1):
//   INTRO_DURATION, PHASES, render(ctx, t), isDone(t), phaseAt(t)
//   TITLE_IMPACT (additive, wave-25): the ms instant the title LANDS — the
//   frame phaseAt() switches to 'TITLE', so audio and video agree.
// INTRO_TEST is a read-only test seam (NOT part of the frozen API).

import { SPRITE_ARCHETYPES } from './sprites.js';

// ---------- timeline ----------
export const INTRO_DURATION = 7000;   // ms

// name -> [start, end) in ms. TITLE intentionally overlaps OVERTAKE (the
// stamp lands while the horde is still swallowing the hero). The TITLE window
// starts when the title BEGINS its drop-in; the impact itself is
// TITLE_IMPACT = TITLE[0] + TITLE_DROP_MS (see phaseAt below).
export const PHASES = {
  CHASE:    [0,    2500],   // zoomed hero sprints right, horde pours in behind
  OVERTAKE: [2500, 5000],   // horde swells, catches and engulfs the hero
  TITLE:    [4000, 6000],   // HORDES drops in: 2-frame shake + splatter
  FADE:     [6000, 7000],   // fade to black
};

export function isDone(t) { return t >= INTRO_DURATION; }

// The title's stamp: the drop-in takes TITLE_DROP_MS from PHASES.TITLE[0] and
// the title LANDS at TITLE_IMPACT — the instant phaseAt() reports 'TITLE', so
// the audio stinger (hb1 polls phaseAt) and the visual impact cannot drift.
const TITLE_DROP_MS = 300;
export const TITLE_IMPACT = PHASES.TITLE[0] + TITLE_DROP_MS;

// Phase name whose window contains t (later phases win on overlap; the
// FADE/TAIL ordering makes the "what stinger should play now" answer easy).
export function phaseAt(t) {
  if (t < 0) return 'CHASE';
  if (t >= INTRO_DURATION) return 'DONE';
  if (t >= PHASES.FADE[0]) return 'FADE';
  // TITLE is reported from the STAMP, not from the start of the drop-in: hb1
  // fires the TITLE_SLAM stinger on this transition, and audio.js documents
  // the stamp at ~4300ms (= TITLE_IMPACT), so the boom must land WITH the
  // impact rather than 300ms before it.
  if (t >= TITLE_IMPACT) return 'TITLE';
  if (t >= PHASES.OVERTAKE[0]) return 'OVERTAKE';
  return 'CHASE';
}

// ---------- layout / palette ----------
const W = 480, H = 300;              // matches CONFIG.VIEW_W/H
const GROUND_Y = 210;                // ground surface line
const PX = 8;                        // ZOOM: 1 sprite pixel -> 8x8 screen px
                                      // (gameplay draws 1:1 — this is the
                                      // "more detail than normal" close-up)
const BG = '#0e0e16', GROUND = '#15151f', GROUND_EDGE = '#1e1e2c';

// Hero grids: adapted copies of render.js PLAYER_SPRITE / PLAYER_SPRITE_WALK
// (12x12, 0 = transparent, digits index into HERO_PALETTE).
const HERO_A = [
  [0,0,0,3,3,3,3,3,3,0,0,0],
  [0,0,3,3,2,2,2,2,3,3,0,0],
  [0,0,3,2,2,1,1,2,2,3,0,0],
  [0,0,3,2,1,1,1,1,2,3,0,0],
  [0,0,0,3,2,1,1,2,3,0,0,0],
  [0,0,0,3,3,2,2,3,3,0,0,0],
  [0,0,0,3,3,4,4,3,3,0,0,0],
  [0,0,3,3,4,4,4,4,3,3,0,0],
  [0,3,3,4,4,4,4,4,4,3,3,0],
  [0,3,4,4,4,4,4,4,4,4,3,0],
  [0,0,3,4,4,0,0,4,4,3,0,0],
  [0,0,0,3,3,0,0,3,3,0,0,0],
];
const HERO_B = [                     // walk frame: feet splay 1px
  [0,0,0,3,3,3,3,3,3,0,0,0],
  [0,0,3,3,2,2,2,2,3,3,0,0],
  [0,0,3,2,2,1,1,2,2,3,0,0],
  [0,0,3,2,1,1,1,1,2,3,0,0],
  [0,0,0,3,2,1,1,2,3,0,0,0],
  [0,0,0,3,3,2,2,3,3,0,0,0],
  [0,0,0,3,3,4,4,3,3,0,0,0],
  [0,0,3,3,4,4,4,4,3,3,0,0],
  [0,3,3,4,4,4,4,4,4,3,3,0],
  [0,3,4,4,4,4,4,4,4,4,3,0],
  [0,0,3,4,4,0,0,0,4,4,3,0],
  [0,0,3,3,0,0,0,3,3,0,0,0],
];
const HERO_PALETTE = { 1: '#ffe9a8', 2: '#e8b04a', 3: '#7a4a1e', 4: '#3a6fd8' };

// Horde silhouettes: sprites.js grids, monochrome-remapped so the mass reads
// as one dark wave; only "eye" indices keep a hot color (red glints).
const SIL = '#3a3548', SIL_DARK = '#2c2838', EYE = '#ff3b4e';
const SIL_PALETTES = {
  SKELETON: { 1: SIL, 2: EYE, 3: SIL_DARK },
  DEMON:    { 1: SIL, 2: SIL_DARK, 3: SIL_DARK, 4: EYE },
  BAT:      { 1: SIL, 2: SIL_DARK, 3: EYE, 4: SIL_DARK },
};
const HORDE_KINDS = ['SKELETON', 'BAT', 'DEMON', 'SKELETON', 'BAT', 'SKELETON', 'DEMON'];

// Title: 5x7 pixel font, gold with a dark-red drop shadow (index.html logo
// colors). Letter pixel = 10px -> word block 360x70, centered.
const FONT = {
  H: [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  O: [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  R: [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1]],
  D: [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0]],
  E: [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  S: [[0,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[0,1,1,1,0],[0,0,0,0,1],[0,0,0,0,1],[1,1,1,1,0]],
};
const TITLE_TEXT = 'HORDES';
const TITLE_LP = 10;                 // px per font pixel
const TITLE_X0 = Math.floor((W - (TITLE_TEXT.length * 5 * TITLE_LP + (TITLE_TEXT.length - 1) * TITLE_LP)) / 2);
const TITLE_Y = 52;
const TITLE_GOLD = '#ffd75e', TITLE_SHADOW = '#7a1f33';
const SPLAT_COLORS = ['#c23b3b', '#ff5566', '#7a1f1f'];
const FADE_BLACK = (a) => 'rgba(0,0,0,' + a.toFixed(3) + ')';

// ---------- deterministic hash (render.js cellRand pattern, fixed seed) -----
const INTRO_SEED = 0x51ab7d33;
function h(i, salt) {
  let v = (INTRO_SEED ^ salt) >>> 0;
  v = Math.imul(v ^ i, 0x27d4eb2d);
  v ^= v >>> 15; v = Math.imul(v, 0x85ebca6b); v ^= v >>> 13;
  return (v >>> 0) / 4294967296;
}
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.max(0, Math.min(1, u));

// ---------- primitives ----------
// drawGrid pattern from render.js, with a px scale so intro sprites render
// PX times larger than gameplay (the zoom).
function drawGridScaled(g, grid, palette, x, y, px) {
  for (let ry = 0; ry < grid.length; ry++) {
    const row = grid[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const v = row[rx];
      if (v) { g.fillStyle = palette[v]; g.fillRect(x + rx * px, y + ry * px, px, px); }
    }
  }
}

// ---------- scene math (pure functions of t, ms) ----------
// Hero screen x: sprints in from the left, holds, then loses ground (slides
// back) through the overtake until swallowed.
function heroX(t) {
  if (t < 900) return lerp(-110, 280, t / 900);
  if (t < PHASES.OVERTAKE[0]) return 280;
  return lerp(280, 190, clamp01((t - PHASES.OVERTAKE[0]) / 2500));
}

// Horde front (screen x of the leading silhouette). Gap starts huge (mass
// pours in from off-screen left), closes to zero by ~3.6s, goes negative as
// the mass swallows the hero, then keeps surging under the title.
function hordeFront(t) {
  const gap = lerp(430, -150, clamp01(t / 5000));
  let fx = heroX(t) - gap;
  if (t > 5000) fx += (t - 5000) * 0.02;
  return fx;
}

// Roster of silhouettes revealed as the front advances + count grows.
const HORDE_N = 26;
function hordeActive(t) {
  return Math.min(HORDE_N, 3 + Math.floor(clamp01(t / 5000) * 23));
}

// Swallow moment: after this the hero is gone and a red burst marks the spot.
const SWALLOW_T = 3800;
function heroVisible(t) {
  if (t >= SWALLOW_T) return false;
  if (t >= PHASES.OVERTAKE[0]) return Math.floor(t / 130) % 2 === 1;  // panic blink
  return true;
}

// Title stamp: drops in over TITLE_DROP_MS, impact at TITLE_IMPACT (both
// defined with the timeline above), 2-frame shake.
function titlePose(t) {
  const tt = t - PHASES.TITLE[0];
  if (tt < 0) return null;
  const y = tt < TITLE_DROP_MS
    ? lerp(-90, TITLE_Y, (tt / TITLE_DROP_MS) * (tt / TITLE_DROP_MS)) : TITLE_Y; // ease-in
  let dx = 0;
  if (tt >= TITLE_DROP_MS && tt < TITLE_DROP_MS + 120) {
    dx = Math.floor((tt - TITLE_DROP_MS) / 60) % 2 === 0 ? 5 : -5;
  }
  return { y, dx, splat: tt >= TITLE_DROP_MS };
}

// ---------- render ----------
export function render(g, t) {
  // Sky.
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  // Faint hashed stars (fixed field, top half only).
  g.fillStyle = '#1c1c2c';
  for (let i = 0; i < 24; i++) {
    g.fillRect(Math.floor(h(i, 11) * W), Math.floor(h(i, 12) * 130), 2, 2);
  }

  // Ground strip + scrolling decor (camera locked on the sprinting hero).
  g.fillStyle = GROUND;
  g.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  g.fillStyle = GROUND_EDGE;
  g.fillRect(0, GROUND_Y, W, 2);
  for (let k = 0; k < 14; k++) {
    const gx = Math.floor((((k * 41 - t * 0.18) % 540) + 540) % 540) - 30;
    const gy = GROUND_Y + 12 + Math.floor(h(k, 21) * 70);
    g.fillStyle = h(k, 22) < 0.5 ? '#1a1a28' : '#101018';
    if (h(k, 23) < 0.6) { g.fillRect(gx, gy, 8, 2); g.fillRect(gx + 11, gy + 3, 6, 2); }
    else { g.fillRect(gx, gy, 4, 3); g.fillRect(gx + 1, gy - 1, 2, 1); }
  }

  // Hero (zoomed PX: 12x12 grid -> 96x96 on a 480x300 screen). Sprint dust
  // puffs behind the feet while running; blink during the overtake; gone
  // (swallowed) after SWALLOW_T.
  const hx = Math.floor(heroX(t));
  const heroTop = GROUND_Y - HERO_A.length * PX;
  if (t < SWALLOW_T) {
    // dust: three deterministic puffs cycling left of the feet
    g.fillStyle = '#26233a';
    const d = Math.floor(t / 80) % 3;
    g.fillRect(hx - 12 - d * 9, GROUND_Y - 6, 5, 3);
    g.fillRect(hx - 26 - d * 6, GROUND_Y - 2, 4, 2);
    g.fillRect(hx - 40, GROUND_Y - 8 + d * 3, 3, 2);
  }
  if (heroVisible(t)) {
    const frame = Math.floor(t / 160) % 2 === 0 ? HERO_A : HERO_B;
    drawGridScaled(g, frame, HERO_PALETTE, hx, heroTop, PX);
  } else if (t >= SWALLOW_T) {
    // Swallowed: growing red burst where the hero was.
    const n = Math.min(20, Math.floor((t - SWALLOW_T) / 60));
    for (let i = 0; i < n; i++) {
      const ang = h(i, 31) * Math.PI * 2;
      const r = 10 + h(i, 32) * 26 * clamp01((t - SWALLOW_T) / 1200);
      g.fillStyle = SPLAT_COLORS[i % 3];
      const s = 3 + Math.floor(h(i, 33) * 4);
      g.fillRect(Math.round(hx + 48 + Math.cos(ang) * r), Math.round(heroTop + 48 + Math.sin(ang) * r), s, s);
    }
  }

  // Horde silhouette mass (drawn OVER the hero so the front literally
  // swallows him as it passes). Ground rows stagger behind the front; bats
  // fly above with a sine bob. Count and front both advance with t.
  const fx = hordeFront(t);
  const active = hordeActive(t);
  for (let i = 0; i < active; i++) {
    const kind = HORDE_KINDS[i % HORDE_KINDS.length];
    const spr = SPRITE_ARCHETYPES[kind];
    const gw = spr.box.w * PX, gh = spr.box.h * PX;
    const back = i * (105 + Math.floor(h(i, 41) * 60));
    const jig = Math.round(Math.sin(t / 160 + i * 1.7) * 2);
    const x = Math.floor(fx - back + jig);
    if (x > W || x + gw < 0) continue;
    const frame = spr.frames[Math.floor(t / (kind === 'BAT' ? 110 : 150) + i) % spr.frames.length];
    if (kind === 'BAT') {
      const y = Math.floor(GROUND_Y - 70 - h(i, 42) * 50 + Math.sin(t / 300 + h(i, 43) * 6.28) * 6);
      drawGridScaled(g, frame, SIL_PALETTES.BAT, x, y, PX);
    } else {
      const feet = GROUND_Y + Math.floor(h(i, 44) * 12);
      drawGridScaled(g, frame, SIL_PALETTES[kind], x, feet - gh, PX);
    }
  }

  // Title stamp + shake + splatter (TITLE phase).
  const pose = titlePose(t);
  if (pose) {
    if (pose.splat) {
      // Red pixel splatter fanned around the title block (fixed hashed spots).
      for (let i = 0; i < 12; i++) {
        g.fillStyle = SPLAT_COLORS[i % 3];
        const s = 3 + Math.floor(h(i, 51) * 4);
        g.fillRect(Math.floor(TITLE_X0 - 12 + h(i, 52) * 384) + pose.dx,
                   Math.floor(TITLE_Y - 12 + h(i, 53) * 100), s, s);
      }
    }
    for (let pass = 0; pass < 2; pass++) {   // shadow layer, then gold
      g.fillStyle = pass === 0 ? TITLE_SHADOW : TITLE_GOLD;
      const ox = pass === 0 ? 6 : 0, oy = pass === 0 ? 6 : 0;
      for (let li = 0; li < TITLE_TEXT.length; li++) {
        const glyph = FONT[TITLE_TEXT[li]];
        const lx = TITLE_X0 + pose.dx + ox + li * 6 * TITLE_LP;
        for (let ry = 0; ry < glyph.length; ry++) {
          for (let rx = 0; rx < 5; rx++) {
            if (glyph[ry][rx]) g.fillRect(lx + rx * TITLE_LP, pose.y + oy + ry * TITLE_LP, TITLE_LP, TITLE_LP);
          }
        }
      }
    }
  }

  // Fade to black (FADE phase), hard black once done.
  if (t >= INTRO_DURATION) {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, W, H);
  } else if (t >= PHASES.FADE[0]) {
    g.fillStyle = FADE_BLACK(clamp01((t - PHASES.FADE[0]) / (INTRO_DURATION - PHASES.FADE[0])));
    g.fillRect(0, 0, W, H);
  }
}

// ---------- test seam (read-only; mirrors AUDIO_TEST pattern) ----------
export const INTRO_TEST = {
  SEED: INTRO_SEED,
  COLORS: { BG, GROUND, SIL, SIL_DARK, EYE, HERO_BODY: HERO_PALETTE[4], TITLE_GOLD, TITLE_SHADOW, SPLAT: SPLAT_COLORS[0] },
  ZOOM: PX,
};
