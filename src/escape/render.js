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
import { PURSUER_ART, PURSUER_LUNGE_ART, FLIER_ART } from './sprites.js';
import { PORTAL_ART, portalFrame } from '../art/index.js';

// Palette (matches the game's dark field art).
const C_PLAT = '#3a3a52';
const C_PLAT_TOP = '#5a5a7e';
const C_PLAT_UNDER = '#2c2c40';
const C_WALL = '#7a2430';
const C_PLAYER = '#e8e8f0';
const C_SHOT = '#f0d060';
const C_BOSS = '#904858';
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
  return LOOK.PALETTES[i];
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

// ---- V1d the SKY: a banded gradient (skyTop -> skyBottom) with a lit horizon
// line — integer-height bands, the pixel-movie way to say "gradient" without a
// single sub-pixel edge. 10 fillRects, static per act (the palette does the
// travelling; the sky itself never animates, so there is nothing to desync).
function drawSky(ctx, pal) {
  const BANDS = 10;
  for (let i = 0; i < BANDS; i++) {
    ctx.fillStyle = mix(pal.skyTop, pal.skyBottom, i / (BANDS - 1));
    ctx.fillRect(0, i * 21, VIEW_W, 21);
  }
  // The lit horizon: the far band's baseline (y=210) carries a horizon glow.
  ctx.fillStyle = rgba(pal.horizon, 0.55);
  ctx.fillRect(0, 209, VIEW_W, 2);
}

// ---- the parallax: a far ridge and nearer ruins scrolling at fractions of
// the camera x, in the ACT's OWN band colours with a lit top rim on every
// silhouette. Only ~36 fillRects total — this runs on a phone.
function drawParallax(ctx, camX, pal) {
  const rimF = mix(pal.far, '#ffffff', 0.20);
  const rimN = mix(pal.near, '#ffffff', 0.24);
  // Far band (0.3x): spires on a ridge line, y baseline 210.
  const offF = Math.round(camX * 0.3);
  const baseF = 210;
  ctx.fillStyle = pal.far;
  ctx.fillRect(0, baseF, VIEW_W, 62);
  for (let i = -1; i < VIEW_W / 24 + 1; i++) {
    const col = i + Math.floor(offF / 24);
    const x = col * 24 - offF;
    const h = 24 + hash32(col, 11) % 58;
    ctx.fillStyle = pal.far;
    ctx.fillRect(x, baseF - h, 22, h);
    ctx.fillStyle = rimF;
    ctx.fillRect(x, baseF - h, 22, 1);                       // the lit crest
    if (hash32(col, 12) % 3 === 0) {
      ctx.fillStyle = pal.far;
      ctx.fillRect(x + 8, baseF - h - 6, 5, 6);              // spire tip
      ctx.fillStyle = rimF;
      ctx.fillRect(x + 8, baseF - h - 6, 5, 1);
    }
  }
  // Near band (0.55x): broken walls / rubble, y baseline 240.
  const offN = Math.round(camX * 0.55);
  const baseN = 240;
  ctx.fillStyle = pal.near;
  ctx.fillRect(0, baseN, VIEW_W, 34);
  for (let i = -1; i < VIEW_W / 40 + 1; i++) {
    const col = i + Math.floor(offN / 40);
    const x = col * 40 - offN;
    const h = 14 + hash32(col, 21) % 38;
    ctx.fillStyle = pal.near;
    ctx.fillRect(x, baseN - h, 34, h);
    ctx.fillStyle = rimN;
    ctx.fillRect(x, baseN - h, 34, 1);                       // the broken coping's light
    if (hash32(col, 22) % 4 === 0) {
      ctx.fillStyle = pal.near;
      ctx.fillRect(x + 12, baseN - h - 5, 8, 5);
      ctx.fillStyle = rimN;
      ctx.fillRect(x + 12, baseN - h - 5, 8, 1);
    }
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

export function draw(ctx, sim, opts = {}) {
  const p = sim.player;
  const camX = Math.max(0, p.x - CAM_LEAD);
  const w2s = (x) => Math.round(x - camX);          // world -> virtual screen x
  const pal = paletteFor(sim);                      // the V1d act palette

  drawSky(ctx, pal);
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
      // V1e PRESENCE (brief: "it should be the loudest thing on screen at
      // that moment"): a hot PULSING rim on the body's crest and flanks in
      // the horde's own molten colour, and a pair of gold eyes — the boss
      // reads as the horde's front rank, not a slab. Pure sim.t animation.
      const bPulse = 0.5 + 0.5 * Math.sin(sim.t * 5.0);
      ctx.fillStyle = rgba(LOOK.HORDE_EDGE, 0.35 + 0.3 * bPulse);
      ctx.fillRect(bx0, BAND.FLOOR_Y - THREATS.BOSS_H, THREATS.BOSS_W, 2);
      ctx.fillRect(bx0, BAND.FLOOR_Y - THREATS.BOSS_H, 2, THREATS.BOSS_H);
      ctx.fillRect(bx0 + THREATS.BOSS_W - 2, BAND.FLOOR_Y - THREATS.BOSS_H, 2, THREATS.BOSS_H);
      if (Math.floor(sim.t * 3) % 2) {                    // the slow blink
        ctx.fillStyle = '#ffd54a';
        const ey = BAND.FLOOR_Y - THREATS.BOSS_H + 12;
        ctx.fillRect(bx0 + 14, ey, 7, 3);
        ctx.fillRect(bx0 + THREATS.BOSS_W - 21, ey, 7, 3);
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
  // V1d OWNER SPEC UPDATE: the chaser's READABLE state is the sim's own
  // charge/matched machine (the first-cut tell/lunge fields are gone). A
  // CHARGING body uses the lunge-posture art at a fast cadence with motion
  // streaks (the sprint IN); a MATCHED body runs the calm stride and, for the
  // first MATCH_TELL seconds of the settle, flashes gold — the readable
  // "it is on your tail and it is NOT catching" tell. All keyed off sim state
  // and sim.t: pure, parity-safe.
  const puFrame = Math.floor(sim.t * 10) % 2;
  for (const pu of sim.pursuers) {
    const x = w2s(pu.x);
    if (x < -14 || x > VIEW_W + 14) continue;
    const bob = (Math.floor(sim.t * 10) % 2) ? 0 : 1;    // the sprint beat
    const matched = pu.state === 'matched';
    const art = matched ? PURSUER_ART : PURSUER_LUNGE_ART;
    const fr = matched ? puFrame : Math.floor(sim.t * 14) % 2;
    drawGridScaled(ctx, art.frames[fr], art.palette,
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
  drawWall(ctx, sim, w2s, pal);

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
