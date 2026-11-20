// HORDES - the forge (R5 "Evolution staged"). When the player takes an
// evolution or a fusion, the two cards that make it move together over the
// frozen field and fuse into the new weapon's card, with a cyan-teal glow and
// a sting. It also paints the cards for the offer itself.
//
// Pure: render(g, t, o) is a function of the time and what it is handed. No
// clock, no Math.random, no DOM. Drawn in the 480x300 view, after the HUD.
//
//   t   seconds since the moment began (main.js counts it on the wall clock)
//   o   { left, right, result: card art objects ({ grid, palette }),
//         name: the new weapon's name, sub: what made it,
//         dur: the moment's length (FULL_S, REPEAT_S or STILL_S),
//         reduced: one still picture, capScale: CSS px per view px }
//
// Times below are on the FULL_S clock. A shorter moment (a repeat in the same
// run) plays the same film faster: u = t * FULL_S / dur.
import { cardArt, CARD_W, CARD_H } from './art/cards.js';
import { drawCardArt } from './render_cards.js';

const W = 480, H = 300;
export const FULL_S = 1.5;     // the first evolution or fusion of a run
export const REPEAT_S = 0.9;   // every later one in the same run
export const STILL_S = 1.0;    // reduced motion: one still picture
// The film, on the FULL_S clock: the cards come in, close and fuse, the new
// card stands, everything fades.
export const PHASES = { IN: [0, 0.35], CLOSE: [0.35, 0.75], FUSE: [0.75, 1.3], OUT: [1.3, 1.5] };
export const FUSE_AT = PHASES.CLOSE[1];

export const TEAL = '#3fe6d2';   // the reward colour
const TEAL_DIM = '#1f8f86', WARM = '#fff1d6', SCRIM = '#05050a';

// How long a moment lasts.
export function durationOf(o = {}) {
  if (o.reduced) return STILL_S;
  return o.repeat ? REPEAT_S : FULL_S;
}
export function isDone(t, o = {}) { return t >= durationOf(o); }
// Seconds into the moment when the cards fuse (the sting plays here).
export function fuseTime(o = {}) {
  return o.reduced ? 0 : FUSE_AT * durationOf(o) / FULL_S;
}
export function phaseAt(t, o = {}) {
  if (isDone(t, o)) return 'DONE';
  if (o.reduced) return 'FUSE';
  const u = t * FULL_S / durationOf(o);
  for (const [k, [a, b]] of Object.entries(PHASES)) if (u >= a && u < b) return k;
  return 'OUT';
}

// ---- the card faces ----
// An evolved weapon: the weapon's own card with a cyan-teal keyline on pale
// teal paper. Same pixels, new colours, so it reads as the same weapon grown.
const evolvedCache = new Map();
export function evolvedFaceArt(deckId) {
  if (evolvedCache.has(deckId)) return evolvedCache.get(deckId);
  const art = cardArt(deckId);
  const face = art ? { grid: art.grid, palette: { ...art.palette, 1: TEAL, 2: '#dff6ef', 3: '#9fd8ca' } } : null;
  evolvedCache.set(deckId, face);
  return face;
}

// A fusion: a dark card with a cyan-teal keyline and the fusion's own emblem
// (fusions.js def.mark, 5x5, painted 3x) in its tints, the same emblem the
// HUD's weapon slot and the fusion shelf show.
const fusionCache = new Map();
export function fusionFaceArt(def) {
  if (!def || !Array.isArray(def.mark)) return null;
  if (fusionCache.has(def.id)) return fusionCache.get(def.id);
  const grid = [];
  for (let y = 0; y < CARD_H; y++) {
    const row = [];
    for (let x = 0; x < CARD_W; x++) {
      const edge = x === 0 || y === 0 || x === CARD_W - 1 || y === CARD_H - 1;
      const corner = (x === 0 || x === CARD_W - 1) && (y === 0 || y === CARD_H - 1);
      const inner = x === 1 || y === 1 || x === CARD_W - 2 || y === CARD_H - 2;
      row.push(corner ? 0 : edge ? 1 : inner ? 3 : 2);
    }
    grid.push(row);
  }
  const S = 3, ox = Math.floor((CARD_W - 5 * S) / 2), oy = Math.floor((CARD_H - 5 * S) / 2);
  def.mark.forEach((line, my) => [...line].forEach((c, mx) => {
    const v = c === 'a' ? 5 : c === 'b' ? 6 : 0;
    if (!v) return;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) grid[oy + my * S + dy][ox + mx * S + dx] = v;
  }));
  const tint = def.tint || ['#ffffff', TEAL];
  const face = { grid, palette: { 1: TEAL, 2: '#14141c', 3: '#24303a', 5: tint[0], 6: tint[1] } };
  fusionCache.set(def.id, face);
  return face;
}

// ---- drawing helpers ----
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const span = (u, a, b) => clamp01((u - a) / (b - a));
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIn = (k) => k * k;

// A soft cyan-teal glow behind a card: stacked rectangles, wider and fainter.
function drawGlow(g, x, y, w, h, k) {
  if (k <= 0) return;
  g.fillStyle = TEAL;
  for (let i = 6; i >= 1; i--) {
    g.globalAlpha = 0.07 * k;
    const m = i * 3;
    g.fillRect(x - m, y - m, w + 2 * m, h + 2 * m);
  }
  g.globalAlpha = 1;
}

// A card at (cx, cy) (its centre) at a whole-number scale, optionally washed white.
function drawCardAt(g, art, cx, cy, s, white = 0, alpha = 1) {
  if (!art) return;
  const w = CARD_W * s, h = CARD_H * s;
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  g.globalAlpha = alpha;
  drawCardArt(g, art, x, y, s);
  if (white > 0) {
    g.globalAlpha = alpha * white;
    g.fillStyle = '#ffffff';
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
  }
  g.globalAlpha = 1;
}

function drawSign(g, ch, x, y, alpha) {
  if (alpha <= 0) return;
  g.globalAlpha = alpha;
  g.font = 'bold 14px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = WARM;
  g.fillText(ch, x, y);
  g.globalAlpha = 1;
}

// The name of the new weapon under its card, and what made it.
function drawCaption(g, o, y, alpha) {
  if (alpha <= 0 || !o.name) return;
  const cs = Number(o.capScale) > 0 ? Number(o.capScale) : 1;
  const big = Math.max(12, Math.min(20, Math.ceil(12 / cs)));
  const small = Math.max(9, Math.min(16, Math.ceil(10 / cs)));
  g.globalAlpha = alpha;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.font = 'bold ' + big + 'px monospace';
  g.fillStyle = SCRIM;
  g.fillText(String(o.name).toUpperCase(), W / 2 + 1, y + 1);
  g.fillStyle = TEAL;
  g.fillText(String(o.name).toUpperCase(), W / 2, y);
  if (o.sub) {
    g.font = small + 'px monospace';
    g.fillStyle = WARM;
    g.fillText(String(o.sub).toUpperCase(), W / 2, y + big + 4);
  }
  g.globalAlpha = 1;
}

// The burst at the fuse: one expanding ring and sparks on fixed angles.
function drawBurst(g, k) {
  if (k <= 0 || k >= 1) return;
  const r = 14 + 120 * easeOut(k);
  const a = 1 - k;
  g.strokeStyle = TEAL;
  g.lineWidth = 3;
  g.globalAlpha = 0.8 * a;
  if (typeof g.beginPath === 'function') {
    g.beginPath();
    g.ellipse ? g.ellipse(W / 2, H / 2, r, r * 0.8, 0, 0, Math.PI * 2) : g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const ang = i * Math.PI / 8 + 0.2;
    const d = 20 + 150 * easeOut(k) * (0.6 + 0.4 * ((i * 7) % 5) / 4);
    g.globalAlpha = a;
    g.fillStyle = i % 2 ? TEAL : WARM;
    g.fillRect(Math.round(W / 2 + Math.cos(ang) * d) - 1, Math.round(H / 2 + Math.sin(ang) * d * 0.8) - 1, 3, 3);
  }
  g.globalAlpha = 1;
}

// Where the result card sits, and its scale.
const RESULT_S = 3, INPUT_S = 2;
const CY = Math.round(H / 2) - 18;

// One frame of the forge over the frozen field.
export function render(g, t, o = {}) {
  if (!g || !(t >= 0) || isDone(t, o)) return;
  const dur = durationOf(o);
  if (o.reduced) {
    // Reduced motion: one still. The field dims, the new card stands in its
    // glow with its name; nothing moves or flashes.
    g.globalAlpha = 0.6; g.fillStyle = SCRIM; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    const h = CARD_H * RESULT_S;
    drawGlow(g, W / 2 - CARD_W * RESULT_S / 2, CY - h / 2, CARD_W * RESULT_S, h, 1);
    drawCardAt(g, o.result, W / 2, CY, RESULT_S);
    drawCaption(g, o, CY + h / 2 + 10, 1);
    return;
  }
  const u = t * FULL_S / dur;
  // The field dims in fast and comes back at the end.
  const dim = Math.min(span(u, 0, 0.12), 1 - span(u, PHASES.OUT[0], PHASES.OUT[1]));
  g.globalAlpha = 0.6 * dim; g.fillStyle = SCRIM; g.fillRect(0, 0, W, H); g.globalAlpha = 1;

  if (u < FUSE_AT) {
    // IN: the two cards slide in from the sides. CLOSE: they move together,
    // whiten and tremble.
    const kin = easeOut(span(u, ...PHASES.IN));
    const kc = easeIn(span(u, ...PHASES.CLOSE));
    const gap = 74 * (1 - kc);
    const off = (1 - kin) * 140;
    const shake = u > FUSE_AT - 0.12 ? ((Math.floor(u * 60) % 2) ? 1 : -1) : 0;
    const white = 0.85 * kc;
    drawGlow(g, W / 2 - 60, CY - 40, 120, 80, kc);
    drawCardAt(g, o.left, W / 2 - gap - off + shake, CY, INPUT_S, white, kin);
    drawCardAt(g, o.right, W / 2 + gap + off - shake, CY, INPUT_S, white, kin);
    drawSign(g, '+', W / 2, CY, kin * (1 - span(u, PHASES.CLOSE[0], PHASES.CLOSE[0] + 0.15)));
    return;
  }
  // FUSE: a white flash, the ring bursts, the new card stands in its glow.
  const out = 1 - span(u, ...PHASES.OUT);
  const kf = span(u, FUSE_AT, FUSE_AT + 0.45);
  const h = CARD_H * RESULT_S;
  drawGlow(g, W / 2 - CARD_W * RESULT_S / 2, CY - h / 2, CARD_W * RESULT_S, h, out * (1 - 0.4 * kf));
  drawBurst(g, kf);
  drawCardAt(g, o.result, W / 2, CY, RESULT_S, 1 - span(u, FUSE_AT, FUSE_AT + 0.2), out);
  drawCaption(g, o, CY + h / 2 + 10, Math.min(span(u, FUSE_AT + 0.1, FUSE_AT + 0.3), out));
  const flash = 1 - span(u, FUSE_AT, FUSE_AT + 0.15);
  if (flash > 0) { g.globalAlpha = 0.5 * flash; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
}
