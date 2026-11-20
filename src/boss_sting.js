// HORDES - the boss arrival sting (R7). When a wave's boss arrives, about
// 1.5 s on the live battlefield: the film bars come in, the picture pushes in
// toward the boss and back, and a name card shows the boss's own sprite large,
// its name, and its rule in one line. The Maw's arrival is the big one: 3.5 s,
// the same language, larger. main.js holds the sim while it plays (as the
// forge moment does), so nothing in the fight moves under it.
//
// Pure: everything here is a function of the time and what it is handed. No
// clock, no Math.random, no DOM. Drawn in the 480x300 view.
//
//   t   seconds since the sting began (main.js counts it on the wall clock,
//       only while nothing else holds the screen)
//   o   { kind: 'boss' | 'maw',
//         cast: [{ id, name, frames, palette, box, anchor }] (one or two),
//         rule: { text, reward } or null, flavor: a line for a boss with no rule,
//         wave, focus: { x, y } the boss on screen (view px) or null,
//         reduced, repeat, capScale: CSS px per view px,
//         slot: 'bottom' (default) or 'top', topY: where the top slot starts
//         (view px, below the HUD's top rows); main.js picks the slot once
//         with cardSlot() so the card never stands on the hero }
import { blitGrid, actorStyle, STYLE_PLAIN } from './sprite_cache.js';

const W = 480, H = 300;
export const FULL_S = 1.5;     // a wave's boss, first arrival in the run
export const REPEAT_S = 1.0;   // the same boss again in the same run
export const MAW_S = 3.5;      // the Maw
export const STILL_S = 1.0;    // reduced motion: a still card
export const BAR = 20;         // the film bars of a boss sting (view px)
export const MAW_BAR = 28;     // and of the Maw's
// How far the picture pushes in (the zoom at the top of the push, minus 1).
export const PUSH = 0.1, MAW_PUSH = 0.2;
// The name card's height cap (view px): a strip at the edge of the view.
export const CARD_MAX = 100, CARD_MAX_MAW = 116;
// The boss film on the FULL_S clock. IN: bars, the push, the card slides in,
// the boss drops onto it. SLAM: it lands (the sting cue). HOLD. OUT.
export const PHASES = { IN: [0, 0.32], HOLD: [0.32, 1.2], OUT: [1.2, 1.5] };
export const SLAM_AT = PHASES.IN[1];
// The Maw's film on its own clock. DARK: the screen darkens, the push begins.
// RISE: it rises out of the dark on the card. SLAM: its colours and its name.
export const MAW_PHASES = { DARK: [0, 0.9], RISE: [0.9, 1.6], HOLD: [1.6, 3.0], OUT: [3.0, 3.5] };
export const MAW_SLAM_AT = MAW_PHASES.RISE[1];

// Colours (decision 5): red-orange is danger, cyan-teal is reward, warm white
// is the hero (never used here).
export const DANGER = '#ff6a3a';
export const TEAL = '#3fe6d2';
const DANGER_DIM = '#7a1e10', BAR_COL = '#06060b', PLATE = '#0b0709', SHADE = '#1a0603';
const GREY = '#e4e4ee', KICK = '#a8949a', DARK = '#05030a';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (u) => { const v = clamp01(u); return v * v * (3 - 2 * v); };
const easeOut = (u) => { const v = clamp01(u); return 1 - (1 - v) * (1 - v); };
const easeIn = (u) => { const v = clamp01(u); return v * v; };

const isMaw = (o) => !!o && o.kind === 'maw';

// How long a sting lasts.
export function durationOf(o = {}) {
  if (o.reduced) return STILL_S;
  if (isMaw(o)) return MAW_S;
  return o.repeat ? REPEAT_S : FULL_S;
}
export function isDone(t, o = {}) { return t >= durationOf(o); }
// Seconds into the sting when the boss lands (the sting cue plays here).
export function slamTime(o = {}) {
  if (o.reduced) return 0;
  if (isMaw(o)) return MAW_SLAM_AT;
  return SLAM_AT * durationOf(o) / FULL_S;
}
// The boss film runs on the FULL_S clock: a repeat plays it faster.
function clockOf(t, o) { return isMaw(o) ? t : t * FULL_S / durationOf(o); }
export function phaseAt(t, o = {}) {
  if (isDone(t, o)) return 'DONE';
  if (o.reduced) return 'HOLD';
  const u = clockOf(t, o);
  for (const [k, [a, b]] of Object.entries(isMaw(o) ? MAW_PHASES : PHASES)) if (u >= a && u < b) return k;
  return 'OUT';
}
export function barHeight(o = {}) { return isMaw(o) ? MAW_BAR : BAR; }

// How far the bars are in (0..1).
export function barsAt(t, o = {}) {
  if (!(t >= 0) || isDone(t, o)) return 0;
  if (o.reduced) return 1;
  const u = clockOf(t, o);
  if (isMaw(o)) return Math.min(ease(span(u, 0, 0.4)), 1 - ease(span(u, 3.05, 3.5)));
  return Math.min(ease(span(u, 0, 0.2)), 1 - ease(span(u, 1.25, 1.5)));
}

// How far the push is in (0..1); 0 under reduced motion.
export function pushAt(t, o = {}) {
  if (o.reduced || !(t >= 0) || isDone(t, o)) return 0;
  const u = clockOf(t, o);
  if (isMaw(o)) return Math.min(ease(span(u, 0, 1.4)), 1 - ease(span(u, 2.8, 3.5)));
  return Math.min(ease(span(u, 0, 0.45)), 1 - ease(span(u, 1.05, 1.5)));
}

// The part of the drawn view the push shows full screen: { zoom, sx, sy, sw, sh }
// in view px. It leans toward the boss (o.focus), and never leaves the view.
export function pushRect(t, o = {}) { return rectAt(pushAt(t, o), o); }
function rectAt(k, o) {
  const zoom = 1 + (isMaw(o) ? MAW_PUSH : PUSH) * k;
  const sw = W / zoom, sh = H / zoom;
  const f = o.focus && Number.isFinite(o.focus.x) && Number.isFinite(o.focus.y) ? o.focus : { x: W / 2, y: H / 2 };
  const fx = Math.max(0, Math.min(W, f.x)), fy = Math.max(0, Math.min(H, f.y));
  const cx = W / 2 + (fx - W / 2) * 0.6 * k, cy = H / 2 + (fy - H / 2) * 0.6 * k;
  const sx = Math.max(0, Math.min(W - sw, cx - sw / 2));
  const sy = Math.max(0, Math.min(H - sh, cy - sh / 2));
  return { zoom, sx, sy, sw, sh };
}

// The push: the world already drawn this frame, copied back onto the canvas
// scaled about a point toward the boss. Drawing only: the camera the sim and
// the pilot read never moves. main.js calls it right after the world layer.
export function renderPush(g, t, o = {}) {
  if (!g || typeof g.drawImage !== 'function') return false;
  const r = pushRect(t, o);
  if (!(r.zoom > 1.001)) return false;
  const cv = g.canvas;
  if (!cv || !(cv.width > 0) || !(cv.height > 0)) return false;
  const kx = cv.width / W, ky = cv.height / H;
  g.drawImage(cv, r.sx * kx, r.sy * ky, r.sw * kx, r.sh * ky, 0, 0, W, H);
  return true;
}

// ---- the card -------------------------------------------------------------------
// Text sizes from the screen: at least 10 view px and 11 CSS px for the small
// lines (a phone held upright shows the view at about 0.8).
export function textSizes(o = {}) {
  const cs = Number(o.capScale) > 0 ? Number(o.capScale) : 1;
  const small = Math.max(10, Math.min(16, Math.ceil(11 / cs)));
  const nameMin = Math.max(14, Math.min(20, Math.ceil(14 / cs)));
  return { small, nameMin, nameMax: isMaw(o) ? 34 : 28 };
}

const ADV = 0.6021;   // monospace advance per px: the fallback when measureText has no metrics
function widthOf(g, txt, px, bold) {
  if (g && typeof g.measureText === 'function') {
    g.font = (bold ? 'bold ' : '') + px + 'px monospace';
    const m = g.measureText(txt);
    if (m && typeof m.width === 'number' && Number.isFinite(m.width) && m.width > 0) return m.width;
  }
  return String(txt).length * px * ADV;
}
function wrap(g, txt, px, bold, maxW) {
  const out = [];
  let line = '';
  for (const word of String(txt).split(' ')) {
    const cand = line ? line + ' ' + word : word;
    if (line && widthOf(g, cand, px, bold) > maxW) { out.push(line); line = word; } else line = cand;
  }
  if (line) out.push(line);
  return out;
}

// Where everything on the card goes (pure, for the renderer and the tests):
// { plate: { x, y, w, h }, sprites: [{ cx, feet, s, look }], lines: [{ txt, px, bold, color, x, y, role }] }
export function cardLayout(o = {}, g = null) {
  const maw = isMaw(o);
  const cast = (o.cast || []).filter(Boolean).slice(0, 2);
  const two = cast.length > 1;
  const { small, nameMin, nameMax } = textSizes(o);
  const bar = barHeight(o);
  // The sprites' columns: a scale that makes them big (fitted to the plate below).
  const s0 = maw ? 4 : two ? 3 : 4;
  const cols = [];
  let right = 16;
  cast.forEach((look, i) => {
    const bw = (look.box && look.box.w) || 24;
    const cx = (two ? 14 + i * 50 : 16) + (bw * s0) / 2 + (maw ? 6 : 0);
    cols.push({ cx: Math.round(cx), look });
    right = Math.max(right, cx + (bw * s0) / 2);
  });
  const textX = Math.round(right + 14);
  const maxW = W - 12 - textX;
  // The lines: a small kicker, the name(s), the rule (or the flavour).
  const kicker = maw ? 'THE FINALE' : 'WAVE ' + (o.wave || 1) + (two ? ' - TWO BOSSES' : ' BOSS');
  const names = cast.map((c, i) => (i ? '+ ' : '') + String(c.name || '').toUpperCase());
  const longest = names.reduce((a, n) => (n.length > a.length ? n : a), '');
  const gap = 3;
  const build = (namePx) => {
    const lines = [{ txt: kicker, px: small, bold: true, color: KICK, role: 'kicker' }];
    for (const n of names) {
      for (const l of (widthOf(g, n, namePx, true) <= maxW ? [n] : wrap(g, n, namePx, true, maxW))) {
        lines.push({ txt: l, px: namePx, bold: true, color: DANGER, role: 'name' });
      }
    }
    if (o.rule && o.rule.text) {
      const rule = String(o.rule.text).toUpperCase();
      for (const l of wrap(g, rule, small, false, maxW)) lines.push({ txt: l, px: small, bold: false, color: GREY, role: 'rule' });
      if (o.rule.reward) {
        for (const l of wrap(g, String(o.rule.reward).toUpperCase(), small, true, maxW)) {
          lines.push({ txt: l, px: small, bold: true, color: TEAL, role: 'reward' });
        }
      }
    } else if (o.flavor) {
      for (const l of wrap(g, String(o.flavor).toUpperCase(), small, false, maxW)) lines.push({ txt: l, px: small, bold: false, color: GREY, role: 'flavor' });
    }
    let textH = 0;
    for (const l of lines) { l.h = Math.round(l.px * 1.15) + gap; textH += l.h; }
    return { lines, textH };
  };
  let namePx = nameMax;
  while (namePx > nameMin && widthOf(g, longest, namePx, true) > maxW) namePx--;
  // A strip, not a wall: the names step down until the card fits its height
  // (it must leave the middle of the view, where the hero is, to the fight).
  const capH = maw ? CARD_MAX_MAW : CARD_MAX;
  let built = build(namePx);
  while (built.textH + 12 > capH && namePx > nameMin) built = build(--namePx);
  const { lines, textH } = built;
  const h = Math.max(maw ? 96 : 76, textH + 12);
  // The slot: on the bottom bar, or (when the hero stands there) under the
  // HUD's top rows. Never over a bar.
  // The sprites stand on the plate's floor; a tall one may rise a little above it.
  const fit = cols.map(({ cx, look }) => {
    const bh = (look.box && look.box.h) || 24;
    let s = s0;
    while (s > 2 && bh * s > h + 16) s--;
    return { cx, s, look, rise: Math.max(0, bh * s + 6 - h) };
  });
  const rise = fit.reduce((a, f) => Math.max(a, f.rise), 0);
  // In the top slot the sprite's head, not the plate, starts at topY.
  const lo = bar + 2 + rise, hi = H - bar - h;
  const y0 = o.slot === 'top' ? Math.max(lo, Math.min(hi, Math.round((Number(o.topY) || 0) + rise))) : hi;
  const plate = { x: 0, y: y0, w: W, h };
  const sprites = fit.map(({ cx, s, look }) => ({ cx, feet: y0 + h - 6, s, look }));
  let y = plate.y + Math.max(6, Math.round((h - textH) / 2));
  for (const l of lines) { l.x = textX; l.y = y; y += l.h; }
  return { plate, sprites, lines, textX, maxW };
}

// The card's whole box at rest (the plate and any sprite above it), view px.
export function cardBounds(o = {}, g = null) {
  const lay = cardLayout(o, g);
  let top = lay.plate.y;
  for (const sp of lay.sprites) {
    const bh = (sp.look.box && sp.look.box.h) || 24;
    top = Math.min(top, sp.feet - bh * sp.s);
  }
  return { x: 0, y: top, w: W, h: lay.plate.y + lay.plate.h - top };
}

// Where the card goes: 'bottom' unless the hero would stand under it (as the
// view is drawn, or at the push's peak), then 'top' if the hero is clear
// there. hero: { x, y, r } on screen, view px (r: half its size).
export function cardSlot(o = {}, hero = null, g = null) {
  if (!hero || !Number.isFinite(hero.x) || !Number.isFinite(hero.y)) return 'bottom';
  const r = Number(hero.r) > 0 ? Number(hero.r) : 10;
  const peak = rectAt(1, o);
  const pts = [{ x: hero.x, y: hero.y }];
  if (!o.reduced) pts.push({ x: (hero.x - peak.sx) * peak.zoom, y: (hero.y - peak.sy) * peak.zoom });
  const hits = (b) => pts.some((p) => p.y + r > b.y - 4 && p.y - r < b.y + b.h + 4);
  if (!hits(cardBounds({ ...o, slot: 'bottom' }, g))) return 'bottom';
  if (Number.isFinite(Number(o.topY)) && !hits(cardBounds({ ...o, slot: 'top' }, g))) return 'top';
  return 'bottom';
}

// A dark silhouette palette for a sprite (the Maw before it shows itself).
const shadowCache = new Map();
function shadowPalette(pal) {
  if (shadowCache.has(pal)) return shadowCache.get(pal);
  const out = {};
  for (const k of Object.keys(pal || {})) out[k] = '#170709';
  shadowCache.set(pal, out);
  return out;
}

function drawSprite(g, sp, u, o, slam) {
  const look = sp.look;
  const frames = look && look.frames;
  if (!frames || !frames.length) return;
  const maw = isMaw(o);
  // Idle frames at 4 a second (a function of t, so a still frame is a still frame).
  const frame = o.reduced ? frames[0] : frames[Math.floor(u * 4) % frames.length];
  const s = sp.s;
  const bw = (look.box && look.box.w) || frame[0].length, bh = (look.box && look.box.h) || frame.length;
  // bossdark: the boss wears its bright rim on the dark card (a look without one, none)
  let dy = 0, alpha = 1, pal = look.palette, style = actorStyle(false, false, look.rim || null, false, false);
  if (!o.reduced) {
    if (maw) {
      // It rises out of the dark, a silhouette until it lands.
      dy = (1 - easeOut(span(u, MAW_PHASES.RISE[0], MAW_SLAM_AT))) * 60;
      alpha = span(u, MAW_PHASES.RISE[0], MAW_PHASES.RISE[0] + 0.3);
      if (u < MAW_SLAM_AT) { pal = shadowPalette(look.palette); style = actorStyle(false, false, null, false, false); }
    } else {
      // It drops onto the card and lands hard.
      dy = -(1 - easeIn(span(u, 0.14, SLAM_AT))) * 70;
      alpha = span(u, 0.14, 0.2);
    }
    if (slam > 0 && slam < 0.07) style = actorStyle(true, false, null, false, false);
  }
  if (!(alpha > 0)) return;
  const x = Math.round(sp.cx - (bw * s) / 2), y = Math.round(sp.feet - bh * s + dy);
  // The ground under it: a dark pool and a low red-orange glow.
  g.globalAlpha = 0.55 * alpha;
  g.fillStyle = DARK;
  g.fillRect(Math.round(sp.cx - bw * s * 0.45), sp.feet - 3, Math.round(bw * s * 0.9), 5);
  g.globalAlpha = 0.5 * alpha;
  g.fillStyle = DANGER_DIM;
  g.fillRect(Math.round(sp.cx - bw * s * 0.35), sp.feet + 2, Math.round(bw * s * 0.7), 2);
  g.globalAlpha = alpha;
  blitGrid(g, frame, pal, x, y, style || STYLE_PLAIN, s);
  g.globalAlpha = 1;
}

// Dust kicked out when it lands, in the danger colour.
function drawDust(g, sp, slam) {
  if (!(slam > 0 && slam < 0.45)) return;
  const k = slam / 0.45;
  g.globalAlpha = 0.85 * (1 - k);
  g.fillStyle = DANGER;
  const bw = ((sp.look && sp.look.box && sp.look.box.w) || 24) * sp.s;
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const d = bw * 0.4 + (10 + 6 * (i >> 1)) * easeOut(k) * 2;
    const lift = Math.sin(k * Math.PI) * (3 + 3 * (i >> 1));
    g.fillRect(Math.round(sp.cx + side * d) - 1, Math.round(sp.feet - lift) - 1, 3, 3);
  }
  g.globalAlpha = 1;
}

function drawText(g, l, chars) {
  const txt = chars >= l.txt.length ? l.txt : l.txt.slice(0, Math.max(0, chars));
  if (!txt) return;
  g.font = (l.bold ? 'bold ' : '') + l.px + 'px monospace';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  if (l.role === 'name') {
    g.fillStyle = SHADE;
    g.fillText(txt, l.x + 2, l.y + 2);
  }
  g.fillStyle = l.color;
  g.fillText(txt, l.x, l.y);
}

// The name card. `u` is the film clock (FULL_S clock for a boss, real time for the Maw).
function poseOf(o, u) {
  const maw = isMaw(o);
  const R = o.reduced;
  const slamAt = maw ? MAW_SLAM_AT : SLAM_AT;
  const slam = R ? 1 : u - slamAt;
  const inA = R ? 0 : maw ? 0.5 : 0.08, inB = R ? 0 : maw ? 0.9 : 0.28;
  const slide = R ? 0 : -(1 - easeOut(span(u, inA, inB))) * W;
  const out = R ? 1 : 1 - span(u, maw ? 3.0 : 1.2, maw ? 3.4 : 1.45);
  const jolt = !R && slam >= 0 && slam < 0.05 ? 2 : 0;
  return { maw, R, slamAt, slam, inB, slide, out, jolt };
}
// Where the plate is drawn this frame (view px), or null when none of it is:
// main.js keeps the HUD's rows off it (renderer: state.hudHole).
export function cardRect(t, o = {}, g = null) {
  if (!(t >= 0) || isDone(t, o)) return null;
  const { slide, out, jolt } = poseOf(o, o.reduced ? 0 : clockOf(t, o));
  if (!(out > 0)) return null;
  const p = cardLayout(o, g).plate;
  const x0 = Math.max(0, Math.round(p.x + slide)), x1 = Math.min(W, Math.round(p.x + slide) + p.w);
  if (x1 - x0 < 1) return null;
  return { x: x0, y: p.y, w: x1 - x0, h: p.h + jolt };
}
function drawCard(g, o, u, lay) {
  const { maw, R, slamAt, slam, inB, slide, out, jolt } = poseOf(o, u);
  if (!(out > 0)) return;
  const p = lay.plate;
  const px = Math.round(p.x + slide), py = p.y + jolt;
  g.globalAlpha = out;   // opaque: the radar and the hand fan under it must not show through
  g.fillStyle = PLATE;
  g.fillRect(px, py, p.w, p.h);
  g.globalAlpha = out;
  g.fillStyle = DANGER;
  g.fillRect(px, py, p.w, 2);
  g.fillStyle = DANGER_DIM;
  g.fillRect(px, py + p.h - 1, p.w, 1);
  g.globalAlpha = 1;
  // The boss stands on the plate (it slides with it).
  g.save && g.save();
  if (slide && g.translate) g.translate(Math.round(slide), jolt);
  for (const sp of lay.sprites) { g.globalAlpha = out; drawSprite(g, sp, u, o, slam); }
  if (!R) for (const sp of lay.sprites) drawDust(g, sp, slam);
  g.restore && g.restore();
  g.globalAlpha = out;
  // The text: the kicker and the rule fade in, the name types in hard.
  const nameA = R ? 1 : span(u, slamAt - 0.02, slamAt + (maw ? 0.4 : 0.18));
  const restA = R ? 1 : span(u, slamAt + (maw ? 0.4 : 0.13), slamAt + (maw ? 0.7 : 0.28));
  // A boss's kicker rides in on the plate, so the plate never slides in empty.
  const kickA = R || !maw ? 1 : span(u, inB - 0.05, inB + 0.05);
  for (const l of lay.lines) {
    const a = l.role === 'kicker' ? kickA : l.role === 'name' ? (nameA > 0 ? 1 : 0) : restA;
    if (!(a > 0)) continue;
    g.globalAlpha = a * out;
    drawText(g, { ...l, x: l.x + Math.round(slide) },l.role === 'name' ? Math.ceil(l.txt.length * nameA) : l.txt.length);
  }
  g.globalAlpha = 1;
}

// Dark edges that pull the eye in.
function drawVignette(g, k) {
  if (k <= 0) return;
  g.fillStyle = DARK;
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = 0.13 * k;
    const m = i * 5;
    g.fillRect(0, 0, m + 5, H); g.fillRect(W - m - 5, 0, m + 5, H);
  }
  g.globalAlpha = 1;
}

function drawBars(g, k, o) {
  if (k <= 0) return;
  const bh = Math.round(barHeight(o) * k);
  g.globalAlpha = 1;
  g.fillStyle = BAR_COL;
  g.fillRect(0, 0, W, bh);
  g.fillRect(0, H - bh, W, bh);
  g.fillStyle = DANGER_DIM;
  g.fillRect(0, bh, W, 1);
  g.fillRect(0, H - bh - 1, W, 1);
}

// One frame of the sting: the dark, the bars and the landing's wash, then the
// name card. main.js draws all of it under the HUD (renderer.underHud): the
// vitals and the clock stay on top and step below the bar, and the HUD rows
// that would stand on the card (the weapon row, the hand, the radar) are kept
// off it for its length (state.hudHole, from cardRect).
export function render(g, t, o = {}) {
  renderUnder(g, t, o);
  renderCard(g, t, o);
}
export function renderUnder(g, t, o = {}) {
  if (!g || !(t >= 0) || isDone(t, o)) return;
  const maw = isMaw(o);
  if (o.reduced) {
    // Reduced motion: one still card. Nothing slides, drops, flashes or pushes.
    g.globalAlpha = maw ? 0.5 : 0.4; g.fillStyle = DARK; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    drawVignette(g, 1);
    drawBars(g, 1, o);
    return;
  }
  const u = clockOf(t, o);
  const k = barsAt(t, o);
  // The field darkens (the Maw's falls further and slower).
  const dim = maw ? Math.min(ease(span(u, 0, 0.9)), 1 - ease(span(u, 3.0, 3.5))) : k;
  g.globalAlpha = (maw ? 0.55 : 0.4) * dim; g.fillStyle = DARK; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  drawVignette(g, dim);
  drawBars(g, k, o);
  // The landing: a short red-orange wash.
  const slam = u - (maw ? MAW_SLAM_AT : SLAM_AT);
  const wash = slam >= 0 ? 1 - span(slam, 0, maw ? 0.25 : 0.14) : 0;
  if (wash > 0) { g.globalAlpha = (maw ? 0.28 : 0.18) * wash; g.fillStyle = DANGER; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
}
export function renderCard(g, t, o = {}) {
  if (!g || !(t >= 0) || isDone(t, o)) return;
  drawCard(g, o, o.reduced ? 0 : clockOf(t, o), cardLayout(o, g));
}
