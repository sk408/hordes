// ESCAPE ART PASS 2026-09-17 (hub task msg_01M2QVHA38EEPYNNR0EDYNAH5K) —
// TWILIGHT/DUSK METROPOLIS RUINS, 3 rendered variants. BALANCE-NEUTRAL BY
// CONSTRUCTION: this module lives OUTSIDE src/, imports the REAL sim
// (escape/sim.js) and REAL sprites read-only, and is never reachable from the
// game. No scroll speed, corridor length, step count, payout, timing or
// latency constant is read or changed. It only DRAWS.
//
// What each variant changes vs the shipped art (src/escape/render.js):
//   - dusk sky gradient with a lit horizon + a low sun/star field
//   - THREE parallax ruin bands + a foreground debris band (shipped: two)
//     far 0.18x skyline silhouette . mid 0.45x broken towers WITH LIT WINDOWS
//     . near 0.7x rubble . FOREGROUND debris at 1.15x (below the play band,
//     never over gameplay — readability rule)
//   - HAZE: translucent horizontal bands between layers
//   - per-scene PIXEL SCALE (opts.px — the per-scene render scale ask; NOT a
//     global resolution change: the shipped game keeps its own transform)
//   - 4-FRAME actor loops (2 extra frames per actor; contact sheet below)
import { VIEW_W, VIEW_H, BAND, THREATS, EXIT, LOOK } from '../../../src/escape/config.js';
import { pressure } from '../../../src/escape/sim.js';
import { effectsFor } from '../../../src/escape/fx.js';
import { PURSUER_ART, PURSUER_LUNGE_ART, FLIER_ART } from '../../../src/escape/sprites.js';
import { PORTAL_ART, portalFrame } from '../../../src/art/index.js';

// ---------------------------------------------------------------------------
// Palette families — one line per variant, four acts each (the shipped act
// structure is kept: the corridor still TRAVELS dusk->dawn).
export const FAMILIES = [
  {
    name: 'A SKYLINE EMBER',
    line: 'indigo dusk / burnt-orange horizon — silhouetted towers, amber windows, embers on the wind',
    palettes: [
      { skyTop: '#141026', skyBottom: '#5a2a3a', horizon: '#ff8a4a', far: '#241a38', near: '#33204a', haze: '#c25a3c', win: '#ffc86a', voidGlow: '#ff8a4a', ember: '#ff9a4a' },
      { skyTop: '#0f0c24', skyBottom: '#4a1e42', horizon: '#ff5f6a', far: '#1e1434', near: '#2c1a44', haze: '#b04a6a', win: '#ff9a8a', voidGlow: '#ff5f6a', ember: '#ff6a7a' },
      { skyTop: '#0a0a20', skyBottom: '#32205c', horizon: '#9a6aff', far: '#161238', near: '#221a4c', haze: '#6a5ac0', win: '#d0b0ff', voidGlow: '#9a6aff', ember: '#c08aff' },
      { skyTop: '#061828', skyBottom: '#0e3a4a', horizon: '#38e0c0', far: '#0a2438', near: '#10303f', haze: '#3aa8a0', win: '#a0ffe8', voidGlow: '#38e0c0', ember: '#60e0c0' },
    ],
  },
  {
    name: 'B SMOKE INFERNO',
    line: 'choked amber-red dusk — near-black skyline, ember windows, thick haze, drifting light shafts',
    palettes: [
      { skyTop: '#1c1016', skyBottom: '#6e2a20', horizon: '#ffb04a', far: '#2a1620', near: '#3a1c24', haze: '#d07040', win: '#ffe08a', voidGlow: '#ff9a4a', ember: '#ffcf6a' },
      { skyTop: '#180c12', skyBottom: '#5c2018', horizon: '#ff7a3c', far: '#241018', near: '#32161f', haze: '#c05a30', win: '#ffc06a', voidGlow: '#ff8a4a', ember: '#ff9a5a' },
      { skyTop: '#120a12', skyBottom: '#401a2c', horizon: '#e05a5a', far: '#1c0e20', near: '#281428', haze: '#a03848', win: '#ff9a9a', voidGlow: '#e05a5a', ember: '#ff7a6a' },
      { skyTop: '#0a1a20', skyBottom: '#16443c', horizon: '#5ae0b0', far: '#0e2a28', near: '#143832', haze: '#3a9880', win: '#c0fff0', voidGlow: '#5ae0b0', ember: '#8ae8c8' },
    ],
  },
  {
    name: 'C COLD GRID',
    line: 'blue-violet twilight — steel skyline, pale-cyan windows, thin haze, stars out above the ruin',
    palettes: [
      { skyTop: '#0c1226', skyBottom: '#3a2a5a', horizon: '#b08aff', far: '#182040', near: '#222a4e', haze: '#8a9ae0', win: '#e8f4ff', voidGlow: '#b08aff', ember: '#c8b0ff' },
      { skyTop: '#0a0e22', skyBottom: '#2e2250', horizon: '#d06ae0', far: '#141a3a', near: '#1e2446', haze: '#9a7ae0', win: '#f0e0ff', voidGlow: '#d06ae0', ember: '#d8a0ff' },
      { skyTop: '#080c1e', skyBottom: '#221c48', horizon: '#7a8aff', far: '#101438', near: '#181e42', haze: '#5a6ad0', win: '#c0e0ff', voidGlow: '#7a8aff', ember: '#a0b8ff' },
      { skyTop: '#061624', skyBottom: '#0e3a4a', horizon: '#38e0c0', far: '#0a2438', near: '#10303f', haze: '#3aa8a0', win: '#a0ffe8', voidGlow: '#38e0c0', ember: '#60e0c0' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Shared plumbing (same house rules as src/escape/render.js: integer pixels,
// deterministic hash32, pure function of sim — no Math.random, no clock).
const CAM_LEAD = 150;
function hash32(a, b) {
  let n = (a * 374761393 + b * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
function hexRGB(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function mix(a, b, t) {
  const A = hexRGB(a), B = hexRGB(b);
  return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
}
function rgba(hex, a) {
  const c = hexRGB(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
}
function drawGridScaled(g, grid, palette, x, y, px) {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (!v) continue;
      g.fillStyle = palette[v];
      g.fillRect(x + c * px, y + r * px, px, px);
    }
  }
}
function paletteFor(sim) {
  const f = Math.min(1, sim.player.x / sim.corridor.length);
  const fr = [0.18, 0.42, 0.66];
  let i = 0;
  while (i < fr.length && f >= fr[i]) i++;
  return i;
}

// ---------------------------------------------------------------------------
// 4-FRAME ACTOR SETS — frames [1] and [3] are the SHIPPED frames; [2] and [4]
// are the two NEW intermediates (legs/arms/wings crossing between the shipped
// extremes), authored in the same integer-pixel grid contract.
// Keys: 1 ink outline, 2 body, 3 shade, 4 eye (identical palettes to shipped).
const PURSUER_PALETTE = { 1: '#140f12', 2: '#c05050', 3: '#7e3038', 4: '#ffd54a' };
const LEGS_A = [ // shipped frame A legs (stride extended) — rows 10..13
  [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0], [0, 0, 1, 2, 1, 1, 1, 2, 1, 0, 0, 0],
  [0, 1, 2, 2, 1, 0, 0, 1, 2, 1, 0, 0], [0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0],
];
const LEGS_B = [ // shipped frame B legs (gathered under)
  [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0], [0, 0, 0, 1, 1, 2, 1, 1, 1, 0, 0, 0],
  [0, 0, 1, 2, 1, 2, 2, 1, 0, 0, 0, 0], [0, 0, 1, 2, 1, 1, 2, 2, 1, 0, 0, 0],
];
const LEGS_MID1 = [ // NEW passing pose — legs crossed under the hips
  [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0], [0, 0, 1, 2, 1, 1, 1, 2, 1, 0, 0, 0],
  [0, 0, 1, 2, 1, 1, 1, 2, 1, 0, 0, 0], [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
];
const LEGS_MID2 = [ // NEW half-open — the knee driving through
  [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0], [0, 0, 1, 2, 1, 1, 1, 2, 1, 0, 0, 0],
  [0, 0, 1, 2, 2, 1, 1, 1, 2, 1, 0, 0], [0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0],
];
const TORSO = PURSUER_ART.frames[0].slice(0, 10); // rows 0..9 identical in both shipped frames
function pursuerFrame4(i) {
  const legs = [LEGS_A, LEGS_MID1, LEGS_B, LEGS_MID2][i];
  return { rows: TORSO.concat(legs), palette: PURSUER_PALETTE, w: 12, h: 14 };
}
export const PURSUER_RUN_4 = [0, 1, 2, 3].map(pursuerFrame4);

// Lunge 4-frame: shipped full-reach frames + two NEW mid-reach postures
// (the arm sweep between "arms back" and "full thrust").
const LUNGE_LOW_A = PURSUER_LUNGE_ART.frames[0].slice(6);
const LUNGE_LOW_B = PURSUER_LUNGE_ART.frames[1].slice(6);
const ARM_MID1 = [ // NEW: arms sweeping forward, mid reach
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 1, 2, 2, 2, 4, 1, 1, 0, 0, 0],
  [0, 0, 1, 2, 2, 2, 2, 2, 1, 1, 0, 0],
  [0, 1, 1, 1, 2, 2, 1, 1, 1, 2, 1, 0],
  [0, 1, 2, 2, 2, 2, 2, 1, 1, 2, 1, 0],
];
const ARM_MID2 = [ // NEW: arms near-full, wrists crossed
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [0, 0, 1, 2, 2, 2, 4, 1, 1, 1, 0, 0],
  [0, 0, 1, 2, 2, 1, 2, 2, 2, 1, 1, 0],
  [0, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 0],
  [0, 1, 2, 2, 2, 2, 2, 2, 1, 1, 1, 0],
];
function lungeFrame4(i) {
  const top = [PURSUER_LUNGE_ART.frames[0].slice(0, 6), ARM_MID1, PURSUER_LUNGE_ART.frames[1].slice(0, 6), ARM_MID2][i];
  const low = [LUNGE_LOW_A, LUNGE_LOW_A, LUNGE_LOW_B, LUNGE_LOW_B][i];
  return { rows: top.concat(low), palette: PURSUER_PALETTE, w: 12, h: 14 };
}
export const PURSUER_LUNGE_4 = [0, 1, 2, 3].map(lungeFrame4);

// Flier 4-frame flap: shipped wings-up/wings-down + two NEW mid-wing beats.
const FLIER_PALETTE = { 1: '#100e16', 2: '#8060c0', 3: '#4c3380', 4: '#ffd54a' };
const FLIER_MID1 = [ // NEW: wings half-raised on the way up
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0],
  [0,0,1,2,2,1,0,0,0,0,1,2,2,1,0,0],
  [0,1,2,2,2,2,1,1,1,1,2,2,2,2,1,1],
  [1,2,2,2,2,2,1,3,3,3,3,3,3,3,4,1],
  [1,2,2,2,2,2,1,1,1,1,2,2,3,3,1,1],
  [0,1,2,2,2,2,1,0,0,1,1,2,3,3,1,0],
  [0,0,1,2,2,2,1,0,0,1,2,2,2,2,1,0],
  [0,0,0,1,2,2,1,0,0,0,1,2,2,1,0,0],
  [0,0,0,0,1,1,1,0,0,0,0,1,1,1,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
const FLIER_MID2 = [ // NEW: wings sweeping past horizontal, tips trailing
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0],
  [0,1,1,1,2,2,1,1,1,1,2,2,1,1,1,1],
  [1,2,2,2,2,2,1,3,3,3,3,3,3,3,4,1],
  [1,2,2,2,2,2,2,1,1,1,1,2,2,3,3,1],
  [1,2,2,2,2,2,1,1,0,1,1,2,2,2,1,1],
  [0,1,2,2,2,2,2,1,1,2,2,2,2,2,1,0],
  [0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];
function flierFrame4(i) {
  const f = [FLIER_ART.frames[0], FLIER_MID1, FLIER_ART.frames[1], FLIER_MID2][i];
  return { rows: f, palette: FLIER_PALETTE, w: 16, h: 12 };
}
export const FLIER_4 = [0, 1, 2, 3].map(flierFrame4);

// The contact sheet (the actor-readability exhibit): every frame at 4x.
export function drawContactSheet(ctx) {
  ctx.fillStyle = '#101018';
  ctx.fillRect(0, 0, 240, 100);
  for (let i = 0; i < 4; i++) drawGridScaled(ctx, PURSUER_RUN_4[i].rows, PURSUER_PALETTE, 6 + i * 22, 6, 2);
  for (let i = 0; i < 4; i++) drawGridScaled(ctx, PURSUER_LUNGE_4[i].rows, PURSUER_PALETTE, 100 + i * 22, 6, 2);
  for (let i = 0; i < 4; i++) drawGridScaled(ctx, FLIER_4[i].rows, FLIER_PALETTE, 6 + i * 30, 44, 2);
}

// ---------------------------------------------------------------------------
// THE ENVIRONMENT — the metropolis-ruins parallax stack (per family).
function drawSky(ctx, pal, family, act) {
  const BANDS = 12;
  for (let i = 0; i < BANDS; i++) {
    ctx.fillStyle = mix(pal.skyTop, pal.skyBottom, i / (BANDS - 1));
    ctx.fillRect(0, i * 18, VIEW_W, 18);
  }
  ctx.fillStyle = rgba(pal.horizon, 0.55);
  ctx.fillRect(0, 214, VIEW_W, 2);
  // Family C: stars out above the ruin (deterministic, act-darkening sky).
  if (family === 2) {
    for (let i = 0; i < 40; i++) {
      const x = hash32(i, 3) % VIEW_W, y = hash32(i, 4) % 150;
      ctx.fillStyle = rgba('#e8f4ff', 0.25 + (hash32(i, 5) % 30) / 100);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Family A/B: a low SUN on the horizon (a pixel sun: stacked squares).
  if (family !== 2) {
    const sx = 330 - act * 40, sy = 208;
    ctx.fillStyle = rgba(pal.horizon, 0.28); ctx.fillRect(sx - 16, sy - 12, 32, 12);
    ctx.fillStyle = rgba(pal.horizon, 0.55); ctx.fillRect(sx - 11, sy - 16, 22, 16);
    ctx.fillStyle = mix(pal.horizon, '#ffffff', 0.35); ctx.fillRect(sx - 6, sy - 18, 12, 18);
  }
  // Family B: drifting LIGHT SHAFTS through the smoke (leaning quads).
  if (family === 1) {
    for (let i = 0; i < 3; i++) {
      const x = (i * 170 + act * 30) % (VIEW_W + 80) - 40;
      ctx.fillStyle = rgba(pal.horizon, 0.06);
      ctx.fillRect(x, 120, 26, 94);
      ctx.fillRect(x + 10, 90, 12, 30);
    }
  }
  // HAZE: one translucent band per layer seam (the depth cue).
  ctx.fillStyle = rgba(pal.haze, 0.10);
  ctx.fillRect(0, 152, VIEW_W, 5);
  ctx.fillStyle = rgba(pal.haze, 0.14);
  ctx.fillRect(0, 196, VIEW_W, 5);
}

function drawParallaxCity(ctx, camX, pal, family) {
  // Static per act (the palette travels; the city never animates — parity-free).
  // FAR SKYLINE (0.18x): silhouette towers, baseline 216.
  const offF = Math.round(camX * 0.18);
  const baseF = 216;
  ctx.fillStyle = pal.far;
  ctx.fillRect(0, baseF, VIEW_W, 84);
  for (let i = -1; i < VIEW_W / 20 + 1; i++) {
    const col = i + Math.floor(offF / 20);
    const x = col * 20 - offF;
    const h = 28 + hash32(col, 11) % 72;
    const w = 14 + hash32(col, 13) % 6;
    ctx.fillStyle = pal.far;
    ctx.fillRect(x, baseF - h, w, h);
    if (hash32(col, 14) % 3 === 0) {                          // antenna mast
      ctx.fillRect(x + ((w / 2) | 0), baseF - h - 7, 1, 7);
    }
  }
  // MID BROKEN TOWERS (0.45x): lit windows + jagged crowns, baseline 236.
  const offM = Math.round(camX * 0.45);
  const baseM = 236;
  ctx.fillStyle = mix(pal.far, pal.near, 0.5);
  ctx.fillRect(0, baseM, VIEW_W, 64);
  const rimM = mix(pal.near, '#ffffff', 0.22);
  for (let i = -1; i < VIEW_W / 28 + 1; i++) {
    const col = i + Math.floor(offM / 28);
    const x = col * 28 - offM;
    const h = 30 + hash32(col, 21) % 66;
    const w = 18 + hash32(col, 23) % 8;
    const cM = mix(pal.far, pal.near, 0.5);
    ctx.fillStyle = cM;
    ctx.fillRect(x, baseM - h, w, h);
    ctx.fillStyle = rimM;                                     // the crown's last light
    ctx.fillRect(x, baseM - h, w, 1);
    // The jagged BROKEN top: notches knocked out of the crown.
    const nN = 1 + hash32(col, 24) % 3;
    for (let k = 0; k < nN; k++) {
      const nx = x + 2 + hash32(col, 25 + k) % Math.max(1, w - 6);
      ctx.fillStyle = mix(cM, pal.skyBottom, 0.85);           // sky shows through the notch
      ctx.fillRect(nx, baseM - h, 4 + hash32(col, 30 + k) % 4, 4 + hash32(col, 35 + k) % 5);
    }
    // LIT WINDOWS: sparse, warm, deterministic — the "someone was here" read.
    const wins = 2 + hash32(col, 41) % 5;
    for (let k = 0; k < wins; k++) {
      const wx = x + 2 + hash32(col, 42 + k) % Math.max(1, w - 5);
      const wy = baseM - h + 4 + hash32(col, 47 + k) % Math.max(1, h - 9);
      ctx.fillStyle = rgba(pal.win, 0.75);
      ctx.fillRect(wx, wy, 2, 3);
    }
  }
  // NEAR RUBBLE (0.7x): heaped broken masonry, baseline 252 (just under the floor line).
  const offN = Math.round(camX * 0.7);
  const baseN = 252;
  ctx.fillStyle = pal.near;
  ctx.fillRect(0, baseN, VIEW_W, 48);
  for (let i = -1; i < VIEW_W / 16 + 1; i++) {
    const col = i + Math.floor(offN / 16);
    const x = col * 16 - offN;
    const h = 4 + hash32(col, 51) % 14;
    ctx.fillStyle = pal.near;
    ctx.fillRect(x, baseN - h, 13, h);
    ctx.fillStyle = mix(pal.near, '#ffffff', 0.14);
    ctx.fillRect(x, baseN - h, 13, 1);
  }
  // FOREGROUND DEBRIS (1.15x — FASTER than the camera): dark chunks BELOW the
  // play band only (y >= 268), never over terrain/actors — the readability rule.
  const offG = Math.round(camX * 1.15);
  ctx.fillStyle = mix(pal.near, '#000000', 0.55);
  for (let i = -1; i < VIEW_W / 34 + 1; i++) {
    const col = i + Math.floor(offG / 34);
    const x = col * 34 - offG;
    const h = 6 + hash32(col, 61) % 18;
    const y = 300 - h;
    ctx.fillRect(x, y, 20 + hash32(col, 62) % 12, h);
    if (hash32(col, 63) % 3 === 0) ctx.fillRect(x + 24, y + 4, 7, h - 4);
  }
}

// ---------------------------------------------------------------------------
// The pits (same lethal-void contract as shipped: darkening depth, lip glow).
function drawPits(ctx, sim, w2s, pal) {
  const floors = sim.plats
    .filter(pl => Math.abs(pl.y - BAND.FLOOR_Y) <= 2)
    .sort((a, b) => a.x - b.x);
  for (let i = 0; i + 1 < floors.length; i++) {
    const a = w2s(floors[i].x + floors[i].w), b = w2s(floors[i + 1].x);
    if (b < 0 || a > VIEW_W || b <= a) continue;
    const w = b - a;
    ctx.fillStyle = '#0a0a12'; ctx.fillRect(a, BAND.FLOOR_Y, w, 20);
    ctx.fillStyle = '#07070d'; ctx.fillRect(a, BAND.FLOOR_Y + 20, w, 22);
    ctx.fillStyle = '#04040a'; ctx.fillRect(a, BAND.FLOOR_Y + 42, w, VIEW_H - BAND.FLOOR_Y - 42);
    ctx.fillStyle = rgba(pal.voidGlow, 0.22); ctx.fillRect(a + 2, VIEW_H - 14, w - 4, 3);
    ctx.fillStyle = rgba(pal.voidGlow, 0.14); ctx.fillRect(b - 3, BAND.FLOOR_Y + 4, 3, VIEW_H - BAND.FLOOR_Y - 4);
    ctx.fillStyle = '#a8a8d0'; ctx.fillRect(a, BAND.FLOOR_Y, 2, 9); ctx.fillRect(b - 2, BAND.FLOOR_Y, 2, 9);
  }
}

// The horde wall (churning mass — condensed from shipped, same tells).
function drawWall(ctx, sim, w2s, pal) {
  const wEdge = w2s(sim.wall.x + 46);
  if (wEdge <= -20) return;
  const tick = Math.floor(sim.t * 8);
  ctx.fillStyle = '#7a2430';
  ctx.fillRect(0, 0, Math.max(0, Math.min(wEdge - 3, VIEW_W)), VIEW_H);
  if (wEdge > 0) {
    for (let y = 0; y < VIEW_H; y += 10) {
      const j = 3 + hash32(y, tick) % 9;
      ctx.fillRect(Math.max(0, wEdge - 3), y, j, 9);
    }
    ctx.fillStyle = LOOK.HORDE_EDGE;
    for (let y = 0; y < VIEW_H; y += 10) {
      const j = 3 + hash32(y, tick) % 9;
      ctx.fillRect(Math.max(0, wEdge - 1), y, Math.max(1, j - 3), 2);
    }
  }
  const bodyTick = Math.floor(sim.t * 5);
  for (let i = 0; i < 26; i++) {
    const x = wEdge - 12 - hash32(i, bodyTick) % 110;
    if (x + 12 < 0) continue;
    const y = 14 + hash32(i * 7 + 1, bodyTick) % (VIEW_H - 40);
    const w = 7 + hash32(i, bodyTick + 9) % 7;
    ctx.fillStyle = (i % 2) ? '#8e2c3a' : '#5e1a24';
    ctx.fillRect(x, y, w, w - 2);
    ctx.fillRect(x + 2, y - 2, w - 4, 2);
    if (hash32(i * 13, bodyTick) % 4 === 0) {
      ctx.fillStyle = '#ffd54a';
      ctx.fillRect(x + 2, y + 3, 2, 1);
      ctx.fillRect(x + 5, y + 3, 2, 1);
    }
  }
  const emberTick = Math.floor(sim.t * 9);
  for (let i = 0; i < 8; i++) {
    const x = wEdge + 2 + hash32(i * 3 + 1, emberTick) % 26;
    if (x >= VIEW_W) continue;
    const y = (hash32(i * 11 + 5, emberTick) % (VIEW_H - 20)) + (emberTick % 2);
    ctx.fillStyle = (i % 3 === 0) ? '#ffd54a' : pal.ember;
    ctx.fillRect(x, y, 1, 2);
  }
}

// ---------------------------------------------------------------------------
// THE VARIANT SCENE DRAW — mirrors the shipped draw() contract (pure function
// of sim; opts.family picks the palette line; opts.px is the PER-SCENE scale).
export function drawScene(ctx, sim, opts = {}) {
  const family = opts.family ?? 0;
  const px = opts.px ?? 1;
  const fam = FAMILIES[family];
  const act = paletteFor(sim);
  const pal = fam.palettes[act];
  const p = sim.player;
  const camX = Math.max(0, p.x - CAM_LEAD);
  const w2s = (x) => Math.round(x - camX);

  ctx.save();
  ctx.scale(px, px);
  ctx.imageSmoothingEnabled = false;

  drawSky(ctx, pal, family, act);
  drawParallaxCity(ctx, camX, pal, family);

  // Terrain (shipped colours/contract: lit standable edge, wear, gap lips).
  for (const pl of sim.plats) {
    const x0 = w2s(pl.x), x1 = w2s(pl.x + pl.w);
    if (x1 < 0 || x0 > VIEW_W) continue;
    const top = Math.round(pl.y);
    ctx.fillStyle = '#3a3a52'; ctx.fillRect(x0, top, x1 - x0, BAND.KILL_Y - top);
    ctx.fillStyle = '#2c2c40'; ctx.fillRect(x0, BAND.KILL_Y - 8, x1 - x0, 8);
    ctx.fillStyle = '#5a5a7e'; ctx.fillRect(x0, top, x1 - x0, 3);
    ctx.fillStyle = '#8a8ab0'; ctx.fillRect(x0, top, 2, 8); ctx.fillRect(x1 - 2, top, 2, 8);
  }
  drawPits(ctx, sim, w2s, pal);
  ctx.fillStyle = '#221218';
  for (const pl of sim.destroyedPlats) {
    const x0 = w2s(pl.x), x1 = w2s(pl.x + pl.w);
    if (x1 < 0 || x0 > VIEW_W) continue;
    ctx.fillRect(x0, Math.round(pl.y), x1 - x0, 4);
  }

  // The exit portal (the shipped emissive treatment — unchanged destination).
  const bx = w2s(sim.corridor.portalX);
  if (bx > -80 && bx < VIEW_W + 80) {
    const pulse = 0.5 + 0.5 * Math.sin(sim.t * 3.2);
    ctx.fillStyle = rgba(LOOK.PORTAL_HALO, 0.045 + 0.035 * pulse); ctx.fillRect(bx - 26, 0, 52, BAND.FLOOR_Y);
    ctx.fillStyle = rgba(LOOK.PORTAL_HALO, 0.07 + 0.06 * pulse); ctx.fillRect(bx - 14, 0, 28, BAND.FLOOR_Y);
    ctx.fillStyle = rgba(LOOK.PORTAL_HALO, 0.12 + 0.08 * pulse); ctx.fillRect(bx - 6, 0, 12, BAND.FLOOR_Y);
    ctx.fillStyle = '#60e0c0';
    ctx.fillRect(bx - 2, BAND.FLOOR_Y - EXIT.BEACON_H, 4, EXIT.BEACON_H);
    ctx.fillRect(bx - 8, BAND.FLOOR_Y - EXIT.BEACON_H, 16, 6);
    const fr = portalFrame(Math.floor(sim.t * 6));
    drawGridScaled(ctx, fr, PORTAL_ART.palette, bx - PORTAL_ART.w, BAND.FLOOR_Y - PORTAL_ART.h * 2, 2);
  }

  // The boss body (shipped presence treatment, condensed).
  if (sim.boss) {
    const b = sim.boss;
    const bx0 = w2s(b.x - THREATS.BOSS_W / 2);
    if (bx0 < VIEW_W + 60) {
      ctx.fillStyle = '#904858';
      ctx.fillRect(bx0, BAND.FLOOR_Y - THREATS.BOSS_H, THREATS.BOSS_W, THREATS.BOSS_H);
      ctx.fillStyle = '#583040';
      ctx.fillRect(bx0, BAND.FLOOR_Y - THREATS.BOSS_H, THREATS.BOSS_W, 6);
      const bPulse = 0.5 + 0.5 * Math.sin(sim.t * 5.0);
      ctx.fillStyle = rgba(LOOK.HORDE_EDGE, 0.35 + 0.3 * bPulse);
      ctx.fillRect(bx0, BAND.FLOOR_Y - THREATS.BOSS_H, THREATS.BOSS_W, 2);
      if (b.telegraph > 0 && b.target) {
        const tx0 = w2s(b.target.x), tx1 = w2s(b.target.x + b.target.w);
        ctx.fillStyle = '#e06050';
        for (let x = Math.max(0, tx0); x < Math.min(VIEW_W, tx1); x += 12) ctx.fillRect(x, b.target.y - 10, 6, 4);
      }
    }
  }

  // Threats — the 4-FRAME loops (the shipped 2-frame art is frames 0+2 here).
  for (const pu of sim.pursuers) {
    const x = w2s(pu.x);
    if (x < -14 || x > VIEW_W + 14) continue;
    const bob = (Math.floor(sim.t * 10) % 2) ? 0 : 1;
    const matched = pu.state === 'matched';
    const set = matched ? PURSUER_RUN_4 : PURSUER_LUNGE_4;
    const fr = set[Math.floor(sim.t * (matched ? 12 : 18)) % 4];
    drawGridScaled(ctx, fr.rows, fr.palette, x - 6, Math.round(pu.y) - 14 + bob, 1);
    if (!matched) {
      ctx.fillStyle = 'rgba(255,213,74,0.45)';
      ctx.fillRect(x - 16, Math.round(pu.y) - 10 + bob, 9, 1);
      ctx.fillRect(x - 13, Math.round(pu.y) - 6 + bob, 7, 1);
    }
  }
  for (const fl of sim.fliers) {
    const x = w2s(fl.x);
    if (x < -18 || x > VIEW_W + 18) continue;
    const fr = FLIER_4[Math.floor(fl.phase * 4) % 4];
    drawGridScaled(ctx, fr.rows, fr.palette, x - 8, Math.round(fl.y) - 6, 1);
  }
  ctx.fillStyle = '#f0d060';
  for (const s of sim.shots) {
    const x = w2s(s.x);
    if (x < -12 || x > VIEW_W + 12) continue;
    ctx.fillRect(x - 2, Math.round(s.y) - 2, 5, 3);
  }

  drawWall(ctx, sim, w2s, pal);

  // The runner (shipped: lithe block + visor + dash tell).
  const pxs = w2s(p.x), py = Math.round(p.y);
  ctx.fillStyle = '#e8e8f0';
  ctx.fillRect(pxs - 4, py - 14, 8, 14);
  ctx.fillStyle = '#9a9ac2';
  ctx.fillRect(pxs - 4 + (p.dir > 0 ? 4 : 0), py - 12, 4, 2);
  if (p.dashT > 0) {
    ctx.fillStyle = '#9090c0';
    ctx.fillRect(pxs - 4 - 8 * p.dir, py - 10, 8, 6);
  }

  // HUD (time + pressure bar + the skip affordance — unchanged contracts).
  ctx.fillStyle = '#b8b8cc';
  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  const secs = Math.floor(sim.t);
  ctx.fillText('ESCAPE ' + String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0'), 8, 8);
  const pr = pressure(sim);
  ctx.fillText('HORDE PRESSURE ' + Math.round(pr) + 'px', 8, 22);
  const barW = 90, fill = Math.max(0, Math.min(1, pr / 220)) * barW;
  ctx.fillStyle = '#26263a'; ctx.fillRect(8, 34, barW, 5);
  ctx.fillStyle = pr > 120 ? '#60e0c0' : pr > 50 ? '#ffd54a' : '#e06050';
  ctx.fillRect(8, 34, Math.round(fill), 5);
  ctx.fillStyle = '#26263a'; ctx.fillRect(VIEW_W - 92, 8, 84, 26);
  ctx.strokeStyle = '#4a4a66'; ctx.strokeRect(VIEW_W - 91.5, 8.5, 83, 25);
  ctx.fillStyle = '#b8b8cc'; ctx.fillText('SKIP', VIEW_W - 70, 16);

  ctx.restore();
}
