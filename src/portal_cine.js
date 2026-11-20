// HORDES — portal-entry cinematic (WAVE-8/A, Sk408: "a little video of the
// hero defeating the boss and entering a portal, zoomed in the same way" as
// the intro).
//
// Timeline-driven and PURE, in the intro.js style: render(ctx, t) is a
// deterministic function of t (ms since cinematic start) — no stored state,
// no randomness, no DOM, fillRect only. hb1 plays this between the boss
// death and the intermission and owns the rAF clock + skip wiring; hb3 keys
// audio stingers off PHASES / phaseAt(t) (boss yell at KILL, spacey
// transport during DISSOLVE).
//
// Public API:
//   CINE_DURATION, PHASES, render(ctx, t, opts), isDone(t, opts), phaseAt(t, opts)
//   durationOf(opts), phasesOf(opts)
// opts (R2, all optional): { hero, boss, repeat, reduced }
//   hero    pilotLook(id) from src/movie_cast.js: the equipped pilot
//   boss    bossLook(id) from src/movie_cast.js: the boss the player killed,
//           drawn dark with its own rim as the fight draws it (boss.rim)
//   repeat  the movie was already shown in this run (movie_cast.js
//           REPEAT_RULE): it plays at full speed and drops the two held beats
//           (PAUSE and LINGER). 3500 ms, not 6857.
//   reduced reduced motion: the still card (the hero at the open gate over
//           the fallen boss, nothing moving), 1500 ms, then black.
// With no opts it is the first viewing with the Knight and Gravelmaw.
// CINE_TEST is a read-only test seam (NOT part of the frozen API).

import { pilotLook, bossLook } from './movie_cast.js';
// G16: the detailed portal art is CONSUMED here, never re-authored (its
// owner is the A1 art track; test/test_art_lint.mjs gates the file).
import { PORTAL_ART, PORTAL_PALETTE, PORTAL_BOX, portalFrame } from './art/index.js';

// ---------- timeline ----------
// WAVE-9B/1 (Sk408: "slow it to about 70 percent"): the cinematic plays at
// CINE_SPEED playback rate. Every beat below is authored in SCENE
// milliseconds on the design timeline; render() maps wall-clock t -> scene-ms
// (t * CINE_SPEED), so the exact same deterministic beats replay ~143% longer.
// PHASES/CINE_DURATION are exported in WALL-CLOCK ms (scene / CINE_SPEED) —
// hb1's clock and hb3's phase-keyed audio cues line up with the stretched
// beats automatically (phases stretch uniformly).
//
// G16 (owner: "show them approach and pause before they enter. fade the pilot
// and linger on the movie for a beat or two before fading out"): two NEW
// beats — PAUSE (the hero HELDS at the threshold, vortex still animating) and
// LINGER (the portal ALONE, animated, before the white->black fade). 4800
// scene-ms -> 6857 wall-ms, still under the 7000 smoke-pump budget.
export const CINE_SPEED = 0.7;                 // playback rate
const SCENE_DURATION = 4800;                   // scene-ms design timeline
export const CINE_DURATION = Math.round(SCENE_DURATION / CINE_SPEED);   // 6857 wall-ms

const SCENE = {
  KILL:    [0,    1200],   // hero lands the killing blow; boss collapses to a pile
  WALK:    [1200, 2000],   // detailed portal fades in behind the pile; hero walks to the threshold
  PAUSE:   [2000, 2700],   // G16 NEW: the hero HOLDS (>=600 scene-ms), one idle tell
  DISSOLVE:[2700, 3700],   // hero dissolves into rising pixels; the vortex takes him
  LINGER:  [3700, 4300],   // G16 NEW: the portal ALONE, still animating (>=500 wall-ms)
  FADE:    [4300, 4800],   // white-out, then fade to black
};
const wall = (s) => Math.round(s / CINE_SPEED);

// name -> [start, end) in WALL-CLOCK ms. Boss falls -> portal opens ->
// approach -> HELD PAUSE -> hero dissolves in -> LINGER on the portal ->
// white-out/fade to black (hb1 cuts to the intermission).
export const PHASES = {
  KILL:    [wall(SCENE.KILL[0]),     wall(SCENE.KILL[1])],
  WALK:    [wall(SCENE.WALK[0]),     wall(SCENE.WALK[1])],
  PAUSE:   [wall(SCENE.PAUSE[0]),    wall(SCENE.PAUSE[1])],
  DISSOLVE:[wall(SCENE.DISSOLVE[0]), wall(SCENE.DISSOLVE[1])],
  LINGER:  [wall(SCENE.LINGER[0]),   wall(SCENE.LINGER[1])],
  FADE:    [wall(SCENE.FADE[0]),     wall(SCENE.FADE[1])],
};

// R2 REPEAT VIEWING: a player who has seen this movie before gets it at full
// speed (1.0, wall ms = scene ms) with the held beats cut: PAUSE and LINGER
// take no time. The beats that remain are the same pictures.
const REPEAT_CUT = (SCENE.PAUSE[1] - SCENE.PAUSE[0]) + (SCENE.LINGER[1] - SCENE.LINGER[0]);
export const REPEAT_DURATION = SCENE_DURATION - REPEAT_CUT;   // 3500 wall-ms
const R_DIS = SCENE.PAUSE[0];                                  // DISSOLVE starts at 2000
const R_FADE = R_DIS + (SCENE.DISSOLVE[1] - SCENE.DISSOLVE[0]); // FADE starts at 3000
export const REPEAT_PHASES = {
  KILL:    [SCENE.KILL[0], SCENE.KILL[1]],
  WALK:    [SCENE.WALK[0], SCENE.WALK[1]],
  PAUSE:   [R_DIS, R_DIS],
  DISSOLVE:[R_DIS, R_FADE],
  LINGER:  [R_FADE, R_FADE],
  FADE:    [R_FADE, REPEAT_DURATION],
};
// Repeat wall-ms -> scene-ms (skips over the cut beats).
function repeatScene(tw) {
  if (tw < R_DIS) return tw;
  if (tw < R_FADE) return tw + (SCENE.PAUSE[1] - SCENE.PAUSE[0]);
  return tw + REPEAT_CUT;
}

// Reduced motion: one still card for STILL_DURATION, the scene as it stands
// at STILL_SCENE_T (the boss fallen, the gate open, the hero held at it).
export const STILL_DURATION = 1500;
const STILL_SCENE_T = SCENE.PAUSE[0] + 100;
const STILL_PHASES = { KILL: [0, 0], WALK: [0, 0], PAUSE: [0, STILL_DURATION],
  DISSOLVE: [STILL_DURATION, STILL_DURATION], LINGER: [STILL_DURATION, STILL_DURATION], FADE: [STILL_DURATION, STILL_DURATION] };

export function durationOf(opts) {
  const o = opts || {};
  return o.reduced ? STILL_DURATION : o.repeat ? REPEAT_DURATION : CINE_DURATION;
}
export function phasesOf(opts) {
  const o = opts || {};
  return o.reduced ? STILL_PHASES : o.repeat ? REPEAT_PHASES : PHASES;
}

export function isDone(t, opts) { return t >= durationOf(opts); }

// Phase name whose window contains t ('DONE' past the end, first phase
// before the start — audio can key either edge safely). An empty window (a
// repeat viewing's PAUSE and LINGER) is never reported.
export function phaseAt(t, opts) {
  const P = phasesOf(opts);
  if (t >= durationOf(opts)) return 'DONE';
  if (opts && opts.reduced) return 'PAUSE';   // the still card: one cue
  if (t < 0) return 'KILL';
  if (t >= P.FADE[0]) return 'FADE';
  if (t >= P.LINGER[0] && t < P.LINGER[1]) return 'LINGER';
  if (t >= P.DISSOLVE[0]) return 'DISSOLVE';
  if (t >= P.PAUSE[0] && t < P.PAUSE[1]) return 'PAUSE';
  if (t >= P.WALK[0]) return 'WALK';
  return 'KILL';
}

// ---------- layout / palette ----------
const W = 480, H = 300;              // matches CONFIG.VIEW_W/H
const GROUND_Y = 232;                // ground surface line
const PX = 8;                        // ZOOM: 1 sprite pixel -> 8x8 screen px
                                      // (same close-up as intro.js)
const BG = '#0e0e16', GROUND = '#15151f', GROUND_EDGE = '#1e1e2c';

// Boss: the boss the player killed (opts.boss, src/movie_cast.js), scaled by
// PX (the "same way" zoom). Gravelmaw when none is given.
const BOSS_DEFAULT = bossLook(null);
const BOSS = BOSS_DEFAULT;
const BOSS_X = 252;                  // left edge; feet on GROUND_Y
const BLOW_T = 650;                  // killing blow lands (ms into KILL)

// The hero: the equipped pilot's field sprite (opts.hero, src/movie_cast.js).
// The Knight when none is given; these constants are the test seam's colours.
const KNIGHT = pilotLook(null);
const HERO_A = KNIGHT.frames[0];
const HERO_PALETTE = KNIGHT.palette;
const RISE_COLORS = ['#7ec8ff', '#b8e0ff'];   // dissolve motes (not hero colors)

// Portal: the DETAILED gate (src/art/portal.js) behind the boss pile, drawn
// at an integer scale so the carved arch + keystone runes + 4-arm vortex read
// at the same PX=8 zoom language as the rest of the close-up.
const PORTAL_CX = 340;                      // gate centre x
const PORTAL_SCALE = 3;                     // 48px art -> 144px on screen
const PORTAL_W = PORTAL_BOX.w * PORTAL_SCALE;
const PORTAL_LX = PORTAL_CX - Math.floor(PORTAL_W / 2);   // 268: left edge, base on GROUND_Y
const PORTAL_CY = GROUND_Y - Math.floor(PORTAL_W / 2);
// Vortex rotation: a FIXED integer interval off the WALL clock — frame index
// is floor(t / FRAME_MS) % 4, NEVER accumulated dt (60Hz and 120Hz agree).
const VORTEX_FRAME_MS = 150;
const PAUSE_X = 196;                        // hero HELD at the gate's threshold
const GLOW = '#fff3c4';              // white-hot core (brightens in DISSOLVE)
const PILE = '#6f6f7a';              // boss-dust pile pixels
const FLASH = 'rgba(255,255,255,0.450)';  // boss hit-flash overlay
const BURST_COLORS = ['#fff8d8', '#ff5566', '#ffd54a'];
const WHITE = (a) => 'rgba(255,255,255,' + a.toFixed(3) + ')';
const BLACK = (a) => 'rgba(0,0,0,' + a.toFixed(3) + ')';

// ---------- deterministic hash (render.js cellRand pattern, fixed seed) -----
const CINE_SEED = 0x7c3a91f2;
function h(i, salt) {
  let v = (CINE_SEED ^ salt) >>> 0;
  v = Math.imul(v ^ i, 0x27d4eb2d);
  v ^= v >>> 15; v = Math.imul(v, 0x85ebca6b); v ^= v >>> 13;
  return (v >>> 0) / 4294967296;
}
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.max(0, Math.min(1, u));

// ---------- primitives ----------
// drawGridScaled pattern from render.js/intro.js; `mirror` flips the grid
// horizontally (the hero turns away from the camera when he walks in).
function drawGridScaled(g, grid, palette, x, y, px, mirror, keepU, dropSalt) {
  for (let ry = 0; ry < grid.length; ry++) {
    const row = grid[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const v = row[rx];
      if (!v) continue;
      if (keepU > 0 && h(ry * 17 + rx, dropSalt) < keepU) continue;  // dissolve
      const cx = mirror ? (row.length - 1 - rx) : rx;
      g.fillStyle = palette[v];
      g.fillRect(x + cx * px, y + ry * px, px, px);
    }
  }
}

// ---------- scene math (pure functions of t, ms; tt = clamped scene time) ---
// Boss collapse: full grid until the blow, then the top rows fold away and
// pixels rain out until only a squashed stump + dust pile remain at u=1.
function bossCollapseU(t) { return clamp01((t - BLOW_T) / 550); }

// Hero x: holds left, lunges for the blow, turns and walks to the gate's
// threshold, HOLDS through PAUSE (not one pixel), then steps toward the
// centre as he dissolves in.
function heroX(t) {
  if (t < SCENE.WALK[0]) return 140 + ((t >= 450 && t < 750) ? 34 : 0);
  if (t < SCENE.PAUSE[0]) return lerp(140, PAUSE_X, clamp01((t - SCENE.WALK[0]) / 800));
  if (t < SCENE.DISSOLVE[0]) return PAUSE_X;               // the HELD beat
  return lerp(PAUSE_X, PORTAL_CX - 48, clamp01((t - SCENE.DISSOLVE[0]) / 1000));
}

// Dissolve progress: hero pixel dropout + zoom shrink (8px -> 5px).
function dissolveU(t) { return clamp01((t - SCENE.DISSOLVE[0]) / 1000); }

// The PAUSE idle tell: one forward-lean pixel on a slow 2-frame flicker
// (deterministic off scene time — body language, NOT a rect move).
function pauseTellOn(t) {
  return t >= SCENE.PAUSE[0] && t < SCENE.PAUSE[1] && Math.floor(t / 260) % 2 === 0;
}

// Portal alpha: fades in through WALK, at full strength once it takes him.
function portalAlpha(t) {
  if (t < SCENE.WALK[0]) return 0;
  if (t < SCENE.DISSOLVE[0]) return 0.25 + 0.75 * clamp01((t - SCENE.WALK[0]) / 800);
  return 1;
}

// ---------- render ----------
export function render(g, tRaw, opts = {}) {
  // Skip-safety + SLOW-MO: clamp the WALL-CLOCK input, then map it onto the
  // design timeline at CINE_SPEED (t is scene-ms below — every beat is the
  // 4800ms choreography, replayed at 70% speed). Anything past the end is a
  // black hold frame, anything negative plays from the first beat. A repeat
  // viewing maps at full speed and steps over the held beats.
  const o = opts || {};
  const dur = durationOf(o);
  const still = !!o.reduced;
  const tw = still ? 0 : Math.max(0, Math.min(tRaw, dur));   // the still card: the vortex holds too
  const t = still ? STILL_SCENE_T : Math.min(SCENE_DURATION, o.repeat ? repeatScene(tw) : tw * CINE_SPEED);
  const hero = o.hero || KNIGHT;
  const BOSS = o.boss || BOSS_DEFAULT;
  const HERO_A = hero.frames[0], HERO_B = hero.frames[1] || HERO_A;
  const HERO_C = hero.frames[2] || HERO_A;
  const HERO_PALETTE = hero.palette;

  // Sky + static stars.
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1c1c2c';
  for (let i = 0; i < 20; i++) {
    g.fillRect(Math.floor(h(i, 11) * W), Math.floor(h(i, 12) * 120), 2, 2);
  }

  // Ground strip + fixed stones (camera is still — the fight is over).
  g.fillStyle = GROUND;
  g.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  g.fillStyle = GROUND_EDGE;
  g.fillRect(0, GROUND_Y, W, 2);
  for (let k = 0; k < 10; k++) {
    g.fillStyle = h(k, 21) < 0.5 ? '#1a1a28' : '#101018';
    const sx = Math.floor(h(k, 22) * W), sy = GROUND_Y + 10 + Math.floor(h(k, 23) * 50);
    if (h(k, 24) < 0.6) { g.fillRect(sx, sy, 8, 2); g.fillRect(sx + 11, sy + 3, 6, 2); }
    else { g.fillRect(sx, sy, 4, 3); g.fillRect(sx + 1, sy - 1, 2, 1); }
  }

  // The DETAILED portal (drawn FIRST so the boss pile and hero stand in
  // front of it): fades in through WALK, vortex rotating on the WALL clock
  // (floor(tw / VORTEX_FRAME_MS) — Hz-independent), embers drifting once it
  // is taking him so the LINGER hold is ALIVE, never a still frame.
  const pa = portalAlpha(t);
  if (pa > 0) {
    g.globalAlpha = pa;
    const fr = portalFrame(Math.floor(tw / VORTEX_FRAME_MS));
    drawGridScaled(g, fr, PORTAL_PALETTE, PORTAL_LX, GROUND_Y - PORTAL_W,
                   PORTAL_SCALE, false, 0, 0);
    const embers = t >= SCENE.LINGER[0] ? 6 : (t >= SCENE.DISSOLVE[0] ? 3 : 0);
    for (let i = 0; i < embers; i++) {
      g.fillStyle = i % 2 ? PORTAL_PALETTE[6] : PORTAL_PALETTE[7];
      const ex = PORTAL_CX - 40 + Math.floor(h(i, 101) * 80);
      const ey = GROUND_Y - 8 - ((Math.floor(t / 90) * 7 + i * 33) % 128);
      g.fillRect(ex, ey, 2, 2);
    }
    g.globalAlpha = 1;
    // Core glow brightens through DISSOLVE (the vortex takes him).
    const uD = dissolveU(t);
    const glowN = Math.floor(uD * 10);
    g.fillStyle = GLOW;
    for (let i = 0; i < glowN; i++) {
      const x = Math.floor(PORTAL_CX - 18 + h(i, 61) * 36);
      const y = Math.floor(PORTAL_CY - 34 + h(i, 62) * 68);
      const s = 5 + Math.floor(h(i, 63) * 5);
      g.fillRect(x, y, s, s);
    }
  }

  // Boss: full grid (with a pre-blow shake), collapsing after the blow into
  // a pixel stump + dust pile. Drawn over the portal, under the hero.
  const u = bossCollapseU(t);
  const skipTop = Math.floor(u * 17 * BOSS.box.h / 24);   // 17 of Gravelmaw's 24 rows
  const shake = t < BLOW_T ? (Math.floor(t / 90) % 2 === 0 ? 3 : -3) : 0;
  const frame = BOSS.frames[Math.floor(t / 150) % BOSS.frames.length];
  const bx0 = BOSS_X + shake, by0 = GROUND_Y - frame.length * PX + skipTop * PX;
  // A pixel still standing (not folded away, not rained out).
  const kept = (ry, rx) => ry >= skipTop && ry < frame.length && rx >= 0 && rx < frame[ry].length &&
    !!frame[ry][rx] && !(u > 0 && h(ry * 31 + rx, 71) < u * 0.6);
  // The rim: a boss's dark body is carried by a ring of its own hue (bosses.js
  // rim, as the fight draws it), one sprite pixel round what still stands.
  if (BOSS.rim) {
    g.fillStyle = BOSS.rim;
    const done = new Set();
    for (let ry = skipTop; ry < frame.length; ry++) {
      for (let rx = 0; rx < frame[ry].length; rx++) {
        if (!kept(ry, rx)) continue;
        for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const ny = ry + dy, nx = rx + dx;
          if (kept(ny, nx) || ny >= frame.length) continue;   // the feet stand on the ground
          const key = ny * 256 + nx;
          if (done.has(key)) continue;
          done.add(key);
          g.fillRect(bx0 + nx * PX, by0 + ny * PX, PX, PX);
        }
      }
    }
  }
  for (let ry = skipTop; ry < frame.length; ry++) {
    const row = frame[ry];
    for (let rx = 0; rx < row.length; rx++) {
      if (!kept(ry, rx)) continue;
      g.fillStyle = BOSS.palette[row[rx]];
      g.fillRect(bx0 + rx * PX, by0 + ry * PX, PX, PX);
    }
  }
  // Boss hit flash (before the blow): each of the boss's own pixels lit again
  // in white. A box would show as a grey rectangle round today's dark bosses.
  if (t < BLOW_T && Math.floor(t / 130) % 3 === 2) {
    g.fillStyle = FLASH;
    for (let ry = skipTop; ry < frame.length; ry++) {
      for (let rx = 0; rx < frame[ry].length; rx++) {
        if (kept(ry, rx)) g.fillRect(bx0 + rx * PX, by0 + ry * PX, PX, PX);
      }
    }
  }
  // Dust pile at the hooves (grows with u, stays for the rest of the scene).
  g.fillStyle = PILE;
  const pileN = Math.floor(u * 26);
  for (let i = 0; i < pileN; i++) {
    const x = Math.floor(BOSS_X - 8 + h(i, 81) * 200);
    const y = GROUND_Y - 3 - Math.floor(h(i, 82) * 9);
    const s = 3 + Math.floor(h(i, 83) * 4);
    g.fillRect(x, y, s, s);
  }

  // Slash + impact burst at the blow.
  if (t >= 450 && t < 700) {         // the killing swing (hero lunges too)
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 3; k++) g.fillRect(232 + k * 14, GROUND_Y - 130 + k * 18, 5, 34);
  }
  if (t >= BLOW_T && t < 1050) {
    const ub = clamp01((t - BLOW_T) / 400);
    for (let i = 0; i < 10; i++) {
      const ang = h(i, 31) * Math.PI * 2;
      const r = 8 + ub * 36;
      g.fillStyle = BURST_COLORS[i % 3];
      const s = 3 + Math.floor(h(i, 33) * 4);
      g.fillRect(Math.round(252 + 40 + Math.cos(ang) * r),
                 Math.round(GROUND_Y - 96 + Math.sin(ang) * r), s, s);
    }
  }

  // Hero: full-size frames through KILL/WALK (mirrored once he turns), then
  // dissolves into rising motes through DISSOLVE.
  const uD = dissolveU(t);
  const pxh = PX - Math.floor(uD * 3);
  const hx = Math.floor(heroX(t));
  const heroTop = GROUND_Y - HERO_A.length * pxh;
  const mirror = t >= SCENE.WALK[0];
  // He strides while he moves (the walk to the gate, the walk in) and stands
  // still otherwise.
  const moving = (t >= SCENE.WALK[0] && t < SCENE.PAUSE[0]) || t >= SCENE.DISSOLVE[0];
  const frameH = moving ? (Math.floor(t / 130) % 2 === 0 ? HERO_B : HERO_C) : HERO_A;
  if (uD < 1) {
    drawGridScaled(g, frameH, HERO_PALETTE, hx, heroTop, pxh, mirror, uD, 91);
    // G16 PAUSE tell: ONE forward-lean pixel on a slow 2-frame flicker. The
    // hero's rectangle does not move — this is body language at the gate.
    if (pauseTellOn(t)) {
      g.fillStyle = HERO_PALETTE[1];
      g.fillRect(hx + HERO_A[0].length * pxh, heroTop + 5 * pxh, pxh, pxh);
    }
  }
  // Rising dissolve motes streaming off where he stands (DISSOLVE only —
  // during the HELD PAUSE nothing but the tell touches the hero's region).
  const motes = Math.floor(uD * 18);
  for (let i = 0; i < motes; i++) {
    g.fillStyle = RISE_COLORS[i % 2];
    const mx = hx + Math.floor(h(i, 95) * 96);
    const my = heroTop + 30 - ((t * 0.05 + h(i, 96) * 80) % 90);
    const s = 3 + Math.floor(h(i, 97) * 2);
    g.fillRect(mx, Math.floor(my), s, s);
  }

  // FADE: white-out from 4300 scene, black by 4800 — but only AFTER the
  // LINGER held the portal alone for its beat (hb1 cuts to the intermission).
  const wl = clamp01((t - SCENE.FADE[0]) / 300);
  if (wl > 0) { g.fillStyle = WHITE(wl); g.fillRect(0, 0, W, H); }
  if (t >= SCENE.FADE[0] + 200) {
    g.fillStyle = BLACK(clamp01((t - (SCENE.FADE[0] + 200)) / 300));
    g.fillRect(0, 0, W, H);
  }
  // The still card's own ending: a short fade to black.
  if (still) {
    const f = clamp01((tRaw - (STILL_DURATION - 300)) / 300);
    if (f > 0) { g.fillStyle = BLACK(f); g.fillRect(0, 0, W, H); }
  }
  if (tRaw >= dur) { g.fillStyle = '#000000'; g.fillRect(0, 0, W, H); }
}

// ---------- test seam (read-only; mirrors INTRO_TEST pattern) ----------
export const CINE_TEST = {
  SEED: CINE_SEED, SPEED: CINE_SPEED,
  COLORS: { BG, GROUND, BOSS_HIDE: BOSS.palette[1], HERO_BODY: HERO_PALETTE[4],
            PILE, GLOW, RISE: RISE_COLORS[0], FLASH, SLASH: '#ffffff',
            TELL: HERO_PALETTE[1], PORTAL_VORTEX: PORTAL_PALETTE[6],
            PORTAL_RUNE: PORTAL_PALETTE[7] },
  ZOOM: PX,
  LAYOUT: { GROUND_Y, BOSS_X, PORTAL_CX, PORTAL_CY },
  // G16: everything a test needs to re-derive the portal/vortex/pause maths.
  PORTAL: { SCALE: PORTAL_SCALE, W: PORTAL_W, LX: PORTAL_LX,
            FRAME_MS: VORTEX_FRAME_MS, PALETTE: PORTAL_PALETTE },
  PAUSE_X, SCENE,
};
