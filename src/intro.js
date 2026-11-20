// HORDES - the launch movie: what plays before the title menu.
//
// R2 (review row 5): "Intro rebuilt as one 5-second road shot that flows into
// the title painting; returning players get a 1.5-second title stamp".
//
// Three cuts of the same movie, picked by opts:
//   the ROAD (a new player): the equipped pilot runs down the road toward the
//     camera with the horde coming over the crest behind (the escape chase's
//     renderer, src/escape_cine_art.js drawRoad). The title painting
//     (src/art/title.js) then dissolves in over the road from the top down,
//     the logo drops onto it and lands, and the movie ends ON the painting.
//     5 s. The title's menu then fades in over the same picture: no cut.
//   the STAMP (opts.returning: a profile with a finished run): the painting
//     comes up out of black, the logo drops and lands. 1 s; with the menu's
//     0.5 s fade the player has the menu 1.5 s after launch.
//   the STILL (opts.reduced: the player asked for less motion): the finished
//     painting, logo and all, held for 1 s. Nothing moves.
//
// render(g, t, opts) is a pure function of t (ms since the movie started) and
// opts: no clock, no Math.random, no DOM. main.js owns the clock, the skip
// and the stingers (it polls phaseAt and calls audio.playIntroCue on each
// change: OVERTAKE starts the rising drone, TITLE is the slam at the logo's
// landing, FADE the sweep under the dissolve).
//
// Public API:
//   INTRO_DURATION, STAMP_DURATION, STILL_DURATION, durationOf(opts)
//   PHASES (the road), STAMP_PHASES, TITLE_IMPACT, STAMP_IMPACT
//   render(g, t, opts), isDone(t, opts), phaseAt(t, opts)
//   opts: { hero, returning, reduced, repeat }. hero is pilotLook(id) from
//   src/movie_cast.js, the equipped pilot (the Knight when none is given).
//   The movie has no held beats, so a repeat viewing plays the same timeline.
// INTRO_TEST is a read-only test seam.

import { pilotLook } from './movie_cast.js';
import { buildScene } from './escape_cine.js';
import { drawRoad } from './escape_cine_art.js';
import { TITLE_LAYERS, TITLE_WIDTH, TITLE_HEIGHT } from './art/title.js';
import { scaleGrid } from './art/format.js';
import { blitPainted } from './sprite_cache.js';

// ---------- timelines (ms) ----------
export const INTRO_DURATION = 5000;   // the road
export const STAMP_DURATION = 1000;   // the returning player's stamp
export const STILL_DURATION = 1000;   // reduced motion

// The road. [start, end) in ms.
export const PHASES = {
  CHASE:    [0,    1500],   // the hero runs at the camera; the first of the horde crest the rise
  OVERTAKE: [1500, 3400],   // the horde swells and gains on him
  FADE:     [3400, 4400],   // the painting dissolves in over the road, top down
  TITLE:    [4400, 5000],   // the logo drops (300 ms) and lands on the painting
};
const DROP_MS = 300;                                // the logo's fall
export const TITLE_IMPACT = PHASES.TITLE[0] + DROP_MS;   // 4700: the logo lands

// The stamp. The painting comes up out of black, then the logo falls.
export const STAMP_PHASES = {
  ARRIVE: [0, 200],         // black to the painting
  DROP:   [200, 500],       // the logo falls
  TITLE:  [500, 1000],      // landed; the menu follows
};
export const STAMP_IMPACT = STAMP_PHASES.TITLE[0];

const SHAKE_MS = 160;       // the landing's shake

export function durationOf(opts) {
  if (opts && opts.reduced) return STILL_DURATION;
  if (opts && opts.returning) return STAMP_DURATION;
  return INTRO_DURATION;
}

export function isDone(t, opts) { return t >= durationOf(opts); }

// The phase t is in. TITLE starts at the landing, so the slam the frame loop
// fires on that change lands with the logo, not before it.
export function phaseAt(t, opts) {
  if (t >= durationOf(opts)) return 'DONE';
  if (opts && opts.reduced) return 'STILL';
  if (opts && opts.returning) return t >= STAMP_IMPACT ? 'TITLE' : 'ARRIVE';
  if (t < 0) return 'CHASE';
  if (t >= TITLE_IMPACT) return 'TITLE';
  if (t >= PHASES.FADE[0]) return 'FADE';
  if (t >= PHASES.OVERTAKE[0]) return 'OVERTAKE';
  return 'CHASE';
}

// ---------- the title painting ----------
// The painting is src/art/title.js, the same layers the title screen paints
// (render.js drawTitleScreen), on the same backdrop, at the same place: the
// last frame of the movie IS the title screen. It is split in three so the
// logo can fall onto it: the sky and the horizon, the logo (crest, plate,
// wordmark, rule), and the gold frame, which sits over everything.
const W = 480, H = 300;
const BACKDROP = '#05050a';           // render.js drawTitleScreen fills this first
const TX = Math.round((W - TITLE_WIDTH) / 2), TY = Math.round((H - TITLE_HEIGHT) / 2);
const LOGO_IDS = new Set(['CREST', 'PLATE', 'WORDMARK', 'RULE']);
const layersOf = (pick) => TITLE_LAYERS.filter(pick).map(L => ({
  x: L.x, y: L.y, palette: L.palette, grid: L.scale === 1 ? L.grid : scaleGrid(L.grid, L.scale),
}));
let PARTS = null;
function parts() {
  if (!PARTS) {
    PARTS = {
      back: layersOf(L => !LOGO_IDS.has(L.id) && L.id !== 'FRAME'),
      logo: layersOf(L => LOGO_IDS.has(L.id)),
      frame: layersOf(L => L.id === 'FRAME'),
    };
  }
  return PARTS;
}
// Paint layers with one fillRect per run of equal pixels in a row (the sky
// alone is ~10^5 pixels; runs cut that tenfold when nothing is cached).
function paintLayers(c, layers, ox, oy) {
  for (const L of layers) {
    for (let ry = 0; ry < L.grid.length; ry++) {
      const row = L.grid[ry];
      let rx = 0;
      while (rx < row.length) {
        const v = row[rx];
        let end = rx + 1;
        while (end < row.length && row[end] === v) end++;
        if (v) { c.fillStyle = L.palette[v]; c.fillRect(ox + L.x + rx, oy + L.y + ry, end - rx, 1); }
        rx = end;
      }
    }
  }
}
// The logo's box, so its cached picture is no bigger than it needs to be.
let LOGO_BOX = null;
function logoBox() {
  if (!LOGO_BOX) {
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const L of parts().logo) {
      x0 = Math.min(x0, L.x); y0 = Math.min(y0, L.y);
      x1 = Math.max(x1, L.x + L.grid[0].length); y1 = Math.max(y1, L.y + L.grid.length);
    }
    LOGO_BOX = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return LOGO_BOX;
}
function drawBack(g, dx = 0) {
  blitPainted(g, 'intro-title:back', { x: 0, y: 0, w: W, h: H }, (c, ox, oy) => {
    c.fillStyle = BACKDROP;
    c.fillRect(ox, oy, W, H);
    paintLayers(c, parts().back, ox + TX, oy + TY);
  }, dx, 0);
}
function drawLogo(g, dx, dy) {
  blitPainted(g, 'intro-title:logo', logoBox(), (c, ox, oy) => paintLayers(c, parts().logo, ox + TX, oy + TY),
    Math.round(dx), Math.round(dy));
}
function drawFrame(g, dx = 0) {
  blitPainted(g, 'intro-title:frame', { x: 0, y: 0, w: W, h: H }, (c, ox, oy) => paintLayers(c, parts().frame, ox + TX, oy + TY), dx, 0);
}

// The logo's fall: from above the picture to its place, easing in (it
// gathers speed), from `t0`. Returns the vertical offset, 0 once landed.
function logoDrop(t, t0) {
  const u = Math.max(0, Math.min(1, (t - t0) / DROP_MS));
  return -(logoBox().y + logoBox().h + 8) * (1 - u * u);
}
// Two pixels of sideways shake after a landing, in whole pixels, fading.
function shakeAfter(t, impact) {
  const a = t - impact;
  if (a < 0 || a >= SHAKE_MS) return 0;
  const amp = 3 * (1 - a / SHAKE_MS);
  return Math.round((Math.floor(a / 40) % 2 === 0 ? 1 : -1) * amp);
}

// The whole painting, the logo `dy` from its place, everything `dx` across.
function drawPainting(g, dx, dy) {
  drawBack(g, dx);
  drawLogo(g, dx, dy);
  drawFrame(g, dx);
}

// ---------- the road ----------
const ROAD_SEED = 0x51ab7d33;
const ROAD_STAGE = 'BLOOD_RUST';   // a red dusk, the painting's own colours, so the dissolve flows
// How far behind the hero the front of the horde runs (depth units; the
// hero runs at depth 1, the crest is 12). It comes over the crest and closes
// to just behind his heels by the time the painting takes over.
function roadFront(ts) {
  const u = Math.max(0, Math.min(1, ts / (PHASES.FADE[0] / 1000)));
  return 7.5 - 6.3 * u;
}
const scenes = new Map();
function roadScene(heroId) {
  let s = scenes.get(heroId);
  if (!s) {
    s = buildScene({ seed: ROAD_SEED, stage: ROAD_STAGE, character: heroId });
    s.lungers = [];          // nothing breaks from the pack: the hero only runs
    s.noBoss = true;
    s.frontAt = roadFront;
    scenes.set(heroId, s);
  }
  return s;
}

// The dissolve: the picture in 12 px cells, each with its own moment. The
// sweep runs from the top down, with an ordered (Bayer) spread so the edge
// breaks up into pixels instead of a straight wipe.
const CELL = 12, COLS = Math.ceil(W / CELL), ROWS = Math.ceil(H / CELL);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function cellAt(cx, cy) {
  return 0.6 * (cy / (ROWS - 1)) + 0.4 * (BAYER[(cy % 4) * 4 + (cx % 4)] / 15);
}
// How far the dissolve has run at t: 0 none, 1 all of the painting.
function dissolveAt(t) {
  const u = (t - PHASES.FADE[0]) / (PHASES.FADE[1] - PHASES.FADE[0]);
  return Math.max(0, Math.min(1, u));
}
function drawDissolve(g, k) {
  if (k <= 0) return;
  // Each cell turns over when the sweep passes its moment (spread over 0..1).
  const shown = [];
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) if (cellAt(cx, cy) < k * 1.001) shown.push(cx, cy);
  }
  if (!shown.length) return;
  g.save();
  g.beginPath();
  for (let i = 0; i < shown.length; i += 2) g.rect(shown[i] * CELL, shown[i + 1] * CELL, CELL, CELL);
  g.clip();
  drawBack(g, 0);
  drawFrame(g, 0);
  g.restore();
}

// ---------- render ----------
export function render(g, t, opts = {}) {
  const o = opts || {};
  if (o.reduced) { drawPainting(g, 0, 0); return; }
  if (o.returning) {
    const dx = shakeAfter(t, STAMP_IMPACT);
    drawBack(g, dx);
    if (t >= STAMP_PHASES.DROP[0]) drawLogo(g, dx, logoDrop(t, STAMP_PHASES.DROP[0]));
    drawFrame(g, dx);
    const dark = 1 - Math.max(0, Math.min(1, t / STAMP_PHASES.ARRIVE[1]));
    if (dark > 0) {
      g.globalAlpha = dark;
      g.fillStyle = BACKDROP;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    return;
  }
  const hero = o.hero || pilotLook(null);
  const k = dissolveAt(t);
  if (k < 1) drawRoad(g, roadScene(hero.id), Math.max(0, t) / 1000);
  if (k >= 1) {
    const dx = shakeAfter(t, TITLE_IMPACT);
    drawBack(g, dx);
    if (t >= PHASES.TITLE[0]) drawLogo(g, dx, logoDrop(t, PHASES.TITLE[0]));
    drawFrame(g, dx);
  } else {
    drawDissolve(g, k);
  }
}

// ---------- test seam (read-only) ----------
export const INTRO_TEST = {
  SEED: ROAD_SEED,
  STAGE: ROAD_STAGE,
  BACKDROP,
  LOGO_IDS: [...LOGO_IDS],
  logoBox,
  dissolveAt,
  roadScene,
  cells: { CELL, COLS, ROWS, at: cellAt },
};
