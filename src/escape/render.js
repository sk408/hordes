// HORDES — V1 escape RENDER: side-view draw in the SAME virtual 480x300 the
// overhead renderer maps onto the backing store (the transform is already set
// by renderer.resize; integer pixels, no smoothing, no second coordinate
// system). Everything the player MUST be able to see is drawn: the wall (the
// real timer), every gap edge before it is crossed, the boss's telegraph, the
// portal beacon, and the SKIP affordance from the FIRST frame.
//
// V1b (docs/briefs/V1B_ESCAPE_ART.md): the corridor now HAS a place —
// parallax bands behind, lit platform edges with lethal-reading pits, the
// wall as a churning HORDE MASS (bodies, ragged edge, dust, glinting eyes),
// the exit as a glowing destination (the game's own portal art, reused), and
// the enemies as sprites (src/escape/sprites.js, the same grid format as
// src/art/*). Every number that animates derives from sim.t or the sim's own
// seeded state — NO Math.random, NO wall clock — so the draw stays a pure
// function of the sim and the 60/120Hz parity contract is untouched.
import { VIEW_W, VIEW_H, BAND, THREATS, EXIT, LOOK } from './config.js';
import { pressure } from './sim.js';
import { effectsFor } from './fx.js';
import { PURSUER_RUN_4, PURSUER_LUNGE_4, FLIER_4, PILOT_ART, PILOT_JUMP_ART, PILOT_DASH_ART, BOSS_ART } from './sprites.js';
import { PORTAL_ART, portalFrame } from '../art/index.js';

// Palette (matches the game's dark field art).
const C_PLAT = '#3a3a52';
const C_PLAT_TOP = '#5a5a7e';
const C_PLAT_UNDER = '#2c2c40';
const C_WALL = '#7a2430';
const C_SHOT = '#f0d060';
const C_TELEGRAPH = '#e06050';
const C_BEACON = '#60e0c0';
const C_TEXT = '#b8b8cc';
// V1b environment: the horde mass tones (the sky/bands/pits/poles all read the
// V1d act palette now — config.js LOOK, selected by paletteFor below).
const C_WALL_BODY_A = '#8e2c3a';
const C_WALL_BODY_B = '#5e1a24';

// ---- V1d LOOK plumbing: the act palette as a PURE function of progress ------
// Selection keys on the SAME corridor fractions the wall speed and the pursuit
// tempo read (LOOK.ACT_FRACS === wallSpeed's thresholds), so intensity and
// colour travel together; no clock, no rng, integer bands only.
function paletteFor(sim) {
  const f = Math.min(1, sim.player.x / sim.corridor.length);
  const fr = LOOK.ACT_FRACS;
  let i = 0;
  while (i < fr.length && f >= fr[i]) i++;
  return { pal: LOOK.PALETTES[i], act: i };
}
function hexRGB(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function mix(a, b, t) {
  const A = hexRGB(a), B = hexRGB(b);
  return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
    Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
}
function rgba(hex, a) {
  const c = hexRGB(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
}

// The runner sits a third in from the left; the corridor scrolls under it.
const CAM_LEAD = 150;

// The skip affordance: a real hit-testable rect, visible from frame one.
export const SKIP_RECT = { x: VIEW_W - 92, y: 8, w: 84, h: 26 };
export function skipHit(px, py) {
  return px >= SKIP_RECT.x && px <= SKIP_RECT.x + SKIP_RECT.w &&
         py >= SKIP_RECT.y && py <= SKIP_RECT.y + SKIP_RECT.h;
}

// Integer-pixel grid painter (the intro.js/death_cine.js house pattern — the
// escape render owns a plain ctx, not the Renderer, so it carries its own).
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

// A deterministic 32-bit hash (NO Math.random anywhere in this file): the
// parallax silhouettes and the horde mass's churning bodies are functions of
// (index, coarse time tick), so the same sim time always paints the same
// pixels and the render stays pure.
function hash32(a, b) {
  let n = (a * 374761393 + b * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

// ---- the SKY (VARIANT B "SMOKE INFERNO", adopted 2026-09-17 — owner:
// "Variant b is good"): a 12-band gradient with a lit horizon, a low pixel
// SUN, drifting LIGHT SHAFTS through the smoke (family B's signature), and
// HAZE bands at the layer seams. Static per act (the palette travels; the sky
// never animates, so there is nothing to desync). Palette: config.js LOOK.
function drawSky(ctx, pal, act) {
  const BANDS = 12;
  for (let i = 0; i < BANDS; i++) {
    ctx.fillStyle = mix(pal.skyTop, pal.skyBottom, i / (BANDS - 1));
    ctx.fillRect(0, i * 18, VIEW_W, 18);
  }
  ctx.fillStyle = rgba(pal.horizon, 0.55);
  ctx.fillRect(0, 214, VIEW_W, 2);
  // The low SUN (a pixel sun: stacked squares sinking as the acts advance).
  const sx = 330 - act * 40, sy = 208;
  ctx.fillStyle = rgba(pal.horizon, 0.28); ctx.fillRect(sx - 16, sy - 12, 32, 12);
  ctx.fillStyle = rgba(pal.horizon, 0.55); ctx.fillRect(sx - 11, sy - 16, 22, 16);
  ctx.fillStyle = mix(pal.horizon, '#ffffff', 0.35); ctx.fillRect(sx - 6, sy - 18, 12, 18);
  // Drifting LIGHT SHAFTS through the smoke (leaning quads).
  for (let i = 0; i < 3; i++) {
    const x = (i * 170 + act * 30) % (VIEW_W + 80) - 40;
    ctx.fillStyle = rgba(pal.horizon, 0.06);
    ctx.fillRect(x, 120, 26, 94);
    ctx.fillRect(x + 10, 90, 12, 30);
  }
  // HAZE: one translucent band per layer seam (the depth cue).
  ctx.fillStyle = rgba(pal.haze, 0.10);
  ctx.fillRect(0, 152, VIEW_W, 5);
  ctx.fillStyle = rgba(pal.haze, 0.14);
  ctx.fillRect(0, 196, VIEW_W, 5);
}

// ---- the METROPOLIS RUINS parallax (variant B stack, adopted 2026-09-17):
// FAR skyline silhouette 0.18x · MID broken towers with LIT WINDOWS and jagged
// crowns 0.45x · NEAR rubble 0.7x · FOREGROUND debris 1.15x. Static per act;
// deterministic hash32 silhouettes; ~60 fillRects — this runs on a phone.
function drawParallax(ctx, camX, pal) {
  // FAR SKYLINE (0.18x): silhouette towers + antenna masts, baseline 216.
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
    if (hash32(col, 14) % 3 === 0) ctx.fillRect(x + ((w / 2) | 0), baseF - h - 7, 1, 7);
  }
  // MID BROKEN TOWERS (0.45x): lit windows + jagged crowns, baseline 236.
  const offM = Math.round(camX * 0.45);
  const baseM = 236;
  const cM = mix(pal.far, pal.near, 0.5);
  ctx.fillStyle = cM;
  ctx.fillRect(0, baseM, VIEW_W, 64);
  const rimM = mix(pal.near, '#ffffff', 0.22);
  for (let i = -1; i < VIEW_W / 28 + 1; i++) {
    const col = i + Math.floor(offM / 28);
    const x = col * 28 - offM;
    const h = 30 + hash32(col, 21) % 66;
    const w = 18 + hash32(col, 23) % 8;
    ctx.fillStyle = cM;
    ctx.fillRect(x, baseM - h, w, h);
    ctx.fillStyle = rimM;                                     // the crown's last light
    ctx.fillRect(x, baseM - h, w, 1);
    // The jagged BROKEN top: notches knocked out of the crown.
    const nN = 1 + hash32(col, 24) % 3;
    for (let k = 0; k < nN; k++) {
      const nx = x + 2 + hash32(col, 25 + k) % Math.max(1, w - 6);
      ctx.fillStyle = mix(cM, pal.skyBottom, 0.85);           // sky shows through
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
  // NEAR RUBBLE (0.7x): heaped broken masonry, baseline 252.
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
  // FOREGROUND DEBRIS (1.15x — faster than the camera): dark chunks BELOW the
  // play band only (y >= 268), never over terrain/actors — the readability rule.
  const offG = Math.round(camX * 1.15);
  ctx.fillStyle = mix(pal.near, '#000000', 0.55);
  for (let i = -1; i < VIEW_W / 34 + 1; i++) {
    const col = i + Math.floor(offG / 34);
    const x = col * 34 - offG;
    const h = 6 + hash32(col, 61) % 18;
    ctx.fillRect(x, 300 - h, 20 + hash32(col, 62) % 12, h);
    if (hash32(col, 63) % 3 === 0) ctx.fillRect(x + 24, 304 - h, 7, h - 4);
  }
}

// ---- the pits: a gap in the floor must read as a lethal VOID, not missing
// geometry. Floor-level gap spans get a darkening depth and a lip glow; the
// parallax bands stay faintly visible through the hole (they are drawn behind
// the terrain, the hole simply does not cover them).
function drawPits(ctx, sim, w2s, pal) {
  const floors = sim.plats
    .filter(pl => Math.abs(pl.y - BAND.FLOOR_Y) <= 2)
    .sort((a, b) => a.x - b.x);
  for (let i = 0; i + 1 < floors.length; i++) {
    const a = w2s(floors[i].x + floors[i].w), b = w2s(floors[i + 1].x);
    if (b < 0 || a > VIEW_W || b <= a) continue;
    const w = b - a;
    // Depth: three darkening bands down to the void.
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(a, BAND.FLOOR_Y, w, 20);
    ctx.fillStyle = '#07070d';
    ctx.fillRect(a, BAND.FLOOR_Y + 20, w, 22);
    ctx.fillStyle = '#04040a';
    ctx.fillRect(a, BAND.FLOOR_Y + 42, w, VIEW_H - BAND.FLOOR_Y - 42);
    // The COLOURED FAR SIDE: the void is not empty black — the act's glow
    // bleeds up its floor and washes the far wall (a place, not a hole).
    ctx.fillStyle = rgba(pal.voidGlow, 0.22);
    ctx.fillRect(a + 2, VIEW_H - 14, w - 4, 3);
    ctx.fillStyle = rgba(pal.voidGlow, 0.14);
    ctx.fillRect(b - 3, BAND.FLOOR_Y + 4, 3, VIEW_H - BAND.FLOOR_Y - 4);
    // The lip GLOWS on both sides (the no-blind-drops rule, lit).
    ctx.fillStyle = '#a8a8d0';
    ctx.fillRect(a, BAND.FLOOR_Y, 2, 9);
    ctx.fillRect(b - 2, BAND.FLOOR_Y, 2, 9);
  }
}

// ---- the horde wall as a MASS: a base slab, a ragged full-height leading
// edge, churning bodies with glinting eyes, and dust kicked ahead of it.
function drawWall(ctx, sim, w2s, pal) {
  const wEdge = w2s(sim.wall.x + 46);
  if (wEdge <= -20) return;
  const tick = Math.floor(sim.t * 8);
  ctx.fillStyle = C_WALL;
  ctx.fillRect(0, 0, Math.max(0, Math.min(wEdge - 3, VIEW_W)), VIEW_H);
  // Ragged leading edge: full height, per-band jitter.
  if (wEdge > 0) {
    ctx.fillStyle = C_WALL;
    for (let y = 0; y < VIEW_H; y += 10) {
      const j = 3 + hash32(y, tick) % 9;
      ctx.fillRect(Math.max(0, wEdge - 3), y, j, 9);
    }
    // The MOLTEN EDGE — one of the two brightest poles on screen (owner: the
    // portal ahead and the horde behind must be the emissive anchors). The
    // whole ragged crest burns hot, flickering off the sim's own tick.
    ctx.fillStyle = LOOK.HORDE_EDGE;
    for (let y = 0; y < VIEW_H; y += 10) {
      const j = 3 + hash32(y, tick) % 9;
      ctx.fillRect(Math.max(0, wEdge - 1), y, Math.max(1, j - 3), 2);
    }
    ctx.fillStyle = mix(LOOK.HORDE_EDGE, '#ffffff', 0.45);
    for (let y = 4; y < VIEW_H; y += 26) {
      ctx.fillRect(Math.max(0, wEdge + 2 + hash32(y, tick) % 3), y, 2, 8);
    }
  }
  // Bodies in the mass: overlapping blobs that churn slowly.
  const bodyTick = Math.floor(sim.t * 5);
  for (let i = 0; i < 26; i++) {
    const x = wEdge - 12 - hash32(i, bodyTick) % 110;
    if (x + 12 < 0) continue;
    const y = 14 + hash32(i * 7 + 1, bodyTick) % (VIEW_H - 40);
    const w = 7 + hash32(i, bodyTick + 9) % 7;
    ctx.fillStyle = (i % 2) ? C_WALL_BODY_A : C_WALL_BODY_B;
    ctx.fillRect(x, y, w, w - 2);
    ctx.fillRect(x + 2, y - 2, w - 4, 2);
    // Eyes glint out of the mass (the horde looks BACK).
    if (hash32(i * 13, bodyTick) % 4 === 0) {
      ctx.fillStyle = '#ffd54a';
      ctx.fillRect(x + 2, y + 3, 2, 1);
      ctx.fillRect(x + 5, y + 3, 2, 1);
    }
  }
  // Dust kicked AHEAD of the edge (the pressure arrives before the wall does),
  // and the act's OWN embers riding the heat: the horizon's colour torn loose.
  const dustTick = Math.floor(sim.t * 12);
  for (let i = 0; i < 14; i++) {
    const x = wEdge + 3 + hash32(i, dustTick) % 15;
    if (x >= VIEW_W) continue;
    const y = hash32(i * 5 + 2, dustTick) % VIEW_H;
    ctx.fillStyle = 'rgba(176,64,80,0.45)';
    ctx.fillRect(x, y, 2, 2);
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

// ---- VK9P4 THE APPENDAGES (owner: "multiple appendages"): THREE arms, each
// a procedural chain keyed PURELY on the sim's own per-arm machine, so the
// pixels are a function of (sim, arm, phase, t) and parity holds by
// construction. Each arm anchors on the body's left flank and its tip rides
// four authored posts: COILED at the flank (idle), RAISED (the wind-up tell),
// FULL REACH in its lane (extend/hold), and back. Every wind-up also stripes
// its landing zone — the phone-size tell (ground arms stripe the floor at
// their band; the sickle stripes its AIR lane, the band it alone can hit).
function drawArms(ctx, sim, w2s) {
  const b = sim.boss;
  const bx0 = w2s(b.x - THREATS.BOSS_W / 2);
  for (const g of b.arms) {
    // The per-arm posts: shoulder on the flank, the reach lane's tip height,
    // the coil and raise rests. The claw keeps the V1f geometry; the sickle
    // anchors HIGH and reaches into the AIR lane; the tendril anchors low
    // and sweeps the floor.
    let sx, sy, extY, coilX, coilY, raiseX, raiseY;
    if (g.id === 'sickle') {
      sx = bx0 + 18; sy = BAND.FLOOR_Y - THREATS.BOSS_H + 12;
      extY = BAND.FLOOR_Y - 92;                          // the AIR lane it alone contacts
      coilX = bx0 + 6; coilY = BAND.FLOOR_Y - THREATS.BOSS_H + 8;
      raiseX = bx0 + 2; raiseY = BAND.FLOOR_Y - THREATS.BOSS_H - 4;
    } else if (g.id === 'tendril') {
      sx = bx0 + 8; sy = BAND.FLOOR_Y - 40;
      extY = BAND.FLOOR_Y - 16;                          // the floor sweep
      coilX = bx0 + 4; coilY = BAND.FLOOR_Y - 34;
      raiseX = bx0 - 2; raiseY = BAND.FLOOR_Y - 64;
    } else {                                             // the claw (V1f geometry)
      sx = bx0 + 12; sy = BAND.FLOOR_Y - THREATS.BOSS_H + 34;
      extY = BAND.FLOOR_Y - 26;
      coilX = bx0 + 2; coilY = BAND.FLOOR_Y - 52;
      raiseX = bx0 - 4; raiseY = BAND.FLOOR_Y - THREATS.BOSS_H + 2;
    }
    const extX = w2s(b.x - g.reach);
    let cx, cy, open, hot;
    if (g.phase === 'windup') { cx = raiseX; cy = raiseY; open = true; hot = true; }
    else if (g.phase === 'extend') {
      const q = Math.min(1, g.t / g.extend);
      cx = raiseX + (extX - raiseX) * q; cy = raiseY + (extY - raiseY) * q; open = true; hot = true;
    } else if (g.phase === 'hold') { cx = extX; cy = extY; open = sim.grabbed == null; hot = true; }
    else if (g.phase === 'retract') {
      const q = 1 - Math.min(1, g.t / g.retract);
      cx = coilX + (extX - coilX) * q; cy = coilY + (extY - coilY) * q; open = false; hot = false;
    } else { cx = coilX; cy = coilY; open = false; hot = false; }
    cx = Math.round(cx); cy = Math.round(cy);
    // THE WIND-UP TELL: striped landing zone at the arm's OWN band. Ground
    // arms stripe the floor under their reach; the sickle shimmers its AIR
    // lane (the pilot is safe there on the floor — the tell TEACHES the lane).
    if (g.phase === 'windup') {
      const zl = w2s(b.x - g.reach - g.r), zr = w2s(b.x - g.reach + g.r);
      if (g.high) {
        ctx.fillStyle = rgba('#e06050', 0.12);
        ctx.fillRect(zl, BAND.FLOOR_Y - 110, zr - zl, 40);
        if (Math.floor(sim.t * 10) % 2) {
          ctx.fillStyle = C_TELEGRAPH;
          for (let x = Math.max(0, zl); x < Math.min(VIEW_W, zr); x += 10) ctx.fillRect(x, BAND.FLOOR_Y - 74, 6, 3);
        }
      } else {
        ctx.fillStyle = rgba('#e06050', 0.10);
        ctx.fillRect(zl, BAND.FLOOR_Y - 72, zr - zl, 72);
        if (Math.floor(sim.t * 10) % 2) {
          ctx.fillStyle = C_TELEGRAPH;
          for (let x = Math.max(0, zl); x < Math.min(VIEW_W, zr); x += 10) ctx.fillRect(x, BAND.FLOOR_Y - 4, 6, 4);
        }
      }
    }
    // THE ARM ITSELF — a distinct silhouette per id (owner: readable which
    // arm is which): the claw's thick hide chain + gripping fingers (V1f),
    // the sickle's rigid limb + curved STEEL blade, the tendril's thin whip
    // with an ember tip.
    const elbowX = Math.round((sx + cx) / 2 - 8), elbowY = Math.round((sy + cy) / 2 - 12);
    if (g.id === 'tendril') {
      // The whip: a 2px polyline that BOWS (sagging rope) between shoulder
      // and tip, with a curl at the elbow.
      const steps = Math.max(6, Math.round(Math.hypot(cx - sx, cy - sy) / 4));
      ctx.fillStyle = hot ? '#8a4a3a' : '#5c3a34';
      for (let i = 0; i <= steps; i++) {
        const q = i / steps;
        const sag = Math.sin(q * Math.PI) * 10;
        const x = Math.round(sx + (cx - sx) * q);
        const y = Math.round(sy + (cy - sy) * q + sag);
        ctx.fillRect(x - 1, y, 2, 2);
      }
      ctx.fillStyle = hot ? '#ffcf6a' : '#7a4a40';       // the ember tip
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
      if (hot) { ctx.fillStyle = '#ffd54a'; ctx.fillRect(cx - 1, cy - 5, 2, 3); }
    } else if (g.id === 'sickle') {
      // The rigid limb: two straight bone segments, then the curved blade —
      // a steel crescent that reads COLD against the horde's hot hide.
      const seg = (x1, y1, x2, y2, w2) => {
        const steps = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 5));
        for (let i = 0; i <= steps; i++) {
          const x = Math.round(x1 + (x2 - x1) * i / steps), y = Math.round(y1 + (y2 - y1) * i / steps);
          ctx.fillStyle = '#3c3440'; ctx.fillRect(x - w2, y - w2, w2 * 2, w2 * 2);
          ctx.fillStyle = '#5a5064'; ctx.fillRect(x - w2 + 1, y - w2 + 1, w2 * 2 - 2, w2 * 2 - 2);
        }
      };
      seg(sx, sy, elbowX, elbowY, 3);
      seg(elbowX, elbowY, cx + 6, cy - 4, 2);
      // The blade: a downward crescent off the wrist.
      ctx.fillStyle = '#c8ccd8';
      ctx.fillRect(cx - 2, cy - 8, 4, 10);
      ctx.fillRect(cx - 6, cy + 1, 4, 8);
      ctx.fillRect(cx - 9, cy + 7, 3, 6);
      ctx.fillStyle = hot ? '#ffffff' : '#8a8ea0';
      ctx.fillRect(cx - 2, cy - 8, 2, 10); ctx.fillRect(cx - 6, cy + 1, 2, 8); ctx.fillRect(cx - 9, cy + 7, 2, 6);
      if (g.phase === 'extend') {                        // the arc streak
        ctx.fillStyle = 'rgba(200,204,216,0.45)';
        ctx.fillRect(cx + 8, cy - 6, 14, 2);
        ctx.fillRect(cx + 12, cy - 12, 10, 2);
      }
    } else {
      // THE CLAW (V1f art, unchanged): hide chain + gripping fingers.
      const seg = (x1, y1, x2, y2) => {
        const steps = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 5));
        for (let i = 0; i <= steps; i++) {
          const x = Math.round(x1 + (x2 - x1) * i / steps), y = Math.round(y1 + (y2 - y1) * i / steps);
          ctx.fillStyle = '#4c2834'; ctx.fillRect(x - 3, y - 3, 6, 6);
          ctx.fillStyle = '#6e3844'; ctx.fillRect(x - 2, y - 2, 4, 4);
        }
      };
      seg(sx, sy, elbowX, elbowY);
      seg(elbowX, elbowY, cx, cy);
      if (g.phase === 'extend') {                        // the sweep streaks
        ctx.fillStyle = 'rgba(255,122,60,0.40)';
        ctx.fillRect(cx + 10, cy - 2, 12, 2);
        ctx.fillRect(cx + 14, cy - 9, 9, 2);
      }
      ctx.fillStyle = '#140f12'; ctx.fillRect(cx - 7, cy - 6, 14, 12);
      ctx.fillStyle = hot ? '#ff7a3c' : '#6e3844'; ctx.fillRect(cx - 5, cy - 4, 10, 8);
      const f = open ? 6 : 2;
      ctx.fillStyle = '#140f12';
      ctx.fillRect(cx - 8, cy - 9 - f, 3, 7 + f); ctx.fillRect(cx + 5, cy - 9 - f, 3, 7 + f);
      ctx.fillRect(cx - 8, cy + 3 + (open ? f - 2 : 1), 3, 5); ctx.fillRect(cx + 5, cy + 3 + (open ? f - 2 : 1), 3, 5);
      if (hot) {                                         // the gold glint (the eye follows it)
        ctx.fillStyle = '#ffd54a';
        ctx.fillRect(cx - 6, cy - 7, 2, 2); ctx.fillRect(cx + 4, cy - 7, 2, 2);
      }
    }
  }
}

// ---- VK9P4 the touch affordances (manual play on a phone). JUMP and KICK
// are MANUAL-ONLY (the auto path needs no buttons); MODE is for BOTH players
// (owner: "both players need a way of switching"). Real hit-testable rects,
// the SKIP_RECT precedent: right-thumb standard placement, translucent so the
// corridor stays readable underneath, clear of the HUD (top-left clock /
// pressure, top-right skip).
export const JUMP_RECT = { x: 398, y: 226, w: 74, h: 62 };   // the big right-thumb pad
export const KICK_RECT = { x: 316, y: 244, w: 72, h: 44 };   // left of JUMP, smaller
export const MODE_RECT = { x: 388, y: 40, w: 84, h: 22 };    // under SKIP, both players
function inRect(r, px, py) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
export function jumpHit(px, py) { return inRect(JUMP_RECT, px, py); }
export function kickHit(px, py) { return inRect(KICK_RECT, px, py); }
export function modeHit(px, py) { return inRect(MODE_RECT, px, py); }

export function draw(ctx, sim, opts = {}) {
  const p = sim.player;
  const camX = Math.max(0, p.x - CAM_LEAD);
  const w2s = (x) => Math.round(x - camX);          // world -> virtual screen x
  const { pal, act } = paletteFor(sim);             // the V1d act palette + its index

  drawSky(ctx, pal, act);
  drawParallax(ctx, camX, pal);

  // ---- terrain: only the spans on screen (integer pixels) -----------------
  for (const pl of sim.plats) {
    const x0 = w2s(pl.x), x1 = w2s(pl.x + pl.w);
    if (x1 < 0 || x0 > VIEW_W) continue;
    const top = Math.round(pl.y);
    ctx.fillStyle = C_PLAT;
    ctx.fillRect(x0, top, x1 - x0, BAND.KILL_Y - top);
    ctx.fillStyle = C_PLAT_UNDER;                       // the visible underside
    ctx.fillRect(x0, BAND.KILL_Y - 8, x1 - x0, 8);
    ctx.fillStyle = C_PLAT_TOP;                         // the lit standable edge
    ctx.fillRect(x0, top, x1 - x0, 3);
    // V1d material: static wear specks keyed on the platform's OWN coords
    // (hash32, never Math.random) — the masonry reads as aged, and the wear
    // is stable for a given corridor at any frame rate.
    ctx.fillStyle = '#2e2e44';
    const pid = hash32(Math.round(pl.x), Math.round(pl.y));
    const nSpecks = 2 + pid % 3;
    for (let s = 0; s < nSpecks; s++) {
      const sx = x0 + 6 + hash32(pid, s) % Math.max(1, (x1 - x0) - 12);
      const sy = top + 6 + hash32(pid, s + 40) % Math.max(1, BAND.KILL_Y - top - 16);
      ctx.fillRect(sx, sy, 2, 2);
    }
    // The lip: a 2px bright edge on BOTH sides of every gap — the no-blind-
    // drops rule. A runner can always see the hole ahead (acceptance #9).
    ctx.fillStyle = '#8a8ab0';
    ctx.fillRect(x0, top, 2, 8);
    ctx.fillRect(x1 - 2, top, 2, 8);
  }
  drawPits(ctx, sim, w2s, pal);
  // Destroyed terrain scars (the boss's wake — the pressure story, visible).
  ctx.fillStyle = '#221218';
  for (const pl of sim.destroyedPlats) {
    const x0 = w2s(pl.x), x1 = w2s(pl.x + pl.w);
    if (x1 < 0 || x0 > VIEW_W) continue;
    ctx.fillRect(x0, Math.round(pl.y), x1 - x0, 4);
  }

  // ---- the exit portal: the game's OWN portal art (4-frame loop, reused),
  // a light column and a pulsing shimmer — unmistakably the destination. -----
  const bx = w2s(sim.corridor.portalX);
  if (bx > -80 && bx < VIEW_W + 80) {
    const pulse = 0.5 + 0.5 * Math.sin(sim.t * 3.2);
    // The EMISSIVE POLE AHEAD (owner: portal + horde edge are the two
    // brightest things on screen) — a wide breathing halo, LOOK.PORTAL_HALO.
    ctx.fillStyle = rgba(LOOK.PORTAL_HALO, 0.045 + 0.035 * pulse);
    ctx.fillRect(bx - 26, 0, 52, BAND.FLOOR_Y);
    ctx.fillStyle = rgba(LOOK.PORTAL_HALO, 0.07 + 0.06 * pulse);
    ctx.fillRect(bx - 14, 0, 28, BAND.FLOOR_Y);
    ctx.fillStyle = rgba(LOOK.PORTAL_HALO, 0.12 + 0.08 * pulse);
    ctx.fillRect(bx - 6, 0, 12, BAND.FLOOR_Y);
    // The pillar beacon stays (legible from 330px out — acceptance #9).
    ctx.fillStyle = C_BEACON;
    ctx.fillRect(bx - 2, BAND.FLOOR_Y - EXIT.BEACON_H, 4, EXIT.BEACON_H);
    ctx.fillRect(bx - 8, BAND.FLOOR_Y - EXIT.BEACON_H, 16, 6);
    // The gate itself, at the floor.
    const fr = portalFrame(Math.floor(sim.t * 6));
    drawGridScaled(ctx, fr, PORTAL_ART.palette, bx - PORTAL_ART.w, BAND.FLOOR_Y - PORTAL_ART.h * 2, 2);
    // Shimmer bars drifting up the column (integer rows).
    for (let k = 0; k < 3; k++) {
      const yy = (BAND.FLOOR_Y - ((sim.t * 26 + k * 44) % 132)) | 0;
      ctx.fillStyle = 'rgba(158,255,224,0.30)';
      ctx.fillRect(bx - 9, yy, 18, 1);
    }
  }

  // ---- the boss (V1f): REAL ART, out in the open, plus the GRAB ARM ---------
  // The "box" is gone and named: it was (a) the plain fillRect slab body and
  // (b) the platform terrain's solid columns running top->KILL_Y, which
  // engulfed the body under the V1e overpass. The body is now the BOSS_ART
  // colossus (29x30 at 3x) standing ON the floor in open sky, and the one
  // threat is the telegraphed claw (drawGrabArm below).
  if (sim.boss) {
    const b = sim.boss;
    const bx0 = w2s(b.x - THREATS.BOSS_W / 2);
    if (bx0 < VIEW_W + 120) {
      const bob = Math.floor(sim.t * 2) % 2;         // the idle sway (1px beat)
      const px = 3;
      const gw = BOSS_ART.w * px, gh = BOSS_ART.h * px;
      const gx = Math.round(bx0 + THREATS.BOSS_W / 2 - gw / 2);
      const gy = BAND.FLOOR_Y - gh + bob;
      drawGridScaled(ctx, BOSS_ART.frames[0], BOSS_ART.palette, gx, gy, px);
      // The molten crest pulse (the horde's front rank): a breathing rim on
      // the sprite's crest and flanks, pure sim.t.
      const bPulse = 0.5 + 0.5 * Math.sin(sim.t * 5.0);
      ctx.fillStyle = rgba(LOOK.HORDE_EDGE, 0.28 + 0.22 * bPulse);
      ctx.fillRect(gx, gy, gw, 2);
      ctx.fillRect(gx, gy, 2, gh);
      ctx.fillRect(gx + gw - 2, gy, 2, gh);
      drawArms(ctx, sim, w2s);
      // TELEGRAPH (terrain destruction, retained): a striped bar over the
      // platform it is about to tear out — never subtle, always behind the runner.
      if (b.telegraph > 0 && b.target) {
        const tx0 = w2s(b.target.x), tx1 = w2s(b.target.x + b.target.w);
        ctx.fillStyle = C_TELEGRAPH;
        for (let x = Math.max(0, tx0); x < Math.min(VIEW_W, tx1); x += 12) {
          ctx.fillRect(x, b.target.y - 10, 6, 4);
        }
      }
    }
  }

  // ---- threats: SPRITES now, 2-frame loops off sim time / phase ------------
  // V1d OWNER SPEC UPDATE: the chaser's READABLE state is the sim's own
  // charge/matched machine (the first-cut tell/lunge fields are gone). A
  // CHARGING body uses the lunge-posture art at a fast cadence with motion
  // streaks (the sprint IN); a MATCHED body runs the calm stride and, for the
  // first MATCH_TELL seconds of the settle, flashes gold — the readable
  // "it is on your tail and it is NOT catching" tell. All keyed off sim state
  // and sim.t: pure, parity-safe.
  const puFrame = Math.floor(sim.t * 10) % 4;
  for (const pu of sim.pursuers) {
    const x = w2s(pu.x);
    if (x < -14 || x > VIEW_W + 14) continue;
    const bob = (Math.floor(sim.t * 10) % 2) ? 0 : 1;    // the sprint beat
    const matched = pu.state === 'matched';
    const set = matched ? PURSUER_RUN_4 : PURSUER_LUNGE_4;
    const fr = matched ? puFrame : Math.floor(sim.t * 14) % 4;
    drawGridScaled(ctx, set[fr].rows, set[fr].palette,
      x - 6, Math.round(pu.y) - 14 + bob, 1);
    if (!matched) {
      // The charge read: hard sprint streaks trailing the body.
      ctx.fillStyle = 'rgba(255,213,74,0.45)';
      ctx.fillRect(x - 16, Math.round(pu.y) - 10 + bob, 9, 1);
      ctx.fillRect(x - 13, Math.round(pu.y) - 6 + bob, 7, 1);
      ctx.fillRect(x - 18, Math.round(pu.y) - 2 + bob, 11, 1);
    } else if ((pu.matchT || 0) < THREATS.MATCH_TELL && Math.floor(sim.t * 10) % 2) {
      // The settle read: a gold flash for the first beat of the hang.
      ctx.fillStyle = '#ffd54a';
      ctx.fillRect(x - 7, Math.round(pu.y) - 15 + bob, 1, 14);
      ctx.fillRect(x + 6, Math.round(pu.y) - 15 + bob, 1, 14);
      ctx.fillRect(x - 7, Math.round(pu.y) - 15 + bob, 14, 1);
      ctx.fillRect(x - 7, Math.round(pu.y) - 2 + bob, 14, 1);
    }
  }
  for (const fl of sim.fliers) {
    const x = w2s(fl.x);
    if (x < -18 || x > VIEW_W + 18) continue;
    const frame = Math.floor(fl.phase * 2) % 4;          // flap locks to the dive phase
    drawGridScaled(ctx, FLIER_4[frame].rows, FLIER_4[frame].palette, x - 8, Math.round(fl.y) - 6, 1);
    // The dive streak: when the sine is DESCENDING on screen (dy/dt > 0) the
    // flier is attacking downward — trail it so the dive reads as aggression.
    if (Math.cos(fl.phase) > 0) {
      ctx.fillStyle = 'rgba(128,96,192,0.5)';
      ctx.fillRect(x + 7, Math.round(fl.y) - 9, 6, 1);
      ctx.fillRect(x + 11, Math.round(fl.y) - 13, 5, 1);
    }
  }
  ctx.fillStyle = C_SHOT;
  for (const s of sim.shots) {
    const x = w2s(s.x);
    if (x < -12 || x > VIEW_W + 12) continue;
    ctx.fillRect(x - 2, Math.round(s.y) - 2, 5, 3);
  }

  // ---- V1b fx: the pit-fall (drop arc, tumbling) and the shot-kill (burst) -
  for (const e of effectsFor(sim)) {
    const sx = w2s(e.x);
    if (e.kind === 'fall') {
      ctx.globalAlpha = Math.max(0, 1 - e.age / e.life);
      const ff = Math.floor(sim.t * 14 + e.n) % 4;
      drawGridScaled(ctx, PURSUER_RUN_4[ff].rows,
        PURSUER_RUN_4[ff].palette, sx - 6, Math.round(e.y) - 14, 1);
      ctx.globalAlpha = 1;
      if (e.age < 0.18) {                                 // dust at the lip
        ctx.fillStyle = '#6a6a8a';
        ctx.fillRect(sx - 5, Math.round(e.y) - 4, 3, 2);
        ctx.fillRect(sx + 3, Math.round(e.y) - 3, 3, 2);
      }
    } else if (e.kind === 'burst') {
      ctx.fillStyle = '#ffd54a';
      for (let k = 0; k < 6; k++) {
        const ang = (k * Math.PI) / 3 + (e.n % 2) * 0.3;
        ctx.fillRect(Math.round(sx + Math.cos(ang) * e.r), Math.round(e.y + Math.sin(ang) * e.r * 0.7), 2, 2);
      }
    }
  }

  // ---- the horde wall (the real timer, always visible when in range) -------
  drawWall(ctx, sim, w2s, pal);

  // ---- the runner: the PILOT sprite (12x17, silhouette-first — outline,
  // 3-tone ramp, ONE teal visor accent; run x4 / tuck / dash postures) --------
  const px = w2s(p.x), py = Math.round(p.y);
  {
    const art = !p.onGround ? PILOT_JUMP_ART.frames[0]
      : p.dashT > 0 ? PILOT_DASH_ART.frames[0]
        : (Math.abs(p.vx) > 1 ? PILOT_ART.frames[Math.floor(sim.t * 10) % 4] : PILOT_ART.frames[1]);
    let jx = 0;
    if (sim.grabbed && Math.floor(sim.t * 14) % 2) jx = 1;   // the struggle beat while HELD
    drawGridScaled(ctx, art, PILOT_ART.palette, px - 6 + jx, py - 17, 1);
    if (sim.grabbed) {
      // Contact reads as CONTACT: the closed claw's fingers close OVER the
      // held pilot (drawn here, after the pilot, so the grip is on top).
      ctx.fillStyle = '#140f12';
      ctx.fillRect(px - 8, py - 14, 3, 9); ctx.fillRect(px + 5, py - 14, 3, 9);
      ctx.fillStyle = '#ff7a3c';
      ctx.fillRect(px - 7, py - 16, 14, 3);
    }
  }

  // ---- readouts (integer pixel text, no anti-aliased floats) ---------------
  ctx.fillStyle = C_TEXT;
  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  const secs = Math.floor(sim.t);
  ctx.fillText('ESCAPE ' + String(Math.floor(secs / 60)).padStart(2, '0') + ':' +
    String(secs % 60).padStart(2, '0'), 8, 8);
  // HORDE PRESSURE (replaces the radar side-on): a bar that drains as the wall
  // closes, coloured by how bad it is — the approach is legible at a glance.
  const pr = pressure(sim);
  ctx.fillText('HORDE PRESSURE ' + Math.round(pr) + 'px', 8, 22);
  const barW = 90, fill = Math.max(0, Math.min(1, pr / 220)) * barW;
  ctx.fillStyle = '#26263a';
  ctx.fillRect(8, 34, barW, 5);
  ctx.fillStyle = pr > 120 ? '#60e0c0' : pr > 50 ? '#ffd54a' : '#e06050';
  ctx.fillRect(8, 34, Math.round(fill), 5);

  // ---- VK9P4 the tail-clear tell: while the kick's suppression window runs
  // the HUD says so (the manual player sees WHAT they bought and for how long).
  if (sim.tailT > 0) {
    ctx.fillStyle = '#80d0a0';
    ctx.fillText('TAIL CLEAR ' + sim.tailT.toFixed(1) + 's', 8, 44);
  }

  // ---- VK9P4 the touch affordances: JUMP/KICK manual-only, MODE both ------
  const btn = (r, label, dim) => {
    ctx.fillStyle = dim ? 'rgba(24,24,38,0.45)' : 'rgba(24,24,38,0.66)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = dim ? '#3a3a52' : '#5a5a7e';
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.fillStyle = dim ? '#6a6a88' : C_TEXT;
    ctx.font = '10px monospace';
    ctx.fillText(label, r.x + Math.round((r.w - label.length * 6) / 2), r.y + Math.round(r.h / 2) - 5);
  };
  if (opts.manual) {
    btn(JUMP_RECT, 'JUMP', false);
    btn(KICK_RECT, 'KICK', sim.kickCd > 0);   // dimmed while the cooldown runs
  }
  btn(MODE_RECT, opts.manual ? 'MODE·AUTO' : 'MODE·MANUAL', false);

  // ---- the skip affordance (frame one, every frame) ------------------------
  ctx.fillStyle = '#26263a';
  ctx.fillRect(SKIP_RECT.x, SKIP_RECT.y, SKIP_RECT.w, SKIP_RECT.h);
  ctx.strokeStyle = '#4a4a66';
  ctx.strokeRect(SKIP_RECT.x + 0.5, SKIP_RECT.y + 0.5, SKIP_RECT.w - 1, SKIP_RECT.h - 1);
  ctx.fillStyle = opts.paidSkip ? '#80d0a0' : C_TEXT;
  ctx.fillText(opts.paidSkip ? 'SKIP +PAY' : 'SKIP', SKIP_RECT.x + 22, SKIP_RECT.y + 8);

  // ---- the outcome card (the soft-fail story: no death screen) -------------
  if (sim.outcome) {
    ctx.fillStyle = 'rgba(14,14,22,0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = C_TEXT;
    ctx.font = '16px monospace';
    const line = sim.outcome === 'complete' ? 'ESCAPED'
      : sim.outcome === 'caught' ? 'CAUGHT — no payout, run continues'
        : sim.outcome === 'fell' ? 'FELL — no payout, run continues'
          : 'SKIPPED';
    ctx.fillText(line, Math.round((VIEW_W - line.length * 9) / 2), 132);
    ctx.font = '10px monospace';
    const sub = opts.outcomeSub || '';
    if (sub) ctx.fillText(sub, Math.round((VIEW_W - sub.length * 6) / 2), 156);
  }
}
