// HORDES — painters for the feel pools (src/fx/feel.js): death puffs, sparks,
// bursts and the damage numbers. World layer, integer pixels; every phase is
// age / ttl so 60Hz and 120Hz paint the same picture at the same age.
import { blitGrid, STYLE_ITEM } from '../sprite_cache.js';

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
const NUM_PAL = {
  hit: { 1: '#ffffff' }, crit: { 1: '#ffd23e' }, hurt: { 1: '#ff4a5e' },
};

export function formatDamage(v) {
  const n = Math.max(1, Math.round(v));
  if (n < 1000) return String(n);
  if (n < 10000) return (Math.floor(n / 100) / 10).toFixed(1) + 'k';
  if (n < 1e6) return Math.floor(n / 1000) + 'k';
  if (n < 1e7) return (Math.floor(n / 1e5) / 10).toFixed(1) + 'M';
  return Math.floor(n / 1e6) + 'M';
}

function drawNumber(g, n, cam) {
  const t = n.age / n.ttl;
  const crit = n.kind === 'crit';
  const text = (n.kind === 'hurt' ? '-' : '') + formatDamage(n.value) + (crit ? '!' : '');
  // Pop in large for the first beat, then settle; crits stay double size.
  const s = crit ? 2 : (n.merged > 2 && t < 0.25 ? 2 : 1);
  let w = -s;
  for (const ch of text) w += ((GLYPHS[ch] || GLYPHS[0])[0].length + 1) * s;
  const rise = Math.round((1 - (1 - t) * (1 - t)) * 16);
  let x = Math.round(n.x - cam.x - w / 2);
  const y = Math.round(n.y0 - cam.y - rise - 5 * s);
  if (t > 0.75) g.globalAlpha = Math.max(0.15, 1 - (t - 0.75) * 3.4);
  const pal = NUM_PAL[n.kind] || NUM_PAL.hit;
  for (const ch of text) {
    const glyph = GLYPHS[ch] || GLYPHS[0];
    blitGrid(g, glyph, pal, x, y, STYLE_ITEM, s);
    x += (glyph[0].length + 1) * s;
  }
  g.globalAlpha = 1;
}

// Death puff: a white pop, then body-coloured shards flying out and a smoke
// ring; elites and bosses add a second ring and more shards.
function drawPuff(g, p, cam) {
  const t = p.age / p.ttl;
  const x = Math.round(p.x - cam.x), y = Math.round(p.y - cam.y);
  const shards = [5, 7, 10, 16][p.cls];
  const reach = p.r + [7, 10, 16, 30][p.cls];
  if (t < 0.25) {
    const c = Math.round(p.r * (1 - t * 2));
    g.fillStyle = '#ffffff';
    g.fillRect(x - c, y - Math.round(c * 0.7), c * 2, Math.round(c * 1.4));
  }
  const ease = 1 - (1 - t) * (1 - t);
  for (let i = 0; i < shards; i++) {
    const a = p.rot + (i / shards) * 6.283 + (i % 2) * 0.4;
    const d = reach * ease * (0.55 + 0.45 * ((i * 7) % 5) / 4);
    const sz = t < 0.5 ? (p.cls >= 2 ? 3 : 2) : (t < 0.8 ? 2 : 1);
    g.fillStyle = i % 3 === 0 ? '#ffffff' : p.colour;
    g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.8 - ease * 3), sz, sz);
  }
  if (p.cls >= 2 && t < 0.8) {
    const rr = reach * 1.25 * ease;
    g.fillStyle = p.cls === 3 ? '#ffd0da' : '#ffe9a8';
    const n = p.cls === 3 ? 20 : 12;
    for (let i = 0; i < n; i++) {
      const a = p.rot * 0.5 + (i / n) * 6.283;
      g.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.7), 2, 2);
    }
  }
  // Smoke: three grey motes drifting up and thinning.
  if (t > 0.2) {
    g.fillStyle = t < 0.6 ? 'rgba(232,232,240,0.55)' : 'rgba(200,200,214,0.3)';
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
      g.fillStyle = ring === 0 ? '#ffd75e' : '#fff3b0';
      const n = 28;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + ring * 0.11;
        g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.7), 2, 2);
      }
    }
    g.fillStyle = t < 0.5 ? '#ffffff' : '#ffd75e';
    for (let k = 0; k < 3; k++) {
      const cy = y - 12 - Math.round(t * 22) - k * 5;
      g.fillRect(x - 1, cy, 2, 1); g.fillRect(x - 3, cy + 1, 2, 1); g.fillRect(x + 1, cy + 1, 2, 1);
      g.fillRect(x - 5, cy + 2, 2, 1); g.fillRect(x + 3, cy + 2, 2, 1);
    }
  } else {
    // Pickup glint: a four-point star that opens and fades.
    const r = Math.round(2 + t * 7);
    g.fillStyle = t < 0.5 ? '#ffffff' : '#ffe9a8';
    g.fillRect(x - r, y, r * 2 + 1, 1);
    g.fillRect(x, y - r, 1, r * 2 + 1);
    g.fillRect(x - 1, y - 1, 3, 3);
  }
}

// Under the actors: nothing yet. Over the actors: puffs, sparks, bursts.
export function drawFeelEffects(g, state, cam) {
  const f = state.feel;
  if (!f) return;
  for (const p of f.puffs) drawPuff(g, p, cam);
  for (const s of f.sparks) {
    const t = s.age / s.ttl;
    g.fillStyle = t < 0.35 ? '#ffffff' : s.colour;
    const sz = t < 0.6 ? 2 : 1;
    g.fillRect(Math.round(s.x - cam.x), Math.round(s.y - cam.y), sz, sz);
  }
  for (const b of f.bursts) drawBurst(g, b, cam);
}

// Last in the world layer, so numbers sit over everything they describe.
export function drawFeelNumbers(g, state, cam) {
  const f = state.feel;
  if (!f) return;
  for (const n of f.nums) if (n.kind !== 'crit') drawNumber(g, n, cam);
  for (const n of f.nums) if (n.kind === 'crit') drawNumber(g, n, cam);
}
