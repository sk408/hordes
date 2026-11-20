// HORDES — painters for the feel pools (src/fx/feel.js): death puffs, sparks,
// bursts and the damage numbers. World layer, integer pixels; every phase is
// age / ttl so 60Hz and 120Hz paint the same picture at the same age.
import { blitGrid, STYLE_ITEM } from '../sprite_cache.js';
import { getNumbersMode } from './feel.js';

// 3x5 pixel digits (plus the few marks the formatter emits).
const G = (rows) => rows.map(r => r.split('').map(Number));
const GLYPHS = {
  0: G(['111', '101', '101', '101', '111']), 1: G(['010', '110', '010', '010', '111']),
  2: G(['111', '001', '111', '100', '111']), 3: G(['111', '001', '111', '001', '111']),
  4: G(['101', '101', '111', '001', '001']), 5: G(['111', '100', '111', '001', '111']),
  6: G(['111', '100', '111', '101', '111']), 7: G(['111', '001', '001', '010', '010']),
  8: G(['111', '101', '111', '101', '111']), 9: G(['111', '101', '111', '001', '111']),
  k: G(['101', '101', '110', '101', '101']), M: G(['101', '111', '111', '101', '101']),
  '.': G(['0', '0', '0', '0', '1']), '!': G(['1', '1', '1', '0', '1']), '-': G(['00', '00', '11', '00', '00']),
};
export const NUM_PAL = {
  hit: { 1: '#ffffff' }, crit: { 1: '#f0c860' }, hurt: { 1: '#e06a74' },
};

export function formatDamage(v) {
  const n = Math.max(1, Math.round(v));
  if (n < 1000) return String(n);
  if (n < 10000) return (Math.floor(n / 100) / 10).toFixed(1) + 'k';
  if (n < 1e6) return Math.floor(n / 1000) + 'k';
  if (n < 1e7) return (Math.floor(n / 1e5) / 10).toFixed(1) + 'M';
  return Math.floor(n / 1e6) + 'M';
}

// Calmer numbers (R3). Late in a run the numbers used to cover the screen, so:
//   - at most LARGE_CAP numbers are drawn double size at once (KILL_SLOTS of
//     them kept for kills, then crits, then kills, then the biggest); the
//     rest are drawn small,
//   - from minute 8 (LATE_AT run seconds) only big hits get the large style,
//     and plain hits are drawn small and softer,
//   - a number fades as it nears the hero, so it never sits on the hero
//     (crits and kills keep a readable floor),
//   - the NUMBERS setting (fx/feel.js) picks all, big or off.
// All of it is drawing only: the pool in fx/feel.js keeps every number.
export const NUMBERS = {
  LARGE_CAP: 6,
  KILL_SLOTS: 2,        // large slots kept for kills, so kills read in a storm of crits
  LATE_AT: 480,         // run seconds: minute 8
  BIG_MULT: 3,          // a hit this many times the running average is a big hit
  SOFT_ALPHA: 0.6,      // plain hits from minute 8
  HERO_GAP: 16,         // px from the hero's box where the fade starts
  HERO_MIN_ALPHA: 0.15, // a number touching the hero's box
  HERO_MIN_ALPHA_BIG: 0.45, // a crit or a kill touching it: still readable
};

// Crits, kills and hits well above the run's usual hit.
export function isBigHit(n, f) {
  if (n.kind === 'crit' || n.kill) return true;
  if (n.kind === 'hurt') return false;
  // A pool number is the sum of every hit merged into it: judge one hit's share.
  return f.hitAvg > 0 && n.value / ((n.merged || 0) + 1) >= f.hitAvg * NUMBERS.BIG_MULT;
}

function textOf(n) {
  return (n.kind === 'hurt' ? '-' : '') + formatDamage(n.value) + (n.kind === 'crit' ? '!' : '');
}

// The box a number paints at scale s (world-layer px).
function numberBox(n, cam, s) {
  const t = n.age / n.ttl;
  const text = textOf(n);
  let w = -s;
  for (const ch of text) w += ((GLYPHS[ch] || GLYPHS[0])[0].length + 1) * s;
  const rise = Math.round((1 - (1 - t) * (1 - t)) * 16);
  return { text, x: Math.round(n.x - cam.x - w / 2), y: Math.round(n.y0 - cam.y - rise - 5 * s), w, h: 5 * s };
}

// 1 away from the hero, falling to `floor` as the box touches the hero's box.
export function heroFade(b, hero, floor = NUMBERS.HERO_MIN_ALPHA) {
  if (!hero) return 1;
  const dx = Math.max(hero.x0 - (b.x + b.w), b.x - hero.x1, 0);
  const dy = Math.max(hero.y0 - (b.y + b.h), b.y - hero.y1, 0);
  const gap = Math.hypot(dx, dy);
  if (gap >= NUMBERS.HERO_GAP) return 1;
  return floor + (1 - floor) * gap / NUMBERS.HERO_GAP;
}

function drawNumber(g, n, cam, s, soft, hero, sink) {
  const t = n.age / n.ttl;
  const b = numberBox(n, cam, s);
  let a = t > 0.75 ? Math.max(0.15, 1 - (t - 0.75) * 3.4) : 1;
  if (soft) a *= NUMBERS.SOFT_ALPHA;
  // The hero's own hurt numbers start above the head and rise: no fade.
  if (n.kind !== 'hurt') {
    a *= heroFade(b, hero, n.kind === 'crit' || n.kill ? NUMBERS.HERO_MIN_ALPHA_BIG : NUMBERS.HERO_MIN_ALPHA);
  }
  if (sink) sink.nums.push({ x: b.x, y: b.y, w: b.w, h: b.h, s, a, kind: n.kind, kill: !!n.kill });
  g.globalAlpha = a;
  const pal = NUM_PAL[n.kind] || NUM_PAL.hit;
  let x = b.x;
  for (const ch of b.text) {
    const glyph = GLYPHS[ch] || GLYPHS[0];
    blitGrid(g, glyph, pal, x, b.y, STYLE_ITEM, s);
    x += (glyph[0].length + 1) * s;
  }
  g.globalAlpha = 1;
}

// Death puff: a white pop, then body-coloured shards flying out and a smoke
// ring; elites and bosses add a second ring and more shards.
// The pop is a small white star (a plus), capped in size: a full rectangle
// the size of a big body read as a blank card on a still frame. Reduced
// motion leaves the pop out.
export const POP_MAX = 6;
// integ3: on a light floor (Bone Desert, the snow) white on white vanished:
// the pop, the light shards, the sparks' first beat and the smoke go dark.
export const FX_ON_LIGHT = { pop: '#1a1622', smoke: 'rgba(26,20,32,0.55)', smokeLate: 'rgba(26,20,32,0.3)' };
function drawPuff(g, p, cam, reduced = false, light = false) {
  const pop = light ? FX_ON_LIGHT.pop : '#ffffff';
  const t = p.age / p.ttl;
  const x = Math.round(p.x - cam.x), y = Math.round(p.y - cam.y);
  const shards = [5, 7, 10, 16][p.cls];
  const reach = p.r + [7, 10, 16, 30][p.cls];
  if (t < 0.25 && !reduced) {
    const c = Math.min(POP_MAX, Math.round(p.r * (1 - t * 2)));
    if (c > 0) {
      const th = Math.max(1, c >> 1);
      g.fillStyle = pop;
      g.fillRect(x - c, y - (th >> 1), c * 2, th);
      g.fillRect(x - (th >> 1), y - c, th, c * 2);
    }
  }
  const ease = 1 - (1 - t) * (1 - t);
  for (let i = 0; i < shards; i++) {
    const a = p.rot + (i / shards) * 6.283 + (i % 2) * 0.4;
    const d = reach * ease * (0.55 + 0.45 * ((i * 7) % 5) / 4);
    const sz = t < 0.5 ? (p.cls >= 2 ? 3 : 2) : (t < 0.8 ? 2 : 1);
    g.fillStyle = i % 3 === 0 ? pop : p.colour;
    g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.8 - ease * 3), sz, sz);
  }
  if (p.cls >= 2 && t < 0.8) {
    const rr = reach * 1.25 * ease;
    g.fillStyle = p.cls === 3 ? '#e4e2ea' : '#f8e098';
    const n = p.cls === 3 ? 20 : 12;
    for (let i = 0; i < n; i++) {
      const a = p.rot * 0.5 + (i / n) * 6.283;
      g.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.7), 2, 2);
    }
  }
  // Smoke: three grey motes drifting up and thinning.
  if (t > 0.2) {
    g.fillStyle = light ? (t < 0.6 ? FX_ON_LIGHT.smoke : FX_ON_LIGHT.smokeLate)
      : (t < 0.6 ? 'rgba(232,232,240,0.55)' : 'rgba(200,200,214,0.3)');
    const up = Math.round((t - 0.2) * 9);
    g.fillRect(x - 3, y - up, 2, 2);
    g.fillRect(x + 2, y - up - 2, 2, 2);
    if (p.cls > 0) g.fillRect(x - 1, y - up - 4, 3, 2);
  }
}

function drawBurst(g, b, cam) {
  const t = b.age / b.ttl;
  const x = Math.round(b.x - cam.x), y = Math.round(b.y - cam.y);
  if (b.kind === 'levelup') {
    // Two gold rings racing out, a rising column of chevrons over the hero.
    for (let ring = 0; ring < 2; ring++) {
      const tt = Math.max(0, t - ring * 0.15);
      if (tt <= 0 || tt >= 0.85) continue;
      const r = 6 + tt * 46;
      g.fillStyle = ring === 0 ? '#f0c860' : '#f8e098';
      const n = 28;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + ring * 0.11;
        g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.7), 2, 2);
      }
    }
    g.fillStyle = t < 0.5 ? '#ffffff' : '#f0c860';
    for (let k = 0; k < 3; k++) {
      const cy = y - 12 - Math.round(t * 22) - k * 5;
      g.fillRect(x - 1, cy, 2, 1); g.fillRect(x - 3, cy + 1, 2, 1); g.fillRect(x + 1, cy + 1, 2, 1);
      g.fillRect(x - 5, cy + 2, 2, 1); g.fillRect(x + 3, cy + 2, 2, 1);
    }
  } else {
    // Pickup glint: a four-point star that opens and fades.
    const r = Math.round(2 + t * 7);
    g.fillStyle = t < 0.5 ? '#ffffff' : '#f8e098';
    g.fillRect(x - r, y, r * 2 + 1, 1);
    g.fillRect(x, y - r, 1, r * 2 + 1);
    g.fillRect(x - 1, y - 1, 3, 3);
  }
}

// Under the actors: nothing yet. Over the actors: puffs, sparks, bursts.
export function drawFeelEffects(g, state, cam, reduced = false, light = false) {
  const f = state.feel;
  if (!f) return;
  for (const p of f.puffs) if (p.age >= 0) drawPuff(g, p, cam, reduced, light);   // a delayed puff waits for its collapse
  const first = light ? FX_ON_LIGHT.pop : '#ffffff';
  for (const s of f.sparks) {
    const t = s.age / s.ttl;
    g.fillStyle = t < 0.35 ? first : s.colour;
    const sz = t < 0.6 ? 2 : 1;
    g.fillRect(Math.round(s.x - cam.x), Math.round(s.y - cam.y), sz, sz);
  }
  for (const b of f.bursts) drawBurst(g, b, cam);
}

// Near the end of the world layer: numbers sit over the fight they describe,
// and only the hero is drawn after them. `hero` is the hero's box in
// world-layer px ({x0, y0, x1, y1}); `sink` (optional) records what was drawn.
const shown = [], cand = [];
export function drawFeelNumbers(g, state, cam, hero = null, sink = null) {
  const f = state.feel;
  if (!f) return;
  const mode = getNumbersMode();
  if (mode === 'off') return;
  const late = (state.time || 0) >= NUMBERS.LATE_AT;
  shown.length = 0;
  for (const n of f.nums) {
    const big = isBigHit(n, f);
    if (mode === 'big' && !big && n.kind !== 'hurt') continue;
    const pop = n.merged > 2 && n.age / n.ttl < 0.25;
    // Today's large style early on (crits, and a merged number's pop);
    // from minute 8 only big hits pop.
    const wantLarge = n.kind === 'crit' || n.kill || (pop && (!late || big));
    // rank: crits, then kills, then the biggest value
    n._rank = wantLarge ? (n.kind === 'crit' ? 2e15 : n.kill ? 1e15 : 0) + n.value : -1;
    n._soft = late && !big && n.kind !== 'hurt';
    shown.push(n);
  }
  // The LARGE_CAP slots: KILL_SLOTS go to the top kills first, the rest by
  // rank (crits, then kills, then the biggest value).
  cand.length = 0;
  for (const n of shown) { n._large = false; if (n._rank >= 0) cand.push(n); }
  cand.sort((a, b) => b._rank - a._rank);
  let large = 0, kills = 0;
  for (const n of cand) {
    if (kills >= NUMBERS.KILL_SLOTS || large >= NUMBERS.LARGE_CAP) break;
    if (n.kill) { n._large = true; kills++; large++; }
  }
  for (const n of cand) {
    if (large >= NUMBERS.LARGE_CAP) break;
    if (!n._large) { n._large = true; large++; }
  }
  // Small first, large over them, crits last.
  for (const n of shown) if (!n._large) drawNumber(g, n, cam, 1, n._soft, hero, sink);
  for (const n of shown) if (n._large && n.kind !== 'crit') drawNumber(g, n, cam, 2, n._soft, hero, sink);
  for (const n of shown) if (n._large && n.kind === 'crit') drawNumber(g, n, cam, 2, n._soft, hero, sink);
}
