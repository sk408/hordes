// HORDES — src/sites_art.js
//
// M5b site art: original pixel grids for the five site kinds, painted through
// the sprite cache (one baked raster per grid + palette), plus the world draw
// (rings, charge meter, curse card, waypoint marker and edge arrow) and the
// map icons. Each site has three looks: unused (lit palette), active (lit +
// a pulse) and spent (the grey palette).

import { queueWorldCard } from './world_cards.js';
import { blitGrid, blitGlow, STYLE_ITEM } from './sprite_cache.js';
import { SITES } from './sites.js';
import { CONFIG as C } from './config.js';

// Grids are written as strings: '.' = empty, digits = palette index.
const G = (rows) => rows.map(r => [...r].map(ch => (ch === '.' ? 0 : +ch)));

// CHARGE SHRINE (13x15): a standing stone with a rune and a crystal cap.
const SHRINE = G([
  '.....444.....',
  '....45554....',
  '.....444.....',
  '.....111.....',
  '....12221....',
  '....12321....',
  '....12221....',
  '....12321....',
  '....12221....',
  '....12221....',
  '...1122211...',
  '..111111111..',
  '.11666666611.',
  '.16666666661.',
  '..111111111..',
]);
// BOSS ALTAR (15x11): a low dark slab with a red skull sigil and horns.
const ALTAR = G([
  '.4...........4.',
  '.44.........44.',
  '..41111111114..',
  '..12222222221..',
  '.1223355533221.',
  '.1223533353221.',
  '.1222355532221.',
  '.1222252522221.',
  '11111111111111.',
  '16666666666661.',
  '.111111111111..',
]);
// BRAZIER (9x10): an iron bowl on a stem with a flame.
const BRAZIER = G([
  '....5....',
  '...545...',
  '..54445..',
  '.1111111.',
  '.1222221.',
  '..12221..',
  '...121...',
  '...121...',
  '..11211..',
  '.1111111.',
]);
// URN (9x10): a clay pot with a band.
const URN = G([
  '..11111..',
  '...121...',
  '..12221..',
  '.1222221.',
  '.1444441.',
  '.1222221.',
  '.1222221.',
  '..12221..',
  '...111...',
  '.........',
]);
// FOUNTAIN (17x11): a round basin with a spout and water.
const FOUNTAIN = G([
  '........4........',
  '.......454.......',
  '........4........',
  '.......121.......',
  '..111111211111...',
  '.12555555555521..',
  '1225545555455221.',
  '1255555555555521.',
  '.12222222222221..',
  '..111111111111...',
  '.................',
]);
// CURSED STATUE (11x17): a hooded figure with green eyes on a plinth.
const STATUE = G([
  '.....1.....',
  '....121....',
  '...12221...',
  '..1233321..',
  '..1353531..',
  '..1233321..',
  '...12221...',
  '..1222221..',
  '.122222221.',
  '.122242221.',
  '.122222221.',
  '..1222221..',
  '..1222221..',
  '.111111111.',
  '.166666661.',
  '11111111111',
  '...........',
]);

export const SITE_GRIDS = { shrine: SHRINE, altar: ALTAR, brazier: BRAZIER, urn: URN, fountain: FOUNTAIN, statue: STATUE };

// Palettes: [0, outline, body, detail, accent, glow, base].
const P = (a) => ['', ...a];
const LIT = {
  // M5b fix: brighter stone and rune so the shrine reads next to the others.
  shrine: P(['#16243a', '#a6bcd8', '#4a6c9c', '#8ae6ff', '#f0fcff', '#5e7898']),
  altar: P(['#1a0d12', '#4a2a34', '#2a1418', '#c8a07a', '#ff3a4a', '#5a3a40']),
  brazier: P(['#1c1410', '#5a4a3e', '#3a2e26', '#ffb030', '#fff0a0', '#2a221c']),
  urn: P(['#2a160c', '#b06a3a', '#6a3a1e', '#e8c070', '#ffe0a0', '#3a2414']),
  fountain: P(['#1a2028', '#8a94a4', '#5a6474', '#bfe8ff', '#4aa8ff', '#3a4250']),
  statue: P(['#0c140e', '#4a564a', '#7cff6a', '#7cff6a', '#c8ffb8', '#2a322a']),
};
const SPENT = P(['#18181c', '#3e3e44', '#2a2a30', '#4a4a50', '#56565c', '#2e2e34']);

const artKind = (s) => (s.kind === 'brazier' && s.urn ? 'urn' : s.kind);

// Pixel ring on the ground (2:1 squash), drawn as dots so it stays crisp.
function groundRing(g, x, y, r, colour, frac = 1, step = 10) {
  g.fillStyle = colour;
  const n = Math.max(12, Math.round(r * 0.9));
  const lit = Math.floor(n * frac);
  for (let i = 0; i < n; i++) {
    if (i >= lit) continue;
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    g.fillRect(Math.round(x + Math.cos(a) * r) - 1, Math.round(y + Math.sin(a) * r * 0.5), 2, 1);
  }
  void step;
}

// Draw every site in view. `cull(x, y, pad)` is the renderer's screen test.
export function drawSites(g, state, cam, cull) {
  const sites = state.sites;
  if (!sites || !sites.length) return;
  const t = state.time || 0;
  const p = state.player;
  for (const s of sites) {
    const x = Math.round(s.x - cam.x), y = Math.round(s.y - cam.y);
    if (cull(x, y, 50)) continue;
    const kind = artKind(s);
    const grid = SITE_GRIDS[kind];
    if (!grid) continue;   // vault, lever, yard: world_art.js
    const spent = s.state === 'spent';
    const pal = spent ? SPENT : LIT[kind];
    const w = grid[0].length, h = grid.length;
    // Rings first (under the sprite).
    if (s.kind === 'shrine' && !spent) {
      groundRing(g, x, y, SITES.SHRINE_R, '#3e6a92');
      blitGlow(g, '#7ad0ff', 9, x, y - 13, 0.75);
      if (s.charge > 0) groundRing(g, x, y, SITES.SHRINE_R, '#7ad0ff', s.charge);
    } else if (s.kind === 'fountain' && !spent) {
      groundRing(g, x, y, SITES.FOUNTAIN_R, '#2a5a8a');
    } else if (s.kind === 'altar' && !spent) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      g.fillStyle = 'rgba(255,58,74,' + (0.10 + 0.15 * pulse).toFixed(2) + ')';
      g.fillRect(x - 10, y - 4, 20, 8);
    } else if (s.kind === 'statue' && s.state === 'active') {
      g.fillStyle = 'rgba(124,255,106,0.18)';
      g.fillRect(x - 9, y - 4, 18, 8);
    }
    blitGrid(g, grid, pal, x - (w >> 1), y - h + 2, STYLE_ITEM);
    if (spent) continue;
    // Live tells.
    if (s.kind === 'shrine') {
      if (Math.floor(t * 3) % 2 === 0) { g.fillStyle = '#ffffff'; g.fillRect(x, y - h + 3, 1, 1); }
      if (s.state === 'active') {
        // The charge meter: a bar above the stone.
        const bw = 22, bx = x - 11, by = y - h - 5;
        g.fillStyle = '#000000'; g.fillRect(bx - 1, by - 1, bw + 2, 4);
        g.fillStyle = '#1a2a3a'; g.fillRect(bx, by, bw, 2);
        g.fillStyle = s.handsOn ? '#ffd75e' : '#7ad0ff';
        g.fillRect(bx, by, Math.round(bw * s.charge), 2);
      }
    } else if (s.kind === 'brazier' && !s.urn) {
      if (Math.floor(t * 6 + s.id) % 2 === 0) { g.fillStyle = '#fff0a0'; g.fillRect(x, y - h + 2, 1, 1); }
    } else if (s.kind === 'fountain') {
      const k = Math.floor(t * 4) % 3;
      g.fillStyle = '#d8f4ff'; g.fillRect(x - 4 + k * 3, y - 5, 1, 1);
    } else if (s.kind === 'statue' && s.state === 'unused' && p && s.deal) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d <= SITES.STATUE_PROMPT_R) queueCurseCard(g, x, y - h - 2, s.deal, curseCardLine(state));
    }
  }
  // Small rising word pops: +5G, +HP, HANDS-ON, MAGNET.
  if (state.sitePops && state.sitePops.length) {
    g.font = 'bold 7px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const q of state.sitePops) {
      const x = Math.round(q.x - cam.x), y = Math.round(q.y - cam.y - q.age * 14);
      if (cull(x, y, 30)) continue;
      g.fillStyle = '#000000'; g.fillText(q.text, x + 1, y + 1);
      g.fillStyle = q.color; g.fillText(q.text, x, y);
    }
    g.textAlign = 'left'; g.textBaseline = 'top';
  }
}

// The card's last line: what a touch does now. The statue takes no deal once
// the wave's boss is down (main.js canCurse), and the maw closes it for good.
const CURSE_TOUCH = 'TOUCH TO ACCEPT';
export function curseCardLine(state) {
  const w = state.wave;
  if (!state.portal && !(w && w.pendingClear)) return CURSE_TOUCH;
  return w && w.num < C.ESCALATION.END_WAVE ? 'TOUCH IT NEXT WAVE' : 'TOO LATE: THE BOSS IS DOWN';
}

// The statue's deal, queued for the HUD pass (drawn on screen and clear of
// the HUD, world_cards.js) with the same box drawCurseCard would use.
function queueCurseCard(g, x, y, deal, l3 = CURSE_TOUCH) {
  const b = curseCardBox(g, x, y, deal, l3);
  queueWorldCard(b, (c, cx, cy) => drawCurseCardAt(c, cx, cy, b.w, b.h, deal, l3));
}

export function curseCardBox(g, x, y, deal, l3 = CURSE_TOUCH) {
  const l1 = 'CURSE: ' + deal.curse, l2 = 'REWARD: ' + deal.reward;
  g.font = 'bold 7px monospace';
  const tw = (s) => {
    const m = typeof g.measureText === 'function' ? g.measureText(s) : null;
    return (m && m.width > 0) ? m.width : s.length * 4.2;
  };
  const w = Math.ceil(Math.max(tw(l1), tw(l2), tw(l3))) + 8;
  const h = 29;
  return { x: Math.round(Math.max(4, Math.min(480 - w - 4, x - w / 2))), y: Math.round(Math.max(22, y - h)), w, h };
}

// The statue's deal, stated on approach: curse in red, reward in gold.
export function drawCurseCard(g, x, y, deal, l3 = CURSE_TOUCH) {
  const b = curseCardBox(g, x, y, deal, l3);
  drawCurseCardAt(g, b.x, b.y, b.w, b.h, deal, l3);
}

function drawCurseCardAt(g, bx, by, w, h, deal, l3 = CURSE_TOUCH) {
  const l1 = 'CURSE: ' + deal.curse, l2 = 'REWARD: ' + deal.reward;
  g.font = 'bold 7px monospace';
  g.fillStyle = 'rgba(8,10,14,0.92)'; g.fillRect(bx, by, w, h);
  g.fillStyle = '#7cff6a'; g.fillRect(bx, by, w, 1); g.fillRect(bx, by + h - 1, w, 1);
  g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillStyle = '#ff6a6a'; g.fillText(l1, bx + 4, by + 2);
  g.fillStyle = '#ffd75e'; g.fillText(l2, bx + 4, by + 11);
  g.fillStyle = '#9aa4b0'; g.fillText(l3, bx + 4, by + 20);
}

// Waypoint: a gold flag over the target in the world, or an edge arrow.
export function drawWaypoint(g, state, cam, view) {
  const wp = state.waypoint;
  if (!wp) return null;
  const x = Math.round(wp.x - cam.x), y = Math.round(wp.y - cam.y);
  const t = state.time || 0;
  const bob = Math.floor(t * 4) % 2;
  const v = view || { x0: 0, x1: 480, y0: 0, y1: 300 };
  if (x > v.x0 + 8 && x < v.x1 - 8 && y > v.y0 + 34 && y < v.y1 - 4) {
    g.fillStyle = '#000000'; g.fillRect(x - 1, y - 32 + bob, 3, 14); g.fillRect(x, y - 32 + bob, 8, 6);
    g.fillStyle = '#ffd75e'; g.fillRect(x, y - 31 + bob, 1, 12);
    g.fillRect(x + 1, y - 31 + bob, 6, 4);
    return { x, y, onScreen: true };
  }
  // Off-screen: an arrow on the view edge, pointing at the target (kept
  // below the HUD band at the top).
  const top = v.y0 + 30, bot = v.y1 - 12, lft = v.x0 + 12, rgt = v.x1 - 12;
  const cx = (lft + rgt) / 2, cy = (top + bot) / 2;
  const dx = x - cx, dy = y - cy;
  const k = Math.min((rgt - lft) / 2 / Math.abs(dx || 1e-6), (bot - top) / 2 / Math.abs(dy || 1e-6));
  const ax = Math.round(cx + dx * k), ay = Math.round(cy + dy * k);
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  // A filled triangle: tip 8 px ahead, base 5 px behind, 4 px half-width.
  const T = [[ax + ux * 8, ay + uy * 8], [ax - ux * 5 + nx * 4, ay - uy * 5 + ny * 4], [ax - ux * 5 - nx * 4, ay - uy * 5 - ny * 4]];
  const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const inTri = (px, py, grow) => {
    const P = [px, py];
    const c = [ax, ay];
    const G = T.map(t => [c[0] + (t[0] - c[0]) * grow, c[1] + (t[1] - c[1]) * grow]);
    const s1 = side(G[0], G[1], P), s2 = side(G[1], G[2], P), s3 = side(G[2], G[0], P);
    return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  };
  const blink = Math.floor(t * 3) % 2 === 0;
  for (let yy = -9; yy <= 9; yy++) {
    for (let xx = -9; xx <= 9; xx++) {
      const px = ax + xx + 0.5, py = ay + yy + 0.5;
      if (inTri(px, py, 1)) { g.fillStyle = blink ? '#ffd75e' : '#ffb030'; g.fillRect(ax + xx, ay + yy, 1, 1); }
      else if (inTri(px, py, 1.35)) { g.fillStyle = '#000000'; g.fillRect(ax + xx, ay + yy, 1, 1); }
    }
  }
  return { x: ax, y: ay, onScreen: false };
}

// Map icon colours per kind (and the "?" for sites seen but not visited).
export const MAP_ICON = {
  shrine: '#7ad0ff', altar: '#ff3a4a', brazier: '#ffb030', fountain: '#4aa8ff', statue: '#7cff6a',
  vault: '#ffd75e', lever: '#ff8a3a', yard: '#d8c8a0',
};

// A 5x5 map icon. Spent sites paint grey; `seen` = discovered on the radar
// but not yet reached (a "?").
export function drawMapIcon(g, kind, mx, my, state, small = false) {
  if (state === 'unknown') {
    g.fillStyle = '#000000'; g.fillRect(mx - 3, my - 4, 7, 9);
    g.fillStyle = '#e8e8f0';
    g.fillRect(mx - 2, my - 3, 4, 1); g.fillRect(mx + 1, my - 2, 1, 2);
    g.fillRect(mx, my, 1, 1); g.fillRect(mx, my + 2, 1, 1);
    return;
  }
  const col = state === 'spent' ? '#4a4a50' : (MAP_ICON[kind] || '#ffd75e');
  if (small) { g.fillStyle = col; g.fillRect(mx - 1, my - 1, 2, 2); return; }
  g.fillStyle = '#000000'; g.fillRect(mx - 3, my - 3, 7, 7);
  g.fillStyle = col;
  if (kind === 'shrine') { g.fillRect(mx - 1, my - 2, 3, 5); g.fillRect(mx - 2, my + 2, 5, 1); }
  else if (kind === 'altar') { g.fillRect(mx - 2, my - 1, 5, 3); g.fillRect(mx - 2, my - 2, 1, 1); g.fillRect(mx + 2, my - 2, 1, 1); }
  else if (kind === 'fountain') { g.fillRect(mx - 2, my, 5, 2); g.fillRect(mx, my - 2, 1, 2); }
  else if (kind === 'vault') { g.fillRect(mx - 2, my - 2, 5, 5); g.fillStyle = '#000'; g.fillRect(mx, my - 1, 1, 2); }
  else if (kind === 'lever') { g.fillRect(mx - 2, my + 1, 5, 2); g.fillRect(mx - 1, my - 2, 1, 3); g.fillRect(mx - 2, my - 3, 2, 1); }
  else if (kind === 'yard') { g.fillRect(mx - 3, my - 3, 7, 1); g.fillRect(mx - 3, my + 3, 7, 1); g.fillRect(mx - 3, my - 3, 1, 7); g.fillRect(mx + 3, my - 3, 1, 7); }
  else if (kind === 'statue') { g.fillRect(mx - 1, my - 2, 3, 5); g.fillRect(mx - 2, my + 2, 5, 1); g.fillStyle = '#000'; g.fillRect(mx, my - 1, 1, 1); }
  else g.fillRect(mx - 2, my - 2, 5, 5);
  if (state === 'active') { g.fillStyle = '#ffffff'; g.fillRect(mx + 2, my - 3, 1, 1); }
}
