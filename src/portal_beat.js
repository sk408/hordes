// HORDES - the portal beat (R2). The portal movie is no longer a scene of its
// own: it is 2.5 seconds on the real battlefield, right where the wave's boss
// fell. The game keeps running under it (the sweep, the loot, the pilot's own
// walk to the portal, the portal's invulnerability); this module only draws
// the film on top: bars, the boss collapsing where it stood, the portal
// opening on that spot, and the pull as the pilot walks in.
//
// Pure: render(g, t, o) is a function of the time and the positions it is
// handed. No clock, no Math.random, no DOM. Drawn in the 480x300 view.
//
//   t   seconds since the beat began (main.js counts it on play time only,
//       so a draft that opens during the beat pauses it).
//   o   { boss: bossLook(id), bx, by: the death spot on screen,
//         px, py: the portal on screen (or null before it opens),
//         hx, hy: the pilot on screen, zoom, entering, reduced, repeat }
import { blitGrid, actorStyle, STYLE_PLAIN } from './sprite_cache.js';
import { BOSS_SPRITES } from './bosses.js';

const W = 480, H = 300;
export const BAR = 16;             // the film bars, top and bottom
export const DURATION = 2.5;       // seconds, first viewing and repeat alike
// KILL: the boss dies in slow time. OPEN: the portal opens where it fell.
// WALK: the pilot walks in.
export const PHASES = { KILL: [0, 0.9], OPEN: [0.9, 1.6], WALK: [1.6, 2.5] };
// How long the sim runs in slow time at the start (real seconds).
export const SLOW_S = PHASES.KILL[1];

// The beat has no held moments, so a repeat viewing is the same 2.5 s.
export function durationOf() { return DURATION; }
export function isDone(t) { return t >= DURATION; }
export function phaseAt(t) {
  if (t < PHASES.OPEN[0]) return 'KILL';
  if (t < PHASES.WALK[0]) return 'OPEN';
  if (t < DURATION) return 'WALK';
  return 'END';
}

// The caption on the top bar: who fell.
export function captionOf(o) {
  const name = o && o.boss && o.boss.name ? String(o.boss.name).toUpperCase() : 'THE BOSS';
  return name + ' FALLS';
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (u) => { const v = clamp01(u); return v * v * (3 - 2 * v); };

// How far the bars are in (0..1): slide in over 0.25 s, out over the last 0.3 s.
export function barsAt(t, reduced = false) {
  if (reduced) return t < DURATION ? 1 : 0;
  return Math.min(ease(span(t, 0, 0.25)), 1 - ease(span(t, DURATION - 0.3, DURATION)));
}

// Colours (decision 5): red-orange is danger, cyan-teal is reward, warm white
// is the hero.
const TEAL = '#3fe6d2', TEAL_DIM = '#1f8f86', WARM = '#fff1d6', DANGER = '#ff6a3a';
const BAR_COL = '#06060b';

// The boss as it collapses: a flash, then it sinks into the ground.
// Returns { squash, alpha, flash } at time t, or null once it is gone.
export function bossCollapseAt(t) {
  const end = PHASES.KILL[1];
  if (t >= end) return null;
  const u = span(t, 0.1, end);
  return { squash: 1 - 0.85 * ease(u), alpha: 1 - ease(span(t, 0.45, end)), flash: t < 0.12 };
}

function drawBoss(g, o, t) {
  const c = bossCollapseAt(t);
  const spr = o.boss && BOSS_SPRITES[o.boss.id];
  if (!c || !spr || !(c.alpha > 0)) return;
  const Z = o.zoom || 1;
  const frame = spr.frames[0];
  const feet = o.by + (spr.box.h - spr.anchor.y) * Z;
  g.save();
  g.globalAlpha = c.alpha;
  g.translate(Math.round(o.bx), Math.round(feet));
  g.scale(Z, Z * c.squash);
  blitGrid(g, frame, spr.palette, -spr.anchor.x, -spr.box.h,
    c.flash ? actorStyle(true, false, null, false, false) : (spr.rim ? actorStyle(false, false, spr.rim, false, false) : STYLE_PLAIN), 1);   // bossdark: its rim
  g.restore();
  g.globalAlpha = 1;
  // Dust kicked out to both sides as it goes down, in its own danger colour.
  const k = span(t, 0.15, 0.85);
  if (k > 0 && k < 1) {
    g.globalAlpha = 0.8 * (1 - k);
    g.fillStyle = DANGER;
    const r = (8 + 26 * k) * Z;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const dx = side * r * (0.6 + 0.15 * (i >> 1));
      const dy = -Math.sin(k * Math.PI) * (4 + 3 * (i >> 1)) * Z;
      g.fillRect(Math.round(o.bx + dx) - 1, Math.round(feet + dy) - 1, 3, 3);
    }
    g.globalAlpha = 1;
  }
}

// The portal opening: a ring of light that grows out of the spot, and a
// column of light standing on it.
function drawOpen(g, o, t) {
  if (o.px == null) return;
  const u = span(t, PHASES.OPEN[0], PHASES.OPEN[0] + 0.6);
  if (u <= 0) return;
  const Z = o.zoom || 1;
  const x = Math.round(o.px), y = Math.round(o.py);
  if (u < 1) {
    const r = Math.round((6 + 46 * ease(u)) * Z);
    g.globalAlpha = 1 - u;
    g.fillStyle = TEAL;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      g.fillRect(Math.round(x + Math.cos(a) * r) - 1, Math.round(y + Math.sin(a) * r * 0.6) - 1, 3, 3);
    }
  }
  // The column: tall at the opening, thinning out through the walk.
  const col = 1 - span(t, PHASES.OPEN[0] + 0.2, DURATION);
  if (col > 0) {
    const w = Math.max(2, Math.round(10 * col * Z));
    g.globalAlpha = 0.35 * col;
    g.fillStyle = TEAL;
    g.fillRect(x - (w >> 1), BAR, w, y - BAR);
    g.globalAlpha = 0.6 * col;
    g.fillStyle = WARM;
    g.fillRect(x - 1, BAR, 2, y - BAR);
  }
  g.globalAlpha = 1;
}

// The walk in: once the pilot steps into the portal, warm motes are drawn in
// from around the pilot to the portal's heart.
function drawWalkIn(g, o, t) {
  if (!o.entering || o.px == null || o.hx == null) return;
  const Z = o.zoom || 1;
  for (let i = 0; i < 10; i++) {
    const u = ((t * 2.2 + i / 10) % 1);
    const a = i * 2.39996;
    const r = (22 * (1 - u)) * Z;
    const x = o.px + Math.cos(a) * r, y = o.py + Math.sin(a) * r * 0.7;
    g.globalAlpha = 0.9 * u;
    g.fillStyle = i % 3 ? WARM : TEAL;
    g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  }
  g.globalAlpha = 1;
}

// Dark edges that pull the eye to the spot.
function drawVignette(g, k) {
  if (k <= 0) return;
  g.fillStyle = '#05050a';
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = 0.12 * k;
    const m = i * 4;
    g.fillRect(0, 0, m + 4, H); g.fillRect(W - m - 4, 0, m + 4, H);
  }
  g.globalAlpha = 1;
}

function drawBars(g, k, o) {
  if (k <= 0) return;
  const h = Math.round(BAR * k);
  g.fillStyle = BAR_COL;
  g.fillRect(0, 0, W, h);
  g.fillRect(0, H - h, W, h);
  if (k < 0.99) return;
  g.font = 'bold 9px monospace';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = WARM;
  g.fillText(captionOf(o), 8, BAR / 2 + 0.5);
  g.fillStyle = TEAL;
  g.textAlign = 'center';
  g.fillText('THE PORTAL OPENS', W / 2, H - BAR / 2 + 0.5);
  g.textAlign = 'left';
}

// One frame of the beat over the live battlefield.
export function render(g, t, o = {}) {
  if (!g || !(t >= 0) || t >= DURATION) return;
  if (o.reduced) {
    // Reduced motion: a still card. The bars and the caption hold; nothing
    // flashes, sinks or flies.
    drawVignette(g, 1);
    drawBars(g, 1, o);
    return;
  }
  const k = barsAt(t);
  drawVignette(g, k);
  drawBoss(g, o, t);
  drawOpen(g, o, t);
  drawWalkIn(g, o, t);
  drawBars(g, k, o);
  // A white flash on the killing blow.
  const white = 1 - span(t, 0, 0.14);
  if (white > 0) { g.globalAlpha = 0.45 * white; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
}
