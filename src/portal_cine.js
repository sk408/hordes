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
// Public API (FROZEN for hb1):
//   CINE_DURATION, PHASES, render(ctx, t), isDone(t), phaseAt(t)
// CINE_TEST is a read-only test seam (NOT part of the frozen API).

import { BOSS_SPRITES } from './bosses.js';

// ---------- timeline ----------
export const CINE_DURATION = 3800;   // ms

// name -> [start, end) in ms. Boss falls -> portal -> hero dissolves in ->
// white-out/fade to black (hb1 cuts to the intermission).
export const PHASES = {
  KILL:    [0,    1200],   // hero lands the killing blow; boss collapses to a pile
  WALK:    [1200, 2000],   // portal fades in behind the pile; hero walks in
  DISSOLVE:[2000, 3200],   // hero dissolves into rising pixels; portal brightens
  FADE:    [3200, 3800],   // white-out, then fade to black
};

export function isDone(t) { return t >= CINE_DURATION; }

// Phase name whose window contains t ('DONE' past the end, first phase
// before the start — audio can key either edge safely).
export function phaseAt(t) {
  if (t < 0) return 'KILL';
  if (t >= CINE_DURATION) return 'DONE';
  if (t >= PHASES.FADE[0]) return 'FADE';
  if (t >= PHASES.DISSOLVE[0]) return 'DISSOLVE';
  if (t >= PHASES.WALK[0]) return 'WALK';
  return 'KILL';
}

// ---------- layout / palette ----------
const W = 480, H = 300;              // matches CONFIG.VIEW_W/H
const GROUND_Y = 232;                // ground surface line
const PX = 8;                        // ZOOM: 1 sprite pixel -> 8x8 screen px
                                      // (same close-up as intro.js)
const BG = '#0e0e16', GROUND = '#15151f', GROUND_EDGE = '#1e1e2c';

// Boss: reuse the GRAVELMAW grid from bosses.js, scaled by PX (the "same
// way" zoom — 24px gameplay sprite reads as a 192px stone bull up close).
const BOSS = BOSS_SPRITES.GRAVELMAW;
const BOSS_X = 252;                  // left edge; feet on GROUND_Y
const BLOW_T = 650;                  // killing blow lands (ms into KILL)

// Hero grids: adapted copies of render.js PLAYER_SPRITE / PLAYER_SPRITE_WALK
// (same pair intro.js carries; 12x12, 0 = transparent).
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
const RISE_COLORS = ['#7ec8ff', '#b8e0ff'];   // dissolve motes (not hero colors)

// Portal: vertical flame ring (gameplay portal colors) behind the boss pile.
const PORTAL_CX = 340, PORTAL_CY = GROUND_Y - 76, PORTAL_RX = 44, PORTAL_RY = 80;
const PORTAL_DOTS = 28;              // full ring dot count
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

// Hero x: holds left, lunges for the blow, turns and walks to the portal,
// then steps through its center while dissolving.
function heroX(t) {
  if (t < PHASES.WALK[0]) return 140 + ((t >= 450 && t < 750) ? 34 : 0);
  if (t < PHASES.DISSOLVE[0]) return lerp(140, 296, clamp01((t - PHASES.WALK[0]) / 800));
  return lerp(296, 322, clamp01((t - PHASES.DISSOLVE[0]) / 1200));
}

// Dissolve progress: hero pixel dropout + zoom shrink (8px -> 5px).
function dissolveU(t) { return clamp01((t - PHASES.DISSOLVE[0]) / 1200); }

// Portal ring: dots reveal + alpha during WALK, full ring + core glow
// brightening through DISSOLVE.
function portalAlpha(t) {
  if (t < PHASES.WALK[0]) return 0;
  if (t < PHASES.DISSOLVE[0]) return 0.30 + 0.45 * clamp01((t - PHASES.WALK[0]) / 800);
  return 0.75 + 0.25 * dissolveU(t);
}
function portalDots(t) {
  if (t < PHASES.WALK[0]) return 0;
  return Math.min(PORTAL_DOTS, Math.floor(6 + 22 * clamp01((t - PHASES.WALK[0]) / 800)));
}

// ---------- render ----------
export function render(g, tRaw) {
  // Skip-safety: clamp the scene clock — anything past the end is a black
  // hold frame, anything negative plays from the first beat.
  const t = Math.max(0, Math.min(tRaw, CINE_DURATION));

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

  // Portal ring (drawn FIRST so the boss pile and hero stand in front of it).
  const dots = portalDots(t);
  const pa = portalAlpha(t);
  if (dots > 0) {
    for (let i = 0; i < dots; i++) {
      const a = (i / PORTAL_DOTS) * Math.PI * 2 + 0.3;
      const x = Math.floor(PORTAL_CX + Math.cos(a) * PORTAL_RX);
      const y = Math.floor(PORTAL_CY + Math.sin(a) * PORTAL_RY);
      g.fillStyle = i % 2 === 0 ? 'rgba(255,154,60,' + pa.toFixed(3) + ')'
                                : 'rgba(255,213,74,' + pa.toFixed(3) + ')';
      g.fillRect(x - 2, y - 2, 4, 4);
    }
    // Core glow brightens through DISSOLVE.
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
  const skipTop = Math.floor(u * 17);
  const shake = t < BLOW_T ? (Math.floor(t / 90) % 2 === 0 ? 3 : -3) : 0;
  const frame = BOSS.frames[Math.floor(t / 150) % BOSS.frames.length];
  for (let ry = skipTop; ry < frame.length; ry++) {
    const row = frame[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const v = row[rx];
      if (!v) continue;
      if (u > 0 && h(ry * 31 + rx, 71) < u * 0.6) continue;  // pixels rain out
      g.fillStyle = BOSS.palette[v];
      g.fillRect(BOSS_X + shake + rx * PX, GROUND_Y - frame.length * PX + skipTop * PX + ry * PX, PX, PX);
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
  const mirror = t >= PHASES.WALK[0];
  const frameH = mirror ? HERO_B : (Math.floor(t / 160) % 2 === 0 ? HERO_A : HERO_B);
  if (uD < 1) {
    drawGridScaled(g, frameH, HERO_PALETTE, hx, heroTop, pxh, mirror, uD, 91);
  }
  // Rising dissolve motes streaming off where he stands (count grows with u).
  const motes = 4 + Math.floor(uD * 14);
  for (let i = 0; i < motes; i++) {
    g.fillStyle = RISE_COLORS[i % 2];
    const mx = hx + Math.floor(h(i, 95) * 96);
    const my = heroTop + 30 - ((t * 0.05 + h(i, 96) * 80) % 90);
    const s = 3 + Math.floor(h(i, 97) * 2);
    g.fillRect(mx, Math.floor(my), s, s);
  }

  // Boss hit-flash overlay (pre-blow; over everything but the fades).
  if (t < BLOW_T && Math.floor(t / 130) % 3 === 2) {
    g.fillStyle = FLASH;
    g.fillRect(BOSS_X - 6, GROUND_Y - BOSS.box.h * PX, BOSS.box.w * PX + 12, BOSS.box.h * PX);
  }

  // FADE: white-out by 3500, black by 3800 (hb1 cuts to the intermission).
  const wl = clamp01((t - PHASES.FADE[0]) / 300);
  if (wl > 0) { g.fillStyle = WHITE(wl); g.fillRect(0, 0, W, H); }
  if (t >= 3500) { g.fillStyle = BLACK(clamp01((t - 3500) / 300)); g.fillRect(0, 0, W, H); }
  if (tRaw >= CINE_DURATION) { g.fillStyle = '#000000'; g.fillRect(0, 0, W, H); }
}

// ---------- test seam (read-only; mirrors INTRO_TEST pattern) ----------
export const CINE_TEST = {
  SEED: CINE_SEED,
  COLORS: { BG, GROUND, BOSS_HIDE: BOSS.palette[1], HERO_BODY: HERO_PALETTE[4],
            PILE, GLOW, RISE: RISE_COLORS[0], FLASH, SLASH: '#ffffff' },
  ZOOM: PX,
  LAYOUT: { GROUND_Y, BOSS_X, PORTAL_CX, PORTAL_CY },
};
