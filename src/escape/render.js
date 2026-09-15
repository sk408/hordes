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
import { VIEW_W, VIEW_H, BAND, THREATS, EXIT } from './config.js';
import { pressure } from './sim.js';
import { effectsFor } from './fx.js';
import { PURSUER_ART, FLIER_ART } from './sprites.js';
import { PORTAL_ART, portalFrame } from '../art/index.js';

// Palette (matches the game's dark field art).
const C_BG = '#0e0e16';
const C_PLAT = '#3a3a52';
const C_PLAT_TOP = '#5a5a7e';
const C_PLAT_UNDER = '#2c2c40';
const C_WALL = '#7a2430';
const C_WALL_EDGE = '#b04050';
const C_PLAYER = '#e8e8f0';
const C_SHOT = '#f0d060';
const C_BOSS = '#904858';
const C_TELEGRAPH = '#e06050';
const C_BEACON = '#60e0c0';
const C_TEXT = '#b8b8cc';
// V1b environment: two parallax bands, the pit depth, the horde mass tones.
const C_FAR = '#14142a';
const C_NEAR = '#1c1c34';
const C_WALL_BODY_A = '#8e2c3a';
const C_WALL_BODY_B = '#5e1a24';

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

// ---- the parallax: a far ridge and nearer ruins scrolling at fractions of
// the camera x. Only ~36 fillRects total — this runs on a phone.
function drawParallax(ctx, camX) {
  // Far band (0.3x): spires on a ridge line, y baseline 210.
  const offF = Math.round(camX * 0.3);
  const baseF = 210;
  ctx.fillStyle = C_FAR;
  ctx.fillRect(0, baseF, VIEW_W, 62);
  for (let i = -1; i < VIEW_W / 24 + 1; i++) {
    const col = i + Math.floor(offF / 24);
    const x = col * 24 - offF;
    const h = 24 + hash32(col, 11) % 58;
    ctx.fillRect(x, baseF - h, 22, h);
    if (hash32(col, 12) % 3 === 0) ctx.fillRect(x + 8, baseF - h - 6, 5, 6);   // spire tip
  }
  // Near band (0.55x): broken walls / rubble, y baseline 240.
  const offN = Math.round(camX * 0.55);
  const baseN = 240;
  ctx.fillStyle = C_NEAR;
  ctx.fillRect(0, baseN, VIEW_W, 34);
  for (let i = -1; i < VIEW_W / 40 + 1; i++) {
    const col = i + Math.floor(offN / 40);
    const x = col * 40 - offN;
    const h = 14 + hash32(col, 21) % 38;
    ctx.fillRect(x, baseN - h, 34, h);
    if (hash32(col, 22) % 4 === 0) ctx.fillRect(x + 12, baseN - h - 5, 8, 5);  // broken coping
  }
}

// ---- the pits: a gap in the floor must read as a lethal VOID, not missing
// geometry. Floor-level gap spans get a darkening depth and a lip glow; the
// parallax bands stay faintly visible through the hole (they are drawn behind
// the terrain, the hole simply does not cover them).
function drawPits(ctx, sim, w2s) {
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
    // The lip GLOWS on both sides (the no-blind-drops rule, lit).
    ctx.fillStyle = '#a8a8d0';
    ctx.fillRect(a, BAND.FLOOR_Y, 2, 9);
    ctx.fillRect(b - 2, BAND.FLOOR_Y, 2, 9);
  }
}

// ---- the horde wall as a MASS: a base slab, a ragged full-height leading
// edge, churning bodies with glinting eyes, and dust kicked ahead of it.
function drawWall(ctx, sim, w2s) {
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
    ctx.fillStyle = C_WALL_EDGE;
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
  // Dust kicked AHEAD of the edge (the pressure arrives before the wall does).
  const dustTick = Math.floor(sim.t * 12);
  for (let i = 0; i < 14; i++) {
    const x = wEdge + 3 + hash32(i, dustTick) % 15;
    if (x >= VIEW_W) continue;
    const y = hash32(i * 5 + 2, dustTick) % VIEW_H;
    ctx.fillStyle = 'rgba(176,64,80,0.45)';
    ctx.fillRect(x, y, 2, 2);
  }
}

export function draw(ctx, sim, opts = {}) {
  const p = sim.player;
  const camX = Math.max(0, p.x - CAM_LEAD);
  const w2s = (x) => Math.round(x - camX);          // world -> virtual screen x

  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawParallax(ctx, camX);

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
    // The lip: a 2px bright edge on BOTH sides of every gap — the no-blind-
    // drops rule. A runner can always see the hole ahead (acceptance #9).
    ctx.fillStyle = '#8a8ab0';
    ctx.fillRect(x0, top, 2, 8);
    ctx.fillRect(x1 - 2, top, 2, 8);
  }
  drawPits(ctx, sim, w2s);
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
    ctx.fillStyle = 'rgba(96,224,192,' + (0.07 + 0.06 * pulse).toFixed(3) + ')';
    ctx.fillRect(bx - 14, 0, 28, BAND.FLOOR_Y);
    ctx.fillStyle = 'rgba(96,224,192,' + (0.12 + 0.08 * pulse).toFixed(3) + ')';
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

  // ---- the boss body + its telegraph ---------------------------------------
  if (sim.boss) {
    const b = sim.boss;
    const bx0 = w2s(b.x - THREATS.BOSS_W / 2);
    if (bx0 < VIEW_W + 60) {
      ctx.fillStyle = C_BOSS;
      ctx.fillRect(bx0, BAND.FLOOR_Y - THREATS.BOSS_H, THREATS.BOSS_W, THREATS.BOSS_H);
      ctx.fillStyle = '#583040';
      ctx.fillRect(bx0, BAND.FLOOR_Y - THREATS.BOSS_H, THREATS.BOSS_W, 6);
      ctx.fillStyle = '#6e3844';                          // hide plates (mass, not slab)
      for (let y = BAND.FLOOR_Y - THREATS.BOSS_H + 16; y < BAND.FLOOR_Y - 8; y += 18) {
        for (let x = bx0 + 8; x < bx0 + THREATS.BOSS_W - 10; x += 16) {
          ctx.fillRect(x, y, 10, 8);
        }
      }
      // TELEGRAPH: a striped bar over the platform it is about to tear out —
      // never subtle, always ahead of the runner's current x.
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
  const puFrame = Math.floor(sim.t * 10) % 2;
  for (const pu of sim.pursuers) {
    const x = w2s(pu.x);
    if (x < -14 || x > VIEW_W + 14) continue;
    const bob = (Math.floor(sim.t * 10) % 2) ? 0 : 1;    // the sprint beat
    drawGridScaled(ctx, PURSUER_ART.frames[puFrame], PURSUER_ART.palette,
      x - 6, Math.round(pu.y) - 14 + bob, 1);
  }
  for (const fl of sim.fliers) {
    const x = w2s(fl.x);
    if (x < -18 || x > VIEW_W + 18) continue;
    const frame = Math.floor(fl.phase * 2) % 2;          // flap locks to the dive phase
    drawGridScaled(ctx, FLIER_ART.frames[frame], FLIER_ART.palette, x - 8, Math.round(fl.y) - 6, 1);
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
      drawGridScaled(ctx, PURSUER_ART.frames[Math.floor(sim.t * 14 + e.n) % 2],
        PURSUER_ART.palette, sx - 6, Math.round(e.y) - 14, 1);
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
  drawWall(ctx, sim, w2s);

  // ---- the runner (side-view: a lithe 8x14 block with a face direction) ----
  const px = w2s(p.x), py = Math.round(p.y);
  ctx.fillStyle = C_PLAYER;
  ctx.fillRect(px - 4, py - 14, 8, 14);
  ctx.fillStyle = '#9a9ac2';                              // a face-direction visor
  ctx.fillRect(px - 4 + (p.dir > 0 ? 4 : 0), py - 12, 4, 2);
  if (p.dashT > 0) {                                    // the dash tell
    ctx.fillStyle = '#9090c0';
    ctx.fillRect(px - 4 - 8 * p.dir, py - 10, 8, 6);
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
